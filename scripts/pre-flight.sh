#!/bin/bash
# pre-flight.sh — invariant checker invoked by skills before git operations.
#
# Usage:
#   pre-flight.sh <context> [--slot wN] [--spec pN]
#   context ∈ {ship, dev, fix, park, claim}
#
# Exit codes:
#   0 — all checks pass (warnings may exist)
#   1 — hard failure (branch mismatch, reserved for future use)
#   2 — lockfile check failed (NO_LOCK, STALE, or ORPHAN)
#
# Output contract: one line per check, no >, <, or | tokens at word boundaries.
# This script's stdout is for human reading only — not designed to be eval'd.

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WORKTREES_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/worktrees"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers (shared with git-ops.sh — duplicated to keep pre-flight standalone)
# ---------------------------------------------------------------------------

pid_alive() {
  kill -0 "$1" 2>/dev/null
}

pid_start_time() {
  ps -o lstart= -p "$1" 2>/dev/null \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g'
}

load_lockfile() {
  local lockfile="$1"
  LOCK_PID=""; LOCK_PID_START_TIME=""; LOCK_SESSION_ID=""
  LOCK_SLOT=""; LOCK_BRANCH=""; LOCK_P_NUMBER=""
  if [[ ! -f "$lockfile" ]]; then
    return 1
  fi
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      PID)            LOCK_PID="$value" ;;
      PID_START_TIME) LOCK_PID_START_TIME="$value" ;;
      SESSION_ID)     LOCK_SESSION_ID="$value" ;;
      SLOT)           LOCK_SLOT="$value" ;;
      BRANCH)         LOCK_BRANCH="$value" ;;
      P_NUMBER)       LOCK_P_NUMBER="$value" ;;
    esac
  done < "$lockfile"
  return 0
}

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

# Redirect-safe output helpers (P786 / shell-safety.md).
# Abort if a status line contains >, <, or | at word boundaries — which would
# re-parse as I/O redirects if stdout is ever routed through eval by a caller.
_safe_status() {
  local prefix="$1"; shift
  local msg="$*"
  if echo "$msg" | grep -qE '(^|[[:space:]])[>|<]([[:space:]]|$)'; then
    echo "pre-flight: FATAL — status line contains redirect-parseable token: $msg" >&2
    exit 3
  fi
  echo -e "$prefix $msg"
}

pass() { _safe_status "${GREEN}PASS${NC}" "$*"; }
warn() { _safe_status "${YELLOW}WARN${NC}" "$*"; }
fail() { _safe_status "${RED}FAIL${NC}" "$*"; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  echo "usage: pre-flight.sh <context> [--slot wN] [--spec pN]" >&2
  exit 1
fi

CONTEXT="$1"; shift

SLOT=""
SPEC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slot) SLOT="$2"; shift 2 ;;
    --spec) SPEC="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

echo "=== pre-flight: context=$CONTEXT ==="

EXIT_CODE=0

# ---------------------------------------------------------------------------
# Check 1: Lockfile validity (if --slot given)
# ---------------------------------------------------------------------------

if [[ -n "$SLOT" ]]; then
  slot_path="$WORKTREES_DIR/$SLOT"
  lockfile="$slot_path/.lock"

  if ! load_lockfile "$lockfile"; then
    fail "lockfile: $SLOT has no .lock file (slot not claimed)"
    EXIT_CODE=2
  else
    state="$(classify_lock_state)"
    case "$state" in
      LIVE)
        pass "lockfile: $SLOT live (PID $LOCK_PID, session $LOCK_SESSION_ID)"
        ;;
      STALE)
        fail "lockfile: $SLOT is STALE — PID $LOCK_PID exists but start time changed (PID recycled)"
        EXIT_CODE=2
        ;;
      ORPHAN)
        fail "lockfile: $SLOT is ORPHAN — PID $LOCK_PID no longer exists"
        EXIT_CODE=2
        ;;
      NO_LOCK)
        fail "lockfile: $SLOT has no .lock file (slot not claimed)"
        EXIT_CODE=2
        ;;
    esac
  fi
else
  echo "     lockfile: skipped (no --slot)"
fi

# ---------------------------------------------------------------------------
# Check 2: Branch matches spec (if --spec given AND inside a worktree)
# ---------------------------------------------------------------------------

if [[ -n "$SPEC" ]]; then
  current_branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"
  worktree_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
  in_worktree=false
  if [[ "$worktree_root" == *".claude/worktrees/"* ]]; then
    in_worktree=true
  fi

  if $in_worktree; then
    p_num="${SPEC#p}"  # strip leading 'p' if present
    p_num="${p_num//p/}"
    # Accept bare number or p-prefixed
    if [[ "$SPEC" =~ ^[0-9]+$ ]]; then
      p_num="$SPEC"
    else
      p_num="${SPEC#p}"
    fi
    if [[ "$current_branch" =~ ^(feature|fix)/p${p_num}- ]]; then
      pass "branch: $current_branch matches spec p$p_num"
    else
      fail "branch: $current_branch does not match expected feature/p${p_num}-* or fix/p${p_num}-*"
      EXIT_CODE=1
    fi
  else
    echo "     branch: skipped (not in a worktree)"
  fi
else
  echo "     branch: skipped (no --spec)"
fi

# ---------------------------------------------------------------------------
# Check 3: Tree clean of bystanders (WARN only)
# ---------------------------------------------------------------------------

staged_all="$(git diff --cached --name-only 2>/dev/null || true)"

if [[ -n "$staged_all" ]]; then
  worktree_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
  if [[ "$worktree_root" == *".claude/worktrees/"* ]]; then
    # In a worktree: staged files exist, but we cannot reliably distinguish
    # "same session" from "foreign session" without expensive git-log per-file.
    # Report count as neutral info only — not a WARN (which would fire on every commit).
    staged_count="$(echo "$staged_all" | grep -c '.' || true)"
    slot_name="$(basename "$worktree_root")"
    echo "     bystanders: $staged_count file(s) staged in worktree $slot_name (foreign-session detection deferred to /commit)"
  else
    echo "     bystanders: skipped (not in a worktree)"
  fi
else
  pass "bystanders: staging area is clean"
fi

# ---------------------------------------------------------------------------
# Check 4: Main up-to-date (read-only, no fetch)
# ---------------------------------------------------------------------------

# Compare local main to origin/main using known refs — no network call.
# `git fetch --dry-run` would require network; instead compare local tracking ref.
local_main="$(git rev-parse main 2>/dev/null || true)"
origin_main="$(git rev-parse origin/main 2>/dev/null || true)"

if [[ -z "$local_main" ]]; then
  echo "     main-sync: skipped (no local main branch found)"
elif [[ -z "$origin_main" ]]; then
  echo "     main-sync: skipped (no origin/main tracking ref — run git fetch once)"
elif [[ "$local_main" == "$origin_main" ]]; then
  pass "main-sync: local main matches origin/main ($local_main)"
else
  # Check whether main is behind origin/main
  behind="$(git rev-list --count main..origin/main 2>/dev/null || echo 0)"
  if [[ "$behind" -gt 0 ]]; then
    warn "main-sync: local main is $behind commit(s) behind origin/main — consider git pull main"
  else
    pass "main-sync: local main is ahead of or equal to origin/main"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo -e "${GREEN}pre-flight OK (context: $CONTEXT)${NC}"
else
  echo -e "${RED}pre-flight FAILED (context: $CONTEXT, exit $EXIT_CODE)${NC}"
fi

exit "$EXIT_CODE"
