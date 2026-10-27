#!/bin/bash
# test-p1450-activity-hook.sh — P1450 item 1
#
# The PostToolUse activity hook used to stamp a slot's .activity whenever a tool payload
# MENTIONED the slot path. A read-only audit (grep, cat, ls, git log, a Read or Grep tool)
# therefore kept dead slots LIVE for another 12h (w6/w7/w8, 2026-10-09). Reads must stop
# counting; writes must keep counting, because the same day w4's lock PID was dead while a
# live session was committing there: activity is the correct liveness signal, so only the
# read half may be removed.
#
# Both halves are asserted for every shape:
#   * read-shaped payloads leave .activity byte-identical and the slot ORPHAN;
#   * write-shaped payloads (and every AMBIGUOUS shape) advance the stamp and read LIVE.
#
# Exit 0: all assertions pass.  Exit 1: at least one failed.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset CP_SESSION_ID

REPO_ROOT="$(git rev-parse --show-toplevel)"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

if [[ -z "$( { ps -o lstart= -p $$ 2>/dev/null || true; } | tr -d '[:space:]' )" ]]; then
  echo "SKIP: ps cannot report process start times here (git-ops claim needs it); suite NOT run"
  exit 77
fi

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
OLD="1990-01-01T00:00:00Z"

FAKE="$SCRATCH/repo"
mkdir -p "$FAKE/scripts/lib" "$FAKE/.claude/hooks"
git -C "$FAKE" init -q -b main
git -C "$FAKE" config user.email t@t.t
git -C "$FAKE" config user.name t
echo seed > "$FAKE/seed.txt"
printf '.activity\n.activity.*\n' > "$FAKE/.gitignore"
git -C "$FAKE" add seed.txt .gitignore; git -C "$FAKE" commit -qm seed
FAKE="$(cd "$FAKE" && pwd -P)"
WT="$FAKE/.claude/worktrees"; mkdir -p "$WT"
cp "$REPO_ROOT/scripts/git-ops.sh" "$FAKE/scripts/"
cp "$REPO_ROOT/scripts/lib/worktree-changes.sh" "$FAKE/scripts/lib/"
cp "$REPO_ROOT/.claude/hooks/heartbeat-worktree-slot.sh" "$FAKE/.claude/hooks/"
chmod +x "$FAKE/scripts/"*.sh "$FAKE/.claude/hooks/"*.sh
GO="$FAKE/scripts/git-ops.sh"
HOOK="$FAKE/.claude/hooks/heartbeat-worktree-slot.sh"

( cd "$FAKE" && "$GO" claim p9450 hook >/dev/null 2>&1 ) || true
S=""
for c in "$WT"/w*/.lock; do [[ -f "$c" ]] && S="$(basename "$(dirname "$c")")"; done
[[ -n "$S" ]] || { echo "FATAL: could not claim a slot in the scratch repo"; exit 1; }
SP="$WT/$S"

age() {  # expire every liveness input: dead heartbeat, no stamp
  sed "s|^HEARTBEAT=.*|HEARTBEAT=$OLD|" "$SP/.lock" > "$SP/.lock.tmp" && mv -f "$SP/.lock.tmp" "$SP/.lock"
  rm -f "$SP/.activity"
  # a dead PID too: the w4 case is a dead lock PID with a live writer
  sed "s|^PID=.*|PID=999999|" "$SP/.lock" > "$SP/.lock.tmp" && mv -f "$SP/.lock.tmp" "$SP/.lock"
}
state_of() { ( cd "$FAKE" && "$GO" status "$S" 2>/dev/null ) | awk '/^State/{print $2}'; }
fire() { ( cd / && printf '%s' "$1" | "$HOOK" ) >/dev/null 2>&1; }
jbash() {  # $1=cwd $2=command -> hook payload for a Bash call
  python3 -c 'import json,sys;print(json.dumps({"session_id":"x","cwd":sys.argv[1],"tool_name":"Bash","tool_input":{"command":sys.argv[2]}}))' "$1" "$2"
}
jtool() {  # $1=cwd $2=tool $3=field $4=value
  python3 -c 'import json,sys;print(json.dumps({"session_id":"x","cwd":sys.argv[1],"tool_name":sys.argv[2],"tool_input":{sys.argv[3]:sys.argv[4]}}))' "$1" "$2" "$3" "$4"
}

expect_read() {  # $1=label $2=payload
  age; fire "$2"
  if [[ ! -e "$SP/.activity" && "$(state_of)" == "ORPHAN" ]]; then pass "read: $1 leaves the dead slot untouched (ORPHAN, no stamp)"
  else fail "read: $1 stamped the slot (state $(state_of), .activity $( [[ -e $SP/.activity ]] && echo present || echo absent))"; fi
}
expect_write() {  # $1=label $2=payload
  age; fire "$2"
  if [[ -s "$SP/.activity" && "$(state_of)" == "LIVE" ]]; then pass "write: $1 stamps the slot and it reads LIVE (dead PID)"
  else fail "write: $1 did NOT stamp the slot (state $(state_of))"; fi
}

echo "--- precondition: dead PID and expired heartbeat read ORPHAN ---"
age
[[ "$(state_of)" == "ORPHAN" ]] && pass "aged slot with a dead PID reads ORPHAN" || fail "precondition: aged slot reads $(state_of)"

echo "--- reads must not stamp ---"
expect_read "Read tool on a slot file"        "$(jtool "$FAKE" Read file_path "$SP/seed.txt")"
expect_read "Grep tool with a slot path"      "$(jtool "$FAKE" Grep path "$SP")"
expect_read "Glob tool with a slot path"      "$(jtool "$FAKE" Glob path "$SP")"
expect_read "Bash cat of a slot file"         "$(jbash "$FAKE" "cat .claude/worktrees/$S/seed.txt")"
expect_read "Bash grep -rn in the slot"       "$(jbash "$FAKE" "grep -rn seed $SP")"
expect_read "Bash ls of the slot"             "$(jbash "$FAKE" "ls -la $SP")"
expect_read "Bash git -C <slot> log"          "$(jbash "$FAKE" "git -C $SP log --oneline -5")"
expect_read "Bash git -C <slot> status"       "$(jbash "$FAKE" "git -C $SP status --short")"
expect_read "Bash git -C <slot> diff | head"  "$(jbash "$FAKE" "git -C $SP diff | head -20")"
expect_read "Bash cd <slot> && git log"       "$(jbash "$FAKE" "cd $SP && git log -1")"
expect_read "Bash git -C <slot> rev-parse"    "$(jbash "$FAKE" "git -C $SP rev-parse HEAD")"
expect_read "Bash git -C <slot> show"         "$(jbash "$FAKE" "git -C $SP show HEAD --stat")"

echo "--- writes must stamp (and ambiguity counts as a write) ---"
expect_write "Write tool"                      "$(jtool "$FAKE" Write file_path "$SP/new.txt")"
expect_write "Edit tool"                       "$(jtool "$FAKE" Edit file_path "$SP/seed.txt")"
expect_write "NotebookEdit tool"               "$(jtool "$FAKE" NotebookEdit notebook_path "$SP/n.ipynb")"
expect_write "Bash with cwd in the slot"       "$(jbash "$SP" "make build")"
expect_write "Bash git -C <slot> commit"       "$(jbash "$FAKE" "git -C $SP commit -m x")"
expect_write "Bash git -C <slot> add"          "$(jbash "$FAKE" "git -C $SP add seed.txt")"
expect_write "Bash git -C <slot> checkout"     "$(jbash "$FAKE" "git -C $SP checkout -b x")"
expect_write "Bash cd <slot> && git commit"    "$(jbash "$FAKE" "cd $SP && git commit -am y")"
expect_write "Bash redirect into the slot"     "$(jbash "$FAKE" "echo hi > $SP/out.txt")"
expect_write "Bash unknown command naming slot" "$(jbash "$FAKE" "frobnicate $SP")"
expect_write "Bash read piped into a write"    "$(jbash "$FAKE" "cat $SP/seed.txt && rm $SP/seed.txt")"

echo "--- review fixes (M4): cwd alone, compound reads, output flags ---"
expect_read "Bash ls with cwd in the slot"           "$(jbash "$SP" "ls -la")"
expect_read "Bash git log with cwd in the slot"      "$(jbash "$SP" "git log --oneline -3")"
expect_read "Bash cat <slot file> > /tmp/out"        "$(jbash "$FAKE" "cat $SP/seed.txt > /tmp/p1450-hook-out.txt")"
expect_read "Bash sort -o /tmp/x reading the slot"   "$(jbash "$FAKE" "sort -o /tmp/p1450-hook-sorted.txt $SP/seed.txt")"
expect_write "Bash sort -o writing INTO the slot"    "$(jbash "$FAKE" "sort -o $SP/sorted.txt /tmp/in.txt")"
expect_write "Bash diff --output=<slot file>"        "$(jbash "$FAKE" "git diff --output=$SP/d.patch")"
expect_write "Bash tree -o <slot file>"              "$(jbash "$FAKE" "tree -o $SP/t.txt /tmp")"
expect_read "Bash read in slot piped to a write elsewhere" "$(jbash "$FAKE" "cat $SP/seed.txt && echo done > /tmp/p1450-hook-done.txt")"
expect_write "Bash cd <slot> then a redirect"        "$(jbash "$FAKE" "cd $SP && echo hi > out2.txt")"
expect_write "Bash make with cwd in the slot (control)" "$(jbash "$SP" "make build")"
expect_read "Bash 2>&1 on a read does not become a write" "$(jbash "$FAKE" "ls $SP 2>&1")"

echo "--- control: activity elsewhere does not mark the slot ---"
expect_read "Edit of a file outside every slot" "$(jtool "$FAKE" Edit file_path "$FAKE/seed.txt")"

echo "--- the w4 regression: dead lock PID + a fresh write still reads LIVE ---"
age
[[ "$(state_of)" == "ORPHAN" ]] || fail "w4 precondition: slot should read ORPHAN, got $(state_of)"
fire "$(jtool "$FAKE" Edit file_path "$SP/seed.txt")"
[[ "$(state_of)" == "LIVE" ]] && pass "w4: dead PID + fresh Edit stays LIVE" || fail "w4: dead PID + fresh Edit reads $(state_of)"

echo "--- advance proof: a second write moves the stamp forward ---"
age
fire "$(jtool "$FAKE" Write file_path "$SP/a.txt")"
first="$(cat "$SP/.activity" 2>/dev/null)"
sleep 1.1
fire "$(jtool "$FAKE" Write file_path "$SP/b.txt")"
second="$(cat "$SP/.activity" 2>/dev/null)"
[[ -n "$first" && -n "$second" && "$first" != "$second" ]] && pass "a later Write advances .activity ($first -> $second)" \
  || fail "a later Write did not advance .activity ($first / $second)"
fire "$(jbash "$FAKE" "cat $SP/seed.txt")"
[[ "$(cat "$SP/.activity" 2>/dev/null)" == "$second" ]] && pass "a later read leaves .activity unchanged" \
  || fail "a later read moved .activity"

echo "P1450 activity hook: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
