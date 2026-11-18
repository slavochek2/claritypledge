#!/usr/bin/env bash
# scripts/selfhosted/auth-redirects.sh — does TEST's auth server send a sign-in link back to the
# worktree port it came from? (P1705)
#
#   auth-redirects.sh --check [--quiet]   read-only probe; exit 0 all ok, 1 a port is refused, 2 could not check
#   auth-redirects.sh --audit              read-only: the allow list the running auth container uses,
#                                          judged by --classify (needs SSH to the VM)
#   auth-redirects.sh --classify           judge a comma-separated allow list on stdin: exit 0 every
#                                          entry fixes its host, 1 one lets the host vary, 2 empty
#   auth-redirects.sh --apply              put the four-digit localhost pattern in the VM's
#                                          ADDITIONAL_REDIRECT_URLS (backup first, other entries kept,
#                                          the earlier unsafe `localhost:*` entries removed), recreate
#                                          auth, then --check
#
# Why four digits and never `*`: GoTrue (v2.189.0) compiles each entry with glob.MustCompile(uri, '.',
# '/'), so `*` matches any run without a dot or slash, including `a@0x5db8d822`. With
# `http://localhost:*` it accepted `http://localhost:a@0x5db8d822/x`: a browser reads that as user
# "localhost" on host 0x5db8d822 (an outside IPv4 address), so a sign-in link carried its tokens off
# the machine. Verified live on TEST 2026-11-18 by the probe below. `[0-9][0-9][0-9][0-9]` matches
# a port and nothing else, and covers every port scripts/lib/worktree-port.mjs hands out (all four
# digits) with nothing to regenerate.
# A refused redirect falls back to SITE_URL, and TEST's email template then writes localhost:5001 into
# the link: the P1705 symptom. So refusal is checked by behaviour, never by reading the config text.
#
# The probe: GET /auth/v1/verify with an invalid token. GoTrue answers 303 to redirect_to when it is
# allowed, else to SITE_URL. An invalid token changes no state. The ports probed come from the
# allocator (every slot), plus a sample of named-worktree and load-test ports. One control must keep
# failing: an external host. If it is not refused, the probe cannot tell allowed from refused and the
# check reports unknown rather than ok. Two more must stay refused, or the check fails: a userinfo
# host behind localhost (the bypass above), and a five-digit port.
#
# Probes sample; they cannot prove an arbitrary entry safe (`http://localhost:[0-9][0-9]*` admits
# `http://localhost:12@0x08080808` and none of the controls). So --audit also reads the entries and
# allows a glob only after the host: the text before the first `/` past `://` must hold no glob
# character and no `@`, or the entry must be one of WILDCARDS, whose `[0-9]` classes match digits only.
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
HOST="${SELFHOSTED_HOST:-136-85-1-126.sslip.io}"
# Deliberately invalid: GoTrue rejects it, so the probe changes no state. Not a secret.
PROBE_TOKEN="p1705-probe-invalid" # gitleaks:allow
STACK_DIR="/opt/supabase/docker"
WILDCARDS="http://localhost:[0-9][0-9][0-9][0-9],http://localhost:[0-9][0-9][0-9][0-9]/**"
# Entries that let the host vary and that WILDCARDS already covers. --apply removes them wherever
# they are. The first two are the first form of this fix (P1705, 2026-11-18); `58??` was an earlier
# named-worktree entry, and its `??` admits `http://localhost:58@a/x` (host `a`).
UNSAFE="http://localhost:*,http://localhost:*/**,http://localhost:58??,http://localhost:58??/**"
# Must never be honoured. The first three are the userinfo bypass in the header (0x7f000002 is
# 127.0.0.2, so the probe never names an outside host); the last is outside the allocator. Each
# GoTrue entry form needs its own control, because `*` stops at `.` and `/`: a plain
# `http://localhost:*` matches only a URL with no path, `http://localhost:*/**` only one with a
# path, and a hand-typed `http://localhost:[0-9]*` only a userinfo that starts with a digit.
MUST_REFUSE="http://localhost:a@0x7f000002 http://localhost:1@0x7f000002 http://localhost:a@0x7f000002/x http://localhost:12345/x"

# Whole-check deadline in seconds. health.sh runs this on every call, and each probe may take 20 s,
# so a slow auth server must not hold it for minutes: past the deadline the verdict is unknown.
# The five controls (the external host and MUST_REFUSE) run first and are never cut short (they
# are the safety answer); the deadline is checked before each worktree-port probe. Every probe is
# capped at 20 s, so a run lasts at most the larger of 100 s (the controls) and DEADLINE + 20 s:
# 110 s at the default.
# An ok that lands after the deadline is still a full answer: every port was probed and allowed.
DEADLINE="${AUTH_REDIRECTS_DEADLINE:-90}"
case "$DEADLINE" in ""|*[!0-9]*) echo "AUTH_REDIRECTS_DEADLINE must be a whole number of seconds" >&2; exit 2 ;; esac

MODE=""; QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check; shift ;;
    --apply) MODE=apply; shift ;;
    --audit) MODE=audit; shift ;;
    --classify) MODE=classify; shift ;;
    --quiet) QUIET=1; shift ;;
    *) echo "usage: auth-redirects.sh --check [--quiet], --audit, --classify or --apply" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { echo "usage: auth-redirects.sh --check [--quiet], --audit, --classify or --apply" >&2; exit 2; }

# An entry printed in a status line keeps only characters with no shell meaning (shell-safety.md).
shown() { printf '%s' "$1" | LC_ALL=C tr -c 'A-Za-z0-9:/._*?[]{}@,-' '_'; }

# Judge an allow list (comma-separated, on stdin). One status line; exit 0 ok, 1 warn, 2 unknown.
classify() {
  local list e scheme rest auth n=0 k=0 bad=""
  # A line break or other control character inside the value would end the read below and hide
  # every entry after it (Codex round 6), so each becomes a space, and an entry holding one is refused.
  list="$(LC_ALL=C tr '[:cntrl:]' ' ')"; list="${list%"${list##*[! ]}"}"
  [ -n "$list" ] || { echo "auth-config: unknown: the allow list could not be read"; return 2; }
  local -a entries; IFS=',' read -r -a entries <<< "$list"
  for e in "${entries[@]}"; do
    [ -n "$e" ] || continue
    n=$((n + 1))
    case ",$WILDCARDS," in *",$e,"*) continue ;; esac
    scheme="${e%%://*}"; rest="${e#*://}"
    if [ "$rest" = "$e" ]; then bad="$bad $(shown "$e")"; k=$((k + 1)); continue; fi
    auth="${rest%%/*}"
    case "$scheme" in ""|*[!a-z]*) bad="$bad $(shown "$e")"; k=$((k + 1)); continue ;; esac
    case "$auth" in ""|*[][*?{}@\\]*) bad="$bad $(shown "$e")"; k=$((k + 1)); continue ;; esac
    case "$e" in *" "*) bad="$bad $(shown "$e")"; k=$((k + 1)) ;; esac
  done
  [ "$n" -gt 0 ] || { echo "auth-config: unknown: the allow list holds no entries"; return 2; }
  if [ -n "$bad" ]; then
    echo "auth-config: warn: UNSAFE: $k of $n entries let the host vary:$bad (auth-redirects.sh --apply drops the known ones; any other needs a hand edit)"
    return 1
  fi
  echo "auth-config: ok: $n entries, each fixes its host"
  return 0
}

audit() {
  local out rc list
  out="$(gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
    --command "printf 'ALLOW:%s\\n' \"\$(sudo docker exec supabase-auth printenv GOTRUE_URI_ALLOW_LIST)\"" 2>/dev/null)"; rc=$?
  [ "$rc" -eq 0 ] || { echo "auth-config: unknown: ssh failed (exit $rc)"; return 2; }
  # The value is printed last; every line from ALLOW: on is part of it.
  list="$(printf '%s\n' "$out" | sed -n '/^ALLOW:/,$p' | sed '1s/^ALLOW://')"
  case "$out" in *ALLOW:*) ;; *) echo "auth-config: unknown: the allow list could not be read"; return 2 ;; esac
  printf '%s' "$list" | classify
}
case "$HOST" in ""|*[!a-z0-9.-]*|-*) echo "refusing SELFHOSTED_HOST: not a plain hostname" >&2; exit 2 ;; esac

# Ports to probe, derived from the one definition. A name sample covers the named range, and base+1
# covers a load-test port. Printed one per line.
probe_ports() {
  node --input-type=module -e "
    import { slotOrigins, portForSlot } from '$REPO/scripts/lib/worktree-port.mjs';
    const ports = new Set(slotOrigins().map((o) => Number(new URL(o).port)));
    for (const n of ['p1508-base', 'named-x', 'design-tree']) ports.add(portForSlot(n));
    ports.add(portForSlot('w21') + 1);
    process.stdout.write([...ports].sort((a, b) => a - b).join('\n') + '\n');
  "
}

# Prints the Location an invalid-token verify call is redirected to, or nothing on failure.
location_for() {
  curl -s -o /dev/null -w '%{redirect_url}' --max-time 20 -G "https://$HOST/auth/v1/verify" \
    --data-urlencode "token=$PROBE_TOKEN" --data-urlencode "type=signup" \
    --data-urlencode "redirect_to=$1"
}

check() {
  local ports p target loc refused=0 n=0 failed=""
  ports="$(probe_ports)" || { echo "auth-redirects: unknown: could not read the port allocator"; return 2; }
  [ -n "$ports" ] || { echo "auth-redirects: unknown: the allocator returned no ports"; return 2; }
  # Control first: an external host must still fall back to SITE_URL. If it does not, the probe
  # itself cannot tell allowed from refused, and every verdict below would be meaningless.
  loc="$(location_for "https://p1705-control.invalid/x")"
  case "$loc" in
    "https://$HOST/"*) ;;
    "") echo "auth-redirects: unknown: the auth server did not answer the control probe"; return 2 ;;
    *) echo "auth-redirects: unknown: control probe was not refused (went to ${loc%%#*}), so the probe cannot judge"; return 2 ;;
  esac
  local bad=""
  for target in $MUST_REFUSE; do
    loc="$(location_for "$target")"
    case "$loc" in
      "https://$HOST/"*) [ "$QUIET" = 1 ] || echo "  refused as it must be: $target" ;;
      "") echo "auth-redirects: unknown: no answer for the refusal control $target"; return 2 ;;
      *) bad="$bad $target" ;;
    esac
  done
  if [ -n "$bad" ]; then
    echo "auth-redirects: warn: UNSAFE: the allow list accepts what it must refuse:$bad (a sign-in link can leave this machine; run auth-redirects.sh --apply)"
    return 1
  fi
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    if [ "$SECONDS" -ge "$DEADLINE" ]; then
      echo "auth-redirects: unknown: stopped after $n ports, past the ${DEADLINE} s deadline (the auth server answers slowly)"
      return 2
    fi
    n=$((n + 1))
    target="http://localhost:$p/auth/callback"
    loc="$(location_for "$target")"
    case "$loc" in
      "$target"*) [ "$QUIET" = 1 ] || echo "  $p: allowed" ;;
      "") echo "auth-redirects: unknown: no answer for port $p"; return 2 ;;
      *) refused=$((refused + 1)); failed="$failed $p"; [ "$QUIET" = 1 ] || echo "  $p: REFUSED (falls back to ${loc%%#*})" ;;
    esac
  done <<< "$ports"
  if [ "$refused" -gt 0 ]; then
    echo "auth-redirects: warn: $refused of $n worktree ports refused:$failed (sign-in links from them fall back to localhost:5001; run auth-redirects.sh --apply)"
    return 1
  fi
  echo "auth-redirects: ok: all $n worktree ports allowed, external, userinfo and five-digit controls refused"
  return 0
}

apply() {
  echo "Setting $WILDCARDS in ADDITIONAL_REDIRECT_URLS on $VM (backup kept, the UNSAFE entries removed), then recreating the auth container."
  # The remote script backs up .env, drops the unsafe entries, appends only the entries that are
  # missing, and validates the compose config before recreating. Values are never printed.
  local remote
  IFS= read -r -d '' remote <<'REMOTE' || true
set -euo pipefail
cd "$STACK_DIR"
cur="$(grep -m1 '^ADDITIONAL_REDIRECT_URLS=' .env || true)"
[ -n "$cur" ] || { echo "P1705: no ADDITIONAL_REDIRECT_URLS line in .env; refusing" >&2; exit 1; }
val="${cur#ADDITIONAL_REDIRECT_URLS=}"; val="${val#\"}"; val="${val%\"}"
new=""
IFS=',' read -r -a have <<< "$val"
IFS=',' read -r -a unsafe <<< "$UNSAFE"
for h in "${have[@]}"; do
  drop=0; for u in "${unsafe[@]}"; do [ "$h" = "$u" ] && drop=1; done
  [ "$drop" = 1 ] || new="${new:+$new,}$h"
done
IFS=',' read -r -a want <<< "$WILDCARDS"
for w in "${want[@]}"; do
  case ",$new," in *",$w,"*) ;; *) new="${new:+$new,}$w" ;; esac
done
if [ "$new" = "$val" ]; then echo "P1705: already present, nothing changed"; exit 0; fi
ts="$(date -u +%Y%m%d-%H%M%S)"
cp -p .env ".env.pre-p1705-$ts"
python3 - "$new" <<'PY'
import sys, re
new = sys.argv[1]
p = '.env'
s = open(p).read()
s2, n = re.subn(r'^ADDITIONAL_REDIRECT_URLS=.*$', 'ADDITIONAL_REDIRECT_URLS="' + new.replace('\\', '\\\\') + '"', s, count=1, flags=re.M)
assert n == 1
open(p, 'w').write(s2)
PY
docker compose config --quiet
docker compose up -d --no-deps --force-recreate auth
echo "P1705: applied; backup .env.pre-p1705-$ts"
REMOTE
  # The VM's whole output is shown, never filtered: a keyword filter can hide the only failure line.
  local out rc
  out="$({ printf 'STACK_DIR=%q\nWILDCARDS=%q\nUNSAFE=%q\n' "$STACK_DIR" "$WILDCARDS" "$UNSAFE"; printf '%s\n' "$remote"; } |
    gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
      --command 'sudo bash -s' 2>&1)"; rc=$?
  printf '%s\n' "$out" | LC_ALL=C tr '<>|' '___'
  [ "$rc" -eq 0 ] || { echo "auth-redirects: apply failed on the VM (exit $rc); TEST auth may need a look" >&2; return 2; }
  # GoTrue takes a few seconds to come back after a recreate.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    case "$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "https://$HOST/auth/v1/health")" in 2*|4*) break ;; esac
    sleep 5
  done
  # Behaviour first, then the entries themselves: the worse of the two verdicts is the answer.
  local c a
  check; c=$?
  audit; a=$?
  [ "$c" -eq 1 ] || [ "$a" -eq 1 ] && return 1
  [ "$c" -eq 0 ] && [ "$a" -eq 0 ] && return 0
  return 2
}

case "$MODE" in
  check) check; exit $? ;;
  classify) classify; exit $? ;;
  audit) audit; exit $? ;;
esac
apply; exit $?
