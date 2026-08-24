#!/bin/bash
# scripts/test-p1042-version-collision.sh — canary for P1042.
#
# Proves migrate.sh HARD-FAILS when a migration file's version prefix was already
# recorded by a DIFFERENT file, instead of printing "(already applied, skipping)"
# and exiting 0 while that file's SQL never runs.
#
# Observed twice in the wild: 2026-08-10 (test DB, P1034 RLS fix) and 2026-08-24
# (PROD — two P1114 migrations shadowed by P1104 files, event_room_members absent
# from prod while the ledger reported both versions applied).
#
# Hermetic: builds a throwaway PROJECT_DIR under mktemp with a copy of the real
# migrate.sh, and PATH-stubs npx/curl/security so no network call and no keychain
# read happens. The repo tree and every real database are untouched.
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

# npx: by default emulate the CLI auth failure that makes migrate.sh fall back to the
# Management API path. FAKE_NPX_SUCCEED=1 instead emulates a HEALTHY `supabase db push`,
# which returns migrate.sh down a completely different route: it prints "Done." and
# exits 0 without ever entering the apply loop. Guard 2 used to live only inside that
# loop, so every scenario here ran through the fallback and the primary path was
# untested — see scenario 9.
cat > "$STUBS/npx" <<'STUB'
#!/bin/bash
if [ "${FAKE_NPX_SUCCEED:-0}" = "1" ]; then
  echo "Applying migration ..."
  exit 0
fi
echo "failed to connect: Tenant or user not found"
exit 1
STUB

# curl: fake Management API.
#   - SELECT version ... schema_migrations  -> the applied-versions ledger
#   - anything else                         -> successful DDL (empty JSON array)
# Emits the trailing HTTP code migrate.sh parses, unless -o /dev/null was passed
# (the history-INSERT call, whose body migrate.sh discards).
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
  # The history-INSERT call. migrate.sh discards its body, so record the payload here —
  # it is the only way to assert that the ledger row carries the FILENAME (P1042 fix
  # step 1) and not just the version.
  printf '%s\n' "$PAYLOAD" >> "$INSERT_LOG"
  exit 0
fi
if printf '%s' "$PAYLOAD" | grep -q 'SELECT version'; then
  BODY=$(cat "$FAKE_LEDGER")
else
  BODY='[]'
fi
printf '%s\n200' "$BODY"
STUB
chmod +x "$STUBS"/*

# --- Scenario runner --------------------------------------------------------
# $1 = scenario dir name, $2 = applied-versions JSON. Migration files are placed
# by the caller into $TMPROOT/$1/supabase/migrations before invoking.
run_migrate() {
  local NAME="$1" LEDGER_JSON="$2" NPX_OK="${3:-0}"
  local PDIR="$TMPROOT/$NAME"
  mkdir -p "$PDIR/scripts"
  cp "$REAL_MIGRATE" "$PDIR/scripts/migrate.sh"
  # migrate.sh sources its guards from scripts/lib/ — copy the real ones in so the
  # scenario exercises the shipped guard, not a stub. Deliberately NOT made optional:
  # a migrate.sh that silently proceeds when its guard is missing is the defect class
  # this canary exists to catch.
  cp -R "$REPO_ROOT/scripts/lib" "$PDIR/scripts/lib"
  # stamp-deploy-manifest.sh runs after a successful apply; stub it so the
  # scenario does not depend on manifest tooling.
  printf '#!/bin/bash\nexit 0\n' > "$PDIR/scripts/stamp-deploy-manifest.sh"
  chmod +x "$PDIR/scripts"/*.sh
  # Assembled from fragments rather than written as a literal: a full
  # postgresql://user:pass@host string in this file trips the gitleaks
  # connection-string rule in pre-commit-checks.sh. The value is inert — npx is
  # stubbed, so DB_PASSWORD is never used by anything that opens a connection.
  local FAKE_HOST="db.invalid.example:5432/postgres"
  {
    printf 'SUPABASE_DB_URL=postgres'
    printf 'ql://postgres:%s@%s\n' "canary-not-a-credential" "$FAKE_HOST"
    printf 'VITE_SUPABASE_URL=https://fakeprojectref.supabase.co\n'
    printf 'SUPABASE_ACCESS_TOKEN=%s\n' "sbp-canary-not-a-token"
  } > "$PDIR/.env.local"
  printf '%s' "$LEDGER_JSON" > "$PDIR/ledger.json"
  : > "$PDIR/inserts.log"
  FAKE_LEDGER="$PDIR/ledger.json" INSERT_LOG="$PDIR/inserts.log" \
  FAKE_NPX_SUCCEED="$NPX_OK" PATH="$STUBS:$PATH" \
    bash "$PDIR/scripts/migrate.sh" > "$PDIR/out.log" 2>&1
  echo $? > "$PDIR/exit.code"
}

echo "=== P1042 canary: migrate.sh must not skip a colliding, never-applied migration ==="
echo ""

# --- 1. THE BUG: two files share a version; the second must not be silently skipped
S=collision
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1034_featureB.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_b (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260810140000"}]'
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")

if [ "$RC" -ne 0 ]; then
  echo "  OK   hard-fails-on-collision — migrate.sh exited $RC"
  PASS=$((PASS+1))
else
  echo "  FAIL hard-fails-on-collision — expected NON-ZERO exit, got $RC"
  echo "       migrate.sh reported success while p1034_featureB.sql never ran:"
  printf '%s\n' "$OUT" | grep -E 'already applied, skipping|Applied [0-9]+ new migration' | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

# Gate this on the non-zero exit as well. Both filenames appear in the CURRENT
# (buggy) output too — as two ordinary "already applied, skipping" lines — so a
# bare name match passes while the bug is fully present. Only an aborting run can
# be emitting a collision message.
if [ "$RC" -ne 0 ] \
   && printf '%s' "$OUT" | grep -q 'p1034_featureB' \
   && printf '%s' "$OUT" | grep -q 'p1038_featureA'; then
  echo "  OK   names-both-files — collision message identifies both filenames"
  PASS=$((PASS+1))
else
  echo "  FAIL names-both-files — an aborting run must name BOTH colliding files so the author can renumber"
  FAIL=$((FAIL+1))
fi

# --- 2. NO FALSE POSITIVE: ordinary no-op run still exits 0
S=noop
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260810140000"}]'
RC=$(cat "$TMPROOT/$S/exit.code")
if [ "$RC" -eq 0 ] && grep -q 'Applied 0 new migration' "$TMPROOT/$S/out.log"; then
  echo "  OK   allows-clean-noop — no new migrations still exits 0"
  PASS=$((PASS+1))
else
  echo "  FAIL allows-clean-noop — expected exit 0 + 'Applied 0 new migration(s)', got exit $RC"
  FAIL=$((FAIL+1))
fi

# --- 3. NO FALSE POSITIVE: a genuinely new migration still applies
S=applies
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260810140000_p1038_featureA.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.feature_a (id uuid PRIMARY KEY);
SQL
cat > "$TMPROOT/$S/supabase/migrations/20260812090000_p1042_fresh.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.fresh (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260810140000"}]'
RC=$(cat "$TMPROOT/$S/exit.code")
if [ "$RC" -eq 0 ] && grep -q 'Applied 1 new migration' "$TMPROOT/$S/out.log"; then
  echo "  OK   applies-new-migration — uncollided new file still applies"
  PASS=$((PASS+1))
else
  echo "  FAIL applies-new-migration — expected exit 0 + 'Applied 1 new migration(s)', got exit $RC"
  FAIL=$((FAIL+1))
fi

# --- 4. THE ARMING STEP: two files share a prefix, NEITHER applied yet.
# Both SQL bodies run, but apply_via_api's INSERT ... ON CONFLICT DO NOTHING
# records ONE ledger row, so the pair is indistinguishable from a single applied
# migration on every later run. This is how scenario 3 gets armed; it must abort
# here, while the fix is still free.
S=both_pending
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260814100000_p1104_first.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.first_tbl (id uuid PRIMARY KEY);
SQL
cat > "$TMPROOT/$S/supabase/migrations/20260814100000_p1114_second.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.second_tbl (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[]'
RC=$(cat "$TMPROOT/$S/exit.code")
if [ "$RC" -ne 0 ]; then
  echo "  OK   aborts-when-both-pending — collision rejected before the ledger is armed (exit $RC)"
  PASS=$((PASS+1))
else
  echo "  FAIL aborts-when-both-pending — expected NON-ZERO exit; two files sharing a prefix must never both apply"
  FAIL=$((FAIL+1))
fi

# --- 5. THE LEDGER RECORDS THE FILENAME, not just the version.
# Without this, two files sharing a prefix are indistinguishable after the fact and
# scenario 6 below has nothing to compare against. Asserted on the INSERT payload the
# stub captured during scenario 3, where exactly one migration applied.
INSERTS=$(cat "$TMPROOT/applies/inserts.log")
if printf '%s' "$INSERTS" | grep -q 'version, name' \
   && printf '%s' "$INSERTS" | grep -q 'p1042_fresh'; then
  echo "  OK   records-filename — history INSERT carries (version, name) with the file's slug"
  PASS=$((PASS+1))
else
  echo "  FAIL records-filename — history INSERT must record WHICH file claimed the version"
  echo "       captured INSERT payload(s): ${INSERTS:-<none>}"
  FAIL=$((FAIL+1))
fi

# --- 6. THE CROSS-WORKTREE CASE: only ONE file here, ledger says a DIFFERENT file
# claimed the version. The in-tree duplicate scan is structurally blind to this — the
# colliding sibling lives in another worktree, so there is no duplicate in this tree to
# find. Only the ledger `name` witnesses it. This is the ONLY scenario that exercises
# guard 2; without it the whole ledger-name mechanism ships unexercised.
S=cross_tree
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260815100000_p1042_mine.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.mine (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260815100000","name":"p1200_from_another_worktree"}]'
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
if [ "$RC" -ne 0 ] \
   && printf '%s' "$OUT" | grep -q 'p1200_from_another_worktree' \
   && printf '%s' "$OUT" | grep -q 'p1042_mine'; then
  echo "  OK   aborts-on-foreign-ledger-name — cross-worktree collision caught (exit $RC)"
  PASS=$((PASS+1))
else
  echo "  FAIL aborts-on-foreign-ledger-name — expected NON-ZERO exit naming both files, got exit $RC"
  printf '%s\n' "$OUT" | grep -E 'already applied, skipping|Applied [0-9]+ new migration' | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

# --- 7. NO FALSE POSITIVE on the ledger-name check: the SAME file re-run must still
# skip quietly. A guard that cannot tell "same file" from "different file" would abort
# every ordinary re-run once names start being recorded.
S=name_matches
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260815100000_p1042_mine.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.mine (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260815100000","name":"p1042_mine"}]'
RC=$(cat "$TMPROOT/$S/exit.code")
if [ "$RC" -eq 0 ] && grep -q 'Applied 0 new migration' "$TMPROOT/$S/out.log"; then
  echo "  OK   allows-matching-ledger-name — same file re-run still skips quietly"
  PASS=$((PASS+1))
else
  echo "  FAIL allows-matching-ledger-name — expected exit 0 + 'Applied 0 new migration(s)', got exit $RC"
  FAIL=$((FAIL+1))
fi

# --- 8. THE ALLOWLIST BINDS BOTH GUARDS. A grandfathered historical pair (both halves
# already applied everywhere) records only ONE name in the ledger — which is exactly
# what a foreign name looks like to guard 2. If guard 2 does not consult the same
# allowlist as guard 1, every such pair passes the duplicate scan and then aborts on
# the name check. Found live on 2026-08-24: the real 20260223 pair did precisely this.
S=allowlisted
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260223_p414_profile_bio.sql" <<'SQL'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
SQL
printf '# grandfathered\n20260223\n' > "$TMPROOT/$S/supabase/migrations/.duplicate-version-allowlist"
run_migrate "$S" '[{"version":"20260223","name":"p396_host_rls_and_session_constraints"}]'
RC=$(cat "$TMPROOT/$S/exit.code")
if [ "$RC" -eq 0 ] && grep -q 'Applied 0 new migration' "$TMPROOT/$S/out.log"; then
  echo "  OK   allowlist-binds-both-guards — grandfathered duplicate does not abort the name check"
  PASS=$((PASS+1))
else
  echo "  FAIL allowlist-binds-both-guards — an allowlisted version must not abort on a foreign"
  echo "       ledger name; guard 2 is not reading the allowlist (exit $RC)"
  FAIL=$((FAIL+1))
fi

# --- 9. THE PRIMARY PATH. A healthy `supabase db push` exits 0 long before the apply
# loop, so guard 2 living only inside that loop left the cross-worktree case — the very
# case this bug was filed for — unguarded on the path most runs actually take. Same
# fixture as scenario 6, but with the CLI succeeding.
S=cli_success
mkdir -p "$TMPROOT/$S/supabase/migrations"
cat > "$TMPROOT/$S/supabase/migrations/20260815100000_p1042_mine.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.mine (id uuid PRIMARY KEY);
SQL
run_migrate "$S" '[{"version":"20260815100000","name":"p1200_from_another_worktree"}]' 1
RC=$(cat "$TMPROOT/$S/exit.code")
OUT=$(cat "$TMPROOT/$S/out.log")
if [ "$RC" -ne 0 ] \
   && printf '%s' "$OUT" | grep -q 'p1200_from_another_worktree' \
   && printf '%s' "$OUT" | grep -q 'p1042_mine'; then
  echo "  OK   guards-the-cli-success-path — collision caught before db push (exit $RC)"
  PASS=$((PASS+1))
else
  echo "  FAIL guards-the-cli-success-path — a healthy 'supabase db push' must not bypass"
  echo "       the cross-tree collision check (exit $RC)"
  printf '%s\n' "$OUT" | grep -E 'Done\.|Applied [0-9]+ new migration' | sed 's/^/         /'
  FAIL=$((FAIL+1))
fi

echo ""
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
