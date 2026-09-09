#!/bin/bash
# Canary for `git-ops.sh gc` — the ref sweep and its merged-ness oracle (P1260).
#
# The oracle decides whether a branch may be deleted, so a wrong MERGED destroys work. Both
# available oracles are individually wrong on this repo, which is why there are three signals:
#
#   patch-id (`git cherry`)  — says 3 commits unmatched on backup/p1165-orig-20260827
#   subject match            — says 1; and c431d2ec subject-matches main's eb56d6e3 while their
#                              patches differ by 382 lines across 5 files
#   revert scan              — both of the above are defeated by reverted work
#                              (docs/decisions.md 2026-09-05 [technical])
#
# Scenario 2 is the discriminating one and runs in BOTH directions on purpose: an oracle that
# always answers KEEP would pass a one-directional revert test while being useless. It must say
# KEEP while the work is reverted and MERGED once it re-lands.
#
# Fixtures are built from this repo's real history, so this canary is meaningful only here.

set -uo pipefail

# P785/P1273. This canary drives the REAL repo via `git -C "$ROOT"`, and git exports GIT_DIR
# and GIT_INDEX_FILE to its hooks — those OVERRIDE -C. Run from pre-commit it therefore wrote
# into the COMMITTING worktree's index: 6 staged paths became 1497, reconstructing an old tree
# whose specs exist in no current ref, and the later gates refused the commit over files it
# never touched. It exited 0 while doing so. Unset before touching git.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITOPS="$ROOT/scripts/git-ops.sh"

# The p1220 revert window — the live instance of decisions.md 2026-09-05 [technical].
ORIG=95036cca3      # style(p1220): M9 interaction layer …
REVERT=37984ff00    # revert(p1220): back out the design-consistency commits …  (4 min later)
RELAND=06dad4d3e    # same subject, re-landed 2026-09-05
P1165=backup/p1165-orig-20260827

pass=0; fail=0
# Unique per run: a FIXED fixture name makes two concurrent runs of this canary delete each
# other's branch through the shared EXIT trap, which is not hypothetical here — this repo
# routinely has four worktrees live. Observed as "dry run changed the branch list" in scenario 4,
# a failure that accused `gc` of deleting on a dry run when `gc` had done nothing.
FIXTURE="p1260-canary-revert-$$"
cleanup() { git -C "$ROOT" branch -D "$FIXTURE" >/dev/null 2>&1; }
trap cleanup EXIT

need_commit() {
  git -C "$ROOT" rev-parse --verify --quiet "$1^{commit}" >/dev/null || {
    echo "  SKIP  fixture commit $1 not in this clone — canary cannot run"; exit 0; }
}
for c in "$ORIG" "$REVERT" "$RELAND"; do need_commit "$c"; done

verdict_for() { # <branch> <base>  → just the VERDICT column
  "$GITOPS" gc --no-remote --base "$2" 2>/dev/null \
    | awk -v b="$1" '$2==b { sub(/^[[:space:]]*([^[:space:]]+[[:space:]]+){4}/, ""); print }'
}

check() { # <name> <branch> <base> <expect-regex>
  local name="$1" br="$2" base="$3" want="$4" got
  got="$(verdict_for "$br" "$base")"
  if [[ "$got" =~ $want ]]; then
    echo "  PASS  $name"
    echo "          $got"
    pass=$((pass+1))
  else
    echo "  FAIL  $name — expected /$want/"
    echo "          got: ${got:-<no row>}"
    fail=$((fail+1))
  fi
}

echo "=== git-ops gc merged-ness oracle canary (P1260) ==="
echo

echo "-- 1. a branch with genuinely unmerged commits must be KEEP, and must NAME them --"
if git -C "$ROOT" rev-parse --verify --quiet "$P1165" >/dev/null; then
  check "$P1165 is KEEP with named unmatched shas" "$P1165" main 'KEEP — unmatched: .*\('
else
  echo "  SKIP  $P1165 not present in this clone"
fi

echo
echo "-- 2. the revert trap, both directions (decisions.md 2026-09-05) --"
# Build the shape the trap actually takes: work that shipped to main by CHERRY-PICK, so the branch
# keeps its OWN shas and is not an ancestor of the revert that backed the copy out. Building it as
# an ancestor instead would test nothing — reachability alone would answer it.
TMPWT="$(mktemp -d)/fx"
if git -C "$ROOT" worktree add -q --detach "$TMPWT" "${ORIG}^" 2>/dev/null \
   && git -C "$TMPWT" cherry-pick "$ORIG" >/dev/null 2>&1; then
  git -C "$ROOT" branch -f "$FIXTURE" "$(git -C "$TMPWT" rev-parse HEAD)" >/dev/null 2>&1
  git -C "$ROOT" worktree remove --force "$TMPWT" >/dev/null 2>&1

  if [[ "$(git -C "$ROOT" rev-list --count "$REVERT..$FIXTURE")" -eq 0 ]]; then
    echo "  FAIL  fixture is an ancestor of the revert — it would prove nothing"; fail=$((fail+1))
  else
    check "reverted, not yet re-landed (base=$REVERT) -> KEEP" \
          "$FIXTURE" "$REVERT" 'KEEP — unmatched: .*reverted-by'
    # The other direction. Without this, an oracle hardwired to KEEP would pass scenario 2.
    check "re-landed as $RELAND (base=main) -> MERGED" \
          "$FIXTURE" main '^MERGED$'
  fi
else
  echo "  SKIP  could not build the cherry-pick fixture"
  git -C "$ROOT" worktree remove --force "$TMPWT" >/dev/null 2>&1
fi

echo
echo "-- 3. the sweep must SEE remote refs at all (the old version enumerated git branch only) --"
# What matters is that the remote lookup RAN and succeeded — not that origin happens to hold
# extra refs. After P1260 reclaimed the three stale ones, `main` alone is the correct state, and
# an assertion keyed on "origin rows exist" would silently degrade to SKIP forever.
out="$("$GITOPS" gc 2>&1)"
if printf '%s' "$out" | grep -q 'could not reach origin'; then
  echo "  SKIP  origin genuinely unreachable (offline) — remote coverage unverified this run"
elif printf '%s' "$out" | grep -q '^  origin '; then
  echo "  PASS  report contains origin rows"; pass=$((pass+1))
elif printf '%s' "$out" | grep -q 'ref report'; then
  # Lookup succeeded and returned only main, which the exclusion set drops. Prove the lookup
  # really ran rather than inferring it from silence.
  if [[ -n "$(git -C "$ROOT" ls-remote --heads origin 2>/dev/null)" ]]; then
    echo "  PASS  remote lookup succeeded; origin holds only excluded refs (main)"; pass=$((pass+1))
  else
    echo "  SKIP  could not confirm the remote lookup independently"
  fi
else
  echo "  FAIL  gc produced no ref report at all"; fail=$((fail+1))
fi

echo
echo "-- 4. a dry run must never delete (deletion needs BOTH --yes and --delete-branches) --"
# Assert the PROPERTY (nothing was deleted), not exact equality. A co-tenant creating a branch
# mid-run is normal here and is not a dry-run violation; only a disappearance is.
before="$(git -C "$ROOT" branch --format='%(refname:short)' | sort)"
"$GITOPS" gc --no-remote >/dev/null 2>&1
after="$(git -C "$ROOT" branch --format='%(refname:short)' | sort)"
vanished="$(comm -23 <(printf '%s\n' "$before") <(printf '%s\n' "$after"))"
if [[ -z "$vanished" ]]; then
  echo "  PASS  dry run deleted nothing"; pass=$((pass+1))
else
  echo "  FAIL  dry run DELETED:"$'\n'"$vanished"; fail=$((fail+1))
fi

echo
echo "=== $pass passed, $fail failed ==="
[[ $fail -eq 0 ]] || exit 1
exit 0
