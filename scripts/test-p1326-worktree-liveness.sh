#!/bin/bash
# test-p1326-worktree-liveness.sh — P1326
#
# A worktree slot in active use read ORPHAN, and the session-start report called it
# READY TO SHIP. P1268's suite was green throughout, because it pre-bound
# CP_SESSION_ID before `claim` — a sequence no agent produces. This suite starts
# where the real caller starts (decisions.md 2026-09-09):
#
#   * `claim` runs with NO CP_SESSION_ID (what an agent's Bash actually has);
#   * the hook is driven with hook-shaped stdin JSON, in the three shapes that
#     failed in production — cwd in slot, cwd on main with an in-slot file_path,
#     and a Bash `cd <slot> && …` from main;
#   * the destructive paths are exercised on the dirty tree they destroyed.
#
# Every positive case has a control that must NOT flip, so a suite that passes
# everything proves something (gate 7c).
#
# Exit 0: all assertions pass.  Exit 1: at least one failed.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset CP_SESSION_ID

OUTER_INDEX_PRE=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  OUTER_INDEX_PRE="$(git diff --cached --name-only 2>/dev/null | sort || true)"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PASS=0; FAIL=0
green='\033[0;32m'; red='\033[0;31m'; nc='\033[0m'
pass() { echo -e "${green}PASS${nc}  $1"; PASS=$((PASS+1)); }
fail() { echo -e "${red}FAIL${nc}  $1"; FAIL=$((FAIL+1)); }

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
OLD="1990-01-01T00:00:00Z"

# --- a real repo, the real scripts, the real hook ----------------------------
FAKE="$SCRATCH/repo"
mkdir -p "$FAKE/scripts" "$FAKE/.claude/hooks"
git -C "$FAKE" init -q -b main
git -C "$FAKE" config user.email t@t.t
git -C "$FAKE" config user.name t
echo seed > "$FAKE/seed.txt"
printf '.private/\ndist/\n.env.local\n.env.test.local\n.activity\n.activity.*\n' > "$FAKE/.gitignore"
git -C "$FAKE" add seed.txt .gitignore; git -C "$FAKE" commit -qm seed
FAKE="$(cd "$FAKE" && pwd -P)"
WT="$FAKE/.claude/worktrees"; mkdir -p "$WT"
cp "$REPO_ROOT/scripts/git-ops.sh" "$REPO_ROOT/scripts/pipeline-strandings.sh" "$FAKE/scripts/"
mkdir -p "$FAKE/scripts/lib" && cp "$REPO_ROOT/scripts/lib/worktree-changes.sh" "$FAKE/scripts/lib/"
cp "$REPO_ROOT/.claude/hooks/heartbeat-worktree-slot.sh" "$FAKE/.claude/hooks/"
chmod +x "$FAKE/scripts/"*.sh "$FAKE/.claude/hooks/"*.sh
GO="$FAKE/scripts/git-ops.sh"
HOOK="$FAKE/.claude/hooks/heartbeat-worktree-slot.sh"

claim_slot() {  # $1=pN $2=slug -> prints slot
  # Never swallow a setup failure: a sandbox that forbids `ps`, a missing lib, a
  # bad fixture all surface here, and "could not claim" alone hides which.
  local _err _rc=0
  _err="$( cd "$FAKE" && "$GO" claim "$1" "$2" 2>&1 >/dev/null )" || _rc=$?
  [[ $_rc -eq 0 ]] || echo "claim $1 exited $_rc: $_err" >&2
  local c
  for c in "$WT"/w*/.lock; do
    [[ -f "$c" ]] || continue
    grep -q "^P_NUMBER=$1$" "$c" && { basename "$(dirname "$c")"; return; }
  done
}
age() {  # $1=slot — expire every liveness input
  # Portable in-place edit: BSD and GNU sed disagree on -i.
  sed "s|^HEARTBEAT=.*|HEARTBEAT=$OLD|" "$WT/$1/.lock" > "$WT/$1/.lock.tmp" && mv -f "$WT/$1/.lock.tmp" "$WT/$1/.lock"
  rm -f "$WT/$1/.activity"
}
ensure_slot() {  # a section destroyed by an earlier failure must not make later ones pass vacuously
  if [[ ! -f "$SP/.lock" ]]; then
    fail "(slot $S was destroyed by an earlier section — re-claiming so the next section still tests something)"
    rm -f "$SP/uncommitted-migration.sql" 2>/dev/null
    S="$(claim_slot "p91$((RANDOM % 90 + 10))" reclaimed)"; SP="$WT/$S"
    [[ -n "$S" ]] || { echo "FATAL: re-claim failed"; exit 1; }
  fi
}
state_of() { ( cd "$FAKE" && "$GO" status "$1" 2>/dev/null ) | awk '/^State/{print $2}'; }
fire() {  # $1=payload cwd (kept for readability) $2=json
  # Run from a NEUTRAL directory: the hook must resolve everything from the payload,
  # not from its own $PWD (a mutation ignoring payload cwd survived when this cd'd
  # into $1 — review finding).
  ( cd / && printf '%s' "$2" | "$HOOK" ) >/dev/null 2>&1
}

S="$(claim_slot p9101 liveness)"
[[ -n "$S" ]] || { echo "FATAL: could not claim a slot in the scratch repo"; exit 1; }
SP="$WT/$S"

echo "--- precondition: the production state ---"
sess_line="$(sed -n 's/^SESSION_ID=//p' "$SP/.lock")"
[[ "$sess_line" != "real-session-uuid" ]] && pass "claim without CP_SESSION_ID binds a fallback id ($sess_line)" \
  || fail "claim bound the session id — this is not the production sequence"
age "$S"
[[ "$(state_of "$S")" == "ORPHAN" ]] && pass "an aged slot reads ORPHAN before any activity" \
  || fail "precondition: aged slot reads $(state_of "$S")"

echo "--- 1. activity from the real hook makes the slot LIVE ---"
age "$S"
fire "$SP" "{\"session_id\":\"real-session-uuid\",\"cwd\":\"$SP\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$SP/seed.txt\"}}"
[[ "$(state_of "$S")" == "LIVE" ]] && pass "1a: Edit with cwd in slot -> LIVE" || fail "1a: Edit with cwd in slot -> $(state_of "$S")"

age "$S"
fire "$FAKE" "{\"session_id\":\"real-session-uuid\",\"cwd\":\"$FAKE\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$SP/seed.txt\"}}"
[[ "$(state_of "$S")" == "LIVE" ]] && pass "1b: Edit with cwd on MAIN, file in slot -> LIVE" || fail "1b: cwd on main, in-slot file_path -> $(state_of "$S")"

age "$S"
fire "$FAKE" "{\"session_id\":\"real-session-uuid\",\"cwd\":\"$FAKE\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd .claude/worktrees/$S && git status\"}}"
[[ "$(state_of "$S")" == "LIVE" ]] && pass "1c: Bash 'cd <slot> && …' from main -> LIVE" || fail "1c: Bash cd into slot from main -> $(state_of "$S")"

age "$S"
fire "$FAKE" "{\"session_id\":\"x\",\"cwd\":\"$FAKE\",\"tool_name\":\"Grep\",\"tool_input\":{\"pattern\":\"x\",\"path\":\".claude/worktrees/$S/src\"}}"
[[ "$(state_of "$S")" == "LIVE" ]] && pass "1d: Grep with a RELATIVE in-slot path from main -> LIVE" || fail "1d: relative path field -> $(state_of "$S")"

age "$S"
fire "$FAKE" "{\"session_id\":\"x\",\"cwd\":\"$FAKE\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd .claude/worktrees/\\\"$S\\\" && ls\"}}"
[[ "$(state_of "$S")" == "LIVE" ]] && pass "1e: Bash with the slot component quoted (cd .claude/worktrees/\"wN\") -> LIVE" || fail "1e: quoted slot component -> $(state_of "$S")"

for form in "./.claude/worktrees/$S" "\$CLAUDE_PROJECT_DIR/.claude/worktrees/$S" "$FAKE/.claude/worktrees/$S/"; do
  age "$S"
  cmdjson="$(python3 -c 'import json,sys;print(json.dumps({"session_id":"x","cwd":sys.argv[1],"tool_name":"Bash","tool_input":{"command":"ls "+sys.argv[2]}}))' "$FAKE" "$form")"
  fire "$FAKE" "$cmdjson"
  [[ "$(state_of "$S")" == "LIVE" ]] && pass "1f: Bash 'ls $form' from main -> LIVE" || fail "1f: 'ls $form' -> $(state_of "$S")"
done

echo "--- 2. control: activity elsewhere does not mark the slot ---"
age "$S"
fire "$FAKE" "{\"session_id\":\"x\",\"cwd\":\"$FAKE\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$FAKE/seed.txt\"}}"
fire "$FAKE" "{\"session_id\":\"x\",\"cwd\":\"$FAKE\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls .claude/worktrees/w99 /other/.claude/worktrees-not/$S\"}}"
[[ "$(state_of "$S")" == "ORPHAN" ]] && pass "2: events outside the slot leave it ORPHAN" || fail "2: out-of-slot events flipped it to $(state_of "$S")"

echo "--- 3. abandon never destroys uncommitted work without the nonce ---"
age "$S"
echo "precious" > "$SP/uncommitted-migration.sql"
( cd "$FAKE" && "$GO" abandon "$S" ) >/dev/null 2>&1; rc=$?
[[ $rc -ne 0 ]] && pass "3a: abandon on an ORPHAN dirty slot refuses (exit $rc)" || fail "3a: abandon on a dirty slot exited 0"
[[ -f "$SP/uncommitted-migration.sql" ]] && pass "3b: the uncommitted file still exists" || fail "3b: abandon DELETED uncommitted work"

ensure_slot
echo "--- 3g. a WRONG nonce does not bypass the dirty guard ---"
age "$S"; echo "precious" > "$SP/uncommitted-migration.sql"
( cd "$FAKE" && "$GO" abandon "$S" --nonce 0000000000000000 ) >/dev/null 2>&1; rc=$?
[[ $rc -ne 0 && -f "$SP/uncommitted-migration.sql" ]] && pass "3g: abandon --nonce <wrong> on a dirty slot refuses (exit $rc)" \
  || fail "3g: wrong nonce bypassed the dirty guard (exit $rc)"
rm -f "$SP/uncommitted-migration.sql"
ensure_slot

echo "--- 3h. ignored files can be the only copy of work ---"
age "$S"; mkdir -p "$SP/.private"; echo "notes" > "$SP/.private/notes.md"
( cd "$FAKE" && "$GO" abandon "$S" ) >/dev/null 2>&1; rc=$?
[[ $rc -ne 0 && -f "$SP/.private/notes.md" ]] && pass "3h: gitignored .private/notes.md makes abandon refuse (exit $rc)" \
  || fail "3h: ignored work treated as disposable (exit $rc)"
rm -rf "$SP/.private"; ensure_slot
age "$S"; mkdir -p "$SP/.private/test-auth" "$SP/dist"; echo "{}" > "$SP/.private/test-auth/state.json"; echo x > "$SP/dist/a.js"
worktree_out="$(bash -c 'source "$1"; if worktree_has_user_changes "$2"; then echo dirty; else echo clean; fi' _ "$FAKE/scripts/lib/worktree-changes.sh" "$SP")"
[[ "$worktree_out" == "clean" ]] && pass "3i: control — regenerated output (dist/, .private/test-auth/) is not work" \
  || fail "3i: control — generated output counted as work ($worktree_out)"
rm -rf "$SP/.private" "$SP/dist"

echo "--- 3d. a symlink a session created is work, not bookkeeping ---"
rm -f "$SP/uncommitted-migration.sql"; age "$S"
ln -s seed.txt "$SP/my-link"
( cd "$FAKE" && "$GO" abandon "$S" ) >/dev/null 2>&1; rc=$?
[[ $rc -ne 0 && -L "$SP/my-link" ]] && pass "3d: abandon refuses when the only change is a session-made symlink" \
  || fail "3d: session symlink treated as bookkeeping (exit $rc)"
rm -f "$SP/my-link"
ensure_slot

echo "--- 3e. second layer: a write the dirty check missed is still not force-deleted ---"
age "$S"
# An OLD but valid stamp: a fresh one would make the slot LIVE, and abandon would
# refuse on liveness — passing 3e for the wrong reason (caught by running 3e
# against the pre-fix commit, where it wrongly stayed green).
act_before="1991-02-03T04:05:06Z"; printf '%s\n' "$act_before" > "$SP/.activity"
cp "$FAKE/scripts/lib/worktree-changes.sh" "$SCRATCH/wc.bak"
printf 'worktree_has_user_changes() { return 1; }\n' > "$FAKE/scripts/lib/worktree-changes.sh"
ln -s "$SCRATCH" "$SP/node_modules" 2>/dev/null
echo "written after the check" > "$SP/raced.txt"
( cd "$FAKE" && "$GO" abandon "$S" ) >/dev/null 2>&1; rc=$?
cp "$SCRATCH/wc.bak" "$FAKE/scripts/lib/worktree-changes.sh"
[[ $rc -ne 0 && -f "$SP/raced.txt" ]] && pass "3e: without the nonce, abandon never forces — git's own refusal keeps the file (exit $rc)" \
  || fail "3e: raced file lost or abandon exited 0 (exit $rc)"
[[ -f "$SP/.lock" && -L "$SP/node_modules" && "$(head -1 "$SP/.activity" 2>/dev/null)" == "$act_before" ]] \
  && pass "3f: the refused abandon restored the lock, the hydration symlink AND the activity stamp" \
  || fail "3f: refused abandon lost the lock, symlink or activity stamp (a slot must never read LESS alive)"
rm -f "$SP/raced.txt" "$SP/node_modules"
ensure_slot
echo "--- 4. nonce-less adopt never takes over a dirty slot ---"
age "$S"
echo "precious" > "$SP/uncommitted-migration.sql"
before_sess="$(sed -n 's/^SESSION_ID=//p' "$SP/.lock")"
( cd "$SP" && "$GO" adopt "$S" --session intruder ) >/dev/null 2>&1; rc=$?
after_sess="$(sed -n 's/^SESSION_ID=//p' "$SP/.lock")"
[[ $rc -ne 0 ]] && pass "4a: adopt on an aged dirty slot refuses (exit $rc)" || fail "4a: adopt on a dirty slot exited 0"
[[ "$before_sess" == "$after_sess" ]] && pass "4b: SESSION_ID unchanged" || fail "4b: SESSION_ID changed $before_sess -> $after_sess"

ensure_slot
echo "--- 5. the report never advises shipping in-flight work ---"
# Stub the closure gate as PASSING: this section tests the report's decision, not
# the gate. (Gate 7b: the gate itself is outside this file's reach.)
printf '#!/bin/bash\nexit 0\n' > "$FAKE/scripts/ship-gates.sh"; chmod +x "$FAKE/scripts/ship-gates.sh"
report() { ( cd "$FAKE" && ./scripts/pipeline-strandings.sh --all 2>&1 ); }

out="$(report)"   # aged + dirty
[[ "$out" != *"READY TO SHIP"*"$S"* && "$out" == *"IN FLIGHT"*"$S"* ]] && pass "5a: dirty slot -> IN FLIGHT, not READY TO SHIP" \
  || fail "5a: dirty slot reported as: $out"

rm -f "$SP/uncommitted-migration.sql"; age "$S"
fire "$SP" "{\"session_id\":\"s\",\"cwd\":\"$SP\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$SP/seed.txt\"}}"
out="$(report)"   # LIVE + clean
[[ "$out" != *"READY TO SHIP"*"$S"* && "$out" == *"IN FLIGHT"*"$S"* ]] && pass "5b: LIVE slot -> IN FLIGHT, not READY TO SHIP" \
  || fail "5b: live slot reported as: $out"

ln -s "$SCRATCH" "$SP/node_modules"; age "$S"
out="$(report)"   # aged + clean (bookkeeping only)
[[ "$out" == *"READY TO SHIP"*"$S"* ]] && pass "5c: control — aged clean slot (.lock + node_modules only) still READY TO SHIP" \
  || fail "5c: control — a finished slot is no longer surfaced: $out"

ensure_slot
echo "--- 6. no remove hint for a closed spec's dirty worktree ---"
PN="$(sed -n 's/^P_NUMBER=//p' "$SP/.lock")"
mkdir -p "$FAKE/features/done/2026-01-01"; echo x > "$FAKE/features/done/2026-01-01/${PN}_liveness.md"
echo "late work" > "$SP/late.txt"; age "$S"
out="$(report)"
[[ "$out" == *"STRANDED WORKTREE $S"*"NOT removable yet"* && "$out" != *"remove with:"* ]] && pass "6a: dirty slot of a closed spec gets no 'remove --force' hint" || fail "6a: remove hint printed for dirty slot: $out"
rm -f "$SP/late.txt"; age "$S"
out="$(report)"
[[ "$out" == *"STRANDED WORKTREE"*"$S"*"remove with:"* ]] && pass "6b: control — clean aged slot of a closed spec still gets the hint" \
  || fail "6b: control — stranded hint vanished: $out"
rm -rf "$FAKE/features"

ensure_slot
echo "--- 7. worktrees outside the slot dir are reported ---"
OUTSIDE="$SCRATCH/scratchpad-control"
git -C "$FAKE" worktree add -q --detach "$OUTSIDE" main
out="$(report)"
[[ "$out" == *"UNMANAGED WORKTREE"*"scratchpad-control"* ]] && pass "7a: detached worktree outside .claude/worktrees -> UNMANAGED" \
  || fail "7a: outside worktree not reported: $out"
[[ "$out" != *"UNMANAGED WORKTREE"*"/$S"* ]] && pass "7b: control — managed slot is not reported UNMANAGED" \
  || fail "7b: managed slot double-reported: $out"
git -C "$FAKE" worktree remove --force "$OUTSIDE" >/dev/null 2>&1 || true

ensure_slot
echo "--- 5d. unmeasurable liveness is never advice ---"
age "$S"; chmod -x "$FAKE/scripts/git-ops.sh"
out="$(report)"
chmod +x "$FAKE/scripts/git-ops.sh"
[[ "$out" != *"READY TO SHIP"* && "$out" == *"could not be measured"* ]] && pass "5d: git-ops status unavailable -> held as IN FLIGHT, not READY TO SHIP" \
  || fail "5d: unmeasurable liveness produced: $out"

echo "--- 7c. a slot-looking name that is not wN is unmanaged ---"
git -C "$FAKE" worktree add -q "$WT/w9evil" -b feature/p9199-evil main 2>/dev/null
out="$(report)"
[[ "$out" == *"UNMANAGED WORKTREE"*"w9evil"* ]] && pass "7c: .claude/worktrees/w9evil is UNMANAGED, not a managed slot" || fail "7c: w9evil treated as managed: $out"
git -C "$FAKE" worktree remove --force "$WT/w9evil" >/dev/null 2>&1 || true

ensure_slot
echo "--- 3c. control: a clean aged slot is still removable without a nonce ---"
age "$S"
( cd "$FAKE" && "$GO" abandon "$S" ) >/dev/null 2>&1; rc=$?
[[ $rc -eq 0 && ! -d "$SP" ]] && pass "3c: abandon removes a clean ORPHAN slot (.lock + node_modules only)" \
  || fail "3c: clean slot not removed (exit $rc, dir exists: $([[ -d "$SP" ]] && echo yes || echo no))"

post=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  post="$(git diff --cached --name-only 2>/dev/null | sort || true)"
fi
[[ "$post" == "$OUTER_INDEX_PRE" ]] || fail "this canary LEAKED into the caller's index"

echo ""
echo "P1326: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
