#!/usr/bin/env bash
# Hermetic canary for scripts/lib/decisions-merge.py (P1575).
#
# Builds a real cherry-pick conflict on docs/decisions.md for each shape and runs the
# resolver against the live index stages, exactly as git-ops.sh ship does. Proves both
# directions: the two-prepend shape resolves with every entry kept, and every other shape
# is left untouched for a human (exit 1, conflict still unmerged).
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
RESOLVER="${DECISIONS_MERGE_RESOLVER:-$REPO_ROOT/scripts/lib/decisions-merge.py}"  # override only to run mutants
TMP="$(mktemp -d)" || exit 1
[ -n "$TMP" ] && [ -d "$TMP" ] || exit 1
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

PREAMBLE='# Decisions Log

Newest entries at top.

---

'
# E VAR TITLE BODY: put one entry in VAR. A variable, never $(...): command substitution
# strips trailing newlines and would glue the next entry's heading onto this one's rule.
E() { printf -v "$1" '## %s\n\n**Decision:** %s\n\n---\n\n' "$2" "$3"; }
E OLD2 "2026-01-02 [process]: Old two" "b"
E OLD1 "2026-01-01 [process]: Old one" "a"
OLD="$OLD2$OLD1"
E BR_NEW "2026-02-02 [technical]: Branch new" "x"
E MAIN_NEW "2026-02-03 [product]: Main new" "y"
E MAIN_OLDER "2026-02-01 [process]: Main older" "z"
E SAME_B "2026-02-02 [process]: Same title" "branch body"
E SAME_M "2026-02-02 [process]: Same title" "main body"
E RETITLED "2026-01-02 [process]: Old two, retitled" "b"
E EDIT_B "2026-01-02 [process]: Old two" "b, edited on the branch"
E EDIT_M "2026-01-02 [process]: Old two" "b, edited on main"

# new_repo DIR: a repo whose decisions log holds two entries, on branch main.
new_repo() {
  rm -rf "$1"; mkdir -p "$1/docs"; cd "$1" || exit 1
  git init -q; git config user.email canary@example.com; git config user.name canary
  git config commit.gpgsign false
  printf '%s%s' "$PREAMBLE" "$OLD" > docs/decisions.md
  git add docs/decisions.md; git commit -qm base; git branch -M main
}

# write_log: replace the log with the preamble followed by the given entries (as printf'd text).
write_log() { printf '%s%s' "$PREAMBLE" "$1" > docs/decisions.md; }


# pick: create branch commit with $1 as the whole log, main commit with $2, cherry-pick the
# branch commit onto main. Leaves the repo mid-conflict.
pick() {
  git checkout -q -b feature/x
  write_log "$1"; git commit -qam "branch writes"
  git checkout -q main
  write_log "$2"; git commit -qam "main writes"
  git cherry-pick feature/x >/dev/null 2>&1
}

unmerged() { git diff --name-only --diff-filter=U | grep -c . ; }

echo "== two-prepend: both sides added entries at the top"
new_repo "$TMP/a"
pick "$BR_NEW$OLD" "$MAIN_NEW$MAIN_OLDER$OLD"
[ "$(unmerged)" = 1 ] && ok "fixture produces a real conflict" || bad "fixture produced no conflict"
out="$(python3 "$RESOLVER" docs/decisions.md)"; rc=$?
[ $rc = 0 ] && ok "resolves (exit 0): $out" || bad "expected exit 0, got $rc: $out"
[ "$(unmerged)" = 0 ] && ok "conflict is staged as resolved" || bad "path still unmerged"
order="$(grep '^## ' docs/decisions.md | sed 's/:.*//' | tr '\n' ' ')"
[ "$order" = "## 2026-02-03 [product] ## 2026-02-01 [process] ## 2026-02-02 [technical] ## 2026-01-02 [process] ## 2026-01-01 [process] " ] \
  && ok "main's entries first, then the branch's, then the shared log" || bad "unexpected order: $order"
! grep -q '^<<<<<<<\|^=======$\|^>>>>>>>' docs/decisions.md && ok "no conflict markers left" || bad "markers left in the file"
git -c core.editor=true cherry-pick --continue >/dev/null 2>&1 && ok "cherry-pick continues to a commit" || bad "cherry-pick --continue failed"


echo "== shapes that must stop for a human"
stops() {  # $1 label; repo is mid-conflict
  local before rc out
  before="$(shasum docs/decisions.md)"
  out="$(python3 "$RESOLVER" docs/decisions.md)"; rc=$?
  if [ $rc = 1 ] && [ "$(unmerged)" = 1 ] && [ "$(shasum docs/decisions.md)" = "$before" ]; then
    ok "$1 stops (exit 1, file and conflict untouched): $out"
  else
    bad "$1 did not stop cleanly (rc $rc, unmerged $(unmerged)): $out"
  fi
}

new_repo "$TMP/c"   # the 4th P1566 conflict: branch adds an entry AND retitles an existing one
pick "$BR_NEW$RETITLED$OLD1" "$MAIN_NEW$OLD"
stops "a branch retitle of an existing entry"

new_repo "$TMP/d"
pick "$EDIT_B$OLD1" "$EDIT_M$OLD1"
stops "an edit to an existing entry on both sides"

new_repo "$TMP/e"
pick "$BR_NEW$OLD" "$MAIN_NEW$OLD1"
stops "main deleting an existing entry"

new_repo "$TMP/f"
# git merges a preamble edit cleanly whenever the repeated "---" rules let it align the two
# insertions apart, so this shape is written straight into the index as stages 1, 2 and 3.
conflict_stages() {  # base ours theirs, as text
  local b o t
  b="$(printf '%s' "$1" | git hash-object -w --stdin)"
  o="$(printf '%s' "$2" | git hash-object -w --stdin)"
  t="$(printf '%s' "$3" | git hash-object -w --stdin)"
  printf '0 0000000000000000000000000000000000000000\tdocs/decisions.md\n100644 %s 1\tdocs/decisions.md\n100644 %s 2\tdocs/decisions.md\n100644 %s 3\tdocs/decisions.md\n' "$b" "$o" "$t" | git update-index --index-info
  printf '%s' "$2" > docs/decisions.md
}
conflict_stages "$PREAMBLE$OLD" "${PREAMBLE/Newest/Edited. Newest}$MAIN_NEW$OLD" "$PREAMBLE$BR_NEW$OLD"
stops "a preamble change on main"

new_repo "$TMP/f2"   # empty log (preamble only) and main's new entry has no final newline:
# joining the blocks would glue the branch's heading onto main's last line.
conflict_stages "$PREAMBLE" "$PREAMBLE${MAIN_NEW%$'\n\n'}" "$PREAMBLE$BR_NEW"
stops "a block without a final newline that would glue two entries"

new_repo "$TMP/f3"   # an entry that opens a code fence and never closes it would hide the
# branch's entries inside it when the log is rendered.
conflict_stages "$PREAMBLE$OLD" "$PREAMBLE## 2026-02-03 [product]: Main new"$'\n\n```sh\nunclosed\n\n'"$OLD" "$PREAMBLE$BR_NEW$OLD"
stops "a new entry with an unclosed code fence"

new_repo "$TMP/b"   # both sides add an entry with the same title: which one is right is a human call
pick "$SAME_B$OLD" "$SAME_M$OLD"
stops "the same title added on both sides"

new_repo "$TMP/k"   # stacked branches: the picked commit's entry is already on main, under
# another SHA, below main's newer entry. Resolving would duplicate it.
E STACKED "2026-02-02 [technical]: Shipped earlier" "s"
conflict_stages "$PREAMBLE$OLD" "$PREAMBLE$MAIN_NEW$STACKED$OLD" "$PREAMBLE$STACKED$OLD"
stops "an entry the branch adds that main already has"

new_repo "$TMP/l"   # main has since restated it (proposed to accepted): the old copy must not come back
E PROPOSED "2026-02-02 [technical]: Thing (Status: proposed)" "old body"
E ACCEPTED "2026-02-02 [technical]: Thing" "accepted body"
conflict_stages "$PREAMBLE$OLD" "$PREAMBLE$MAIN_NEW$ACCEPTED$OLD" "$PREAMBLE$PROPOSED$OLD"
stops "an entry main has since restated under a new status"

new_repo "$TMP/g"   # no common ancestor: both sides create the file (add/add)
git rm -q docs/decisions.md; git commit -qm "drop the log"
git checkout -q -b feature/x; mkdir -p docs; write_log "$BR_NEW"; git add docs/decisions.md; git commit -qm "branch creates"
git checkout -q main; mkdir -p docs; write_log "$MAIN_NEW"; git add docs/decisions.md; git commit -qm "main creates"
git cherry-pick feature/x >/dev/null 2>&1
stops "no common ancestor"

new_repo "$TMP/h"   # the refusal check itself: a damaged merge result must not be written
pick "$BR_NEW$OLD" "$MAIN_NEW$OLD"
before="$(shasum docs/decisions.md)"
out="$(DECISIONS_MERGE_TEST_CORRUPT=1 python3 "$RESOLVER" docs/decisions.md)"; rc=$?
[ $rc = 1 ] && [ "$(shasum docs/decisions.md)" = "$before" ] && [ "$(unmerged)" = 1 ] \
  && ok "a merge that would lose an entry heading is refused: $out" || bad "damaged merge was not refused (rc $rc): $out"

echo "== not in a conflict"
new_repo "$TMP/i"
python3 "$RESOLVER" docs/decisions.md >/dev/null; rc=$?
[ $rc = 2 ] && ok "no conflict is a could-not-run (exit 2), never a resolution" || bad "expected exit 2, got $rc"

echo "== output is redirect-safe (shell-safety.md)"
new_repo "$TMP/j"
pick "$BR_NEW$OLD" "$MAIN_NEW$OLD"
outs="$(DECISIONS_MERGE_TEST_CORRUPT=1 python3 "$RESOLVER" docs/decisions.md; python3 "$RESOLVER" docs/decisions.md; python3 "$RESOLVER" docs/decisions.md)"
printf '%s' "$outs" | grep -q '[<>|]' && bad "resolver output contains a redirect character: $outs" \
  || ok "refusal, success and could-not-run lines have no redirect characters"

echo
echo "test-decisions-merge: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
