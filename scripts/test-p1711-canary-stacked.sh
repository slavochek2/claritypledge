#!/usr/bin/env bash
# P1711: canary_base_contained (scripts/lib/canary-stacked.sh) allows a cross-feature canary edit only on a
# branch stacked on that feature. Each case builds its own throwaway repository; nothing touches this one.
# Review round 17: commits on a pN branch name pN in their subject (the repo convention, feat(pN): ...),
# because only such commits count (Opus M2); cases 9-12 are new, and 13-15 run the real guard block from
# pre-commit-checks.sh under /bin/bash with set -e (Opus M1). Round 18: cases 16-19 (a branch's tip must be pN's
# own non-merge commit, any letter case or nesting of the branch name) and 20-22 (the guard still blocks an
# unrelated canary with the library loaded, and a broken library ends nothing).
set -uo pipefail
# Round 18 (Codex 4): a git hook exports GIT_DIR and GIT_INDEX_FILE, and they override the fixture's own repository.
for v in $(git rev-parse --local-env-vars 2>/dev/null); do unset "$v"; done
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="$HERE/lib/canary-stacked.sh"
# shellcheck source=lib/canary-stacked.sh
source "$LIB"
fail=0
check() { # <name> <expected exit> <actual exit>
    if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (expected $2, got $3)"; fail=1; fi
}
fresh() {
    T=$(mktemp -d); cd "$T" || exit 2
    git init -q -b main . && git config user.email t@example.com && git config user.name t
    git commit -q --allow-empty -m base
}
commit_on() { git checkout -q "$1" && git commit -q --allow-empty -m "$2"; }
done_with() { cd / && rm -rf "${T:?}"; }

# 1. Stacked: p100 has its own commit, and p200 is built on top of it.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "stacked branch is allowed" 0 $?
done_with

# 2. Known-bad control: p100 has a commit this branch does not.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
commit_on feature/p100-base "feat(p100): later"; git checkout -q feature/p200-top
canary_base_contained p100; check "base moved on: blocked" 1 $?
done_with

# 3. Unrelated feature: p100 forked from main separately.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q main; git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "unrelated branch: blocked" 1 $?
done_with

# 4. No branch for the feature at all.
fresh; git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "no branch: blocked" 1 $?
done_with

# 5. A branch just created from main has no commits of its own and is an ancestor of everything.
fresh; git branch feature/p100-new; git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "empty branch: blocked" 1 $?
done_with

# 6. Two branches for the feature (a fix branch too); one is not contained.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
git checkout -q main; git checkout -q -b fix/p100-other; commit_on fix/p100-other "fix(p100): three"
git checkout -q feature/p200-top
canary_base_contained p100; check "one of two branches outside: blocked" 1 $?
done_with

# 7. A prefix is not a match: p10 must not pick up p100's branch.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p10; check "p10 does not match p100's branch" 1 $?
done_with

# 8. Underscore spelling of a branch name counts too.
fresh; git checkout -q -b feature/p100_base; commit_on feature/p100_base "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "underscore branch name is found" 0 $?
done_with

# 9. Opus M2: p100 has no branch; one made at this branch's HEAD has commits past main, but none names p100.
fresh; git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
commit_on feature/p200-top "feat(p200): more"; git branch feature/p100-throwaway HEAD
canary_base_contained p100; check "throwaway branch at HEAD: blocked" 1 $?
git branch -f feature/p100-throwaway HEAD~1
canary_base_contained p100; check "throwaway branch at HEAD~1: blocked" 1 $?
done_with

# 10. Gemini 2: local main is behind origin/main, which already holds p100's commit; past origin/main the branch
#     has nothing of its own, so it is not counted as stacked.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git update-ref refs/remotes/origin/main feature/p100-base
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "nothing past origin/main: blocked" 1 $?
done_with

# 11. Control for 10: origin/main exists and is level with main; the stacked branch is allowed.
fresh; git update-ref refs/remotes/origin/main main
git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
canary_base_contained p100; check "origin/main level with main: allowed" 0 $?
done_with

# 12. Opus L1: a feat/ branch and a bare feature/pN are found, so an active one outside blocks a contained one.
fresh; git checkout -q -b feature/p100-old; commit_on feature/p100-old "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
git checkout -q -b feat/p100-active feature/p100-old; commit_on feat/p100-active "feat(p100): newer"
git checkout -q feature/p200-top
canary_base_contained p100; check "feat/ branch outside: blocked" 1 $?
git branch -D -q feat/p100-active; git checkout -q -b feature/p100 feature/p100-old
commit_on feature/p100 "feat(p100): newer"; git checkout -q feature/p200-top
canary_base_contained p100; check "bare feature/p100 outside: blocked" 1 $?
done_with

# 16. Round 18 (Opus M1): this branch merged its base, and the base branch is gone. A branch made at this HEAD is a
#     merge whose subject names p100, and one made after a later commit ends in p200's work: both are blocked.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q main; git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
git merge -q --no-ff --no-edit feature/p100-base; git branch -D -q feature/p100-base
git branch feature/p100-throwaway HEAD
canary_base_contained p100; check "throwaway at a merge of the base: blocked" 1 $?
commit_on feature/p200-top "feat(p200): after the merge"; git branch -f feature/p100-throwaway HEAD
canary_base_contained p100; check "throwaway at this branch's own commit: blocked" 1 $?
done_with

# 17. Round 18 (Codex 3, Opus M1): never stacked; a commit body here mentions P100. A p100 branch made at it is blocked.
fresh; git checkout -q -b feature/p200-top
git commit -q --allow-empty -m "feat(p200): two" -m "Unlike P100's approach, this keeps one copy."
git branch feature/p100-throwaway HEAD
canary_base_contained p100; check "a body that mentions p100 is not p100's work: blocked" 1 $?
done_with

# 18. Control for 16: the real shape. This branch merged its base, the base branch is still there and ends in p100's
#     own commit: allowed.
fresh; git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
git checkout -q main; git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
git merge -q --no-ff --no-edit feature/p100-base; commit_on feature/p200-top "feat(p200): more"
canary_base_contained p100; check "base merged in and still a branch: allowed" 0 $?
done_with

# 19. Round 18 (Opus, round-17 L1 remainder): an uppercase or nested branch name outside blocks a contained one.
fresh; git checkout -q -b feature/p100-old; commit_on feature/p100-old "feat(p100): one"
git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
git checkout -q -b feature/P100-active feature/p100-old; commit_on feature/P100-active "feat(P100): newer"
git checkout -q feature/p200-top
canary_base_contained p100; check "uppercase branch outside: blocked" 1 $?
git branch -D -q feature/P100-active; git checkout -q -b feature/p100-a/b feature/p100-old
commit_on feature/p100-a/b "feat(p100): newer"; git checkout -q feature/p200-top
canary_base_contained p100; check "nested branch outside: blocked" 1 $?
done_with

# 13-15, 20-22. The real guard block, run under /bin/bash with set -e as pre-commit-checks.sh runs it. The block
# loads the library from next to the script it lives in (_pcc_self), so each fixture has a scripts/ directory.
BLOCK=$(mktemp); RUNNER=$(mktemp)
awk '/^STAGED_CANARY_TESTS=/{on=1} on{print} on && /^fi$/{exit}' "$HERE/pre-commit-checks.sh" > "$BLOCK"
cat > "$RUNNER" <<EOF
set -e
RED=''; GREEN=''; YELLOW=''; NC=''
ERRORS=0
_pcc_self="\$PWD/scripts/pre-commit-checks.sh"
STAGED_FILES=\$(git diff --cached --name-only)
. "$BLOCK"
echo "ERRORS=\$ERRORS"
EOF
guard() { /bin/bash "$RUNNER" 2>&1 | grep -E '^ERRORS=' || echo "ERRORS=aborted"; }
stage_canary() { echo "// $1" > "src/tests/$1" && git add "src/tests/$1"; }
in_progress_spec() { printf -- '---\nstatus: in-progress\n---\n' > "features/$1_x.md"; }
stacked_fixture() { # p100 in progress with its branch inside feature/p200-top; library optional
    fresh; mkdir -p scripts src/tests features
    git checkout -q -b feature/p100-base; commit_on feature/p100-base "feat(p100): one"
    git checkout -q -b feature/p200-top; commit_on feature/p200-top "feat(p200): two"
    in_progress_spec p100
}
check "guard block extracted" 1 "$(grep -c 'canary_base_contained' "$BLOCK" | awk '{print ($1 > 0)}')"

# 13. Library missing: the script keeps going, and the branch's own canary still passes.
stacked_fixture; stage_canary p200-own.test.ts
check "library missing, own canary: passes" "ERRORS=0" "$(guard)"
done_with

# 14. Library missing: another in-progress feature's canary is one error, and the script still ends normally.
stacked_fixture; stage_canary p100-other.test.ts
check "library missing, stacked canary: blocked" "ERRORS=1" "$(guard)"
done_with

# 15. Library present: the same stacked edit is allowed.
stacked_fixture; mkdir -p scripts/lib && cp "$LIB" scripts/lib/; stage_canary p100-other.test.ts
check "library present, stacked canary: allowed" "ERRORS=0" "$(guard)"
done_with

# 20. Round 18 (Opus L1): library present, an unrelated in-progress feature's canary is still blocked.
stacked_fixture; mkdir -p scripts/lib && cp "$LIB" scripts/lib/; in_progress_spec p300; stage_canary p300-other.test.ts
check "library present, unrelated canary: blocked" "ERRORS=1" "$(guard)"
done_with

# 21. Round 18 (Opus L1): a stacked canary and an unrelated one in one commit: blocked.
stacked_fixture; mkdir -p scripts/lib && cp "$LIB" scripts/lib/; in_progress_spec p300
stage_canary p100-other.test.ts; stage_canary p300-other.test.ts
check "stacked and unrelated together: blocked" "ERRORS=1" "$(guard)"
done_with

# 22. Round 18 (Opus L5): a library that does not parse turns the exception off; the script still ends normally.
stacked_fixture; mkdir -p scripts/lib && printf 'canary_base_contained() { return 0\n' > scripts/lib/canary-stacked.sh
stage_canary p100-other.test.ts
check "broken library, stacked canary: blocked, no abort" "ERRORS=1" "$(guard)"
done_with
rm -f "$BLOCK" "$RUNNER"

[ "$fail" -eq 0 ] && echo "all passed" || echo "FAILED"
exit "$fail"
