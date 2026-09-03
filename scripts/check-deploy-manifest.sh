#!/bin/bash
# scripts/check-deploy-manifest.sh — Compare supabase/ state against deploy manifest
#
# Returns 0 if all infra matches what was last deployed to the target env.
# Returns 1 if drift is detected. Drift is bidirectional:
#   local-not-deployed  → FUNCTION_MISSING / FUNCTION_STALE / MIGRATION_MISSING
#   deployed-not-local  → FUNCTION_ORPHANED (source deleted, platform still serving)
#
# Manifest source:
#   --env prod  → origin/main:supabase/deploy-manifest.json (avoids false positives
#                 when a feature branch has a stale copy; stamp commits land on main
#                 after branch cut — see P820)
#   --env test  → local file (feature branch migrations need their own baseline)
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

# --- Resolve manifest source ---
TMPFILE=$(mktemp)
MANIFEST_TMPFILE=""
if [ "$ENV_NAME" = "prod" ]; then
  # For prod: always read from origin/main so that stamp commits that landed on main
  # after the feature branch was cut don't appear as false "drift" (P820).
  git fetch origin main --quiet 2>/dev/null || true
  MANIFEST_TMPFILE=$(mktemp)
  if ! git show origin/main:supabase/deploy-manifest.json > "$MANIFEST_TMPFILE" 2>/dev/null; then
    echo "WARNING: Could not read origin/main:supabase/deploy-manifest.json"
    echo "  Falling back to local file. Ensure 'git fetch origin main' has run recently."
    if [ ! -f "$MANIFEST" ]; then
      echo "  No local manifest found either. Cannot verify infra deployment state."
      rm -f "$TMPFILE" "$MANIFEST_TMPFILE"
      exit 2
    fi
    cp "$MANIFEST" "$MANIFEST_TMPFILE"
  fi
  MANIFEST_PATH="$MANIFEST_TMPFILE"
else
  # For test/local: use the local file (feature branch migrations need local baseline)
  if [ ! -f "$MANIFEST" ]; then
    echo "WARNING: No deploy manifest found at $MANIFEST"
    echo "  Run ./scripts/stamp-deploy-manifest.sh --env $ENV_NAME to create one."
    echo "  Cannot verify infra deployment state."
    rm -f "$TMPFILE"
    exit 2
  fi
  MANIFEST_PATH="$MANIFEST"
fi

# --- Compare (write to temp file to avoid set -e issues) ---
python3 << 'PYEOF' - "$MANIFEST_PATH" "$ENV_KEY" "$FUNCTIONS_DIR" "$MIGRATIONS_DIR" > "$TMPFILE"
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

# Check for functions the manifest still lists as deployed but whose local
# source directory is gone. P803 (2026-09-01): deleting a function's source
# does not undeploy it — the platform keeps serving the last-deployed code
# until `supabase functions delete` runs. The loop above only iterates local
# dirs, so it is structurally blind to this state: a deleted function with no
# local dir silently passes drift while still live on the target env.
local_function_names = {
    os.path.basename(fn_dir.rstrip('/'))
    for fn_dir in glob.glob(os.path.join(functions_dir, '*/'))
}
# No key is exempt, including _shared: if its directory disappeared locally that is
# the same unmanaged-deployed-code state and must be reported, not skipped.
for fn_name in sorted(deployed_functions.keys()):
    if fn_name not in local_function_names:
        issues.append(
            f'FUNCTION_ORPHANED: {fn_name} (in manifest for {env_key}, no local '
            f'source — still deployed and serving; run `supabase functions delete '
            f'{fn_name}` against {env_key}, then re-stamp the manifest)'
        )

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
  rm -f "$TMPFILE" "$MANIFEST_TMPFILE"
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
  elif [[ "$line" == FUNCTION_ORPHANED:* ]]; then
    fn=$(echo "$line" | sed 's/^[^:]*: //' | cut -d' ' -f1)
    echo "  supabase functions delete $fn --project-ref <$ENV_KEY ref>   # then ./scripts/stamp-deploy-manifest.sh --env $ENV_NAME"
  elif [[ "$line" == MIGRATION_MISSING:* ]]; then
    echo "  ./scripts/migrate.sh --env $ENV_NAME"
  fi
done < "$TMPFILE" | sort -u

rm -f "$TMPFILE" "$MANIFEST_TMPFILE"
exit 1
