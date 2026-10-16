#!/usr/bin/env bash
# test-p1507-prepush-disclosure.sh — canary for P1507 review finding H1: the
# embargo content check must run BEFORE a push publishes anything (CI runs only
# after the ref lands, and the staging branch is public).
#
# Runs the real pre-push hook in a throwaway local clone of this checkout:
#   P1 a main push carrying an embargoed spec is refused with the P1507 message
#   P2 the same push shape with a public spec is NOT refused by this check (gate 7c)
# Later layers (privacy stamp, TTY prompt) may still stop the hook; only the
# P1507 message is asserted, as test-pre-push-refclass.sh does for Layer 0.
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE
W="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
MSG="sensitive spec content in range"
FAIL=0
git clone -q --no-checkout "$W" "$T/c" >/dev/null 2>&1 || { echo "FIXTURE: clone failed"; exit 2; }
cd "$T/c" || exit 2
git config user.email c@t; git config user.name c; git config commit.gpgsign false
git checkout -q -B main "$(git -C "$W" rev-parse HEAD)" >/dev/null 2>&1
git update-ref refs/remotes/origin/main HEAD
base="$(git rev-parse HEAD)"

push_line() { printf 'refs/heads/main %s refs/heads/main %s\n' "$1" "$base"; }
hook() { push_line "$1" | bash scripts/pre-push-checks.sh /tmp/p1507-mirror.git /tmp/p1507-mirror.git 2>&1; }

spec() { printf -- '---\nstatus: backlog\ntype: bug\nrank: 1\ndisclosure: %s\n---\n# P99999: x\n' "$1"; }
spec embargo > features/p99999_x.md; git add features/p99999_x.md; git commit -qm leak --no-verify
out="$(hook "$(git rev-parse HEAD)")"; rc=$?
if [[ $rc -ne 0 && "$out" == *"$MSG"* ]]; then echo "PASS: P1 embargoed spec in a main push refused before publication (exit $rc)"
else echo "FAIL: P1 (exit $rc)"; printf '%s\n' "$out" | tail -20 | sed 's/^/    /'; FAIL=$((FAIL+1)); fi

git reset -q --hard "$base"
spec public > features/p99999_x.md; git add features/p99999_x.md; git commit -qm ok --no-verify
out="$(hook "$(git rev-parse HEAD)")"; rc=$?
if [[ "$out" != *"$MSG"* ]]; then echo "PASS: P2 a public spec push is not refused by the P1507 check (hook exit $rc from later layers)"
else echo "FAIL: P2 public spec refused"; printf '%s\n' "$out" | tail -20 | sed 's/^/    /'; FAIL=$((FAIL+1)); fi

(( FAIL == 0 )) && echo "RESULT: all passed" || { echo "RESULT: $FAIL failure(s)"; exit 1; }
