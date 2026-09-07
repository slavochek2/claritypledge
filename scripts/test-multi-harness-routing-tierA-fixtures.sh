#!/usr/bin/env bash
# P1247 epistemic gate 7 / 7c evidence: Tier A's false-positive and
# failure-path proofs, run against FIXTURES, never the live adapters.
#
# Sources scripts/test-multi-harness-routing.sh (no duplicated assertion
# logic) and calls run_tier_a() three times with TIER_A_CODEX_CONFIG/
# TIER_A_ROUTE_HOOK pointed at synthetic fixtures built here:
#   legit    - real adapter-local Codex content, no Claude leakage -> must PASS
#   bad-env  - legit-looking config that leaks a CLAUDE_CODE_ var  -> must FAIL
#   bad-hook - a hook whose output leaks the Claude-only rules path -> must FAIL
#
# Run: ./scripts/test-multi-harness-routing-tierA-fixtures.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$(mktemp -d "${TMPDIR:-/tmp}/p1247-tierA-fixtures.XXXXXX")"
trap 'rm -rf "$FIXTURES"' EXIT

mkdir -p "$FIXTURES/legit/.codex/hooks" "$FIXTURES/bad-env/.codex/hooks" "$FIXTURES/bad-hook/.codex/hooks"

cat >"$FIXTURES/legit/.codex/config.toml" <<'EOF'
# Legitimate Codex-only adapter config -- harness-local, no Claude leakage.
model_reasoning_effort = "high"
external-agent-import-sync-enabled = false

[plugins."security-guidance@claude-plugins-official"]
enabled = false
EOF
cp "$ROOT/.codex/hooks/route-brief.sh" "$FIXTURES/legit/.codex/hooks/route-brief.sh"
chmod +x "$FIXTURES/legit/.codex/hooks/route-brief.sh"

cat >"$FIXTURES/bad-env/.codex/config.toml" <<'EOF'
model_reasoning_effort = "high"
CLAUDE_CODE_SSE_PORT = "12345"
EOF
cp "$ROOT/.codex/hooks/route-brief.sh" "$FIXTURES/bad-env/.codex/hooks/route-brief.sh"
chmod +x "$FIXTURES/bad-env/.codex/hooks/route-brief.sh"

cp "$FIXTURES/legit/.codex/config.toml" "$FIXTURES/bad-hook/.codex/config.toml"
cat >"$FIXTURES/bad-hook/.codex/hooks/route-brief.sh" <<'HOOK'
#!/bin/bash
JQ=/usr/bin/jq
BODY="see ~/.codex/model-routing.md and also .claude/rules/model-effort.md"
OUT=$(printf '%s' "$BODY" | "$JQ" -Rs '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.}}')
printf '%s' "$OUT"
exit 0
HOOK
chmod +x "$FIXTURES/bad-hook/.codex/hooks/route-brief.sh"

overall_fail=0

run_fixture() {
  local name="$1" expect="$2"
  # shellcheck source=scripts/test-multi-harness-routing.sh
  TIER_A_CODEX_CONFIG="$FIXTURES/$name/.codex/config.toml" \
  TIER_A_ROUTE_HOOK="$FIXTURES/$name/.codex/hooks/route-brief.sh" \
  bash -c '
    source "$1/scripts/test-multi-harness-routing.sh"
    run_tier_a
    echo "=== $pass passed, $fail failed (fixture: $2) ==="
    [[ "$fail" -eq 0 ]]
  ' _ "$ROOT" "$name"
  local actual=$?
  if [[ "$expect" == "pass" && "$actual" -ne 0 ]]; then
    echo "UNEXPECTED: fixture '$name' was expected to PASS but exited $actual"
    overall_fail=1
  elif [[ "$expect" == "fail" && "$actual" -eq 0 ]]; then
    echo "UNEXPECTED: fixture '$name' was expected to FAIL but exited 0"
    overall_fail=1
  fi
  echo
}

echo "### fixture: legit (expect PASS -- legitimate adapter-local content) ###"
run_fixture legit pass

echo "### fixture: bad-env (expect FAIL -- leaks CLAUDE_CODE_ var) ###"
run_fixture bad-env fail

echo "### fixture: bad-hook (expect FAIL -- hook leaks Claude rules path) ###"
run_fixture bad-hook fail

if (( overall_fail )); then
  echo "=== tierA fixture harness: UNEXPECTED result(s) above ==="
  exit 1
else
  echo "=== tierA fixture harness: all fixtures behaved as expected ==="
fi
