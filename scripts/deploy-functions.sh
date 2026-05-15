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
    [ -d "$dir" ] && FUNCTIONS+=("$(basename "$dir")")
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
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" $DEPLOY_FLAGS 2>&1 | tail -1; then
    DEPLOYED+=("$fn")
  else
    echo "FAILED"
    FAILED+=("$fn")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "ERROR: ${#FAILED[@]} function(s) failed to deploy: ${FAILED[*]}"
  exit 1
fi

# --- Stamp manifest ---
"$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --functions-only
echo ""
echo "Deployed ${#DEPLOYED[@]} function(s). Manifest updated."
