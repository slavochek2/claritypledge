#!/usr/bin/env bash
# P1567: tests the alert block of .github/workflows/supply-chain-audit.yml.
# The block between "# BEGIN alert-block" and "# END alert-block" is extracted with sed (never
# re-typed) and run against a stub `gh` that logs calls and returns canned `issue list` JSON.
# Includes a control: a mutated block that skips `gh issue create` must make the create case FAIL.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
WF="$ROOT/.github/workflows/supply-chain-audit.yml"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0
ok()  { echo "  PASS  $1"; }
bad() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }

BLOCK="$TMP/block.sh"
sed -n '/# BEGIN alert-block/,/# END alert-block/p' "$WF" | sed 's/^ *//' > "$BLOCK"
[ "$(grep -c 'BEGIN alert-block' "$BLOCK")" = 1 ] && [ "$(grep -c 'END alert-block' "$BLOCK")" = 1 ] \
  || { echo "FAIL  block markers not found exactly once in $WF"; exit 1; }

mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
if [ "$1 $2" = "issue list" ]; then
  echo "gh $*" >> "$GH_LOG"
  if [ "${GH_LIST_FAIL:-0}" = 1 ]; then echo "HTTP 502" >&2; exit 1; fi
  printf '%s' "${GH_LIST_JSON:-[]}"
else
  echo "gh $*" >> "$GH_LOG"
fi
STUB
chmod +x "$TMP/bin/gh"

TITLE="Supply-chain audit: FINDING or INCOMPLETE on main"
RUN_URL="https://github.com/o/r/actions/runs/42"
OPEN_JSON="[{\"number\":7,\"title\":\"$TITLE\"},{\"number\":8,\"title\":\"other\"}]"

# run <block-file> <audit-code-or-UNSET> <open|none> -> sets LOG to the gh call log
run() {
  local blk="$1" code="$2" state="$3"
  : > "$TMP/gh.log"
  local json="[]"; [ "$state" = open ] && json="$OPEN_JSON"
  if [ "$code" = UNSET ]; then
    env -u AUDIT_CODE PATH="$TMP/bin:$PATH" GH_LOG="$TMP/gh.log" GH_LIST_JSON="$json" \
      GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=o/r GITHUB_RUN_ID=42 \
      bash -c 'set -euo pipefail; . "$1"' _ "$blk" > "$TMP/run.out" 2>&1
  else
    PATH="$TMP/bin:$PATH" GH_LOG="$TMP/gh.log" GH_LIST_JSON="$json" AUDIT_CODE="$code" \
      GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=o/r GITHUB_RUN_ID=42 \
      bash -c 'set -euo pipefail; . "$1"' _ "$blk" > "$TMP/run.out" 2>&1
  fi
  return $?
}

LIST="gh issue list --state open --author app/github-actions --limit 100 --json number,title"
# check <name> <block> <code> <open|none> <expected log, lines separated by \n>
check() {
  local name="$1" blk="$2" code="$3" state="$4" want="$5"
  if ! run "$blk" "$code" "$state"; then
    echo "        block exited non-zero: $(head -3 "$TMP/run.out")"; return 1
  fi
  if [ "$(cat "$TMP/gh.log")" = "$(printf '%b' "$want")" ]; then return 0; fi
  echo "        got:"; sed 's/^/          /' "$TMP/gh.log"; return 1
}
expect() { local name="$1"; shift; if check "$name" "$@"; then ok "$name"; else bad "$name"; fi; }

B() { echo "--title $TITLE --body Supply-chain audit: $1. Run: $RUN_URL"; }
expect "exit 0, no open issue: list only" "$BLOCK" 0 none "$LIST"
expect "exit 0, open issue: close" "$BLOCK" 0 open "$LIST\ngh issue close 7 --comment Recovered: audit CLEAN. Run: $RUN_URL"
expect "exit 1, no issue: create FINDING" "$BLOCK" 1 none "$LIST\ngh issue create $(B 'FINDING (exit 1)')"
expect "exit 1, open issue: comment, no create" "$BLOCK" 1 open "$LIST\ngh issue comment 7 --body Supply-chain audit: FINDING (exit 1). Run: $RUN_URL"
expect "exit 2, no issue: create INCOMPLETE" "$BLOCK" 2 none "$LIST\ngh issue create $(B 'INCOMPLETE (exit 2)')"
expect "audit never ran (unset): create INCOMPLETE" "$BLOCK" UNSET none "$LIST\ngh issue create $(B 'INCOMPLETE (audit did not finish)')"
expect "audit never ran (empty): create INCOMPLETE" "$BLOCK" "" none "$LIST\ngh issue create $(B 'INCOMPLETE (audit did not finish)')"
expect "crash code 137: create INCOMPLETE" "$BLOCK" 137 none "$LIST\ngh issue create $(B 'INCOMPLETE (audit did not finish)')"
expect "crash code 137, open issue: comment INCOMPLETE" "$BLOCK" 137 open "$LIST\ngh issue comment 7 --body Supply-chain audit: INCOMPLETE (audit did not finish). Run: $RUN_URL"
# hostile code value must not leak into the body
expect "non-numeric code text is not echoed" "$BLOCK" 'x; touch /tmp/p1567-pwn' none "$LIST\ngh issue create $(B 'INCOMPLETE (audit did not finish)')"
[ ! -e /tmp/p1567-pwn ] || bad "hostile code executed"
# a failed issue lookup must still raise the alert
GH_LIST_FAIL=1 expect "issue lookup fails, exit 1: still creates" "$BLOCK" 1 none "$LIST\ngh issue create $(B 'FINDING (exit 1)')"
# a simulated clean run audited nothing: it must never close a real alert
SIMULATED=true expect "simulated exit 0, open issue: no close" "$BLOCK" 0 open "$LIST"
SIMULATED=false expect "real exit 0 with SIMULATED=false still closes" "$BLOCK" 0 open "$LIST\ngh issue close 7 --comment Recovered: audit CLEAN. Run: $RUN_URL"

# --- control: mutated block that skips create must be caught by the same assertion ----------------
sed 's/gh issue create/true/' "$BLOCK" > "$TMP/mut.sh"
if grep -q 'gh issue create' "$TMP/mut.sh"; then bad "control mutation did not apply"; fi
if check "control" "$TMP/mut.sh" 1 none "$LIST\ngh issue create $(B 'FINDING (exit 1)')" >/dev/null 2>&1; then
  bad "control: mutated block (no create) was NOT detected"
else
  ok "control: mutated block (no create) is detected as failing"
fi

# --- structure ---------------------------------------------------------------------------------
grep -q 'persist-credentials: false' "$WF" && ok "persist-credentials: false" || bad "persist-credentials: false missing"
grep -q 'simulate_exit' "$WF" && ok "simulate_exit input present" || bad "simulate_exit missing"
grep -q 'GH_REPO: \${{ github.repository }}' "$WF" && ok "GH_REPO set (gh does not depend on the checkout)" || bad "GH_REPO missing"
grep -q 'ref: main' "$WF" && ok "checkout pinned to main" || bad "checkout not pinned to main"
grep -qE '^concurrency:' "$WF" && grep -q 'cancel-in-progress: false' "$WF" && ok "one run at a time" || bad "no concurrency group"

echo "failures: $FAILS"
[ "$FAILS" = 0 ]
