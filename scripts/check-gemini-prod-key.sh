#!/usr/bin/env bash
# check-gemini-prod-key.sh — P1162 part 2.
#
# Answers one question /day could not previously answer: is the Gemini API key that is ACTUALLY
# DEPLOYED for ClarityPledge still answering?
#
# Why this exists when `~/.agents/bin/ai-keys --ping-prod` already pings "the production key":
# that tool pings whatever $GEMINI_API_KEY is set in the ambient shell. That is not any deployed
# ClarityPledge secret — on the founder's machine the variable is unset, so the check has exited 2
# ("could not be checked") since it shipped, and its coverage of this repo's keys is zero. A key
# died in March and no spend check could see it either: a dead key spends nothing.
#
# The mechanism. Supabase never returns a secret's VALUE, only its SHA-256 digest. So we cannot
# ping the deployed secret directly. Instead:
#   1. take the locally-held copy of the key,
#   2. assert sha256(local copy) == the digest Supabase reports for the deployed secret,
#   3. ping the local copy only if they match.
# Step 2 is the load-bearing one. Without it, a stale local copy means the ping tests a credential
# that is not in production and reports green — which is exactly the error P1162 was written on
# top of (the spec's original measurement read the TEST project and called it prod).
#
# Exit contract, matching the other day-cp checks:
#   0 — digest matches AND the key answered.
#   1 — a finding: digest mismatch, key dead, or spend cap tripped.
#   2 — the check COULD NOT RUN. Never report this as clean. Never as "key is fine".
set -uo pipefail

PROD_REF="besjtuodziykmjidubzw"
PING_MODEL="models/gemini-3.1-flash-image-preview"   # what generate-banner actually calls
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"

die_cannot_run() { echo "GEMINI-PROD-KEY-CHECK-DID-NOT-RUN — $1"; exit 2; }

# classify CODE BODY — prints a token, returns the exit code that token implies.
classify() {
  local code="$1" body="$2"
  case "$code" in
    200) echo "KEY_PING_OK"; return 0 ;;
    403)
      if printf '%s' "$body" | grep -q 'Spend cap breached'; then
        echo "KEY_CAP_TRIPPED — the budget is spent; the credential is intact."
        echo "  Do NOT lift the cap on its own: Google will not re-enforce a cap lifted within the"
        echo "  same billing month unless the amount is RAISED first, so a bare lift removes the"
        echo "  budget entirely for the rest of the month. Raise, then lift."
      else
        echo "KEY_PING_FORBIDDEN — 403 without a spend-cap message (restriction or disabled API)."
      fi
      return 1 ;;
    400)
      if printf '%s' "$body" | grep -q 'API_KEY_INVALID'; then
        echo "KEY_PING_FAILED — API_KEY_INVALID. The deployed key no longer authenticates."
      else
        echo "KEY_PING_FAILED — HTTP 400, not an auth failure. Body head: $(printf '%s' "$body" | tr -d '\n' | cut -c1-120)"
      fi
      return 1 ;;
    404) echo "KEY_PING_MODEL_UNAVAILABLE — ${PING_MODEL} is gone. Says NOTHING about the credential."; return 1 ;;
    429) echo "KEY_PING_RATE_LIMITED — quota, not a cap and not a dead key."; return 1 ;;
    000) echo "KEY_PING_UNKNOWN — the request never completed (timeout/DNS/offline). A finding, not a pass."; return 2 ;;
    *)   echo "KEY_PING_UNKNOWN — unexpected HTTP ${code}. A finding, not a pass."; return 2 ;;
  esac
}

# ---- offline control pass -------------------------------------------------------------------
# A green live run proves the happy path ran. It does NOT prove the classifier can still tell the
# failure classes apart. This pass feeds known-good AND known-bad inputs through the identical
# function and fails if any verdict is wrong — including the two that must NOT be confused with
# each other (a tripped cap and a dead key are both non-200 and need opposite responses).
if [[ "${1:-}" == "--self-test" ]]; then
  fails=0
  check() { # LABEL CODE BODY EXPECT_TOKEN EXPECT_RC
    local out rc
    out="$(classify "$2" "$3")"; rc=$?
    if [[ "$out" == *"$4"* && "$rc" == "$5" ]]; then
      echo "  ok   $1"
    else
      echo "  FAIL $1 — got '${out%%$'\n'*}' rc=$rc, expected '$4' rc=$5"; fails=$((fails+1))
    fi
  }
  echo "self-test: classifier"
  check "alive"            200 ''                                              KEY_PING_OK                0
  check "cap tripped"      403 'Spend cap breached for project: 123 for service: x' KEY_CAP_TRIPPED       1
  check "403 not a cap"    403 'PERMISSION_DENIED: api restricted'              KEY_PING_FORBIDDEN         1
  check "dead key"         400 '{"reason":"API_KEY_INVALID"}'                   KEY_PING_FAILED            1
  check "retired model"    404 ''                                              KEY_PING_MODEL_UNAVAILABLE 1
  check "rate limited"     429 ''                                              KEY_PING_RATE_LIMITED      1
  check "never completed"  000 ''                                              KEY_PING_UNKNOWN           2
  # The discrimination that matters most: these two must not collapse into each other.
  a="$(classify 403 'Spend cap breached for project: 1 for service: x')"
  b="$(classify 400 '{"reason":"API_KEY_INVALID"}')"
  if [[ "${a%%$'\n'*}" == "${b%%$'\n'*}" ]]; then
    echo "  FAIL cap-vs-dead are indistinguishable"; fails=$((fails+1))
  else
    echo "  ok   cap-vs-dead stay distinguishable"
  fi
  echo "self-test: $fails failure(s)"
  [ "$fails" -eq 0 ] || exit 1
  exit 0
fi

# ---- live run -------------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 || die_cannot_run "curl is not available"

LOCAL_KEY="${GEMINI_API_KEY:-}"
if [ -z "$LOCAL_KEY" ] && [ -f "$ENV_FILE" ]; then
  LOCAL_KEY="$(grep -E '^[[:space:]]*(export )?GEMINI_API_KEY=' "$ENV_FILE" | head -1 | sed 's/.*=//; s/^["'"'"']//; s/["'"'"']$//')"
fi
[ -n "$LOCAL_KEY" ] || die_cannot_run "no local copy of GEMINI_API_KEY (env or .env.local) — the deployed key could NOT be checked. This is not a pass."

LOCAL_DIGEST="$(printf '%s' "$LOCAL_KEY" | shasum -a 256 | awk '{print $1}')"

DEPLOYED_JSON="$(npx --yes supabase secrets list --project-ref "$PROD_REF" 2>/dev/null)" \
  || die_cannot_run "could not list prod Supabase secrets (CLI missing, not logged in, or network)"
DEPLOYED_DIGEST="$(printf '%s' "$DEPLOYED_JSON" | tr ',' '\n' | grep -A1 '"name":"GEMINI_API_KEY"' | grep '"value"' | sed 's/.*"value":"//; s/".*//')"
[ -n "$DEPLOYED_DIGEST" ] || die_cannot_run "prod Supabase reports no GEMINI_API_KEY secret — cannot compare digests"

if [ "$LOCAL_DIGEST" != "$DEPLOYED_DIGEST" ]; then
  echo "KEY_DIGEST_MISMATCH — the local copy is NOT the deployed prod key."
  echo "  local    sha256 ${LOCAL_DIGEST:0:16}…"
  echo "  deployed sha256 ${DEPLOYED_DIGEST:0:16}…"
  echo "  Pinging the local copy would test the wrong credential and report a false green."
  echo "  Refresh .env.local from the deployed secret, or rotate deliberately and update both."
  echo "gemini_prod_key_exit=1"
  exit 1
fi
echo "digest OK — local copy matches deployed prod secret (sha256 ${LOCAL_DIGEST:0:16}…)"

CODE="$(curl -s -m 20 -o /tmp/gemini-prod-ping.json -w '%{http_code}' \
  "https://generativelanguage.googleapis.com/v1beta/${PING_MODEL}:generateContent?key=${LOCAL_KEY}" \
  -H 'content-type: application/json' \
  -d '{"contents":[{"parts":[{"text":"ping"}]}],"generationConfig":{"maxOutputTokens":1}}' 2>/dev/null)"
BODY="$(head -c 600 /tmp/gemini-prod-ping.json 2>/dev/null)"
rm -f /tmp/gemini-prod-ping.json

VERDICT="$(classify "$CODE" "$BODY")"; RC=$?
echo "$VERDICT"
[ "$RC" -ge 2 ] && echo "GEMINI-PROD-KEY-CHECK-DID-NOT-RUN — the ping never completed; do NOT report clean"
echo "gemini_prod_key_exit=$RC"
exit "$RC"
