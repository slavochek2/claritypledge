#!/usr/bin/env bash
# test-p1641-prepush-delete.sh: canary for P1641. A branch delete publishes no commits, so the
# pre-push privacy scan must pass it, while anything that does publish commits stays gated.
#
# Runs the real hook and the real scanner in a throwaway clone of this checkout, fed the same
# stdin shape git sends. HOME is a temp dir so a live push-on flag cannot change the outcome.
#   D1 delete of a staging branch passes
#   D2 unreadable range on a non-delete ref is refused as a scan failure
#   D3 delete plus unreadable range in one push is refused
#   D4 commit carrying a personal identifier on a non-delete ref is refused
#   D5 delete plus that commit in one push is refused
#   D6 delete of main is still refused
#   D7 clean commit on a staging branch passes (gate 7c: a legitimate publish)
#   D8 personal identifier on a NEW branch is refused (all-zero remote SHA)
#   D9 personal identifier pushed to main is refused
#   D10 embargoed spec on a non-delete ref is refused
#   D11 unreadable range listed BEFORE a delete is refused
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE
W="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export HOME="$T/home"; mkdir -p "$HOME"
ZERO=0000000000000000000000000000000000000000
BAD=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
FAIL=0
git clone -q --no-checkout "$W" "$T/c" >/dev/null 2>&1 || { echo "FIXTURE: clone failed"; exit 2; }
cd "$T/c" || exit 2
git config user.email c@example.com; git config user.name c; git config commit.gpgsign false
git checkout -q -B main "$(git -C "$W" rev-parse HEAD)" >/dev/null 2>&1
git update-ref refs/remotes/origin/main HEAD
base="$(git rev-parse HEAD)"
# The gate under test is the working copy, so a change is exercised before it is committed.
# To see the unfixed behaviour, run this against a checkout holding the older hook.
cp "$W/scripts/pre-push-checks.sh" "$W/scripts/audit-privacy.sh" "$W/scripts/check-disclosure.sh" scripts/

git checkout -q -b leak
mkdir -p docs
domain="inguro.com"
printf 'contact bob@%s\n' "$domain" > docs/p1641-fixture.md
git add docs/p1641-fixture.md; git commit -qm leak; leak="$(git rev-parse HEAD)"
git checkout -q main
git checkout -q -b clean
printf 'nothing private\n' > docs/p1641-clean.md
git add docs/p1641-clean.md; git commit -qm clean; clean="$(git rev-parse HEAD)"
git checkout -q main
git checkout -q -b embargo
printf -- '---\nstatus: backlog\ntype: bug\nrank: 1\ndisclosure: embargo\n---\n# P99999: x\n' > features/p99999_x.md
git add features/p99999_x.md; git commit -qm embargo; embargo="$(git rev-parse HEAD)"
git checkout -q main

DEL="(delete) $ZERO refs/heads/staging/doc-x $base"
hook() { printf '%b' "$1" | bash scripts/pre-push-checks.sh /tmp/p1641-mirror.git /tmp/p1641-mirror.git 2>&1; }
check() { # name, stdin, want_rc, required message ("" for none)
  local out rc
  out="$(hook "$2")"; rc=$?
  if [[ $rc -eq $3 && ( -z "$4" || "$out" == *"$4"* ) ]]; then echo "PASS: $1 (exit $rc)"
  else echo "FAIL: $1 (exit $rc, wanted $3)"; printf '%s\n' "$out" | tail -8 | sed 's/^/    /'; FAIL=$((FAIL+1)); fi
}
SCAN="could not read its input"
PII="personal identifiers in range"

check "D1 delete of a staging branch passes" "$DEL\n" 0 ""
check "D2 unreadable range on a non-delete ref is refused" "refs/heads/x $BAD refs/heads/staging/doc-x $base\n" 1 "$SCAN"
check "D3 delete plus unreadable range is refused" "$DEL\nrefs/heads/x $BAD refs/heads/staging/doc-y $base\n" 1 "$SCAN"
check "D4 personal identifier on a non-delete ref is refused" "refs/heads/leak $leak refs/heads/staging/doc-x $base\n" 1 "$PII"
check "D5 delete plus personal identifier is refused" "$DEL\nrefs/heads/leak $leak refs/heads/staging/doc-y $base\n" 1 "$PII"
check "D6 delete of main is still refused" "(delete) $ZERO refs/heads/main $base\n" 1 "PRIVACY GATE: force-push detected"
check "D7 clean commit on a staging branch passes" "refs/heads/clean $clean refs/heads/staging/doc-x $base\n" 0 ""
check "D8 personal identifier on a new branch is refused" "refs/heads/leak $leak refs/heads/staging/doc-new $ZERO\n" 1 "$PII"
check "D9 personal identifier pushed to main is refused" "refs/heads/leak $leak refs/heads/main $base\n" 1 "$PII"
check "D10 embargoed spec on a non-delete ref is refused" "refs/heads/embargo $embargo refs/heads/staging/doc-x $base\n" 1 "sensitive spec content"
check "D11 unreadable range before a delete is refused" "refs/heads/x $BAD refs/heads/staging/doc-y $base\n$DEL\n" 1 "$SCAN"

(( FAIL == 0 )) && echo "RESULT: all passed" || { echo "RESULT: $FAIL failure(s)"; exit 1; }
