#!/usr/bin/env bash
# test-p1662-finish-skip-check.sh — canary for P1662.
#
# /finish may skip its code review only when nothing has changed since the reviewed HEAD.
# The old rule (a code entry with sha == HEAD) skipped after an uncommitted edit, so the
# edit shipped unreviewed. Runs in a throwaway clone.
#
#   skip       reviewed at HEAD, clean tree                    -> 0
#   artifacts  only the worktree's untracked .lock/node_modules -> 0
#   dirty      an uncommitted edit after the review            -> 1   <- the bug
#   staged     a staged change, worktree restored              -> 1
#   deleted    a tracked file deleted                          -> 1
#   untracked  a new untracked source file                     -> 1
#   spaced     an edit to a file whose name has a space        -> 1
#   other      a code entry for another pN at this HEAD        -> 1
#   flags      assume-unchanged / skip-worktree hiding an edit  -> 1
#   branch     a stamp recorded on another branch              -> 1
#   submodule  any submodule at all (this repo has none)       -> 1
#   dirty-review / legacy  a review stamped on a dirty tree, or with no clean field -> 1
#   spec       an edit under features/ only                    -> 0
#   moved      HEAD moved since the review                     -> 1
#   nostamp    no review stamp at all                          -> 1
#
# FINISH_SKIP_CHECK names another implementation, to prove this canary fails on the
# old sha-only rule. Output contract: no redirect tokens in status lines.
set -eu

SRC="$(cd "$(dirname "$0")/.." && pwd)"
UNDER_TEST="${FINISH_SKIP_CHECK:-$SRC/scripts/finish-skip-check.sh}"
PN=p999662

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone -q "$SRC" "$work/repo"
cd "$work/repo"
git config user.email canary@example.com
git config user.name canary
mkdir -p src
echo "export const a = 1;" > src/p1662-canary.ts
echo "export const b = 1;" > "src/p1662 spaced.ts"
git add src/p1662-canary.ts "src/p1662 spaced.ts" && git commit -q -m canary
helper="$work/finish-skip-check.sh"
cp "$UNDER_TEST" "$helper"

common="$(git rev-parse --path-format=absolute --git-common-dir)"
stamp() {  # stamp PN SHA
  # A clean-tree review, as the stamp writers record it via --tree-state.
  printf '{"type":"code","pn":"%s","branch":"%s","sha":"%s","clean":%s,"timestamp":"2026-11-11T00:00:00Z","issues_found":0,"issues_fixed":0}\n' "$1" "$(git rev-parse --abbrev-ref HEAD)" "$2" "${3:-true}" >> "$common/.finish-reviewed"
}
# Throwaway clone only: put the tree back to HEAD between cases.
restore() { git reset -q --hard HEAD; rm -f src/new-file.ts .lock; rm -rf node_modules; }

fails=0
check() {  # check NAME WANT_RC [PN]
  local name="$1" want="$2" p="${3:-$PN}" rc=0 out
  out="$(bash "$helper" "$p" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$want" ]]; then echo "ok   ${name}: rc=${rc}"; else
    echo "FAIL ${name}: wanted rc=${want}, got rc=${rc}"; printf '%s\n' "$out" | sed 's/^/     /'; fails=$((fails + 1)); fi
}

check "nostamp: no review recorded" 1
[[ "$(bash "$helper" --tree-state)" == "true" ]] && echo "ok   tree-state: clean tree reads true" || { echo "FAIL tree-state: clean tree"; fails=$((fails + 1)); }
stamp "$PN" "$(git rev-parse HEAD)"
check "skip: reviewed at HEAD, clean tree" 0
check "other: an entry for another pN" 1 p999000

touch .lock; mkdir -p node_modules
check "artifacts: only .lock and node_modules untracked" 0
restore

# Review round 2 (Opus): a review of a DIRTY tree must never license a skip later.
: > "$common/.finish-reviewed"; stamp "$PN" "$(git rev-parse HEAD)" false
check "dirty-review: a review recorded on a dirty tree" 1
printf '{"type":"code","pn":"%s","branch":"%s","sha":"%s"}\n' "$PN" "$(git rev-parse --abbrev-ref HEAD)" "$(git rev-parse HEAD)" > "$common/.finish-reviewed"
check "legacy: an entry with no clean field" 1
: > "$common/.finish-reviewed"; stamp "$PN" "$(git rev-parse HEAD)"

mkdir -p features && echo "- [x] ticked after the review" >> features/p1662_canary_spec.md
check "spec: a spec edit does not force a code re-review" 0
rm -f features/p1662_canary_spec.md
mkdir -p tools/kanban && ln -s /tmp tools/kanban/node_modules
check "artifacts: a nested node_modules link" 0
rm -f tools/kanban/node_modules
echo "x" > /dev/null; echo "export const a = 9;" > src/p1662-canary.ts
[[ "$(bash "$helper" --tree-state)" == "false" ]] && echo "ok   tree-state: dirty tree reads false" || { echo "FAIL tree-state: dirty tree"; fails=$((fails + 1)); }
restore

echo "export const a = 2; // after the review" > src/p1662-canary.ts
check "dirty: uncommitted edit after the review" 1
restore

echo "export const a = 3;" > src/p1662-canary.ts
git add src/p1662-canary.ts
git show HEAD:src/p1662-canary.ts > src/p1662-canary.ts   # worktree back to HEAD, index still changed
check "staged: a staged change with the worktree restored" 1
restore

rm src/p1662-canary.ts
check "deleted: a tracked file deleted" 1
restore

echo "export const n = 1;" > src/new-file.ts
check "untracked: a new untracked source file" 1
restore

echo "export const b = 2;" > "src/p1662 spaced.ts"
check "spaced: edit to a file whose name has a space" 1
restore

# Review round 2 (Codex, Gemini): ways git status itself can be made blind to an edit.
git update-index --assume-unchanged src/p1662-canary.ts
echo "export const a = 5;" > src/p1662-canary.ts
check "assume-unchanged: a flagged file's edit" 1
git update-index --no-assume-unchanged src/p1662-canary.ts; restore

git update-index --skip-worktree src/p1662-canary.ts
echo "export const a = 6;" > src/p1662-canary.ts
check "skip-worktree: a flagged file's edit" 1
git update-index --no-skip-worktree src/p1662-canary.ts; restore

mkdir -p node_modules/pkg && echo "module.exports = 1" > node_modules/pkg/index.js
check "artifacts: a populated node_modules" 0
restore

stamp_branch() {  # a stamp for this pN and HEAD, but recorded on another branch
  printf '{"type":"code","pn":"%s","branch":"feature/other","sha":"%s","timestamp":"2026-11-11T00:00:00Z"}\n' "$PN" "$(git rev-parse HEAD)" > "$common/.finish-reviewed"
}
stamp_branch
check "branch: a review recorded on another branch" 1
stamp "$PN" "$(git rev-parse HEAD)"

# A submodule told to be ignored must not hide its new commit.
sub="$work/sub"; git init -q "$sub"; ( cd "$sub" && git -c user.email=c@t -c user.name=c commit -q --allow-empty -m one )
git -c protocol.file.allow=always submodule -q add "$sub" lib && git commit -q -m "add submodule"
stamp "$PN" "$(git rev-parse HEAD)"
check "submodule: any submodule means the review runs" 1
( cd lib && git -c user.email=c@t -c user.name=c commit -q --allow-empty -m two )
git config submodule.lib.ignore all
check "submodule: a new submodule commit under ignore=all" 1
git config --unset submodule.lib.ignore; ( cd lib && git reset -q --hard HEAD~1 )
echo "x" > lib/code.js; ( cd lib && git add code.js && git -c user.email=c@t -c user.name=c commit -q -m code )
git add lib && git commit -q -m "bump submodule"; stamp "$PN" "$(git rev-parse HEAD)"
check "submodule: still reviewed after a bump" 1
( cd lib && git update-index --assume-unchanged code.js ); echo "y" > lib/code.js
check "submodule: an edit hidden by assume-unchanged inside it" 1
( cd lib && git update-index --no-assume-unchanged code.js && git reset -q --hard HEAD )

echo "export const a = 4;" > src/p1662-canary.ts && git add src/p1662-canary.ts && git commit -q -m edit
check "moved: HEAD moved since the review" 1

if [[ "$fails" -eq 0 ]]; then echo "P1662 canary: all cases passed"; else echo "P1662 canary: ${fails} case(s) failed"; fi
exit "$fails"
