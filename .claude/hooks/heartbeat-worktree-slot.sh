#!/bin/bash
# heartbeat-worktree-slot.sh — P1268, P1326
#
# PostToolUse hook (every tool). Records that this tool call touched a worktree
# slot, so a slot in active use never reads ORPHAN.
#
# WHY TWO SIGNALS:
#   * `git-ops activity wN` (P1326) — identity-free. Fired for every slot the
#     payload references: tool_input.file_path / notebook_path / path, the payload
#     cwd, or a path in a Bash command. This is the signal that actually works for
#     agents: P1268's heartbeat alone was inert in real use, because an agent-run
#     `claim` never binds the session id, so every beat was refused (w1, 16h of work
#     reading ORPHAN, 2026-09-16). It needs no identity because it can only err
#     toward LIVE.
#   * `git-ops heartbeat wN` (P1268) — kept unchanged for the session whose cwd is
#     the slot and whose id matches the lock.
#
# Slot discovery reads the PAYLOAD, not this process's cwd: 4 of the 19 w1 edits in
# that incident ran with the session cwd on main, and `cd <slot> && …` from main
# never moves the session cwd at all.
#
# Activity-driven on purpose, never a timer: a scheduled stamper outlives the
# session it claims to represent and manufactures false LIVE.
#
# Must NEVER block or fail a tool call. Every path exits 0.

set -uo pipefail

RAW=""
if [ ! -t 0 ]; then
  IFS= read -r -t 2 -d '' RAW 2>/dev/null || true
fi

# Fast exit for the overwhelming majority of tool calls: if neither the payload nor
# this process's cwd names a worktree slot, neither signal below can fire, so do not
# pay for a python parse and two git calls on every tool use.
case "$RAW$PWD" in
  *worktrees/w[0-9]*) ;;
  *) exit 0 ;;
esac

# Resolve the repo from the payload cwd when present, else our own.
PAYLOAD_CWD=""
SESSION_ID=""
if [ -n "$RAW" ]; then
  PARSED="$(printf '%s' "$RAW" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get("session_id") or "")
    print(d.get("cwd") or "")
except Exception:
    print(""); print("")
' 2>/dev/null || true)"
  SESSION_ID="$(printf '%s\n' "$PARSED" | sed -n 1p)"
  PAYLOAD_CWD="$(printf '%s\n' "$PARSED" | sed -n 2p)"
fi
BASE_DIR="${PAYLOAD_CWD:-$PWD}"
[ -d "$BASE_DIR" ] || BASE_DIR="$PWD"

COMMON_DIR="$(git -C "$BASE_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
[ -n "$COMMON_DIR" ] || exit 0
REPO_ROOT="$(dirname "$COMMON_DIR")"
# Main checkout's copy only — never the branch's. See adopt-worktree-slot.sh for
# why: the worktree copy is branch-controlled and would execute at hook time.
GIT_OPS="$REPO_ROOT/scripts/git-ops.sh"
[ -x "$GIT_OPS" ] || exit 0
WT_DIR="$REPO_ROOT/.claude/worktrees"

run_bounded() {  # never let a slow git-ops stall the tool call: 3s hard budget
  "$@" >/dev/null 2>&1 &
  local pid=$! ticks=0
  # Poll in 50ms steps. The previous `sleep 1` step charged a full second to every
  # call whose child had not exited by the first check — which is nearly all of
  # them — so with activity + heartbeat each in-slot tool call cost ~2.1s (measured
  # 2026-09-16, flagged by adversarial review). 60 ticks keeps the 3s ceiling.
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$ticks" -ge 60 ]; then kill -9 "$pid" 2>/dev/null || true; break; fi
    sleep 0.05; ticks=$((ticks + 1))
  done
}

# ── activity (P1326) ─────────────────────────────────────────────────────────
# Cheap substring gate first: almost no tool call mentions a worktree slot.
case "$RAW" in
  *worktrees/w[0-9]*)
    SLOTS="$(printf '%s' "$RAW" | WT_DIR="$WT_DIR" python3 -c '
import json,os,re,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
wt=os.environ["WT_DIR"]
roots={wt}
try: roots.add(os.path.realpath(wt))
except Exception: pass
ti=d.get("tool_input") or {}
if not isinstance(ti,dict): ti={}
slot=r"(w[0-9]+)(?=$|[/\s\"'"'"';&|)])"
found=set()
# Absolute path fields: must sit under THIS repo'"'"'s worktree dir.
abs_re=[re.compile(re.escape(r)+"/"+slot) for r in roots]
base=d.get("cwd") if isinstance(d.get("cwd"),str) else os.getcwd()
for v in [ti.get("file_path"),ti.get("notebook_path"),ti.get("path"),d.get("cwd")]:
    if isinstance(v,str) and v:
        # A relative path (Grep/Glob `path` can be one) is relative to the session cwd.
        if not os.path.isabs(v):
            v=os.path.normpath(os.path.join(base,v))
        for r in abs_re:
            m=r.match(v)
            if m: found.add(m.group(1))
# Commands: absolute under this repo, or the repo-relative spelling.
cmd=ti.get("command")
if isinstance(cmd,str):
    alts="|".join([re.escape(r) for r in roots]+[r"\.claude/worktrees"])
    for m in re.finditer(r"(?:^|(?<=[\s\"'"'"'=:(]))(?:"+alts+")/"+slot,cmd):
        found.add(m.group(1))
print("\n".join(sorted(found)))
' 2>/dev/null || true)"
    for S in $SLOTS; do
      case "$S" in w[0-9]*) [ -f "$WT_DIR/$S/.lock" ] && run_bounded "$GIT_OPS" activity "$S" ;; esac
    done
    ;;
esac

# ── heartbeat (P1268, unchanged behaviour) ───────────────────────────────────
TOPLEVEL="$(git -C "$BASE_DIR" rev-parse --path-format=absolute --show-toplevel 2>/dev/null || true)"
case "$TOPLEVEL" in
  */.claude/worktrees/w[0-9]*)
    SLOT="$(basename "$TOPLEVEL")"
    if [ -f "$TOPLEVEL/.lock" ]; then
      ( cd "$TOPLEVEL" && CP_SESSION_ID="$SESSION_ID" run_bounded "$GIT_OPS" heartbeat "$SLOT" )
    fi
    ;;
esac
exit 0
