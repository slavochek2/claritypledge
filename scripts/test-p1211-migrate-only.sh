#!/bin/bash
# scripts/test-p1211-migrate-only.sh — hermetic canary for migrate.sh --only (P1211).
#
#   A. Deadlock (Gemini F1). A tree with one client-safe pending file and one coupled
#      to a frontend commit not yet on origin/main. The whole-tree prod run refuses
#      everything (control). --only <client-safe> applies exactly that file.
#   B. --only naming the coupled file is still blocked by gate 2.
#   C. Blob mismatch: a working-tree edit to a listed file refuses, nothing applied.
#   D. Untracked listed file refuses; a path-shaped argument refuses.
#   E. Test env: --only skips `supabase db push` (which applies every pending file).
#   F. What reaches the database is the committed blob, byte for byte.
#   G. An "already exists" SQL error is a failure on prod and under --only, and records
#      no ledger row (the schema gate trusts that row). Test env keeps the heuristic.
#   H. --only stops at the first failure.
#   I. On prod / --only only a JSON array counts as success (an error object without a
#      "message" key used to pass and have its ledger row written).
#
# Same harness as test-p1174-pending-set-integrity.sh: throwaway repo, real migrate.sh
# and scripts/lib, PATH-stubbed curl/npx/security, stubbed keychain. No network.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAL_MIGRATE="$REPO_ROOT/scripts/migrate.sh"
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-p1211-only.XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT

STUBS="$TMPROOT/stubs"
mkdir -p "$STUBS"
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"
cat > "$STUBS/npx" <<'STUB'
#!/bin/bash
# If --only ever reaches the CLI path, record it: db push would apply everything.
echo "npx $*" >> "${NPX_LOG:-/dev/null}"
echo "failed to connect: Tenant or user not found"
exit 1
STUB
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
  [ -n "${INSERT_LOG:-}" ] && printf '%s\n' "$PAYLOAD" >> "$INSERT_LOG"
  exit 0
fi
if printf '%s' "$PAYLOAD" | grep -q 'OBJECT_BODY'; then
  printf '%s\n200' '{"code":"sql_failed","details":"no message key"}'
  exit 0
fi
if printf '%s' "$PAYLOAD" | grep -q 'ALREADY_EXISTS_BODY'; then
  printf '%s\n400' '{"message":"ERROR: 42P07: relation \"x\" already exists"}'
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

# build <name> <env> — repo with: init (origin/main) then a frontend commit that is
# NOT on origin/main, then the two pending migrations committed on top.
build() {
  local NAME="$1" ENV_VAL="$2"
  local P="$TMPROOT/$NAME"
  mkdir -p "$P/scripts" "$P/supabase/migrations"
  cp "$REAL_MIGRATE" "$P/scripts/migrate.sh"
  cp -R "$REPO_ROOT/scripts/lib" "$P/scripts/lib"
  cp "$REPO_ROOT/scripts/keyring.sh" "$P/scripts/keyring.sh"
  printf 'import sys\nif len(sys.argv) >= 3 and sys.argv[1] == "get":\n    sys.stdout.write("sbp-canary-not-a-token"); sys.exit(0)\nsys.exit(1)\n' \
    > "$P/scripts/lib/keychain.py"
  printf '#!/bin/bash\nexit 0\n' > "$P/scripts/stamp-deploy-manifest.sh"
  printf '#!/usr/bin/env node\nprocess.exit(0);\n' > "$P/scripts/prod-smoke-test.mjs"
  chmod +x "$P/scripts"/*.sh
  echo "select 'applied already';" > "$P/supabase/migrations/20260101000000_old.sql"
  echo '{"prod":{"migrations":[]},"test":{"migrations":[]}}' > "$P/supabase/deploy-manifest.json"
  echo v1 > "$P/app.txt"
  git -C "$P" init -q
  git -C "$P" config user.email t@example.invalid
  git -C "$P" config user.name t
  git -C "$P" add scripts supabase app.txt
  git -C "$P" commit -q -m init
  git -C "$P" update-ref refs/remotes/origin/main HEAD
  echo v2 > "$P/app.txt"
  git -C "$P" add app.txt
  git -C "$P" commit -q -m frontend
  local FRONT; FRONT=$(git -C "$P" rev-parse HEAD)
  printf -- "-- client-safe: additive\nselect 'CLIENT_SAFE_BODY';\n" > "$P/supabase/migrations/20990101000000_cs.sql"
  printf -- "-- requires-frontend: %s\nselect 'COUPLED_BODY';\n" "${FRONT:0:12}" > "$P/supabase/migrations/20990102000000_cp.sql"
  git -C "$P" add supabase/migrations/20990101000000_cs.sql supabase/migrations/20990102000000_cp.sql
  git -C "$P" commit -q -m migrations
  local EF=".env.local"; [ "$ENV_VAL" = "prod" ] && EF=".env.prod"
  {
    printf 'SUPABASE_DB_URL=postgres'; printf 'ql://postgres:%s@%s\n' "canary-not-a-credential" "db.invalid.example:5432/postgres"
    printf 'VITE_SUPABASE_URL=https://fakeprojectref.supabase.co\n'
    printf 'SUPABASE_ACCESS_TOKEN=%s\n' "sbp-canary-not-a-token"
  } > "$P/$EF"
  printf '%s' '[{"version":"20260101000000","name":"old"}]' > "$P/ledger.json"
}

run() { # run <name> <args...>
  local P="$TMPROOT/$1"; shift
  (cd "$P" && FAKE_LEDGER="$P/ledger.json" APPLY_LOG="$P/applied.log" NPX_LOG="$P/npx.log" INSERT_LOG="$P/insert.log" \
     PATH="$STUBS:$PATH" bash "$P/scripts/migrate.sh" "$@" > "$P/out.log" 2>&1)
  RC=$?
  OUTF="$P/out.log"; APPLIED="$(cat "$P/applied.log" 2>/dev/null || true)"
}

echo "== A. deadlock"
build a prod
run a --env prod --yes
if [ "$RC" -ne 0 ] && grep -q "coupled to undeployed frontend" "$OUTF" && [ -z "$APPLIED" ]; then
  ok "control: whole-tree prod run refuses everything (the deadlock)"
else bad "control: whole-tree run exit $RC, applied: $APPLIED"; fi
run a --env prod --only 20990101000000_cs.sql --yes
if [ "$RC" -eq 0 ] && printf '%s' "$APPLIED" | grep -q CLIENT_SAFE_BODY && ! printf '%s' "$APPLIED" | grep -q COUPLED_BODY; then
  ok "--only client-safe applies exactly that file (exit 0)"
else bad "--only client-safe: exit $RC, applied: $APPLIED; $(tail -5 "$OUTF")"; fi

echo "== B. gate 2 still guards a listed coupled file"
build b prod
run b --env prod --only 20990102000000_cp.sql --yes
if [ "$RC" -ne 0 ] && grep -q "BLOCKED" "$OUTF" && [ -z "$APPLIED" ]; then
  ok "--only coupled file blocked by gate 2 (exit $RC)"
else bad "--only coupled: exit $RC, applied: $APPLIED"; fi

echo "== C. blob mismatch"
build c prod
echo "drop table everything;" >> "$TMPROOT/c/supabase/migrations/20990101000000_cs.sql"
run c --env prod --only 20990101000000_cs.sql --yes
if [ "$RC" -ne 0 ] && grep -q "differs from its blob" "$OUTF" && [ -z "$APPLIED" ]; then
  ok "working-tree edit refused, nothing applied (exit $RC)"
else bad "blob mismatch: exit $RC, applied: $APPLIED"; fi

echo "== D. untracked / path-shaped arguments"
build d prod
echo "select 1;" > "$TMPROOT/d/supabase/migrations/20990103000000_untracked.sql"
run d --env prod --only 20990103000000_untracked.sql --yes
if [ "$RC" -ne 0 ] && grep -q "not committed" "$OUTF" && [ -z "$APPLIED" ]; then
  ok "untracked listed file refused (exit $RC)"
else bad "untracked: exit $RC, applied: $APPLIED"; fi
run d --env prod --only ../20990101000000_cs.sql --yes
if [ "$RC" -ne 0 ] && grep -q "expected a versioned migration basename" "$OUTF"; then
  ok "path-shaped argument refused (exit $RC)"
else bad "path arg: exit $RC"; fi
run d --env prod --only --yes
if [ "$RC" -ne 0 ] && grep -q "at least one" "$OUTF"; then ok "empty --only refused (exit $RC)"; else bad "empty --only: exit $RC"; fi

echo "== E. test env skips the CLI"
build e local
run e --env local --only 20990101000000_cs.sql
if [ "$RC" -eq 0 ] && [ ! -s "$TMPROOT/e/npx.log" ] && printf '%s' "$APPLIED" | grep -q CLIENT_SAFE_BODY && ! printf '%s' "$APPLIED" | grep -q COUPLED_BODY; then
  ok "test --only: no db push, only the listed file (exit 0)"
else bad "test --only: exit $RC, npx: $(cat "$TMPROOT/e/npx.log" 2>/dev/null), applied: $APPLIED"; fi
run e --env local
if [ -s "$TMPROOT/e/npx.log" ]; then ok "control: test run without --only takes the CLI path"; else bad "control: CLI path not taken without --only"; fi

echo "== F. the committed blob is what is sent"
build f prod
P="$TMPROOT/f"
# Commit a new version of the file, then make the working tree match the OLD one: the
# check compares against --expect-sha, so pinning the old commit must send old bytes.
OLD=$(git -C "$P" rev-parse HEAD)
printf -- "-- client-safe: additive\nselect 'NEWER_BODY';\n" > "$P/supabase/migrations/20990101000000_cs.sql"
git -C "$P" add supabase/migrations/20990101000000_cs.sql; git -C "$P" commit -q -m newer
git -C "$P" show "$OLD:supabase/migrations/20990101000000_cs.sql" > "$P/supabase/migrations/20990101000000_cs.sql"
run f --env prod --only 20990101000000_cs.sql --expect-sha "$OLD" --yes
if [ "$RC" -eq 0 ] && printf '%s' "$APPLIED" | grep -q CLIENT_SAFE_BODY && ! printf '%s' "$APPLIED" | grep -q NEWER_BODY; then
  ok "--expect-sha pins the bytes sent"
else bad "expect-sha: exit $RC, applied: $APPLIED"; fi
run f --env prod --only 20990101000000_cs.sql --yes
if [ "$RC" -ne 0 ] && grep -q "differs from its blob" "$OUTF"; then
  ok "control: default HEAD sees the tree differs (exit $RC)"
else bad "control expect HEAD: exit $RC"; fi

echo "== G. 'already exists' is a failure on prod / --only (Codex #8)"
build g prod
P="$TMPROOT/g"
printf -- "-- client-safe: additive\nselect 'ALREADY_EXISTS_BODY';\n" > "$P/supabase/migrations/20990101000000_cs.sql"
git -C "$P" add supabase/migrations/20990101000000_cs.sql; git -C "$P" commit -q -m ae
run g --env prod --only 20990101000000_cs.sql --yes
if [ "$RC" -ne 0 ] && ! grep -q 20990101000000 "$P/insert.log" 2>/dev/null; then
  ok "prod --only: 'already exists' fails and records NO ledger row (exit $RC)"
else bad "already-exists prod: exit $RC, inserts: $(cat "$P/insert.log" 2>/dev/null)"; fi
build g2 local
P="$TMPROOT/g2"
printf -- "-- client-safe: additive\nselect 'ALREADY_EXISTS_BODY';\n" > "$P/supabase/migrations/20990101000000_cs.sql"
git -C "$P" add supabase/migrations/20990101000000_cs.sql; git -C "$P" commit -q -m ae
rm -f "$P/supabase/migrations/20990102000000_cp.sql"; git -C "$P" rm -q --cached supabase/migrations/20990102000000_cp.sql; git -C "$P" commit -q -m drop-cp
run g2 --env local
if grep -q 20990101000000 "$P/insert.log" 2>/dev/null; then
  ok "control: test env without --only keeps the old heuristic (row recorded)"
else bad "control test heuristic: exit $RC, inserts: $(cat "$P/insert.log" 2>/dev/null); $(tail -3 "$OUTF")"; fi

echo "== H. --only stops at the first failure"
build h prod
P="$TMPROOT/h"
printf -- "-- client-safe: additive\nselect 'ALREADY_EXISTS_BODY';\n" > "$P/supabase/migrations/20990100000000_first.sql"
git -C "$P" add supabase/migrations/20990100000000_first.sql; git -C "$P" commit -q -m first
run h --env prod --only 20990100000000_first.sql 20990101000000_cs.sql --yes
if [ "$RC" -ne 0 ] && ! printf '%s' "$APPLIED" | grep -q CLIENT_SAFE_BODY && grep -q "stopping after the first failure" "$OUTF"; then
  ok "second listed file not attempted after the first failed (exit $RC)"
else bad "stop-on-failure: exit $RC, applied: $APPLIED"; fi

echo "== I. HTTP 200 with a non-array body is a failure on prod / --only (Codex impl #8)"
build i prod
P="$TMPROOT/i"
printf -- "-- client-safe: additive\nselect 'OBJECT_BODY';\n" > "$P/supabase/migrations/20990101000000_cs.sql"
git -C "$P" add supabase/migrations/20990101000000_cs.sql; git -C "$P" commit -q -m obj
run i --env prod --only 20990101000000_cs.sql --yes
if [ "$RC" -ne 0 ] && ! grep -q 20990101000000 "$P/insert.log" 2>/dev/null; then
  ok "error-shaped object without 'message' fails; no ledger row (exit $RC)"
else bad "object body: exit $RC, inserts: $(cat "$P/insert.log" 2>/dev/null)"; fi

echo ""
echo "test-p1211-migrate-only: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
