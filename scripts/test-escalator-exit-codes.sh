#!/usr/bin/env bash
# P1155 — process-level exit-code proof for scripts/alert-escalator.mjs.
#
# The unit suite (test-alert-escalator.mjs) imports the evaluators and asserts on
# their return values. It never runs the script as a PROCESS, so it cannot see the
# thing CI actually dispatches on: the exit code. That gap is not cosmetic — the
# script deliberately overrides Node's default uncaught-exception exit of 1,
# because 1 already means "email sent" (A7). If that override regressed, every
# crash would be read by the workflow as a successful escalation and the run would
# go green. No assertion inside the module can catch that.
#
# So this runs the real file, offline, with `gh` and `git` stubbed onto PATH, and
# asserts all three codes: 0 clean, 1 due, 2 broken.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/alert-escalator.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then printf 'PASS  %s (exit %s)\n' "$1" "$3"
  else printf 'FAIL  %s — expected exit %s, got %s\n' "$1" "$2" "$3"; fail=1; fi
}

mkdir -p "$TMP/bin"

# --- stub gh -------------------------------------------------------------
# Emits whatever fixture file the current case wrote. A stub that answered from
# hardcoded strings would test the stub; this way each case owns its data.
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "issue list")  cat "$GH_ISSUES_FIXTURE" ;;
  "run list")    cat "$GH_RUNS_FIXTURE" ;;
  "label create"|"issue edit") exit 0 ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 1 ;;
esac
STUB
# git is real but must answer for files that do not exist here; an empty answer is
# the "unknown add date" path the evaluator already treats as old.
cat > "$TMP/bin/git" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$TMP/bin/gh" "$TMP/bin/git"
export PATH="$TMP/bin:$PATH"

NOW_MINUS_10D="$(node -e 'console.log(new Date(Date.now()-10*864e5).toISOString())')"
NOW="$(node -e 'console.log(new Date().toISOString())')"

echo '[]' > "$TMP/runs.json"
export GH_RUNS_FIXTURE="$TMP/runs.json"

# Registry with a single issue-age check and no workflow checks, so the case under
# test is the issue path alone.
cat > "$TMP/registry.json" <<'REG'
{ "checks": [ { "id": "t", "kind": "github-issue-age",
  "match_title": "Prod drift detected", "escalate_at_days": [2, 7, 30] } ] }
REG

# --- case 1: nothing open -> EXIT_CLEAN (0) ------------------------------
echo '[]' > "$TMP/issues.json"
export GH_ISSUES_FIXTURE="$TMP/issues.json"
node "$SCRIPT" --dry-run --registry "$TMP/registry.json" >/dev/null 2>&1
check "nothing due exits CLEAN" 0 $?

# --- case 2: an aged bot issue -> EXIT_DUE (1), and the mail is composed ---
cat > "$TMP/issues.json" <<JSON
[{ "number": 11, "title": "Prod drift detected", "createdAt": "$NOW_MINUS_10D",
   "labels": [], "url": "https://example.invalid/11",
   "author": { "login": "app/github-actions", "is_bot": true } }]
JSON
out="$(node "$SCRIPT" --dry-run --registry "$TMP/registry.json" 2>&1)"
check "an aged bot issue exits DUE" 1 $?
if grep -q "Subject:" <<<"$out"; then echo "PASS  the DUE run actually composed a message"
else echo "FAIL  DUE exit with no composed message"; fail=1; fi

# --- case 3: a fresh issue -> back to CLEAN (the no-false-alarm case) -----
cat > "$TMP/issues.json" <<JSON
[{ "number": 12, "title": "Prod drift detected", "createdAt": "$NOW",
   "labels": [], "url": "https://example.invalid/12",
   "author": { "login": "app/github-actions", "is_bot": true } }]
JSON
node "$SCRIPT" --dry-run --registry "$TMP/registry.json" >/dev/null 2>&1
check "a fresh issue exits CLEAN" 0 $?

# --- case 4: a broken registry -> EXIT_BROKEN (2), NOT 1 -----------------
# This is the assertion the unit suite structurally cannot make. A crash must not
# be spelled the same way as a successful send.
echo '{ "checks": [ { "id": "t", "kind": "no-such-kind" } ] }' > "$TMP/bad.json"
node "$SCRIPT" --dry-run --registry "$TMP/bad.json" >/dev/null 2>&1
check "an unknown kind exits BROKEN, not DUE" 2 $?

# --- case 5: gh itself failing -> EXIT_BROKEN (2) ------------------------
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "gh: auth token expired" >&2; exit 1
STUB
chmod +x "$TMP/bin/gh"
node "$SCRIPT" --dry-run --registry "$TMP/registry.json" >/dev/null 2>&1
check "a failed gh call exits BROKEN, never CLEAN" 2 $?

echo
if [ "$fail" -eq 0 ]; then echo "RESULT: all exit-code cases passed"; else echo "RESULT: FAILURES"; fi
exit "$fail"
