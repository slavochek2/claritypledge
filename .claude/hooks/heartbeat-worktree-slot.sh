#!/bin/bash
# heartbeat-worktree-slot.sh — P1268
#
# PostToolUse hook. Refreshes the current worktree slot's lock HEARTBEAT whenever
# this session edits a file.
#
# WHY: `adopt` stamps the heartbeat once, at session start. A session that runs
# longer than LOCK_TTL_SECONDS would then age back into ORPHAN while its owner is
# still working — the very defect P1268 exists to remove, moved from milliseconds
# to 12 hours instead of fixed. Found by adversarial review, not by the author.
#
# Activity-driven on purpose, never a timer: a scheduled stamper outlives the
# session it claims to represent and manufactures false LIVE. A refresh caused by
# the session doing something cannot outlive the session doing things.
#
# Like its sibling, this must NEVER block or fail a tool call. Every path exits 0.

set -uo pipefail

SESSION_ID=""
if [ ! -t 0 ]; then
  RAW=""
  IFS= read -r -t 2 -d '' RAW 2>/dev/null || true
  if [ -n "$RAW" ]; then
    SESSION_ID="$(printf '%s' "$RAW" | python3 -c '
import json,sys
try:
    print(json.load(sys.stdin).get("session_id") or "")
except Exception:
    print("")
' 2>/dev/null || true)"
  fi
fi

TOPLEVEL="$(git rev-parse --path-format=absolute --show-toplevel 2>/dev/null || true)"
case "$TOPLEVEL" in
  */.claude/worktrees/w[0-9]*) ;;
  *) exit 0 ;;
esac

SLOT="$(basename "$TOPLEVEL")"
[ -f "$TOPLEVEL/.lock" ] || exit 0

# Main checkout's copy only — never the branch's. See adopt-worktree-slot.sh for
# why: the worktree copy is branch-controlled and would execute at hook time.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
[ -n "$COMMON_DIR" ] || exit 0
GIT_OPS="$(dirname "$COMMON_DIR")/scripts/git-ops.sh"
[ -x "$GIT_OPS" ] || exit 0

# Bounded, for the same reason: exit code is not duration. This one runs after every
# edit, so its budget is tighter than the session-start hook's.
CP_SESSION_ID="$SESSION_ID" "$GIT_OPS" heartbeat "$SLOT" >/dev/null 2>&1 &
_hb_pid=$!
_hb_waited=0
while kill -0 "$_hb_pid" 2>/dev/null; do
  if [ "$_hb_waited" -ge 3 ]; then kill -9 "$_hb_pid" 2>/dev/null || true; break; fi
  sleep 1
  _hb_waited=$((_hb_waited + 1))
done
exit 0
