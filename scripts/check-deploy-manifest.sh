#!/bin/bash
# scripts/check-deploy-manifest.sh — Compare supabase/ state against deploy manifest
#
# Returns 0 if all infra matches what was last deployed to the target env.
# Returns 1 if drift is detected. Drift is bidirectional:
#   local-not-deployed  → FUNCTION_MISSING / FUNCTION_STALE / MIGRATION_MISSING
#   deployed-not-local  → FUNCTION_ORPHANED (source deleted, platform still serving)
#   stamped-not-pushed  → FUNCTION_UNPUSHED_STAMP / MIGRATION_UNPUSHED_STAMP (P1284)
#
# The unpushed-stamp class exists because --env prod reads the manifest from
# origin/main. When local main is ahead of origin, a stamp that HAS been applied
# reads as never-deployed, and this script used to print "migrate prod" or
# "redeploy the function" as the fix — the wrong action, at the moment the
# operator is deciding. It misled at least four times (2026-08-18, 2026-08-28,
# 2026-09-08, and an earlier migrate.sh disagreement). The function case is
# worse than the migration case: deploy-functions.sh stamps only the LOCAL
# manifest, so the printed fix loops forever — redeploy, re-stamp locally,
# still diff against origin/main, still stale.
#
# So when the entry is present in the working-tree manifest and absent or stale
# only on origin/main, the diagnosis is "the stamp has not reached origin/main"
# and the remedy is to commit and push main. MISSING/STALE is reserved for an
# entry that is absent from BOTH manifests.
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
LOCAL_MANIFEST_PATH=""
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
  # The working-tree manifest, as the second opinion (P1284). Empty when there
  # is no local file, in which case the unpushed-stamp branch cannot fire and
  # the classification is exactly what it was before.
  [ -f "$MANIFEST" ] && LOCAL_MANIFEST_PATH="$MANIFEST"
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
python3 << 'PYEOF' - "$MANIFEST_PATH" "$ENV_KEY" "$FUNCTIONS_DIR" "$MIGRATIONS_DIR" "$LOCAL_MANIFEST_PATH" > "$TMPFILE"
import json, sys, hashlib, os, glob

manifest_path = sys.argv[1]
env_key = sys.argv[2]
functions_dir = sys.argv[3]
migrations_dir = sys.argv[4]
local_manifest_path = sys.argv[5] if len(sys.argv) > 5 else ''

with open(manifest_path) as f:
    manifest = json.load(f)

env = manifest.get(env_key, {})
deployed_functions = env.get('functions', {})
deployed_migrations = set(env.get('migrations', []))

# The working-tree manifest for the same env. Only consulted when the reference
# manifest came from origin/main and the two disagree — see the header note on
# the unpushed-stamp class. A malformed or absent local file degrades to the
# old behaviour rather than failing the check.
local_functions, local_migrations = {}, set()
if local_manifest_path and os.path.isfile(local_manifest_path) \
        and os.path.abspath(local_manifest_path) != os.path.abspath(manifest_path):
    try:
        with open(local_manifest_path) as f:
            local_env = json.load(f).get(env_key, {})
        local_functions = local_env.get('functions', {}) or {}
        local_migrations = set(local_env.get('migrations', []) or [])
    except (ValueError, OSError):
        pass

issues = []

# Check edge functions
for fn_dir in sorted(glob.glob(os.path.join(functions_dir, '*/'))):
    fn_name = os.path.basename(fn_dir.rstrip('/'))
    main_file = os.path.join(fn_dir, 'index.ts')

    local_hash = None
    if os.path.isfile(main_file):
        with open(main_file, 'rb') as mf:
            local_hash = hashlib.sha256(mf.read()).hexdigest()

    # The working-tree manifest agrees with the code on disk, so this function
    # WAS deployed and stamped here; only the stamp is missing from origin/main.
    stamped_locally = (
        local_hash is not None
        and local_functions.get(fn_name) == local_hash
    )

    if fn_name not in deployed_functions:
        if stamped_locally:
            issues.append(
                f'FUNCTION_UNPUSHED_STAMP: {fn_name} (deployed and stamped locally; '
                f'the stamp has not reached origin/main)'
            )
        else:
            issues.append(f'FUNCTION_MISSING: {fn_name} (not in manifest — never deployed to {env_key})')
        continue

    if local_hash is not None and deployed_functions[fn_name] != local_hash:
        if stamped_locally:
            issues.append(
                f'FUNCTION_UNPUSHED_STAMP: {fn_name} (deployed and stamped locally; '
                f'the stamp has not reached origin/main)'
            )
        else:
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
        if version in local_migrations:
            issues.append(
                f'MIGRATION_UNPUSHED_STAMP: {bn} (applied and stamped locally; '
                f'the stamp has not reached origin/main)'
            )
        else:
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
  elif [[ "$line" == MIGRATION_UNPUSHED_STAMP:* ]] || [[ "$line" == FUNCTION_UNPUSHED_STAMP:* ]]; then
    # NOT migrate.sh and NOT deploy-functions.sh. The infra change already
    # landed; what is missing is the record of it on origin/main. Redeploying
    # re-stamps the local manifest only, so it never clears this (P1284).
    echo "  git log origin/main..main -- supabase/deploy-manifest.json   # confirm the stamp is local-only"
    echo "  commit supabase/deploy-manifest.json on main, then push main to origin"
  fi
done < "$TMPFILE" | sort -u

rm -f "$TMPFILE" "$MANIFEST_TMPFILE"
exit 1
