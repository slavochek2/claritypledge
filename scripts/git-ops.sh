#!/usr/bin/env bash
# git-ops.sh — unified git-operations wrapper for multi-session agent workflow.
#
# Part of P781 (worktree/branch/push hygiene). T02 scope:
#   - claim <p-number> <slug>   : allocate next free slot, create worktree+branch+lockfile
#   - status [slot]             : list all slot states, or detail a single slot
#   - release <slot>            : remove lockfile (ownership-checked); does NOT touch worktree/branch
#
# Additional subcommands (gc, abandon, reconcile, commit-to-main, switch-safe, sync, ship)
# arrive in later P781 tasks. Unknown subcommands print usage and exit 2.
#
# Lockfile identity survives PID recycling:
#   PID            — current shell PID
#   PID_START_TIME — from `ps -o lstart= -p $PID` (macOS-compatible, whitespace-trimmed)
#   NONCE          — 16 hex chars (8 random bytes) from /dev/urandom
#   SESSION_ID     — hostname-pid-epoch
#   HEARTBEAT      — ISO8601 UTC, refreshed by long-running callers (not by this script post-claim)
#
# A lock is LIVE iff the PID still exists AND `ps -o lstart=` currently matches PID_START_TIME.
# If PID exists but start time differs → STALE (the OS recycled the PID).
# If PID does not exist at all → ORPHAN.
# Slot directory with no .lock file → NO_LOCK.
#
# CALLER EVAL CONTRACT (P783 fix — see .claude/rules/shell-safety.md):
#   `claim` prints eval-safe output wrapped in #CP_CLAIM_BEGIN / #CP_CLAIM_END
#   sentinel markers. Callers MUST filter to the sentinel block before `eval`,
#   never pipe stderr into eval. Safe pattern:
#
#     eval "$(./scripts/git-ops.sh claim p1 slug 2>/tmp/claim-stderr.log \
#             | sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"
#     cat /tmp/claim-stderr.log   # human-readable summary
#
#   Unsafe (DO NOT USE — caused the P783 .env.local truncation):
#     eval "$(./scripts/git-ops.sh claim p1 slug 2>&1 1>/tmp/...)"
#   Routing stderr into eval re-lexes setup-worktree.sh output and the shell
#   parses `->` as an I/O redirect, wiping files named in the status lines.
#
# All errors go to stderr. Exit codes: 0 success, 1 logical error, 2 usage error.

set -euo pipefail

# ----------------------------------------------------------------------------
# Repo-root resolution
# ----------------------------------------------------------------------------

# Works from the main repo or any worktree. `--git-common-dir` always points at
# the main repo's .git directory; its parent is the main repo root.
resolve_repo_root() {
  local common_dir
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ -z "$common_dir" ]]; then
    echo "git-ops: not inside a git repository" >&2
    exit 1
  fi
  # Strip trailing /.git if present (it always is for --git-common-dir)
  dirname "$common_dir"
}

REPO_ROOT="$(resolve_repo_root)"
WORKTREES_DIR="$REPO_ROOT/.claude/worktrees"

# ----------------------------------------------------------------------------
# Utilities
# ----------------------------------------------------------------------------

die() {
  echo "git-ops: $*" >&2
  exit 1
}

usage_exit() {
  print_usage >&2
  exit 2
}

iso_now() {
  date -u +%FT%TZ
}

# ps -o lstart= -p PID returns e.g. "Mon Apr 21 22:34:17 2026" (macOS)
# Whitespace-trimmed so repeated runs compare cleanly.
pid_start_time() {
  local pid="$1"
  ps -o lstart= -p "$pid" 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g'
}

# 16 hex chars (8 random bytes) — 64 bits of entropy, per plan/spec.
gen_nonce() {
  head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# Returns 0 if PID exists, 1 otherwise. `kill -0` is POSIX and non-destructive.
pid_alive() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

# Parse KEY=VALUE lines from a lockfile into shell variables prefixed with LOCK_.
# Clears any prior LOCK_* state before reading.
load_lockfile() {
  local lockfile="$1"
  LOCK_PID=""; LOCK_PID_START_TIME=""; LOCK_NONCE=""; LOCK_SESSION_ID=""
  LOCK_SLOT=""; LOCK_BRANCH=""; LOCK_P_NUMBER=""; LOCK_CLAIMED_AT=""; LOCK_HEARTBEAT=""
  if [[ ! -f "$lockfile" ]]; then
    return 1
  fi
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      PID) LOCK_PID="$value" ;;
      PID_START_TIME) LOCK_PID_START_TIME="$value" ;;
      NONCE) LOCK_NONCE="$value" ;;
      SESSION_ID) LOCK_SESSION_ID="$value" ;;
      SLOT) LOCK_SLOT="$value" ;;
      BRANCH) LOCK_BRANCH="$value" ;;
      P_NUMBER) LOCK_P_NUMBER="$value" ;;
      CLAIMED_AT) LOCK_CLAIMED_AT="$value" ;;
      HEARTBEAT) LOCK_HEARTBEAT="$value" ;;
    esac
  done < "$lockfile"
  return 0
}

# Emit one of: LIVE | STALE | ORPHAN | NO_LOCK
# Callers are expected to have already called load_lockfile.
classify_lock_state() {
  if [[ -z "${LOCK_PID:-}" ]]; then
    echo "NO_LOCK"
    return
  fi
  if ! pid_alive "$LOCK_PID"; then
    echo "ORPHAN"
    return
  fi
  local now_start
  now_start="$(pid_start_time "$LOCK_PID")"
  if [[ -z "$now_start" || "$now_start" != "$LOCK_PID_START_TIME" ]]; then
    echo "STALE"
  else
    echo "LIVE"
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: claim
# ----------------------------------------------------------------------------

cmd_claim() {
  if [[ $# -ne 2 ]]; then
    echo "usage: git-ops claim <p-number> <slug>" >&2
    exit 2
  fi
  local p_number="$1"
  local slug="$2"

  # Basic slug sanity — branch names cannot contain spaces or special git chars.
  if [[ ! "$p_number" =~ ^p[0-9]+$ ]]; then
    die "p-number must match 'p<digits>' (got '$p_number')"
  fi
  if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    die "slug must be lowercase-alnum-with-dashes (got '$slug')"
  fi

  mkdir -p "$WORKTREES_DIR"

  # Find next free slot: w1, w2, ..., w99. First slot whose directory does NOT exist wins.
  local slot="" slot_path=""
  local i
  for ((i = 1; i <= 99; i++)); do
    local candidate="w$i"
    local candidate_path="$WORKTREES_DIR/$candidate"
    if [[ ! -e "$candidate_path" && ! -L "$candidate_path" ]]; then
      slot="$candidate"
      slot_path="$candidate_path"
      break
    fi
  done
  if [[ -z "$slot" ]]; then
    die "no free slot in w1..w99 — worktree ceiling reached"
  fi

  local branch="feature/${p_number}-${slug}"

  # Create worktree + branch from main repo root. `git worktree add -b` creates
  # the branch from HEAD of the current branch in REPO_ROOT; we explicitly use
  # main as the base to avoid inheriting whatever branch REPO_ROOT is on.
  (
    cd "$REPO_ROOT"
    git worktree add "$slot_path" -b "$branch" main
  ) >&2

  # Hydrate env symlinks (.env.local, node_modules, scripts, supabase/migrations).
  # setup-worktree.sh lives in the main repo's scripts/ dir.
  if [[ -x "$REPO_ROOT/scripts/setup-worktree.sh" ]]; then
    ( cd "$REPO_ROOT" && ./scripts/setup-worktree.sh "$slot_path" ) >&2
  else
    echo "git-ops: warning — scripts/setup-worktree.sh not found or not executable; env symlinks not hydrated" >&2
  fi

  # Build lockfile.
  local pid=$$
  local pst
  pst="$(pid_start_time "$pid")"
  if [[ -z "$pst" ]]; then
    die "could not read PID_START_TIME via 'ps -o lstart=' for pid $pid"
  fi
  local nonce
  nonce="$(gen_nonce)"
  local session_id
  session_id="$(hostname -s)-${pid}-$(date +%s)"
  local now
  now="$(iso_now)"

  local lockfile="$slot_path/.lock"
  {
    echo "PID=$pid"
    echo "PID_START_TIME=$pst"
    echo "NONCE=$nonce"
    echo "SESSION_ID=$session_id"
    echo "SLOT=$slot"
    echo "BRANCH=$branch"
    echo "P_NUMBER=$p_number"
    echo "CLAIMED_AT=$now"
    echo "HEARTBEAT=$now"
  } > "$lockfile"

  # Human-readable summary to stderr.
  {
    echo "git-ops: claimed $slot for $branch"
    echo "  path   : $slot_path"
    echo "  branch : $branch"
    echo "  nonce  : $nonce"
    echo "  session: $session_id"
    echo ""
    echo "To capture the nonce in the parent shell (SAFE pattern — P783):"
    echo "  eval \"\$(scripts/git-ops.sh claim $p_number $slug 2>/tmp/claim-stderr.log \\"
    echo "          | sed -n '/^#CP_CLAIM_BEGIN\$/,/^#CP_CLAIM_END\$/p' | grep -v '^#')\""
  } >&2

  # L3b (P783) — wrap the eval-safe export in sentinel markers so callers can
  # filter to exactly this block and reject any other line. Any non-sentinel
  # stdout (including accidental stderr merges) becomes inert under the safe
  # caller pattern documented in stderr above.
  echo "#CP_CLAIM_BEGIN"
  echo "export CP_LOCK_NONCE_${slot}=${nonce}"
  echo "#CP_CLAIM_END"
}

# ----------------------------------------------------------------------------
# Subcommand: status
# ----------------------------------------------------------------------------

list_slot_dirs() {
  # Emit absolute paths of slot dirs (one per line), sorted by slot number.
  # No-op if worktrees dir absent.
  if [[ ! -d "$WORKTREES_DIR" ]]; then
    return 0
  fi
  # Only wN directories (avoid stray files). We sort numerically by the trailing digits.
  local entry
  for entry in "$WORKTREES_DIR"/w*; do
    [[ -d "$entry" ]] || continue
    local base
    base="$(basename "$entry")"
    if [[ "$base" =~ ^w[0-9]+$ ]]; then
      echo "$entry"
    fi
  done | awk -F/ '{ n = $NF; sub(/^w/, "", n); print n " " $0 }' | sort -n | awk '{ $1=""; sub(/^ /, ""); print }'
}

cmd_status_single() {
  local slot="$1"
  local slot_path="$WORKTREES_DIR/$slot"
  if [[ ! -d "$slot_path" ]]; then
    die "slot $slot does not exist at $slot_path"
  fi
  local lockfile="$slot_path/.lock"
  echo "Slot:     $slot"
  echo "Path:     $slot_path"
  if ! load_lockfile "$lockfile"; then
    echo "State:    NO_LOCK"
    echo "(no .lock file present)"
    return 0
  fi
  local state
  state="$(classify_lock_state)"
  echo "State:    $state"
  echo "Branch:   ${LOCK_BRANCH:-?}"
  echo "P-Number: ${LOCK_P_NUMBER:-?}"
  echo "PID:      ${LOCK_PID:-?}"
  echo "PID start:${LOCK_PID_START_TIME:+ }${LOCK_PID_START_TIME:-?}"
  echo "Nonce:    ${LOCK_NONCE:-?}"
  echo "Session:  ${LOCK_SESSION_ID:-?}"
  echo "Claimed:  ${LOCK_CLAIMED_AT:-?}"
  echo "Heartbeat:${LOCK_HEARTBEAT:+ }${LOCK_HEARTBEAT:-?}"
}

cmd_status_table() {
  local slots
  slots="$(list_slot_dirs || true)"
  if [[ -z "$slots" ]]; then
    echo "(no slots under $WORKTREES_DIR)"
    return 0
  fi
  printf "%-6s %-45s %-8s %-8s\n" "SLOT" "BRANCH" "PID" "STATE"
  printf "%-6s %-45s %-8s %-8s\n" "----" "------" "---" "-----"
  local slot_path slot lockfile state branch pid
  while IFS= read -r slot_path; do
    [[ -z "$slot_path" ]] && continue
    slot="$(basename "$slot_path")"
    lockfile="$slot_path/.lock"
    if load_lockfile "$lockfile"; then
      state="$(classify_lock_state)"
      branch="${LOCK_BRANCH:--}"
      pid="${LOCK_PID:--}"
    else
      state="NO_LOCK"
      branch="-"
      pid="-"
    fi
    printf "%-6s %-45s %-8s %-8s\n" "$slot" "$branch" "$pid" "$state"
  done <<< "$slots"
}

cmd_status() {
  if [[ $# -eq 0 ]]; then
    cmd_status_table
  elif [[ $# -eq 1 ]]; then
    cmd_status_single "$1"
  else
    echo "usage: git-ops status [slot]" >&2
    exit 2
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: release
# ----------------------------------------------------------------------------

cmd_release() {
  local slot=""
  local nonce_arg=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nonce)
        if [[ $# -lt 2 ]]; then
          echo "--nonce requires a value" >&2
          exit 2
        fi
        nonce_arg="$2"
        shift 2
        ;;
      --nonce=*)
        nonce_arg="${1#--nonce=}"
        shift
        ;;
      -*)
        echo "unknown flag: $1" >&2
        exit 2
        ;;
      *)
        if [[ -n "$slot" ]]; then
          echo "usage: git-ops release <slot> [--nonce <value>]" >&2
          exit 2
        fi
        slot="$1"
        shift
        ;;
    esac
  done

  if [[ -z "$slot" ]]; then
    echo "usage: git-ops release <slot> [--nonce <value>]" >&2
    exit 2
  fi

  local slot_path="$WORKTREES_DIR/$slot"
  local lockfile="$slot_path/.lock"
  if [[ ! -d "$slot_path" ]]; then
    die "slot $slot does not exist at $slot_path"
  fi
  if [[ ! -f "$lockfile" ]]; then
    die "no lockfile at $lockfile — nothing to release"
  fi

  load_lockfile "$lockfile" || die "failed to read lockfile $lockfile"

  # Ownership check: --nonce match OR current-process PID match.
  local caller_pid=$$
  local own_by_nonce=0
  local own_by_pid=0
  if [[ -n "$nonce_arg" && "$nonce_arg" == "${LOCK_NONCE:-}" ]]; then
    own_by_nonce=1
  fi
  if [[ "${LOCK_PID:-}" == "$caller_pid" ]]; then
    own_by_pid=1
  fi
  if [[ "$own_by_nonce" -ne 1 && "$own_by_pid" -ne 1 ]]; then
    {
      echo "git-ops: refusing to release $slot — ownership check failed"
      echo "  lock PID  : ${LOCK_PID:-?}  (caller pid: $caller_pid)"
      echo "  lock nonce: ${LOCK_NONCE:-?}"
      if [[ -n "$nonce_arg" ]]; then
        echo "  given nonce: $nonce_arg  (no match)"
      else
        echo "  no --nonce supplied"
      fi
      echo "Pass --nonce <value> matching the lockfile, or run from the same PID that claimed it."
    } >&2
    exit 1
  fi

  rm -f "$lockfile"
  echo "git-ops: released $slot (lockfile removed, worktree/branch preserved)" >&2
}

# ----------------------------------------------------------------------------
# Help / dispatch
# ----------------------------------------------------------------------------

print_usage() {
  cat <<'EOF'
git-ops.sh — unified git-operations wrapper

SUBCOMMANDS (T02 scope)
  claim <p-number> <slug>      Allocate next free slot, create worktree+branch+lockfile
                               Stdout: `#CP_CLAIM_BEGIN` / export / `#CP_CLAIM_END` (for eval)
                               Stderr: human-readable summary
                               Caller (SAFE pattern — P783):
                                 eval "$(scripts/git-ops.sh claim p999 smoketest 2>/tmp/x.log \
                                         | sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' \
                                         | grep -v '^#')"

  status [slot]                With no arg: print table of all slots (SLOT | BRANCH | PID | STATE)
                               With slot arg: print detailed block for that slot
                               States: LIVE / STALE / ORPHAN / NO_LOCK
                                 LIVE    — PID exists AND ps lstart matches PID_START_TIME
                                 STALE   — PID exists BUT start time differs (PID recycled)
                                 ORPHAN  — PID does not exist
                                 NO_LOCK — slot directory has no .lock file

  release <slot> [--nonce <v>] Remove slot's lockfile. Ownership check: --nonce must match
                               the stored NONCE, OR current PID must match the stored PID.
                               Does NOT delete the worktree or branch.

  help | --help                Show this message.

FUTURE SUBCOMMANDS (P781 later tasks)
  gc, abandon, reconcile, commit-to-main, switch-safe, sync, ship

EXIT CODES
  0   success
  1   logical error (slot exhausted, ownership mismatch, lockfile missing, etc.)
  2   usage error (bad flags/args, unknown subcommand)

LOCKFILE FORMAT (one KEY=VALUE per line, at <slot>/.lock)
  PID, PID_START_TIME, NONCE, SESSION_ID, SLOT, BRANCH, P_NUMBER, CLAIMED_AT, HEARTBEAT

DESIGN NOTES
  * Nonce is 16 hex chars (64 bits entropy) from /dev/urandom.
  * PID recycling is detected via ps -o lstart= — stored and current strings must match.
  * claim's stdout is wrapped in #CP_CLAIM_BEGIN / #CP_CLAIM_END sentinel markers
    (P783). Callers MUST filter to that block before eval; never merge stderr
    into eval. See .claude/rules/shell-safety.md for the caller contract.
EOF
}

main() {
  if [[ $# -eq 0 ]]; then
    usage_exit
  fi
  local sub="$1"
  shift
  case "$sub" in
    claim)   cmd_claim "$@" ;;
    status)  cmd_status "$@" ;;
    release) cmd_release "$@" ;;
    help|-h|--help) print_usage; exit 0 ;;
    *)
      echo "git-ops: unknown subcommand '$sub'" >&2
      usage_exit
      ;;
  esac
}

main "$@"
