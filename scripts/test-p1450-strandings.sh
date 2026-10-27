#!/bin/bash
# test-p1450-strandings.sh — P1450 item 6, pipeline-strandings.sh
#
#   * The report no longer tells a SESSION to run shell cleanup. It printed
#     "git worktree remove --force ... && git branch -D <branch>", sessions relayed it to
#     the founder, and the founder (rightly) refused to be the one typing it. It now prints
#     the tidy verdicts and says the session itself runs `git-ops.sh tidy --apply`.
#   * Its open-spec test was `! ls features/pN_*.md features/*/pN_*.md`, which exits non-zero
#     whenever EITHER glob misses, so an OPEN spec read as closed and the old report advised
#     `git branch -D` on a live branch (reproduced 2026-10-27). Both layouts are covered:
#     the spec in a features/ subfolder, and the spec at the features/ top level, each with
#     a stale copy in the done folder.
#
# Exit 0: all assertions pass.  Exit 1: at least one failed.
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR CP_SESSION_ID
REPO_REAL="$(git rev-parse --show-toplevel)"
PASS=0; FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
R="$SCRATCH/repo"; mkdir -p "$R/scripts/lib" "$R/features/sub" "$R/features/done/2026-10"
git -C "$R" init -q -b main
git -C "$R" config user.email t@t.t; git -C "$R" config user.name t; git -C "$R" config commit.gpgsign false
echo seed > "$R/seed.txt"
cp "${P1450_GIT_OPS:-$REPO_REAL/scripts/git-ops.sh}" "$R/scripts/git-ops.sh"
cp "${P1450_STRANDINGS:-$REPO_REAL/scripts/pipeline-strandings.sh}" "$R/scripts/pipeline-strandings.sh"
cp "$REPO_REAL/scripts/lib/worktree-changes.sh" "$R/scripts/lib/"
printf '#!/bin/bash\nexit 0\n' > "$R/scripts/ship-gates.sh"        # gate stubbed as passing: this file tests the report
chmod +x "$R/scripts/"*.sh
DONE_DIR="$R/features/done/2026-10"
for pn in 9601 9602 9603; do
  printf -- '---\nstatus: week\n---\n# p%s\n' "$pn" > "$DONE_DIR/p${pn}_x.md"   # a closed copy exists for all three
done
printf -- '---\nstatus: in-progress\n---\n# p9601 open in a subfolder\n' > "$R/features/sub/p9601_x.md"
printf -- '---\nstatus: in-progress\n---\n# p9603 open at top level\n' > "$R/features/p9603_x.md"
git -C "$R" add -A . >/dev/null; git -C "$R" commit -qm seed
R="$(cd "$R" && pwd -P)"
WT="$R/.claude/worktrees"; mkdir -p "$WT"
stamp_for() { date -v-"$1"H +%Y%m%d%H%M 2>/dev/null || date -d "-$1 hours" +%Y%m%d%H%M; }
age() {
  local gd; gd="$(git -C "$1" rev-parse --absolute-git-dir)"; touch -t "$(stamp_for "$2")" "$gd/index" "$gd/HEAD" "$gd/logs/HEAD"
  find "$1" -path "$1/.git" -prune -o -type f -exec touch -t "$(stamp_for "$2")" {} + 2>/dev/null   # working files are a liveness input too
}

# w1: spec OPEN in a subfolder + stale closed copy.   w3: spec OPEN at the top level + closed copy.
# w2: genuinely closed (only the closed copy), branch shipped and on the shipped-tips record.
for pair in "w1 feature/p9601-x" "w2 feature/p9602-x" "w3 feature/p9603-x"; do
  set -- $pair
  git -C "$R" branch "$2" main; git -C "$R" worktree add -q "$WT/$1" "$2"
done
git -C "$R" worktree add -q --detach "$SCRATCH/scratchpad-wt" main      # unmanaged
git -C "$R" branch feature/p9609-lonely main                            # branch, no slot, with work of its own
LW="$SCRATCH/lonely-tmp"; git -C "$R" worktree add -q "$LW" feature/p9609-lonely
echo mine > "$LW/lonely.txt"; git -C "$LW" add lonely.txt; git -C "$LW" commit -qm "p9609: unshipped work"
git -C "$R" worktree remove --force "$LW"
printf '2026-10-27T10:00:00Z\tp9602\tfeature/p9602-x\t%s\t%s\n' "$(git -C "$R" rev-parse feature/p9602-x)" "$(git -C "$R" rev-parse main)" >> "$R/.git/cp-shipped-tips"
for w in w1 w2 w3; do age "$WT/$w" 13; done; age "$SCRATCH/scratchpad-wt" 13
touch -t "$(stamp_for 13)" "$R/.git/logs/refs/heads/feature/p9609-lonely"

OUT="$( cd "$R" && ./scripts/pipeline-strandings.sh --all 2>&1 )"
echo "--- report ---"; printf '%s\n' "$OUT" | sed 's/^/    /'
echo "--- assertions ---"

line_for() { printf '%s\n' "$OUT" | grep -E "^ +[A-Z ,]+ +$1 " | head -1; }
for slot in w1 w3; do
  l="$(line_for "$slot")"
  if printf '%s' "$l" | grep -q "STRANDED"; then fail "$slot: an OPEN spec (with a stale closed copy) still reads as closed: $l"
  else pass "$slot: an open spec with a stale closed copy is not reported as closed"; fi
done
l="$(line_for w2)"
printf '%s' "$l" | grep -q "STRANDED" && pass "w2: a genuinely closed spec is still reported (control: the glob fix did not hide real strandings)" \
  || fail "w2: a closed spec is no longer reported STRANDED: '$l'"

if printf '%s\n' "$OUT" | grep -qE 'git worktree remove|git branch -[dD]|remove with:|inspect, then:'; then
  fail "the report still tells a session to run removal commands: $(printf '%s\n' "$OUT" | grep -E 'git worktree remove|git branch -[dD]|remove with:|inspect, then:' | head -2)"
else pass "no 'git worktree remove' / 'git branch -D' / 'remove with:' advice anywhere in the report"; fi

printf '%s\n' "$OUT" | grep -q 'git-ops.sh tidy --apply' && pass "the report says the session itself runs git-ops.sh tidy --apply" \
  || fail "the report does not name tidy --apply"
printf '%s\n' "$OUT" | grep -qE '^ *REMOVE[[:space:]]+w2' && pass "the report carries tidy's verdict for the shipped, idle slot (REMOVE w2)" \
  || fail "no REMOVE verdict for w2 in the report"
printf '%s\n' "$OUT" | grep -qE '^ *ASK[[:space:]]+feature/p9609-lonely' && pass "the report carries tidy's ASK line for the slot-less branch" \
  || fail "no ASK line for the slot-less branch"

echo "--- silent when clean ---"
CLEAN="$SCRATCH/clean"; mkdir -p "$CLEAN/scripts/lib"; git -C "$CLEAN" init -q -b main
git -C "$CLEAN" config user.email t@t; git -C "$CLEAN" config user.name t; echo s > "$CLEAN/s"; git -C "$CLEAN" add s; git -C "$CLEAN" commit -qm s
cp "$R/scripts/"*.sh "$CLEAN/scripts/"; cp "$R/scripts/lib/worktree-changes.sh" "$CLEAN/scripts/lib/"
O2="$( cd "$CLEAN" && ./scripts/pipeline-strandings.sh 2>&1 )"
[[ -z "$O2" ]] && pass "a repo with nothing stranded prints nothing" || fail "clean repo printed: $O2"

echo "--- L1: a tidy that overruns its budget is TERMed as a group, then KILLed, never left orphaned ---"
HANG="$SCRATCH/hang"; mkdir -p "$HANG/scripts/lib"; git -C "$HANG" init -q -b main
git -C "$HANG" config user.email t@t; git -C "$HANG" config user.name t; echo s > "$HANG/s"; git -C "$HANG" add s; git -C "$HANG" commit -qm s
cp "$R/scripts/pipeline-strandings.sh" "$HANG/scripts/"; cp "$R/scripts/lib/worktree-changes.sh" "$HANG/scripts/lib/"
cat > "$HANG/scripts/git-ops.sh" <<'STUB'
#!/bin/bash
# stub tidy that never finishes in time: leaves a temp file and a child, cleans both on TERM
trap 'rm -f "$STUB_TMP"; [ -n "${CH:-}" ] && kill "$CH" 2>/dev/null; exit 143' TERM
: > "$STUB_TMP"
sleep 4711 & CH=$!
echo "$CH" > "$STUB_PID"
wait
STUB
chmod +x "$HANG/scripts/"*.sh
export STUB_TMP="$SCRATCH/stub-tmp" STUB_PID="$SCRATCH/stub-pid"
HOUT="$( cd "$HANG" && P1450_TIDY_BUDGET_TICKS=3 ./scripts/pipeline-strandings.sh 2>&1 )"
sleep 0.5
CHILD="$(cat "$STUB_PID" 2>/dev/null)"
if [[ -n "$CHILD" ]] && kill -0 "$CHILD" 2>/dev/null; then kill "$CHILD" 2>/dev/null; fail "L1: the overrunning tidy's child (pid $CHILD) was left running"; else pass "L1: no orphaned child after the timeout"; fi
[[ ! -e "$STUB_TMP" ]] && pass "L1: the stub's TERM trap ran (kill -9 would have leaked its temp file)" || fail "L1: temp file leaked: the tidy was KILLed without a chance to clean up"
printf '%s\n' "$HOUT" | grep -q 'time budget' && pass "L1: the report still says the verdicts were skipped" || fail "L1: no skipped-verdicts line: $HOUT"

echo "P1450 strandings: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
