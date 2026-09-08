#!/bin/bash
# adopt-worktree-slot.sh — P1268
#
# SessionStart hook. When a session begins with its cwd inside a worktree slot,
# re-own that slot's lock so its HEARTBEAT reflects a session that is actually
# running. Without this, `claim` stamps the PID of the git-ops.sh process — which
# exits when the command returns — so every agent-claimed slot reads ORPHAN
# within milliseconds and stays that way forever.
#
# CONTRACT: this hook must NEVER block a session from starting. Every failure
# path reports to stderr and exits 0. A slot that cannot be adopted is a thing to
# tell the user about, not a reason to refuse them a session.

set -uo pipefail   # deliberately NOT -e: no failure here may abort session start

# Read session_id from the hook's stdin JSON, same shape verify-before-stop.py uses.
# Never block on a pipe that has nothing in it.
# Bounded read. `cat` on a non-TTY stdin whose writer stays open but sends nothing
# blocks until that writer closes — so the original "never blocks" claim was only
# true for the adopt itself, not for reading its input. `read -t` bounds it.
# Caught by adversarial review; the settings.json timeout was the only thing
# bounding it before, which delays session start rather than preventing it.
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

# Not in a repo, or not in a worktree slot -> nothing to adopt. Silent, exit 0.
case "$TOPLEVEL" in
  */.claude/worktrees/w[0-9]*) ;;
  *) exit 0 ;;
esac

SLOT="$(basename "$TOPLEVEL")"

# Resolve git-ops.sh. scripts/ is a NATIVE checkout in every worktree, so there are
# two real copies and they can differ. Prefer the worktree's own — it is the copy
# belonging to the branch being worked on, and a worktree developing git-ops itself
# must exercise its own version, not main's. Fall back to the main repo's copy when
# the worktree has none.
GIT_OPS=""
if [ -x "$TOPLEVEL/scripts/git-ops.sh" ]; then
  GIT_OPS="$TOPLEVEL/scripts/git-ops.sh"
else
  COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  [ -n "$COMMON_DIR" ] || exit 0
  GIT_OPS="$(dirname "$COMMON_DIR")/scripts/git-ops.sh"
fi
[ -x "$GIT_OPS" ] || exit 0

# No lock at all means the slot was never claimed (or was released). Adopting is
# not the right repair for that — say so and leave it alone.
if [ ! -f "$TOPLEVEL/.lock" ]; then
  echo "P1268: $SLOT has no .lock — not claimed, or already released. Run 'git-ops.sh claim' if this slot is yours." >&2
  exit 0
fi

ADOPT_ARGS=("$SLOT")
if [ -n "$SESSION_ID" ]; then
  ADOPT_ARGS+=(--session "$SESSION_ID")
fi

if OUT="$("$GIT_OPS" adopt "${ADOPT_ARGS[@]}" 2>&1)"; then
  echo "P1268: adopted $SLOT — this session now owns its lock." >&2
else
  # Refusal is informative, never fatal. The commonest legitimate cause is that
  # the slot is genuinely held by another live session.
  # Cap the excerpt. A failing git-ops subcommand prints its full usage block —
  # ~100 lines — and dumping that into the top of every session start buries the one
  # line that matters. Six lines carries the refusal and its remedy.
  echo "P1268: could not adopt $SLOT (session start continues regardless):" >&2
  printf '%s\n' "$OUT" | head -6 | sed 's/^/  /' >&2
  if [ "$(printf '%s\n' "$OUT" | wc -l | tr -d " ")" -gt 6 ]; then
    echo "  ... (run: $GIT_OPS adopt $SLOT)" >&2
  fi
fi

exit 0
