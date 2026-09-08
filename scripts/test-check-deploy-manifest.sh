#!/usr/bin/env bash
#
# test-check-deploy-manifest.sh — canary for scripts/check-deploy-manifest.sh
# (P1277, item 4).
#
# The defect: `--env prod` reads the manifest from origin/main (P820). When
# local main is ahead of origin, a stamp that HAS been applied reads as
# never-deployed and the script printed "migrate prod" / "redeploy the
# function" as the fix — the wrong action at the moment the operator decides.
# The function case loops forever, because deploy-functions.sh stamps the LOCAL
# manifest only.
#
# Both falsifiers from the inbox entry (docs/process-learnings.md 2026-08-28)
# are run here against a hermetic fixture: its own git repo in a temp dir, with
# its own `origin` remote, so nothing touches this repo or the real prod
# manifest. Controls are included in both directions — a genuinely undeployed
# migration and function must STILL report MISSING and STILL name the deploy
# command (epistemic gate 7c: a new refusal has to be run against the workflow
# that was already correct).
#
# Run: ./scripts/test-check-deploy-manifest.sh

set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
PASSED=0; FAILED=0

sha_of_string() {
  if command -v sha256sum >/dev/null 2>&1; then printf '%s' "$1" | sha256sum | awk '{print $1}'
  else printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; fi
}

NOTHING='{"prod":{"functions":{},"migrations":[]},"test":{"functions":{},"migrations":[]}}'

FN_BODY='export default () => new Response("fixture");'
FN_HASH="$(sha_of_string "$FN_BODY")"

# build_fixture <root> — a repo whose origin/main manifest lists NOTHING, with
# a local working-tree manifest supplied by the caller.
build_fixture() {
  local root="$1" local_manifest="$2" origin_manifest="${3:-}"
  mkdir -p "$root/repo/scripts" "$root/repo/supabase/functions/fixture-fn" "$root/repo/supabase/migrations"
  cp "$REPO/scripts/check-deploy-manifest.sh" "$root/repo/scripts/check-deploy-manifest.sh"
  chmod +x "$root/repo/scripts/check-deploy-manifest.sh"
  printf '%s' "$FN_BODY" > "$root/repo/supabase/functions/fixture-fn/index.ts"
  printf 'select 1;\n' > "$root/repo/supabase/migrations/20260101000000_fixture.sql"
  # origin/main's manifest — by default prod has nothing at all
  if [[ -z "$origin_manifest" ]]; then origin_manifest="$NOTHING"; fi
  printf '%s\n' "$origin_manifest" > "$root/repo/supabase/deploy-manifest.json"
  (
    cd "$root/repo"
    git init -q -b main
    git config user.email t@t.t; git config user.name t
    git add -A >/dev/null 2>&1
    git commit -qm "baseline: nothing deployed to prod"
  )
  git clone -q "$root/repo" "$root/clone"
  # the working tree's manifest — what the local stamp wrote
  printf '%s\n' "$local_manifest" > "$root/clone/supabase/deploy-manifest.json"
}

# run_case <label> <local manifest json> <want exit> <must contain> [must NOT contain]
run_case() {
  local label="$1" manifest="$2" want="$3" needle="$4" absent="${5:-}" origin="${6:-}"
  local t out rc ok=1
  t=$(mktemp -d); build_fixture "$t" "$manifest" "$origin"
  out=$( cd "$t/clone" && ./scripts/check-deploy-manifest.sh --env prod 2>&1 ); rc=$?
  [[ "$rc" == "$want" ]] || ok=0
  printf '%s' "$out" | grep -Fq -- "$needle" || ok=0
  if [[ -n "$absent" ]] && printf '%s' "$out" | grep -Fq -- "$absent"; then ok=0; fi
  if [[ $ok -eq 1 ]]; then
    printf '%s✓%s %-62s exit=%s\n' "$GREEN" "$NC" "$label" "$rc"; PASSED=$((PASSED+1))
  else
    printf '%s✗%s %-62s exit=%s (want %s, needs "%s"%s)\n' "$RED" "$NC" "$label" "$rc" "$want" "$needle" \
      "${absent:+, must not say \"$absent\"}"
    printf '%s\n' "$out" | sed 's/^/      /' | tail -20; FAILED=$((FAILED+1))
  fi
  rm -rf "$t"
}

STAMPED="{\"prod\":{\"functions\":{\"fixture-fn\":\"${FN_HASH}\"},\"migrations\":[\"20260101000000\"]},\"test\":{\"functions\":{},\"migrations\":[]}}"
# Both manifests agree on an OLD hash: the deploy happened, was stamped, and was
# pushed — and the code has moved SINCE. That is real staleness, and it must not
# be reclassified as an unpushed stamp.
OLD_HASH=0000000000000000000000000000000000000000000000000000000000000000
STALE_BOTH="{\"prod\":{\"functions\":{\"fixture-fn\":\"${OLD_HASH}\"},\"migrations\":[\"20260101000000\"]},\"test\":{\"functions\":{},\"migrations\":[]}}"

echo "═══ check-deploy-manifest.sh --env prod — the unpushed stamp ═══"

echo "${DIM}the two falsifiers from the inbox entry${NC}"
# Falsifier (migration): a manifest stamp committed locally and not pushed used
# to report MIGRATION_MISSING and tell the operator to migrate prod.
run_case "migration stamped locally, unpushed" "$STAMPED" 1 \
  "MIGRATION_UNPUSHED_STAMP: 20260101000000_fixture.sql" "./scripts/migrate.sh --env prod"
# Falsifier (function): deploying stamps the LOCAL manifest only, so the printed
# "redeploy" fix could never clear the report — an infinite loop, reproduced
# 2026-09-08 with two functions.
run_case "function stamped locally, unpushed" "$STAMPED" 1 \
  "FUNCTION_UNPUSHED_STAMP: fixture-fn" "./scripts/deploy-functions.sh fixture-fn --env prod"
run_case "the remedy names pushing main, not deploying" "$STAMPED" 1 \
  "commit supabase/deploy-manifest.json on main, then push main to origin" ""

echo "${DIM}controls — a genuinely undeployed change must NOT be reclassified${NC}"
# Gate 7c. Without these, the change could have made every drift report benign
# and nothing in the suite would have said so.
run_case "control: never deployed at all reports MIGRATION_MISSING" "$NOTHING" 1 \
  "MIGRATION_MISSING: 20260101000000_fixture.sql" "MIGRATION_UNPUSHED_STAMP"
run_case "control: never deployed at all reports FUNCTION_MISSING" "$NOTHING" 1 \
  "FUNCTION_MISSING: fixture-fn" "FUNCTION_UNPUSHED_STAMP"
run_case "control: the deploy commands are still printed" "$NOTHING" 1 \
  "./scripts/migrate.sh --env prod" ""
run_case "control: pushed stamp, code changed since, is STALE" "$STALE_BOTH" 1 \
  "FUNCTION_STALE: fixture-fn" "FUNCTION_UNPUSHED_STAMP" "$STALE_BOTH"

echo
if [[ $FAILED -eq 0 ]]; then
  echo "${GREEN}test-check-deploy-manifest: ${PASSED} passed, 0 failed${NC}"; exit 0
else
  echo "${RED}test-check-deploy-manifest: ${PASSED} passed, ${FAILED} FAILED${NC}"; exit 1
fi
