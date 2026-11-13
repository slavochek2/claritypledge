#!/bin/bash
# scripts/test-p1672-land-migrations.sh — hermetic: a landing brings the MAIN lane's schema forward (P1672).
#
# A throwaway repo whose main carries STUB scripts/selfhosted/migrate.sh and deploy-functions.sh that
# only record how they were called. Proves, by the records and the failure files:
#   1. a migration-only landing runs migrate.sh --env selfhosted --main-lane from an archive of main's tip
#      (never the working tree, never through the resolver) and NOT the function deploy;
#   2. a function-only landing deploys and does not migrate;
#   3. a landing that touches neither starts nothing (control for 1);
#   4. a failing migration writes cp-test-migrate-land.failed even when the function deploy in the same
#      landing succeeds, and a later successful landing migration clears it;
#   5. a deleted migration file alone starts nothing.
# Output: no redirect or pipe tokens in status lines.
set -u
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL + 1)); }

R="$W/repo"; mkdir -p "$R"; cd "$R" || exit 1
git init -q -b main .; git config user.email t@example.com; git config user.name t
mkdir -p scripts/selfhosted/lib scripts/lib scripts/selfhosted supabase/migrations supabase/functions/hello
cp "$SRC_ROOT/scripts/selfhosted/lib/deploy-guard.sh" "$SRC_ROOT/scripts/selfhosted/lib/deploy-on-land.sh" \
   "$SRC_ROOT/scripts/selfhosted/lib/land-job.sh" scripts/selfhosted/lib/
cp "$SRC_ROOT/scripts/lib/active-test.sh" scripts/lib/
# Resolver stub: the active TEST server is self-hosted.
cat > scripts/selfhosted/flip-test-env.py <<'PY'
import sys
print('selfhosted')
PY
# Stubs record argv, cwd and whether the cwd is a git checkout.
for s in migrate deploy-functions; do
  cat > "scripts/selfhosted/$s.sh" <<EOF
#!/bin/bash
{ echo "$s args=\$* cwd=\$(pwd) git=\$(git -C "\$(pwd)" rev-parse --is-inside-work-tree 2>/dev/null || echo no) files=\$(ls supabase/migrations 2>/dev/null | tr '\n' ',')"; } >> "$W/calls"
if [ "$s" = migrate ] && [ -f "$W/migrate-fails" ]; then exit 3; fi
exit 0
EOF
  chmod +x "scripts/selfhosted/$s.sh"
done
echo 'export default 1' > supabase/functions/hello/index.ts
echo 'select 1;' > supabase/migrations/20260101000000_base.sql
git add -A; git commit -qm base
LOG="$R/.git/cp-test-deploy-land.log"

land() { # message; files are already changed and staged
  local before after
  before="$(git rev-parse HEAD)"; git commit -qm "$1"; after="$(git rev-parse HEAD)"
  : > "$W/calls"
  ( source "$R/scripts/selfhosted/lib/deploy-on-land.sh"; CP_LAND_LOCK_WAIT=5 deploy_test_on_land "$R" "$before" "$after" ) > "$W/hook" 2>&1
  local i
  # A landing that starts a job appends LAND-JOB-END to the log; wait for it (up to 10 s).
  for i in $(seq 1 50); do
    grep -q 'started in the background' "$W/hook" || break
    [ "$(jobs_ended)" -gt "${JOBS:-0}" ] && break
    sleep 0.2
  done
  JOBS="$(jobs_ended)"
}
jobs_ended() { local n; n="$(grep -c LAND-JOB-END "$LOG" 2>/dev/null)"; echo "${n:-0}"; }

echo "1. migration-only landing"
echo 'select 2;' > supabase/migrations/20260102000000_two.sql; git add -A
land "add migration"
if grep -q '^migrate args=--env selfhosted --main-lane ' "$W/calls"; then ok "migrate.sh ran with --env selfhosted --main-lane"; else bad "migrate.sh not run as main lane: $(cat "$W/calls")"; fi
if grep '^migrate ' "$W/calls" | grep -q 'git=no'; then ok "it ran from an extract, not a checkout"; else bad "migrate ran inside a git checkout"; fi
if grep '^migrate ' "$W/calls" | grep -q '20260102000000_two.sql'; then ok "the extract holds main's tip migrations"; else bad "extract lacks the new migration"; fi
if grep -q '^deploy-functions ' "$W/calls"; then bad "a migration-only landing deployed functions"; else ok "no function deploy for a migration-only landing"; fi

echo "2. function-only landing"
echo 'export default 2' > supabase/functions/hello/index.ts; git add -A
land "change function"
if grep -q '^deploy-functions args=--from-main-tip ' "$W/calls"; then ok "function deploy ran"; else bad "function deploy did not run: $(cat "$W/calls")"; fi
if grep -q '^migrate ' "$W/calls"; then bad "a function-only landing migrated"; else ok "no migration for a function-only landing"; fi

echo "3. control: a landing touching neither"
echo docs > README.md; git add -A
land "docs only"
if [ -s "$W/calls" ]; then bad "something ran for a docs-only landing: $(cat "$W/calls")"; else ok "nothing ran"; fi

echo "4. failing migration is recorded even when the function deploy succeeds"
touch "$W/migrate-fails"
echo 'select 3;' > supabase/migrations/20260103000000_three.sql
echo 'export default 3' > supabase/functions/hello/index.ts; git add -A
land "migration + function, migration fails"
MF="$R/.git/cp-test-migrate-land.failed"
if [ -s "$MF" ] && [ "$(cut -f3 "$MF")" = 3 ]; then ok "cp-test-migrate-land.failed written with the exit code"; else bad "no migration failure record"; fi
if grep -q '^deploy-functions ' "$W/calls"; then ok "the function deploy still ran"; else bad "function deploy skipped"; fi
if [ -e "$R/.git/cp-test-deploy-land.failed" ]; then bad "the functions record claims a failure"; else ok "functions record clean (independent of the migration record)"; fi
rm -f "$W/migrate-fails"
echo 'select 4;' > supabase/migrations/20260104000000_four.sql; git add -A
land "migration succeeds"
if [ -e "$MF" ]; then bad "a successful landing migration did not clear the record"; else ok "a later successful landing migration clears the record"; fi

echo "5. a deleted migration alone starts nothing"
git rm -q supabase/migrations/20260104000000_four.sql
land "delete migration"
if [ -s "$W/calls" ]; then bad "a deletion started a job: $(cat "$W/calls")"; else ok "nothing ran for a deletion"; fi

echo ""
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
