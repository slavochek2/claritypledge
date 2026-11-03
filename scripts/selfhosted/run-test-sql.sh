#!/usr/bin/env bash
# scripts/selfhosted/run-test-sql.sh — P1606: raw SQL on the self-hosted TEST database, with the same
# engine and result shape as hosted TEST's Management API.
#
# SQL arrives on stdin and travels over the existing IAP SSH path to postgres-meta inside the VM, the
# service behind Supabase's own /database/query. So a multi-statement body is one implicit
# transaction, and the rows of its last row-returning statement come back as a JSON array on stdout.
# No public endpoint is added (P1557 reviewed one and rejected it).
#
#   run-test-sql.sh [--read-only] < query.sql
#
# Exit: 0 rows on stdout · 3 the database refused the SQL, HTTP 400 (its message on stderr) · 1 could not run.
# Any other status is "could not run": a degraded server must never read as a refusal.
set -euo pipefail

# Same constants as scripts/selfhosted/migrate.sh and scripts/supabase-readonly-sql.py; change all three.
GCP_PROJECT="gen-lang-client-0869694595"
VM="cp-test-supabase"
ZONE="asia-southeast1-a"
META_CONTAINER="supabase-meta"
EXPECTED_URL="https://136-85-1-126.sslip.io"
MAC_ENV="$HOME/.config/cp-selfhosted-test/env"
STATUS_MARKER="P1606STATUS:"

die() { echo "run-test-sql: $*" >&2; exit 1; }

READ_ONLY=false
case "${1:-}" in
  --read-only) READ_ONLY=true ;;
  "") ;;
  *) die "unknown argument '$1'." ;;
esac

[ -f "$MAC_ENV" ] || die "$MAC_ENV not found: cannot confirm the target identity. Nothing was run."
mac_url="$(grep '^SUPABASE_URL=' "$MAC_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
[ "$mac_url" = "$EXPECTED_URL" ] || die "SUPABASE_URL in $MAC_ENV is not $EXPECTED_URL. Refusing; nothing was run."

command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
command -v gcloud >/dev/null 2>&1 || die "gcloud not found."
gcloud auth print-access-token >/dev/null 2>&1 || die "gcloud login expired: run 'gcloud auth login', then re-run. Nothing was run."

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
READ_ONLY="$READ_ONLY" python3 -c '
import json, os, sys
sql = sys.stdin.read().strip()
if not sql:
    sys.exit("run-test-sql: empty SQL")
if os.environ["READ_ONLY"] == "true":
    sql = "BEGIN READ ONLY;\n" + sql.rstrip().rstrip(";") + "\n;\nROLLBACK;"  # newline first: a trailing -- comment cannot swallow the ;
json.dump({"query": sql}, sys.stdout)
' > "$WORK/payload.json"

# Runs inside the container: POST stdin to postgres-meta and print a status line, then the body.
# shellcheck disable=SC2016
NODE_SCRIPT='let b="";process.stdin.on("data",d=>b+=d).on("end",async()=>{const r=await fetch("http://localhost:8080/query",{method:"POST",headers:{"content-type":"application/json"},body:b});console.log("'"$STATUS_MARKER"'"+r.status);console.log(await r.text())})'

# One shared SSH connection per user: a fresh IAP session costs seconds, and specs make many calls.
# A short fixed path: SSH refuses a control socket path over about 104 characters, and TMPDIR can be long.
MUX_DIR="/tmp/cp-iap-$(id -u)"; mkdir -p "$MUX_DIR"; [ -O "$MUX_DIR" ] || die "$MUX_DIR is not owned by this user."; chmod 700 "$MUX_DIR"
if ! gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
      --ssh-flag="-o ControlMaster=auto" --ssh-flag="-o ControlPath=$MUX_DIR/%C" --ssh-flag="-o ControlPersist=120" --ssh-flag="-o ConnectTimeout=30" \
      --command "sudo docker exec -i $META_CONTAINER node -e '$NODE_SCRIPT'" \
      < "$WORK/payload.json" > "$WORK/out" 2> "$WORK/err"; then
  die "could not reach the self-hosted TEST database: $(tail -n 3 "$WORK/err" | tr '\n' ' ')"
fi

status="$(grep -m1 "^$STATUS_MARKER" "$WORK/out" | cut -d: -f2 || true)"
[ -n "$status" ] || die "no answer from the database service: $(tail -n 3 "$WORK/err" | tr '\n' ' ')"
awk -v m="$STATUS_MARKER" 'seen { print } index($0, m) == 1 { seen = 1 }' "$WORK/out" > "$WORK/body"
# An empty body is never success: every answer from this service is JSON, even for no rows.
[ -s "$WORK/body" ] || die "the database service answered with an empty body (status $status)."
if [ "$status" = 200 ]; then cat "$WORK/body"; exit 0; fi
cut -c1-800 "$WORK/body" >&2
[ "$status" = 400 ] && exit 3
echo "run-test-sql: the database service answered with status $status." >&2
exit 1
