#!/bin/bash
# Hermetic canary for .claude/hooks/route-brief.sh (P1116).
#
# THE FIRE CASES ARE REAL. Every string under "SHOULD FIRE" was typed by the founder and
# pulled out of ~/.claude/projects/*/*.jsonl (typed prompts only, same extraction path as
# ~/.claude/hooks/measure/decision-brief-rate.py). None of them is invented — P1116's
# Done-When requires that explicitly, because a matcher tuned on strings an agent made up
# is a matcher tuned on correct spelling, and correct spelling is not what arrives. They
# are also screened: short, product-neutral, no personal or business content, because this
# repo is public. The full unscreened sample stays out of git.
#
# Usage:
#   bash scripts/test-route-brief.sh              # exit 0 = green, 1 = a case regressed
#   bash scripts/test-route-brief.sh <hook.sh>    # run against a deliberately-broken copy
#                                                 # to watch this canary FAIL (gate 7)

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Actually hermetic: without this the canary appended ~30 synthetic FIRE rows per run to
# ~/.claude/logs/route-brief.log — the production log any future recall measurement reads.
ROUTE_BRIEF_LOG_DIR="$(mktemp -d)"
export ROUTE_BRIEF_LOG_DIR
trap 'rm -rf "$ROUTE_BRIEF_LOG_DIR"' EXIT
HOOK="${1:-$ROOT/.claude/hooks/route-brief.sh}"
FAILURES=0
CHECKED=0

# $1 = expected labels, space separated, or NONE. $2 = the prompt.
check() {
  local expected="$1" prompt="$2" out got
  CHECKED=$((CHECKED + 1))
  out=$(printf '%s' "$prompt" | jq -Rs '{prompt:.}' | bash "$HOOK" 2>/dev/null)
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "  FAIL hook exited $rc (INVARIANT 1: must always exit 0) | $prompt"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if [ -z "$out" ]; then
    got="NONE"
  else
    # Not valid JSON => the injection is malformed and would be dropped silently.
    if ! printf '%s' "$out" | jq -e . >/dev/null 2>&1; then
      echo "  FAIL emitted non-JSON | $prompt"
      FAILURES=$((FAILURES + 1))
      return
    fi
    local ctx
    ctx=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext')
    got=""
    printf '%s' "$ctx" | grep -q 'SITUATION ASK'                && got="$got status"
    printf '%s' "$ctx" | grep -q 'MODEL / EFFORT ASK'           && got="$got model"
    printf '%s' "$ctx" | grep -q 'REVIEW / FLOW ASK'            && got="$got flow"
    printf '%s' "$ctx" | grep -q 'COMPACT / PLAN-MODE'          && got="$got meta"
    got="${got# }"
    [ -z "$got" ] && got="EMPTY-INJECTION"
  fi
  if [ "$got" = "$expected" ]; then
    echo "  ok   [$got] | $prompt"
  else
    echo "  FAIL expected [$expected] got [$got] | $prompt"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "== SHOULD FIRE status: real 'where are we / what now' asks (75 across 38 sessions) =="
check "status" "so what now"
check "status" "whats next"
check "status" "ok what now"
check "status" "where are we"
check "status" "whats next for p851"
check "status" "whats next luma post done"
check "status" "remind me what we did here and whats next"
check "status" "ok what now? how do i use it in the futrue?"
check "status" "whats status with p920?"
# THE APOSTROPHE CLASS. The canonical spelling of the #1 ask did not fire in the first
# shipped version — norm collapsed the apostrophe to a space, so "what s next" matched no
# adjacency pattern. ~6% of that class, silently missed. These cases exist because the
# fixture could not previously contain an apostrophe at all (INVARIANT 5).
check "status" "what$(printf "\047")s next?"
check "status" "what$(printf "\047")s the status"
check "status" "so what$(printf "\047")s next then"
check "status" "what$(printf "\342\200\231")s next?"

echo "== SHOULD FIRE model: real 'opus or sonnet / which effort' asks (14 across 12) =="
check "model" "opus or sonnet"
check "model" "sonnet or opus?"
check "model" "dev in opus or sonnet"
check "model" "fix in sonnet or opus"
check "model" "opus or sonnet for dev? what effort? medium? high? xhigh?"
check "model" "opus or sonent oand on which effort for dev"
check "model" "opus or sonnet and which which efofrt"

echo "== SHOULD FIRE flow: real 'do we need a review agent' asks =="
check "flow" "do we need review agent?"
check "flow" "do we need reviewe agnet?"
check "flow" "do we need reviewer agent?"
check "flow" "do we need adversarial review?"
check "flow" "do we need review agnet cro code review on all changes in this worktree before we ship?"
check "flow" "do we need review agent ? if not just kdd-private then comit"

echo "== SHOULD FIRE meta: compact / plan mode / subagents (no rule covers these today) =="
check "meta" "ok, compact before or proceed?"
check "meta" "plan mode on - and what we do after?"
check "meta" "can we let it auto run as subagent?"
check "meta" "ok run it as subagent?"

echo "== SHOULD FIRE MULTI: real asks that span classes in one breath =="
check "status model" "whats next ? opus ? sonent? wihtihc effort?"
check "status model" "whats next for 911 - sonnet or opus"
check "status meta"  "can i compact? whats next give me prompt? we continue here?"
check "status" "did we do all? ready to clsoe? whats next?"

echo "== SHOULD NOT FIRE: near-misses =="
# "low effort" is product writing about human behaviour, not a model ask. This is why the
# model rule refuses to accept a level word (high/medium/low) as its model anchor.
check "NONE" "if its low effort or avoidance then no amount of money or coaching helps"
check "NONE" "the effort it takes to write a letter is the whole point"
check "NONE" "the next section should be shorter"
check "NONE" "simplify this code"
check "NONE" "plan the migration for next week"
check "NONE" "review the draft and tell me what is weak"
check "NONE" "we agreed on sonnet for the subagents already, just run it"
check "NONE" "add a status column to the table"
check "NONE" "fix the model layer in src/app/data"
# LETTER-MULTISET COLLISIONS WITH REAL ENGLISH. sonnet sorts to ennost, and so do notes /
# onset / stone / tones; opus sorts to opsu, and so does soup. Each fired the model route
# on an ordinary sentence before the stoplist. (P1116 adversarial review.)
check "NONE" "read my notes and tell me how much effort the migration takes"
check "NONE" "the onset of the effort was messy"
check "NONE" "these stone tiles took real effort"
check "NONE" "the soup recipe needs sonnet"
# "model" alone is ambiguous — business / mental / data model — and this founder writes
# about all three. Only an LLM model NAME anchors the effort pairing.
check "NONE" "our pricing model requires low effort from the buyer"
check "NONE" "rewrite the model effort rule in CLAUDE.md"
check "NONE" "the mental model here is wrong, low effort to fix"
# ...but a genuine ask that names no model must still fire, via the literal forms.
check "model" "which model? which effort?"

echo "== SHOULD NOT FIRE: harness-generated prompts and oversized pastes =="
check "NONE" "This session is being continued from a previous conversation that ran out of context. whats next"
check "NONE" "<system-reminder>where are we</system-reminder>"
check "NONE" "Caveat: The messages below were generated while running whats next"
check "NONE" "$(python3 -c 'print("where are we " * 700)')"

echo "---"
echo "$CHECKED cases checked"
if [ "$FAILURES" -eq 0 ]; then
  echo "PASS: all cases behave as expected"
  exit 0
fi
echo "FAIL: $FAILURES case(s) regressed — route-brief.sh behaviour changed"
exit 1
