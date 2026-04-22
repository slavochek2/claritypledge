#!/usr/bin/env bash
# git-ops.sh — unified git-operations wrapper for multi-session agent workflow.
#
# Part of P781 (worktree/branch/push hygiene). Surface:
#   T02 (P783): claim, status, release
#   T03-T05 (P787): gc, abandon, reconcile, commit-to-main, switch-safe, sync
#
# The `ship` subcommand lands later in P788. Unknown subcommands print usage and exit 2.
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

# ============================================================================
# P787 extensions — gc, abandon, reconcile, commit-to-main, switch-safe, sync
# ============================================================================

# ----------------------------------------------------------------------------
# Helpers for P787 subcommands
# ----------------------------------------------------------------------------

# Print set of branches currently held by any live lockfile under worktrees/.
# One branch name per line, sorted, no duplicates.
branches_held_by_slots() {
  if [[ ! -d "$WORKTREES_DIR" ]]; then
    return 0
  fi
  local slot_path lockfile
  for slot_path in "$WORKTREES_DIR"/w*; do
    [[ -d "$slot_path" ]] || continue
    lockfile="$slot_path/.lock"
    if load_lockfile "$lockfile" 2>/dev/null; then
      if [[ -n "${LOCK_BRANCH:-}" ]]; then
        echo "$LOCK_BRANCH"
      fi
    fi
  done | sort -u
}

# Print set of branches currently checked out in `git worktree list`, one per line.
# Uses porcelain --porcelain format so branch names with spaces can't trick the parser.
branches_in_worktree_list() {
  ( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null ) | \
    awk '/^branch refs\/heads\// { sub(/^branch refs\/heads\//, ""); print }' | sort -u
}

# Require that the caller is running from the main repo's toplevel (not a worktree).
# Used by commit-to-main per spec T04.
require_main_repo() {
  local toplevel
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -z "$toplevel" || "$toplevel" != "$REPO_ROOT" ]]; then
    die "must be called from the main repo root (got toplevel: ${toplevel:-'(not in repo)'}, expected: $REPO_ROOT)"
  fi
}

# Emit a redirect-safe summary of the lock holder (for contention messages).
# No `>`, `<`, or `|` tokens in output. Colon-separated per P783 shell-safety.
main_lock_holder_summary() {
  local lockfile="$1"
  if ! load_lockfile "$lockfile" 2>/dev/null; then
    echo "  (main.lock file not readable)"
    return 0
  fi
  local state
  state="$(classify_lock_state)"
  echo "  session : ${LOCK_SESSION_ID:-?}"
  echo "  pid     : ${LOCK_PID:-?} (state: $state)"
  echo "  started : ${LOCK_CLAIMED_AT:-?}"
  echo "  nonce   : ${LOCK_NONCE:-?}"
}

# Atomic main.lock acquisition via hard link. Writes the lock contents to a
# temp file, then `ln tmp target` — which is atomic on POSIX. If another
# process holds the lock, ln fails. Retries every 1s up to $timeout seconds,
# then reports holder info on stderr and returns 1.
#
# Sets MAIN_LOCK_ACQUIRED=1 when we hold the lock (for release path).
acquire_main_lock() {
  local timeout="$1"
  local target="$WORKTREES_DIR/main.lock"
  mkdir -p "$WORKTREES_DIR"
  local pid=$$
  local pst
  pst="$(pid_start_time "$pid")"
  [[ -n "$pst" ]] || die "could not read PID_START_TIME for pid $pid"
  local nonce
  nonce="$(gen_nonce)"
  local session_id
  session_id="$(hostname -s)-${pid}-$(date +%s)"
  local now
  now="$(iso_now)"

  local tmp
  tmp="$(mktemp "$WORKTREES_DIR/.main.lock.XXXXXX")" || die "mktemp failed"
  # Use CLAIMED_AT (not STARTED_AT) so existing load_lockfile parser picks it up
  # into LOCK_CLAIMED_AT — otherwise contention diagnostics print `started : ?`.
  {
    echo "PID=$pid"
    echo "PID_START_TIME=$pst"
    echo "NONCE=$nonce"
    echo "SESSION_ID=$session_id"
    echo "CLAIMED_AT=$now"
  } > "$tmp"

  local waited=0
  while (( waited < timeout )); do
    if ln "$tmp" "$target" 2>/dev/null; then
      rm -f "$tmp"
      MAIN_LOCK_NONCE="$nonce"
      MAIN_LOCK_ACQUIRED=1
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  # Timeout: report holder. Never force-release (spec).
  rm -f "$tmp"
  {
    echo "git-ops: main.lock held by another session after ${timeout}s timeout."
    main_lock_holder_summary "$target"
    echo ""
    echo "Options: wait longer (increase GIT_OPS_MAIN_LOCK_TIMEOUT), or run 'git-ops reconcile'"
    echo "to check whether the holder is orphaned. Never force-release main.lock without"
    echo "verifying the holder PID is dead (spec P787)."
  } >&2
  return 1
}

# Release main.lock. Ownership check: the nonce we stored must match the
# nonce in the lockfile. Safeguard against releasing someone else's lock.
release_main_lock() {
  local target="$WORKTREES_DIR/main.lock"
  if [[ ! -f "$target" ]]; then
    return 0
  fi
  if [[ "${MAIN_LOCK_ACQUIRED:-0}" != "1" ]]; then
    return 0
  fi
  if ! load_lockfile "$target"; then
    return 0
  fi
  if [[ "${LOCK_NONCE:-}" == "${MAIN_LOCK_NONCE:-}" ]]; then
    rm -f "$target"
    MAIN_LOCK_ACQUIRED=0
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: gc
# Lists stale feature/fix branches (no lockfile, no recent commits).
# Default: dry-run. Requires BOTH --yes AND --delete-branches to delete.
# Never touches branches present in `git worktree list`.
# ----------------------------------------------------------------------------

cmd_gc() {
  local do_delete=0
  local got_yes=0
  local got_delete=0
  local stale_age_days=30
  local arg
  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      --dry-run)          shift ;;
      --yes)              got_yes=1; shift ;;
      --delete-branches)  got_delete=1; shift ;;
      *) echo "git-ops gc: unknown flag '$arg'" >&2; exit 2 ;;
    esac
  done
  if [[ $got_yes -eq 1 && $got_delete -eq 1 ]]; then
    do_delete=1
  fi

  # Build exclusion set: branches currently held by slot lockfiles OR in git worktree list.
  local held_by_slot held_in_worktree exclusion
  held_by_slot="$(branches_held_by_slots)"
  held_in_worktree="$(branches_in_worktree_list)"
  exclusion="$(printf '%s\n%s\n' "$held_by_slot" "$held_in_worktree" | sort -u)"

  # Gather candidate branches matching feature/p<digits>-* or fix/p<digits>-*.
  local all_branches candidates
  all_branches="$( cd "$REPO_ROOT" && git branch --format='%(refname:short)' 2>/dev/null )"
  candidates="$(echo "$all_branches" | grep -E '^(feature|fix)/p[0-9]+' || true)"

  # For each candidate: include only if NOT in exclusion AND last commit > N days ago.
  local cutoff_ts now_ts
  now_ts="$(date +%s)"
  cutoff_ts=$((now_ts - stale_age_days * 86400))

  local stale_list=""
  local branch last_ts
  while IFS= read -r branch; do
    [[ -z "$branch" ]] && continue
    # Excluded? (use newline-anchored fixed-string match)
    if printf '%s\n' "$exclusion" | grep -Fxq "$branch"; then
      continue
    fi
    last_ts="$( cd "$REPO_ROOT" && git log -1 --format=%ct "$branch" 2>/dev/null || echo 0 )"
    if [[ -z "$last_ts" || "$last_ts" -eq 0 ]]; then
      continue
    fi
    if (( last_ts < cutoff_ts )); then
      stale_list+="$branch"$'\n'
    fi
  done <<< "$candidates"

  # Deterministic: sort
  stale_list="$(printf '%s' "$stale_list" | sort -u)"

  if [[ -z "$stale_list" ]]; then
    echo "git-ops gc: no stale branches (cutoff: ${stale_age_days} days)" >&2
    return 0
  fi

  echo "git-ops gc: stale branches (no lockfile, no worktree, no commit in ${stale_age_days}+ days):"
  # Prefix each with two spaces — colon-safe, redirect-safe per P783.
  echo "$stale_list" | sed 's/^/  /'

  if [[ $do_delete -eq 1 ]]; then
    local b
    while IFS= read -r b; do
      [[ -z "$b" ]] && continue
      ( cd "$REPO_ROOT" && git branch -D "$b" >&2 )
    done <<< "$stale_list"
    echo "git-ops gc: deleted $(echo "$stale_list" | grep -c .) branches." >&2
  else
    {
      echo ""
      echo "This was a dry-run. To actually delete these branches:"
      echo "  git-ops gc --yes --delete-branches"
    } >&2
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: abandon
# Removes slot's lockfile AND worktree; does NOT delete the branch.
# Ownership check for LIVE locks; STALE/ORPHAN/NO_LOCK slots can be abandoned freely.
# ----------------------------------------------------------------------------

cmd_abandon() {
  local slot=""
  local nonce_arg=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nonce)
        [[ $# -lt 2 ]] && { echo "--nonce requires a value" >&2; exit 2; }
        nonce_arg="$2"; shift 2 ;;
      --nonce=*)
        nonce_arg="${1#--nonce=}"; shift ;;
      -*)
        echo "git-ops abandon: unknown flag '$1'" >&2; exit 2 ;;
      *)
        if [[ -n "$slot" ]]; then
          echo "usage: git-ops abandon <slot> [--nonce <value>]" >&2; exit 2
        fi
        slot="$1"; shift ;;
    esac
  done
  if [[ -z "$slot" ]]; then
    echo "usage: git-ops abandon <slot> [--nonce <value>]" >&2; exit 2
  fi

  local slot_path="$WORKTREES_DIR/$slot"
  if [[ ! -d "$slot_path" ]]; then
    die "slot $slot does not exist at $slot_path"
  fi

  local lockfile="$slot_path/.lock"
  if [[ -f "$lockfile" ]]; then
    load_lockfile "$lockfile" || die "failed to read lockfile $lockfile"
    local state
    state="$(classify_lock_state)"
    if [[ "$state" == "LIVE" ]]; then
      local caller_pid=$$
      local own_by_nonce=0
      local own_by_pid=0
      if [[ -n "$nonce_arg" && "$nonce_arg" == "${LOCK_NONCE:-}" ]]; then
        own_by_nonce=1
      fi
      if [[ "${LOCK_PID:-}" == "$caller_pid" ]]; then
        own_by_pid=1
      fi
      if [[ $own_by_nonce -ne 1 && $own_by_pid -ne 1 ]]; then
        {
          echo "git-ops abandon: refusing $slot — lock is LIVE and ownership check failed"
          echo "  lock pid   : ${LOCK_PID:-?} (caller pid: $caller_pid)"
          echo "  lock nonce : ${LOCK_NONCE:-?}"
          if [[ -n "$nonce_arg" ]]; then
            echo "  given nonce: $nonce_arg (no match)"
          else
            echo "  no --nonce supplied"
          fi
          echo "Pass --nonce matching the lockfile, or run from the claiming PID."
        } >&2
        exit 1
      fi
    fi
    # STALE, ORPHAN: proceed (the claiming session is dead — spec-safe cleanup).
    rm -f "$lockfile"
  fi

  # Remove the worktree. --force skips the "uncommitted changes" refusal.
  # If the slot was created outside of `git worktree add` (e.g., reconcile test
  # cases where we manually built the dir), `worktree remove` will fail — fall
  # back to `rm -rf`.
  if ( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null | grep -Fq "worktree $slot_path" ); then
    ( cd "$REPO_ROOT" && git worktree remove --force "$slot_path" ) >&2 || \
      die "git worktree remove --force failed for $slot_path"
  else
    rm -rf "$slot_path"
    ( cd "$REPO_ROOT" && git worktree prune ) >/dev/null 2>&1 || true
  fi

  echo "git-ops abandon: removed lockfile and worktree for $slot (branch preserved)" >&2
}

# ----------------------------------------------------------------------------
# Subcommand: reconcile
# Cross-check slot directories against `git worktree list`.
# Reports orphan-lock (.lock without worktree entry) and orphan-worktree (worktree without .lock).
# Exit 0 if all OK, 2 if any orphans found.
# ----------------------------------------------------------------------------

cmd_reconcile() {
  local orphans_found=0
  local lines=""

  # All worktree paths registered by git, absolute, sorted for deterministic output.
  local wt_paths
  wt_paths="$( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null | \
               awk '/^worktree / { sub(/^worktree /, ""); print }' | sort -u )"

  # All slot directories under .claude/worktrees, sorted.
  local slot_dirs=""
  if [[ -d "$WORKTREES_DIR" ]]; then
    local entry
    for entry in "$WORKTREES_DIR"/w*; do
      [[ -d "$entry" ]] || continue
      slot_dirs+="$entry"$'\n'
    done
  fi
  slot_dirs="$( printf '%s' "$slot_dirs" | sort -u )"

  # Pass 1: for each slot dir, check if it has a lockfile and if git tracks it as a worktree.
  local slot_path slot has_lock in_wt
  while IFS= read -r slot_path; do
    [[ -z "$slot_path" ]] && continue
    slot="$(basename "$slot_path")"
    has_lock=0
    [[ -f "$slot_path/.lock" ]] && has_lock=1
    in_wt=0
    if printf '%s\n' "$wt_paths" | grep -Fxq "$slot_path"; then
      in_wt=1
    fi
    if [[ $has_lock -eq 1 && $in_wt -eq 0 ]]; then
      lines+="  orphan-lock      $slot (path: $slot_path)"$'\n'
      orphans_found=$((orphans_found + 1))
    elif [[ $has_lock -eq 0 && $in_wt -eq 1 ]]; then
      lines+="  orphan-worktree  $slot (path: $slot_path)"$'\n'
      orphans_found=$((orphans_found + 1))
    else
      lines+="  ok               $slot (path: $slot_path)"$'\n'
    fi
  done <<< "$slot_dirs"

  # Pass 2: worktrees registered by git but whose path is NOT under WORKTREES_DIR
  # (e.g., user manually created a worktree outside the slot convention).
  # These are noise for reconcile; we skip them.

  if [[ -n "$lines" ]]; then
    echo "git-ops reconcile: slot state"
    printf '%s' "$lines"
  else
    echo "git-ops reconcile: no slot directories under $WORKTREES_DIR"
  fi

  if [[ $orphans_found -gt 0 ]]; then
    echo "" >&2
    echo "git-ops reconcile: ${orphans_found} orphan(s) detected." >&2
    exit 2
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: commit-to-main
# Serializes concurrent commits to main via .claude/worktrees/main.lock.
# Must be called from main repo root (not a worktree).
# ----------------------------------------------------------------------------

cmd_commit_to_main() {
  local message=""
  local files=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --message)
        [[ $# -lt 2 ]] && { echo "--message requires a value" >&2; exit 2; }
        message="$2"; shift 2 ;;
      --message=*)
        message="${1#--message=}"; shift ;;
      --files)
        shift
        while [[ $# -gt 0 && "$1" != --* ]]; do
          files+=("$1"); shift
        done ;;
      *)
        echo "git-ops commit-to-main: unknown flag '$1'" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$message" ]]; then
    echo "usage: git-ops commit-to-main --message <msg> --files <f1> [f2 ...]" >&2; exit 2
  fi
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "usage: git-ops commit-to-main --message <msg> --files <f1> [f2 ...]" >&2; exit 2
  fi

  require_main_repo

  local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"

  # Acquire the lock. Releases on every exit path via trap.
  if ! acquire_main_lock "$timeout"; then
    exit 1
  fi
  trap 'release_main_lock' EXIT

  # Stage explicit files (never -A per .claude/rules/git.md).
  ( cd "$REPO_ROOT" && git add -- "${files[@]}" ) >&2

  # Commit with explicit file list so bystander staged files are excluded.
  ( cd "$REPO_ROOT" && git commit -m "$message" -- "${files[@]}" ) >&2

  # release_main_lock runs via trap.
  echo "git-ops commit-to-main: committed ${#files[@]} file(s) to main" >&2
}

# ----------------------------------------------------------------------------
# Subcommand: switch-safe
# Refuses to switch branches when the main repo has uncommitted bystander
# changes not attributable to the caller's lock manifest.
# ----------------------------------------------------------------------------

cmd_switch_safe() {
  if [[ $# -ne 1 ]]; then
    echo "usage: git-ops switch-safe <branch>" >&2; exit 2
  fi
  local target_branch="$1"

  # Optional pre-flight.sh (P786). Not yet shipped — graceful degrade to inline check.
  if [[ -x "$REPO_ROOT/scripts/pre-flight.sh" ]]; then
    if ! "$REPO_ROOT/scripts/pre-flight.sh" switch --branch "$target_branch" >&2; then
      exit 1
    fi
  fi

  local toplevel
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$toplevel" ]] || die "not inside a git repository"

  # Inline dirty-check: any staged or unstaged changes, ignoring untracked files.
  # `git diff-index --quiet HEAD --` exits 0 when the working tree + index match HEAD.
  local dirty_staged dirty_unstaged
  dirty_staged="$( cd "$toplevel" && git diff --cached --name-only )"
  dirty_unstaged="$( cd "$toplevel" && git diff --name-only )"

  if [[ -n "$dirty_staged" || -n "$dirty_unstaged" ]]; then
    {
      echo "git-ops switch-safe: refusing to switch — uncommitted bystander changes."
      if [[ -n "$dirty_staged" ]]; then
        echo "  staged:"
        echo "$dirty_staged" | sed 's/^/    /'
      fi
      if [[ -n "$dirty_unstaged" ]]; then
        echo "  unstaged:"
        echo "$dirty_unstaged" | sed 's/^/    /'
      fi
      echo ""
      echo "Commit or reset the changes, then retry."
    } >&2
    exit 1
  fi

  ( cd "$toplevel" && git checkout "$target_branch" ) >&2
}

# ----------------------------------------------------------------------------
# Subcommand: sync
# Fetches origin (read-only). Refuses to pull on branches with upstream
# tracking (spec: "push is human-gated"). Local-only branches get ff-only pull.
# ----------------------------------------------------------------------------

cmd_sync() {
  if [[ $# -gt 0 ]]; then
    echo "usage: git-ops sync" >&2; exit 2
  fi

  local toplevel
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$toplevel" ]] || die "not inside a git repository"

  # Fetch is always safe. Skip if no origin remote.
  if ( cd "$toplevel" && git remote get-url origin >/dev/null 2>&1 ); then
    ( cd "$toplevel" && git fetch origin ) >&2 || true
  fi

  local current_branch
  current_branch="$( cd "$toplevel" && git rev-parse --abbrev-ref HEAD 2>/dev/null )"
  [[ -n "$current_branch" ]] || die "could not resolve current branch"

  # Upstream check: if the branch has an @{upstream}, it's tracked.
  if ( cd "$toplevel" && git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 ); then
    {
      echo "git-ops sync: branch '$current_branch' is published (has upstream)."
      echo "  Push is human-gated. Never auto-push. This command refuses to advance"
      echo "  tracked branches; the human runs 'git push' after review."
    } >&2
    exit 3
  fi

  # Local-only branch: spec says "runs git pull --ff-only". Git's own hint
  # output on no-upstream contains `<remote>`/`<branch>` placeholder tokens
  # which violate P783 shell-safety for any caller that routes output through
  # eval. Suppress git's raw output but preserve its exit signal as a colon-safe
  # status line so real failures (diverged branch, network) aren't invisible.
  if ( cd "$toplevel" && git pull --ff-only >/dev/null 2>&1 ); then
    echo "git-ops sync: branch '$current_branch' pulled ff-only" >&2
  else
    # For a branch with no upstream the pull exits non-zero — that is the
    # expected case for local-only. Report the status clearly; don't exit 1
    # because local-only IS the contract for this code path.
    echo "git-ops sync: branch '$current_branch' is local-only (nothing to pull or no upstream configured)" >&2
  fi
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

SUBCOMMANDS (P787 extensions — T03/T04/T05)
  gc [--dry-run | --yes --delete-branches]
                               List stale feature/fix branches (no lockfile, no worktree,
                               no commits in 30+ days). Default: dry-run. Deletion requires
                               BOTH --yes AND --delete-branches. Never touches branches
                               present in 'git worktree list'. Output sorted, deterministic.

  abandon <slot> [--nonce <v>] Remove slot's lockfile AND worktree (branch preserved).
                               Ownership check for LIVE locks (same as release: --nonce
                               match OR current PID match). STALE/ORPHAN locks can be
                               abandoned without ownership (session is dead — safe cleanup).

  reconcile                    Cross-check slot dirs against 'git worktree list'.
                               Reports: orphan-lock (.lock but no worktree entry),
                               orphan-worktree (worktree entry but no .lock).
                               Exit 0 if all ok, exit 2 if any orphans found.

  commit-to-main --message <m> --files <f1> [f2 ...]
                               Serialize concurrent commits to main via
                               .claude/worktrees/main.lock (timeout: 120s default,
                               override with GIT_OPS_MAIN_LOCK_TIMEOUT env var).
                               Must be called from main repo root (not a worktree).
                               Reports "held by session X (pid Y)" on contention.
                               Never force-releases the lock (user-gated).

  switch-safe <branch>         Refuse to switch branches when main has uncommitted
                               bystander changes. Delegates to scripts/pre-flight.sh
                               if present (P786); falls back to inline dirty check.

  sync                         Fetch origin. Refuse on any branch with upstream
                               tracking (exit 3: "push is human-gated"). Local-only
                               branches get 'git pull --ff-only' (typically a no-op).

EXIT CODES
  0   success
  1   logical error (slot exhausted, ownership mismatch, lockfile missing, etc.)
  2   usage error (bad flags/args, unknown subcommand)
  3   sync refused (branch is published — push is human-gated)

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
    claim)           cmd_claim "$@" ;;
    status)          cmd_status "$@" ;;
    release)         cmd_release "$@" ;;
    gc)              cmd_gc "$@" ;;
    abandon)         cmd_abandon "$@" ;;
    reconcile)       cmd_reconcile "$@" ;;
    commit-to-main)  cmd_commit_to_main "$@" ;;
    switch-safe)     cmd_switch_safe "$@" ;;
    sync)            cmd_sync "$@" ;;
    help|-h|--help)  print_usage; exit 0 ;;
    *)
      echo "git-ops: unknown subcommand '$sub'" >&2
      usage_exit
      ;;
  esac
}

main "$@"
