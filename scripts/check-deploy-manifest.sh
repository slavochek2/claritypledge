#!/bin/bash
# scripts/check-deploy-manifest.sh — Compare local supabase/ state against deploy manifest
#
# Returns 0 if all local infra matches what was last deployed to the target env.
# Returns 1 if drift is detected (undeployed functions or unapplied migrations).
#
# Usage:
#   ./scripts/check-deploy-manifest.sh              # check test
#   ./scripts/check-deploy-manifest.sh --env prod   # check prod

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/supabase/deploy-manifest.json"
FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# --- Parse args ---
ENV_NAME="local"
prev_arg=""
for arg in "$@"; do
  if [ "$arg" = "--env" ]; then
    :
  elif [ "$prev_arg" = "--env" ]; then
    ENV_NAME="$arg"
  elif [[ "$arg" == --env=* ]]; then
    ENV_NAME="${arg#--env=}"
  fi
  prev_arg="$arg"
done

ENV_KEY="$ENV_NAME"
[ "$ENV_KEY" = "local" ] && ENV_KEY="test"

# --- Check manifest exists ---
if [ ! -f "$MANIFEST" ]; then
  echo "WARNING: No deploy manifest found at $MANIFEST"
  echo "  Run ./scripts/stamp-deploy-manifest.sh --env $ENV_NAME to create one."
  echo "  Cannot verify infra deployment state."
  exit 2
fi

# --- Compare (write to temp file to avoid set -e issues) ---
TMPFILE=$(mktemp)
python3 << 'PYEOF' - "$MANIFEST" "$ENV_KEY" "$FUNCTIONS_DIR" "$MIGRATIONS_DIR" > "$TMPFILE"
import json, sys, hashlib, os, glob

manifest_path = sys.argv[1]
env_key = sys.argv[2]
functions_dir = sys.argv[3]
migrations_dir = sys.argv[4]

with open(manifest_path) as f:
    manifest = json.load(f)

env = manifest.get(env_key, {})
deployed_functions = env.get('functions', {})
deployed_migrations = set(env.get('migrations', []))

issues = []

# Check edge functions
for fn_dir in sorted(glob.glob(os.path.join(functions_dir, '*/'))):
    fn_name = os.path.basename(fn_dir.rstrip('/'))
    main_file = os.path.join(fn_dir, 'index.ts')

    if fn_name not in deployed_functions:
        issues.append(f'FUNCTION_MISSING: {fn_name} (not in manifest — never deployed to {env_key})')
        continue

    if os.path.isfile(main_file):
        with open(main_file, 'rb') as mf:
            local_hash = hashlib.sha256(mf.read()).hexdigest()
        if deployed_functions[fn_name] != local_hash:
            issues.append(f'FUNCTION_STALE: {fn_name} (local code changed since last deploy to {env_key})')

# Check migrations
for sql_file in sorted(glob.glob(os.path.join(migrations_dir, '*.sql'))):
    bn = os.path.basename(sql_file)
    if not bn[0].isdigit():
        continue
    version = ''
    for ch in bn:
        if ch.isdigit():
            version += ch
        else:
            break
    if version and version not in deployed_migrations:
        issues.append(f'MIGRATION_MISSING: {bn} (version {version} not deployed to {env_key})')

if issues:
    for i in issues:
        print(i)
    sys.exit(1)
else:
    sys.exit(0)
PYEOF
PY_EXIT=$?

if [ $PY_EXIT -eq 0 ]; then
  echo "Deploy manifest check passed — all infra matches $ENV_KEY."
  rm -f "$TMPFILE"
  exit 0
fi

# Drift detected
echo "DEPLOY DRIFT DETECTED ($ENV_KEY):"
cat "$TMPFILE"
echo ""
echo "Fix commands:"
while IFS= read -r line; do
  if [[ "$line" == FUNCTION_MISSING:* ]] || [[ "$line" == FUNCTION_STALE:* ]]; then
    fn=$(echo "$line" | sed 's/^[^:]*: //' | cut -d' ' -f1)
    echo "  ./scripts/deploy-functions.sh $fn --env $ENV_NAME"
  elif [[ "$line" == MIGRATION_MISSING:* ]]; then
    echo "  ./scripts/migrate.sh --env $ENV_NAME"
  fi
done < "$TMPFILE" | sort -u

rm -f "$TMPFILE"
exit 1
