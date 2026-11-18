#!/bin/bash
# test-p1705-worktree-holds.sh — P1705 section D: slots that read as finished when they are,
# without ever removing a slot the founder put on hold.
#
#   1. a slot whose only extra file is a `.env*.local` symlink is clean; a REAL file of that
#      name is a user change
#   2. tidy judges a slot without a .lock by its own .hold (valid blocks, expired does not)
#   3. teardown_worktree_if_clean (the path ship, archive-spec and park reach) keeps a clean slot with
#      a founder hold and prints the reason; it removes a clean unheld slot
#   4. `tidy --apply` in a fixture repo keeps the held slot and removes the unheld control
#
# Hermetic: builds its own fixture repo under mktemp, never touches the real repo's worktrees.
# P1705_SCRIPTS_DIR points the suite at another copy of scripts/ (used to prove it fails on
# the unmodified code). Exit 0: all pass. Exit 1: a failure. Exit 77: cannot run here.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR CP_SESSION_ID
REPO_REAL="$(git rev-parse --show-toplevel)"
SRC="${P1705_SCRIPTS_DIR:-$REPO_REAL/scripts}"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

SCRATCH="$(mktemp -d)"
trap 'chmod -R u+rwx "$SCRATCH" 2>/dev/null; rm -rf "$SCRATCH"' EXIT
R="$SCRATCH/repo"; mkdir -p "$R/scripts/lib" "$R/features/done"
git -C "$R" init -q -b main
git -C "$R" config user.email t@t.t; git -C "$R" config user.name t; git -C "$R" config commit.gpgsign false
echo seed > "$R/seed.txt"; printf 'node_modules/\n.env.local\n.env.test.local\n' > "$R/.gitignore"
cp "$SRC/git-ops.sh" "$SRC/pipeline-strandings.sh" "$R/scripts/"
cp "$REPO_REAL/scripts/ship-gates.sh" "$R/scripts/"
cp "$SRC/lib/worktree-changes.sh" "$R/scripts/lib/"
cp "$REPO_REAL/scripts/lib/gate-override.sh" "$R/scripts/lib/"
chmod +x "$R/scripts/"*.sh
git -C "$R" add -A . >/dev/null; git -C "$R" commit -qm seed
R="$(cd "$R" && pwd -P)"
WT="$R/.claude/worktrees"; mkdir -p "$WT"
GO="$R/scripts/git-ops.sh"
G() { git -C "$R" "$@"; }

stamp_for() { date -v-"$1"H +%Y%m%d%H%M 2>/dev/null || date -d "-$1 hours" +%Y%m%d%H%M; }
age() {  # $1=worktree $2=hours: backdate every idle input
  local gd; gd="$(git -C "$1" rev-parse --absolute-git-dir)"
  touch -t "$(stamp_for "$2")" "$gd/index" "$gd/HEAD" "$gd/logs/HEAD" 2>/dev/null
  find "$1" -path "$1/.git" -prune -o \( -type f -o -type l \) -exec touch -h -t "$(stamp_for "$2")" {} + 2>/dev/null
  return 0
}
slot() {  # $1=wN : a clean slot on its own branch at main
  G worktree add -q -b "feature/p9$1-x" "$WT/$1" main; echo "$WT/$1"
}
hold_file() {  # $1=slot path $2=OWNER $3=REASON
  printf 'REASON=%s\nOWNER=%s\nWRITTEN_AT=%s\nWRITTEN_ISO=x\nSTATE=EMPTY\n' "$3" "$2" "$(date +%s)" > "$1/.hold"
}
changed() { bash -c 'source "$1"; worktree_has_user_changes "$2"' _ "$R/scripts/lib/worktree-changes.sh" "$1"; }

# --- 1. the setup symlink ---------------------------------------------------------------------
echo "--- 1. .env*.local symlink vs real file ---"
S1="$(slot w1)"; : > "$SCRATCH/target"
ln -s "$SCRATCH/target" "$S1/.env.development.local"
changed "$S1" && fail "1a: a slot with only a .env.development.local symlink reads as having changes" \
  || pass "1a: a slot with only a .env.development.local symlink is clean"
S1b="$(slot w2)"; echo "SECRET=1" > "$S1b/.env.development.local"
changed "$S1b" && pass "1b: a REAL .env.development.local file still counts as a change" \
  || fail "1b: a real .env.development.local file was ignored (would be deleted with the slot)"
# the ignored (!!) branch too: a real file named like a gitignored one still counts
S1c="$(slot w3)"; echo "SECRET=1" > "$S1c/.env.test.local"; ln -s "$SCRATCH/target" "$S1c/.env.local"
changed "$S1c" && pass "1c: a real ignored .env.test.local counts even beside a symlinked .env.local" \
  || fail "1c: a real ignored .env.test.local was ignored"
S1d="$(slot w4)"; ln -s "$SCRATCH/target" "$S1d/.env.test.local"; ln -s "$SCRATCH/target" "$S1d/.env.local"
changed "$S1d" && fail "1d: ignored .env.local and .env.test.local symlinks read as changes" \
  || pass "1d: ignored .env.local and .env.test.local symlinks stay clean"

# --- 2. tidy_hold_blocks on lockless slots ----------------------------------------------------
echo "--- 2. a slot without a .lock is judged by its own .hold ---"
FN="$SCRATCH/fns.sh"
awk '/^tidy_hold_blocks\(\) \{/ { on=1 } on { print } on && /^}/ { on=0 }' "$GO" > "$FN"
grep -q '^tidy_hold_blocks() {' "$FN" || { echo "FATAL: could not extract tidy_hold_blocks"; exit 1; }
blocks() { bash -c 'source "$1"; REPO_ROOT="$2"; tidy_hold_blocks "$3"' _ "$FN" "$R" "$1"; }
S2a="$(slot w5)"; hold_file "$S2a" founder "waiting on a founder decision about the design"
[[ ! -f "$S2a/.lock" ]] || { echo "FATAL: fixture slot has a lock"; exit 1; }
blocks "$S2a" && pass "2a: lockless slot with a valid founder hold is held" || fail "2a: lockless slot with a valid hold judged not held"
S2b="$(slot w6)"; hold_file "$S2b" 2000-01-01T00:00Z "expired a long time ago, waiting on nothing"
blocks "$S2b" && fail "2b: lockless slot whose hold EXPIRED is still judged held" || pass "2b: lockless slot with an expired hold is judged by that hold (not held)"
S2c="$(slot w7)"
blocks "$S2c" && fail "2c: lockless slot with no hold judged held" || pass "2c: lockless slot with no hold is not held"

# --- 3. teardown (ship and archive-spec path) -------------------------------------------------
echo "--- 3. teardown_worktree_if_clean respects holds ---"
TFN="$SCRATCH/td.sh"
for f in reap_worktree_servers teardown_worktree_if_clean tidy_hold_blocks; do
  awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" { on=1 } on { print } on && /^}/ { on=0 }' "$GO" >> "$TFN"
  grep -q "^$f() {" "$TFN" || { echo "FATAL: could not extract $f"; exit 1; }
done
td() { bash -c 'source "$1"; source "$2"; REPO_ROOT="$3"; teardown_worktree_if_clean "$4" ship' _ "$R/scripts/lib/worktree-changes.sh" "$TFN" "$R" "$1" 2>&1; }
S3a="$(slot w8)"   # truly clean: only the hold stands between this slot and removal
hold_file "$S3a" founder "keep this design exploration open for the founder"
out="$(td "$S3a")"; rc=$?
[[ -d "$S3a" ]] && pass "3a: a clean slot with a founder hold is kept" || fail "3a: a held slot was removed"
[[ $rc -eq 1 ]] && pass "3b: teardown reports 'retained' (exit 1) for the held slot" || fail "3b: exit $rc for a held slot, wanted 1"
printf '%s' "$out" | grep -q "keep this design exploration open for the founder" \
  && pass "3c: the hold's reason is printed" || fail "3c: reason missing from output: $out"
printf '%s' "$out" | grep -q "no lock on this slot: delete .*/.hold" \
  && pass "3d: a lockless slot is told to delete its .hold (hold --clear needs a lock)" || fail "3d: no way to release in: $out"
printf '%s' "$out" | grep -q '[<>|]' && fail "3e: status output contains a redirect character: $out" || pass "3e: status output has no < > | (shell-safety contract)"
[[ -f "$S3a/.hold" ]] && pass "3f: the hold file is untouched" || fail "3f: the hold file was removed"
S3b="$(slot w9)"; ln -s "$SCRATCH/target" "$S3b/.env.development.local"
out="$(td "$S3b")"; rc=$?
{ [[ ! -d "$S3b" ]] && [[ $rc -eq 0 ]]; } && pass "3g: a clean unheld slot (setup symlink only) is removed" || fail "3g: clean unheld slot kept (rc $rc): $out"
S3d="$(slot w11)"; hold_file "$S3d" founder "a claimed slot the founder wants to look at first"
printf 'SLOT=w11\nP_NUMBER=p9\nCLAIMED_AT=1990-01-01T00:00:00Z\nNONCE=abc\n' > "$S3d/.lock"
out="$(td "$S3d")"; rc=$?
{ [[ -d "$S3d" ]] && [[ $rc -eq 1 ]]; } && pass "3i: a claimed, clean, held slot is kept" || fail "3i: claimed held slot removed or rc $rc"
printf '%s' "$out" | grep -q "hold --clear w11 --nonce" && printf '%s' "$out" | grep -q "a claimed slot the founder wants" \
  && pass "3j: the claimed slot's reason and hold --clear command are printed" || fail "3j: output: $out"
printf '%s' "$out" | grep -q '[<>|]' && fail "3k: claimed-slot output has a redirect character" || pass "3k: claimed-slot output has no < > |"
# park removes the worktree too, and the .hold lives inside it: park must not end a hold either.
S3e="$(slot w12)"; hold_file "$S3e" founder "held while the session that owns it parks"
out="$(bash -c 'source "$1"; source "$2"; REPO_ROOT="$3"; teardown_worktree_if_clean "$4" park' _ "$R/scripts/lib/worktree-changes.sh" "$TFN" "$R" "$S3e" 2>&1)"; rc=$?
{ [[ -d "$S3e" && -f "$S3e/.hold" ]] && [[ $rc -eq 1 ]]; } && pass "3l: teardown as park keeps a held slot and its .hold" || fail "3l: park teardown removed a held slot (rc $rc): $out"
park_calls="$(awk '/^cmd_park\(\) \{/ { on=1 } on && /teardown_worktree_if_clean/ { print } on && /^}/ { on=0 }' "$GO")"
{ [[ -n "$park_calls" ]] && ! printf '%s' "$park_calls" | grep -qE 'teardown_worktree_if_clean "\$dir" "park" [^|]'; } \
  && pass "3m: cmd_park calls teardown with no hold-bypass argument" || fail "3m: cmd_park teardown call: ${park_calls:-not found}"
S3c="$(slot w10)"; hold_file "$S3c" 2000-01-01T00:00Z "expired hold should not keep the slot open"
td "$S3c" >/dev/null
[[ ! -d "$S3c" ]] && pass "3h: a slot whose hold has expired is removed" || fail "3h: expired-hold slot kept"

# --- 4. tidy --apply --------------------------------------------------------------------------
echo "--- 4. tidy --apply keeps the held slot ---"
if [[ -z "$( { ps -o lstart= -p $$ 2>/dev/null || true; } | tr -d '[:space:]' )" ]]; then
  echo "SKIP: ps cannot report process start times here; section 4 NOT run"
else
  # Fresh, minimal fixture slots: all other test slots are removed first so tidy sees only these.
  for s in w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12; do
    [[ -d "$WT/$s" ]] && { G worktree remove --force "$WT/$s" >/dev/null 2>&1; G branch -D "feature/p9$s-x" >/dev/null 2>&1; }
  done
  H="$(slot w21)"; ln -s "$SCRATCH/target" "$H/.env.development.local"
  hold_file "$H" founder "waiting on the founder to inspect it"
  C="$(slot w22)"; ln -s "$SCRATCH/target" "$C/.env.development.local"
  age "$H" 13; age "$C" 13
  dry="$( cd "$R" && "$GO" tidy --all 2>&1 )"
  printf '%s\n' "$dry" | awk -F'\t' '$2=="w22" {print $1}' | grep -qx REMOVE \
    && pass "4a control: the dry run schedules the clean unheld slot for REMOVE" \
    || fail "4a control: unheld slot w22 not scheduled for REMOVE; dry run: $dry"
  printf '%s\n' "$dry" | awk -F'\t' '$2=="w21" {print $1}' | grep -qxE 'REMOVE|PARK|REMOVE_WORKTREE_KEEP_BRANCH' \
    && fail "4b: the dry run schedules the held slot for removal" || pass "4b: the dry run does not schedule the held slot"
  ( cd "$R" && "$GO" tidy --apply >/dev/null 2>&1 )
  [[ -d "$H" && -f "$H/.hold" ]] && pass "4c: apply keeps the held slot and its .hold" || fail "4c: apply removed the held slot or its hold"
  [[ ! -d "$C" ]] && pass "4d: apply removes the unheld control" || fail "4d: apply left the unheld control"
fi

echo
echo "p1705 holds: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
