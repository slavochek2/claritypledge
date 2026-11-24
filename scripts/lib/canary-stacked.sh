#!/usr/bin/env bash
# canary-stacked.sh: is another feature's branch already inside this one (P1711)?
#
# pre-commit-checks.sh refuses an edit to another in-progress feature's src/tests/pN-* file, so one
# feature cannot quietly switch off another's canary. A branch STACKED on that feature (built on top
# of it, every one of its commits already in this branch) changes its behaviour on purpose and must
# update its tests with it; it also ships after it (decisions.md 2026-10-21, P1520), so the edit is
# reviewed at that ship. This answers that one question and nothing else.
#
# pre-commit-checks.sh loads this file from next to ITSELF (the hook is the main checkout's copy), never
# from the committing worktree, so a branch cannot bring a looser copy (review round 18).
#
# canary_base_contained <pN> [<head>] [<main>]
#   exit 0 when: at least one local branch named for pN exists (feature/, feat/ or fix/, then pN alone or followed
#                by -, _ or /, in any letter case), and EVERY such branch
#                - ends in pN's own work: its tip is not a merge, and the tip's SUBJECT names pN (review round 18,
#                  Opus M1, Codex 3: a stacked branch's merge of its base, or a commit body that mentions pN, names
#                  pN too, so a branch made at this branch's HEAD would otherwise pass as pN's), and
#                - has commits past <main> and, when it exists, past origin/<main> that name pN (round 17: a stale
#                  local main would otherwise count commits that are only past it), and
#                - is an ancestor of <head>.
#   exit 1 otherwise. That includes no branch, and a branch with no pN commit of its own: one just created from main
#   or from this branch is an ancestor of everything, so it would otherwise count as stacked.
#   Not covered (round 17, Opus L1): pN work held only on a detached HEAD in another worktree, next to a stale pN branch
#   that is contained. A branch made at pN's real work (the second parent of a merge) is that work, like a stale pN
#   branch, and passes.
canary_base_contained() {
    local pnum="$1" head="${2:-HEAD}" main="${3:-main}" found=0 b base token
    case "$pnum" in p[0-9]*) ;; *) return 1 ;; esac
    token="(^|[^[:alnum:]])${pnum}([^[:alnum:]]|\$)" # a pattern, not a secret: gitleaks:allow
    while IFS= read -r b; do
        [ -n "$b" ] || continue
        found=1
        [ "$(git rev-list --parents -n1 "$b" 2>/dev/null | wc -w | tr -d ' ')" = 2 ] || return 1
        grep -qiE "$token" <<< "$(git log -1 --format=%s "$b" 2>/dev/null)" || return 1
        for base in "$main" "origin/$main"; do
            [ "$base" = "$main" ] || git rev-parse --verify -q "refs/remotes/$base" >/dev/null || continue
            [ "$(git rev-list --count -i -E --grep="$token" "$base..$b" 2>/dev/null || echo 0)" -gt 0 ] || return 1
        done
        git merge-base --is-ancestor "$b" "$head" 2>/dev/null || return 1
    done < <(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -iE "^(feature|feat|fix)/${pnum}([-_/].*)?\$")
    [ "$found" -eq 1 ]
}
