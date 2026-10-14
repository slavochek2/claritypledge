#!/bin/bash
# scripts/test-p1492-migrate-args.sh — hermetic canary for migrate.sh argument parsing (P1492).
#
# migrate.sh used to drop any argument it did not recognise (`*) shift`), so
# `./scripts/migrate.sh --help` was a normal invocation and started a real apply against
# the test DB. Every refusal below must happen BEFORE anything runs.
#
#   A. -h / --help print usage on stdout, exit 0, run nothing (also after other flags).
#   B. Unknown flags, stray positionals, an unknown --env value and a flag missing its
#      value exit non-zero with usage on stderr and run nothing.
#   C. Controls: valid test runs DO reach the stubbed CLI, and a prod run reaches the
#      STUBBED keychain helper (never the real dialog) — proves the "nothing ran" probe
#      can see a run, so its silence in A/B means something.
#
# "Nothing ran" = no stubbed tool (npx, supabase, curl, psql, security, node, osascript,
# the keychain helper) was invoked
# AND the throwaway repo's working tree is unchanged (no ledger / manifest stamp). Same
# harness shape as test-p1211-migrate-only.sh: throwaway repo, real migrate.sh and
# scripts/lib, PATH-stubbed tools. No network, no database.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAL_MIGRATE="$REPO_ROOT/scripts/migrate.sh"
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-p1492-args.XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT

STUBS="$TMPROOT/stubs"
CALLS="$TMPROOT/calls.log"
mkdir -p "$STUBS"
for TOOL in npx supabase curl psql security node osascript; do
  printf '#!/bin/bash\necho "%s $*" >> "%s"\nexit 1\n' "$TOOL" "$CALLS" > "$STUBS/$TOOL"
done
chmod +x "$STUBS"/*

P="$TMPROOT/repo"
mkdir -p "$P/scripts" "$P/supabase/migrations"
cp "$REAL_MIGRATE" "$P/scripts/migrate.sh"
cp -R "$REPO_ROOT/scripts/lib" "$P/scripts/lib"
cp "$REPO_ROOT/scripts/keyring.sh" "$P/scripts/keyring.sh"
# The keychain helper MUST be stubbed: the real one opens a macOS keychain dialog, rings the
# terminal bell and posts a notification on a prod run. A pre-fix migrate.sh reaches it from
# `--env prod --help`, so without this stub the fail-first run lands on the founder's screen.
printf 'import sys\nopen(%s, "a").write("keychain " + " ".join(sys.argv[1:]) + "\\n")\nsys.exit(1)\n' \
  "'$CALLS'" > "$P/scripts/lib/keychain.py"
printf '#!/bin/bash\necho "stamp $*" >> "%s"\nexit 0\n' "$CALLS" > "$P/scripts/stamp-deploy-manifest.sh"
chmod +x "$P/scripts"/*.sh
echo "select 'PENDING_BODY';" > "$P/supabase/migrations/20990101000000_pending.sql"
echo '{"prod":{"migrations":[]},"test":{"migrations":[]}}' > "$P/supabase/deploy-manifest.json"
{
  printf 'SUPABASE_DB_URL=postgres'; printf 'ql://postgres:%s@%s\n' "canary-not-a-credential" "db.invalid.example:5432/postgres"
  printf 'VITE_SUPABASE_URL=https://fakeprojectref.supabase.co\n'
  printf 'SUPABASE_TEST_WRITE_TOKEN=%s\n' "sbp-canary-not-a-token"
} > "$P/.env.local"
cp "$P/.env.local" "$P/.env.prod"
git -C "$P" init -q
git -C "$P" config user.email t@example.invalid
git -C "$P" config user.name t
git -C "$P" add scripts supabase
git -C "$P" commit -q -m init

run() { # run <args...> — sets RC, OUT (stdout), ERR (stderr), RAN (tool calls), DIRTY
  : > "$CALLS"
  (cd "$P" && PATH="$STUBS:$PATH" bash "$P/scripts/migrate.sh" "$@" > "$TMPROOT/out" 2> "$TMPROOT/err")
  RC=$?
  OUT="$(cat "$TMPROOT/out")"; ERR="$(cat "$TMPROOT/err")"; RAN="$(cat "$CALLS")"
  DIRTY="$(git -C "$P" status --porcelain --untracked-files=no)"
}

echo "== A. help prints usage only"
for ARGS in "--help" "-h" "--env prod --help" "--env prod --only 20990101000000_pending.sql -h"; do
  # shellcheck disable=SC2086  # deliberate word-split: ARGS is a fixed literal list
  run $ARGS
  if [ "$RC" -eq 0 ] && printf '%s' "$OUT" | grep -q '^Usage:' && [ -z "$RAN" ] && [ -z "$DIRTY" ] &&
     ! printf '%s' "$OUT" | grep -q '>>>'; then
    ok "migrate.sh $ARGS: usage, exit 0, nothing ran"
  else bad "migrate.sh $ARGS: exit $RC, ran: [$RAN], dirty: [$DIRTY], out: $(printf '%s' "$OUT" | head -3)"; fi
done

echo "== B. bad arguments are refused before anything runs"
for ARGS in "--bogus" "--yes --frobnicate" "prod" "--env prod extra" "--env staging" "--env" "--only 20990101000000_pending.sql --expect-sha"; do
  # shellcheck disable=SC2086
  run $ARGS
  if [ "$RC" -ne 0 ] && printf '%s' "$ERR" | grep -q 'Usage:' && [ -z "$RAN" ] && [ -z "$DIRTY" ] &&
     ! printf '%s%s' "$OUT" "$ERR" | grep -q '>>>'; then
    ok "migrate.sh $ARGS: refused (exit $RC), nothing ran"
  else bad "migrate.sh $ARGS: exit $RC, ran: [$RAN], dirty: [$DIRTY], err: $(printf '%s' "$ERR" | head -3)"; fi
done

echo "== B2. empty values and empty --only lists are refused at parse time (Codex review)"
# Separate calls, not the word-split loop above: an empty argument cannot survive word-splitting.
refused() { # refused <label> — asserts the last run() was a parse-time usage refusal
  if [ "$RC" -eq 2 ] && printf '%s' "$ERR" | grep -q 'Usage:' && [ -z "$RAN" ] && [ -z "$DIRTY" ] &&
     ! printf '%s%s' "$OUT" "$ERR" | grep -q '>>>'; then
    ok "$1: usage refusal (exit 2), nothing ran"
  else bad "$1: exit $RC, ran: [$RAN], dirty: [$DIRTY], out: $(printf '%s' "$OUT" | head -2) err: $(printf '%s' "$ERR" | head -2)"; fi
}
run --expect-sha "";                                        refused 'migrate.sh --expect-sha ""'
run --only 20990101000000_pending.sql --expect-sha "";      refused 'migrate.sh --only A.sql --expect-sha ""'
run --env "";                                               refused 'migrate.sh --env ""'
run --only;                                                 refused 'migrate.sh --only (no files)'
run --only --yes;                                           refused 'migrate.sh --only --yes'
run --env prod --only --yes;                                refused 'migrate.sh --env prod --only --yes'
run --only "";                                              refused 'migrate.sh --only ""'
# Each --only occurrence must add a file: a second, empty --only is refused even though
# the first one already filled the list (Codex final check).
run --only 20990101000000_pending.sql --only --yes;         refused 'migrate.sh --only A.sql --only --yes'

echo "== C. control: a valid run reaches the stubs"
run
if [ -n "$RAN" ]; then ok "control: no-argument test run invoked a stubbed tool ($(printf '%s' "$RAN" | head -1 | cut -c1-40))"
else bad "control: valid run invoked nothing — the 'nothing ran' probe is blind"; fi
run --env test
if [ -n "$RAN" ]; then ok "control: --env test is accepted and runs"
else bad "control: --env test invoked nothing (exit $RC, err: $(printf '%s' "$ERR" | head -2))"; fi
run --env prod --yes
if printf '%s' "$RAN" | grep -q '^keychain get'; then ok "control: a prod run reaches the STUBBED keychain helper, not the real one"
else bad "control: prod run did not reach the keychain stub (ran: [$RAN]) — a real dialog could be what it hits"; fi

echo
echo "P1492 migrate.sh args: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
