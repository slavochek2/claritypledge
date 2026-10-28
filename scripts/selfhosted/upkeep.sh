#!/usr/bin/env bash
# scripts/selfhosted/upkeep.sh — weekly drift report for the self-hosted TEST server (P1584, /weekly)
#
#   upkeep.sh [--no-prod]
#
# Read-only, report only: it never upgrades, reboots or re-syncs anything. An agent reads the report
# and proposes the action; a human approves it (P1584 Non-Goals). One line per check:
#   images     running image tags against the pinned stack (docker-compose.yml + override on the VM)
#   upstream   the pinned stack release against upstream supabase/docker versions.md
#   os         pending OS updates, security ones counted separately; unattended-upgrades enabled
#   reboot     /var/run/reboot-required (unattended upgrades install security fixes but never reboot)
#   templates  auth e-mail templates the VM serves against prod's (one Keychain dialog: the prod
#              Management API token). --no-prod skips it and reports unknown.
#   hosted     hosted TEST, the warm fallback, is not paused (free projects pause when idle)
# Format "<check>: ok|warn|unknown: <detail>". Exit 0 all ok, 1 any warn, 2 any unknown (and no warn).
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail

GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
HOST="136-85-1-126.sslip.io"; PROD_REF="besjtuodziykmjidubzw"
UPSTREAM_VERSIONS="${UPSTREAM_VERSIONS_URL:-https://raw.githubusercontent.com/supabase/supabase/master/docker/versions.md}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; ENV_FILE="${UPKEEP_ENV_FILE:-$ROOT/.env.local}"
NO_PROD=0; [ "${1:-}" = "--no-prod" ] && NO_PROD=1

WARN=0; UNKNOWN=0
report() { echo "$1: $2: $3"; [ "$2" = warn ] && WARN=1; [ "$2" = unknown ] && UNKNOWN=1; return 0; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
tag() { printf '%s\n' "$OUT" | sed -n "s/^$1://p"; }

# --- One IAP SSH session; every value comes back on a tagged line ---------------------------------
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
OUT=""
if command -v gcloud >/dev/null 2>&1 && gcloud auth print-access-token >/dev/null 2>&1; then
  OUT="$(gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet --command '
    cd /opt/supabase/docker || exit 1
    sudo docker compose config --images | sed "s/^/PIN:/"
    sudo docker compose ps --format "{{.Service}} {{.Image}}" | sed "s/^/RUN:/"
    echo "SERVICES:$(sudo docker compose config --services | wc -l)"
    echo "RELEASE:$(grep -m1 -E "^## [0-9]{4}-[0-9]{2}-[0-9]{2}" versions.md | cut -c4-)"
    echo "APT:$(/usr/lib/update-notifier/apt-check 2>&1)"
    echo "UU:$(systemctl is-enabled unattended-upgrades 2>&1)"
    if [ -f /var/run/reboot-required ]; then echo "REBOOT:yes $(tr "\n" " " < /var/run/reboot-required.pkgs 2>/dev/null)"; else echo "REBOOT:no"; fi
    echo "END:ok"' 2>/dev/null)" || OUT=""
fi
# A session that did not reach its last line proves nothing about the lines before it.
[ "$(tag END)" = ok ] || OUT=""

# --- images ---------------------------------------------------------------------------------------
release="$(tag RELEASE)"
if [ -z "$OUT" ]; then report images unknown "ssh to the VM failed or gcloud is not logged in"
else
  tag PIN | sort -u > "$TMP/pin"; tag RUN | awk '{print $2}' | sort -u > "$TMP/run"
  n_run="$(tag RUN | wc -l | tr -d ' ')"; n_svc="$(tag SERVICES)"
  off="$(comm -13 "$TMP/pin" "$TMP/run" | tr '\n' ' ')"; floating="$(grep -vE ':[^:]*[0-9]+\.[0-9]+' "$TMP/pin" | tr '\n' ' ')"
  if [ -n "$off" ]; then report images warn "running but not pinned: ${off% }"
  elif [ "$n_run" != "$n_svc" ]; then report images warn "$n_run of $n_svc services running"
  else report images ok "$n_run services on the pinned images (release ${release:-unknown})${floating:+; floating tag: ${floating% }}"; fi
fi

# --- upstream -------------------------------------------------------------------------------------
if curl -sf -m 15 "$UPSTREAM_VERSIONS" -o "$TMP/upstream.md"; then
  latest="$(grep -m1 -E '^## [0-9]{4}-[0-9]{2}-[0-9]{2}' "$TMP/upstream.md" | cut -c4-)"
  if [ -z "$latest" ] || [ -z "$release" ]; then report upstream unknown "could not read a release date (pinned ${release:-?}, upstream ${latest:-?})"
  elif [[ "$latest" > "$release" ]]; then
    # Image lines in every upstream section newer than the pin.
    n="$(awk -v pin="## $release" '/^## [0-9]/{if($0==pin)exit; s=1} s&&/^- /' "$TMP/upstream.md" | wc -l | tr -d ' ')"
    report upstream warn "pinned $release, upstream $latest: $n image changes since; upgrade on a disposable clone first (recipe)"
  else report upstream ok "pinned $release is upstream's latest"; fi
else report upstream unknown "could not fetch upstream versions.md"; fi

# --- os, reboot -----------------------------------------------------------------------------------
apt="$(tag APT)"; uu="$(tag UU)"; reboot="$(tag REBOOT)"
if [ -z "$OUT" ]; then report os unknown "no VM reading"; report reboot unknown "no VM reading"
else
  case "$apt" in
    [0-9]*\;[0-9]*)
      all="${apt%%;*}"; sec="${apt##*;}"
      if [ "$uu" != enabled ]; then report os warn "unattended-upgrades is $uu; $sec security of $all pending"
      elif [ "$sec" -gt 0 ]; then report os warn "$sec security updates pending of $all (unattended-upgrades enabled but behind)"
      else report os ok "0 security updates pending ($all other); unattended-upgrades enabled"; fi ;;
    *) report os unknown "apt-check gave no count" ;;
  esac
  case "$reboot" in no) report reboot ok "no reboot pending" ;; yes*) report reboot warn "reboot pending for: ${reboot#yes }" ;; *) report reboot unknown "no reading" ;; esac
fi

# --- templates ------------------------------------------------------------------------------------
if [ "$NO_PROD" = 1 ]; then report templates unknown "skipped (--no-prod)"
else
  mkdir -p "$TMP/vm"; fetched=1
  for f in magic_link.html confirmation.html; do
    curl -sf -m 15 "https://$HOST/_cp-email-templates/$f" -o "$TMP/vm/$f" || fetched=0
  done
  if [ "$fetched" = 0 ]; then report templates unknown "could not fetch the VM's templates"
  elif ! { source "$ROOT/scripts/keyring.sh" && KEYRING_REASON="weekly: compare TEST e-mail templates with prod (read-only)" keyring_require PROD_SUPABASE_ACCESS_TOKEN; }; then
    report templates unknown "prod token not unlocked"
  else
    code="$(curl -s -m 20 -o "$TMP/prod.json" -w '%{http_code}' "https://api.supabase.com/v1/projects/$PROD_REF/config/auth" \
      -H @<(printf 'Authorization: Bearer %s\n' "$PROD_SUPABASE_ACCESS_TOKEN"))"
    unset PROD_SUPABASE_ACCESS_TOKEN
    if [ "$code" != 200 ]; then report templates unknown "prod config read failed (HTTP $code)"
    else line="$(python3 -I "$ROOT/scripts/selfhosted/lib/email_template_drift.py" "$TMP/prod.json" "$TMP/vm")"
      report templates "$(echo "$line" | cut -d: -f2 | tr -d ' ')" "$(echo "$line" | cut -d: -f3- | sed 's/^ //')"; fi
  fi
fi

# --- hosted fallback ------------------------------------------------------------------------------
# The routine-half test token in .env.local; .env.local stays on hosted TEST by design (P1557).
ref="$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed 's|https://||' | cut -d. -f1)"
tok="$(grep '^SUPABASE_TEST_WRITE_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
if [ -z "$ref" ] || [ -z "$tok" ]; then report hosted unknown "no hosted TEST ref or token in .env.local"
elif [ "$ref" = "$PROD_REF" ]; then report hosted unknown ".env.local names the prod project; refusing"
else
  # The token is scoped to database queries (it cannot read project status), and that is the path
  # the hosted leg of migrate.sh takes, so probe exactly that: a read-only select 1.
  code="$(curl -s -m 20 -o "$TMP/hosted.json" -w '%{http_code}' -X POST "https://api.supabase.com/v1/projects/$ref/database/query" \
    -H @<(printf 'Authorization: Bearer %s\n' "$tok") -H 'Content-Type: application/json' \
    --data '{"query":"select 1 as ok","read_only":true}')"
  if [ "$code" = 201 ] && grep -q '"ok":1' "$TMP/hosted.json"; then report hosted ok "hosted TEST answers queries (warm fallback)"
  elif [ "$code" = 000 ]; then report hosted unknown "no answer from the Management API"
  elif grep -qiE 'paus|inactive|restor' "$TMP/hosted.json"; then
    report hosted warn "hosted TEST is paused; restore it in the dashboard or the next migrate fails its hosted leg"
  else report hosted warn "hosted TEST did not answer a query (HTTP $code); the next migrate's hosted leg will fail"; fi
fi
unset tok

[ "$WARN" = 1 ] && exit 1
[ "$UNKNOWN" = 1 ] && exit 2
exit 0
