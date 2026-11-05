#!/bin/bash
# scripts/selfhosted/deploy-functions.sh — deploy edge functions to the self-hosted TEST server (P1557)
#
# This is NOT scripts/deploy-functions.sh. That script talks to a hosted project through the
# Supabase CLI and Management API; this one never does. There is no --env flag and no fallback:
# the target is the one self-hosted VM below, or the script refuses and exits non-zero.
#
# Usage:
#   scripts/selfhosted/deploy-functions.sh [fn]        deploy all functions (or one) + router, restart functions
#   scripts/selfhosted/deploy-functions.sh --from-commit <sha> [fn]   deploy exactly that commit (must be on main)
#   scripts/selfhosted/deploy-functions.sh --from-main-tip [--lock-wait S]   what a landing runs: wait for the
#                                       TEST deploy lock, then deploy main's tip read under it
#                                       (--clear-dead-lock also clears a lock whose owner is provably dead; landings pass it)
#   scripts/selfhosted/deploy-functions.sh --setup     one-time: functions.env + env_file stanza in the override
#   scripts/selfhosted/deploy-functions.sh --secrets   push function secrets from the Mac secrets file
#                                                      (refuses when the server holds names the Mac file lacks, P1602)
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
# One upload path per run, so two deploys at once never extract each other's bundle (review).
REMOTE_TGZ="/tmp/cp-functions-$$-$(date +%s).tgz"
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

# P1612: ancestry guard, TEST deploy lock, server manifest, post-deploy probe.
# shellcheck source=lib/deploy-guard.sh
source "$SCRIPT_DIR/lib/deploy-guard.sh"

MODE="deploy"
FUNCTION_NAME=""
FROM_COMMIT=""; FROM_MAIN_TIP=0; LOCK_WAIT=0; CLEAR_DEAD_LOCK=0; RECORD_LANDING=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from-commit) [ $# -ge 2 ] || die "--from-commit needs a commit"; FROM_COMMIT="$2"; shift ;;
    --from-commit=*) FROM_COMMIT="${1#--from-commit=}" ;;
    --from-main-tip) FROM_MAIN_TIP=1 ;;
    --clear-dead-lock) CLEAR_DEAD_LOCK=1 ;;
    --record-landing) [ $# -ge 2 ] || die "--record-landing needs the landed sha"; RECORD_LANDING="$2"; shift ;;
    --lock-wait) [ $# -ge 2 ] || die "--lock-wait needs seconds"; LOCK_WAIT="$2"; shift ;;
    --setup) MODE="setup" ;;
    --secrets) MODE="secrets" ;;
    --check-secrets) MODE="check-secrets" ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --env|--env=*|--project-ref|--project-ref=*)
      die "$1 is a hosted-target flag. This script only deploys to $EXPECTED_URL; use scripts/deploy-functions.sh for hosted." ;;
    -*) die "unknown flag: $1" ;;
    *) FUNCTION_NAME="$1" ;;
  esac
  shift
done

# --- --from-commit: ship exactly one commit, extracted here (P1612) ---
# The commit is checked against main by the same guard as any other source, and the files come from
# `git archive`, never from a working tree. No file written by a caller can change what is shipped.
EXTRACT_DIR=""
STAGE=""
SRC_REPO="$PROJECT_DIR"
cleanup() {
  local rc=$?
  # A landing's failure record is written HERE, before the lock is released, so the record and the
  # lock hand-over cannot interleave with the next deploy's result.
  if [ -n "${RECORD_LANDING:-}" ] && [ "$rc" -ne 0 ]; then
    printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$RECORD_LANDING" "$rc" "$(dg_land_failed_file "$SRC_REPO" | sed 's/\.failed$/.log/')" > "$(dg_land_failed_file "$SRC_REPO")" 2>/dev/null || true
  fi
  dg_lock_release; rm -rf ${STAGE:+"$STAGE"} ${EXTRACT_DIR:+"$EXTRACT_DIR"}; }
trap cleanup EXIT
case "$LOCK_WAIT" in ''|*[!0-9]*) die "--lock-wait needs a whole number of seconds" ;; esac
[ "$MODE" = deploy ] || { [ -z "$FROM_COMMIT" ] && [ "$FROM_MAIN_TIP" = 0 ]; } || die "--from-commit and --from-main-tip only apply to a deploy"
{ [ -z "$FROM_COMMIT" ] || [ "$FROM_MAIN_TIP" = 0 ]; } || die "use --from-commit or --from-main-tip, not both"
if [ -n "$FROM_COMMIT" ] || [ "$FROM_MAIN_TIP" = 1 ]; then
  git -C "$SRC_REPO" rev-parse --git-dir >/dev/null 2>&1 || die "--from-commit and --from-main-tip need to run inside a git checkout"
  if [ "$FROM_MAIN_TIP" = 1 ]; then
    # A landing deploys main as it is NOW, read under the lock, not the commit that triggered it:
    # by the time the lock is free that commit may be several landings old.
    dg_lock_acquire "$SRC_REPO" "$LOCK_WAIT" "$CLEAR_DEAD_LOCK" || exit 1
    FROM_COMMIT="$(git -C "$SRC_REPO" rev-parse --verify -q "$DG_MAIN_REF^{commit}")" || die "cannot read main. Nothing was deployed."
  else
    FROM_COMMIT="$(git -C "$SRC_REPO" rev-parse --verify -q "$FROM_COMMIT^{commit}")" || die "not a commit: $FROM_COMMIT"
    git -C "$SRC_REPO" merge-base --is-ancestor "$FROM_COMMIT" "$DG_MAIN_REF" 2>/dev/null ||
      die "$FROM_COMMIT is not on main: --from-commit only ships commits that are. Nothing was deployed."
  fi
  EXTRACT_DIR="$(mktemp -d)"
  git -C "$SRC_REPO" archive "$FROM_COMMIT" -- supabase/functions supabase/selfhosted/functions-main supabase/no-verify-jwt-functions.txt |
    tar -x -C "$EXTRACT_DIR" || die "could not extract $FROM_COMMIT. Nothing was deployed."
  FUNCTIONS_DIR="$EXTRACT_DIR/supabase/functions"
  ROUTER_SRC="$EXTRACT_DIR/supabase/selfhosted/functions-main/index.ts"
  OPEN_LIST="$EXTRACT_DIR/supabase/no-verify-jwt-functions.txt"
fi

# --- Refuse unless the target is the self-hosted host ---
[ -f "$MAC_ENV" ] || die "$MAC_ENV not found: cannot confirm the target identity. Nothing was deployed."
mac_url="$(grep '^SUPABASE_URL=' "$MAC_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
[ "$mac_url" = "$EXPECTED_URL" ] || die "SUPABASE_URL in $MAC_ENV is not $EXPECTED_URL (found: ${mac_url:-empty}). Refusing; nothing was deployed."
# Homebrew installs gcloud outside the default PATH of non-login shells.
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
command -v gcloud >/dev/null 2>&1 || die "gcloud not found"
dg_deadline "${DG_GCLOUD_DEADLINE:-30}" gcloud auth print-access-token >/dev/null 2>&1 || die "gcloud login expired: run 'gcloud auth login', then re-run. Nothing was deployed."
[ -f "$ROUTER_SRC" ] || die "router source not found: $ROUTER_SRC"
[ -f "$OPEN_LIST" ] || die "JWT policy list not found: $OPEN_LIST"
[ -d "$FUNCTIONS_DIR" ] || die "functions dir not found: $FUNCTIONS_DIR"
# A bare function name only: "../x" would copy a directory from outside supabase/functions.
if [ -n "$FUNCTION_NAME" ] && ! [[ "$FUNCTION_NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  die "not a function name: $FUNCTION_NAME"
fi
if [ -n "$FUNCTION_NAME" ] && [ ! -d "$FUNCTIONS_DIR/$FUNCTION_NAME" ]; then
  die "function directory not found: $FUNCTIONS_DIR/$FUNCTION_NAME"
fi

GCLOUD_COMMON=(--project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet)
# gcloud's stderr is noisy (numpy, TCP-window and WARNING lines). It is filtered through a temp file,
# not process substitution, so the script also runs where /dev/fd is unavailable.
# Every gcloud call has a hard deadline (dg_deadline, perl alarm): a hung tunnel must not hold a
# landing, a lock, or /day forever. DG_GCLOUD_DEADLINE overrides all of them (tests).
gcloud_quiet_err() { # deadline-seconds command...; exit status is the command's, 124 on timeout
  local secs="${DG_GCLOUD_DEADLINE:-$1}" e rc=0; shift
  e="$(mktemp)"
  dg_deadline "$secs" "$@" 2>"$e" || rc=$?
  # stderr is shown whether it finished or was killed, so a hang still says what gcloud printed.
  grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' "$e" >&2 || true
  rm -f "$e"
  [ "$rc" -ne 124 ] || echo "ERROR: a gcloud call timed out after ${secs}s and was stopped." >&2
  return "$rc"
}
vm_ssh() { gcloud_quiet_err 120 gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command "$1"; }
vm_scp() { gcloud_quiet_err 240 gcloud compute scp "${GCLOUD_COMMON[@]}" "$1" "$VM:$2"; }

# Run a script read from stdin as root on the VM. Callers use QUOTED heredocs, so nothing in the
# remote script is expanded locally; the two path constants are prepended instead.
vm_run() {
  { printf 'STACK_DIR=%q\nFUNCTIONS_VOL=%q\nREMOTE_TGZ=%q\n' "$STACK_DIR" "$FUNCTIONS_VOL" "$REMOTE_TGZ"; cat; } |
    gcloud_quiet_err 420 gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command 'sudo bash -s'
}

# Names the function code reads, minus the SUPABASE_* built-ins the compose file provides.
secret_names() {
  "$CHECK_SECRETS" --parse-only | awk -F': ' '
    /^REQUIRED|^OPTIONAL/ { n = split($2, a, " "); for (i = 1; i <= n; i++) print $1 ":" a[i] }' |
    awk -F: '{ if ($2 !~ /^SUPABASE_/) print }' | sort -u
}

# Names the Mac secrets file really populates (P1602). Rule: accept only plain, unambiguous forms and
# refuse everything else, instead of imitating Compose's env parser. Per line (CR stripped):
#   blank / "# ..." line        skipped
#   KEY=                        empty (not populated); so are KEY=<spaces>, KEY="" and KEY=''
#   KEY=word                    populated; no spaces, quotes, $ or backslash (a '#' right after '=' is data)
#   KEY="text"                  populated when text is not blank and holds no quote, $ or backslash
#   KEY='text'                  populated when text is not blank and holds no single quote (JSON, $, " and \ are fine)
#   anything else (trailing # comment, spaces, $, backslash, export, ...)   BAD
# A key that appears twice is BAD (the last one wins in Compose, so a later blank would erase an earlier value).
# Output: N:KEY for populated names, and BAD once if any line was refused.
mac_populated_names() {
  local line="" key="" val="" bad=0 seen="|"
  local inner="" q="'"
  local plain='^[^[:space:]"'"$q"'$\\]+$' dq='^"[^"$\\]*"$'
  local sq="^${q}[^${q}]*${q}\$"   # single quotes: nothing expands, so $, " and backslashes are plain data
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#.*)?$ ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
      case "$seen" in *"|$key|"*) bad=1; continue ;; esac
      seen="$seen$key|"
      if [[ "$val" =~ ^[[:space:]]*$ ]] || [ "$val" = '""' ] || [ "$val" = "''" ]; then
        :
      elif [[ "$val" =~ $plain ]]; then
        printf 'N:%s\n' "$key"
      elif [[ "$val" =~ $dq ]] || [[ "$val" =~ $sq ]]; then
        inner="${val:1:${#val}-2}"
        [[ "$inner" =~ ^[[:space:]]*$ ]] || printf 'N:%s\n' "$key"
      else
        bad=1
      fi
    else
      bad=1
    fi
  done < "$1"
  [ "$bad" -eq 0 ] || echo "BAD"
  return 0
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
    if grep -q -i -E '^SUPABASE_' "$MAC_FN_ENV"; then
      die "$MAC_FN_ENV defines SUPABASE_* names; those come from the compose file and must not be overridden."
    fi
    mac_parsed="$(mac_populated_names "$MAC_FN_ENV")"
    have="$(printf '%s\n' "$mac_parsed" | sed -n 's/^N://p' | sort -u)"
    if [ "$MODE" = "secrets" ] && printf '%s\n' "$mac_parsed" | grep -qx 'BAD'; then
      die "$MAC_FN_ENV has a line that is not plain KEY=value (an 'export', spaces around '=', or stray text). Fix it, then re-run. Nothing was changed."
    fi
  fi
  missing_required=""; missing_optional=""
  while IFS=: read -r cls name; do
    [ -n "$name" ] || continue
    if ! grep -qxF "$name" <<< "$have"; then
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
  # P1602: --secrets REPLACES the server's whole functions.env. Refuse when the server holds names the
  # Mac file lacks (2026-11-02: a 3-line Mac copy wiped the voice, Mirror and storage secrets). Names
  # only, never values. No bypass flag: to drop a secret on purpose, remove it on the server first.
  # The remote script is read into a variable first: bash 3.2 (the Mac) mis-parses a heredoc that
  # contains ')' inside $( ).
  IFS= read -r -d '' LIST_SCRIPT <<'REMOTE' || true
set -euo pipefail
f="$STACK_DIR/functions.env"
if [ ! -e "$f" ] && [ ! -L "$f" ]; then echo "P1602:NONE"; exit 0; fi
[ -f "$f" ] && [ -r "$f" ] || { echo "functions.env exists but is not a readable file" >&2; exit 1; }
line=""
content="$(cat "$f")"   # a read failure aborts here (set -e); it is never turned into an empty listing
echo "P1602:BEGIN"
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  if [[ "$line" =~ ^[[:space:]]*$ ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then continue; fi
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
    echo "P1602:NAME:${BASH_REMATCH[1]}"
  else
    echo "P1602:UNPARSEABLE"   # a line we cannot attribute to a name: the caller refuses
  fi
done <<< "$content"
echo "P1602:END"
REMOTE
  server_out="$(printf '%s\n' "$LIST_SCRIPT" | vm_run)" || die "could not read the secret NAMES on the server; refusing to replace its functions.env. Nothing was changed."
  # Only exact protocol lines count (noise such as a login banner is ignored). Names cannot contain ':',
  # so a secret can never be mistaken for a marker.
  tagged="$(printf '%s\n' "$server_out" | tr -d '\r' | sed -n '/^P1602:/p')"
  server_names=""
  if [ "$tagged" = "P1602:NONE" ]; then
    :
  elif [ "$(printf '%s\n' "$tagged" | sed -n '1p')" = "P1602:BEGIN" ] && [ "$(printf '%s\n' "$tagged" | sed -n '$p')" = "P1602:END" ] \
    && [ "$(printf '%s\n' "$tagged" | grep -c -x -e 'P1602:BEGIN' -e 'P1602:END')" = 2 ] \
    && ! printf '%s\n' "$tagged" | sed '1d;$d' | grep -q -v -E '^P1602:(NAME:[A-Za-z_][A-Za-z0-9_]*|UNPARSEABLE)$'; then
    if printf '%s\n' "$tagged" | grep -qx 'P1602:UNPARSEABLE'; then
      die "the server's functions.env has a line this script cannot read as KEY=value (an 'export', leading space, spaces around '=' or stray text), so it cannot tell which secrets would be lost; refusing. Normalise that file on the server, then re-run. Nothing was changed."
    fi
    server_names="$(printf '%s\n' "$tagged" | sed -n 's/^P1602:NAME://p' | sort -u)"
  else
    die "unexpected answer while listing the server's secret names; refusing to replace its functions.env. Nothing was changed."
  fi
  would_lose=""
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    grep -qxF "$n" < <(printf '%s\n' "$have") || would_lose="$would_lose $n"
  done <<< "$server_names"
  if [ -n "$would_lose" ]; then
    echo "REFUSED: the server's functions.env holds secret names that $MAC_FN_ENV does not (names only):${would_lose}" >&2
    die "--secrets replaces the whole server file and would delete these. Add them to the Mac file, or remove them on the server on purpose, then re-run. Nothing was changed."
  fi
  # P1602: keep a dated copy beside the live file (same mode) before anything is replaced; print its NAME only.
  vm_run <<'REMOTE' || die "could not back up the server's functions.env; nothing was replaced."
set -euo pipefail
f="$STACK_DIR/functions.env"
if [ -f "$f" ]; then
  b="functions.env.bak-$(date +%Y%m%d-%H%M%S)"
  # Exclusive create: a backup with this name (same second, earlier run) is never overwritten, we fail instead.
  if [ -e "$STACK_DIR/$b" ] || [ -L "$STACK_DIR/$b" ]; then echo "backup $b already exists; not overwriting" >&2; exit 1; fi
  (umask 177; set -C; cat "$f" > "$STACK_DIR/$b")
  chmod 600 "$STACK_DIR/$b"
  cmp -s "$f" "$STACK_DIR/$b" || { echo "backup $b does not match the live file" >&2; exit 1; }
  echo "P1602_BACKUP $b"
fi
REMOTE
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

# P1612: what is being deployed, and is it allowed to replace what is on the server?
SRC_BRANCH=""
git -C "$SRC_REPO" rev-parse --git-dir >/dev/null 2>&1 || die "$SRC_REPO is not a git checkout: cannot compare against main. Nothing was deployed."
SRC_REF="${FROM_COMMIT:-HEAD}"
dg_guard_begin "$SRC_REPO" "$SRC_REF" || exit 1
SRC_COMMIT="$(git -C "$SRC_REPO" rev-parse "$SRC_REF^{commit}")"
if [ -n "$FROM_COMMIT" ]; then SRC_BRANCH="main"; else SRC_BRANCH="$(git -C "$SRC_REPO" symbolic-ref --short -q HEAD || echo detached)"; fi
SRC_DIRTY=0
if [ -z "$FROM_COMMIT" ] && [ -n "$(git -C "$SRC_REPO" status --porcelain -- "${DG_INPUT_PATHS[@]}")" ]; then SRC_DIRTY=1; fi
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
# One rule for what ships, shared with the drift check (dg_is_deployed_path): drops tests, dotfiles
# such as .DS_Store, and anything else the rule excludes, so a checkout deploy and main agree.
( cd "$STAGE/functions" && find . -type f | sed 's|^\./||' ) | while IFS= read -r rel; do
  dg_is_deployed_path "$rel" || rm -f "$STAGE/functions/$rel"
done
# P1563: every function's deno.json points at the shared import map and lock one level up.
for f in deno.json deno.lock; do
  [ -f "$FUNCTIONS_DIR/$f" ] || die "shared $f not found in $FUNCTIONS_DIR"
  cp "$FUNCTIONS_DIR/$f" "$STAGE/functions/$f"
done
mkdir -p "$STAGE/functions/main"
cp "$ROUTER_SRC" "$STAGE/functions/main/index.ts"
cp "$OPEN_LIST" "$STAGE/functions/main/no-verify-jwt-functions.txt"
# A full deploy marks itself so the VM prunes functions deleted or renamed in git (they stay routable otherwise).
[ -n "$FUNCTION_NAME" ] || : > "$STAGE/functions/.full-deploy"

dg_manifest_fragment "$STAGE" "$SRC_COMMIT" "$SRC_BRANCH" "$SRC_DIRTY"

TARBALL="$STAGE/functions.tgz"
COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGE/functions" -czf "$TARBALL" .
echo "Deploying ${#copy_set[@]} function dir(s) + router to $VM ($EXPECTED_URL)..."
vm_scp "$TARBALL" "$REMOTE_TGZ"

vm_run <<'REMOTE'
set -euo pipefail
cd "$STACK_DIR"
[ -f functions.env ] || { echo "functions.env missing: run scripts/selfhosted/deploy-functions.sh --setup" >&2; exit 1; }
grep -q 'functions.env' docker-compose.override.yml || { echo "override has no functions env_file: run --setup" >&2; exit 1; }
W=$(mktemp -d)
tar -xzf "$REMOTE_TGZ" -C "$W"
rm -f "$REMOTE_TGZ"
mkdir -p "$FUNCTIONS_VOL"
# P1312: say whose code a directory is about to replace. Read from the manifest as it stands, before
# the merge below. Notable: another branch's code, or any deploy with uncommitted content; clean main
# is the normal case and stays quiet. Informational only: nothing here can fail the deploy.
M="$STACK_DIR/deploy-manifest.tsv"
new_branch="$(awk -F'\t' '$1 == "D" { print $4; exit }' "$W/.manifest-fragment" 2>/dev/null || true)"
announce() {
  local line br at dirty
  line="$(awk -F'\t' -v n="$1" '$1 == "D" && $2 == n { l = $0 } END { print l }' "$M" 2>/dev/null || true)"
  [ -n "$line" ] || return 0
  br="$(printf '%s' "$line" | cut -f4 | tr -d '<>|')"; at="$(printf '%s' "$line" | cut -f5)"; dirty="$(printf '%s' "$line" | cut -f6)"
  if [ "$dirty" = 1 ] || { [ "$br" != main ] && [ "$br" != "$(printf '%s' "$new_branch" | tr -d '<>|')" ]; }; then
    echo "replacing $1 deployed by $br at $at$([ "$dirty" = 1 ] && echo ', uncommitted')"
  fi
  return 0
}
FULL=0
if [ -f "$W/.full-deploy" ]; then
  FULL=1
  rm -f "$W/.full-deploy"
  for d in "$FUNCTIONS_VOL"/*/; do
    [ -d "$d" ] || continue
    n=$(basename "$d")
    [ -d "$W/$n" ] || { announce "$n"; echo "pruned: $n"; rm -rf "${FUNCTIONS_VOL:?}/$n"; }
  done
fi
for d in "$W"/*/; do
  [ -d "$d" ] || continue
  n=$(basename "$d")
  announce "$n"
  rm -rf "${FUNCTIONS_VOL:?}/$n"
  cp -R "$d" "$FUNCTIONS_VOL/$n"
done
for f in deno.json deno.lock; do cp "$W/$f" "$FUNCTIONS_VOL/$f"; done
# P1612: merge this deploy's manifest fragment. Only the entries of what this deploy replaced
# change, so a single-function deploy leaves the other functions' records as they were.
M="$STACK_DIR/deploy-manifest.tsv"; touch "$M"
names=""
for d in "$W"/*/; do [ -d "$d" ] && names="$names $(basename "$d")"; done
for f in deno.json deno.lock; do [ -f "$W/$f" ] && names="$names $f"; done
if [ "$FULL" = 1 ]; then : > "$M"; fi
awk -F'\t' -v names="$names" 'BEGIN { n = split(names, a, " "); for (i = 1; i <= n; i++) drop[a[i]] = 1 }
  { key = $2; if ($1 == "F") { split($2, parts, "/"); key = parts[1] } if (!(key in drop)) print }' "$M" > "$M.new"
cat "$W/.manifest-fragment" >> "$M.new"
mv "$M.new" "$M"
rm -rf "$W"
chown -R root:root "$FUNCTIONS_VOL"
docker compose up -d --force-recreate functions >/dev/null 2>&1
for i in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions 2>/dev/null)" = healthy ] && break
  sleep 2
done
health=$(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions 2>/dev/null || echo missing)
echo "functions container: $health"
ls "$FUNCTIONS_VOL" | tr '\n' ' '; echo
if [ "$health" != healthy ]; then
  docker logs --tail 30 supabase-edge-functions 2>&1 || true
  echo "FAILED: functions container is $health after 60s" >&2
  exit 1
fi
REMOTE
# P1612: a healthy container says nothing about whether each worker can start. OPTIONS passes the
# router's JWT check and reaches worker creation, so every function on the server is asked, not only
# the target: a changed _shared breaks functions that were not deployed. The anon key goes to curl
# on stdin (never argv) and is never printed.
anon="$(grep '^ANON_KEY=' "$MAC_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
[ -n "$anon" ] || die "ANON_KEY missing from $MAC_ENV: cannot probe the functions. They ARE deployed, but unverified."
fn_list="$(vm_ssh "find $FUNCTIONS_VOL -mindepth 1 -maxdepth 1 -type d -exec basename {} \\;" | grep -v -x -e _shared -e main | sort)" \
  || die "could not list functions on the server for the post-deploy probe. They ARE deployed, but unverified."
[ -n "$fn_list" ] || die "no functions found on the server for the post-deploy probe."
probe_failed=""; probe_2xx=0; probe_n=0
for fn in $fn_list; do
  probe_n=$((probe_n + 1))
  status="$(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$anon" "$anon" |
    curl -K - -s -m 30 -o /dev/null -w '%{http_code}' -X OPTIONS "$EXPECTED_URL/functions/v1/$fn" 2>/dev/null)" || status=000
  echo "probe: $fn answered $status"
  if dg_response_alive "$status"; then
    case "$status" in 2??) probe_2xx=$((probe_2xx + 1)) ;; esac
  else
    probe_failed="$probe_failed $fn($status)"
  fi
done
if [ -n "$probe_failed" ]; then
  echo "FAILED: these functions did not answer an OPTIONS probe cleanly (status in brackets):$probe_failed" >&2
  echo "The files ARE on the server. A function that cannot boot is usually a broken import or a stale _shared." >&2
  exit 1
fi
if [ "$probe_2xx" -eq 0 ]; then
  echo "FAILED: no function answered 2xx to OPTIONS, so the probe may not be reaching workers at all (gateway key?). Treating as failed." >&2
  exit 1
fi
echo "probe: all $probe_n functions answered OPTIONS"
# A deploy of main's own content (clean checkout at main's tip, or --from-*) supersedes a failed
# landing deploy; a branch's deploy does not.
if [ "$SRC_DIRTY" = 0 ] && [ "$SRC_COMMIT" = "$(git -C "$SRC_REPO" rev-parse "$DG_MAIN_REF^{commit}" 2>/dev/null)" ]; then
  rm -f "$(dg_land_failed_file "$SRC_REPO")"
fi
echo "Deployed. Self-hosted only: no hosted project, Management API or deploy manifest was touched."
