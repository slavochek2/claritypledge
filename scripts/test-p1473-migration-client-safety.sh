#!/bin/bash
# scripts/test-p1473-migration-client-safety.sh — canary for the P1473 arms of
# scripts/check-migration-client-safety.sh (DROP FUNCTION; REVOKE ... FROM PUBLIC in a
# file that does not itself CREATE FUNCTION).
#
# Every control is built from a REAL migration in supabase/migrations (gate 7d), never
# only from a synthetic fixture — the synthetic cases live in src/tests/p887-reproduce.test.ts.
#
#   A. DROP FUNCTION. The P1058 seat migration passes as committed (it carries
#      requires-frontend). With its annotation stripped it must fail. A gate mutant
#      without the DROP FUNCTION arm lets the stripped copy through, so the arm is
#      what catches it, not one of the older shapes.
#   B. REVOKE ... FROM PUBLIC on an existing function. The P1104 name-guard migration
#      passes as committed (client-safe); stripped it must fail; a mutant without the
#      REVOKE-PUBLIC check lets it through. A copy with FROM PUBLIC wrapped onto its
#      own line must still fail (statement-level match).
#   C. False-positive guard. A real migration that creates a function and then
#      REVOKEs PUBLIC on it (no annotation) passes. A mutant without the
#      CREATE FUNCTION narrowing flags it, so the narrowing is load-bearing.
#   D. Census of the whole corpus (gate 7c). The REVOKE-PUBLIC arm flags no
#      unannotated real migration; nothing authored after the arms existed is flagged;
#      each arm fires on at least one real file (DROP FUNCTION on a legacy unannotated
#      file, REVOKE-PUBLIC on an annotated file once its annotation is stripped).
#
# Read-only against the repo: copies go to a mktemp dir. No network, no DB.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-migration-client-safety.sh"
MIG="$REPO_ROOT/supabase/migrations"
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/test-p1473.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# Real fixtures. A missing file fails the canary loudly rather than skipping.
DROP_REAL="$MIG/20260908114500_p1058_release_seat_requires_code.sql"
REVOKE_REAL="$MIG/20260825070000_p1104_revoke_anon_execute_on_name_guards.sql"
HARDEN_REAL="$MIG/20260415160000_p707_create_letter_delivery_rpc.sql"
for f in "$DROP_REAL" "$REVOKE_REAL" "$HARDEN_REAL"; do
  [ -f "$f" ] || { echo "  FAIL  fixture missing: $f"; exit 1; }
done

# Arms added after this date; anything authored on/after it went through them.
ARMS_SINCE=20261013000000

ANNOTATION='^[[:space:]]*-- (requires-frontend|client-safe):'
strip_annotation() { grep -viE "$ANNOTATION" "$1" > "$2"; }

# run <gate> <file> -> sets RC and OUT
run() { OUT=$(bash "$1" "$2" 2>&1); RC=$?; }

# mutant <path> <sed-expr>: writes a gate copy; fails the canary if sed changed nothing.
# Called directly, never inside $(...), so the FAIL count survives.
mutant() {
  sed -E "$2" "$GATE" > "$1"
  if cmp -s "$GATE" "$1"; then
    bad "mutant $(basename "$1") is identical to the gate (mutation did not apply)"
  fi
}

M_NO_DROP="$TMP/gate-no-drop-function.sh"
M_NO_REVOKE="$TMP/gate-no-revoke-public.sh"
M_NO_NARROW="$TMP/gate-no-create-narrowing.sh"
mutant "$M_NO_DROP" 's/\|DROP\[\[:space:\]\]\+FUNCTION//'
mutant "$M_NO_REVOKE" 's/REVOKE_PUBLIC_HIT=1$/REVOKE_PUBLIC_HIT=0/'
mutant "$M_NO_NARROW" 's/! grep -qiE "\$CREATES_FUNCTION" < <\(statements "\$FILE"\)/true/'

echo "A. DROP FUNCTION (real: $(basename "$DROP_REAL"))"
run "$GATE" "$DROP_REAL"
[ "$RC" = 0 ] && ok "as committed (requires-frontend) exits 0" || bad "as committed exits $RC: $OUT"
strip_annotation "$DROP_REAL" "$TMP/a_stripped.sql"
cmp -s "$DROP_REAL" "$TMP/a_stripped.sql" && bad "A: stripping removed nothing"
run "$GATE" "$TMP/a_stripped.sql"
if [ "$RC" != 0 ] && grep -q 'VIOLATION' <<<"$OUT" && grep -qi 'DROP FUNCTION' <<<"$OUT"; then
  ok "annotation stripped: VIOLATION naming DROP FUNCTION, exit $RC"
else
  bad "annotation stripped: expected VIOLATION, got exit $RC: $OUT"
fi
run "$M_NO_DROP" "$TMP/a_stripped.sql"
[ "$RC" = 0 ] && ok "mutant without the DROP FUNCTION arm lets it through (the new arm is what fires)" \
              || bad "mutant without DROP FUNCTION arm still flags (exit $RC) — an older arm fires, control is blind"

echo "B. REVOKE ... FROM PUBLIC on an existing function (real: $(basename "$REVOKE_REAL"))"
run "$GATE" "$REVOKE_REAL"
[ "$RC" = 0 ] && ok "as committed (client-safe) exits 0" || bad "as committed exits $RC: $OUT"
strip_annotation "$REVOKE_REAL" "$TMP/b_stripped.sql"
cmp -s "$REVOKE_REAL" "$TMP/b_stripped.sql" && bad "B: stripping removed nothing"
run "$GATE" "$TMP/b_stripped.sql"
if [ "$RC" != 0 ] && grep -q 'FROM PUBLIC on a function this file does not create' <<<"$OUT"; then
  ok "annotation stripped: VIOLATION via the REVOKE-PUBLIC arm, exit $RC"
else
  bad "annotation stripped: expected REVOKE-PUBLIC VIOLATION, got exit $RC: $OUT"
fi
run "$M_NO_REVOKE" "$TMP/b_stripped.sql"
[ "$RC" = 0 ] && ok "mutant without the REVOKE-PUBLIC check lets it through (the new arm is what fires)" \
              || bad "mutant without REVOKE-PUBLIC check still flags (exit $RC) — control is blind"
sed -E 's/\)[[:space:]]+FROM[[:space:]]+PUBLIC;/)\
  FROM PUBLIC;/' "$TMP/b_stripped.sql" > "$TMP/b_wrapped.sql"
if cmp -s "$TMP/b_stripped.sql" "$TMP/b_wrapped.sql"; then
  bad "B: wrapping FROM PUBLIC onto its own line changed nothing"
else
  run "$GATE" "$TMP/b_wrapped.sql"
  [ "$RC" != 0 ] && ok "FROM PUBLIC wrapped onto its own line still fails (exit $RC)" \
                 || bad "wrapped FROM PUBLIC passed: $OUT"
fi

echo "C. Harden-a-new-function false-positive guard (real: $(basename "$HARDEN_REAL"))"
grep -qiE "$ANNOTATION" "$HARDEN_REAL" && bad "C: fixture is annotated, it cannot prove the guard"
run "$GATE" "$HARDEN_REAL"
[ "$RC" = 0 ] && ok "creates + REVOKE ALL FROM PUBLIC, no annotation: exits 0" || bad "flagged: $OUT"
run "$M_NO_NARROW" "$HARDEN_REAL"
[ "$RC" != 0 ] && ok "mutant without the CREATE FUNCTION narrowing flags it (narrowing is load-bearing)" \
               || bad "mutant without narrowing still passes — fixture never reaches the REVOKE-PUBLIC arm"

echo "D. Corpus census over $MIG"
total=0; flagged=0; via_drop=0; via_revoke_unann=0; late=0; revoke_tp=0
for f in "$MIG"/*.sql; do
  total=$((total + 1))
  version=$(basename "$f" | sed -E 's/^([0-9]+).*/\1/')
  run "$GATE" "$f"
  if [ "$RC" != 0 ]; then
    flagged=$((flagged + 1))
    grep -qi 'DROP FUNCTION' <<<"$OUT" && via_drop=$((via_drop + 1))
    grep -q 'FROM PUBLIC on a function this file does not create' <<<"$OUT" && {
      via_revoke_unann=$((via_revoke_unann + 1)); echo "    REVOKE-PUBLIC flags unannotated: $(basename "$f")"; }
    # Compare as 14-digit strings: legacy names carry an 8-digit date only.
    padded=$(printf '%-14s' "$version" | tr ' ' '0')
    [[ "$padded" > "$ARMS_SINCE" || "$padded" == "$ARMS_SINCE" ]] && {
      late=$((late + 1)); echo "    flagged although authored after the arms: $(basename "$f")"; }
  elif grep -qiE "$ANNOTATION" "$f"; then
    strip_annotation "$f" "$TMP/census.sql"
    run "$GATE" "$TMP/census.sql"
    grep -q 'FROM PUBLIC on a function this file does not create' <<<"$OUT" && revoke_tp=$((revoke_tp + 1))
  fi
done
echo "    corpus=$total flagged=$flagged (via DROP FUNCTION: $via_drop) REVOKE-PUBLIC-on-unannotated=$via_revoke_unann annotated-files-the-REVOKE-arm-would-catch=$revoke_tp"
[ "$via_revoke_unann" = 0 ] && ok "REVOKE-PUBLIC arm flags 0 unannotated real migrations" \
                            || bad "REVOKE-PUBLIC arm flags $via_revoke_unann unannotated real migrations (false positives?)"
[ "$late" = 0 ] && ok "no migration authored on/after $ARMS_SINCE is flagged" \
                || bad "$late migration(s) authored after the arms are flagged"
[ "$via_drop" -ge 1 ] && ok "DROP FUNCTION arm fires on $via_drop real legacy file(s)" \
                      || bad "DROP FUNCTION arm fires on no real file — parser or arm is blind"
[ "$revoke_tp" -ge 1 ] && ok "REVOKE-PUBLIC arm fires on $revoke_tp real annotated file(s) once stripped" \
                       || bad "REVOKE-PUBLIC arm fires on no real file — parser or arm is blind"

echo ""
echo "P1473 canary: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
