#!/usr/bin/env bash
# scripts/selfhosted/health.sh — daily health of the self-hosted TEST server (P1557, /day cp.testdb)
#
# Read-only. One line per check: "<check>: ok|warn|unknown: <detail>". A check that could not run
# is "unknown", never "ok". Exit 0 all ok, 1 any warn, 2 any unknown (and no warn).
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail

GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
HOST="136-85-1-126.sslip.io"
DISK_WARN_PCT=80; WAL_WARN_MB=2048; CERT_WARN_DAYS=14

WARN=0; UNKNOWN=0
report() { echo "$1: $2: $3"; [ "$2" = warn ] && WARN=1; [ "$2" = unknown ] && UNKNOWN=1; return 0; }

# 1. Reachable over HTTPS (any HTTP answer from the auth service counts; 000 is no answer).
code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://$HOST/auth/v1/health")"; rc=$?
case "$code" in [1-9][0-9][0-9]|000) ;; *) code="" ;; esac
if [ -z "$code" ]; then report reachable unknown "curl could not run (exit $rc)"; else
case "$code" in 000) report reachable warn "no answer from https://$HOST" ;; 5*) report reachable warn "HTTP $code" ;; *) report reachable ok "HTTP $code" ;; esac
fi

# 2. Certificate days left.
end="$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
if [ -z "$end" ]; then report cert unknown "could not read the certificate"
else
  end_ts="$(date -j -f '%b %e %T %Y %Z' "$end" +%s 2>/dev/null || true)"
  if [ -z "$end_ts" ]; then report cert unknown "could not parse the expiry date"
  else days=$(( (end_ts - $(date +%s)) / 86400 ))
  if [ "$days" -lt "$CERT_WARN_DAYS" ]; then report cert warn "$days days left"; else report cert ok "$days days left"; fi
  fi
fi

# 3-4. Disk and WAL, over IAP SSH. Needs a live gcloud login.
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
if ! command -v gcloud >/dev/null 2>&1 || ! gcloud auth print-access-token >/dev/null 2>&1; then
  report disk unknown "gcloud not logged in (run gcloud auth login)"
  report wal unknown "gcloud not logged in"
else
  out="$(gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet --command \
    "echo DISK:\$(df --output=pcent / | tail -1 | tr -dc 0-9); echo WAL:\$(sudo docker exec supabase-db psql -U postgres -At -c 'select (coalesce(sum(size),0)/1048576)::bigint from pg_ls_waldir()')" 2>/dev/null)"; ssh_rc=$?
  # A failed session proves nothing, whatever it printed before failing.
  [ "$ssh_rc" -eq 0 ] || out=""
  # Tagged lines, so a banner or warning on stdout can never be read as a number.
  pct="$(printf '%s\n' "$out" | sed -n 's/^DISK:\([0-9][0-9]*\)$/\1/p')"; wal="$(printf '%s\n' "$out" | sed -n 's/^WAL:\([0-9][0-9]*\)$/\1/p')"
  if [ -z "$pct" ]; then report disk unknown "ssh failed or returned nothing"
  elif [ "$pct" -ge "$DISK_WARN_PCT" ]; then report disk warn "${pct}% used"; else report disk ok "${pct}% used"; fi
  if [ -z "$wal" ]; then report wal unknown "could not read WAL size"
  elif [ "$wal" -ge "$WAL_WARN_MB" ]; then report wal warn "${wal} MB"; else report wal ok "${wal} MB"; fi
fi

[ "$WARN" = 1 ] && exit 1
[ "$UNKNOWN" = 1 ] && exit 2
exit 0
