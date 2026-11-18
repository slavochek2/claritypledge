#!/usr/bin/env bash
# P1705: hermetic canary for scripts/selfhosted/auth-redirects.sh --check, and for how health.sh reads
# its verdict. A stub curl plays GoTrue: it answers each verify probe with the redirect GoTrue would
# give under one allow list. No network, no VM.
#
# Also --classify (an allow list on stdin) and --audit (a stub gcloud plays the VM).
# Scenarios (STUB_MODE):
#   safe      the four-digit pattern: a 4-digit localhost port is allowed, anything else falls back
#   wildcard  the first form, `http://localhost:*` and `http://localhost:*/**` (live on TEST until
#             2026-11-18): any localhost "port" without a dot or slash is allowed, which includes the
#             userinfo bypass
#   star      safe, plus a hand-added plain `http://localhost:*`: GoTrue's `*` stops at `.` and `/`,
#             so only a URL with no path after the "port" gets through
#   stardeep  safe, plus `http://localhost:*/**`: only a URL with a path gets through
#   digitstar safe, plus `http://localhost:[0-9]*`: a userinfo starting with a digit gets through
#   open      every redirect allowed, the external control too: the probe cannot judge
#   silent    no answer at all
#   gap       safe, but one allocator port (7100, w21: the original symptom) refused
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AR="$ROOT/scripts/selfhosted/auth-redirects.sh"
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  OK    $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat > "$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
# Only the verify probe is emulated; health.sh's other curls get "no answer".
rt=""; prev=""
for a in "$@"; do
  case "$prev" in --data-urlencode) case "$a" in redirect_to=*) rt="${a#redirect_to=}" ;; esac ;; esac
  prev="$a"
done
[ -n "$rt" ] || { printf '000'; exit 0; }
site="https://stub-host.test/"
case "$STUB_MODE" in
  silent) exit 0 ;;
  open) printf '%s' "$rt"; exit 0 ;;
esac
# Each entry form, as GoTrue's glob reads it (`*` never crosses `.` or `/`, `**` crosses anything).
star_plain() { printf '%s' "$rt" | grep -Eq '^http://localhost:[^./]*$'; }
star_deep()  { printf '%s' "$rt" | grep -Eq '^http://localhost:[^./]*/.*$'; }
digit_star() { printf '%s' "$rt" | grep -Eq '^http://localhost:[0-9][^./]*$'; }
four_digit() { printf '%s' "$rt" | grep -Eq '^http://localhost:[0-9]{4}(/.*)?$'; }
allowed=0
case "$STUB_MODE" in
  wildcard)  { star_plain || star_deep; } && allowed=1 ;;
  star)      { four_digit || star_plain; } && allowed=1 ;;
  stardeep)  { four_digit || star_deep; } && allowed=1 ;;
  digitstar) { four_digit || digit_star; } && allowed=1 ;;
  *)         four_digit && allowed=1
             if [ "$STUB_MODE" = gap ] && printf '%s' "$rt" | grep -Eq '^http://localhost:7100(/|$)'; then allowed=0; fi ;;
esac
if [ "$allowed" = 1 ]; then printf '%s' "$rt"; else printf '%s' "$site"; fi
STUB
chmod +x "$TMP/bin/curl"

run() { # run <mode> [script] -> OUT, RC
  OUT="$(env PATH="$TMP/bin:$PATH" STUB_MODE="$1" SELFHOSTED_HOST=stub-host.test bash "${2:-$AR}" --check --quiet 2>&1)"; RC=$?
  LAST="$(printf '%s\n' "$OUT" | tail -n 1)"
}
# health.sh's own case statement, read from the file so this tests the real parser.
health_verdict() { # line -> the status health.sh would report
  local parser
  parser="$(sed -n '/^case "\$ar_line" in$/,/^esac$/p' "$ROOT/scripts/selfhosted/health.sh")"
  [ -n "$parser" ] || { echo "parser-not-found"; return; }
  ( report() { echo "$2"; }; ar_line="$1"; eval "$parser" )
}

echo "1. the four-digit pattern passes"
run safe
{ [ "$RC" -eq 0 ] && [[ "$LAST" == "auth-redirects: ok: "* ]]; } && ok "exit 0, ok line" || bad "safe (rc=$RC last=$LAST)"
[ "$(health_verdict "$LAST")" = ok ] && ok "health.sh reads it as ok" || bad "health ok ($(health_verdict "$LAST"))"

echo "2. the localhost:* wildcard is caught (the userinfo bypass)"
run wildcard
{ [ "$RC" -eq 1 ] && [[ "$LAST" == "auth-redirects: warn: UNSAFE: "* ]]; } && ok "exit 1, UNSAFE line" || bad "wildcard (rc=$RC last=$LAST)"
[[ "$LAST" == *"localhost:a@0x7f000002"* ]] && ok "names the bypass" || bad "bypass not named ($LAST)"
[ "$(health_verdict "$LAST")" = warn ] && ok "health.sh reads it as warn" || bad "health warn ($(health_verdict "$LAST"))"

echo "2b. each single wildcard form a hand edit could add back is caught on its own"
for m in star stardeep digitstar; do
  run "$m"
  { [ "$RC" -eq 1 ] && [[ "$LAST" == "auth-redirects: warn: UNSAFE: "* ]]; } && ok "$m: exit 1, UNSAFE" || bad "$m (rc=$RC last=$LAST)"
done

echo "2c. the controls carry the weight: the real script with the old two-control set misses them"
# Gate 7d: the control is the real file, mutated, not a fixture. Before P1705's review the check
# probed only a path-bearing bypass and a five-digit port; a plain `localhost:*` passed it.
# The copy keeps the real layout, so it finds the real allocator two levels up.
mkdir -p "$TMP/old/scripts/selfhosted"; ln -s "$ROOT/scripts/lib" "$TMP/old/scripts/lib"
OLD="$TMP/old/scripts/selfhosted/auth-redirects.sh"
sed 's|^MUST_REFUSE=.*|MUST_REFUSE="http://localhost:a@0x7f000002/x http://localhost:12345/x"|' "$AR" > "$OLD"
grep -q '^MUST_REFUSE="http://localhost:a@0x7f000002/x http://localhost:12345/x"$' "$OLD" && ok "mutation applied" || bad "mutation not applied"
for m in star digitstar; do
  run "$m" "$OLD"
  [ "$RC" -eq 0 ] && ok "$m: the old set says ok, so the new controls are what catch it" || bad "$m with the old set (rc=$RC last=$LAST)"
done

echo "3. a probe that cannot judge is unknown, never ok"
run open
{ [ "$RC" -eq 2 ] && [[ "$LAST" == "auth-redirects: unknown: control probe was not refused"* ]]; } && ok "everything allowed: exit 2" || bad "open (rc=$RC last=$LAST)"
[ "$(health_verdict "$LAST")" = unknown ] && ok "health.sh reads it as unknown" || bad "health unknown ($(health_verdict "$LAST"))"
run silent
{ [ "$RC" -eq 2 ] && [[ "$LAST" == "auth-redirects: unknown: "* ]]; } && ok "no answer: exit 2" || bad "silent (rc=$RC last=$LAST)"

echo "4. an allocator port the server refuses is a warn naming it"
run gap
{ [ "$RC" -eq 1 ] && [[ "$LAST" == "auth-redirects: warn: 1 of "*" refused: 7100"* ]]; } && ok "exit 1, names 7100" || bad "gap (rc=$RC last=$LAST)"

echo "4b. a slow auth server cannot hold the check past its deadline"
OUT="$(env PATH="$TMP/bin:$PATH" STUB_MODE=safe SELFHOSTED_HOST=stub-host.test AUTH_REDIRECTS_DEADLINE=0 bash "$AR" --check --quiet 2>&1)"; RC=$?
LAST="$(printf '%s\n' "$OUT" | tail -n 1)"
{ [ "$RC" -eq 2 ] && [[ "$LAST" == "auth-redirects: unknown: stopped after 0 ports, past the 0 s deadline"* ]]; } && ok "past the deadline: exit 2, unknown" || bad "deadline (rc=$RC last=$LAST)"
OUT="$(env PATH="$TMP/bin:$PATH" STUB_MODE=safe SELFHOSTED_HOST=stub-host.test AUTH_REDIRECTS_DEADLINE=x bash "$AR" --check --quiet 2>&1)"; RC=$?
[ "$RC" -eq 2 ] && ok "a non-number deadline is refused" || bad "bad deadline (rc=$RC)"

echo "4c. --classify judges the entries themselves, which no probe sample can"
classify() { OUT="$(printf '%s' "$1" | bash "$AR" --classify 2>&1)"; RC=$?; }
SAFE_LIST='http://localhost:[0-9][0-9][0-9][0-9],http://localhost:[0-9][0-9][0-9][0-9]/**,https://stub-host.test/**,http://localhost:6200/**,http://localhost:5001'
classify "$SAFE_LIST"
{ [ "$RC" -eq 0 ] && [[ "$OUT" == "auth-config: ok: 5 entries, each fixes its host" ]]; } && ok "the safe list: exit 0" || bad "safe list (rc=$RC out=$OUT)"
# Each one escapes every behaviour control above, or did before them (Codex and Opus reviews).
for e in 'http://localhost:[0-9][0-9]*' 'http://localhost:????' 'http://localhost:58??/**' 'http://localhost:*' \
         'http://localhost:*/**' 'http://localhost:[0-9]*' 'http://*:*' 'http://localhost*' \
         'http://localhost:6200@0x7f000002/**' 'http*://localhost:6200' 'localhost:6200' \
         'http://[a-z]vil.test/**' 'javascript://localhost/**' 'data://localhost/**'; do
  classify "$SAFE_LIST,$e"
  { [ "$RC" -eq 1 ] && [[ "$OUT" == "auth-config: warn: UNSAFE: 1 of 6 entries let the host vary: $e "* ]]; } && ok "refuses $e" || bad "$e (rc=$RC out=$OUT)"
done
classify ""
{ [ "$RC" -eq 2 ] && [[ "$OUT" == "auth-config: unknown: "* ]]; } && ok "an empty list is unknown" || bad "empty (rc=$RC out=$OUT)"
# A line break ended the read and hid every entry after it (Codex round 6).
classify "$SAFE_LIST"$'\n'",http://*/**"
{ [ "$RC" -eq 1 ] && [[ "$OUT" == *"http://*/**"* ]]; } && ok "an entry after a line break is still judged" || bad "line break, comma (rc=$RC out=$OUT)"
classify "$SAFE_LIST"$'\n'"http://*/**"
{ [ "$RC" -eq 1 ] && [[ "$OUT" == "auth-config: warn: UNSAFE: 1 of 5 "* ]]; } && ok "an entry holding a line break is refused" || bad "line break inside (rc=$RC out=$OUT)"
classify "$SAFE_LIST"$'\n'
{ [ "$RC" -eq 0 ] && [[ "$OUT" == "auth-config: ok: 5 entries"* ]]; } && ok "a trailing line break alone is no finding" || bad "trailing newline (rc=$RC out=$OUT)"
classify ",,,"
{ [ "$RC" -eq 2 ] && [[ "$OUT" == "auth-config: unknown: the allow list holds no entries" ]]; } && ok "commas and no entries is unknown, never ok" || bad "commas only (rc=$RC out=$OUT)"
classify "$SAFE_LIST,http://evil|*.test/x"
[[ "$OUT" == *"evil_*.test/x"* && "$OUT" != *"|"* ]] && ok "a shown entry carries no pipe token" || bad "shown entry ($OUT)"

echo "4d. --audit reads the running container's list over ssh"
cat > "$TMP/bin/gcloud" <<'GC'
#!/usr/bin/env bash
case "$*" in *"compute ssh"*"GOTRUE_URI_ALLOW_LIST"*) [ -f "$GC_ALLOW" ] || exit 255; printf 'banner line\nALLOW:%s\n' "$(cat "$GC_ALLOW")" ;; *) exit 1 ;; esac
GC
chmod +x "$TMP/bin/gcloud"
audit() { OUT="$(env PATH="$TMP/bin:$PATH" GC_ALLOW="$TMP/allow" bash "$AR" --audit 2>&1)"; RC=$?; }
printf '%s' "$SAFE_LIST" > "$TMP/allow"; audit
{ [ "$RC" -eq 0 ] && [[ "$OUT" == "auth-config: ok: "* ]]; } && ok "safe on the server: exit 0" || bad "audit safe (rc=$RC out=$OUT)"
printf '%s' "$SAFE_LIST,http://localhost:58??/**" > "$TMP/allow"; audit
{ [ "$RC" -eq 1 ] && [[ "$OUT" == *"58??/**"* ]]; } && ok "58?? on the server: exit 1, named" || bad "audit 58 (rc=$RC out=$OUT)"
printf '%s\n%s' "$SAFE_LIST" ",http://*/**" > "$TMP/allow"; audit
{ [ "$RC" -eq 1 ] && [[ "$OUT" == *"http://*/**"* ]]; } && ok "a line break in the server's value hides nothing: exit 1" || bad "audit line break (rc=$RC out=$OUT)"
rm -f "$TMP/allow"; audit
{ [ "$RC" -eq 2 ] && [[ "$OUT" == "auth-config: unknown: ssh failed"* ]]; } && ok "ssh failure: exit 2" || bad "audit ssh fail (rc=$RC out=$OUT)"

echo "5. status lines are redirect-safe (shell-safety.md)"
all=""; for m in safe wildcard star stardeep digitstar open silent gap; do run "$m"; all="$all$OUT"$'\n'; done
if printf '%s' "$all" | grep -Eq '[<>|]'; then bad "a status line carries a redirect or pipe token"; else ok "no redirect or pipe tokens"; fi

echo ""
echo "p1705 auth-redirects: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
