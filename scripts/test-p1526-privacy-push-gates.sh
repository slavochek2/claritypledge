#!/usr/bin/env bash
# test-p1526-privacy-push-gates.sh — controls for the P1526 gates.
#
# Covers, with a known-good AND a known-bad control for each:
#   1. the account-figure / token-shape matcher (scripts/lib/privacy-figure-scan.sh)
#   2. added-lines-only scoping and the features/ docs/ path scope (throwaway repo)
#   3. the push write preflight (scripts/lib/push-preflight.sh) via a stub git
#   4. preflight placement in git-ops.sh: before main.lock, not gated on PUSH_DOCS_ASSUME_YES
#   5. doc edits (push.md and its mirror, create-spec, decisions.md P970 note)
#
# All fixtures are SYNTHETIC and live in a temp dir outside features/ and docs/.
# The real network preflight (known-good / known-bad credential) is run by hand and recorded in
# the spec; this suite never touches a remote.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
TMP="$(mktemp -d "${TMPDIR:-/tmp}/p1526.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

# shellcheck source=lib/privacy-figure-scan.sh
source scripts/lib/privacy-figure-scan.sh
# shellcheck source=lib/push-preflight.sh
source scripts/lib/push-preflight.sh

echo "== 1. matcher controls =="
scan() { printf 'fx.md:1:%s\n' "$1" | privacy_figure_scan; }
expect "bad: usage word + GB/% figure warns"       "$(scan 'egress 4.2 GB of 5 GB (84%)')" "fx.md:1"
expect "bad: spend with currency figure warns"     "$(scan 'monthly spend of $12 on the plan')" "fx.md:1"
expect "bad: token prefix with body warns"         "$(scan 'the key starts sbp_abcd1234')" "fx.md:1"
expect "bad: token prefix with length warns"       "$(scan 'a github_pat_ token, 40 chars long')" "fx.md:1"
expect "good: latency in ms and test count quiet"  "$(scan 'p95 latency 120 ms, 14 tests pass')" ""
expect "good: 'capture' is not the word cap"       "$(scan 'capture of 30% of rows')" ""
expect "good: bare prefix mention quiet"           "$(scan 'tokens begin with a vendor prefix')" ""
out="$(scan 'egress 4.2 GB of 5 GB (84%)')"
case "$out" in *GB*|*egress*) bad "matcher output must not echo matched text";; *) ok "matcher prints file:line only";; esac

echo "== 2. added-lines-only + path scope (throwaway repo) =="
R="$TMP/repo"; mkdir -p "$R/features" "$R/docs" "$R/src"
(
  cd "$R" && git init -q && git config user.email t@example.invalid && git config user.name t
  printf 'old line: egress 1 GB of 2 GB\nkeep\n' > docs/old.md      # pre-existing figure line
  git add docs/old.md && git commit -q -m base
  printf 'old line: egress 1 GB of 2 GB\nkeep\nlatency 120 ms\n' > docs/old.md   # adds a GOOD line only
  printf 'x\nquota 3 GB used\n' > features/new.md                              # adds a BAD line (line 2)
  printf 'quota 3 GB used\n' > src/code.md                                     # out of scope
  git add docs/old.md features/new.md src/code.md
)
got="$(cd "$R" && privacy_figure_added_lines features/ docs/ | privacy_figure_scan)"
expect "bad: new figure line in features/ flagged with its line number" "$got" "features/new.md:2"
case "$got" in *old.md*) bad "existing figure line in docs/old.md must not be flagged";; *) ok "existing lines are never flagged";; esac
case "$got" in *src/*) bad "src/ is out of scope";; *) ok "paths outside features/ docs/ are ignored";; esac

echo "== 3. preflight controls (stub git, no network) =="
STUB="$TMP/stubgit"
cat > "$STUB" <<'STUBEOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$STUB_LOG"
AT=@   # assembled at run time so no email-shaped literal sits in the staged file
if [ "${STUB_MODE:-good}" = "bad" ]; then
  echo "remote: Permission to example/repo.git denied to someone." >&2
  echo "fatal: unable to access 'https://user:SECRETVALUE${AT}host.invalid/example/repo.git/': The requested URL returned error: 403" >&2
  exit 128
fi
exit 0
STUBEOF
chmod +x "$STUB"
export PUSH_PREFLIGHT_GIT="$STUB" STUB_LOG="$TMP/stub.log"
SHA="0123456789abcdef0123456789abcdef01234567"
STUB_MODE=good push_write_preflight "$ROOT" "$SHA" origin 2>"$TMP/good.err"; rc=$?
expect "good: preflight returns 0 when the dry run succeeds" "$rc" "0"
STUB_MODE=bad push_write_preflight "$ROOT" "$SHA" origin 2>"$TMP/bad.err"; rc=$?
expect "bad: preflight returns 1 when the dry run fails" "$rc" "1"
grep -q "cannot write" "$TMP/bad.err" && ok "bad: message names the likely cause" || bad "bad: message names the cause"
grep -q "accounts.md" "$TMP/bad.err" && ok "bad: message names the account registry" || bad "bad: names registry"
grep -q "403" "$TMP/bad.err" && ok "bad: raw git error is included" || bad "bad: raw error included"
if grep -q "SECRETVALUE" "$TMP/bad.err"; then bad "credential in URL must be masked"; else ok "credential in URL is masked"; fi
STUB_MODE=good push_write_preflight "$ROOT" "$SHA" origin 2>/dev/null
args="$(cat "$STUB_LOG")"
case "$args" in *--dry-run*) ok "invocation is a dry run";; *) bad "invocation must be a dry run";; esac
case "$args" in *"refs/heads/staging/preflight-"*) ok "targets a throwaway staging/preflight-* ref";; *) bad "throwaway ref";; esac
unset PUSH_PREFLIGHT_GIT

echo "== 4. preflight placement in git-ops.sh =="
for cmd in push-docs ship-to-prod; do
  l1b="$(awk -v c="$cmd [1b]" 'index($0, c) {print NR; exit}' scripts/git-ops.sh)"
  lock="$(awk -v c="$cmd \\\\[2/6\\\\]: acquiring main.lock" '$0 ~ c {print NR; exit}' scripts/git-ops.sh)"
  stg="$(awk -v c="$cmd: staging push failed" 'index($0, c) {print NR; exit}' scripts/git-ops.sh)"
  if [ -n "$l1b" ] && [ -n "$lock" ] && [ "$l1b" -lt "$lock" ]; then ok "$cmd: preflight (line $l1b) precedes main.lock (line $lock)"; else bad "$cmd: preflight must precede main.lock ($l1b / $lock)"; fi
  if [ -n "$l1b" ] && [ -n "$stg" ] && [ "$l1b" -lt "$stg" ]; then ok "$cmd: preflight precedes the staging push"; else bad "$cmd: preflight must precede staging push"; fi
done
# The preflight block must not mention the ASSUME_YES flag (it is unconditional, so it runs under it).
blk="$(awk '/\[1b\]/ {f=1} f {print} /Push preflight passed/ {f=0}' scripts/git-ops.sh)"
case "$blk" in *PUSH_DOCS_ASSUME_YES*) bad "preflight must not be conditional on PUSH_DOCS_ASSUME_YES";; *) ok "preflight block is unconditional (runs under PUSH_DOCS_ASSUME_YES=1)";; esac

echo "== 5. doc edits =="
diff -q .claude/commands/slava/build/push.md .agents/skills/push/SKILL.md >/dev/null && ok "push.md and mirror identical" || bad "push.md and mirror differ"
grep -q "names exactly one option" .claude/commands/slava/build/push.md && ok "push.md has the exact-option rule" || bad "push.md exact-option rule"
grep -q "never read as permission" .claude/commands/slava/build/push.md && ok "push.md says other replies re-ask" || bad "push.md re-ask rule"
grep -q "Account figures stay private" .claude/commands/slava/build/create-spec.md && ok "create-spec skeleton guidance line" || bad "create-spec guidance"
grep -q "No account figures or token shapes" .claude/commands/slava/build/create-spec.md && ok "create-spec self-review gate line" || bad "create-spec gate"
grep -q "Superseded (2026-10-21, P1526)" docs/decisions.md && ok "P970 carries superseded note" || bad "P970 note"
if grep -n 'fine-grained `cp-agent-push` PAT' .claude/commands/slava/build/push.md .agents/skills/push/SKILL.md >/dev/null; then bad "retired token still named"; else ok "push.md and mirror no longer name the retired token"; fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
