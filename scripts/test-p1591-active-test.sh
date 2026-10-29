#!/bin/bash
# scripts/test-p1591-active-test.sh — hermetic canary for "migrations and tests follow the active TEST" (P1591).
#
#   A. resolver (flip-test-env.py active): selfhosted / hosted answer on stdout, exit 0;
#      unknown, missing and malformed files exit 2 with an EMPTY stdout (fail closed).
#   B. migrate.sh routing, with a PATH-stubbed toolbox and a stubbed self-hosted child:
#      self-hosted active -> only the self-hosted child runs, hosted tools never called;
#      hosted active / --env hosted-test -> hosted tools called, child never; --only on
#      self-hosted active -> refused; unknown/missing -> nothing runs. Controls: the probe sees
#      both kinds of call.
#   C. drift comparator: prod-only version flagged (exit 1), equal passes (0), empty side (2).
#   D. guard: passes on the current tree and on a copy; fails on a copy mutated with a new reader.
# No network, no database, no gcloud. The only files written are under a mktemp dir.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-p1591.XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT

FLIP="$REPO_ROOT/scripts/selfhosted/flip-test-env.py"
HOSTED_URL=$(python3 -c "import runpy,sys; print(runpy.run_path(sys.argv[1])['HOSTED_URL'])" "$FLIP")
SELF_URL=$(python3 -c "import runpy,sys; print(runpy.run_path(sys.argv[1])['SELF_URL'])" "$FLIP")
[ -n "$HOSTED_URL" ] && [ -n "$SELF_URL" ] || { echo "cannot read constants from $FLIP"; exit 1; }

mkdir -p "$TMPROOT/env"
printf 'VITE_SUPABASE_URL=%s\n' "$HOSTED_URL" > "$TMPROOT/env/hosted"
printf 'VITE_SUPABASE_URL=%s\nSELFHOSTED_TEST_ORIGIN=%s\n' "$SELF_URL" "$SELF_URL" > "$TMPROOT/env/selfhosted"
printf 'VITE_SUPABASE_URL=https://elsewhere.invalid\n' > "$TMPROOT/env/unknown"
printf 'VITE_SUPABASE_URL="%s"\n' "$HOSTED_URL" > "$TMPROOT/env/quoted"

echo "== A. resolver"
for CASE in selfhosted hosted; do
  OUT=$(python3 "$FLIP" active --file "$TMPROOT/env/$CASE" 2>/dev/null); RC=$?
  [ "$RC" -eq 0 ] && [ "$OUT" = "$CASE" ] && ok "active answers '$CASE'" || bad "active $CASE (rc=$RC out='$OUT')"
done
for CASE in unknown quoted missing; do
  OUT=$(python3 "$FLIP" active --file "$TMPROOT/env/$CASE" 2>"$TMPROOT/err"); RC=$?
  [ "$RC" -eq 2 ] && [ -z "$OUT" ] && [ -s "$TMPROOT/err" ] && ok "$CASE: exit 2, empty stdout, reason on stderr" || bad "$CASE (rc=$RC out='$OUT')"
done
OUT=$(python3 "$FLIP" active --flie "$TMPROOT/env/hosted" 2>/dev/null); RC=$?
[ "$RC" -eq 2 ] && [ -z "$OUT" ] && ok "typo'd flag never falls through to the shared file" || bad "typo flag (rc=$RC)"

echo "== B. migrate.sh routing"
STUBS="$TMPROOT/stubs"; CALLS="$TMPROOT/calls.log"; mkdir -p "$STUBS"
for TOOL in npx supabase curl psql security node osascript gcloud; do
  printf '#!/bin/bash\necho "HOSTED-TOOL %s $*" >> "%s"\nexit 1\n' "$TOOL" "$CALLS" > "$STUBS/$TOOL"
done
chmod +x "$STUBS"/*
P="$TMPROOT/repo"
mkdir -p "$P/scripts" "$P/supabase/migrations"
cp "$REPO_ROOT/scripts/migrate.sh" "$P/scripts/migrate.sh"
cp -R "$REPO_ROOT/scripts/lib" "$P/scripts/lib"
cp -R "$REPO_ROOT/scripts/selfhosted" "$P/scripts/selfhosted"
cp "$REPO_ROOT/scripts/keyring.sh" "$P/scripts/keyring.sh"
printf '#!/bin/bash\necho "SELFHOSTED-CHILD $*" >> "%s"\nexit 0\n' "$CALLS" > "$P/scripts/selfhosted/migrate.sh"
printf 'import sys\nopen(%s, "a").write("HOSTED-TOOL keychain\\n")\nsys.exit(1)\n' "'$CALLS'" > "$P/scripts/lib/keychain.py"
printf '#!/bin/bash\necho "stamp $*" >> "%s"\nexit 0\n' "$CALLS" > "$P/scripts/stamp-deploy-manifest.sh"
chmod +x "$P/scripts"/*.sh "$P/scripts/selfhosted/migrate.sh"
echo "select 'PENDING_BODY';" > "$P/supabase/migrations/20990101000000_pending.sql"
echo '{"prod":{"migrations":[]},"test":{"migrations":[]}}' > "$P/supabase/deploy-manifest.json"
{
  printf 'SUPABASE_DB_URL=postgres'; printf 'ql://postgres:%s@%s\n' "canary-not-a-credential" "db.invalid.example:5432/postgres"
  printf 'VITE_SUPABASE_URL=https://fakeprojectref.supabase.co\n'
  printf 'SUPABASE_TEST_WRITE_TOKEN=%s\n' "sbp-canary-not-a-token"
} > "$P/.env.local"
git -C "$P" init -q; git -C "$P" config user.email t@example.invalid; git -C "$P" config user.name t
git -C "$P" add scripts supabase; git -C "$P" commit -q -m init

run() { # run <state-file|none> <args...>
  local ST="$1"; shift
  : > "$CALLS"
  if [ "$ST" = none ]; then ST="$TMPROOT/env/missing"; else ST="$TMPROOT/env/$ST"; fi
  (cd "$P" && CP_ACTIVE_TEST_FILE="$ST" PATH="$STUBS:$PATH" bash "$P/scripts/migrate.sh" "$@" > "$TMPROOT/out" 2> "$TMPROOT/err")
  RC=$?; OUT="$(cat "$TMPROOT/out")"; ERR="$(cat "$TMPROOT/err")"; RAN="$(cat "$CALLS")"
}
has_hosted() { printf '%s' "$RAN" | grep -q 'HOSTED-TOOL'; }
has_child()  { printf '%s' "$RAN" | grep -q 'SELFHOSTED-CHILD'; }

run selfhosted --list
{ has_child && ! has_hosted && printf '%s' "$RAN" | grep -q -- '--env selfhosted --list'; } \
  && ok "selfhosted active, --list: only the self-hosted child ran, hosted tools never called" || bad "selfhosted --list (rc=$RC ran='$RAN')"
run selfhosted
{ has_child && ! has_hosted; } && ok "selfhosted active, plain run: hosted untouched" || bad "selfhosted plain (ran='$RAN')"
run hosted --list
{ [ "$RC" -ne 0 ] && ! has_child && printf '%s' "$ERR" | grep -q 'unknown argument'; } \
  && ok "hosted active: --list stays a self-hosted-only flag (usage error)" || bad "hosted --list (rc=$RC)"
run hosted
{ has_hosted && ! has_child; } && ok "control: hosted active, plain run reaches the hosted tools, not the child" || bad "hosted plain (ran='$RAN')"
run selfhosted --env hosted-test
{ has_hosted && ! has_child; } && ok "--env hosted-test reaches the hosted path even while self-hosted is active" || bad "hosted-test (ran='$RAN')"
run selfhosted --env selfhosted --list
{ has_child && ! has_hosted; } && ok "explicit --env selfhosted unchanged" || bad "explicit selfhosted (ran='$RAN')"
run selfhosted --only 20990101000000_pending.sql
{ [ "$RC" -ne 0 ] && [ -z "$RAN" ] && printf '%s' "$ERR" | grep -q 'REFUSED' && printf '%s' "$ERR" | grep -q 'hosted-test'; } \
  && ok "--only with self-hosted active: refused, names --env hosted-test, nothing ran" || bad "--only refusal (rc=$RC ran='$RAN' err='$ERR')"
for ST in unknown none quoted; do
  run "$ST"
  { [ "$RC" -ne 0 ] && [ -z "$RAN" ]; } && ok "state '$ST': exit non-zero, no tool and no child ran (fail closed)" || bad "state $ST (rc=$RC ran='$RAN')"
done
run unknown --env prod --help
[ "$RC" -eq 0 ] && ok "prod/help path does not need the resolver" || bad "prod help (rc=$RC)"

echo "== C. drift comparator"
D="$REPO_ROOT/scripts/check-test-drift.sh"
printf '1\n2\n3\n' > "$TMPROOT/p_equal"; printf '1\n2\n3\n' > "$TMPROOT/t_equal"
printf '1\n2\n3\n4\n' > "$TMPROOT/p_more"
printf '1\n2\n3\n9\n' > "$TMPROOT/t_extra"
: > "$TMPROOT/empty"
"$D" --prod-file "$TMPROOT/p_equal" --test-file "$TMPROOT/t_equal" > /dev/null 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "equal lists pass (exit 0)" || bad "equal (rc=$RC)"
"$D" --prod-file "$TMPROOT/p_more" --test-file "$TMPROOT/t_equal" > "$TMPROOT/o" 2>&1; RC=$?
{ [ "$RC" -eq 1 ] && grep -q -- '- 4' "$TMPROOT/o"; } && ok "prod-only version flagged (exit 1, names it)" || bad "prod-only (rc=$RC)"
mkdir -p "$TMPROOT/mig" && : > "$TMPROOT/mig/4_has_file.sql"
printf '1\n2\n3\n4\n5\n' > "$TMPROOT/p_legacy"
"$D" --prod-file "$TMPROOT/p_legacy" --test-file "$TMPROOT/t_equal" --migrations-dir "$TMPROOT/mig" > "$TMPROOT/o" 2>&1; RC=$?
{ [ "$RC" -eq 1 ] && grep -q -- '- 4' "$TMPROOT/o" && ! grep -q -- '- 5' "$TMPROOT/o"; } && ok "migrations-dir: version with a file flagged, legacy row without one ignored" || bad "migrations-dir filter (rc=$RC)"
printf '1\n2\n3\n5\n' > "$TMPROOT/p_legacy_only"
"$D" --prod-file "$TMPROOT/p_legacy_only" --test-file "$TMPROOT/t_equal" --migrations-dir "$TMPROOT/mig" > /dev/null 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "migrations-dir: only legacy prod rows is not drift" || bad "legacy only (rc=$RC)"
"$D" --prod-file "$TMPROOT/p_equal" --test-file "$TMPROOT/t_extra" > /dev/null 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "test-only extra version is not drift" || bad "test extra (rc=$RC)"
"$D" --prod-file "$TMPROOT/p_equal" --test-file "$TMPROOT/empty" > /dev/null 2>&1; RC=$?
[ "$RC" -eq 2 ] && ok "empty TEST list: exit 2, never read as nothing applied" || bad "empty test (rc=$RC)"
"$D" --prod-file "$TMPROOT/p_equal" > /dev/null 2>&1; RC=$?
[ "$RC" -eq 2 ] && ok "one file alone is a usage error" || bad "single file (rc=$RC)"

echo "== D. guard"
G="$REPO_ROOT/scripts/check-hosted-test-readers.sh"
"$G" > "$TMPROOT/o" 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "current tree passes" || { bad "current tree (rc=$RC)"; cat "$TMPROOT/o"; }
M="$TMPROOT/mut"; mkdir -p "$M/src/tests"
cp -R "$REPO_ROOT/scripts" "$M/scripts"; cp -R "$REPO_ROOT/e2e" "$M/e2e"; cp "$REPO_ROOT/playwright.config.ts" "$M/"
"$M/scripts/check-hosted-test-readers.sh" > "$TMPROOT/o" 2>&1; RC=$?
[ "$RC" -eq 0 ] && ok "control: unmutated tree copy passes (non-git find mode)" || { bad "copy control (rc=$RC)"; cat "$TMPROOT/o"; }
printf 'const url = "%s";\n' "$HOSTED_URL" > "$M/scripts/brand-new-reader.mjs"
"$M/scripts/check-hosted-test-readers.sh" > "$TMPROOT/o" 2>&1; RC=$?
{ [ "$RC" -eq 1 ] && grep -q 'brand-new-reader.mjs' "$TMPROOT/o"; } && ok "new file with the hosted ref fails the guard" || bad "ref mutation (rc=$RC)"
rm "$M/scripts/brand-new-reader.mjs"
printf 'const k = process.env.%s%s;\n' "HOSTED" "_TEST_ANON_KEY" > "$M/scripts/brand-new-reader2.mjs"
"$M/scripts/check-hosted-test-readers.sh" > "$TMPROOT/o" 2>&1; RC=$?
[ "$RC" -eq 1 ] && ok "new file reading a hosted-TEST variable fails the guard" || bad "var mutation (rc=$RC)"

echo ""
echo "p1591: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
