#!/bin/bash
# Verifies scripts/audit-privacy.sh catches known patterns and ignores safe ones.
set -e

AUDIT="$(git rev-parse --show-toplevel)/scripts/audit-privacy.sh"
PASS=0
FAIL=0

assert_blocks() {
  local label="$1"
  local content="$2"
  local tmpfile
  tmpfile=$(mktemp)
  echo "$content" > "$tmpfile"
  if "$AUDIT" --msg "$tmpfile" >/dev/null 2>&1; then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  rm -f "$tmpfile"
}

assert_allows() {
  local label="$1"
  local content="$2"
  local tmpfile
  tmpfile=$(mktemp)
  echo "$content" > "$tmpfile"
  if "$AUDIT" --msg "$tmpfile" >/dev/null 2>&1; then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  rm -f "$tmpfile"
}

# Run audit script in range mode inside a throwaway git repo
# Usage: assert_range_blocks <label> <commit-msg> <file-path> <file-content>
# Creates a repo, commits a file, runs audit on HEAD~1..HEAD
TMPDIR_REPO=""

setup_tmp_repo() {
  TMPDIR_REPO=$(mktemp -d)
  git -C "$TMPDIR_REPO" init -q
  git -C "$TMPDIR_REPO" config user.email "test@example.com"
  git -C "$TMPDIR_REPO" config user.name "Test"
  # Initial empty commit so we can use HEAD~1..HEAD
  git -C "$TMPDIR_REPO" commit -q --allow-empty -m "init"
}

teardown_tmp_repo() {
  rm -rf "$TMPDIR_REPO"
  TMPDIR_REPO=""
}

assert_range_blocks() {
  local label="$1"
  local commit_msg="$2"
  local file_path="$3"
  local file_content="$4"
  local allowlist_content="${5:-}"
  local email_allowlist_content="${6:-}"

  setup_tmp_repo
  # Copy audit script into the tmp repo so it can find itself
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$allowlist_content" ]; then
    printf '%s\n' "$allowlist_content" > "$TMPDIR_REPO/.privacy-allowlist"
  fi
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  mkdir -p "$TMPDIR_REPO/$(dirname "$file_path")"
  printf '%s\n' "$file_content" > "$TMPDIR_REPO/$file_path"
  git -C "$TMPDIR_REPO" add "$file_path" 2>/dev/null
  git -C "$TMPDIR_REPO" commit -q --allow-empty -m "$commit_msg"

  # Run audit from inside the tmp repo
  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh "HEAD~1..HEAD" >/dev/null 2>&1); then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  teardown_tmp_repo
}

assert_range_allows() {
  local label="$1"
  local commit_msg="$2"
  local file_path="$3"
  local file_content="$4"
  local allowlist_content="${5:-}"
  local email_allowlist_content="${6:-}"

  setup_tmp_repo
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$allowlist_content" ]; then
    printf '%s\n' "$allowlist_content" > "$TMPDIR_REPO/.privacy-allowlist"
  fi
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  mkdir -p "$TMPDIR_REPO/$(dirname "$file_path")"
  printf '%s\n' "$file_content" > "$TMPDIR_REPO/$file_path"
  git -C "$TMPDIR_REPO" add "$file_path" 2>/dev/null
  git -C "$TMPDIR_REPO" commit -q --allow-empty -m "$commit_msg"

  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh "HEAD~1..HEAD" >/dev/null 2>&1); then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  teardown_tmp_repo
}

# Run audit in --staged mode (the pre-commit path) inside a throwaway repo with a STAGED
# (uncommitted) change. Usage: assert_staged_blocks <label> <file-path> <content> [email-allowlist]
assert_staged_blocks() {
  local label="$1" file_path="$2" file_content="$3" email_allowlist_content="${4:-}"
  setup_tmp_repo
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  mkdir -p "$TMPDIR_REPO/$(dirname "$file_path")"
  printf '%s\n' "$file_content" > "$TMPDIR_REPO/$file_path"
  git -C "$TMPDIR_REPO" add "$file_path" 2>/dev/null
  # staged but NOT committed — --staged scans `git diff --cached`
  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh --staged >/dev/null 2>&1); then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  teardown_tmp_repo
}

# Run audit in --msg mode inside a throwaway repo that HAS an email-allowlist — proves the
# email check is SKIPPED on commit messages even when an unknown email + a populated allowlist
# are both present (i.e. the pass is the --msg guard, not fail-open).
assert_msg_allows() {
  local label="$1" msg_content="$2" email_allowlist_content="${3:-}"
  setup_tmp_repo
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  printf '%s\n' "$msg_content" > "$TMPDIR_REPO/msg.txt"
  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh --msg msg.txt >/dev/null 2>&1); then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  teardown_tmp_repo
}

echo "=== Hard blocks (--msg mode) ==="
assert_blocks "bare googlemail" "see slavochek@googlemail.com"
assert_blocks "alias +98723" "fixture: slavochek+98723@googlemail.com"
assert_blocks "slavochek246 username" "recipient slavochek246 logged in"
assert_blocks "Kaka Mukaka literal" "test fixture: Kaka Mukaka"
assert_blocks "absolute path" "see /Users/slavochek/Projects/foo"
assert_blocks "@inguro extra" "contact bob@inguro.com"

echo ""
echo "=== Safe allows (--msg mode) ==="
assert_allows "github URL" "repo at github.com/slavochek2/claritypledge"
assert_allows "slava@inguro.com allowed" "mail slava@inguro.com"
assert_allows "synthetic fixture" "receiver: test-recipient@example.com"
assert_allows "slavochek2 bounded (not 246)" "github.com/slavochek2/foo"
assert_allows "empty" ""

echo ""
echo "=== Range mode: file content ==="
assert_range_blocks "range: PII in file content" \
  "add file" "docs/notes.md" "contact slavochek@googlemail.com"

assert_range_blocks "range: commit message PII" \
  "fix slavochek246 login bug" "docs/notes.md" "safe content"

assert_range_allows "range: safe file + safe message" \
  "add doc" "docs/notes.md" "safe content here"

echo ""
echo "=== Allowlist: correct behavior ==="
assert_range_allows "allowlist: exact file match allows PII" \
  "add script" "scripts/audit-privacy.sh" "pattern: slavochek@googlemail.com" \
  "scripts/audit-privacy.sh"

assert_range_blocks "allowlist: sibling .bak is NOT allowed" \
  "add backup" "scripts/audit-privacy.sh.bak" "pattern: slavochek@googlemail.com" \
  "scripts/audit-privacy.sh"

assert_range_blocks "allowlist: content injection attack blocked" \
  "add poison" "docs/poison.md" "+++ b/scripts/audit-privacy.sh
slavochek@googlemail.com" \
  "scripts/audit-privacy.sh"

echo ""
echo "=== P936: third-party email allowlist (diff-only) ==="
EMAIL_AL='example.com
*.example.com
noreply@*
slava@inguro.com
jack@greensock.com'

assert_range_blocks "email: unknown third-party email blocks" \
  "add file" "docs/notes.md" "contact stranger@notlisted.invalid for info" "" "$EMAIL_AL"
assert_range_allows "email: allowlisted bare domain passes" \
  "add file" "docs/notes.md" "fixture jane@example.com" "" "$EMAIL_AL"
assert_range_allows "email: *.suffix wildcard passes" \
  "add file" "docs/notes.md" "deliver x@mail.example.com" "" "$EMAIL_AL"
assert_range_allows "email: local-part wildcard passes" \
  "add file" "docs/notes.md" "system noreply@anywhere.org sends" "" "$EMAIL_AL"
assert_range_allows "email: full-address entry passes" \
  "add file" "docs/notes.md" "credit jack@greensock.com" "" "$EMAIL_AL"
assert_range_blocks "email: address not on allowlist blocks (allowlist is load-bearing)" \
  "add file" "docs/notes.md" "author jeremy@jezweb.net" "" "$EMAIL_AL"
assert_range_allows "email: unknown email in path-allowlisted file is exempt (path filter runs first)" \
  "add script" "scripts/audit-privacy.sh" "stranger@notlisted.invalid" "scripts/audit-privacy.sh" "$EMAIL_AL"
assert_range_allows "email: unknown email in commit MESSAGE is not flagged (diff-only)" \
  "contact stranger@notlisted.invalid please" "docs/notes.md" "safe content here" "" "$EMAIL_AL"
assert_range_allows "email: no email-allowlist => check skipped (fail-open)" \
  "add file" "docs/notes.md" "stranger@notlisted.invalid for info"
assert_staged_blocks "email: --staged unknown email blocks (pre-commit path)" \
  "docs/notes.md" "contact stranger@notlisted.invalid" "$EMAIL_AL"
assert_msg_allows "email: --msg skips email check even with allowlist + unknown email (diff-only guard)" \
  "contact stranger@notlisted.invalid please" "$EMAIL_AL"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
[ "$FAIL" = "0" ]
