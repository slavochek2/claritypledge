#!/bin/bash
# scripts/deploy-functions.sh — Deploy edge functions to Supabase + stamp deploy manifest
#
# Usage:
#   ./scripts/deploy-functions.sh                    # deploy all to test (default)
#   ./scripts/deploy-functions.sh --env prod         # deploy all to prod
#   ./scripts/deploy-functions.sh generate-banner    # deploy one function to test
#   ./scripts/deploy-functions.sh generate-banner --env prod  # deploy one function to prod

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Derive project dir from git root of CWD — works correctly from worktrees.
# SCRIPT_DIR follows symlinks and always resolves to main repo; do NOT use it for PROJECT_DIR.
PROJECT_DIR="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/supabase/deploy-manifest.json"
FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"

# --- Parse args ---
ENV_NAME="local"
FUNCTION_NAME=""
for arg in "$@"; do
  if [ "$arg" = "--env" ]; then
    :  # next iteration picks the value
  elif [ "$prev_arg" = "--env" ]; then
    ENV_NAME="$arg"
  elif [[ "$arg" == --env=* ]]; then
    ENV_NAME="${arg#--env=}"
  elif [[ "$arg" != -* ]]; then
    FUNCTION_NAME="$arg"
  fi
  prev_arg="$arg"
done

# --- Determine project ref ---
if [ "$ENV_NAME" = "prod" ]; then
  ENV_FILE="$PROJECT_DIR/.env.prod"
else
  ENV_FILE="$PROJECT_DIR/.env.local"
fi

if [ ! -f "$ENV_FILE" ] && [ "$ENV_NAME" = "prod" ]; then
  # .env.prod is gitignored — only exists in the main repo, not in worktrees.
  # Fall back to the main repo copy so prod deploys work from any worktree.
  ENV_FILE="$(dirname "$SCRIPT_DIR")/.env.prod"
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d. -f1)

# Get PAT for deployment
SUPABASE_PAT=$(grep "^SUPABASE_ACCESS_TOKEN=" "$ENV_FILE" | cut -d= -f2- || true)
if [ -z "$SUPABASE_PAT" ]; then
  SUPABASE_PAT_RAW=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)
  if [ -n "$SUPABASE_PAT_RAW" ]; then
    SUPABASE_PAT=$(echo "$SUPABASE_PAT_RAW" | sed 's/go-keyring-base64://' | base64 -d 2>/dev/null || true)
  fi
fi

export SUPABASE_ACCESS_TOKEN="$SUPABASE_PAT"

# --- Build list of functions to deploy ---
if [ -n "$FUNCTION_NAME" ]; then
  if [ ! -d "$FUNCTIONS_DIR/$FUNCTION_NAME" ]; then
    echo "ERROR: Function directory not found: $FUNCTIONS_DIR/$FUNCTION_NAME"
    exit 1
  fi
  FUNCTIONS=("$FUNCTION_NAME")
else
  FUNCTIONS=()
  for dir in "$FUNCTIONS_DIR"/*/; do
    [ -d "$dir" ] || continue
    fn_base="$(basename "$dir")"
    # P890: skip underscore-prefixed directories. `_shared` is a library, not a
    # function: `supabase functions deploy _shared` fails its own name validation
    # ("Invalid Function name ... ^[A-Za-z][A-Za-z0-9_-]*$", exit 1). That failure was
    # invisible while the deploy ran through `| tail -1`, which returned TAIL's status;
    # once the exit code is read honestly (below) an unfiltered list would abort every
    # deploy-all run. The manifest is unaffected — stamp-deploy-manifest.sh walks the
    # directory itself and keeps hashing `_shared`.
    case "$fn_base" in _*) continue ;; esac
    FUNCTIONS+=("$fn_base")
  done
fi

if [ ${#FUNCTIONS[@]} -eq 0 ]; then
  echo "No edge functions found in $FUNCTIONS_DIR"
  exit 0
fi

# --- Pre-deploy secret check (P834) ---
# Verifies every referenced env var without a real code-level fallback exists
# on the target project. SKIP_EDGE_SECRET_CHECK=1 exists for first-run
# bootstrap deploys where the function and its secret are added together.
if [ "${SKIP_EDGE_SECRET_CHECK:-0}" = "1" ]; then
  echo "WARN: SKIP_EDGE_SECRET_CHECK=1 : secret hygiene check bypassed"
else
  CHECK_SCRIPT="$SCRIPT_DIR/check-edge-function-secrets.sh"
  if [ -x "$CHECK_SCRIPT" ]; then
    if ! "$CHECK_SCRIPT" --env "$ENV_NAME"; then
      echo ""
      echo "ERROR: secret hygiene check failed for $ENV_NAME. Set the missing secrets above before deploying."
      echo "       To bypass for a bootstrap deploy: SKIP_EDGE_SECRET_CHECK=1 $0 $*"
      exit 1
    fi
  fi
fi

# --- Deploy ---
echo "Deploying ${#FUNCTIONS[@]} function(s) to $ENV_NAME ($PROJECT_REF)..."
DEPLOYED=()
FAILED=()

for fn in "${FUNCTIONS[@]}"; do
  echo -n "  $fn... "
  # create-and-sign handles the invitation flow: anonymous callers exchange a
  # signed invite token for a session JWT before they have a Supabase account.
  # --no-verify-jwt lets those unauthenticated requests through the gateway.
  # All other functions require a valid JWT and must NOT use this flag.
  if [ "$fn" = "create-and-sign" ]; then
    DEPLOY_FLAGS="--no-verify-jwt"
  else
    DEPLOY_FLAGS=""
  fi
  # P890: `supabase ... | tail -1` returned TAIL's status, not the deploy's, so every
  # failed upload was recorded as DEPLOYED and the manifest stamped as if it had landed.
  # That also defeats the post-deploy smoke below: the previous, still-working function
  # answers the probe, so a silently failed deploy leaves prod on stale code and reports
  # success twice. Capture the output to a file and test the deploy's own exit code.
  DEPLOY_LOG=$(mktemp)
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" $DEPLOY_FLAGS >"$DEPLOY_LOG" 2>&1; then
    tail -1 "$DEPLOY_LOG"
    DEPLOYED+=("$fn")
  else
    echo "FAILED"
    tail -5 "$DEPLOY_LOG"
    FAILED+=("$fn")
  fi
  rm -f "$DEPLOY_LOG"
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "ERROR: ${#FAILED[@]} function(s) failed to deploy: ${FAILED[*]}"
  exit 1
fi

# --- Stamp manifest ---
# Stamped BEFORE the smoke, deliberately. The upload has landed: prod is running this
# code whether or not it answers its probes. A manifest left unstamped would make
# check-deploy-manifest.sh report FUNCTION_STALE ("local code changed since last
# deploy") for functions that did deploy, and the drift alarm would describe the wrong
# failure.
#
# NOT under `set -e`: stamp-deploy-manifest.sh refuses to run from inside a worktree
# (it exits 1 by design), and this script is explicitly built to work from one — see
# the PROJECT_DIR comment at the top. Letting `set -e` abort here would mean a worktree
# deploy uploads to prod and then skips the post-deploy smoke entirely, which is the
# one thing this feature exists to prevent. Record the failure, run the smoke anyway,
# and exit non-zero at the end.
STAMP_OK=1
if ! "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --functions-only; then
  STAMP_OK=0
  echo "ERROR: manifest stamp failed — the functions ARE deployed but the manifest does"
  echo "       not record it, so drift checks will misreport. Re-stamp from the main"
  echo "       repo root: ./scripts/stamp-deploy-manifest.sh --env $ENV_NAME --functions-only"
fi
echo ""
if [ "$STAMP_OK" -eq 1 ]; then
  echo "Deployed ${#DEPLOYED[@]} function(s). Manifest updated."
else
  echo "Deployed ${#DEPLOYED[@]} function(s). Manifest NOT updated (see above)."
fi

# --- Post-deploy smoke (P890) ---
# Deploy success is upload success: a bundle that throws at invocation time uploads
# fine and 500s for every real user until Sentry or a person notices. Smoke ONLY the
# functions this run deployed (no blanket prod traffic per deploy).
#
# Prod is smoked by default. Test/local deploys are NOT, so the existing test-deploy
# loop is unchanged — opt in with EDGE_SMOKE=1. Every probe is credential-free and
# lands on a refusal path: no email, no payment, no write.
SMOKE_SCRIPT="$SCRIPT_DIR/edge-function-smoke.mjs"
if [ "${EDGE_SMOKE:-}" = "0" ]; then
  echo "WARN: EDGE_SMOKE=0 : post-deploy smoke skipped"
elif [ "$ENV_NAME" = "prod" ] || [ "${EDGE_SMOKE:-}" = "1" ]; then
  if [ -f "$SMOKE_SCRIPT" ]; then
    echo ""
    if ! node "$SMOKE_SCRIPT" --base-url "$SUPABASE_URL/functions/v1" --only "$(IFS=,; echo "${DEPLOYED[*]}")"; then
      echo ""
      echo "ERROR: post-deploy smoke failed. The upload succeeded and the manifest records it,"
      echo "       but at least one function is not answering as expected — see the named"
      echo "       function(s) above."
      exit 1
    fi
  else
    # Fail CLOSED. A missing smoke on a run that requires one (prod, or an explicit
    # opt-in) means the deploy has no post-deploy verification at all — a partial
    # checkout or a bad cherry-pick would otherwise deploy prod and report success,
    # which is exactly the unverified-deploy state this feature closes.
    echo ""
    echo "ERROR: $SMOKE_SCRIPT not found, but this run requires a post-deploy smoke."
    echo "       The functions ARE deployed and are now unverified. Restore the script"
    echo "       and run: npm run smoke:edge"
    exit 1
  fi
fi

if [ "$STAMP_OK" -eq 0 ]; then
  exit 1
fi
