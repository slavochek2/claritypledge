#!/usr/bin/env bash
# P1157/P1247: routing, adapter-isolation, and external-executor contract canary.
#
# P1247 Phase 1 split this suite by what each assertion TOUCHES, per
# features/p1247_harness_agnostic_contract_2_has_no_gate.md:
#   Tier A - repo files only (.codex/config.toml, .codex/hooks/route-brief.sh).
#            No $HOME dependency, NEVER skips. Wired to the commit path.
#   Tier B - per-machine $HOME adapter files. Machine-local check; SKIPs (exit 0)
#            when this machine's adapters aren't installed (fresh clone / CI).
#   Tier C - executes delegate-gemini (no network, inferred not instrumented).
#            Machine-local check; SKIPs when the wrapper isn't installed.
#   Tier D - live `dsh` calls, one a real model-routed prompt. Never the commit
#            path -- a separate integration run only. SKIPs when `dsh` or its
#            per-machine config isn't available.
#
# Usage: test-multi-harness-routing.sh [a|b|c|d|all]   (default: all)
#
# Sourceable: when sourced (not executed), only function definitions load and
# no tier runs -- this lets a fixture-based test harness reuse the exact
# assertion logic (contains/absent/run_tier_a) against synthetic paths instead
# of the live adapters (see scripts/test-multi-harness-routing-tierA-fixtures.sh).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIVERSAL="$HOME/.agents/model-routing.md"
CODEX_ADAPTER="$HOME/.codex/model-routing.md"
DSH_ADAPTER="$HOME/.dsh/model-routing.md"
CODEX_GLOBAL_AGENTS="$HOME/.codex/AGENTS.md"
CODEX_GLOBAL_CONFIG="$HOME/.codex/config.toml"
WRAPPER="$HOME/.agents/bin/delegate-gemini"
DSH_PATCH="$HOME/.claude/dsh-gemini.patch.yml"
DSH_SETTINGS="$HOME/.dsh/settings.yaml"
# Tier A subjects are overridable so a fixture test can point them at synthetic
# files instead of the live repo copies, without duplicating the assertions.
TIER_A_CODEX_CONFIG="${TIER_A_CODEX_CONFIG:-$ROOT/.codex/config.toml}"
TIER_A_ROUTE_HOOK="${TIER_A_ROUTE_HOOK:-$ROOT/.codex/hooks/route-brief.sh}"

pass=0
fail=0

ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1${2:+: $2}"; fail=$((fail + 1)); }

contains() {
  local label="$1" file="$2" pattern="$3"
  if [[ ! -e "$file" ]]; then bad "$label" "required file missing: $file"; return; fi
  if grep -qEi -- "$pattern" "$file"; then ok "$label"; else bad "$label" "pattern absent"; fi
}

# Invariant (P1247): an absent()-style check must fail closed on a missing
# file, never conclude PASS from "the file isn't there to match against".
# Measured pre-fix: deleting ~/.codex/AGENTS.md made both assertions that read
# it report PASS -- the instrument this suite guards had the same defect the
# suite was written about.
absent() {
  local label="$1" file="$2" pattern="$3"
  if [[ ! -e "$file" ]]; then bad "$label" "required file missing: $file"; return; fi
  if grep -qEi -- "$pattern" "$file"; then bad "$label" "unexpected pattern present"; else ok "$label"; fi
}

run_exit() {
  local label="$1" expected="$2"
  shift 2
  local actual=0
  "$@" >/dev/null 2>&1 || actual=$?
  if [[ "$actual" -eq "$expected" ]]; then ok "$label"; else bad "$label" "expected $expected, got $actual"; fi
}

# --- Tier A: repo files only. No $HOME dependency, never SKIPs. -------------
run_tier_a() {
  echo "=== Tier A - repo-only, commit-gated ==="
  local missing=()
  [[ -e "$TIER_A_CODEX_CONFIG" ]] || missing+=("$TIER_A_CODEX_CONFIG")
  [[ -e "$TIER_A_ROUTE_HOOK" ]] || missing+=("$TIER_A_ROUTE_HOOK")
  if (( ${#missing[@]} > 0 )); then
    bad "Tier A precondition" "required repo file(s) missing: ${missing[*]}"
    return
  fi

  absent "project Codex config has no Claude environment variables" "$TIER_A_CODEX_CONFIG" 'CLAUDE_CODE_'

  local route_output
  route_output="$(printf '%s' '{"hook_event_name":"UserPromptSubmit","prompt":"Sol or Terra, and which effort?"}' |
    ROUTE_BRIEF_LOG_DIR="$TMP_ROOT/logs" "$TIER_A_ROUTE_HOOK")"
  if printf '%s' "$route_output" | jq -e '.hookSpecificOutput.additionalContext | contains("~/.codex/model-routing.md") and (contains(".claude/rules/model-effort.md") | not)' >/dev/null; then
    ok "Codex model ask injects the Codex adapter"
  else
    bad "Codex model ask injects the Codex adapter" "$route_output"
  fi
}

# --- Tier B: per-machine $HOME adapter files. SKIPs if not installed. -------
run_tier_b() {
  # Coarse "is this machine set up at all" SKIP -- deliberately scoped to only
  # the 3 adapter files that mean "no multi-harness config on this box"
  # (fresh clone / CI runner). CODEX_GLOBAL_AGENTS and CODEX_GLOBAL_CONFIG are
  # NOT in this list on purpose: when the core adapter set IS present, those
  # two are expected to exist too, and their absence must FAIL the specific
  # assertions that read them (via absent()'s fail-closed check below), not
  # silently widen the SKIP. This is the exact bug this suite had: deleting
  # only ~/.codex/AGENTS.md left the 3 core files intact, so the old coarse
  # guard never fired, and the assertions reading AGENTS.md fell through to
  # absent()'s old fail-open logic and reported PASS.
  local missing=()
  for f in "$UNIVERSAL" "$CODEX_ADAPTER" "$DSH_ADAPTER"; do
    [[ -e "$f" ]] || missing+=("$f")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "SKIP  Tier B: this machine has no adapter set installed."
    printf '        missing: %s\n' "${missing[@]}"
    echo "        These files are per-machine and intentionally outside the repo."
    return
  fi

  echo "=== Tier B - per-machine adapter files ==="
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
  absent "Codex global instructions removed Opus warning" "$CODEX_GLOBAL_AGENTS" 'not Opus|model name does not contain.*opus'
  absent "Codex global instructions do not own Claude quota" "$CODEX_GLOBAL_AGENTS" 'quota-cache|Claude subscription'
  absent "global Codex config has no Claude environment variables" "$CODEX_GLOBAL_CONFIG" 'CLAUDE_CODE_'
  contains "Codex skill importer is disabled" "$CODEX_GLOBAL_CONFIG" 'external-agent-import-sync-enabled = false'
  if awk '/\[plugins\."security-guidance@claude-plugins-official"\]/{getline; if ($0 == "enabled = false") found=1} END{exit !found}' "$CODEX_GLOBAL_CONFIG"; then
    ok "unsupported security plugin is disabled"
  else
    bad "unsupported security plugin is disabled"
  fi
}

# --- Tier C: executes delegate-gemini. SKIPs if not installed. -------------
run_tier_c() {
  local missing=()
  [[ -e "$WRAPPER" ]] || missing+=("$WRAPPER")
  [[ -e "$DSH_PATCH" ]] || missing+=("$DSH_PATCH")
  if (( ${#missing[@]} > 0 )); then
    echo "SKIP  Tier C: delegation wrapper not installed on this machine."
    printf '        missing: %s\n' "${missing[@]}"
    return
  fi

  echo "=== Tier C - delegation wrapper outcomes ==="
  run_exit "public bounded corpus passes scan" 0 bash -c "printf '%s' 'Summarize the public README into five bullets.' | '$WRAPPER' --check"
  run_exit "unclassified content with synthetic email refuses" 2 bash -c "printf '%s' 'Contact fixture@example.com about this.' | '$WRAPPER' --check"
  run_exit "private path refuses" 2 bash -c "printf '%s' 'Read Projects/private/notes.txt' | '$WRAPPER' --check"
  run_exit "private path casing variant refuses" 2 bash -c "printf '%s' 'Read /USERS/example/Projects/private/notes.txt' | '$WRAPPER' --check"
  run_exit "missing provider overlay is integrity exit 3" 3 env HOME="$TMP_ROOT/empty-home" bash -c "printf '%s' 'Summarize a public README.' | '$WRAPPER' --check"

  mkdir -p "$TMP_ROOT/executor-home/.claude" "$TMP_ROOT/bin"
  cp "$DSH_PATCH" "$TMP_ROOT/executor-home/.claude/dsh-gemini.patch.yml"
  printf '#!/bin/sh\nexit 42\n' >"$TMP_ROOT/bin/dsh"
  chmod +x "$TMP_ROOT/bin/dsh"
  run_exit "executor failure is surfaced without wrapper retry" 42 env HOME="$TMP_ROOT/executor-home" PATH="$TMP_ROOT/bin:$PATH" GEMINI_API_KEY="fixture-key" bash -c "printf '%s' 'Summarize the public README.' | '$WRAPPER'"
}

# --- Tier D: live `dsh` calls. Never the commit path. SKIPs if unavailable. -
run_tier_d() {
  local missing=()
  command -v dsh >/dev/null 2>&1 || missing+=("dsh (not on PATH)")
  [[ -e "$DSH_SETTINGS" ]] || missing+=("$DSH_SETTINGS")
  [[ -e "$DSH_PATCH" ]] || missing+=("$DSH_PATCH")
  if (( ${#missing[@]} > 0 )); then
    echo "SKIP  Tier D: live DSH route oracle not available on this machine."
    printf '        missing: %s\n' "${missing[@]}"
    return
  fi

  echo "=== Tier D - live DSH route oracle ==="
  # Version-blind (P1247 Open Question 2): the suite pinned the literal string
  # gemini-3.7-flash, so a routine /slava:util:model-bump breaks it on ordinary
  # maintenance unrelated to policy drift. Assert the route (provider: google)
  # and the shape (a gemini-<version>-flash model), never the version digits.
  local gemini_model_shape='model: gemini-[0-9]+(\.[0-9]+)?-flash'
  DSH_NATIVE="$(dsh --profile headless --dump-config 2>/dev/null || true)"
  DSH_EXTERNAL="$(dsh --profile headless --patch "$DSH_PATCH" --dump-config 2>/dev/null || true)"
  if printf '%s' "$DSH_NATIVE" | grep -q 'provider: deepseek-official' &&
     awk -v pat="$gemini_model_shape" '
       /^agent-default-model:/{seen=1; next}
       seen && /^  provider: google$/{provider=1}
       seen && $0 ~ "^  " pat "$"{model=1}
       END{exit !(provider && model)}
     ' "$DSH_SETTINGS"; then
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
     printf '%s' "$DSH_EXTERNAL" | grep -qE "$gemini_model_shape"; then
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
}

# Only run when EXECUTED, not when sourced -- lets a fixture test reuse the
# functions above against synthetic paths (see file header).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  TIER="${1:-all}"
  TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/p1157-routing.XXXXXX")"
  trap 'rm -rf "$TMP_ROOT"' EXIT

  case "$TIER" in
    a) run_tier_a ;;
    b) run_tier_b ;;
    c) run_tier_c ;;
    d) run_tier_d ;;
    all) run_tier_a; run_tier_b; run_tier_c; run_tier_d ;;
    *) echo "Unknown tier '$TIER' (expected a|b|c|d|all)" >&2; exit 64 ;;
  esac

  echo "=== $pass passed, $fail failed (tier: $TIER) ==="
  [[ "$fail" -eq 0 ]]
fi
