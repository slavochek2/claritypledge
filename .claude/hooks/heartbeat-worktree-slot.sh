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
  *worktrees/*) ;;
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

# ── slot discovery (P1450: writes only) ──────────────────────────────────────
# Held in a variable, not an inline heredoc, because bash 3.2 mis-parses a heredoc (and
# any quote or backtick inside it) nested in $( ).
read -r -d '' SLOT_PY <<'PY'
import json,os,re,sys
try:
    d=json.loads(os.environ.get("HOOK_RAW",""))
except Exception:
    sys.exit(0)
wt=os.environ["WT_DIR"]
roots={wt}
try: roots.add(os.path.realpath(wt))
except Exception: pass
ti=d.get("tool_input") or {}
if not isinstance(ti,dict): ti={}
tool=d.get("tool_name") if isinstance(d.get("tool_name"),str) else ""
slot=r"(w[0-9]+)(?=$|[/\s\"';&|)])"
found=set()

# P1450: only a WRITE keeps a slot LIVE. A read-only audit (grep, cat, ls, git log, the
# Read/Grep/Glob tools) used to stamp every slot it mentioned and so held dead slots open
# for another 12h. The errors are asymmetric: a stamp wrongly withheld lets a slot read
# ORPHAN while a session works in it (w4, 2026-10-09), so anything not PROVEN to be a read
# counts as a write.
READ_TOOLS={"Read","Grep","Glob","LS","NotebookRead","WebFetch","WebSearch","TodoWrite","TaskList","TaskGet"}
READ_CMDS={"cat","head","tail","less","more","grep","egrep","fgrep","rg","ls","wc","stat","file","diff","cmp","du","df",
           "pwd","echo","printf","test","[","true","false","cd","pushd","popd","readlink","realpath","basename","dirname",
           "sort","uniq","cut","tr","jq","which","type","date","ps","lsof","tree","nl","od","xxd","md5","md5sum","shasum","sleep"}
READ_GIT={"log","status","diff","show","rev-parse"}
WRAPPERS={"env","command","builtin","time","nice","exec"}

OUTPUT_FLAG_CMDS={"sort","uniq","tree","diff"}

def has_output_flag(words):
    # -o FILE / --output FILE / --output=FILE write a file even though the verb is a "read" verb.
    return any(w=="-o" or w=="--output" or w.startswith("--output=") for w in words)

def redirect_targets(seg):
    # Targets of output redirections, excluding fd duplication (2>&1) and /dev/null sinks.
    cleaned=re.sub(r"\d*>&\d+|&>\s*/dev/null|\d*>>?\s*/dev/null","",seg)
    return [m.group(2).strip("\"'") for m in re.finditer(r"(\d*>>?|&>)\s*([^\s;&|<>]+)",cleaned)]

def output_flag_targets(seg):
    words=re.sub(r"\d*>&\d+","",seg).split(); out=[]
    for k,w in enumerate(words):
        if w in ("-o","--output") and k+1<len(words): out.append(words[k+1].strip("\"'"))
        elif w.startswith("--output="): out.append(w[9:].strip("\"'"))
    return out

def core_is_read(seg,ignore_outflag=False):
    # The verb alone, ignoring redirections (handled by the caller).
    if "$(" in seg or chr(96) in seg: return False
    core=re.sub(r"\d*>&\d+|&>\s*/dev/null|(\d*>>?|&>)\s*[^\s;&|<>]+","",seg)
    words=core.split()
    i=0
    while i<len(words) and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=",words[i]) or words[i] in WRAPPERS): i+=1
    if i>=len(words): return True
    w=os.path.basename(words[i].strip("\"'"))
    if w=="git":
        j=i+1
        while j<len(words):
            a=words[j]
            if a in ("-C","-c","--git-dir","--work-tree"): j+=2; continue
            if a.startswith("-"): j+=1; continue
            break
        if j>=len(words) or words[j] not in READ_GIT: return False
        return ignore_outflag or not (words[j]=="diff" and has_output_flag(words[j+1:]))
    if w=="find":
        return not re.search(r"(^|\s)-(delete|exec|execdir|ok|fprint|fprintf)\b",seg)
    if w in OUTPUT_FLAG_CMDS and has_output_flag(words[i+1:]) and not ignore_outflag: return False
    return w in READ_CMDS

def split_segments(cmd):
    # "&" splits only as a background operator, never inside 2>&1 or &>file.
    return [x for x in re.split(r"&&|\|\||;|\||\n|(?<!>)&(?!>)",cmd) if x.strip()]

def scope_of(seg):
    # The text whose slot mentions count for one segment, or None when it is a pure read.
    # A read verb with an output redirect or -o/--output is a write only INTO those targets
    # (cat wN/x > /tmp/o and sort -o /tmp/s wN/x stamp nothing).
    if core_is_read(seg): 
        t=redirect_targets(seg)
        return " ".join(t) if t else None
    if core_is_read(seg,True): return " ".join(output_flag_targets(seg)+redirect_targets(seg))
    return seg

def write_scopes(cmd):
    return [x for x in (scope_of(seg) for seg in split_segments(cmd)) if x is not None]

def command_is_write(cmd):
    return bool(write_scopes(cmd))

abs_re=[re.compile(re.escape(r)+"/"+slot) for r in roots]
base=d.get("cwd") if isinstance(d.get("cwd"),str) else os.getcwd()
def slot_of_path(v):
    if not isinstance(v,str) or not v: return None
    if not os.path.isabs(v): v=os.path.normpath(os.path.join(base,v))
    for r in abs_re:
        m=r.match(v)
        if m: return m.group(1)
    return None
cmd=ti.get("command")
if tool not in READ_TOOLS:
    # Absolute path fields must sit under THIS repo's worktree dir. The payload cwd counts for
    # the file-writing tools; for Bash it counts only when the command actually writes (a cwd
    # alone is also where ls, cat and git log run from).
    paths=[ti.get("file_path"),ti.get("notebook_path"),ti.get("path")]
    if not isinstance(cmd,str): paths.append(d.get("cwd"))
    for v in paths:
        sl=slot_of_path(v)
        if sl: found.add(sl)
# Commands: absolute under this repo, or the repo-relative spelling.
if isinstance(cmd,str) and tool not in READ_TOOLS:
    repo=os.path.dirname(os.path.dirname(wt))
    home=os.path.expanduser("~")
    for var in ("${CLAUDE_PROJECT_DIR}","$CLAUDE_PROJECT_DIR"):
        cmd=cmd.replace(var,repo)
    cmd=re.sub(r"(?<![\w/])~(?=/)",home,cmd)
    alts="|".join([re.escape(r) for r in roots]+[r"\.claude/worktrees"])
    # The slot component may be quoted on its own: cd .claude/worktrees/"w1"
    # No left anchor: ./.claude/worktrees/w1, "x/.claude/worktrees/w1" and a quoted
    # component all count. A false match can only hold a slot LIVE.
    slot_re=re.compile(r"(?:"+alts+")/[\"']?"+slot)
    cur=slot_of_path(d.get("cwd")) if isinstance(d.get("cwd"),str) else None
    for seg in split_segments(cmd):
        words=seg.split()
        is_cd=bool(words) and words[0] in ("cd","pushd")
        if is_cd:
            ms=[m.group(1) for m in slot_re.finditer(seg)]
            cur=ms[0] if ms else None
        scope=scope_of(seg)
        if scope is None: continue
        for m in slot_re.finditer(scope): found.add(m.group(1))
        if cur: found.add(cur)       # a write run from inside a slot (cwd or an earlier cd)
print("\n".join(sorted(found)))
PY

# ── activity (P1326) ─────────────────────────────────────────────────────────
# Cheap substring gate first: almost no tool call mentions a worktree slot.
case "$RAW" in
  *worktrees/*)
    SLOTS="$(HOOK_RAW="$RAW" WT_DIR="$WT_DIR" python3 -c "$SLOT_PY" 2>/dev/null || true)"
    for S in $SLOTS; do
      # From REPO_ROOT: git-ops.sh finds its repo from its cwd, and the hook's own cwd
      # need not be inside the repo (found by firing the hook from a neutral dir).
      case "$S" in w[0-9]*) [ -f "$WT_DIR/$S/.lock" ] && ( cd "$REPO_ROOT" && run_bounded "$GIT_OPS" activity "$S" ) ;; esac
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
