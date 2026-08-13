#!/usr/bin/env bash
# Hermetic tests for the SHA-based privacy gate (Layer 2 of pre-push-checks.sh).
# Tests AC2-AC7 from P950 spec.
# Usage: bash scripts/test-hook-sha-gate.sh
# Exit 0 = all pass, non-zero = first failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/pre-push-checks.sh"

# ── Setup ─────────────────────────────────────────────────────────────────────
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

ORIGIN="$TMP/origin"
LOCAL="$TMP/local"

# Create bare origin
git init --bare "$ORIGIN" -q

# Create local repo with origin
git init "$LOCAL" -q
git -C "$LOCAL" remote add origin "$ORIGIN"
git -C "$LOCAL" config user.email "test@test.com"
git -C "$LOCAL" config user.name "Test"
# Configure safe directory for git operations
git config --global --add safe.directory "$LOCAL" 2>/dev/null || true
git config --global --add safe.directory "$ORIGIN" 2>/dev/null || true

# Create scripts/ dir in LOCAL repo with stubs
mkdir -p "$LOCAL/scripts"

# Stub audit-privacy.sh inside the LOCAL repo's scripts/ dir (Layer 1 stub).
# The hook resolves audit-privacy.sh via `git rev-parse --show-toplevel`/scripts/,
# so it must live there — putting it in PATH is not sufficient.
cat > "$LOCAL/scripts/audit-privacy.sh" << 'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$LOCAL/scripts/audit-privacy.sh"

# Create privacy-watched-paths.sh stub in the local repo
cat > "$LOCAL/scripts/privacy-watched-paths.sh" << 'PATHS'
#!/usr/bin/env bash
WATCHED_PATHS="docs/ features/ .claude/commands/ CLAUDE.md README.md content/articles/ content/sifter/ supabase/migrations/"
PATHS

# Initial commit (non-watched path so Layer 2 doesn't trigger on this)
mkdir -p "$LOCAL/src"
echo "initial" > "$LOCAL/src/app.js"
git -C "$LOCAL" add src/app.js scripts/privacy-watched-paths.sh
git -C "$LOCAL" commit -m "initial" -q
# Push to origin (create main branch)
git -C "$LOCAL" push origin HEAD:main -q

PASS=0
FAIL=0

# Helper: write stamp at given SHA into git-common-dir
stamp() {
  local repo="$1" sha="$2"
  local git_common
  git_common="$(git -C "$repo" rev-parse --git-common-dir)"
  [[ "$git_common" == /* ]] || git_common="$repo/$git_common"
  echo "$sha" > "$git_common/.privacy-reviewed"
}

# Helper: remove stamp
unstamp() {
  local repo="$1"
  local git_common
  git_common="$(git -C "$repo" rev-parse --git-common-dir)"
  [[ "$git_common" == /* ]] || git_common="$repo/$git_common"
  rm -f "$git_common/.privacy-reviewed"
}

# Helper: run the hook against the LOCAL repo simulating a push to main
# Sends the right stdin format: local_ref local_sha remote_ref remote_sha
run_hook() {
  local local_sha remote_sha
  local_sha="$(git -C "$LOCAL" rev-parse HEAD)"
  # Get what origin/main points to (the remote state)
  remote_sha="$(git -C "$LOCAL" rev-parse origin/main 2>/dev/null || echo "0000000000000000000000000000000000000000")"
  # Run the hook from within the LOCAL repo directory
  echo "refs/heads/main $local_sha refs/heads/main $remote_sha" | \
    (cd "$LOCAL" && bash "$HOOK" "origin")
}

check() {
  local label="$1" expected_exit="$2"
  shift 2
  local actual_exit=0
  "$@" >/dev/null 2>&1 || actual_exit=$?
  if [[ "$expected_exit" == "0" ]]; then
    if (( actual_exit == 0 )); then
      echo "  PASS: $label"
      PASS=$((PASS+1))
    else
      echo "  FAIL: $label (expected exit 0, got $actual_exit)"
      FAIL=$((FAIL+1))
    fi
  else
    if (( actual_exit != 0 )); then
      echo "  PASS: $label (exit $actual_exit)"
      PASS=$((PASS+1))
    else
      echo "  FAIL: $label (expected non-zero exit, got 0)"
      FAIL=$((FAIL+1))
    fi
  fi
}

echo "=== SHA gate tests (P950) ==="
echo ""

# ── AC2: stamp at HEAD; watched-path commit is ancestor -> exit 0 ────────────
echo "[AC2] stamp at HEAD, watched-path commit is covered -> PASS"
mkdir -p "$LOCAL/docs"
echo "some docs content" > "$LOCAL/docs/readme.md"
git -C "$LOCAL" add docs/readme.md
git -C "$LOCAL" commit -m "docs: initial docs content" -q
LOCAL_SHA="$(git -C "$LOCAL" rev-parse HEAD)"
stamp "$LOCAL" "$LOCAL_SHA"
check "AC2: pass on covered commit" 0 run_hook
# Push so origin/main advances
git -C "$LOCAL" push origin main -q

# ── AC3: un-covered watched-path commit -> non-zero exit ─────────────────────
echo "[AC3] un-covered watched-path commit -> FAIL (gate blocks)"
# Add new watched-path commit but don't update stamp
echo "new private content" > "$LOCAL/docs/new.md"
git -C "$LOCAL" add docs/new.md
git -C "$LOCAL" commit -m "docs: new unwatched commit" -q
# Stamp still at old LOCAL_SHA (doesn't cover the new commit)
actual=0
run_hook >/dev/null 2>&1 || actual=$?
if (( actual != 0 )); then
  echo "  PASS: AC3 (exit $actual)"
  PASS=$((PASS+1))
else
  echo "  FAIL: AC3 (expected non-zero exit, got 0)"
  FAIL=$((FAIL+1))
fi
# Update stamp and push
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
git -C "$LOCAL" push origin main -q

# ── AC4a: empty stamp -> block ───────────────────────────────────────────────
echo "[AC4a] empty stamp -> FAIL"
echo "more content" >> "$LOCAL/docs/readme.md"
git -C "$LOCAL" add docs/readme.md
git -C "$LOCAL" commit -m "docs: more content" -q
# Write empty stamp
GIT_COMMON_LOCAL="$(git -C "$LOCAL" rev-parse --git-common-dir)"
[[ "$GIT_COMMON_LOCAL" == /* ]] || GIT_COMMON_LOCAL="$LOCAL/$GIT_COMMON_LOCAL"
echo "" > "$GIT_COMMON_LOCAL/.privacy-reviewed"
actual=0; run_hook >/dev/null 2>&1 || actual=$?
if (( actual != 0 )); then echo "  PASS: AC4a (exit $actual)"; PASS=$((PASS+1)); else echo "  FAIL: AC4a"; FAIL=$((FAIL+1)); fi
# Fix stamp and push
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
git -C "$LOCAL" push origin main -q

# ── AC5: co-tenant commit after stamp -> blocks ──────────────────────────────
echo "[AC5] stamp at X; new unreviewed watched-path commit -> blocks until re-stamped"
# First: reviewed commit
echo "reviewed" >> "$LOCAL/docs/readme.md"
git -C "$LOCAL" add docs/readme.md
git -C "$LOCAL" commit -m "docs: reviewed change" -q
REVIEWED_AT="$(git -C "$LOCAL" rev-parse HEAD)"
stamp "$LOCAL" "$REVIEWED_AT"
git -C "$LOCAL" push origin main -q
# Second: new watched-path commit (not covered by stamp at REVIEWED_AT)
echo "co-tenant" >> "$LOCAL/docs/readme.md"
git -C "$LOCAL" add docs/readme.md
git -C "$LOCAL" commit -m "docs: co-tenant change" -q
actual=0; run_hook >/dev/null 2>&1 || actual=$?
if (( actual != 0 )); then echo "  PASS: AC5 (correctly blocks un-reviewed commit, exit $actual)"; PASS=$((PASS+1)); else echo "  FAIL: AC5 (should have blocked)"; FAIL=$((FAIL+1)); fi
# Now update stamp -> should pass
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
check "AC5: pass after updating stamp" 0 run_hook
git -C "$LOCAL" push origin main -q

# ── AC6-nonwatched: non-watched-path commit only -> gate passes (no review needed)
echo "[AC6-nonwatched] only non-watched-path commit -> PASS (no review required)"
unstamp "$LOCAL"
echo "src change" >> "$LOCAL/src/app.js"
git -C "$LOCAL" add src/app.js
git -C "$LOCAL" commit -m "feat: source change only" -q
check "AC6-nonwatched: pass on non-watched change" 0 run_hook
git -C "$LOCAL" push origin main -q

# ── AC6 (spec): merge commit with un-reviewed side-branch watched-path commit -> block
echo "[AC6] merge: side-branch un-reviewed watched-path commit -> FAIL"
# Set stamp at current main HEAD
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
git -C "$LOCAL" push origin main -q 2>/dev/null || true  # push current state
# Create side branch with a watched-path commit
git -C "$LOCAL" checkout -b side-branch-p950-test -q
echo "side branch watched doc" > "$LOCAL/docs/side.md"
git -C "$LOCAL" add docs/side.md
git -C "$LOCAL" commit -m "docs: side branch watched change (un-reviewed)" -q
git -C "$LOCAL" checkout main -q
# Merge the side branch — creates a merge commit; side-branch commit is now reachable
git -C "$LOCAL" merge --no-ff side-branch-p950-test -m "merge: side branch into main" -q
# Stamp is still at the pre-merge main HEAD (doesn't cover the side-branch commit)
actual=0; run_hook >/dev/null 2>&1 || actual=$?
if (( actual != 0 )); then echo "  PASS: AC6 merge shape (exit $actual)"; PASS=$((PASS+1)); else echo "  FAIL: AC6 merge shape (expected block)"; FAIL=$((FAIL+1)); fi
# Now update stamp to HEAD and verify it passes
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
check "AC6: pass after updating stamp to cover merge" 0 run_hook
git -C "$LOCAL" push origin main -q

# ── AC7: content/sifter/ change triggers gate ────────────────────────────────
echo "[AC7] content/sifter/ un-reviewed commit -> FAIL"
mkdir -p "$LOCAL/content/sifter"
echo "session data" > "$LOCAL/content/sifter/session.md"
git -C "$LOCAL" add content/sifter/session.md
git -C "$LOCAL" commit -m "content: sifter session data" -q
# No stamp for this commit
unstamp "$LOCAL"
actual=0; run_hook >/dev/null 2>&1 || actual=$?
if (( actual != 0 )); then echo "  PASS: AC7 (exit $actual)"; PASS=$((PASS+1)); else echo "  FAIL: AC7"; FAIL=$((FAIL+1)); fi
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
git -C "$LOCAL" push origin main -q

# ── AC8: supabase/migrations/ change triggers gate (P1068) ───────────────────
echo "[AC8] supabase/migrations/ un-reviewed commit -> FAIL"
mkdir -p "$LOCAL/supabase/migrations"
echo "-- migration header" > "$LOCAL/supabase/migrations/20260101000000_test.sql"
git -C "$LOCAL" add supabase/migrations/20260101000000_test.sql
git -C "$LOCAL" commit -m "chore: test migration" -q
# No stamp for this commit
unstamp "$LOCAL"
actual=0; run_hook >/dev/null 2>&1 || actual=$?
if (( actual != 0 )); then echo "  PASS: AC8 (exit $actual)"; PASS=$((PASS+1)); else echo "  FAIL: AC8"; FAIL=$((FAIL+1)); fi
stamp "$LOCAL" "$(git -C "$LOCAL" rev-parse HEAD)"
git -C "$LOCAL" push origin main -q

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
(( FAIL == 0 )) && exit 0 || exit 1
