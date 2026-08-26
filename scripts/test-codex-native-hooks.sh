#!/usr/bin/env bash
# P1157: deterministic Codex hook-event fixtures. These use the stable event
# fields documented by Codex, never transcript JSONL.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIFECYCLE="$ROOT/.codex/hooks/codex-lifecycle-state.py"
INSTRUCTION_GATE="$ROOT/.codex/hooks/instruction-gate-pre.py"
DEPLOY_GATE="$HOME/.codex/hooks/block-prod-deploy.sh"
DESIGN_CHECK="$ROOT/.codex/hooks/design-system-check.sh"
LINT_CHECK="$ROOT/.codex/hooks/lint-after-edit.sh"
STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/p1157-codex-hooks.XXXXXX")"
trap 'rm -rf "$STATE_DIR" /tmp/.codex-instruction-gate-ok' EXIT

pass=0
fail=0
LAST=""
LAST_EXIT=0

run_json() {
  local label="$1" program="$2" payload="$3"
  LAST_EXIT=0
  LAST="$(printf '%s' "$payload" | CODEX_HOOK_STATE_DIR="$STATE_DIR" "$program" 2>&1)" || LAST_EXIT=$?
  if [[ "$LAST_EXIT" -eq 0 ]] && printf '%s' "$LAST" | jq -e . >/dev/null 2>&1; then
    echo "PASS  $label"
    pass=$((pass + 1))
  else
    echo "FAIL  $label: exit=$LAST_EXIT output=$LAST"
    fail=$((fail + 1))
  fi
}

assert_jq() {
  local label="$1" filter="$2"
  if printf '%s' "$LAST" | jq -e "$filter" >/dev/null 2>&1; then
    echo "PASS  $label"
    pass=$((pass + 1))
  else
    echo "FAIL  $label: filter=$filter output=$LAST"
    fail=$((fail + 1))
  fi
}

event() {
  local event_name="$1" turn="$2" extra="$3"
  local extra_json
  extra_json="$(jq -cn "$extra")" || return 1
  jq -cn --arg event "$event_name" --arg turn "$turn" --argjson extra "$extra_json" \
    '{session_id:"fixture-session",turn_id:$turn,cwd:"/fixture",hook_event_name:$event,model:"gpt-fixture",permission_mode:"default"} + $extra'
}

success_edit() {
  event PostToolUse "$1" '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: src/fixture.ts\n*** End Patch"},tool_response:"Exit code: 0\nOutput:\nSuccess. Updated src/fixture.ts"}'
}

echo "=== Codex native lifecycle fixtures ==="

run_json "record successful edit" "$LIFECYCLE" "$(success_edit turn-unverified)"
run_json "unverified completion claim returns JSON" "$LIFECYCLE" "$(event Stop turn-unverified '{stop_hook_active:false,last_assistant_message:"Implemented and ready."}')"
assert_jq "unverified completion claim blocks" '.decision == "block"'

run_json "record second edit" "$LIFECYCLE" "$(success_edit turn-verified)"
run_json "record successful fail-closed curl" "$LIFECYCLE" "$(event PostToolUse turn-verified '{tool_name:"Bash",tool_input:{command:".codex/hooks/run-verified.sh curl --fail https://example.test/health"},tool_response:"HTTP 200\n__CODEX_VERIFICATION_EXIT_0__"}')"
run_json "verified completion claim returns JSON" "$LIFECYCLE" "$(event Stop turn-verified '{stop_hook_active:false,last_assistant_message:"Implemented and verified."}')"
assert_jq "successful curl allows completion" '.decision == null'

run_json "record edit before failed curl" "$LIFECYCLE" "$(success_edit turn-curl-failed)"
run_json "record failed curl" "$LIFECYCLE" "$(event PostToolUse turn-curl-failed '{tool_name:"Bash",tool_input:{command:".codex/hooks/run-verified.sh curl --fail https://example.test/health"},tool_response:"HTTP 500"}')"
run_json "failed curl completion claim" "$LIFECYCLE" "$(event Stop turn-curl-failed '{stop_hook_active:false,last_assistant_message:"Fixed and ready."}')"
assert_jq "nonzero curl still blocks" '.decision == "block"'

run_json "record edit before HTTP failure" "$LIFECYCLE" "$(success_edit turn-http-failed)"
run_json "record curl with HTTP failure but zero exit" "$LIFECYCLE" "$(event PostToolUse turn-http-failed '{tool_name:"Bash",tool_input:{command:"curl https://example.test/missing"},tool_response:{exit_code:0,output:"HTTP 404"}}')"
run_json "HTTP failure completion claim" "$LIFECYCLE" "$(event Stop turn-http-failed '{stop_hook_active:false,last_assistant_message:"Done."}')"
assert_jq "HTTP failure still blocks" '.decision == "block"'

run_json "record edit before browser error" "$LIFECYCLE" "$(success_edit turn-browser-failed)"
run_json "record browser tool error" "$LIFECYCLE" "$(event PostToolUse turn-browser-failed '{tool_name:"mcp__chrome__screenshot",tool_input:{},tool_response:{isError:true,content:[{type:"text",text:"navigation failed"}]}}')"
run_json "browser error completion claim" "$LIFECYCLE" "$(event Stop turn-browser-failed '{stop_hook_active:false,last_assistant_message:"Working now."}')"
assert_jq "browser tool error still blocks" '.decision == "block"'

run_json "record edit before bare test command" "$LIFECYCLE" "$(success_edit turn-bare-test)"
run_json "record bare test command without sentinel" "$LIFECYCLE" "$(event PostToolUse turn-bare-test '{tool_name:"Bash",tool_input:{command:"npm test"},tool_response:"Tests passed"}')"
run_json "bare test completion claim" "$LIFECYCLE" "$(event Stop turn-bare-test '{stop_hook_active:false,last_assistant_message:"All tests passed."}')"
assert_jq "bare Bash output cannot impersonate verified exit status" '.decision == "block"'

run_json "record edit before composed fake verification" "$LIFECYCLE" "$(success_edit turn-composed-test)"
run_json "record composed fake verification" "$LIFECYCLE" "$(event PostToolUse turn-composed-test '{tool_name:"Bash",tool_input:{command:"echo npm test; .codex/hooks/run-verified.sh true"},tool_response:"npm test\n__CODEX_VERIFICATION_EXIT_0__"}')"
run_json "composed fake verification completion claim" "$LIFECYCLE" "$(event Stop turn-composed-test '{stop_hook_active:false,last_assistant_message:"All tests passed."}')"
assert_jq "runner sentinel cannot borrow a test token from another command" '.decision == "block"'

run_json "record failed apply_patch" "$LIFECYCLE" "$(event PostToolUse turn-failed-edit '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: src/missing.ts\n*** End Patch"},tool_response:"Exit code: 1\nOutput:\npatch target missing"}')"
run_json "completion after failed apply_patch" "$LIFECYCLE" "$(event Stop turn-failed-edit '{stop_hook_active:false,last_assistant_message:"Ready."}')"
assert_jq "failed apply_patch does not create a false edit state" '.decision == null'

run_json "non-claim Stop returns JSON" "$LIFECYCLE" "$(event Stop turn-nonclaim '{stop_hook_active:false,last_assistant_message:"Here is what I found."}')"
assert_jq "non-claim allows" '.decision == null'

run_json "malformed input fails open with JSON" "$LIFECYCLE" 'not-json'
assert_jq "malformed input does not block" '.decision == null'
run_json "missing fields fail open with JSON" "$LIFECYCLE" '{}'
assert_jq "missing fields do not block" '.decision == null'

run_json "record edit before repeated Stop" "$LIFECYCLE" "$(success_edit turn-repeat)"
run_json "active Stop chain returns JSON" "$LIFECYCLE" "$(event Stop turn-repeat '{stop_hook_active:true,last_assistant_message:"Done."}')"
assert_jq "stop_hook_active prevents a loop" '.decision == null'

run_json "record founder cannot see UI" "$LIFECYCLE" "$(event UserPromptSubmit turn-ui '{prompt:"I still do not see the UI change."}')"
run_json "blind UI re-edit returns JSON" "$LIFECYCLE" "$(event PreToolUse turn-ui '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: src/Fixture.tsx\n*** End Patch"}}')"
assert_jq "blind UI re-edit is denied" '.hookSpecificOutput.permissionDecision == "deny"'
run_json "record successful browser evidence" "$LIFECYCLE" "$(event PostToolUse turn-ui '{tool_name:"mcp__chrome__screenshot",tool_input:{},tool_response:{isError:false,content:[{type:"image"}]}}')"
run_json "UI edit after evidence returns JSON" "$LIFECYCLE" "$(event PreToolUse turn-ui '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: src/Fixture.tsx\n*** End Patch"}}')"
assert_jq "successful browser evidence allows UI edit" '.hookSpecificOutput.permissionDecision == null'

echo "=== Codex instruction and deploy blocker fixtures ==="
run_json "instruction edit without gate returns JSON" "$INSTRUCTION_GATE" "$(event PreToolUse turn-gate '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: AGENTS.md\n*** End Patch"}}')"
assert_jq "instruction edit is denied before gate" '.hookSpecificOutput.permissionDecision == "deny"'
touch /tmp/.codex-instruction-gate-ok
run_json "instruction edit after gate returns JSON" "$INSTRUCTION_GATE" "$(event PreToolUse turn-gate '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: AGENTS.md\n*** End Patch"}}')"
assert_jq "recent gate marker allows one instruction edit" '.hookSpecificOutput.permissionDecision == null'

LAST_EXIT=0
LAST="$(printf '%s' "$(event PreToolUse turn-deploy '{tool_name:"Bash",tool_input:{command:"git push origin main"}}')" | HOME="$STATE_DIR/home" "$DEPLOY_GATE" 2>&1)" || LAST_EXIT=$?
if [[ "$LAST_EXIT" -eq 2 ]] && [[ "$LAST" == *"BLOCKED"* ]]; then
  echo "PASS  production push path is blocked on a real Codex event"
  pass=$((pass + 1))
else
  echo "FAIL  production push blocker: exit=$LAST_EXIT output=$LAST"
  fail=$((fail + 1))
fi

echo "=== Codex apply_patch PostToolUse ports ==="
mkdir -p "$STATE_DIR/bin" "$STATE_DIR/project/src"
printf '%s\n' '{"color":"#f59e0b"}' >"$STATE_DIR/design.excalidraw"
DESIGN_PAYLOAD="$(event PostToolUse turn-design "{tool_name:\"apply_patch\",tool_input:{command:\"*** Begin Patch\\n*** Update File: $STATE_DIR/design.excalidraw\\n*** End Patch\"},tool_response:{exit_code:0}}")"
DESIGN_OUTPUT="$(printf '%s' "$DESIGN_PAYLOAD" | "$DESIGN_CHECK" 2>&1)"
if [[ "$DESIGN_OUTPUT" == *"Found forbidden amber"* ]]; then
  echo "PASS  design check extracts a Codex apply_patch path"
  pass=$((pass + 1))
else
  echo "FAIL  design check path extraction: output=$DESIGN_OUTPUT"
  fail=$((fail + 1))
fi

RUNNER="$ROOT/.codex/hooks/run-verified.sh"
RUNNER_OK="$("$RUNNER" sh -c 'printf runner-ok' 2>&1)"; RUNNER_OK_EXIT=$?
if [[ "$RUNNER_OK_EXIT" -eq 0 ]] && [[ "$RUNNER_OK" == *"__CODEX_VERIFICATION_EXIT_0__"* ]]; then
  echo "PASS  verification runner emits sentinel after zero exit"
  pass=$((pass + 1))
else
  echo "FAIL  verification runner zero-exit path: exit=$RUNNER_OK_EXIT output=$RUNNER_OK"
  fail=$((fail + 1))
fi
RUNNER_FAIL="$("$RUNNER" sh -c 'printf runner-fail; exit 7' 2>&1)"; RUNNER_FAIL_EXIT=$?
if [[ "$RUNNER_FAIL_EXIT" -eq 7 ]] && [[ "$RUNNER_FAIL" != *"__CODEX_VERIFICATION_EXIT_0__"* ]]; then
  echo "PASS  verification runner withholds sentinel after nonzero exit"
  pass=$((pass + 1))
else
  echo "FAIL  verification runner nonzero path: exit=$RUNNER_FAIL_EXIT output=$RUNNER_FAIL"
  fail=$((fail + 1))
fi

printf '#!/bin/sh\nprintf "%%s\\n" "$*" > "$HOOK_TEST_LOG"\nexit 0\n' >"$STATE_DIR/bin/npx"
chmod +x "$STATE_DIR/bin/npx"
LINT_PAYLOAD="$(event PostToolUse turn-lint '{tool_name:"apply_patch",tool_input:{command:"*** Begin Patch\n*** Update File: src/fixture.ts\n*** End Patch"},tool_response:{exit_code:0}}')"
printf '%s' "$LINT_PAYLOAD" | PATH="$STATE_DIR/bin:$PATH" CODEX_PROJECT_DIR="$STATE_DIR/project" HOOK_TEST_LOG="$STATE_DIR/lint.log" "$LINT_CHECK" >/dev/null 2>&1
if grep -q 'eslint --fix --quiet --no-warn-ignored src/fixture.ts' "$STATE_DIR/lint.log"; then
  echo "PASS  lint check extracts a Codex apply_patch path"
  pass=$((pass + 1))
else
  echo "FAIL  lint check path extraction"
  fail=$((fail + 1))
fi

echo "=== $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]
