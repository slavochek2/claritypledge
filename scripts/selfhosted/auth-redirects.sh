#!/usr/bin/env bash
# scripts/selfhosted/auth-redirects.sh — does TEST's auth server send a sign-in link back to the
# worktree port it came from? (P1705)
#
#   auth-redirects.sh --check [--quiet]   read-only probe; exit 0 all ok, 1 a port is refused, 2 could not check
#   auth-redirects.sh --apply              add the localhost wildcard to the VM's ADDITIONAL_REDIRECT_URLS
#                                          (backup first, existing entries kept), recreate auth, then --check
#
# Why a wildcard: GoTrue (v2.189.0, internal/utilities/request.go IsRedirectURLValid) already accepts a
# redirect to ANY port on a loopback IP, so `http://localhost:*` adds no new class of trust, and it
# covers every slot scripts/lib/worktree-port.mjs can ever hand out with nothing to regenerate.
# A refused redirect falls back to SITE_URL, and TEST's email template then writes localhost:5001 into
# the link: the P1705 symptom. So refusal is checked by behaviour, never by reading the config text.
#
# The probe: GET /auth/v1/verify with an invalid token. GoTrue answers 303 to redirect_to when it is
# allowed, else to SITE_URL. An invalid token changes no state. The ports probed come from the
# allocator (every slot), plus a sample of named-worktree and load-test ports. One control must keep
# failing: an external host. If it is not refused, the probe cannot tell allowed from refused and the
# check reports unknown rather than ok. (A localhost port outside the allocator is not asserted
# refused: the wildcard accepts it by design.)
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
HOST="${SELFHOSTED_HOST:-136-85-1-126.sslip.io}"
# Deliberately invalid: GoTrue rejects it, so the probe changes no state. Not a secret.
PROBE_TOKEN="p1705-probe-invalid" # gitleaks:allow
STACK_DIR="/opt/supabase/docker"
WILDCARDS="http://localhost:*,http://localhost:*/**"

MODE=""; QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check; shift ;;
    --apply) MODE=apply; shift ;;
    --quiet) QUIET=1; shift ;;
    *) echo "usage: auth-redirects.sh --check [--quiet] | --apply" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { echo "usage: auth-redirects.sh --check [--quiet] | --apply" >&2; exit 2; }
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
  while IFS= read -r p; do
    [ -n "$p" ] || continue
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
  echo "auth-redirects: ok: all $n worktree ports allowed, external control refused"
  return 0
}

apply() {
  echo "Adding $WILDCARDS to ADDITIONAL_REDIRECT_URLS on $VM (backup kept), then recreating the auth container."
  # The remote script backs up .env, appends only the entries that are missing, and validates the
  # compose config before recreating. Values are never printed.
  local remote
  IFS= read -r -d '' remote <<'REMOTE' || true
set -euo pipefail
cd "$STACK_DIR"
cur="$(grep -m1 '^ADDITIONAL_REDIRECT_URLS=' .env || true)"
[ -n "$cur" ] || { echo "P1705: no ADDITIONAL_REDIRECT_URLS line in .env; refusing" >&2; exit 1; }
val="${cur#ADDITIONAL_REDIRECT_URLS=}"; val="${val#\"}"; val="${val%\"}"
new="$val"
IFS=',' read -r -a want <<< "$WILDCARDS"
for w in "${want[@]}"; do
  case ",$new," in *",$w,"*) ;; *) new="$new,$w" ;; esac
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
  out="$({ printf 'STACK_DIR=%q\nWILDCARDS=%q\n' "$STACK_DIR" "$WILDCARDS"; printf '%s\n' "$remote"; } |
    gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
      --command 'sudo bash -s' 2>&1)"; rc=$?
  printf '%s\n' "$out"
  [ "$rc" -eq 0 ] || { echo "auth-redirects: apply failed on the VM (exit $rc); TEST auth may need a look" >&2; return 2; }
  # GoTrue takes a few seconds to come back after a recreate.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    case "$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "https://$HOST/auth/v1/health")" in 2*|4*) break ;; esac
    sleep 5
  done
  check
}

if [ "$MODE" = check ]; then check; exit $?; fi
apply; exit $?
