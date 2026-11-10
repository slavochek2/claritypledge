#!/usr/bin/env bash
# test-p1664-receipt-unreadable.sh — canary for P1664.
#
# review_receipt.py check must never report a file it cannot read as "reviewed as-is".
# An unreadable file and a missing receipt both used to compare as None, so they matched.
#
#   unreadable  a file without read permission, never reviewed  -> 1
#   directory   a directory passed as a file, never reviewed    -> 1
#   unreviewed  a readable file with no receipt (control)       -> 1
#   reviewed    a readable file reviewed as-is (control)        -> 0
#   deleted     a deleted file is still skipped                 -> 0
#   replaced    a parent directory replaced by a file (refactor) -> 0
#   symlink     an existing link whose target runs through a file -> 1
#
# RECEIPT_UNDER_TEST names another copy, to prove this canary fails on the pre-fix code.
# Output contract: no redirect tokens in status lines.
set -eu
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE

SRC="$(cd "$(dirname "$0")/.." && pwd)"
UNDER_TEST="${RECEIPT_UNDER_TEST:-$SRC/scripts/review_receipt.py}"

work="$(mktemp -d)"
trap 'chmod -R u+rwx "$work" 2>/dev/null; rm -rf "$work"' EXIT
cd "$work"
git init -q repo && cd repo
git config user.email canary@example.com && git config user.name canary
mkdir -p scripts src
cp "$UNDER_TEST" scripts/review_receipt.py
echo "export const a = 1;" > src/reviewed.ts
echo "export const b = 1;" > src/unreviewed.ts
echo "export const c = 1;" > src/locked.ts
echo "export const d = 1;" > src/gone.ts
git add -A && git commit -q -m seed

snap="$(python3 scripts/review_receipt.py snapshot -- src/reviewed.ts src/gone.ts)"
ev="$work/evidence.txt"
printf 'ASK-MODEL: vendor=gemini requested=x served=x verified=served effort=low exit=0\nno findings\n' > "$ev"
python3 scripts/review_receipt.py write --snapshot "$snap" --evidence "$ev" > /dev/null
rm src/gone.ts
chmod 000 src/locked.ts
mkdir -p src/adir

fails=0
check() {  # check NAME WANT_RC PATH — a refusal must also NAME the path
  local name="$1" want="$2" rc=0 out
  out="$(python3 scripts/review_receipt.py check "$3" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$want" ]] && { [[ "$want" -eq 0 ]] || grep -qF "not reviewed as-is: $3" <<< "$out"; }; then echo "ok   ${name}: rc=${rc}"; else
    echo "FAIL ${name}: wanted rc=${want}, got rc=${rc}"; printf '%s\n' "$out" | sed 's/^/     /'; fails=$((fails + 1)); fi
}

if [[ -r src/locked.ts ]]; then
  echo "skip unreadable: permissions are not enforced for this user (root?)"
else
  check "unreadable: a file that cannot be read, never reviewed" 1 src/locked.ts
fi
check "directory: a directory passed as a file, never reviewed" 1 src/adir
check "unreviewed: a readable file with no receipt" 1 src/unreviewed.ts
check "reviewed: a file reviewed as-is" 0 src/reviewed.ts
check "deleted: a deleted file is skipped" 0 src/gone.ts
# A parent directory replaced by a regular file (a refactor) is a deletion, not unreadable.
mkdir -p src/moved && echo "export const e = 1;" > src/moved/inner.ts
rm -r src/moved && echo "not a directory any more" > src/moved
check "replaced: a parent directory replaced by a file is a deletion" 0 src/moved/inner.ts
# A symlink that still exists, whose target runs through a regular file, is NOT a deletion.
echo "plain file" > src/target && ln -s target/inner.ts src/link.ts
check "symlink: an existing link with a broken target, never reviewed" 1 src/link.ts

if [[ "$fails" -eq 0 ]]; then echo "P1664 canary: all cases passed"; else echo "P1664 canary: ${fails} case(s) failed"; fi
exit "$fails"
