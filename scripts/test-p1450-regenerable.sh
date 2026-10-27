#!/bin/bash
# test-p1450-regenerable.sh — P1450 item 2
#
# ship RETAINED two finished slots (w8/p1449 and w2/p1442, 2026-10-09) because the
# regenerable-output exemption in worktree-changes.sh matched top-level names only:
#   !! tools/kanban/test-results/        (ignored, nested)
#   ?? tools/kanban/node_modules         (a hydration symlink, NOT ignored at that depth)
# Both are regenerable output, not work. This asserts they are exempt at any depth, that
# ship's own teardown (teardown_worktree_if_clean) now removes such a slot, and, as the
# controls that keep the exemption honest, that real work next to them still blocks.
#
# Exit 0: all assertions pass.  Exit 1: at least one failed.
set -u
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
REPO_ROOT_REAL="$(cd "$(dirname "$0")/.." && pwd -P)"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
FN="$SCRATCH/fns.sh"
for f in reap_worktree_servers teardown_worktree_if_clean; do
  awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" { on=1 } on { print } on && /^}/ { on=0 }' \
    "$REPO_ROOT_REAL/scripts/git-ops.sh" >> "$FN"
  grep -q "^$f() {" "$FN" || { echo "FAIL  could not extract $f from git-ops.sh"; exit 1; }
done

REPO="$SCRATCH/repo"; mkdir -p "$REPO"; REPO="$(cd "$REPO" && pwd -P)"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email t@t.t; git -C "$REPO" config user.name t
mkdir -p "$REPO/tools/kanban"
echo seed > "$REPO/seed.txt"; echo k > "$REPO/tools/kanban/package.json"
printf '/tools/kanban/test-results/\n' > "$REPO/.gitignore"
git -C "$REPO" add -A . >/dev/null; git -C "$REPO" commit -qm seed
WT="$REPO/.claude/worktrees"; mkdir -p "$WT"
n=0
mk() { n=$((n+1)); git -C "$REPO" worktree add -q -b "feature/p1450-$n" "$WT/w$n" main; W="$WT/w$n"; }
changes() { bash -c 'source "$1"; worktree_user_change_lines "$2"' _ "$REPO_ROOT_REAL/scripts/lib/worktree-changes.sh" "$1"; }
teardown() { bash -c 'source "$1"; source "$2"; REPO_ROOT="$3"; teardown_worktree_if_clean "$4" ship' _ \
  "$REPO_ROOT_REAL/scripts/lib/worktree-changes.sh" "$FN" "$REPO" "$1" 2>&1; }

# 1. the two shapes that stranded w8 and w2
mk
mkdir -p "$W/tools/kanban/test-results"; echo r > "$W/tools/kanban/test-results/.last-run.json"
ln -s "$SCRATCH" "$W/tools/kanban/node_modules"
out="$(changes "$W")"
[[ -z "$out" ]] && pass "1: nested ignored test-results/ and nested node_modules symlink are not work" \
  || fail "1: counted as work: $out"
teardown "$W" >/dev/null
[[ ! -d "$W" ]] && pass "1: ship's teardown removes a slot whose only extras are those (the w8/w2 shape)" \
  || fail "1: ship teardown RETAINED the slot"

# 2. S1: UNTRACKED is never disposable, whatever its name, at any depth. Only a symlinked node_modules.
mk
mkdir -p "$W/a/b/playwright-report" "$W/a/coverage" "$W/pkg/node_modules/x" "$W/a/__pycache__"
echo x > "$W/a/b/playwright-report/i.html"; echo x > "$W/a/coverage/c.json"; echo x > "$W/pkg/node_modules/x/i.js"; echo x > "$W/a/__pycache__/m.pyc"
out="$(changes "$W")"
for nm in playwright-report coverage node_modules __pycache__; do
  [[ "$out" == *"$nm"* || "$out" == *"a/"* || "$out" == *"pkg/"* ]] || true
done
[[ "$out" == *"a/"* && "$out" == *"pkg/"* ]] && pass "2: untracked nested playwright-report/coverage/__pycache__ and a REAL node_modules dir are work" \
  || fail "2: untracked regenerable-named dirs exempted: '$out'"

# 3. S1: an untracked directory of 'only regenerable output' is still work
mk
mkdir -p "$W/newtool/test-results" "$W/newtool/dist"; echo x > "$W/newtool/test-results/a"; echo x > "$W/newtool/dist/b"
out="$(changes "$W")"
[[ -n "$out" ]] && pass "3: an untracked dir containing only test-results/dist files is work" || fail "3: exempted: '$out'"

# controls: real work beside regenerable output must still block
mk
mkdir -p "$W/tools/kanban/test-results"; echo r > "$W/tools/kanban/test-results/x"
echo mine > "$W/tools/kanban/notes.txt"
out="$(changes "$W")"
[[ "$out" == *"notes.txt"* ]] && pass "4: control — an untracked file beside test-results/ still counts" || fail "4: real file hidden by the exemption: '$out'"
teardown "$W" >/dev/null
[[ -d "$W" ]] && pass "4: control — ship teardown still RETAINS that slot" || fail "4: ship teardown deleted a slot holding notes.txt"

mk
mkdir -p "$W/newtool/test-results"; echo x > "$W/newtool/test-results/a"; echo mine > "$W/newtool/real.ts"
out="$(changes "$W")"
[[ -n "$out" ]] && pass "5: control — an untracked dir with a real file next to test-results/ still counts" || fail "5: whole dir exempted despite real.ts"

mk
mkdir -p "$W/src"; echo mine > "$W/src/test-results-notes.md"
out="$(changes "$W")"
[[ -n "$out" ]] && pass "6: control — a file merely NAMED like test-results is work (match is on the path component, not a substring)" \
  || fail "6: substring match exempted a real file"

mk
ln -s "$SCRATCH" "$W/tools/my-link"
out="$(changes "$W")"
[[ "$out" == *"my-link"* ]] && pass "7: control — an arbitrary untracked symlink is still work" || fail "7: arbitrary symlink exempted"

# H1 (end-of-build review): a real FILE or hand-written source named like regenerable output is work
mk
echo mine > "$W/dist"
out="$(changes "$W")"
[[ "$out" == *"dist"* ]] && pass "8: an untracked regular FILE named dist is work" || fail "8: file named dist exempted: '$out'"
mk
mkdir -p "$W/my_work"; echo mine > "$W/my_work/coverage"
out="$(changes "$W")"
[[ "$out" == *"my_work"* ]] && pass "9: an untracked file my_work/coverage is work" || fail "9: leaf file named coverage exempted: '$out'"
mk
mkdir -p "$W/src/coverage"; echo mine > "$W/src/coverage/handwritten.ts"
out="$(changes "$W")"
[[ -n "$out" ]] && pass "10: hand-written source inside an untracked coverage/ dir is work" || fail "10: handwritten.ts hidden: '$out'"
mk
mkdir -p "$W/.pytest_cache" "$W/.ruff_cache" "$W/.mypy_cache"; echo x > "$W/.pytest_cache/a"; echo x > "$W/.ruff_cache/a"; echo x > "$W/.mypy_cache/a"
printf '.pytest_cache/\n.ruff_cache/\n.mypy_cache/\n' > "$W/.git-ignore-tmp"; mkdir -p "$W/.git-info"
git -C "$W" config core.excludesFile "$W/.git-ignore-tmp"
out="$(changes "$W" | grep -v git-ignore-tmp | grep -v git-info)"
git -C "$REPO" config --unset core.excludesFile
[[ -z "$out" ]] && pass "11: ignored .pytest_cache/.ruff_cache/.mypy_cache are exempt" || fail "11: cache dirs counted: '$out'"
mk
mkdir -p "$W/.pytest_cache"; echo x > "$W/.pytest_cache/a"
out="$(changes "$W")"
[[ -n "$out" ]] && pass "12: control — an UNTRACKED (not ignored) .pytest_cache is not exempt" || fail "12: untracked cache exempted"

# ---- S1 required cases ----
mk
mkdir -p "$W/src/coverage"; echo mine > "$W/src/coverage/handwritten.js"
[[ -n "$(changes "$W")" ]] && pass "S1a: untracked src/coverage/handwritten.js is work" || fail "S1a: hidden"
mk
mkdir -p "$W/tools/dist"; echo '{}' > "$W/tools/dist/x.json"
[[ -n "$(changes "$W")" ]] && pass "S1b: untracked tools/dist/x.json is work" || fail "S1b: hidden"
mk
mkdir -p "$W/dist"; echo mine > "$W/dist/out.txt"
[[ -n "$(changes "$W")" ]] && pass "S1c: untracked dist/ file is work" || fail "S1c: hidden"
mk
mkdir -p "$W/my_work/coverage"; echo mine > "$W/my_work/coverage/f"
[[ -n "$(changes "$W")" ]] && pass "S1d: untracked my_work/coverage file is work" || fail "S1d: hidden"
mk
mkdir -p "$W/tools/kanban/test-results" "$W/.pytest_cache"; echo r > "$W/tools/kanban/test-results/r.json"; echo c > "$W/.pytest_cache/c"
printf 'tools/kanban/test-results/\n.pytest_cache/\n' > "$W/.git-ignore-s1"
git -C "$W" config core.excludesFile "$W/.git-ignore-s1"
out="$(changes "$W" | grep -v git-ignore-s1)"; git -C "$REPO" config --unset core.excludesFile
[[ -z "$out" ]] && pass "S1e: IGNORED tools/kanban/test-results/ and .pytest_cache are clean" || fail "S1e: ignored regenerable counted: '$out'"
mk
ln -s "$SCRATCH" "$W/node_modules"
[[ -z "$(changes "$W")" ]] && pass "S1f: untracked SYMLINKED node_modules is clean" || fail "S1f: symlinked node_modules counted"
mk
mkdir -p "$W/node_modules"; echo x > "$W/node_modules/f"
[[ -n "$(changes "$W")" ]] && pass "S1g: untracked REAL-dir node_modules is work" || fail "S1g: hidden"
# literal components: a glob-looking ignored dir name must not expand to match something regenerable
mk
mkdir -p "$W/d*" "$W/dist"; echo mine > "$W/d*/f"; echo x > "$W/dist/g"
printf 'd*/\n' > "$W/.git-ignore-s1b"; git -C "$W" config core.excludesFile "$W/.git-ignore-s1b"
out="$(changes "$W" | grep -v git-ignore-s1b)"; git -C "$REPO" config --unset core.excludesFile
[[ "$out" == *"d*"* ]] && pass "S1h: glob characters in an ignored name are compared literally (d*/ is not dist)" || fail "S1h: glob expanded or ignored entry hidden: '$out'"
# find/git error fails toward dirty: an unreadable untracked directory
mk
mkdir -p "$W/locked"; echo mine > "$W/locked/f"; chmod 000 "$W/locked"
out="$(changes "$W")"; chmod 755 "$W/locked"
[[ -n "$out" ]] && pass "S1i: an unreadable untracked dir counts as work" || fail "S1i: unreadable dir read as clean"

echo "P1450 regenerable exemption: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
