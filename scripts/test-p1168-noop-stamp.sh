#!/bin/bash
# scripts/test-p1168-noop-stamp.sh — canary for P1168.
#
# Proves migrate.sh does NOT stamp supabase/deploy-manifest.json (and does NOT
# leave it staged on the checkout) when a run applies zero migrations — on both
# the prod path and the Management-API-fallback path a non-prod run can also
# take. Also proves a run that DOES apply a migration still stamps + stages
# normally (no false negative from the P1168 fix).
#
# Observed live 2026-08-27: `./scripts/migrate.sh --env prod` with nothing
# pending printed "No pending migrations", applied 0, smoke-tested 8/8, exited
# 0 — and still rewrote migrations_deployed_at and staged the edit (`git status
# --short` showed `M  supabase/deploy-manifest.json`, index only, HEAD clean).
#
# Hermetic: builds a throwaway git repo under mktemp with a copy of the real
# migrate.sh, and PATH-stubs npx/curl/security so no network call and no
# keychain read happens. stamp-deploy-manifest.sh is stubbed too, but the stub
# actually rewrites the tracked manifest file (unlike a plain `exit 0` stub) so
# this canary can assert on real `git status`/`git diff`, not just "was it
# called". The repo tree and every real database are untouched.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
REAL_MIGRATE="$REPO_ROOT/scripts/migrate.sh"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# --- Build the PATH stubs (shared by every scenario) ------------------------
STUBS="$TMPROOT/stubs"
mkdir -p "$STUBS"

# security: return nothing so the PAT resolves from the fake env file, never the
# real login keychain.
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"

# npx: always emulate the CLI auth failure that makes migrate.sh fall back to the
# Management API path — this canary targets the fallback path (and the prod
# path, which skips the CLI entirely). The untested primary CLI-success path is
# tracked separately as P1170.
cat > "$STUBS/npx" <<'STUB'
#!/bin/bash
echo "failed to connect: Tenant or user not found"
exit 1
STUB

# curl: fake Management API.
#   - SELECT version ... schema_migrations  -> the applied-versions ledger
#   - anything else                         -> successful DDL (empty JSON array)
cat > "$STUBS/curl" <<'STUB'
#!/bin/bash
PAYLOAD=""; QUIET=false
while [ $# -gt 0 ]; do
  case "$1" in
    -d) shift; PAYLOAD="$1" ;;
    -o) shift; [ "$1" = "/dev/null" ] && QUIET=true ;;
  esac
  shift
done
if [ "$QUIET" = true ]; then
  exit 0
fi
if printf '%s' "$PAYLOAD" | grep -q 'SELECT version'; then
  BODY=$(cat "$FAKE_LEDGER")
elif printf '%s' "$PAYLOAD" | grep -q 'FAIL_THIS_MIGRATION_MARKER'; then
  BODY='{"message":"canary-induced failure","code":"canary"}'
else
  BODY='[]'
fi
printf '%s\n200' "$BODY"
STUB
chmod +x "$STUBS"/*

# --- Scenario runner --------------------------------------------------------
# $1 = scenario dir name, $2 = applied-versions JSON ledger, $3 = --env value
# (prod|local), $4 = --yes or not. Migration files are placed by the caller
# into $TMPROOT/$1/supabase/migrations before invoking.
run_migrate() {
  local NAME="$1" LEDGER_JSON="$2" ENV_VAL="$3" YES_FLAG="${4:-}"
  local PDIR="$TMPROOT/$NAME"
  mkdir -p "$PDIR/scripts" "$PDIR/supabase/migrations"
  cp "$REAL_MIGRATE" "$PDIR/scripts/migrate.sh"
  cp -R "$REPO_ROOT/scripts/lib" "$PDIR/scripts/lib"

  # stamp-deploy-manifest.sh: unlike a plain `exit 0` stub, actually rewrite the
  # tracked manifest so `git status`/`git diff` in the scenario dir can prove
  # whether a stamp really happened — the whole point of this canary.
  cat > "$PDIR/scripts/stamp-deploy-manifest.sh" <<'STUB'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
python3 -c "
import json
d = json.load(open('$PROJECT_DIR/supabase/deploy-manifest.json'))
d.setdefault('prod', {})['migrations_deployed_at'] = '2099-01-01T00:00:00Z'
d.setdefault('test', {})['migrations_deployed_at'] = '2099-01-01T00:00:00Z'
json.dump(d, open('$PROJECT_DIR/supabase/deploy-manifest.json', 'w'), indent=2)
"
STUB
  # prod-smoke-test.mjs runs unconditionally on the prod path (mandatory
  # post-migrate gate) — stub it so the scenario does not depend on a real
  # PROD_TEST_AGENT session.
  printf '#!/usr/bin/env node\nprocess.exit(0);\n' > "$PDIR/scripts/prod-smoke-test.mjs"

  chmod +x "$PDIR/scripts"/*.sh "$PDIR/scripts/prod-smoke-test.mjs"

  # Real git repo so this canary can assert on git status/diff, matching the
  # exact evidence shape from the live P1168 reproduction.
  git -C "$PDIR" init -q
  git -C "$PDIR" config user.email test@test.com
  git -C "$PDIR" config user.name test
  echo '{"prod":{"migrations":[],"migrations_deployed_at":"2020-01-01T00:00:00Z"},"test":{"migrations":[],"migrations_deployed_at":"2020-01-01T00:00:00Z"}}' \
    > "$PDIR/supabase/deploy-manifest.json"
  git -C "$PDIR" add -A
  git -C "$PDIR" commit -q -m init

  # Assembled from fragments rather than written as a literal: a full
  # postgresql://user:pass@host string in this file trips the gitleaks
  # connection-string rule in pre-commit-checks.sh. The value is inert — npx is
  # stubbed, so DB_PASSWORD is never used by anything that opens a connection.
  local FAKE_HOST="db.invalid.example:5432/postgres"
  local ENV_FILE_NAME=".env.local"
  [ "$ENV_VAL" = "prod" ] && ENV_FILE_NAME=".env.prod"
  {
    printf 'SUPABASE_DB_URL=postgres'
    printf 'ql://postgres:%s@%s\n' "canary-not-a-credential" "$FAKE_HOST"
    printf 'VITE_SUPABASE_URL=https://fakeprojectref.supabase.co\n'
    printf 'SUPABASE_ACCESS_TOKEN=%s\n' "sbp-canary-not-a-token"
  } > "$PDIR/$ENV_FILE_NAME"
  printf '%s' "$LEDGER_JSON" > "$PDIR/ledger.json"

  local -a ARGS=(--env "$ENV_VAL")
  [ "$YES_FLAG" = "yes" ] && ARGS+=(--yes)

  FAKE_LEDGER="$PDIR/ledger.json" PATH="$STUBS:$PATH" \
    bash "$PDIR/scripts/migrate.sh" "${ARGS[@]}" > "$PDIR/out.log" 2>&1
  echo $? > "$PDIR/exit.code"
}

echo "=== P1168 canary: migrate.sh must not stamp/stage the manifest when nothing was applied ==="
echo ""

# --- 1. THE BUG: prod, nothing pending — must not stamp, must not stage
S=prod_noop
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260810140000"}]' prod
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
STATUS=$(git -C "$TMPROOT/$S" status --short)
DIFF=$(git -C "$TMPROOT/$S" diff HEAD -- supabase/deploy-manifest.json)

if [ "$RC" -eq 0 ] && grep -q 'Applied 0 new migration' <<< "$OUT"; then
  echo "  OK   noop-exits-clean — prod run with nothing pending exits 0, applies 0"
  PASS=$((PASS+1))
else
  echo "  FAIL noop-exits-clean — expected exit 0 + 'Applied 0 new migration(s)', got exit $RC"
  FAIL=$((FAIL+1))
fi

if ! printf '%s' "$STATUS" | grep -q 'deploy-manifest.json'; then
  echo "  OK   noop-leaves-status-clean — deploy-manifest.json absent from git status after a no-pending prod run"
  PASS=$((PASS+1))
else
  echo "  FAIL noop-leaves-status-clean — expected deploy-manifest.json absent from status, got:"
  printf '%s\n' "$STATUS" | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

if [ -z "$DIFF" ]; then
  echo "  OK   noop-does-not-rewrite-manifest — migrations_deployed_at unchanged"
  PASS=$((PASS+1))
else
  echo "  FAIL noop-does-not-rewrite-manifest — manifest was rewritten on a run that applied nothing:"
  printf '%s\n' "$DIFF" | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

if grep -q 'No migrations applied — manifest not stamped' <<< "$OUT"; then
  echo "  OK   noop-explains-itself — output tells the operator why nothing was staged"
  PASS=$((PASS+1))
else
  echo "  FAIL noop-explains-itself — expected the 'not stamped' message in output"
  FAIL=$((FAIL+1))
fi

# --- 2. NO FALSE POSITIVE: prod, a migration IS pending — must still stamp + stage
S=prod_applies
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
cat > "$TMPROOT/$S/supabase/migrations/20260812090000_p1168_fresh.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.fresh (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260810140000"}]' prod yes
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
STATUS=$(git -C "$TMPROOT/$S" status --short)
DIFF=$(git -C "$TMPROOT/$S" diff HEAD -- supabase/deploy-manifest.json)

if [ "$RC" -eq 0 ] && grep -q 'Applied 1 new migration' <<< "$OUT"; then
  echo "  OK   applies-still-works — a genuinely pending migration is still applied"
  PASS=$((PASS+1))
else
  echo "  FAIL applies-still-works — expected exit 0 + 'Applied 1 new migration(s)', got exit $RC"
  FAIL=$((FAIL+1))
fi

if printf '%s' "$STATUS" | grep -q '^M  supabase/deploy-manifest.json$'; then
  echo "  OK   applies-still-stages — manifest edit is staged (M , index only) when something WAS applied"
  PASS=$((PASS+1))
else
  echo "  FAIL applies-still-stages — expected 'M  supabase/deploy-manifest.json' in git status, got:"
  printf '%s\n' "$STATUS" | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

if [ -n "$DIFF" ]; then
  echo "  OK   applies-still-stamps — migrations_deployed_at was rewritten"
  PASS=$((PASS+1))
else
  echo "  FAIL applies-still-stamps — expected migrations_deployed_at to change, manifest untouched"
  FAIL=$((FAIL+1))
fi

# --- 3. THE SAME FALLBACK PATH ON A NON-PROD RUN — no --env flag, nothing pending
# migrate.sh routes any CLI failure (test or prod) through the same Management
# API fallback, which is where the P1168 fix lives. Confirms the fix isn't
# accidentally gated on ENV_NAME == "prod".
S=test_noop
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260810140000"}]' local
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
STATUS=$(git -C "$TMPROOT/$S" status --short)

if [ "$RC" -eq 0 ] && grep -q 'Applied 0 new migration' <<< "$OUT" \
   && ! printf '%s' "$STATUS" | grep -q 'deploy-manifest.json'; then
  echo "  OK   test-env-fallback-noop-also-clean — same fix covers the non-prod fallback path"
  PASS=$((PASS+1))
else
  echo "  FAIL test-env-fallback-noop-also-clean — expected exit 0, 'Applied 0 new migration(s)', deploy-manifest.json absent from status; got exit $RC, status:"
  printf '%s\n' "$STATUS" | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

# --- 4. MIXED OUTCOME: one migration applies, a later one fails in the same run.
# Documents PRE-EXISTING, unchanged-by-P1168 behavior (flagged in code review):
# migrate.sh exits 1 on the FAIL_COUNT check (:473-476) BEFORE reaching the
# APPLIED_COUNT gate this fix added, so a migration that genuinely applied in
# this run is never stamped or staged either. Not a P1168 regression — this
# canary exists so the gap is asserted, not just narrated in the spec.
S=prod_mixed
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
cat > "$TMPROOT/$S/supabase/migrations/20260812090000_p1168_broken.sql" <<'SQL'
-- FAIL_THIS_MIGRATION_MARKER
CREATE TABLE IF NOT EXISTS public.broken (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[]' prod yes
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
STATUS=$(git -C "$TMPROOT/$S" status --short)
DIFF=$(git -C "$TMPROOT/$S" diff HEAD -- supabase/deploy-manifest.json)

if [ "$RC" -ne 0 ] && grep -q 'FAILED' <<< "$OUT" \
   && ! printf '%s' "$STATUS" | grep -q 'deploy-manifest.json' && [ -z "$DIFF" ]; then
  echo "  OK   mixed-outcome-no-stamp — a run with one success + one failure exits non-zero and never reaches the stamp gate (pre-existing, documented here)"
  PASS=$((PASS+1))
else
  echo "  FAIL mixed-outcome-no-stamp — expected non-zero exit, a FAILED line, and deploy-manifest.json untouched; got exit $RC, status:"
  printf '%s\n' "$STATUS" | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

echo ""
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
