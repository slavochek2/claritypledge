#!/usr/bin/env bash
# scripts/test-p1606-hosted-test-off.sh — P1606: a run aimed at hosted TEST is refused while
# self-hosted is active, and the default self-hosted workflows are untouched. Hermetic: stubs only,
# no network. The hosted URL comes from flip-test-env.py, so this file names no project.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
PASS=0; FAIL=0
ok()  { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FLIP=scripts/selfhosted/flip-test-env.py
HOSTED_URL="$(sed -nE "s/^HOSTED_URL = '(.*)'/\1/p" "$FLIP")"
SELF_URL="$(sed -nE "s/^SELF_URL = '(.*)'/\1/p" "$FLIP")"
[ -n "$HOSTED_URL" ] && [ -n "$SELF_URL" ] || { echo "cannot read constants from $FLIP"; exit 1; }
printf 'VITE_SUPABASE_URL=%s\nSELFHOSTED_TEST_ORIGIN=%s\n' "$SELF_URL" "$SELF_URL" > "$T/selfhosted"
printf 'VITE_SUPABASE_URL=%s\n' "$HOSTED_URL" > "$T/hosted"

echo "== A. the shared guard"
# guard <flip-file> <url> <surface> <subcommand> [ENV=VALUE...]: prints REFUSED or ALLOWED; exit 0.
guard() {
  local flip="$1" url="$2" surface="$3" sub="$4"; shift 4
  env -u CI -u VITEST -u TEST_WORKER_INDEX -u TEST_PARALLEL_INDEX -u CP_HOSTED_TEST_REASON \
    CP_ACTIVE_TEST_FILE="$flip" SELFHOSTED_TEST_ORIGIN="$SELF_URL" "$@" \
    node --input-type=module -e "
      import { refuseHostedTestRun } from './scripts/lib/hosted-test-guard.mjs';
      try {
        refuseHostedTestRun({ url: '$url', surface: '$surface', argv: ['node', 'x', '$sub'] });
        console.log('ALLOWED');
      } catch (e) {
        console.log(e.message.includes('REFUSED') ? 'REFUSED' : 'ERROR ' + e.message);
      }" 2>"$T/guard.err"
}
want() { # want <label> <expected> <actual>
  if [ "$3" = "$2" ]; then ok "$1"; else bad "$1 (got: $3)"; fi
}
want "known-bad: Playwright run aimed at hosted, self-hosted active" REFUSED "$(guard "$T/selfhosted" "$HOSTED_URL" playwright test)"
want "known-bad: dev server aimed at hosted, self-hosted active" REFUSED "$(guard "$T/selfhosted" "$HOSTED_URL" dev-server x)"
want "known-good: Playwright run on self-hosted" ALLOWED "$(guard "$T/selfhosted" "$SELF_URL" playwright test)"
want "known-good: dev server on self-hosted" ALLOWED "$(guard "$T/selfhosted" "$SELF_URL" dev-server x)"
want "the founder's decision on record lets a hosted run go" ALLOWED "$(guard "$T/selfhosted" "$HOSTED_URL" playwright test CP_HOSTED_TEST_REASON=decision)"
want "a blank reason counts as none" REFUSED "$(guard "$T/selfhosted" "$HOSTED_URL" playwright test CP_HOSTED_TEST_REASON=' ')"
want "hosted is the active server (rollback): allowed" ALLOWED "$(guard "$T/hosted" "$HOSTED_URL" playwright test)"
want "Playwright show-report is untouched" ALLOWED "$(guard "$T/selfhosted" "$HOSTED_URL" playwright show-report)"
want "CI is untouched" ALLOWED "$(guard "$T/selfhosted" "$HOSTED_URL" playwright test CI=1)"
want "vitest is untouched" ALLOWED "$(guard "$T/selfhosted" "$HOSTED_URL" dev-server x VITEST=1)"
want "a test worker is untouched" ALLOWED "$(guard "$T/selfhosted" "$HOSTED_URL" playwright test TEST_WORKER_INDEX=0)"
want "unresolved active server: continues" ALLOWED "$(guard "$T/missing" "$HOSTED_URL" playwright test)"
grep -q 'could not tell which TEST server' "$T/guard.err" && ok "unresolved active server: says so" || bad "unresolved active server: no note"
REFUSAL="$(node --input-type=module -e "import { REFUSAL } from './scripts/lib/hosted-test-guard.mjs'; console.log(REFUSAL)")"
printf '%s' "$REFUSAL" | grep -q 'what only real Supabase can show' && printf '%s' "$REFUSAL" | grep -q 'Do not restore it yourself' \
  && ok "the refusal names the request form and forbids a self-restore" || bad "refusal text"
[ -f docs/technical/hosted-test-parity.md ] && ok "the doc the refusal points at exists" || bad "docs/technical/hosted-test-parity.md missing"

echo "== B. deploy-functions.sh routing"
R="$T/repo"; CALLS="$T/calls"; STUBS="$T/stubs"
mkdir -p "$R/scripts/selfhosted" "$STUBS"
cp scripts/deploy-functions.sh "$R/scripts/"; cp -R scripts/lib "$R/scripts/lib"
cp "$FLIP" "$R/scripts/selfhosted/"
printf '#!/bin/bash\necho "SELFHOSTED-DEPLOY $*" >> "%s"\nexit "${CHILD_EXIT:-0}"\n' "$CALLS" > "$R/scripts/selfhosted/deploy-functions.sh"
chmod +x "$R/scripts/selfhosted/deploy-functions.sh" "$R/scripts/deploy-functions.sh"
for tool in npx supabase curl; do
  printf '#!/bin/bash\necho "HOSTED-TOOL %s" >> "%s"\nexit 1\n' "$tool" "$CALLS" > "$STUBS/$tool"
done; chmod +x "$STUBS"/*
printf 'VITE_SUPABASE_URL=%s\nSUPABASE_TEST_FUNCTIONS_TOKEN=x\n' "$HOSTED_URL" > "$R/.env.local"
git -C "$R" init -q
deploy() { # deploy <flip> <args...>
  local flip="$1"; shift; : > "$CALLS"
  (cd "$R" && env -u CP_DEPLOY_INNER_HOSTED CP_ACTIVE_TEST_FILE="$flip" PATH="$STUBS:$PATH" bash scripts/deploy-functions.sh "$@") > "$T/out" 2>&1
  RC=$?; RAN="$(cat "$CALLS")"
}
deploy "$T/selfhosted" my-fn
{ [ "$RC" -eq 0 ] && [ "$RAN" = "SELFHOSTED-DEPLOY my-fn" ]; } && ok "known-good: self-hosted active deploys there and never touches hosted" || bad "self-hosted deploy (rc=$RC ran='$RAN')"
deploy "$T/selfhosted"
{ [ "$RC" -eq 0 ] && [ "$RAN" = "SELFHOSTED-DEPLOY " ]; } && ok "deploy all: same route" || bad "deploy all (rc=$RC ran='$RAN')"
CHILD_EXIT=1 deploy "$T/selfhosted" my-fn
[ "$RC" -ne 0 ] && ok "a failed self-hosted deploy is not reported as success" || bad "self-hosted failure swallowed"
deploy "$T/selfhosted" --env hosted-test
{ [ "$RC" -ne 0 ] && [ -z "$RAN" ] && grep -q REFUSED "$T/out"; } && ok "known-bad: --env hosted-test without a decision is refused, nothing ran" || bad "hosted-test refusal (rc=$RC ran='$RAN')"
deploy "$T/missing" my-fn
{ [ "$RC" -ne 0 ] && [ -z "$RAN" ]; } && ok "unknown active server: fails closed, nothing ran" || bad "unknown state (rc=$RC ran='$RAN')"
deploy "$T/hosted" my-fn
if printf '%s' "$RAN" | grep -q SELFHOSTED-DEPLOY; then bad "hosted active must not deploy to self-hosted"; else ok "hosted active: takes the hosted path, not self-hosted"; fi

echo "== C. daily latency check names the active server"
grep -q 'TESTDB_ENV_FILE:-$MAIN/.env.test.local' scripts/check-test-db-latency.sh && ok "latency check reads .env.test.local" || bad "latency check still reads another file"

echo
echo "P1606: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
