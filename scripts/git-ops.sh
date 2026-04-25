#!/usr/bin/env bash
# git-ops.sh — unified git-operations wrapper for multi-session agent workflow.
#
# Part of P781 (worktree/branch/push hygiene). Surface:
#   T02 (P783): claim, status, release
#   T03-T05 (P787): gc, abandon, reconcile, commit-to-main, switch-safe, sync
#   T06    (P788): ship — journal-based idempotent cherry-pick onto main
#
# Unknown subcommands print usage and exit 2.
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

  # Find next free slot using git's worktree registry as truth, with a strict
  # path-safety bounded auto-heal of orphan-only directories (left behind by
  # earlier `git worktree remove` cycles where a `node_modules` symlink or
  # similar untracked artifact survived).
  #
  # A slot is FREE iff:
  #   (a) not in `git worktree list` (registry says free)
  #   (b) no admin dir at $REPO_ROOT/.git/worktrees/<slot> (defends concurrent claim)
  #   (c) no live lockfile at <slot>/.lock
  #
  # If a slot is FREE per (a)+(b)+(c) but a directory exists with no `.git`
  # marker inside, it's an orphan — auto-clean. Real worktrees always have a
  # `.git` *file* at their root. `.git` presence guarantees we never delete an
  # active worktree even if it temporarily falls out of the registry.
  # awk filters by path prefix AND wN convention in one pass — no grep needed,
  # so the pipeline returns 0 lines without a non-zero exit when nothing matches
  # (avoids bash 3.2 `set -e` propagation through `var=$(... | grep)`).
  local registered_slots
  registered_slots="$(
    cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null \
      | awk -v dir="$WORKTREES_DIR/" '
          /^worktree / && index($2, dir)==1 {
            slot = $2; sub(dir, "", slot);
            if (slot ~ /^w[0-9]+$/) print slot
          }' \
      | sort -u
  )"

  local slot="" slot_path="" candidate candidate_path
  local i
  for ((i = 1; i <= 99; i++)); do
    candidate="w$i"
    candidate_path="$WORKTREES_DIR/$candidate"

    # (a) registered as a worktree?
    printf '%s\n' "$registered_slots" | grep -qx "$candidate" && continue

    # (b) admin dir present? (TOCTOU defense — git creates this before the worktree dir)
    [[ -e "$REPO_ROOT/.git/worktrees/$candidate" ]] && continue

    # (c) live lockfile present?
    [[ -f "$candidate_path/.lock" ]] && continue

    # FREE per registry. If a stale directory exists without a `.git` marker,
    # auto-clean before claiming.
    if [[ -d "$candidate_path" && ! -e "$candidate_path/.git" ]]; then
      # Path-safety: WORKTREES_DIR must be a non-trivial absolute path under
      # the repo, and candidate_path must be the wN convention under it.
      case "$WORKTREES_DIR" in
        ""|/|/.claude*|/private/*) die "refusing rm: WORKTREES_DIR=$WORKTREES_DIR" ;;
      esac
      case "$candidate_path" in
        "$WORKTREES_DIR"/w[0-9]*) ;;
        *) die "refusing rm: $candidate_path outside slot convention" ;;
      esac
      rm -rf -- "$candidate_path"
    fi

    slot="$candidate"
    slot_path="$candidate_path"
    break
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
  # If git's removal fails (corrupted state, partial earlier teardown), do
  # NOT die — fall through to the unconditional post-cleanup so the slot
  # is always reusable after `abandon`.
  if ( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null | grep -Fq "worktree $slot_path" ); then
    ( cd "$REPO_ROOT" && git worktree remove --force "$slot_path" ) >&2 || \
      echo "git-ops abandon: 'git worktree remove' failed; falling back to rm -rf" >&2
  fi

  # Post-cleanup: always reach this. Closes partial-teardown gaps where the
  # admin dir or working dir survived `git worktree remove`.
  if [[ -e "$slot_path" ]]; then
    case "$WORKTREES_DIR" in
      ""|/|/.claude*|/private/*) die "refusing rm: WORKTREES_DIR=$WORKTREES_DIR" ;;
    esac
    case "$slot_path" in
      "$WORKTREES_DIR"/w[0-9]*) ;;
      *) die "refusing rm: $slot_path outside slot convention" ;;
    esac
    rm -rf -- "$slot_path"
  fi
  ( cd "$REPO_ROOT" && git worktree prune ) >/dev/null 2>&1 || true

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

# ============================================================================
# P788 extension — ship (T06)
# ============================================================================
#
# Journal-based idempotent cherry-pick of a feature/fix branch onto main.
# Integrates with P787's main.lock for serialization across sessions.
#
# Journal (one per P-number): .claude/worktrees/.ship-journal/pN.json
# Written atomically via temp-file + rename(2) so the on-disk state is always
# consistent after a crash. On --resume, every recorded landed_sha is verified
# to still exist on main via `git cat-file -e`; if any is missing, the run
# fails loudly rather than silently re-applying commits.
#
# Never auto-pushes. Ends with "Ready to push." The human runs `git push`.

SHIP_JOURNAL_DIR="$WORKTREES_DIR/.ship-journal"

# Locate the feature or fix branch for a P-number. Dies on zero matches or more
# than one match — silently shipping only the first branch when both exist would
# drop commits from the other branch.
resolve_ship_branch() {
  local pn="$1"
  local all
  all="$( cd "$REPO_ROOT" && git for-each-ref --format='%(refname:short)' \
          "refs/heads/feature/${pn}-*" "refs/heads/fix/${pn}-*" 2>/dev/null )"
  local count
  count="$(echo "$all" | grep -c . || true)"
  if [[ "$count" == "0" ]]; then
    die "ship: no feature/${pn}-* or fix/${pn}-* branch found"
  fi
  if [[ "$count" != "1" ]]; then
    die "ship: multiple branches match ${pn}: $(echo "$all" | tr '\n' ' ')— delete all but one before shipping"
  fi
  echo "$all"
}

# Locate the single spec file for a P-number anywhere under features/ except
# done/, archive/, uat/ (those are already-shipped / abandoned copies and must
# not be re-shipped). Die on zero or multiple matches.
resolve_ship_spec() {
  local pn="$1"
  local matches
  matches="$( cd "$REPO_ROOT" && find features -maxdepth 3 -type f -name "${pn}_*.md" \
              ! -path "features/done/*" ! -path "features/archive/*" \
              ! -path "features/uat/*" 2>/dev/null | sort )"
  local count
  count="$(echo "$matches" | grep -c . || true)"
  if [[ "$count" == "0" ]]; then
    die "ship: no spec found under features/ matching ${pn}_*.md (excluding done/archive/uat)"
  fi
  if [[ "$count" != "1" ]]; then
    die "ship: ambiguous spec — $count files match: $(echo "$matches" | tr '\n' ' ')"
  fi
  echo "$matches"
}

# Return other P-number spec paths touched by branch commits — specs that
# ship would orphan if closed only for the named pn. Used by the co-located
# spec guard and Phase 2b auto-close.
detect_cospecs() {
  local pn="$1" branch="$2"
  ( cd "$REPO_ROOT" && git log --format= --name-only "main..${branch}" 2>/dev/null ) \
    | grep -E '^features/p[0-9]+_.*\.md$' \
    | grep -vE '^features/(done|archive|uat)/' \
    | grep -oE 'p[0-9]+' \
    | sort -u \
    | grep -v "^${pn}$" || true
}

# Pick the sprint directory for shipped specs. Resolution order:
#   1. features/done/CURRENT_SPRINT file (authoritative — written by kanban)
#   2. Newest date-prefixed directory under features/done/ (YYYY* glob avoids uat/, INDEX.md, etc.)
#   3. Today's YYYY-MM-DD fallback (caller mkdir -p's it).
# Shell-safety note: output goes into a quoted `mv` argument, not eval. _safe_echo not required.
# See .claude/rules/shell-safety.md — rule applies to eval-bound paths only.
resolve_ship_sprint_dir() {
  local current_sprint_file="$REPO_ROOT/features/done/CURRENT_SPRINT"
  if [[ -f "$current_sprint_file" ]]; then
    local content
    content="$(cat "$current_sprint_file" | sed 's:/$::')"
    # Typo/corruption guard: must be features/done/YYYY-MM-DD (agent-writes-garbage protection).
    if [[ ! "$content" =~ ^features/done/[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      echo "ERROR: CURRENT_SPRINT must contain 'features/done/YYYY-MM-DD', got: $content" >&2
      exit 1
    fi
    echo "$content"
    return
  fi
  local newest
  newest="$( cd "$REPO_ROOT" && ls -1d features/done/[0-9][0-9][0-9][0-9]*/ 2>/dev/null | sort -V | tail -n1 | sed 's:/$::' )"
  if [[ -n "$newest" ]]; then
    echo "$newest"
  else
    echo "features/done/$(date -u +%F)"
  fi
}

# Initialize a fresh journal with the source_sha list from `git log main..branch`.
# spec_file is stored so --resume can find the spec even after spec_closed=true
# (the spec has already been moved out of features/).
ship_init_journal() {
  local pn="$1"
  local branch="$2"
  local spec_file="$3"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local shas
  shas="$( cd "$REPO_ROOT" && git log --reverse --format=%H "main..${branch}" 2>/dev/null )"
  if [[ -z "$shas" ]]; then
    die "ship: branch '$branch' has no commits ahead of main — nothing to ship"
  fi

  mkdir -p "$SHIP_JOURNAL_DIR"
  local started_at session_id
  started_at="$(iso_now)"
  session_id="$(hostname -s)-$$-$(date +%s)"

  local tmp
  tmp="$(mktemp "$SHIP_JOURNAL_DIR/.init.XXXXXX")" || die "mktemp failed"
  SHIP_SHAS="$shas" python3 - "$tmp" "$pn" "$branch" "$spec_file" "$started_at" "$session_id" <<'PY'
import json, os, sys
tmp, pn, branch, spec_file, started, session = sys.argv[1:]
shas = [s for s in os.environ["SHIP_SHAS"].splitlines() if s]
payload = {
    "p_number": pn,
    "started_at": started,
    "session_id": session,
    "source_branch": branch,
    "spec_file": spec_file,
    "commits": [{"source_sha": s, "landed_sha": None, "landed_at": None} for s in shas],
    "spec_closed": False,
    "branch_deleted": False,
}
with open(tmp, "w") as f:
    json.dump(payload, f, indent=2)
    f.flush()
    os.fsync(f.fileno())
PY
  mv "$tmp" "$journal"
}

# Read a top-level string field from the journal (empty string if absent).
ship_journal_str() {
  local pn="$1"
  local field="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  python3 - "$journal" "$field" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
v = j.get(sys.argv[2])
print("" if v is None else v)
PY
}

# Return 0 if the named boolean flag is true in the journal, 1 otherwise.
ship_journal_flag() {
  local pn="$1"
  local flag="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local val
  val="$(python3 - "$journal" "$flag" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
print("1" if j.get(sys.argv[2]) else "0")
PY
)"
  [[ "$val" == "1" ]]
}

# Verify every recorded landed_sha still resolves on main. Exit non-zero on
# missing sha with a diagnostic naming the source and landed SHAs.
ship_verify_landed_shas() {
  local pn="$1"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local missing
  missing="$( cd "$REPO_ROOT" && python3 - "$journal" <<'PY'
import json, subprocess, sys
j = json.load(open(sys.argv[1]))
missing = []
for c in j.get("commits", []):
    landed = c.get("landed_sha")
    if not landed:
        continue
    r = subprocess.run(["git", "cat-file", "-e", landed], capture_output=True)
    if r.returncode != 0:
        missing.append((c.get("source_sha", "?"), landed))
for s, l in missing:
    print(f"  source={s} landed={l}")
PY
 )"
  if [[ -n "$missing" ]]; then
    {
      echo "ship: --resume refuses because a recorded landed_sha is missing from main history:"
      echo "$missing"
      echo ""
      echo "Main may have been reset or force-modified since the prior ship attempt."
      echo "Options: (a) delete the journal at $journal and re-ship from scratch,"
      echo "(b) restore main to include the landed commits, then re-run --resume."
    } >&2
    exit 1
  fi
}

# List pending source_shas (landed_sha null) in journal order.
ship_pending_source_shas() {
  local journal="$1"
  python3 - "$journal" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
for c in j.get("commits", []):
    if not c.get("landed_sha"):
        print(c["source_sha"])
PY
}

# Atomically update journal: set landed_sha for a given source_sha.
ship_record_landed() {
  local pn="$1"
  local source_sha="$2"
  local landed_sha="$3"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local landed_at
  landed_at="$(iso_now)"
  python3 - "$journal" "$source_sha" "$landed_sha" "$landed_at" <<'PY'
import json, os, sys, tempfile
target, src, landed, at = sys.argv[1:]
j = json.load(open(target))
for c in j["commits"]:
    if c["source_sha"] == src:
        c["landed_sha"] = landed
        c["landed_at"] = at
        break
else:
    raise SystemExit(f"source_sha {src} not in journal")
d = os.path.dirname(target)
fd, tmp = tempfile.mkstemp(prefix=".ship-journal.", dir=d)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(j, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, target)
except Exception:
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    raise
PY
}

# Set a top-level boolean flag in the journal (e.g. spec_closed, branch_deleted).
ship_set_journal_flag() {
  local pn="$1"
  local flag="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  python3 - "$journal" "$flag" <<'PY'
import json, os, sys, tempfile
target, flag = sys.argv[1:]
j = json.load(open(target))
j[flag] = True
d = os.path.dirname(target)
fd, tmp = tempfile.mkstemp(prefix=".ship-journal.", dir=d)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(j, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, target)
except Exception:
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    raise
PY
}

# Rewrite the moved spec's frontmatter: status: all-done, add completed_at
# (YYYY-MM-DD UTC), drop delivery_stage. Leaves pipeline_plan / pipeline_ran /
# pipeline_skipped intact for audit.
ship_rewrite_frontmatter() {
  local spec_path="$1"
  python3 - "$spec_path" <<'PY'
import re, sys
p = sys.argv[1]
with open(p) as f:
    text = f.read()
# Split frontmatter: must start with --- on line 1.
if not text.startswith("---\n"):
    raise SystemExit(f"ship: {p} has no frontmatter — cannot rewrite")
end = text.find("\n---\n", 4)
if end < 0:
    raise SystemExit(f"ship: {p} frontmatter never closes")
fm = text[4:end]
rest = text[end + 5:]
lines = fm.splitlines()
out = []
saw_status = False
saw_completed_at = False
for ln in lines:
    if ln.startswith("delivery_stage:"):
        continue
    if ln.startswith("status:"):
        out.append("status: all-done")
        saw_status = True
        continue
    if ln.startswith("completed_at:"):
        saw_completed_at = True
    out.append(ln)
if not saw_status:
    out.append("status: all-done")
if not saw_completed_at:
    from datetime import datetime, timezone
    out.append("completed_at: " + datetime.now(timezone.utc).strftime("%Y-%m-%d"))
else:
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = [f"completed_at: {today}" if ln.startswith("completed_at:") else ln for ln in out]
new = "---\n" + "\n".join(out) + "\n---\n" + rest
with open(p, "w") as f:
    f.write(new)
PY
}

cmd_ship() {
  local pn=""
  local resume=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --resume) resume=1; shift ;;
      -*)       echo "git-ops ship: unknown flag '$1'" >&2; exit 2 ;;
      *)
        if [[ -n "$pn" ]]; then
          echo "usage: git-ops ship <p-number> [--resume]" >&2; exit 2
        fi
        pn="$1"; shift ;;
    esac
  done
  if [[ -z "$pn" ]]; then
    echo "usage: git-ops ship <p-number> [--resume]" >&2; exit 2
  fi
  if [[ ! "$pn" =~ ^p[0-9]+$ ]]; then
    die "ship: p-number must match ^p[0-9]+$ (got '$pn')"
  fi

  require_main_repo

  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local journal_exists=0
  [[ -f "$journal" ]] && journal_exists=1

  if (( journal_exists == 1 && resume == 0 )); then
    {
      echo "ship: existing journal at $journal"
      echo "Resume with 'git-ops ship $pn --resume' or delete the journal to restart."
    } >&2
    exit 1
  fi
  if (( journal_exists == 0 && resume == 1 )); then
    die "ship: --resume requested but no journal at $journal"
  fi

  # Establish branch + spec. On fresh runs, resolve from disk. On resume, trust
  # the journal's stored fields so a spec that was already moved (spec_closed=true)
  # doesn't trigger a "spec not found" refusal.
  local branch=""
  local spec_file=""
  if (( journal_exists == 0 )); then
    branch="$(resolve_ship_branch "$pn")"
    spec_file="$(resolve_ship_spec "$pn")"
    ship_init_journal "$pn" "$branch" "$spec_file"
  else
    ship_verify_landed_shas "$pn"
    branch="$(ship_journal_str "$pn" "source_branch")"
    spec_file="$(ship_journal_str "$pn" "spec_file")"
    [[ -n "$branch" ]] || die "ship: journal $journal missing source_branch"
    [[ -n "$spec_file" ]] || die "ship: journal $journal missing spec_file"
  fi

  # Guard: refuse if branch touches git-ops.sh itself.
  # Bash parses function bodies at script load; cherry-picks that land a new version
  # on disk are invisible to the running process. Ship git-ops.sh fixes via
  # commit-to-main first, then rebase the feature branch and re-ship.
  if ( cd "$REPO_ROOT" && git log --oneline "$branch" "^main" -- scripts/git-ops.sh 2>/dev/null | grep -q . ); then
    # On a fresh run the journal was just created — remove it so refusal leaves no stale state.
    # On --resume the journal pre-existed; leave it for the user to resolve.
    (( journal_exists == 0 )) && rm -f "$SHIP_JOURNAL_DIR/${pn}.json"
    die "ship: branch modifies scripts/git-ops.sh — commit that change to main via commit-to-main first, rebase $branch onto main, then re-ship"
  fi

  # Guard: refuse if main has an untracked spec file that the cherry-pick would
  # try to create. /create-bug leaves the spec untracked on main until ship
  # commits it; cherry-pick refuses to overwrite untracked files, producing a
  # cryptic "conflict or unresolved state" error with no filename.
  # Scope: features/${pn}_*.md only (the most common case — other untracked
  # collisions fall through to the improved diagnostic from Fix 1).
  # pathspec quoted to suppress shell glob expansion; pn validated ^p[0-9]+$ above.
  local untracked_specs
  untracked_specs="$( cd "$REPO_ROOT" && git ls-files --others --exclude-standard \
    -- "features/${pn}_*.md" 2>/dev/null )"
  if [[ -n "$untracked_specs" ]]; then
    # Fresh run: journal was just created — remove it so refusal leaves no stale state.
    # Resume run: journal pre-existed — preserve it so the user can retry after cleanup.
    (( journal_exists == 0 )) && rm -f "$SHIP_JOURNAL_DIR/${pn}.json"
    die "ship: untracked spec file(s) in main working tree would block cherry-pick:
  $untracked_specs
Remove or commit them first, then re-ship."
  fi

  # Guard: detect co-located specs — other P-number specs in branch commits.
  # These would be orphaned after branch deletion if not closed here.
  # Warn only (not die) — Phase 2b handles them automatically.
  local cospecs
  cospecs="$(detect_cospecs "$pn" "$branch")"
  if [[ -n "$cospecs" ]]; then
    echo "ship: co-located specs on branch ${branch}: $(echo "$cospecs" | tr '\n' ' ')→ auto-closing alongside ${pn}." >&2
  fi

  local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"
  if ! acquire_main_lock "$timeout"; then
    exit 1
  fi
  trap 'release_main_lock' EXIT

  # Post-acquire race guard: another session holding the same P-number may have
  # completed (deleting the branch) between our pre-check and lock acquire. If
  # the branch is gone but our journal still expects to pick its commits,
  # abort cleanly — main already has everything this session would have added.
  # Also clear the (now-stale) journal so future ship attempts aren't poisoned.
  if ! ship_journal_flag "$pn" "branch_deleted" && \
     ! ( cd "$REPO_ROOT" && git rev-parse --verify "$branch" >/dev/null 2>&1 ); then
    rm -f "$journal"
    die "ship: branch $branch no longer exists — another session may have already shipped this P-number"
  fi

  # Ensure we are on main for cherry-pick + commit operations.
  local current_branch
  current_branch="$( cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD )"
  if [[ "$current_branch" != "main" ]]; then
    ( cd "$REPO_ROOT" && git checkout -q main ) || die "ship: failed to checkout main"
  fi

  # Discard any uncommitted/staged kanban-written changes to this feature's spec file.
  # Kanban writes locked_at/status/rank without committing (unstaged); on folder-move
  # status changes it also git-adds (staged). Both block cherry-pick if the commit
  # touches the same file. Cherry-picks carry the correct spec state, so it's safe to
  # discard the kanban delta here — but emit the diff first so it's recoverable via reflog.
  local spec_pattern="features/${pn}_*.md"
  if git -C "$REPO_ROOT" diff-index --quiet HEAD -- "$spec_pattern" 2>/dev/null; then
    : # no kanban edits, nothing to do
  else
    echo "ship: discarding uncommitted kanban edits to $spec_pattern before cherry-pick:" >&2
    git -C "$REPO_ROOT" diff --stat HEAD -- "$spec_pattern" >&2 || true
    git -C "$REPO_ROOT" reset HEAD -- "$spec_pattern" 2>/dev/null || true
    git -C "$REPO_ROOT" checkout -- "$spec_pattern" 2>/dev/null || true
  fi

  # Phase 1: cherry-pick pending commits (idempotent — reads journal, only picks
  # entries with landed_sha=null).
  local pending sha landed
  pending="$(ship_pending_source_shas "$journal")"
  local cherry_out cherry_rc
  while IFS= read -r sha; do
    [[ -z "$sha" ]] && continue
    set +e
    cherry_out=$( cd "$REPO_ROOT" && git cherry-pick "$sha" 2>&1 )
    cherry_rc=$?
    set -e
    if (( cherry_rc != 0 )); then
      # Cherry-pick failed. Distinguish "already applied / redundant" (benign
      # — prior run picked this commit before SIGTERM could write the journal)
      # from a real conflict.
      if echo "$cherry_out" | grep -qiE 'empty|nothing to commit|previous cherry-pick is now empty|already been applied'; then
        # Clean the sequencer state and treat HEAD as the landed sha. HEAD
        # already contains this commit's changes from the prior partial run.
        ( cd "$REPO_ROOT" && git cherry-pick --skip >/dev/null 2>&1 ) || true
        landed="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
        ship_record_landed "$pn" "$sha" "$landed"
        if [[ -n "${SHIP_DEBUG_SLEEP_SECS:-}" ]]; then
          sleep "${SHIP_DEBUG_SLEEP_SECS}"
        fi
        continue
      fi
      {
        echo "ship: cherry-pick $sha failed — conflict or unresolved state"
        echo "#CP_DIAGNOSTIC_BEGIN"
        if [[ -n "$cherry_out" ]]; then
          echo "cherry-pick output:"
          printf '%s\n' "$cherry_out"
          echo ""
        fi
        echo "git status:"
        git -C "$REPO_ROOT" status --short 2>/dev/null || true
        echo "#CP_DIAGNOSTIC_END"
        echo ""
        echo "Resolve in the main worktree, then run 'git-ops ship $pn --resume'."
        echo "Never run 'git cherry-pick --abort' or '--quit' mid-sequence."
      } >&2
      exit 1
    fi
    landed="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
    ship_record_landed "$pn" "$sha" "$landed"
    # Test-only knob: widen the SIGTERM window between picks. Unset in prod.
    if [[ -n "${SHIP_DEBUG_SLEEP_SECS:-}" ]]; then
      sleep "${SHIP_DEBUG_SLEEP_SECS}"
    fi
  done <<<"$pending"

  # Phase 2: spec close (idempotent — skip if journal.spec_closed=true).
  if ! ship_journal_flag "$pn" "spec_closed"; then
    local sprint_dir
    sprint_dir="$(resolve_ship_sprint_dir)"
    mkdir -p "$REPO_ROOT/$sprint_dir"
    local spec_base spec_dest
    spec_base="$(basename "$spec_file")"
    spec_dest="${sprint_dir}/${spec_base}"

    if [[ -f "$REPO_ROOT/$spec_file" ]]; then
      ( cd "$REPO_ROOT" && git mv "$spec_file" "$spec_dest" ) || die "ship: git mv failed"
    elif [[ ! -f "$REPO_ROOT/$spec_dest" ]]; then
      die "ship: spec file missing at both $spec_file and $spec_dest"
    fi
    ship_rewrite_frontmatter "$REPO_ROOT/$spec_dest"
    ( cd "$REPO_ROOT" && git add -- "$spec_dest" ) >/dev/null

    # If the rename+frontmatter-rewrite produces no net change vs HEAD, a prior
    # run already committed it — SIGTERM landed between commit and flag write.
    # Skip the commit (would fail with "nothing to commit") and just mark done.
    if ( cd "$REPO_ROOT" && git diff --cached --quiet -- "$spec_dest" ) && \
       ( cd "$REPO_ROOT" && git diff --quiet -- "$spec_dest" ); then
      ship_set_journal_flag "$pn" "spec_closed"
    else
      # Title for commit message: first non-frontmatter '# ' heading, fallback to pn.
      local title
      title="$( python3 - "$REPO_ROOT/$spec_dest" <<'PY'
import sys
with open(sys.argv[1]) as f:
    text = f.read()
in_fm = False
seen_open = False
for line in text.splitlines():
    if line == "---":
        if not seen_open:
            in_fm = True; seen_open = True; continue
        elif in_fm:
            in_fm = False; continue
    if in_fm:
        continue
    if line.startswith("# "):
        print(line[2:].strip())
        break
PY
 )"
      if [[ -z "$title" ]]; then
        title="close $pn"
      fi
      # Include $spec_file so the git mv source deletion is committed (not left staged).
      # On --resume when spec was already moved, $spec_file no longer exists in the index
      # and the pathspec is a no-op — safe.
      ( cd "$REPO_ROOT" && git commit -q -m "chore: close $pn — $title" -- "$spec_dest" "$spec_file" ) \
        || die "ship: spec-close commit failed"
      ship_set_journal_flag "$pn" "spec_closed"
    fi
  fi

  # Phase 2b: close co-located specs (other P-numbers on the same branch).
  # Re-detect here (not from a stored var) because Phase 1 cherry-picks land
  # new SHAs on main; the original branch SHAs are still reachable via the
  # branch pointer, so main..${branch} still returns them.
  local cospecs_2b
  cospecs_2b="$(detect_cospecs "$pn" "$branch" 2>/dev/null || true)"
  if [[ -n "$cospecs_2b" ]]; then
    local cospec_sprint_dir
    cospec_sprint_dir="${sprint_dir:-$(resolve_ship_sprint_dir)}"
    mkdir -p "$REPO_ROOT/$cospec_sprint_dir"
    for cospec_pn in $cospecs_2b; do
      local cospec_file cospec_base cospec_dest
      cospec_file="$(resolve_ship_spec "$cospec_pn" 2>/dev/null || true)"
      [[ -z "$cospec_file" ]] && continue   # already moved on a prior --resume
      cospec_base="$(basename "$cospec_file")"
      cospec_dest="${cospec_sprint_dir}/${cospec_base}"
      if [[ -f "$REPO_ROOT/$cospec_file" ]]; then
        ( cd "$REPO_ROOT" && git mv "$cospec_file" "$cospec_dest" ) || continue
        ship_rewrite_frontmatter "$REPO_ROOT/$cospec_dest"
        ( cd "$REPO_ROOT" && git add -- "$cospec_dest" ) >/dev/null
        ( cd "$REPO_ROOT" && git commit -q \
            -m "chore: close ${cospec_pn} (co-located with ${pn})" \
            -- "$cospec_dest" "$cospec_file" ) || true
      fi
    done
  fi

  # Phase 3: branch + worktree cleanup (idempotent — skip if already done).
  if ! ship_journal_flag "$pn" "branch_deleted"; then
    local wt_path
    wt_path="$( cd "$REPO_ROOT" && git worktree list --porcelain | \
                awk -v br="refs/heads/${branch}" '
                  /^worktree / { path = substr($0, 10); next }
                  /^branch / { if ($2 == br) print path }
                ' | head -n1 )"
    if [[ -n "$wt_path" ]]; then
      ( cd "$REPO_ROOT" && git worktree remove --force "$wt_path" ) >/dev/null 2>&1 || true
    fi
    # Branch may already be deleted if a prior run reached here — treat "branch
    # not found" as success for idempotency.
    if ( cd "$REPO_ROOT" && git rev-parse --verify "$branch" >/dev/null 2>&1 ); then
      ( cd "$REPO_ROOT" && git branch -D "$branch" ) >/dev/null 2>&1 || \
        die "ship: branch delete failed for $branch"
    fi
    ship_set_journal_flag "$pn" "branch_deleted"
  fi

  # Release lock and clean up journal.
  release_main_lock
  trap - EXIT
  rm -f "$journal"

  echo "ship: $pn landed on main; branch and journal cleaned up."
  echo "Ready to push."
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

SUBCOMMANDS (P788 extension — T06)
  ship <p-number> [--resume]   Journal-based idempotent cherry-pick of
                               feature/pN-* or fix/pN-* onto main. Records
                               (source_sha : landed_sha) per commit in
                               .claude/worktrees/.ship-journal/pN.json, fsynced
                               and atomically replaced after each pick so a
                               crash leaves consistent state. Acquires main.lock
                               for the full run (serializes concurrent ships).
                               After all commits land: moves the spec into the
                               newest features/done/{sprint}/ directory with
                               status=all-done + completed_at, drops
                               delivery_stage, deletes the branch, removes the
                               worktree if one was checked out, clears the
                               journal. Never auto-pushes — ends with
                               'Ready to push.' for the human to run push.
                               --resume continues from a crashed run; any
                               recorded landed_sha missing from main history
                               causes an immediate refusal.

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
    ship)            cmd_ship "$@" ;;
    help|-h|--help)  print_usage; exit 0 ;;
    *)
      echo "git-ops: unknown subcommand '$sub'" >&2
      usage_exit
      ;;
  esac
}

main "$@"
