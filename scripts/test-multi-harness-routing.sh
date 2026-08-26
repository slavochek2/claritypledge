#!/usr/bin/env bash
# P1157: routing, adapter-isolation, and external-executor contract canary.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIVERSAL="$HOME/.agents/model-routing.md"
CODEX_ADAPTER="$HOME/.codex/model-routing.md"
DSH_ADAPTER="$HOME/.dsh/model-routing.md"
WRAPPER="$HOME/.agents/bin/delegate-gemini"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/p1157-routing.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

# This suite asserts against per-machine adapter files that live in $HOME, NOT in
# the repo. On a fresh clone, a CI runner, or a second machine every `contains`
# greps a missing file and reports `bad` -- 31 failures that say "your routing is
# broken" when they mean "this machine is not set up". Detect that up front and
# SKIP with exit 0, so the suite is honest about what it did rather than loud
# about a machine it cannot inspect. Exit 0 is deliberate: a skip is not a pass,
# but it must not block a commit on a machine the suite was never able to cover.
MISSING_ADAPTERS=()
for _f in "$UNIVERSAL" "$CODEX_ADAPTER" "$DSH_ADAPTER" "$WRAPPER"; do
  [[ -e "$_f" ]] || MISSING_ADAPTERS+=("$_f")
done
if (( ${#MISSING_ADAPTERS[@]} > 0 )); then
  echo "SKIP  multi-harness routing suite: this machine has no adapter set installed."
  printf '        missing: %s\n' "${MISSING_ADAPTERS[@]}"
  echo "        These files are per-machine and intentionally outside the repo."
  echo "        Nothing was verified. This is a SKIP, not a pass."
  echo "=== 0 passed, 0 failed (skipped: adapters not installed) ==="
  exit 0
fi

pass=0
fail=0

ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1${2:+: $2}"; fail=$((fail + 1)); }

contains() {
  local label="$1" file="$2" pattern="$3"
  if grep -qEi -- "$pattern" "$file"; then ok "$label"; else bad "$label" "pattern absent"; fi
}

absent() {
  local label="$1" file="$2" pattern="$3"
  if grep -qEi -- "$pattern" "$file"; then bad "$label" "unexpected pattern present"; else ok "$label"; fi
}

run_exit() {
  local label="$1" expected="$2"
  shift 2
  local actual=0
  "$@" >/dev/null 2>&1 || actual=$?
  if [[ "$actual" -eq "$expected" ]]; then ok "$label"; else bad "$label" "expected $expected, got $actual"; fi
}

echo "=== Universal policy and adapter isolation ==="
contains "policy classifies judgment" "$UNIVERSAL" 'Judgment'
contains "policy classifies bounded bulk" "$UNIVERSAL" 'Bounded bulk'
contains "policy classifies long agentic loops" "$UNIVERSAL" 'Long agentic loop'
contains "policy requires positive data eligibility" "$UNIVERSAL" 'positively established'
contains "policy requires tools and context" "$UNIVERSAL" 'every tool and piece of context'
contains "policy requires an independent oracle" "$UNIVERSAL" 'independent oracle'
contains "policy treats deny scan as defense-in-depth" "$UNIVERSAL" 'defense-in-depth'
absent "universal policy names no vendor/model" "$UNIVERSAL" 'Claude|Codex|DSH|Gemini|OpenAI|Anthropic|DeepSeek|Opus|Sonnet|Sol|Terra|Luna|GPT-[0-9]'

contains "Codex adapter uses runtime metadata" "$CODEX_ADAPTER" 'session metadata'
contains "Codex adapter discovers its roster" "$CODEX_ADAPTER" 'Discover models and native subagent profiles'
contains "Codex adapter surfaces unknown roster" "$CODEX_ADAPTER" 'roster or quota is unavailable'
contains "DSH adapter names its config oracle" "$DSH_ADAPTER" 'dsh --profile <profile> --dump-config'
contains "DSH adapter includes persisted runtime settings" "$DSH_ADAPTER" 'settings.yaml'
contains "DSH adapter resolves conflicts independently" "$DSH_ADAPTER" 'credential-removal canary'
absent "Codex global instructions removed Opus warning" "$HOME/.codex/AGENTS.md" 'not Opus|model name does not contain.*opus'
absent "Codex global instructions do not own Claude quota" "$HOME/.codex/AGENTS.md" 'quota-cache|Claude subscription'
absent "project Codex config has no Claude environment variables" "$ROOT/.codex/config.toml" 'CLAUDE_CODE_'
absent "global Codex config has no Claude environment variables" "$HOME/.codex/config.toml" 'CLAUDE_CODE_'
contains "Codex skill importer is disabled" "$HOME/.codex/config.toml" 'external-agent-import-sync-enabled = false'
if awk '/\[plugins\."security-guidance@claude-plugins-official"\]/{getline; if ($0 == "enabled = false") found=1} END{exit !found}' "$HOME/.codex/config.toml"; then
  ok "unsupported security plugin is disabled"
else
  bad "unsupported security plugin is disabled"
fi

echo "=== Live DSH route oracle ==="
DSH_NATIVE="$(dsh --profile headless --dump-config 2>/dev/null || true)"
DSH_EXTERNAL="$(dsh --profile headless --patch "$HOME/.claude/dsh-gemini.patch.yml" --dump-config 2>/dev/null || true)"
if printf '%s' "$DSH_NATIVE" | grep -q 'provider: deepseek-official' &&
   awk '/^agent-default-model:/{seen=1; next} seen && /^  provider: google$/{provider=1} seen && /^  model: gemini-3.7-flash$/{model=1} END{exit !(provider && model)}' "$HOME/.dsh/settings.yaml"; then
  ok "DSH profile/runtime-settings conflict is detected"
else
  bad "DSH profile/runtime-settings conflict is detected"
fi
DSH_NO_GOOGLE="$(env -u GEMINI_API_KEY dsh --profile headless 'provider canary' 2>&1 || true)"
if printf '%s' "$DSH_NO_GOOGLE" | grep -q 'no credential for provider route "google"'; then
  ok "credential-removal canary proves the runtime selects Google"
else
  bad "credential-removal canary proves the runtime selects Google" "$DSH_NO_GOOGLE"
fi
if printf '%s' "$DSH_EXTERNAL" | grep -q 'provider: google' &&
   printf '%s' "$DSH_EXTERNAL" | grep -q 'model: gemini-3.7-flash'; then
  ok "external DSH provider/model observed from patched config"
else
  bad "external DSH provider/model observed from patched config"
fi
if printf '%s' "$DSH_EXTERNAL" | grep -q 'subagent-spawn-in-process' &&
   printf '%s' "$DSH_EXTERNAL" | grep -q 'subagent-fork-in-process'; then
  ok "DSH spawn/fork roster discovered"
else
  bad "DSH spawn/fork roster discovered"
fi

echo "=== Delegation wrapper outcomes ==="
run_exit "public bounded corpus passes scan" 0 bash -c "printf '%s' 'Summarize the public README into five bullets.' | '$WRAPPER' --check"
run_exit "unclassified content with synthetic email refuses" 2 bash -c "printf '%s' 'Contact fixture@example.com about this.' | '$WRAPPER' --check"
run_exit "private path refuses" 2 bash -c "printf '%s' 'Read Projects/private/notes.txt' | '$WRAPPER' --check"
run_exit "private path casing variant refuses" 2 bash -c "printf '%s' 'Read /USERS/example/Projects/private/notes.txt' | '$WRAPPER' --check"
run_exit "missing provider overlay is integrity exit 3" 3 env HOME="$TMP_ROOT/empty-home" bash -c "printf '%s' 'Summarize a public README.' | '$WRAPPER' --check"

mkdir -p "$TMP_ROOT/executor-home/.claude" "$TMP_ROOT/bin"
cp "$HOME/.claude/dsh-gemini.patch.yml" "$TMP_ROOT/executor-home/.claude/dsh-gemini.patch.yml"
printf '#!/bin/sh\nexit 42\n' >"$TMP_ROOT/bin/dsh"
chmod +x "$TMP_ROOT/bin/dsh"
run_exit "executor failure is surfaced without wrapper retry" 42 env HOME="$TMP_ROOT/executor-home" PATH="$TMP_ROOT/bin:$PATH" GEMINI_API_KEY="fixture-key" bash -c "printf '%s' 'Summarize the public README.' | '$WRAPPER'"

echo "=== Codex routing injection ==="
ROUTE_OUTPUT="$(printf '%s' '{"hook_event_name":"UserPromptSubmit","prompt":"Sol or Terra, and which effort?"}' |
  ROUTE_BRIEF_LOG_DIR="$TMP_ROOT/logs" "$ROOT/.codex/hooks/route-brief.sh")"
if printf '%s' "$ROUTE_OUTPUT" | jq -e '.hookSpecificOutput.additionalContext | contains("~/.codex/model-routing.md") and (contains(".claude/rules/model-effort.md") | not)' >/dev/null; then
  ok "Codex model ask injects the Codex adapter"
else
  bad "Codex model ask injects the Codex adapter" "$ROUTE_OUTPUT"
fi

echo "=== $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]
