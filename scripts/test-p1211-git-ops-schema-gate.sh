#!/bin/bash
# scripts/test-p1211-git-ops-schema-gate.sh — canary for P1211 C2 (git-ops.sh schema gate).
#
#   1. The extracted SCHEMA-GATE block: schema_gate_pre dies on an unapplied migration
#      and names the resolving command; passes an applied tree. schema_gate_post
#      returns 3 when a coupled migration is due, 0 when nothing is, 4 when unsure.
#   2. Ordering, read from git-ops.sh itself: in both push commands the pre-gate sits
#      after the snapshot is final and before ANY `git push`, the lock and the
#      privacy step; a re-check sits between the CI poll and the promote (origin/main
#      and the ledger can move during the wait); the post-gate sits after the promote.
#   3. End to end, the REAL git-ops.sh in a fixture repo whose origin is a local bare
#      repo (nothing can reach GitHub): push-docs and ship-to-prod refuse a fabricated
#      migration before [1/6] and leave no staging ref on origin; a docs-only push
#      passes the gate and proceeds to [1/6] (control).
#
# Ledger stubbed via CHECK_SCHEMA_READY_STUB_LEDGER. No network.

set -u
# Drop the hook's repo-scoping env FIRST (P1346). Run from a linked worktree's pre-commit,
# GIT_DIR=<repo>/.git/worktrees/wN made the `git init` below re-initialise the real repo
# (core.bare=true on the shared config) and the fixture's `git commit` fired the real hook
# again, recursively (2026-09-22). run_quiet now scrubs this too; this keeps a direct or
# older-wrapper run safe.
for _v in $(git rev-parse --local-env-vars 2>/dev/null); do unset "$_v"; done
unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE _v

REPO_ROOT_REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITOPS="$REPO_ROOT_REAL/scripts/git-ops.sh"
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-p1211-gitops.XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT
unset SUPABASE_READONLY_TOKEN GITHUB_ACTIONS PUSH_DOCS_ASSUME_YES

PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

# --- fixture: bare origin + working clone with the real scripts/ ------------------
ORIGIN="$TMPROOT/origin.git"
W="$TMPROOT/work"
git init -q --bare -b main "$ORIGIN"
git init -q -b main "$W"
cd "$W" || exit 1
git config user.email t@example.invalid; git config user.name t
cp -R "$REPO_ROOT_REAL/scripts" scripts
mkdir -p supabase/migrations docs
cp "$REPO_ROOT_REAL/supabase/migrations/.schema-gate-exempt" supabase/migrations/ 2>/dev/null || true
printf 'legacy p63_google_oauth_avatar.sql : fixture\n' > supabase/migrations/.schema-gate-exempt
echo "select 1;" > supabase/migrations/20260101000000_one.sql
echo base > docs/readme.md
git add scripts supabase docs
git commit -q -m "base"
git remote add origin "$ORIGIN"
git push -q origin main
git fetch -q origin
LEDGER="$TMPROOT/ledger.json"
printf '%s' '[{"version":"20260101000000","total":1}]' > "$LEDGER"
export CHECK_SCHEMA_READY_STUB_LEDGER="$LEDGER"
BASE=$(git rev-parse HEAD)

echo "== 1. extracted block"
BLOCK="$TMPROOT/block.sh"
sed -n '/--8<-- SCHEMA-GATE-BEGIN/,/--8<-- SCHEMA-GATE-END/p' "$GITOPS" > "$BLOCK"
if [ "$(grep -c '^schema_gate_' "$BLOCK")" -eq 2 ]; then ok "block extracted (2 functions)"; else bad "block extraction failed"; fi

FAB=$(git commit-tree "$(
  B=$(printf 'select 1;\n' | git hash-object -w --stdin)
  GIT_INDEX_FILE="$TMPROOT/idx" git read-tree "$BASE"
  GIT_INDEX_FILE="$TMPROOT/idx" git update-index --add --cacheinfo "100644,$B,supabase/migrations/20990101000000_fab.sql"
  GIT_INDEX_FILE="$TMPROOT/idx" git write-tree)" -p "$BASE" -m "p999 fabricated")

run_block() { # run_block <function> <sha>
  OUT=$(REPO_ROOT="$W" bash -c '
    set -euo pipefail
    die() { echo "DIE: $*" >&2; exit 1; }
    source "$1"; shift
    "$@"' _ "$BLOCK" "$@" 2>&1)
  RC=$?
}
run_block schema_gate_pre push-docs "$BASE"
[ "$RC" -eq 0 ] && ok "pre: applied tree passes" || bad "pre applied: rc $RC: $OUT"
run_block schema_gate_pre push-docs "$FAB"
if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | grep -q "STOPPED before anything was pushed" \
   && printf '%s' "$OUT" | grep -q "migrate.sh --env prod --only 20990101000000_fab.sql"; then
  ok "pre: fabricated migration dies with the resolving command"
else bad "pre fabricated: rc $RC: $OUT"; fi

FRONT=$(git commit-tree "$(git rev-parse "$BASE^{tree}")" -p "$BASE" -m frontend)
COUP=$(git commit-tree "$(
  B=$(printf -- '-- requires-frontend: %s\nselect 1;\n' "${FRONT:0:12}" | git hash-object -w --stdin)
  GIT_INDEX_FILE="$TMPROOT/idx2" git read-tree "$BASE"
  GIT_INDEX_FILE="$TMPROOT/idx2" git update-index --add --cacheinfo "100644,$B,supabase/migrations/20990102000000_c.sql"
  GIT_INDEX_FILE="$TMPROOT/idx2" git write-tree)" -p "$FRONT" -m coupled)
run_block schema_gate_post push-docs "$COUP"
[ "$RC" -eq 3 ] && printf '%s' "$OUT" | grep -q "DUE" && ok "post: coupled now due returns 3" || bad "post coupled: rc $RC: $OUT"
run_block schema_gate_post push-docs "$BASE"
[ "$RC" -eq 0 ] && ok "post: nothing due returns 0" || bad "post none: rc $RC"
echo UNREACHABLE > "$TMPROOT/unreach"
OUT=$(CHECK_SCHEMA_READY_STUB_LEDGER="$TMPROOT/unreach" REPO_ROOT="$W" bash -c 'set -euo pipefail; die(){ exit 1; }; source "$1"; schema_gate_post x "$2"' _ "$BLOCK" "$BASE" 2>&1); RC=$?
[ "$RC" -eq 4 ] && ok "post: unreachable ledger after promote returns 4 (loud)" || bad "post unreachable: rc $RC"

echo "== 2. ordering inside git-ops.sh"
body() { awk -v f="$1" '$0 ~ "^"f"\\(\\) \\{" {on=1} on {print NR": "$0} on && /^}/ {exit}' "$GITOPS"; }
first_line() { printf '%s\n' "$1" | grep -E "$2" | head -1 | cut -d: -f1; }
for fn in cmd_push_docs cmd_ship_to_prod; do
  B=$(body "$fn")
  PRE=$(first_line "$B" 'schema_gate_pre ')
  POST=$(first_line "$B" 'schema_gate_post ')
  PUSH1=$(first_line "$B" 'git -C "\$REPO_ROOT" push origin')
  LOCK=$(first_line "$B" 'acquire_main_lock')
  PRIV=$(first_line "$B" '\[1/6\]')
  PROMOTE=$(first_line "$B" 'refs/heads/main"; then')
  if [ -n "$PRE" ] && [ "$PRE" -lt "$PUSH1" ] && [ "$PRE" -lt "$LOCK" ] && [ "$PRE" -lt "$PRIV" ]; then
    ok "$fn: pre-gate before the first push, the lock and [1/6]"
  else bad "$fn: pre=$PRE push=$PUSH1 lock=$LOCK priv=$PRIV"; fi
  if [ -n "$POST" ] && [ "$POST" -gt "$PROMOTE" ]; then ok "$fn: post-gate after the promote"; else bad "$fn: post=$POST promote=$PROMOTE"; fi
  POLL=$(first_line "$B" 'wait_for_required_checks ')
  RECHECK=$(first_line "$B" 'promote-time re-check')
  if [ -n "$RECHECK" ] && [ "$RECHECK" -gt "$POLL" ] && [ "$RECHECK" -lt "$PROMOTE" ]; then
    ok "$fn: promote-time re-check between the CI poll and the promote"
  else bad "$fn: recheck=$RECHECK poll=$POLL promote=$PROMOTE"; fi
  PLINE=$(printf '%s\n' "$B" | grep -E 'refs/heads/main"; then' | head -1)
  if printf '%s' "$PLINE" | grep -qF -- '--force-with-lease="refs/heads/main:${checked_base}"'; then
    ok "$fn: promote is a compare-and-swap on the re-checked base"
  else bad "$fn: promote is not leased on checked_base: $PLINE"; fi
done
if grep -nE 'echo .*push origin \$\{local_sha\}:refs/heads/main' "$GITOPS" >/dev/null; then
  bad "a printed hand-promote hint remains (it would skip the schema re-check)"
else ok "no printed hand-promote hint remains"; fi
RETREAT_END=$(grep -n 'STEP0-RETREAT-END' "$GITOPS" | cut -d: -f1)
PD_PRE=$(first_line "$(body cmd_push_docs)" 'schema_gate_pre ')
[ "$PD_PRE" -gt "$RETREAT_END" ] && ok "push-docs: pre-gate after the resume replay and Step-0 retreat (checks the pinned SHA)" || bad "push-docs pre-gate precedes the snapshot pin"

run_block schema_gate_pre push-docs "$BASE"
if [ "$(printf '%s\n' "$OUT" | tail -1)" = "$(git rev-parse origin/main)" ]; then
  ok "pre: prints the exact origin/main it judged (the promote's lease)"
else bad "pre did not print the checked base: $(printf '%s' "$OUT" | tail -1)"; fi

echo "== 2b. the lease form git-ops.sh uses refuses a moved base (local bare origin)"
OTHER="$TMPROOT/other"; git clone -q "$ORIGIN" "$OTHER"
( cd "$OTHER" && git config user.email t@example.invalid && git config user.name t \
  && echo moved > moved.txt && git add moved.txt && git commit -q -m moved && git push -q origin HEAD:main )
MOVED=$(git --git-dir="$ORIGIN" rev-parse main)
git fetch -q origin
STALE_CAND=$(git commit-tree "$(git rev-parse "$MOVED^{tree}")" -p "$MOVED" -m stale-candidate)
if git push -q --force-with-lease="refs/heads/main:${BASE}" origin "${STALE_CAND}:refs/heads/main" 2>/dev/null; then
  bad "lease on a stale base was ACCEPTED"
else ok "lease on a stale base is refused (main moved after the check)"; fi
if git push -q --force-with-lease="refs/heads/main:${MOVED}" origin "${STALE_CAND}:refs/heads/main" 2>/dev/null; then
  ok "control: lease on the current base is accepted"
else bad "control: lease on the current base refused"; fi
git push -q --force origin "${BASE}:refs/heads/main"; git fetch -q origin

echo "== 3. end to end (real git-ops.sh, local bare origin)"
staging_refs() { git --git-dir="$ORIGIN" for-each-ref --format='%(refname)' refs/heads/staging/ | wc -l | tr -d ' '; }
git checkout -q main
git reset -q --hard "$BASE"
git merge -q --ff-only "$FAB" 2>/dev/null || git reset -q --hard "$FAB"
OUT=$(bash scripts/git-ops.sh push-docs 2>&1 </dev/null); RC=$?
if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | grep -q "schema gate refused" && ! printf '%s' "$OUT" | grep -q '\[1/6\]' && [ "$(staging_refs)" -eq 0 ]; then
  ok "push-docs refuses a fabricated migration before [1/6]; no staging ref on origin"
else bad "push-docs e2e: rc $RC, staging refs $(staging_refs): $(printf '%s' "$OUT" | tail -5)"; fi
OUT=$(bash scripts/git-ops.sh ship-to-prod p999 2>&1 </dev/null); RC=$?
if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | grep -q "schema gate refused" && ! printf '%s' "$OUT" | grep -q '\[1/6\]' && [ "$(staging_refs)" -eq 0 ]; then
  ok "ship-to-prod refuses a fabricated migration before [1/6]; no staging ref on origin"
else bad "ship-to-prod e2e: rc $RC: $(printf '%s' "$OUT" | tail -5)"; fi

git reset -q --hard "$BASE"
echo more >> docs/readme.md; git add docs/readme.md; git commit -q -m "p999 docs only"
OUT=$(bash scripts/git-ops.sh push-docs 2>&1 </dev/null); RC=$?
# Control: the gate passes, and the run stops later at the privacy step (no stamp in the
# fixture) — proof the gate is not simply refusing everything.
if printf '%s' "$OUT" | grep -q "ready:" && printf '%s' "$OUT" | grep -q '\[1/6\]' && [ "$(staging_refs)" -eq 0 ]; then
  ok "control: docs-only push passes the gate and reaches [1/6] (rc $RC at privacy, as expected)"
else bad "control docs-only: rc $RC: $(printf '%s' "$OUT" | tail -5)"; fi

echo ""
echo "test-p1211-git-ops-schema-gate: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
