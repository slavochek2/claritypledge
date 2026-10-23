#!/bin/bash
# scripts/selfhosted/deploy-functions.sh — deploy edge functions to the self-hosted TEST server (P1557)
#
# This is NOT scripts/deploy-functions.sh. That script talks to a hosted project through the
# Supabase CLI and Management API; this one never does. There is no --env flag and no fallback:
# the target is the one self-hosted VM below, or the script refuses and exits non-zero.
#
# Usage:
#   scripts/selfhosted/deploy-functions.sh [fn]        deploy all functions (or one) + router, restart functions
#   scripts/selfhosted/deploy-functions.sh --setup     one-time: functions.env + env_file stanza in the override
#   scripts/selfhosted/deploy-functions.sh --secrets   push function secrets from the Mac secrets file
#   scripts/selfhosted/deploy-functions.sh --check-secrets   report required secret names still missing (names only)
#
# What a deploy does: stages supabase/functions/* (tests excluded), the router
# supabase/selfhosted/functions-main/index.ts as functions/main, and the JWT policy list
# supabase/no-verify-jwt-functions.txt next to the router; ships one tarball over IAP; replaces the
# function directories under /opt/supabase/docker/volumes/functions; recreates the functions
# container so the router and env are re-read.
#
# Function secrets: values live ONLY in ~/.config/cp-selfhosted-test/functions.env (600, KEY=VALUE).
# They travel as a file over IAP scp, never in argv, and are never printed. Names are validated
# against what the function code reads (scripts/check-edge-function-secrets.sh --parse-only).
# SUPABASE_* built-ins come from the compose file and are refused in that file.

set -euo pipefail

# --- The one target. Changing these is a decision, not a flag. ---
GCP_PROJECT="gen-lang-client-0869694595"
VM="cp-test-supabase"
ZONE="asia-southeast1-a"
EXPECTED_URL="https://136-85-1-126.sslip.io"
STACK_DIR="/opt/supabase/docker"
FUNCTIONS_VOL="$STACK_DIR/volumes/functions"
SECRETS_DIR="$HOME/.config/cp-selfhosted-test"
MAC_ENV="$SECRETS_DIR/env"
MAC_FN_ENV="$SECRETS_DIR/functions.env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Git root of CWD, so a worktree deploys its own checkout (same convention as deploy-functions.sh).
PROJECT_DIR="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || dirname "$(dirname "$SCRIPT_DIR")")"
FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"
ROUTER_SRC="$PROJECT_DIR/supabase/selfhosted/functions-main/index.ts"
OPEN_LIST="$PROJECT_DIR/supabase/no-verify-jwt-functions.txt"
CHECK_SECRETS="$PROJECT_DIR/scripts/check-edge-function-secrets.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

MODE="deploy"
FUNCTION_NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --setup) MODE="setup" ;;
    --secrets) MODE="secrets" ;;
    --check-secrets) MODE="check-secrets" ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --env|--env=*|--project-ref|--project-ref=*)
      die "$1 is a hosted-target flag. This script only deploys to $EXPECTED_URL; use scripts/deploy-functions.sh for hosted." ;;
    -*) die "unknown flag: $1" ;;
    *) FUNCTION_NAME="$1" ;;
  esac
  shift
done

# --- Refuse unless the target is the self-hosted host ---
[ -f "$MAC_ENV" ] || die "$MAC_ENV not found: cannot confirm the target identity. Nothing was deployed."
mac_url="$(grep '^SUPABASE_URL=' "$MAC_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
[ "$mac_url" = "$EXPECTED_URL" ] || die "SUPABASE_URL in $MAC_ENV is not $EXPECTED_URL (found: ${mac_url:-empty}). Refusing; nothing was deployed."
command -v gcloud >/dev/null 2>&1 || die "gcloud not found"
[ -f "$ROUTER_SRC" ] || die "router source not found: $ROUTER_SRC"
[ -f "$OPEN_LIST" ] || die "JWT policy list not found: $OPEN_LIST"
[ -d "$FUNCTIONS_DIR" ] || die "functions dir not found: $FUNCTIONS_DIR"
if [ -n "$FUNCTION_NAME" ] && [ ! -d "$FUNCTIONS_DIR/$FUNCTION_NAME" ]; then
  die "function directory not found: $FUNCTIONS_DIR/$FUNCTION_NAME"
fi

GCLOUD_COMMON=(--project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet)
vm_ssh() { gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command "$1" 2> >(grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' >&2); }
vm_scp() { gcloud compute scp "${GCLOUD_COMMON[@]}" "$1" "$VM:$2" 2> >(grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' >&2); }

# Run a script read from stdin as root on the VM. Callers use QUOTED heredocs, so nothing in the
# remote script is expanded locally; the two path constants are prepended instead.
vm_run() {
  { printf 'STACK_DIR=%q\nFUNCTIONS_VOL=%q\n' "$STACK_DIR" "$FUNCTIONS_VOL"; cat; } |
    gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command 'sudo bash -s' \
      2> >(grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' >&2)
}

# Names the function code reads, minus the SUPABASE_* built-ins the compose file provides.
secret_names() {
  "$CHECK_SECRETS" --parse-only | awk -F': ' '
    /^REQUIRED|^OPTIONAL/ { n = split($2, a, " "); for (i = 1; i <= n; i++) print $1 ":" a[i] }' |
    awk -F: '{ if ($2 !~ /^SUPABASE_/) print }' | sort -u
}

# --- setup: functions.env + env_file stanza (idempotent) ---
if [ "$MODE" = "setup" ]; then
  vm_run <<'REMOTE'
set -euo pipefail
cd "$STACK_DIR"
[ -f functions.env ] || { umask 177; : > functions.env; }
chmod 600 functions.env
if ! grep -q 'functions.env' docker-compose.override.yml; then
  cp -p docker-compose.override.yml docker-compose.override.yml.pre-p1557-functions-env
  python3 - <<'PY'
p = 'docker-compose.override.yml'
lines = open(p).read().split('\n')
i = lines.index('services:')
lines[i + 1:i + 1] = ['  functions:', '    env_file:', '      - ./functions.env']
open(p, 'w').write('\n'.join(lines))
PY
fi
docker compose config --quiet && echo "setup ok: override validates, functions.env present"
grep -n -B1 -A3 'functions.env' docker-compose.override.yml
REMOTE
  exit 0
fi

# --- check-secrets / secrets ---
if [ "$MODE" = "check-secrets" ] || [ "$MODE" = "secrets" ]; then
  names="$(secret_names)"
  have=""
  if [ -f "$MAC_FN_ENV" ]; then
    [ "$(stat -f '%Lp' "$MAC_FN_ENV" 2>/dev/null || stat -c '%a' "$MAC_FN_ENV")" = "600" ] || die "$MAC_FN_ENV must be mode 600"
    if grep -q -E '^SUPABASE_' "$MAC_FN_ENV"; then
      die "$MAC_FN_ENV defines SUPABASE_* names; those come from the compose file and must not be overridden."
    fi
    have="$(grep -E '^[A-Z_][A-Z0-9_]*=.+' "$MAC_FN_ENV" | cut -d= -f1 | sort -u)"
  fi
  missing_required=""; missing_optional=""
  while IFS=: read -r cls name; do
    [ -n "$name" ] || continue
    if ! grep -qxF "$name" < <(printf '%s\n' "$have"); then
      case "$cls" in OPTIONAL*) missing_optional="$missing_optional $name" ;; *) missing_required="$missing_required $name" ;; esac
    fi
  done <<< "$names"
  missing_required="$(printf '%s\n' $missing_required | sort -u | tr '\n' ' ')"
  missing_optional="$(printf '%s\n' $missing_optional | sort -u | tr '\n' ' ')"
  echo "MISSING required (names only): ${missing_required:-none}"
  echo "missing optional (code default applies): ${missing_optional:-none}"
  if [ "$MODE" = "check-secrets" ]; then
    [ -z "$missing_required" ]; exit $?
  fi
  [ -f "$MAC_FN_ENV" ] || die "$MAC_FN_ENV not found: nothing to push."
  vm_scp "$MAC_FN_ENV" "/tmp/functions.env.incoming"
  vm_run <<'REMOTE'
set -euo pipefail
install -m 600 -o root -g root /tmp/functions.env.incoming "$STACK_DIR/functions.env"
shred -u /tmp/functions.env.incoming
cd "$STACK_DIR"
docker compose up -d --force-recreate functions >/dev/null 2>&1
echo "functions.env installed ($(wc -l < functions.env) lines), functions container recreated"
REMOTE
  exit 0
fi

# --- deploy ---
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/functions"
if [ -n "$FUNCTION_NAME" ]; then
  copy_set=("$FUNCTION_NAME" _shared)
else
  copy_set=()
  for dir in "$FUNCTIONS_DIR"/*/; do copy_set+=("$(basename "$dir")"); done
fi
for fn in "${copy_set[@]}"; do
  [ -d "$FUNCTIONS_DIR/$fn" ] || continue
  cp -R "$FUNCTIONS_DIR/$fn" "$STAGE/functions/$fn"
done
find "$STAGE/functions" -name '*.test.ts' -delete
mkdir -p "$STAGE/functions/main"
cp "$ROUTER_SRC" "$STAGE/functions/main/index.ts"
cp "$OPEN_LIST" "$STAGE/functions/main/no-verify-jwt-functions.txt"

TARBALL="$STAGE/functions.tgz"
COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGE/functions" -czf "$TARBALL" .
echo "Deploying ${#copy_set[@]} function dir(s) + router to $VM ($EXPECTED_URL)..."
vm_scp "$TARBALL" "/tmp/cp-functions.tgz"

vm_run <<'REMOTE'
set -euo pipefail
cd "$STACK_DIR"
[ -f functions.env ] || { echo "functions.env missing: run scripts/selfhosted/deploy-functions.sh --setup" >&2; exit 1; }
grep -q 'functions.env' docker-compose.override.yml || { echo "override has no functions env_file: run --setup" >&2; exit 1; }
W=$(mktemp -d)
tar -xzf /tmp/cp-functions.tgz -C "$W"
rm -f /tmp/cp-functions.tgz
mkdir -p "$FUNCTIONS_VOL"
for d in "$W"/*/; do
  n=$(basename "$d")
  rm -rf "${FUNCTIONS_VOL:?}/$n"
  cp -R "$d" "$FUNCTIONS_VOL/$n"
done
rm -rf "$W"
chown -R root:root "$FUNCTIONS_VOL"
docker compose up -d --force-recreate functions >/dev/null 2>&1
for i in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions 2>/dev/null)" = healthy ] && break
  sleep 2
done
echo "functions container: $(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions)"
ls "$FUNCTIONS_VOL" | tr '\n' ' '; echo
REMOTE
echo "Deployed. Self-hosted only: no hosted project, Management API or deploy manifest was touched."
