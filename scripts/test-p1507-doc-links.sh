#!/usr/bin/env bash
# test-p1507-doc-links.sh — canary for P1507: a public doc may not link a spec
# archived in .private/features/ (it names a sensitive spec), while a link to
# .private/docs/security-log.md — the pattern CLAUDE.md prescribes — still passes.
# Hermetic: a throwaway repo carrying a copy of the validator, with .private/ on
# disk and ignored, exactly like the main checkout.
# Gate 7: VALIDATOR=<pre-fix copy> must make L1 and L3 fail.
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE
W="$(cd "$(dirname "$0")/.." && pwd)"
V="${VALIDATOR:-$W/scripts/validate-doc-links.cjs}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
pass() { echo "PASS: $*"; }; fail() { echo "FAIL: $*" >&2; FAIL=$((FAIL + 1)); }

mk() {
  local r="$T/$1"; mkdir -p "$r/scripts" "$r/docs" "$r/.private/docs" "$r/.private/features/done/2026-01-01"
  cp "$V" "$r/scripts/validate-doc-links.cjs"
  echo x > "$r/.private/docs/security-log.md"; echo x > "$r/.private/features/done/2026-01-01/p1_s.md"
  printf '.private/\n' > "$r/.gitignore"
  ( cd "$r" && git init -q && git config user.email c@t && git config user.name c && git config commit.gpgsign false \
    && echo seed > README.md && git add README.md .gitignore scripts && git commit -qm s && git branch -M main ) >/dev/null 2>&1
  echo "$r"
}
runv() { local r="$1"; shift; ( cd "$r" && node scripts/validate-doc-links.cjs "$@" ) >"$T/out" 2>&1; }

# L1 — repo-wide (CI): a committed link to a private archived spec fails.
r="$(mk l1)"; printf '[s](../.private/features/done/2026-01-01/p1_s.md)\n' > "$r/docs/a.md"
( cd "$r" && git add docs && git commit -qm a ) >/dev/null 2>&1
runv "$r" --embargo-only; rc=$?
if [[ $rc -ne 0 ]] && grep -q "private archived spec" "$T/out"; then pass "L1: --embargo-only fails a link into .private/features (exit $rc)"
else fail "L1: private spec link (exit $rc)"; sed 's/^/    /' "$T/out" >&2; fi

# L2 — the same repo-wide run passes a link to the private security log.
r="$(mk l2)"; printf '[log](../.private/docs/security-log.md)\n' > "$r/docs/a.md"
( cd "$r" && git add docs && git commit -qm a ) >/dev/null 2>&1
runv "$r" --embargo-only; rc=$?
if [[ $rc -eq 0 ]]; then pass "L2: a link to .private/docs/security-log.md still passes (exit 0)"
else fail "L2: security-log link (exit $rc)"; sed 's/^/    /' "$T/out" >&2; fi

# L3 — staged (pre-commit): both links in one doc; only the private-spec one is reported.
r="$(mk l3)"; printf '[log](../.private/docs/security-log.md)\n[s](../.private/features/done/2026-01-01/p1_s.md)\n' > "$r/docs/a.md"
( cd "$r" && git add docs ) >/dev/null 2>&1
runv "$r"; rc=$?
if [[ $rc -ne 0 ]] && grep -q "p1_s.md" "$T/out" && ! grep -q "security-log.md" "$T/out"; then
  pass "L3: staged mode fails the private-spec link and not the security-log link (exit $rc)"
else fail "L3: staged mixed (exit $rc)"; sed 's/^/    /' "$T/out" >&2; fi

# L4 — a case variant (macOS resolves it to the same folder) is still refused.
r="$(mk l4)"; printf '[s](../.Private/Features/done/2026-01-01/p1_s.md)\n' > "$r/docs/a.md"
( cd "$r" && git add docs && git commit -qm a ) >/dev/null 2>&1
runv "$r" --embargo-only; rc=$?
if [[ $rc -ne 0 ]] && grep -q "private archived spec" "$T/out"; then pass "L4: a case-variant link into .Private/Features fails (exit $rc)"
else fail "L4: case variant (exit $rc)"; sed 's/^/    /' "$T/out" >&2; fi

(( FAIL == 0 )) && echo "RESULT: all passed" || { echo "RESULT: $FAIL failure(s)"; exit 1; }
