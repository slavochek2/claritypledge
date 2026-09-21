#!/bin/bash
# scripts/test-check-schema-ready.sh — hermetic canary for P1211 C1.
#
# Builds a throwaway git repo holding a copy of the real checker, its library and a
# fixture migrations tree, then runs the checker against a STUBBED prod ledger
# (CHECK_SCHEMA_READY_STUB_LEDGER). No network, no token.
#
# Every "passes" case has a paired control that must fail (spec AC "C1 unit canary"),
# and three mutants of the checker — version comparison, ancestor test, one-file-per-
# version rule — must each be killed by at least one case.
#
# Wired into pre-commit for changes to check-schema-ready.sh, lib/prod-ledger.sh or
# this file.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAL_CHECKER="$REPO_ROOT/scripts/check-schema-ready.sh"
REAL_LIB="$REPO_ROOT/scripts/lib/prod-ledger.sh"

TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-schema-ready.XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT
unset SUPABASE_READONLY_TOKEN GITHUB_ACTIONS

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

R="$TMPROOT/repo"
mkdir -p "$R/scripts/lib" "$R/supabase/migrations"
cd "$R" || exit 1
git init -q -b main .
git config user.email canary@example.invalid
git config user.name canary
cp "$REAL_CHECKER" scripts/check-schema-ready.sh
cp "$REAL_LIB" scripts/lib/prod-ledger.sh

M=supabase/migrations
cat > "$M/.schema-gate-exempt" <<'EOF'
# fixture
legacy p63_google_oauth_avatar.sql : fixture legacy
dup-pair 20260223_a.sql 20260223_b.sql : fixture grandfathered pair
EOF
echo "select 1;" > "$M/20260101000000_one.sql"
echo "select 1;" > "$M/p63_google_oauth_avatar.sql"
echo "select 1;" > "$M/20260223_a.sql"
echo "select 1;" > "$M/20260223_b.sql"
printf -- '-- requires-frontend: abcdef1\nselect 1;\n' > "$M/20260102000000_mk.sql"
echo "app v1" > app.txt
git add scripts/check-schema-ready.sh scripts/lib/prod-ledger.sh "$M/.schema-gate-exempt" "$M"/*.sql app.txt
git commit -q -m base
BASE=$(git rev-parse HEAD)

LEDGER="$TMPROOT/ledger.json"
printf '%s' '[{"version":"20260101000000","total":3},{"version":"20260223","total":3},{"version":"20260102000000","total":3}]' > "$LEDGER"

# run <label-for-log> <args...> — sets RC and OUT (stdout) / ERR (stderr)
CHECKER="$R/scripts/check-schema-ready.sh"
run() {
  OUT=$(CHECK_SCHEMA_READY_STUB_LEDGER="${STUB:-$LEDGER}" bash "$CHECKER" "$@" 2>"$TMPROOT/err")
  RC=$?
  ERR=$(cat "$TMPROOT/err")
}
expect() { # expect <name> <rc> [stdout-substring]
  if [ "$RC" -eq "$2" ] && { [ -z "${3:-}" ] || printf '%s' "$OUT" | grep -qF "$3"; }; then
    ok "$1 (exit $RC)"
  else
    bad "$1 — expected exit $2${3:+ with '$3'}, got $RC; stdout: $OUT; stderr: $(printf '%s' "$ERR" | tail -3)"
  fi
}

# commit_on <parent> <message> <file=content>... — commit without moving any branch
commit_on() {
  local parent="$1" msg="$2"; shift 2
  git checkout -q --detach "$parent"
  local kv
  for kv in "$@"; do
    printf '%s\n' "${kv#*=}" > "${kv%%=*}"
    git add "${kv%%=*}"
  done
  git commit -q -m "$msg"
  git rev-parse HEAD
}

echo "== fixture commits"
FAB=$(commit_on "$BASE" fabricated "$M/20990101000000_fab.sql=select 1;")
FRONT=$(commit_on "$BASE" frontend "app.txt=app v2")
COUPLED=$(commit_on "$FRONT" coupled "$M/20990102000000_c.sql=-- requires-frontend: ${FRONT:0:12}
select 1;")
ZERO=$(commit_on "$BASE" zero "$M/20990103000000_z.sql=-- requires-frontend: 0000000
select 1;")
MALF=$(commit_on "$BASE" malformed "$M/20990104000000_m.sql=-- requires-frontend: not-a-sha
select 1;")
SIDE=$(commit_on "$BASE" side "app.txt=side branch")
STRAY=$(commit_on "$BASE" stray "$M/20990105000000_s.sql=-- requires-frontend: ${SIDE:0:12}
select 1;")
DUP=$(commit_on "$BASE" dup "$M/20260223_x.sql=select 1;")
DOCS=$(commit_on "$BASE" docs "README.md=docs only")
git checkout -q --detach "$BASE"
git rm -q "$M/.schema-gate-exempt"
printf '%s\n' 'dup-pair 20260223_a.sql 20260223_b.sql : fixture grandfathered pair' > "$M/.schema-gate-exempt"
git add "$M/.schema-gate-exempt"; git commit -q -m "exempt without p63"
NOLEGACY=$(git rev-parse HEAD)
EDIT=$(commit_on "$BASE" edit-applied "$M/20260101000000_one.sql=select 2; -- edited after apply")
EDITMK=$(commit_on "$BASE" edit-marked "$M/20260102000000_mk.sql=-- requires-frontend: abcdef2
select 1;")
git checkout -q --detach "$BASE"; git mv "$M/20260101000000_one.sql" "$M/20260101000000_renamed.sql"
echo "select 3;" > "$M/20260101000000_renamed.sql"; git add "$M/20260101000000_renamed.sql"; git commit -q -m rename-changed
RENCHG=$(git rev-parse HEAD)
git checkout -q --detach "$BASE"; git mv "$M/20260101000000_one.sql" "$M/20260101000000_renamed.sql"; git commit -q -m rename-same
RENSAME=$(git rev-parse HEAD)
git checkout -q --detach "$BASE"; git rm -q scripts/check-schema-ready.sh; git commit -q -m "delete checker"
NOCHECKER=$(git rev-parse HEAD)
SELFEX=$(commit_on "$BASE" self-exempt "$M/zz_new.sql=select 1;" \
  "$M/.schema-gate-exempt=legacy p63_google_oauth_avatar.sql : fixture legacy
legacy zz_new.sql : exempting myself
dup-pair 20260223_a.sql 20260223_b.sql : fixture grandfathered pair")

echo "== cases"
run --sha "$BASE" --base "$BASE";                 expect "applied tree"                                 0
run --sha "$FAB" --base "$BASE";                  expect "fabricated 2099 file"                          1 "pending 20990101000000_fab.sql"
run --sha "$COUPLED" --base "$BASE";              expect "coupled, frontend in this push"                0
run --sha "$COUPLED" --base "$FRONT";             expect "control: frontend already on base"             1 "overdue-coupled 20990102000000_c.sql"
run --sha "$ZERO" --base "$BASE";                 expect "marker 0000000"                                1 "invalid-marker 20990103000000_z.sql"
run --sha "$MALF" --base "$BASE";                 expect "malformed marker"                              1 "invalid-marker 20990104000000_m.sql"
run --sha "$STRAY" --base "$BASE";                expect "marker on neither base nor push"               1 "invalid-marker 20990105000000_s.sql"
run --sha "$BASE" --base "$BASE" --trusted-ref "$BASE";      expect "p63 exempt via trusted file"         0
run --sha "$BASE" --base "$BASE" --trusted-ref "$NOLEGACY";  expect "control: p63 line removed"           2
run --sha "$DUP" --base "$BASE";                  expect "new file on an allowlisted version"            2
run --sha "$SELFEX" --base "$BASE" --trusted-ref "$BASE";    expect "exempt edit only in checked SHA: ignored" 2
run --sha "$SELFEX" --base "$BASE" --trusted-ref "$SELFEX";  expect "control: same edit on trusted ref"   0
run --sha "$EDIT" --base "$BASE";                 expect "applied migration edited in place"             2
if printf '%s' "$ERR" | grep -q "edit will never run"; then ok "  ...named as an in-place edit"; else bad "  ...not named: $ERR"; fi
run --sha "$EDITMK" --base "$BASE";               expect "control: edit to a marker-bearing file allowed (P1106 repair)" 0
run --sha "$RENCHG" --base "$BASE";               expect "rename with changed SQL on an applied version"  2
run --sha "$RENSAME" --base "$BASE";              expect "control: pure rename, identical SQL"            0
run --sha "$BASE" --base "$BASE" --trusted-ref "$NOCHECKER"; expect "checker deleted from trusted ref: no bootstrap, fail closed" 2
if printf '%s' "$ERR" | grep -q "has been removed"; then ok "  ...named as removal"; else bad "  ...not named: $ERR"; fi
STALE=$(commit_on "$COUPLED" docs-on-stale "README.md=docs only, on top of a base that is already overdue")
run --sha "$STALE" --base "$COUPLED";             expect "stale: base carries an overdue coupled migration, docs-only range" 1 "overdue-coupled 20990102000000_c.sql"
run --sha "$COUPLED" --base "$BASE" --post;       expect "--post: coupled now due"                       3 "due 20990102000000_c.sql"
run --sha "$FAB" --base "$BASE" --post;           expect "--post: plain pending is not 'due'"            1 "pending 20990101000000_fab.sql"

echo "UNREACHABLE" > "$TMPROOT/unreach"
STUB="$TMPROOT/unreach" run --sha "$FAB" --base "$BASE";   expect "unreachable + range touches migrations" 2
STUB="$TMPROOT/unreach" run --sha "$DOCS" --base "$BASE";  expect "unreachable + migration-free range"      0
if printf '%s' "$ERR" | grep -q "tree check was SKIPPED"; then ok "  ...and it warned"; else bad "  ...no skip warning: $ERR"; fi
printf '%s' '{"message":"boom"}' > "$TMPROOT/errobj"
STUB="$TMPROOT/errobj" run --sha "$FAB" --base "$BASE";    expect "2xx error object is unreachable, not empty" 2
printf '%s' '[{"version":"20260101000000","total":4},{"version":"20260223","total":4},{"version":"20260102000000","total":4}]' > "$TMPROOT/trunc"
STUB="$TMPROOT/trunc" run --sha "$FAB" --base "$BASE";     expect "truncated ledger (count != total)"      2
if printf '%s' "$ERR" | grep -q "truncated response"; then ok "  ...named as truncation"; else bad "  ...truncation not named: $ERR"; fi
printf '%s' '[]' > "$TMPROOT/empty"
STUB="$TMPROOT/empty" run --sha "$FAB" --base "$BASE";     expect "empty ledger is refused, not 'nothing applied'" 2
GITHUB_ACTIONS=true run --sha "$BASE" --base "$BASE";      expect "stub refused inside GitHub Actions"      0
# ^ BASE touches no migration relative to itself, so an unreachable ledger passes with a
#   warning; what matters is that the stub was NOT honoured:
if printf '%s' "$ERR" | grep -q "refusing"; then ok "  ...stub refused"; else bad "  ...stub was honoured in CI: $ERR"; fi

# Working-tree independence: an uncommitted edit must not change the answer.
git checkout -q --detach "$FAB"
rm "$M/20990101000000_fab.sql"
run --sha "$FAB" --base "$BASE";                  expect "working-tree deletion does not hide a committed file" 1 "pending"
git checkout -q -- "$M"

echo "== mutants (each must be killed)"
mutant() { # mutant <name> <python-replace-old> <new> <case-args...> -- expected rc of the UNMUTATED case
  local name="$1" old="$2" new="$3" want="$4"; shift 4
  cp "$REAL_CHECKER" "$TMPROOT/mut.sh"
  python3 - "$TMPROOT/mut.sh" "$old" "$new" <<'PY' || { bad "mutant $name: pattern not found"; return; }
import sys
p, old, new = sys.argv[1:4]
s = open(p).read()
if old not in s:
    sys.exit(1)
open(p, "w").write(s.replace(old, new))
PY
  local saved="$CHECKER"; CHECKER="$TMPROOT/mut.sh"
  run "$@"
  CHECKER="$saved"
  if [ "$RC" -ne "$want" ]; then ok "mutant killed: $name (exit $RC, want $want)"; else bad "mutant SURVIVED: $name"; fi
}
mutant "drop version comparison" 'grep -qxF "$V" && continue' 'true && continue' 1 --sha "$FAB" --base "$BASE"
mutant "drop base-ancestor test" 'elif git merge-base --is-ancestor "$FULL" "$BASE"' 'elif false' 1 --sha "$COUPLED" --base "$FRONT"
mutant "drop push-ancestor test" 'elif git merge-base --is-ancestor "$FULL" "$SHA"' 'elif true' 1 --sha "$STRAY" --base "$BASE"
mutant "drop edited-in-place check" '[ "$OB" != "$NB" ] || continue' 'false || continue' 2 --sha "$EDIT" --base "$BASE"
mutant "drop one-file rule" 'grep -qxF "${V}	${MEMBERS}"' 'true' 2 --sha "$DUP" --base "$BASE"

echo ""
echo "test-check-schema-ready: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
