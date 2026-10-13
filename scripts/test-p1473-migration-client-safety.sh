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
#   E. Review round: per-statement narrowing (a file that creates one function and
#      revokes another is flagged; same name + different signature is flagged), block
#      comments in both directions, a /* inside a string, target kinds, FROM "PUBLIC".
#   D. Census of the whole corpus (gate 7c). No unannotated real migration is flagged
#      ONLY by the REVOKE-PUBLIC arm (every REVOKE-PUBLIC hit on an unannotated file is
#      printed); nothing authored after the arms existed is flagged;
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
mutant "$M_NO_REVOKE" 's/in revoke_public_hits\(code\):/in []:/'
mutant "$M_NO_NARROW" 's/if have and \(want is None or want in have\):/if False:/'

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

# E. Review round (/finish, 2 MEDIUM + 1 LOW). Built on the real P707 / P1104 files.
# expect <want-rc: 0|fail> <label> <file> [output-substring]
expect() {
  run "$GATE" "$3"
  local got=fail; [ "$RC" = 0 ] && got=0
  if [ "$got" = "$1" ] && { [ -z "${4:-}" ] || grep -qF "$4" <<<"$OUT"; }; then
    ok "$2 (exit $RC)"
  else
    bad "$2: want ${1}${4:+ with '$4'}, got exit $RC: $OUT"
  fi
}
echo "E. Per-statement narrowing, block comments, target kinds"
{ cat "$HARDEN_REAL"; echo 'REVOKE ALL ON FUNCTION public.legacy_rpc(uuid) FROM PUBLIC;'; } > "$TMP/e_resign.sql"
expect fail "re-sign: file creates one function, revokes a different existing one" "$TMP/e_resign.sql" \
  'FROM PUBLIC on a function this file does not create: public.legacy_rpc(uuid)'
printf 'CREATE FUNCTION public.f(p uuid, q text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\nREVOKE ALL ON FUNCTION public.f(uuid) FROM PUBLIC;\n' > "$TMP/e_overload.sql"
expect fail "same name, different signature: the revoke hits the existing overload" "$TMP/e_overload.sql"
printf 'CREATE OR REPLACE FUNCTION public.f(p_id uuid, p_code text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\nREVOKE ALL ON FUNCTION f(UUID, TEXT) FROM PUBLIC;\n' > "$TMP/e_samesig.sql"
expect 0 "same name and signature (unqualified, other case) still counts as created here" "$TMP/e_samesig.sql"
{ echo '/* CREATE FUNCTION public.is_reserved_agent_name(text) */'; cat "$TMP/b_stripped.sql"; } > "$TMP/e_block_fn.sql"
expect fail "a CREATE FUNCTION inside a block comment does not narrow a real REVOKE" "$TMP/e_block_fn.sql"
{ cat "$HARDEN_REAL"; printf '/* retired:\n   DROP FUNCTION public.old_rpc(uuid);\n   REVOKE ALL ON FUNCTION public.old_rpc(uuid) FROM PUBLIC;\n   /* nested */ still a comment */\n'; } > "$TMP/e_block_fp.sql"
expect 0 "DROP FUNCTION / REVOKE inside a (nested) block comment are not flagged" "$TMP/e_block_fp.sql"
{ cat "$HARDEN_REAL"; printf "SELECT '/*';\nDROP FUNCTION public.old_rpc(uuid);\nSELECT '*/';\n"; } > "$TMP/e_block_str.sql"
expect fail "a /* inside a string literal does not open a comment" "$TMP/e_block_str.sql"
printf 'REVOKE SELECT ON public.profiles FROM PUBLIC;\n' > "$TMP/e_table.sql"
expect fail "table target is named as a table" "$TMP/e_table.sql" 'FROM PUBLIC on a table this file does not create'
printf 'REVOKE USAGE ON SCHEMA app FROM PUBLIC;\n' > "$TMP/e_schema.sql"
expect fail "schema target is named as a schema" "$TMP/e_schema.sql" 'FROM PUBLIC on a schema this file does not create'
printf 'CREATE TABLE public.t (id uuid);\nREVOKE ALL ON TABLE public.t FROM PUBLIC;\n' > "$TMP/e_newtable.sql"
expect 0 "revoking PUBLIC on a table the file creates is not flagged" "$TMP/e_newtable.sql"
printf 'REVOKE ALL ON FUNCTION public.legacy_rpc(uuid) FROM "PUBLIC";\n' > "$TMP/e_quoted.sql"
expect fail 'FROM "PUBLIC" (quoted) is still flagged' "$TMP/e_quoted.sql"

echo "D. Corpus census over $MIG"
total=0; flagged=0; via_drop=0; via_revoke_unann=0; revoke_only=0; late=0; revoke_tp=0
for f in "$MIG"/*.sql; do
  total=$((total + 1))
  version=$(basename "$f" | sed -E 's/^([0-9]+).*/\1/')
  run "$GATE" "$f"
  if [ "$RC" != 0 ]; then
    flagged=$((flagged + 1))
    grep -qi 'DROP FUNCTION' <<<"$OUT" && via_drop=$((via_drop + 1))
    if grep -q 'FROM PUBLIC on a .* this file does not create' <<<"$OUT"; then
      via_revoke_unann=$((via_revoke_unann + 1))
      if grep -qE '^    [0-9]+:' <<<"$OUT"; then
        echo "    REVOKE-PUBLIC also fires on unannotated (already flagged by another arm): $(basename "$f")"
      else
        revoke_only=$((revoke_only + 1)); echo "    REVOKE-PUBLIC ALONE flags unannotated: $(basename "$f")"
      fi
    fi
    # Compare as 14-digit strings: legacy names carry an 8-digit date only.
    padded=$(printf '%-14s' "$version" | tr ' ' '0')
    [[ "$padded" > "$ARMS_SINCE" || "$padded" == "$ARMS_SINCE" ]] && {
      late=$((late + 1)); echo "    flagged although authored after the arms: $(basename "$f")"; }
  elif grep -qiE "$ANNOTATION" "$f"; then
    strip_annotation "$f" "$TMP/census.sql"
    run "$GATE" "$TMP/census.sql"
    grep -q 'FROM PUBLIC on a .* this file does not create' <<<"$OUT" && revoke_tp=$((revoke_tp + 1))
  fi
done
echo "    corpus=$total flagged=$flagged (via DROP FUNCTION: $via_drop) REVOKE-PUBLIC-on-unannotated=$via_revoke_unann (alone: $revoke_only) annotated-files-the-REVOKE-arm-would-catch=$revoke_tp"
[ "$revoke_only" = 0 ] && ok "REVOKE-PUBLIC arm alone flags 0 unannotated real migrations" \
                       || bad "REVOKE-PUBLIC arm alone flags $revoke_only unannotated real migrations — review each"
[ "$late" = 0 ] && ok "no migration authored on/after $ARMS_SINCE is flagged" \
                || bad "$late migration(s) authored after the arms are flagged"
[ "$via_drop" -ge 1 ] && ok "DROP FUNCTION arm fires on $via_drop real legacy file(s)" \
                      || bad "DROP FUNCTION arm fires on no real file — parser or arm is blind"
[ "$revoke_tp" -ge 1 ] && ok "REVOKE-PUBLIC arm fires on $revoke_tp real annotated file(s) once stripped" \
                       || bad "REVOKE-PUBLIC arm fires on no real file — parser or arm is blind"

echo ""
echo "P1473 canary: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
