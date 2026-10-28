#!/usr/bin/env bash
# Hermetic tests for P1584: health.sh guest-attribute source, day-health.sh verdicts, upkeep.sh
# parsing, email_template_drift.py. Fake gcloud/gh/curl/openssl on PATH; nothing reaches the network.
# Each case pairs a known-good input with known-bad ones, so a check that always passes fails here.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SH="$ROOT/scripts/selfhosted"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"; PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL: $1"; echo "$2" | sed 's/^/    /'; }
# expect <name> <want-exit> <want-grep> -- cmd...
expect() {
  local name="$1" want="$2" pat="$3"; shift 4
  local out rc; out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && grep -qE "$pat" <<< "$out"; then ok "$name"; else bad "$name (exit $rc, want $want, /$pat/)" "$out"; fi
}

# --- fakes: behaviour comes from files in $T --------------------------------------------------------
cat > "$T/bin/curl" <<EOF
#!/usr/bin/env bash
# -o FILE writes the body; -w prints the code. Bodies come from \$T/curl-<pattern>.
out=""; url=""; while [ \$# -gt 0 ]; do case "\$1" in -o) out="\$2"; shift 2 ;; -w|-m|-H|-X|--data) shift 2 ;; -*) shift ;; *) url="\$1"; shift ;; esac; done
case "\$url" in
  */auth/v1/health) printf 401; exit 0 ;;
  *versions.md) f="$T/curl-upstream" ;;
  */database/query) f="$T/curl-hosted" ;;
  *) exit 22 ;;
esac
[ -f "\$f" ] || exit 22
code="\$(head -1 "\$f")"; body="\$(tail -n +2 "\$f")"
if [ -n "\$out" ]; then printf '%s' "\$body" > "\$out"; else printf '%s' "\$body"; fi
case "\$url" in */database/query) printf '%s' "\$code" ;; esac
exit 0
EOF
cat > "$T/bin/openssl" <<'EOF'
#!/usr/bin/env bash
case "$1" in x509) echo "notAfter=Jan 25 12:00:00 2099 GMT" ;; esac
exit 0
EOF
cat > "$T/bin/gcloud" <<EOF
#!/usr/bin/env bash
case "\$*" in
  "auth print-access-token") echo tok ;;
  *get-guest-attributes*) [ -f "$T/ga" ] || exit 1
    # The real shape (--format=json): a list of {namespace,key,value}. Values with commas stay intact.
    python3 -I -c 'import json,sys; print(json.dumps([{"namespace":"cp-health","key":k,"value":v} for k,v in (l.rstrip("\n").split(",",1) for l in open(sys.argv[1]) if "," in l)]))' "$T/ga" ;;
  *"compute ssh"*) [ -f "$T/ssh" ] || exit 255; cat "$T/ssh" ;;
  *) exit 1 ;;
esac
EOF
cat > "$T/bin/gh" <<EOF
#!/usr/bin/env bash
case "\$1 \$2" in
  "run list") [ -f "$T/runs" ] || exit 1; cat "$T/runs" ;;
  "issue list") cat "$T/issues" 2>/dev/null || echo '[]' ;;
  "workflow view") case "\${GH_VIEW:-yes}" in yes) exit 0 ;; no) echo "HTTP 404: workflow x not found on the default branch" >&2; exit 1 ;; *) echo "error connecting" >&2; exit 1 ;; esac ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH"
now=$(date +%s)

# --- health.sh --source guest-attributes ------------------------------------------------------------
ga() { printf 'disk,%s\nwal,%s\ndown,%s\nts,%s\n' "$1" "$2" "$3" "$4" > "$T/ga"; }
GA=(-- "$SH/health.sh" --source guest-attributes)
ga 18 64 none "$now"
expect "health: fresh VM report is ok" 0 '^services: ok: every stack container' "${GA[@]}"
expect "health: front door answer is labelled as such" 0 '^reachable: ok: front door HTTP 401' "${GA[@]}"
ga 91 64 none "$now"
expect "health: full disk warns" 1 '^disk: warn: 91% used' "${GA[@]}"
ga 18 64 auth,storage "$now"
expect "health: a down service warns, by name" 1 '^services: warn: not running or unhealthy: auth, storage' "${GA[@]}"
ga 18 64 none "$((now - 7200))"
expect "health: stale VM report is unknown, never ok" 2 '^disk: unknown: the VM last reported 120 min ago' "${GA[@]}"
ga 18 64 none "$((now + 86400 * 365))"
expect "health: a report dated in the future is unknown, never ok" 2 '^services: unknown: the VM report is dated in the future' "${GA[@]}"
printf 'disk,18\nwal,64\ndown,none\n' > "$T/ga"
expect "health: report without ts is unknown" 2 'no timestamp' "${GA[@]}"
printf 'disk,18\nwal,64\nts,%s\n' "$now" > "$T/ga"
expect "health: report without a service reading is unknown" 2 '^services: unknown: no service reading' "${GA[@]}"
ga 18 64 'x;rm' "$now"
expect "health: a malformed service list is unknown, never echoed" 2 '^services: unknown' "${GA[@]}"
rm -f "$T/ga"
expect "health: unreadable guest attributes are unknown" 2 '^wal: unknown: could not read guest attributes' "${GA[@]}"
expect "health: --source none skips disk and WAL" 0 '^cert: ok: ' -- "$SH/health.sh" --source none
expect "health: --source without a value refused, no hang" 2 'needs a value' -- "$SH/health.sh" --source
expect "health: bad --source refused" 2 'unknown --source' -- "$SH/health.sh" --source bogus
SELFHOSTED_HOST='a b' expect "health: non-hostname override refused" 2 'refusing SELFHOSTED_HOST' -- "$SH/health.sh" --source none

# --- day-health.sh ----------------------------------------------------------------------------------
iso() { python3 -I -c 'import sys,datetime as d; print(d.datetime.fromtimestamp(int(sys.argv[1]),d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$1"; }
run() { printf '[{"conclusion":"%s","createdAt":"%s","status":"completed","url":"https://x/runs/1"}]' "$1" "$(iso "$2")" > "$T/runs"; }
BOT='[{"number":7,"title":"Self-hosted TEST server health failing","author":{"login":"app/github-actions"}}]'
OTHER='[{"number":8,"title":"Self-hosted TEST server health failing","author":{"login":"someone"}}]'
export SELFHOSTED_WORKFLOW_ON_MAIN=yes
run success "$((now - 600))"; rm -f "$T/issues"
expect "day: fresh green run, no issue is ok" 0 '^workflow: ok: .*10 min ago' -- "$SH/day-health.sh"
echo "$BOT" > "$T/issues"
expect "day: bot's open alert issue warns" 1 'alert issue #7 is open' -- "$SH/day-health.sh"
echo "$OTHER" > "$T/issues"
expect "day: same title by another author is ignored" 0 '^workflow: ok' -- "$SH/day-health.sh"
rm -f "$T/issues"; run failure "$((now - 600))"
expect "day: a failed run warns (alerter broken)" 1 'last run itself failed' -- "$SH/day-health.sh"
run success "$((now - 5 * 3600))"
expect "day: a run older than 3 h is unknown" 2 'was 5 h ago' -- "$SH/day-health.sh"
echo '[]' > "$T/runs"
expect "day: on main with no scheduled run is unknown, no silent local probe" 2 '^workflow: unknown: .*no completed scheduled run' -- "$SH/day-health.sh"
rm -f "$T/runs"
expect "day: on main with gh failing is unknown, no silent local probe" 2 '^workflow: unknown: could not list' -- "$SH/day-health.sh"
printf 'DISK:18\nWAL:64\n' > "$T/ssh"
unset SELFHOSTED_WORKFLOW_ON_MAIN
GH_VIEW=no expect "day: GitHub says not on main: the local probe answers" 0 '^source: ok: local probe, because the workflow is not on main yet' -- "$SH/day-health.sh"
GH_VIEW=error expect "day: GitHub unreachable: unknown, never a quiet local probe" 2 '^workflow: unknown: could not ask GitHub' -- "$SH/day-health.sh"

# --- the workflow's alert block, extracted verbatim from the YAML (P1567 pattern) -------------------
WF="$ROOT/.github/workflows/selfhosted-health.yml"
BLOCK="$T/alert-block.sh"
sed -n '/# BEGIN alert-block/,/# END alert-block/p' "$WF" | sed 's/^ *//' > "$BLOCK"
[ "$(grep -c 'BEGIN alert-block' "$BLOCK")" = 1 ] || { bad "alert block markers" "not found once in $WF"; }
cat > "$T/bin/gh" <<EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$T/gh.log"
case "\$1 \$2" in
  "run list") [ -f "$T/runs" ] || exit 1; cat "$T/runs" ;;
  "issue list") [ "\${GH_LIST_FAIL:-0}" = 1 ] && exit 1; cat "$T/issues" 2>/dev/null || echo '[]' ;;
  "workflow view") case "\${GH_VIEW:-yes}" in yes) exit 0 ;; no) echo "HTTP 404: workflow x not found on the default branch" >&2; exit 1 ;; *) echo "error connecting" >&2; exit 1 ;; esac ;;
esac
exit 0
EOF
chmod +x "$T/bin/gh"
# alert <block> <HEALTH_CODE or UNSET> <issues json or none> [drill host] -> $T/gh.log
alert() {
  : > "$T/gh.log"; rm -f "$T/issues"; [ "$3" = none ] || echo "$3" > "$T/issues"
  echo "reachable: warn: no answer" > "$T/health-output.txt"
  ( cd "$T" && env ${2:+$( [ "$2" = UNSET ] || echo HEALTH_CODE="$2")} DRILL_HOST="${4:-}" \
      GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=o/r GITHUB_RUN_ID=42 \
      bash -c 'set -euo pipefail; . "$1"' _ "$1" ) > "$T/alert.out" 2>&1
}
want() { # want <name> <grep -E on the gh log> [absent-pattern]
  if grep -qE "$2" "$T/gh.log" && { [ -z "${3:-}" ] || ! grep -qE "$3" "$T/gh.log"; }; then ok "$1"; else bad "$1" "$(cat "$T/gh.log" "$T/alert.out")"; fi
}
alert "$BLOCK" 1 none;            want "alert: problem, no issue: creates" '^gh issue create --title Self-hosted TEST server health failing --body-file'
alert "$BLOCK" 2 "$BOT";          want "alert: unknown, issue open: comments on #7" '^gh issue comment 7 ' 'issue create'
alert "$BLOCK" 0 "$BOT";          want "alert: healthy, issue open: closes #7" '^gh issue close 7 '
alert "$BLOCK" UNSET none;        want "alert: setup failed (no code): creates, says did not run" '^gh issue create' ; grep -q 'did not run' "$T/issue-body.md" && ok "alert: body says did not run" || bad "alert: body says did not run" "$(cat "$T/issue-body.md")"
alert "$BLOCK" 1 "$OTHER";        want "alert: a same-title issue by another author is not reused" '^gh issue create' 'issue comment 8'
GH_LIST_FAIL=1 alert "$BLOCK" 1 none; want "alert: a failed lookup still creates" '^gh issue create'
alert "$BLOCK" 1 none nope.invalid; want "alert: drill opens its own (drill) issue" 'issue create --title Self-hosted TEST server health failing \(drill\)'
alert "$BLOCK" 0 "$BOT" nope.invalid; want "alert: a healthy drill never closes the real issue" '^gh issue list' 'issue close'
# Control: the same block with the create call removed must fail the create case.
sed 's/gh issue create --title "\$TITLE" --body-file issue-body.md/true/' "$BLOCK" > "$T/mutant.sh"
alert "$T/mutant.sh" 1 none
if grep -q '^gh issue create' "$T/gh.log"; then bad "alert control: mutant without create is caught" "$(cat "$T/gh.log")"; else ok "alert control: mutant without create is caught"; fi

# --- upkeep.sh --no-prod ----------------------------------------------------------------------------
printf 'VITE_SUPABASE_URL=https://hostedref.supabase.co\nSUPABASE_TEST_WRITE_TOKEN=sbp_fake\n' > "$T/env"
export UPKEEP_ENV_FILE="$T/env"
printf '200\n## 2026-08-03\n- a:1.0\n' > "$T/curl-upstream"
printf '201\n[{"ok":1}]' > "$T/curl-hosted"
good_ssh() {
  cat <<'EOF'
PIN:auth supabase/gotrue:v2.189.0
PIN:db supabase/postgres:17.6.1.136
PIN:caddy caddy:2
RUN:auth supabase/gotrue:v2.189.0
RUN:db supabase/postgres:17.6.1.136
RUN:caddy caddy:2
RELEASE:2026-08-03
APT:1;0
UU:enabled
APTAGE:0
TPLURL:https://136-85-1-126.sslip.io/_cp-email-templates/magic_link.html https://136-85-1-126.sslip.io/_cp-email-templates/confirmation.html
REBOOT:no
END:ok
EOF
}
good_ssh > "$T/ssh"
expect "upkeep: all good except the skipped template check" 2 '^images: ok: 3 services on the pinned images \(release 2026-08-03\); floating tag: caddy:2' -- "$SH/upkeep.sh" --no-prod
expect "upkeep: hosted answering is ok" 2 '^hosted: ok' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's#^RUN:auth .*#RUN:auth supabase/gotrue:v2.180.0#' > "$T/ssh"
expect "upkeep: a hand-changed image warns" 1 'running a different image than pinned: auth=supabase/gotrue:v2.180.0' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's#^RUN:auth .*#RUN:auth supabase/postgres:17.6.1.136#' > "$T/ssh"
expect "upkeep: a service on ANOTHER service's pinned image warns" 1 'auth=supabase/postgres:17.6.1.136' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed '/^RUN:/d' > "$T/ssh"
expect "upkeep: a fully stopped stack warns (empty run list, NR==FNR trap)" 1 'not running: auth db caddy|not running: ' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed '/^PIN:/d' > "$T/ssh"
expect "upkeep: no pinned services listed is unknown" 2 'listed no pinned services' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed '/^RUN:caddy/d' > "$T/ssh"
expect "upkeep: a stopped service warns" 1 'not running: caddy' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's/^APT:1;0/APT:5;3/' > "$T/ssh"
expect "upkeep: pending security updates warn" 1 '^os: warn: 3 security updates pending of 5' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's/^UU:enabled/UU:disabled/' > "$T/ssh"
expect "upkeep: disabled unattended-upgrades warns" 1 'unattended-upgrades is disabled' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's/^REBOOT:no/REBOOT:yes linux-image-6.8 /' > "$T/ssh"
expect "upkeep: pending reboot warns with its packages" 1 'reboot pending for: linux-image-6.8' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's/^APTAGE:0/APTAGE:9/' > "$T/ssh"
expect "upkeep: stale package lists warn (0 pending would be meaningless)" 1 'package lists are 9 days old' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed 's/^APT:1;0/APT:5;3 foo/' > "$T/ssh"
expect "upkeep: a garbled apt count is unknown, never ok" 2 '^os: unknown: apt-check gave no count' -- "$SH/upkeep.sh" --no-prod
good_ssh | sed '/^END:ok/d' > "$T/ssh"
expect "upkeep: a session cut short is unknown, never ok" 2 '^images: unknown: ssh' -- "$SH/upkeep.sh" --no-prod
good_ssh > "$T/ssh"
printf '200\n## 2026-10-16\n- b:2.0\n- c:3.0\n## 2026-09-01\n- d:1.1\n## 2026-08-03\n- a:1.0\n' > "$T/curl-upstream"
expect "upkeep: upstream ahead of the pin warns with the change count" 1 'pinned 2026-08-03, upstream 2026-10-16: 3 image changes' -- "$SH/upkeep.sh" --no-prod
printf '200\n## 2026-08-03\n- a:1.0\n' > "$T/curl-upstream"
printf '400\n{"message":"project is paused"}' > "$T/curl-hosted"
expect "upkeep: paused hosted TEST warns" 1 'hosted TEST is paused' -- "$SH/upkeep.sh" --no-prod
printf '201\n[{"ok":1}]' > "$T/curl-hosted"
printf 'VITE_SUPABASE_URL="https://hostedref.supabase.co"\nSUPABASE_TEST_WRITE_TOKEN="sbp_fake"\n' > "$T/env"
expect "upkeep: quoted .env.local values still work" 2 '^hosted: ok' -- "$SH/upkeep.sh" --no-prod
printf 'VITE_SUPABASE_URL=https://besjtuodziykmjidubzw.supabase.co\nSUPABASE_TEST_WRITE_TOKEN=sbp_fake\n' > "$T/env"
expect "upkeep: a prod ref in .env.local is refused" 2 'names the prod project; refusing' -- "$SH/upkeep.sh" --no-prod

# --- email_template_drift.py ------------------------------------------------------------------------
P="https://claritypledge.com/auth/verify"
mkdir -p "$T/vm"
python3 -I - "$T" "$P" <<'EOF'
import json, sys
sys.path.insert(0, "")
t, p = sys.argv[1], sys.argv[2]
prod = {"mailer_templates_magic_link_content": f'<a href="{p}?x">ML</a>',
        "mailer_templates_confirmation_content": f'<a href="{p}?y">CF</a>'}
json.dump(prod, open(f"{t}/prod.json", "w"))
EOF
PY="$SH/lib/email_template_drift.py"
LOCAL='{{ if ge (len .RedirectTo) 21 }}{{ if eq (slice .RedirectTo 0 17) "http://localhost:" }}{{ slice .RedirectTo 0 21 }}{{ else }}http://localhost:5001{{ end }}{{ else }}http://localhost:5001{{ end }}/auth/verify'
printf '<a href="%s?x">ML</a>' "$LOCAL" > "$T/vm/magic_link.html"; printf '<a href="%s?y">CF</a>' "$LOCAL" > "$T/vm/confirmation.html"
expect "templates: rewritten prod equals the VM copy" 0 '^templates: ok: 2 templates match prod' -- python3 -I "$PY" "$T/prod.json" "$T/vm"
printf '<a href="%s?y">CHANGED</a>' "$LOCAL" > "$T/vm/confirmation.html"
expect "templates: any other difference is drift" 1 'differs from prod: confirmation.html' -- python3 -I "$PY" "$T/prod.json" "$T/vm"
rm "$T/vm/confirmation.html"
expect "templates: a missing VM copy is unknown" 2 'could not read confirmation.html' -- python3 -I "$PY" "$T/prod.json" "$T/vm"
echo 'not json' > "$T/prod.json"
expect "templates: unreadable prod config is unknown" 2 'prod config unreadable' -- python3 -I "$PY" "$T/prod.json" "$T/vm"

echo "---"; echo "p1584: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
