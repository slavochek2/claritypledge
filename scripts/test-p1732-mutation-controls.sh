#!/usr/bin/env bash
# scripts/test-p1732-mutation-controls.sh — known-bad controls for test-p1732-prod-functions.sh.
#
# Epistemic gate 7: a suite never seen failing is unproven. Each control removes ONE protection from
# a copy of the shipped script (the real files are never edited), runs the canary against the copy,
# and requires (a) a non-zero exit and (b) that the named check is among the failures. A mutation
# whose pattern is no longer in the source is a fixture error (exit 2), never a silent pass.
#
# Exit: 0 every control was caught · 1 a control passed the canary (a blind check) · 2 fixture error.
set -u
SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANARY="$SRC_ROOT/scripts/test-p1732-prod-functions.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0; N=0
JOBS="${P1732_MUTATION_JOBS:-4}"   # each control is a full canary run; they share nothing but the CPU

# control <label> <env-var> <source-file> <old> <new> <check-name-that-must-fail>
control() {
  N=$((N+1))
  local label="$1" var="$2" src="$3" old="$4" new="$5" want="$6" out="$T/m$N.sh" log="$T/log.$N" res="$T/res.$N"
  python3 - "$src" "$out" "$old" "$new" <<'PY' || { echo "FIXTURE: pattern for '$label' not found"; kill $(jobs -p) 2>/dev/null; wait; exit 2; }
import sys
s = open(sys.argv[1]).read()
if sys.argv[3] not in s:
    sys.exit(1)
open(sys.argv[2], 'w').write(s.replace(sys.argv[3], sys.argv[4], 1))
PY
  if [ -n "${P1732_MUTATION_DRY:-}" ]; then
    grep -qF -- "$want" "$CANARY" && echo "OK   anchors: $label" > "$res" || echo "FAIL no check named '$want': $label" > "$res"
    return 0
  fi
  while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$JOBS" ]; do sleep 2; done
  (
    env "$var=$out" bash "$CANARY" > "$log" 2>&1; rc=$?
    if [ "$rc" -ne 0 ] && grep -qF "FAIL $want" "$log"; then
      echo "OK   caught: $label (exit $rc; '$want' failed)" > "$res"
    else
      { echo "FAIL not caught: $label (exit $rc)"; grep 'FAIL' "$log" | head -5 | sed 's/^/       /'; } > "$res"
    fi
  ) &
}

UT="$SRC_ROOT/scripts/deploy-prod-functions.sh"
LIB="$SRC_ROOT/scripts/lib/prod-functions.sh"
STAMP="$SRC_ROOT/scripts/stamp-deploy-manifest.sh"
echo "P1732 mutation controls"
control "upload from the shared working tree" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if ( cd "$SRC" && unset SUPABASE_WORKDIR && ${UPT[@]+"${UPT[@]}"} supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --workdir "$SRC"' \
  'if ( cd "$MAIN" && unset SUPABASE_WORKDIR && ${UPT[@]+"${UPT[@]}"} supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --workdir "$MAIN"' \
  "uploaded bytes hash to the target SHA's fn-a"
control "JWT policy left out of the fingerprint" P1732_SCRIPT_UNDER_TEST "$UT" \
  'python3 "$HASHER" "$SRC/supabase/functions" --jwt-policy "$JWT_LIST"' 'python3 "$HASHER" "$SRC/supabase/functions"' \
  "JWT policy added (no code change): selects fn-a only"
control "no supersession re-check" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if [ "$NOW_TIP" != "$TIP" ]; then' 'if false; then' \
  "tip moved before upload: exit 3"
control "smoke-failed function stamped" P1732_SCRIPT_UNDER_TEST "$UT" \
  '    set_state "$fn" "deployed, smoke failed"   # still in the record written before the upload' '    HEALTHY+=("$fn")' \
  "next run selects it again"
control "partial batch not smoked" P1732_SCRIPT_UNDER_TEST "$UT" \
  'for fn in ${UPLOADED[@]+"${UPLOADED[@]}"}; do
  if [ -f "$SMOKE" ]' '[ ${#UPLOADED[@]} -lt ${#GO[@]} ] && UPLOADED=()
for fn in ${UPLOADED[@]+"${UPLOADED[@]}"}; do
  if [ -f "$SMOKE" ]' \
  "the two that uploaded were smoked"
control "no prod deploy lock" P1732_LIB_UNDER_TEST "$LIB" \
  '    if ln "$tmp" "$PRODFN_LOCK_FILE" 2>/dev/null; then' '    if true; then' \
  "held lock: unproven exit 2"
control "inherited SKIP_EDGE_SECRET_CHECK honoured" P1732_LIB_UNDER_TEST "$LIB" \
  'if [ -n "${SKIP_EDGE_SECRET_CHECK:-}" ] && [ "${SKIP_EDGE_SECRET_CHECK}" != "0" ]; then' \
  'if [ -n "${SKIP_EDGE_SECRET_CHECK:-}" ]; then printf "%s\n" "$@" > "$wd/preflight.ok"; return 0; fi; if false; then' \
  "inherited SKIP_EDGE_SECRET_CHECK=1: zero uploads"
control "stamp commit built from the working file" P1732_STAMP_UNDER_TEST "$STAMP" \
  'build_commit "$HEAD_JSON" || exit 1' 'build_commit "$(cat "$MANIFEST")" || exit 1' \
  "stamp commit leaves the test section as committed"
# --- controls for the 2026-11-26 review fixes ---------------------------------------------------
control "stamp commit without the compare-and-swap" P1732_STAMP_UNDER_TEST "$STAMP" \
  '--content-file "$TMP_OUT" --expect-head-blob "$BASE_BLOB" )' '--content-file "$TMP_OUT" )' \
  "  the co-tenant's commit is kept (rebuilt on the new HEAD, not reverted)"
control "an uncommitted working-file stamp counts as proof" P1732_SCRIPT_UNDER_TEST "$UT" \
  "    if proof.get(n) == h:" \
  "    if proof.get(n) == h or ((json.load(open('supabase/deploy-manifest.json')).get('prod') or {}).get('functions') or {}).get(n) == h:" \
  "  and the deploy uploads it"
control "the committed record ignores local main when it is ahead" P1732_SCRIPT_UNDER_TEST "$UT" \
  "committed = head if rel == 'ahead' else origin" "committed = origin" \
  "  the check sees fn-a stale again (the local rollback stamp wins)"
control "--sha not bound to the live tip" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if [ -n "$AFTER_SHA" ] && [ "$TIP" != "$AFTER_SHA" ]; then' 'if false; then' \
  "a SHA that is not the live tip: superseded exit 3"
control "step 5 exit 4 deploys anyway" P1732_SCRIPT_UNDER_TEST "$UT" \
  '      4) echo "prod functions: unproven: schema unconfirmed' '      4) ;; 44) echo "prod functions: unproven: schema unconfirmed' \
  "step 5 exit 4: unproven exit 2"
control "stamp committed onto a local main behind origin" P1732_SCRIPT_UNDER_TEST "$UT" \
  '  if [ "$REL" = "behind" ]; then
    echo "local main is behind' '  if false; then
    echo "local main is behind' \
  "  local main is behind origin: the stamp is not committed onto it"
control "rollback to code never on origin/main" P1732_SCRIPT_UNDER_TEST "$UT" \
  'git -C "$MAIN" merge-base --is-ancestor "$TARGET" "$TIP" 2>/dev/null || {' 'true || {' \
  "rollback to an unpublished branch: refused"
control "a pending entry for a function the tip lacks is ignored" P1732_SCRIPT_UNDER_TEST "$UT" \
  "        print('STRAY\\t%s' % n)" "        pass" \
  "  /day reports the branch-only function"
control "a failed read of the pending record still rewrites it" P1732_LIB_UNDER_TEST "$LIB" \
  '  cur="$(cat -- "$f")" || return 1' '  cur="$(cat -- "$f" 2>/dev/null)"' \
  "  and the other entries are kept"
control "an empty secret inventory accepted" P1732_LIB_UNDER_TEST "$LIB" \
  "if [ \"\$rc\" -le 1 ] && ! printf '%s\n' \"\$out\" | grep -qE '^SECRETS_FOUND: [1-9][0-9]*\$'; then" 'if false; then' \
  "  says the inventory is empty"
control "env-free batch sent to the inventory" P1732_LIB_UNDER_TEST "$LIB" \
  "  if ! grep -rqF 'Deno.env.get' \"\$wd/union\" 2>/dev/null; then" '  if false; then' \
  "a batch of only env-free functions deploys, the inventory unread"
control "URL host matched by prefix only" P1732_LIB_UNDER_TEST "$LIB" \
  '^https://([a-z0-9]+)\.supabase\.co/?$' '^https://([a-z0-9]+)\.supabase\.co' \
  "URL whose host only begins with the ref: nothing uploads"
control "JWT list read without stripping CR and spaces" P1732_LIB_UNDER_TEST "$LIB" \
  "< <(tr -d '\r' < \"\$1\" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*\$//' | grep -v -e '^#' -e '^\$')" '< "$1"' \
  "JWT list with a trailing space and CRLF: fn-a gets the flag"
control "manual prod deploy leaves no pending marker" P1732_DEPLOY_FUNCTIONS_UNDER_TEST "$SRC_ROOT/scripts/deploy-functions.sh" \
  '  if ! prodfn_smoke_failed_add "$PROJECT_DIR" "${FUNCTIONS[@]}" || ! prodfn_proof_drop' '  if ! true || ! prodfn_proof_drop' \
  "  stamp committed by hand: /day still sees it unsmoked"
control "functions deploy ahead of an unapplied migration" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if [ "$MODE" != "rollback" ] && [ "$PENDMIG_N" -gt 0 ]; then' 'if false; then' \
  "a migration at the tip not applied on prod: exit 1"
control "content-mode blob left staged after a failed commit" P1732_GITOPS_UNDER_TEST "$SRC_ROOT/scripts/git-ops.sh" \
  'if [[ "$_csx_rc" -eq 1 && -n "$_content_blob" ]]' 'if false && [[ "$_csx_rc" -eq 1 && -n "$_content_blob" ]]' \
  "  the manifest is not left staged in the shared index"
control "nothing-to-push refuses a newer tip" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if [ "${PUSH_RC:-}" = "none" ] && git -C "$MAIN" merge-base --is-ancestor "$AFTER_SHA" "$TIP" 2>/dev/null; then' 'if false; then' \
  "nothing to push, tip moved after step 1: deploys, exit 0"
control "a push run follows a newer tip too" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if [ "${PUSH_RC:-}" = "none" ] && git -C' 'if true && git -C' \
  "a push run whose SHA is no longer the tip: superseded exit 3"
control "rollback uploads on a main it cannot record on" P1732_SCRIPT_UNDER_TEST "$UT" \
  'if [ "$MODE" = "rollback" ] && [ "$REL" != "ahead" ]; then' 'if false; then' \
  "  rollback behind origin: nothing uploaded"
control "a last upload no record describes is ignored" P1732_SCRIPT_UNDER_TEST "$UT" \
  '    if p and p != h and p != committed.get(n):' '    if False:' \
  "  then reverted to the recorded code: /day sees prod still runs the reverted code"
control "manual smoke pass clears the pending marker" P1732_DEPLOY_FUNCTIONS_UNDER_TEST "$SRC_ROOT/scripts/deploy-functions.sh" \
  '  echo "prod: ${DEPLOYED[*]} stay pending' \
  '  prodfn_smoke_failed_clear "$PROJECT_DIR" "${DEPLOYED[@]}"; echo "prod: ${DEPLOYED[*]} stay pending' \
  "  /day sees prod differ from the tip"
control "manual deploy honours an inherited SUPABASE_WORKDIR" P1732_DEPLOY_FUNCTIONS_UNDER_TEST "$SRC_ROOT/scripts/deploy-functions.sh" \
  '( cd "$PROJECT_DIR" && unset SUPABASE_WORKDIR && supabase functions deploy' '( supabase functions deploy' \
  "  nor on the manual path"
wait
for r in "$T"/res.*; do
  [ -s "$r" ] || { echo "  FAIL a control wrote no verdict: $r"; FAIL=$((FAIL+1)); continue; }
  sed 's/^/  /' "$r"
  if head -1 "$r" | grep -q '^OK'; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
done
[ $((PASS+FAIL)) -eq "$N" ] || { echo "FIXTURE: $N controls launched, $((PASS+FAIL)) verdicts"; exit 2; }
echo ""
if [ -n "${P1732_MUTATION_DRY:-}" ]; then echo "P1732 mutation controls (dry run, no canary ran): $PASS anchored, $FAIL broken"
else echo "P1732 mutation controls: $PASS caught, $FAIL not caught"; fi
[ "$FAIL" -eq 0 ]
