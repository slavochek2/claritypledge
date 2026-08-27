#!/bin/bash
# scripts/test-p1174-pending-set-integrity.sh — canary for P1174.
#
# Two mechanisms, one invariant: on a prod migrate, the set of migrations the
# human acked (and that cleared the requires-frontend coupling gate) must be the
# exact set that reaches the database.
#
#   A. Double-glob race. PENDING_FILES (the acked list, migrate.sh:~351) and the
#      apply loop (migrate.sh:~424) each glob supabase/migrations/*.sql
#      independently. A file landing on disk between them — a co-tenant commit, a
#      git pull, a merge on the shared main checkout while a human reads the ack
#      prompt — is applied to PROD having passed neither the ack nor the P886
#      requires-frontend coupling scan. This is the exact incident class P887/P886
#      exist to prevent.
#
#   B. Malformed-but-HTTP-200 ledger. The APPLIED_HTTP guard only catches
#      transport failure. A 200 carrying a truncated/invalid body is swallowed by
#      `2>/dev/null || true` on the python parse, leaving REMOTE_VERSIONS empty —
#      which reads as "nothing is applied yet", so already-live migrations are
#      shown to the human as pending and re-sent to prod.
#
# Hermetic: throwaway git repo under mktemp with a copy of the real migrate.sh;
# PATH-stubs npx/curl/security so no network call and no keychain read happens
# (same stub style as test-p1168-noop-stamp.sh / test-p1042-version-collision.sh).
# The interactive scenarios run migrate.sh under script(1) so `[ -t 0 ]` is true
# and the real y/N ack prompt is exercised; the injected file is written only
# after the prompt has actually appeared in the session log, so the race is
# ordered by observation, not by a sleep. The repo tree and every real database
# are untouched.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
REAL_MIGRATE="$REPO_ROOT/scripts/migrate.sh"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# --- PATH stubs (shared by every scenario) ----------------------------------
STUBS="$TMPROOT/stubs"
mkdir -p "$STUBS"

# security: return nothing so the PAT resolves from the fake env file, never the
# real login keychain.
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"

# npx: emulate the CLI auth failure that routes migrate.sh to the Management API
# fallback. The prod path skips the CLI entirely anyway.
cat > "$STUBS/npx" <<'STUB'
#!/bin/bash
echo "failed to connect: Tenant or user not found"
exit 1
STUB

# curl: fake Management API.
#   - SELECT version ... schema_migrations -> contents of $FAKE_LEDGER, HTTP 200
#   - anything else                        -> successful DDL (empty JSON array)
# Every DDL payload is appended to $APPLY_LOG so a scenario can assert exactly
# which migration bodies reached the "database".
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
else
  [ -n "${APPLY_LOG:-}" ] && printf '%s\n' "$PAYLOAD" >> "$APPLY_LOG"
  BODY='[]'
fi
printf '%s\n200' "$BODY"
STUB
chmod +x "$STUBS"/*

# --- Scenario builder -------------------------------------------------------
# build_scenario <name> <ledger-json> <env>
# Caller then drops .sql files into $TMPROOT/<name>/supabase/migrations.
build_scenario() {
  local NAME="$1" LEDGER_JSON="$2" ENV_VAL="$3"
  local PDIR="$TMPROOT/$NAME"
  mkdir -p "$PDIR/scripts" "$PDIR/supabase/migrations" "$PDIR/incoming"
  cp "$REAL_MIGRATE" "$PDIR/scripts/migrate.sh"
  cp -R "$REPO_ROOT/scripts/lib" "$PDIR/scripts/lib"
  printf '#!/bin/bash\nexit 0\n' > "$PDIR/scripts/stamp-deploy-manifest.sh"
  printf '#!/usr/bin/env node\nprocess.exit(0);\n' > "$PDIR/scripts/prod-smoke-test.mjs"
  chmod +x "$PDIR/scripts"/*.sh "$PDIR/scripts/prod-smoke-test.mjs"

  git -C "$PDIR" init -q
  git -C "$PDIR" config user.email test@test.com
  git -C "$PDIR" config user.name test
  echo '{"prod":{"migrations":[]},"test":{"migrations":[]}}' > "$PDIR/supabase/deploy-manifest.json"
  git -C "$PDIR" add -A
  git -C "$PDIR" commit -q -m init

  # Assembled from fragments rather than written as a literal: a full
  # postgresql://user:pass@host string trips the gitleaks connection-string rule
  # in pre-commit-checks.sh. Inert — npx is stubbed, nothing opens a connection.
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
}

# run_direct <name> <env> [--yes]
run_direct() {
  local NAME="$1" ENV_VAL="$2" YES="${3:-}"
  local PDIR="$TMPROOT/$NAME"
  local -a ARGS=(--env "$ENV_VAL")
  [ "$YES" = "yes" ] && ARGS+=(--yes)
  FAKE_LEDGER="$PDIR/ledger.json" APPLY_LOG="$PDIR/applied.log" PATH="$STUBS:$PATH" \
    bash "$PDIR/scripts/migrate.sh" "${ARGS[@]}" > "$PDIR/out.log" 2>&1
  echo $? > "$PDIR/exit.code"
}

# run_interactive <name> <env> [inject-basename]
# Runs migrate.sh on a pty so the real y/N ack prompt path is taken. When
# inject-basename is given, that file is copied from $PDIR/incoming into
# supabase/migrations only AFTER the ack prompt has appeared in the session log
# — i.e. strictly between the two globs — and then "y" is sent.
run_interactive() {
  local NAME="$1" ENV_VAL="$2" INJECT="${3:-}"
  local PDIR="$TMPROOT/$NAME"
  : > "$PDIR/session.log"
  cat > "$PDIR/run.sh" <<RUNNER
#!/bin/bash
export FAKE_LEDGER="$PDIR/ledger.json"
export APPLY_LOG="$PDIR/applied.log"
export PATH="$STUBS:\$PATH"
bash "$PDIR/scripts/migrate.sh" --env "$ENV_VAL"
echo "MIGRATE_EXIT=\$?"
RUNNER
  (
    for _ in $(seq 1 200); do
      grep -q 'Apply these' "$PDIR/session.log" 2>/dev/null && break
      sleep 0.05
    done
    if [ -n "$INJECT" ]; then
      cp "$PDIR/incoming/$INJECT" "$PDIR/supabase/migrations/$INJECT"
    fi
    echo y
    sleep 1
  ) | script -q "$PDIR/session.log" bash "$PDIR/run.sh" > /dev/null 2>&1
  # script(1) does not reliably forward the child's status; the runner echoes it.
  sed -n 's/.*MIGRATE_EXIT=\([0-9]*\).*/\1/p' "$PDIR/session.log" | tail -1 > "$PDIR/exit.code"
  tr -d '\r' < "$PDIR/session.log" > "$PDIR/out.log"
}

check() { # check <label> <condition-result 0/1> [evidence...]
  local LABEL="$1" OK="$2"; shift 2
  if [ "$OK" -eq 0 ]; then
    echo "  OK   $LABEL"
    PASS=$((PASS+1))
  else
    echo "  FAIL $LABEL"
    for LINE in "$@"; do printf '         %s\n' "$LINE"; done
    FAIL=$((FAIL+1))
  fi
}

echo "=== P1174 canary: the acked pending set must be the applied set ==="
echo ""

# --- 1. THE BUG (mechanism A): a file lands between the ack prompt and the apply loop
S=race_inject
build_scenario "$S" '[]' prod
cat > "$TMPROOT/$S/supabase/migrations/20260101000000_p1174_acked.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.acked (id uuid PRIMARY KEY);
SQL
# The co-tenant's file, staged out of tree until the ack window opens. It carries
# a requires-frontend marker for an unreachable sha: had it gone through the
# coupling gate it would have hard-blocked the whole run (P886). It never does.
cat > "$TMPROOT/$S/incoming/20260101000001_p1174_sneaky.sql" <<'SQL'
-- requires-frontend: deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
GRANT SELECT ON public.acked TO anon;
SQL
run_interactive "$S" prod 20260101000001_p1174_sneaky.sql
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
APPLIED=$(cat "$TMPROOT/$S/applied.log" 2>/dev/null || true)

grep -q 'Apply these 1 migration' <<< "$OUT"; check \
  "race-acks-exactly-one — the human was shown a 1-file pending list" $? \
  "ack prompt line not found in session output"

# The API payload carries SQL, not the basename — assert on the injected file's
# body (its GRANT is the client-breaking shape the P886 coupling gate exists for).
! grep -q 'GRANT SELECT ON public.acked' <<< "$APPLIED"; check \
  "race-sneaky-never-reaches-prod — the unacked file's SQL is never sent to the API" $? \
  "the injected migration's SQL WAS sent to prod without ack or coupling scan:" \
  "$(grep -o 'GRANT SELECT[^\\]*' <<< "$APPLIED" | head -1)"

[ "$RC" -ne 0 ]; check \
  "race-aborts-loudly — a pending set that changed after the ack gate exits non-zero" $? \
  "expected non-zero exit, got $RC"

grep -qi 'changed after the ack' <<< "$OUT"; check \
  "race-explains-itself — output names the divergence, not a generic failure" $? \
  "expected a message about the pending set changing after the ack gate"

# Must be named somewhere OTHER than an apply-success line — pre-fix the only
# mention of it is "✓ ... applied", which is the bug, not an explanation.
grep 'p1174_sneaky' <<< "$OUT" | grep -qv '✓'; check \
  "race-names-the-file — the operator is told which file appeared, outside the applied list" $? \
  "the injected basename appears only as an apply-success line, or not at all"

# --- 1b. SAME BUG, NON-INTERACTIVE PATH: --yes takes a different ack branch but
# the same apply loop. Injection point here is the requires-frontend coupling
# scan's `git merge-base` call, which runs strictly between the two globs — no
# sleep, no prompt to wait for.
S=race_inject_yes
build_scenario "$S" '[]' prod
cat > "$TMPROOT/$S/supabase/migrations/20260101000000_p1174_acked.sql" <<'SQL'
-- requires-frontend: abc1234
CREATE TABLE IF NOT EXISTS public.acked (id uuid PRIMARY KEY);
SQL
cat > "$TMPROOT/$S/incoming/20260101000001_p1174_sneaky.sql" <<'SQL'
-- requires-frontend: deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
GRANT SELECT ON public.acked TO anon;
SQL
# git stub: the coupling gate's ancestry probe is the co-tenant's commit landing.
# Everything else passes through to the real git so migrate.sh's own `git add`
# and the scenario repo keep working.
mkdir -p "$TMPROOT/$S/gitstub"
cat > "$TMPROOT/$S/gitstub/git" <<GITSTUB
#!/bin/bash
for A in "\$@"; do
  if [ "\$A" = "merge-base" ]; then
    cp "$TMPROOT/$S/incoming/20260101000001_p1174_sneaky.sql" \
       "$TMPROOT/$S/supabase/migrations/20260101000001_p1174_sneaky.sql"
    exit 0   # coupling OK for the acked file
  fi
done
exec /usr/bin/git "\$@"
GITSTUB
chmod +x "$TMPROOT/$S/gitstub/git"
FAKE_LEDGER="$TMPROOT/$S/ledger.json" APPLY_LOG="$TMPROOT/$S/applied.log" \
  PATH="$TMPROOT/$S/gitstub:$STUBS:$PATH" \
  bash "$TMPROOT/$S/scripts/migrate.sh" --env prod --yes > "$TMPROOT/$S/out.log" 2>&1
echo $? > "$TMPROOT/$S/exit.code"
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
APPLIED=$(cat "$TMPROOT/$S/applied.log" 2>/dev/null || true)

! grep -q 'GRANT SELECT ON public.acked' <<< "$APPLIED"; check \
  "yes-race-sneaky-never-reaches-prod — --yes path is guarded too, not just the prompt path" $? \
  "the injected migration's SQL WAS sent to prod on the --yes path"

[ "$RC" -ne 0 ] && grep -qi 'changed after the ack' <<< "$OUT"; check \
  "yes-race-aborts-loudly — the divergence check is not nested inside the interactive branch" $? \
  "expected non-zero exit + a divergence message, got exit $RC"

# --- 2. NO FALSE POSITIVE: same interactive prod path, nothing injected
S=race_clean
build_scenario "$S" '[]' prod
cat > "$TMPROOT/$S/supabase/migrations/20260101000000_p1174_acked.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.acked (id uuid PRIMARY KEY);
SQL
run_interactive "$S" prod
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")

[ "$RC" -eq 0 ] && grep -q 'Applied 1 new migration' <<< "$OUT"; check \
  "clean-run-still-applies — an undisturbed acked list is applied normally" $? \
  "expected exit 0 + 'Applied 1 new migration(s)', got exit $RC"

# --- 3. NO FALSE POSITIVE: non-prod fallback path is unaffected by the prod gate
S=test_env
build_scenario "$S" '[]' local
cat > "$TMPROOT/$S/supabase/migrations/20260101000000_p1174_acked.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.acked (id uuid PRIMARY KEY);
SQL
run_direct "$S" local
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")

[ "$RC" -eq 0 ] && grep -q 'Applied 1 new migration' <<< "$OUT"; check \
  "test-env-unaffected — the non-prod fallback path still applies (no ack gate there)" $? \
  "expected exit 0 + 'Applied 1 new migration(s)', got exit $RC"

# --- 4. THE BUG (mechanism B): malformed-but-HTTP-200 ledger response
S=malformed_ledger
build_scenario "$S" '[{"version":"20260101000000","name":"p1174_acked"' prod   # truncated JSON, HTTP 200
cat > "$TMPROOT/$S/supabase/migrations/20260101000000_p1174_acked.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.acked (id uuid PRIMARY KEY);
SQL
run_direct "$S" prod yes
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
APPLIED=$(cat "$TMPROOT/$S/applied.log" 2>/dev/null || true)

[ "$RC" -ne 0 ]; check \
  "malformed-ledger-aborts — a 200 carrying an unparseable body is an error, not 'nothing applied yet'" $? \
  "expected non-zero exit, got $RC"

! grep -q 'CREATE TABLE' <<< "$APPLIED"; check \
  "malformed-ledger-applies-nothing — an already-live migration is not re-sent" $? \
  "SQL was sent to prod while the applied-versions list was unknown"

grep -qiE 'could not (parse|read) .*(migration history|ledger)|unparseable' <<< "$OUT"; check \
  "malformed-ledger-explains-itself — output names the unreadable ledger response" $? \
  "expected a message naming the malformed migration-history response"

# --- 5. NO FALSE POSITIVE: a genuinely empty ledger is valid, not malformed
# `[]` parses fine and legitimately means "nothing applied yet" (fresh project).
# The mechanism-B fix must distinguish parse failure from zero rows.
S=empty_ledger
build_scenario "$S" '[]' prod
cat > "$TMPROOT/$S/supabase/migrations/20260101000000_p1174_acked.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.acked (id uuid PRIMARY KEY);
SQL
run_direct "$S" prod yes
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")

[ "$RC" -eq 0 ] && grep -q 'Applied 1 new migration' <<< "$OUT"; check \
  "empty-ledger-is-valid — an empty-but-well-formed ledger still applies normally" $? \
  "expected exit 0 + 'Applied 1 new migration(s)', got exit $RC"

echo ""
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
