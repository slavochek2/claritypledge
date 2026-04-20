#!/bin/bash
# scripts/stamp-deploy-manifest.sh — Update deploy manifest with current state
#
# Called by deploy-functions.sh and migrate.sh after successful deploys.
# Can also be run standalone to snapshot current state.
#
# Usage:
#   ./scripts/stamp-deploy-manifest.sh                          # stamp both (test)
#   ./scripts/stamp-deploy-manifest.sh --env prod               # stamp both (prod)
#   ./scripts/stamp-deploy-manifest.sh --env prod --functions-only
#   ./scripts/stamp-deploy-manifest.sh --env prod --migrations-only

set -e

# Guard: must run from main repo root, not from inside a worktree
if [[ "$PWD" == *".claude/worktrees"* ]]; then
  echo "ERROR: stamp-deploy-manifest.sh must run from the main repo root, not from a worktree."
  echo "Run: cd ~/Projects/public/claritypledge && ./scripts/stamp-deploy-manifest.sh $*"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/supabase/deploy-manifest.json"
FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# --- Parse args ---
ENV_NAME="local"
FUNCTIONS_ONLY=false
MIGRATIONS_ONLY=false
prev_arg=""
for arg in "$@"; do
  if [ "$arg" = "--env" ]; then
    :
  elif [ "$prev_arg" = "--env" ]; then
    ENV_NAME="$arg"
  elif [[ "$arg" == --env=* ]]; then
    ENV_NAME="${arg#--env=}"
  elif [ "$arg" = "--functions-only" ]; then
    FUNCTIONS_ONLY=true
  elif [ "$arg" = "--migrations-only" ]; then
    MIGRATIONS_ONLY=true
  fi
  prev_arg="$arg"
done

ENV_KEY="$ENV_NAME"
[ "$ENV_KEY" = "local" ] && ENV_KEY="test"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Read existing manifest or create empty ---
if [ -f "$MANIFEST" ]; then
  EXISTING=$(cat "$MANIFEST")
else
  EXISTING='{}'
fi

# --- Build functions section ---
build_functions_json() {
  local result="{"
  local first=true
  for dir in "$FUNCTIONS_DIR"/*/; do
    [ -d "$dir" ] || continue
    local fn_name
    fn_name=$(basename "$dir")
    local main_file="$dir/index.ts"
    local hash=""
    if [ -f "$main_file" ]; then
      hash=$(shasum -a 256 "$main_file" | cut -d' ' -f1)
    fi
    if [ "$first" = true ]; then first=false; else result+=","; fi
    result+="\"$fn_name\":\"$hash\""
  done
  result+="}"
  echo "$result"
}

# --- Build migrations section ---
build_migrations_json() {
  local result="["
  local first=true
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    local bn
    bn=$(basename "$f")
    # Skip non-versioned files
    echo "$bn" | grep -qE '^[0-9]' || continue
    local version
    version=$(echo "$bn" | sed -E 's/^([0-9]+)[_.]?.*/\1/')
    if [ "$first" = true ]; then first=false; else result+=","; fi
    result+="\"$version\""
  done
  result+="]"
  echo "$result"
}

# --- Merge into manifest ---
python3 -c "
import json, sys

existing = json.loads(sys.argv[1])
env_key = sys.argv[2]
now = sys.argv[3]
functions_only = sys.argv[4] == 'true'
migrations_only = sys.argv[5] == 'true'
functions_json = sys.argv[6]
migrations_json = sys.argv[7]

env = existing.get(env_key, {})

if not migrations_only:
    env['functions'] = json.loads(functions_json)
    env['functions_deployed_at'] = now

if not functions_only:
    env['migrations'] = json.loads(migrations_json)
    env['migrations_deployed_at'] = now

existing[env_key] = env

print(json.dumps(existing, indent=2))
" "$EXISTING" "$ENV_KEY" "$NOW" "$FUNCTIONS_ONLY" "$MIGRATIONS_ONLY" \
  "$(build_functions_json)" "$(build_migrations_json)" > "$MANIFEST"
