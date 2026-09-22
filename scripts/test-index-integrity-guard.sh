#!/bin/bash
# Canary for the index-integrity guard in scripts/lib/run-quiet.sh (P1273).
#
# The defect, measured 2026-09-09: git exports GIT_DIR and GIT_INDEX_FILE to its hooks,
# and those OVERRIDE `git -C <path>`. scripts/test-git-ops-gc.sh drove the real repo that
# way, so under the hook every fixture operation wrote into the COMMITTING worktree's
# index — 6 staged paths became 1497, reconstructing an old tree whose specs exist in no
# current ref. The unrelated gates then refused the commit over files it never touched,
# and the canary exited 0 the entire time.
#
# Scenario 4 is the one that matters: it reproduces the real mechanism end-to-end rather
# than simulating it, so this canary keeps meaning something if the guard is rewritten.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE 2>/dev/null || true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$ROOT/scripts/lib/run-quiet.sh"
[ -f "$LIB" ] || { echo "FAIL  missing $LIB"; exit 1; }

pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }

SCRATCH=$(mktemp -d); trap 'rm -rf "$SCRATCH"' EXIT
git init -q "$SCRATCH/repo"
cd "$SCRATCH/repo"
git config user.email c@example.com; git config user.name c
echo a > a.txt; echo b > b.txt; echo c > c.txt
git add a.txt; git commit -qm seed
git add b.txt   # b.txt is the staged baseline for every scenario

. "$LIB"

echo "-- 1. a step that leaves the index alone passes --"
before=$(git diff --cached --name-only | wc -l | tr -d ' ')
if run_quiet "inert step" true >/dev/null 2>&1; then ok "inert step returns 0"; else bad "inert step returned non-zero"; fi
[ "$(git diff --cached --name-only | wc -l | tr -d ' ')" = "$before" ] \
  && ok "index untouched by the inert step" || bad "index moved under an inert step"

echo "-- 2. a step that STAGES a file is refused, even though the step itself succeeds --"
# This is the whole point: the P1273 instance exited 0 while corrupting its caller.
# Control FIRST: the bare command must succeed. Without this the assertion below passes
# just as well when the staging command fails for its own reasons (reproduced by review:
# `git add /nonexistent-path` satisfied it with the guard never firing), and the message
# claiming "step's own exit was 0" verified nothing.
if git add c.txt >/dev/null 2>&1; then ok "control: the staging command itself succeeds"; else bad "control: staging command failed — scenario 2 would be vacuous"; fi
git reset -q HEAD -- c.txt >/dev/null 2>&1
_before_n=$(git diff --cached --raw | wc -l | tr -d ' ')
if run_quiet "sneaky stager" git add c.txt >/dev/null 2>&1; then
  bad "guard let an index-mutating step through"
else
  ok "guard refused a step that staged c.txt (step's own exit was 0)"
fi
_after_n=$(git diff --cached --raw | wc -l | tr -d ' ')
[ "$_after_n" != "$_before_n" ] && ok "control: the index really moved ($_before_n -> $_after_n)" \
                               || bad "control: index never moved — scenario 2 proved nothing"

echo "-- 3. a step that UNSTAGES is refused too (mutation is not only growth) --"
git add c.txt >/dev/null 2>&1
_before_n=$(git diff --cached --raw | wc -l | tr -d ' ')
if run_quiet "sneaky unstager" git reset -q HEAD -- c.txt >/dev/null 2>&1; then
  bad "guard let an unstaging step through"
else
  ok "guard refused a step that unstaged c.txt"
fi
_after_n=$(git diff --cached --raw | wc -l | tr -d ' ')
[ "$_after_n" != "$_before_n" ] && ok "control: the unstage really happened ($_before_n -> $_after_n)" \
                               || bad "control: index never moved — scenario 3 proved nothing"

echo "-- 3b. an allowlisted label may mutate (gate 7c: the guard must not block real work) --"
git add c.txt >/dev/null 2>&1
INDEX_MUTATORS=("legit stager")
if run_quiet "legit stager" git reset -q HEAD -- c.txt >/dev/null 2>&1; then
  ok "allowlisted label permitted to mutate"
else
  bad "allowlist did not exempt the label"
fi
INDEX_MUTATORS=()

echo "-- 3c. content-only, mode-only and round-trip mutations (--raw, not --name-only) --"
# All three passed the name-only fingerprint. The content case is the dangerous one: a
# redirected step staging unreviewed content under names the author already approved is
# silent all the way into the commit, where a changed file LIST would have been loud.
git add c.txt >/dev/null 2>&1
echo "changed" > c.txt
if run_quiet "content changer" git add c.txt >/dev/null 2>&1; then
  bad "guard blind to a content-only restage (same path, different blob)"
else
  ok "guard catches a content-only restage"
fi
if run_quiet "mode changer" git add --chmod=+x c.txt >/dev/null 2>&1; then
  bad "guard blind to a mode-only restage"
else
  ok "guard catches a mode-only restage"
fi
if run_quiet "round tripper" bash -c 'git add z.txt 2>/dev/null; git reset -q HEAD -- z.txt 2>/dev/null; true' >/dev/null 2>&1; then
  ok "round trip leaving the index identical is correctly allowed"
else
  ok "round trip refused (also acceptable — it did touch the index)"
fi

echo "-- 4. THE REAL MECHANISM: exported hook env overrides 'git -C', guard catches it --"
# Build a second repo with a big tree, then run a 'canary' that drives it via `git -C`
# WITHOUT unsetting the hook environment — exactly test-git-ops-gc.sh's shape.
git init -q "$SCRATCH/other"
( cd "$SCRATCH/other" && git config user.email c@example.com && git config user.name c
  for i in $(seq 1 40); do echo "$i" > "f$i.txt"; done
  git add . && git commit -qm "other repo tree" ) >/dev/null 2>&1

cat > "$SCRATCH/fixture-canary.sh" <<'EOF'
#!/bin/bash
# Deliberately does NOT unset the hook's git env — this is the bug under test.
git -C "$1" checkout -q -b fixture 2>/dev/null
git -C "$1" add -A 2>/dev/null
exit 0    # reports success, like the real one did
EOF
chmod +x "$SCRATCH/fixture-canary.sh"

# 4a (P1346). With the hook's env pointing at this repo's DEFAULT index, run_quiet now
# drops it, so the redirect never reaches this index at all.
baseline=$(git diff --cached --raw | shasum)
export GIT_DIR="$SCRATCH/repo/.git"
export GIT_INDEX_FILE="$SCRATCH/repo/.git/index"
if run_quiet "unfixed canary (P1260 shape)" "$SCRATCH/fixture-canary.sh" "$SCRATCH/other" >/dev/null 2>&1; then
  ok "4a: default-index redirect is neutralised — the step passes and cannot reach this index"
else
  bad "4a: run_quiet still let a canary redirect into the default index"
fi
[ "$(git diff --cached --raw | shasum)" = "$baseline" ] \
  && ok "4a: this repo's staged content is byte-identical afterwards" \
  || bad "4a: the default index was modified"
# Control: outside run_quiet the same fixture DOES corrupt it (the mechanism is live here).
cp "$SCRATCH/repo/.git/index" "$SCRATCH/index.bak"
"$SCRATCH/fixture-canary.sh" "$SCRATCH/other" >/dev/null 2>&1
[ "$(git diff --cached --raw | shasum)" != "$baseline" ] \
  && ok "4a control: the same fixture outside run_quiet corrupts the index (not vacuous)" \
  || bad "4a control: fixture could not corrupt the index — 4a proved nothing"
cp "$SCRATCH/index.bak" "$SCRATCH/repo/.git/index"
git -C "$SCRATCH/other" checkout -q - 2>/dev/null; git -C "$SCRATCH/other" branch -q -D fixture 2>/dev/null

# 4b. A TEMPORARY index (pathspec / -a commit) is passed through on purpose, so a step
# that writes to it must still be caught by the guard — the P1273 mechanism, end to end.
cp "$SCRATCH/repo/.git/index" "$SCRATCH/next-index.lock"
export GIT_INDEX_FILE="$SCRATCH/next-index.lock"
baseline=$(git diff --cached --name-only | wc -l | tr -d ' ')
if run_quiet "unfixed canary (temp index)" "$SCRATCH/fixture-canary.sh" "$SCRATCH/other" >/dev/null 2>&1; then
  bad "4b: guard missed a canary that wrote into the temporary index"
else
  ok "4b: guard caught the write into a temporary index"
fi
after=$(git diff --cached --name-only | wc -l | tr -d ' ')
[ "$after" != "$baseline" ] \
  && ok "4b control: the temporary index really was corrupted ($baseline -> $after)" \
  || bad "4b control: temporary index never moved — 4b proved nothing"
unset GIT_DIR GIT_INDEX_FILE

echo "-- 5. P1346: a step's 'git init' cannot re-initialise the hook's worktree git-dir --"
# The DECOY is a throwaway repo with a linked worktree, never this repository (P1131: the
# first version of that canary pointed at the real git-dir and destroyed it four times).
DECOY="$SCRATCH/decoy"
git init -q "$DECOY/main"
( cd "$DECOY/main" && git config user.email c@example.com && git config user.name c \
  && git commit -q --allow-empty -m seed && git worktree add -q "$DECOY/wt" ) >/dev/null 2>&1
decoy_bare() { git --git-dir="$DECOY/main/.git" config --get core.bare; }
[ "$(decoy_bare)" = "false" ] && ok "control: decoy starts with core.bare=false" \
                               || bad "control: decoy did not start non-bare"
export GIT_DIR="$DECOY/main/.git/worktrees/wt"
run_quiet "canary that inits a scratch repo" git init -q "$SCRATCH/scratch-init" >/dev/null 2>&1
[ "$(decoy_bare)" = "false" ] && ok "core.bare still false after a step ran 'git init' under a worktree GIT_DIR" \
                               || bad "a run_quiet step flipped the decoy's core.bare to true"
# Control that the mechanism is live here: the same command OUTSIDE run_quiet does flip it.
git init -q "$SCRATCH/scratch-init-2" >/dev/null 2>&1
if [ "$(decoy_bare)" = "true" ]; then
  ok "control: the bare 'git init' outside run_quiet does flip core.bare (scenario 5 is not vacuous)"
else
  bad "control: the mechanism did not reproduce — scenario 5 proved nothing"
fi
unset GIT_DIR

echo "-- 6. P1346: a TEMPORARY GIT_INDEX_FILE is passed through; the DEFAULT one is dropped --"
export GIT_INDEX_FILE="$SCRATCH/some-index"
if run_quiet "index passthrough" bash -c '[ "${GIT_INDEX_FILE:-}" = "$0" ]' "$SCRATCH/some-index" >/dev/null 2>&1; then
  ok "6a: a temporary GIT_INDEX_FILE reaches the step (privacy scans read the commit's index)"
else
  bad "6a: run_quiet dropped a temporary GIT_INDEX_FILE"
fi
for _idx in "$SCRATCH/repo/.git/index" ".git/index"; do
  export GIT_INDEX_FILE="$_idx"
  if run_quiet "default index dropped" bash -c '[ -z "${GIT_INDEX_FILE+x}" ]' >/dev/null 2>&1; then
    ok "6b: the default index ($_idx) is not passed to the step"
  else
    bad "6b: the default index ($_idx) still reaches the step"
  fi
done
unset GIT_INDEX_FILE

echo ""
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
