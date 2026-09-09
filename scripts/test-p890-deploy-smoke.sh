#!/bin/bash
# scripts/test-p890-deploy-smoke.sh — canary for P890's changes to deploy-functions.sh.
#
# Three properties, each of which broke or would have broken silently:
#
#  1. `_shared` is a library, not a function. `supabase functions deploy _shared` fails
#     its OWN name validation ("Invalid Function name ... ^[A-Za-z][A-Za-z0-9_-]*$",
#     measured exit 1 on CLI 2.106.0). That failure was invisible for as long as the
#     deploy ran through `| tail -1`, which returns TAIL's status — so `_shared` was
#     recorded as DEPLOYED. The moment the exit code is read honestly, an unfiltered
#     list aborts every deploy-all run. Epistemic gate 7c: the guard must not break the
#     workflow the script's own usage block documents.
#  2. A real deploy failure must now exit non-zero (the masking is gone for good).
#  3. The post-deploy smoke runs AFTER the manifest stamp, smokes only what this run
#     deployed, is silent on test/local unless opted in, and fails the script when it
#     fails.
#
# Hermetic: a throwaway git repo under mktemp holding a copy of the real
# deploy-functions.sh plus stubs for every sibling it shells out to. No network call,
# no keychain read, no real project touched. `supabase` is stubbed to reproduce the
# real CLI's name validation rather than to wave everything through, so property 1 is
# tested against the behaviour that actually caused it.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
# Defaults to the shipped script. The override exists so the canary's own failure path
# can be demonstrated against a deliberately broken copy (epistemic gate 7) without
# editing the real file; nothing in normal use sets it.
REAL_DEPLOY="${P890_DEPLOY_UNDER_TEST:-$REPO_ROOT/scripts/deploy-functions.sh}"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

ok()   { echo "PASS  $1"; PASS=$((PASS + 1)); }
bad()  { echo "FAIL  $1"; echo "        $2"; FAIL=$((FAIL + 1)); }

# --- PATH stubs -------------------------------------------------------------
STUBS="$TMPROOT/stubs"
mkdir -p "$STUBS"

# supabase: reproduces the real CLI's function-name validation, records every name it
# was asked to deploy, and fails for whatever $STUB_FAIL_FN names.
cat > "$STUBS/supabase" <<'STUB'
#!/bin/bash
# args: functions deploy <name> --project-ref <ref> [--no-verify-jwt]
fn="$3"
echo "$fn" >> "$STUB_RECORD_DEPLOYS"
if ! printf '%s' "$fn" | grep -qE '^[A-Za-z][A-Za-z0-9_-]*$'; then
  echo "Invalid Function name. Must start with at least one letter, and only include alphanumeric characters, underscores, and hyphens. (^[A-Za-z][A-Za-z0-9_-]*$)"
  exit 1
fi
if [ -n "${STUB_FAIL_FN:-}" ] && [ "$fn" = "$STUB_FAIL_FN" ]; then
  echo "upload failed"
  exit 1
fi
echo "Deployed Function $fn"
exit 0
STUB

# security: never reach the real login keychain (the PAT comes from the fake env file).
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"

chmod +x "$STUBS"/*

# --- Build the throwaway repo ----------------------------------------------
build_repo() {
  local root="$1"
  rm -rf "$root"
  mkdir -p "$root/scripts" "$root/supabase/functions"
  git -C "$root" init -q 2>/dev/null
  cp "$REAL_DEPLOY" "$root/scripts/deploy-functions.sh"
  chmod +x "$root/scripts/deploy-functions.sh"

  # Two real functions plus the _shared library — the shape of the actual tree.
  mkdir -p "$root/supabase/functions/_shared" \
           "$root/supabase/functions/alpha-fn" \
           "$root/supabase/functions/create-and-sign"
  : > "$root/supabase/functions/_shared/cors.ts"
  : > "$root/supabase/functions/alpha-fn/index.ts"
  : > "$root/supabase/functions/create-and-sign/index.ts"

  printf 'VITE_SUPABASE_URL=https://stub.supabase.co\nSUPABASE_ACCESS_TOKEN=sbp_stub\n' \
    > "$root/.env.prod"
  cp "$root/.env.prod" "$root/.env.local"

  # Sibling stubs, resolved by the script through SCRIPT_DIR.
  cat > "$root/scripts/check-edge-function-secrets.sh" <<'STUB'
#!/bin/bash
exit 0
STUB
  # Exits non-zero when $STUB_STAMP_EXIT says so — which is what the REAL script does
  # from inside a worktree, by design. An always-succeeding stub would hide that whole
  # branch, and did: the reviewer found it there.
  cat > "$root/scripts/stamp-deploy-manifest.sh" <<'STUB'
#!/bin/bash
echo "stamp" >> "$STUB_RECORD_ORDER"
if [ "${STUB_STAMP_EXIT:-0}" != "0" ]; then
  echo "ERROR: stamp-deploy-manifest.sh must run from the main repo root, not from a worktree."
  exit "$STUB_STAMP_EXIT"
fi
echo "Manifest stamped."
exit 0
STUB
  # A real .mjs so the script's own `node "$SMOKE_SCRIPT"` call is exercised.
  cat > "$root/scripts/edge-function-smoke.mjs" <<'STUB'
import { appendFileSync } from 'fs';
appendFileSync(process.env.STUB_RECORD_ORDER, 'smoke\n');
appendFileSync(process.env.STUB_RECORD_SMOKE, process.argv.slice(2).join(' ') + '\n');
process.exit(Number(process.env.STUB_SMOKE_EXIT || '0'));
STUB
  chmod +x "$root/scripts/check-edge-function-secrets.sh" \
           "$root/scripts/stamp-deploy-manifest.sh"
}

# run_deploy <label> <env-args...> — returns the script's exit code in $RC and fills
# $DEPLOYS / $SMOKE_ARGS / $ORDER with the recorded artifacts.
run_deploy() {
  local root="$TMPROOT/repo"
  build_repo "$root"
  # NO_SMOKE reproduces a partial checkout / bad cherry-pick: the deploy script is
  # present, the smoke it depends on is not.
  if [ -n "${NO_SMOKE:-}" ]; then rm -f "$root/scripts/edge-function-smoke.mjs"; fi
  RECORD_DEPLOYS="$TMPROOT/deploys.txt"; : > "$RECORD_DEPLOYS"
  RECORD_SMOKE="$TMPROOT/smoke.txt";     : > "$RECORD_SMOKE"
  RECORD_ORDER="$TMPROOT/order.txt";     : > "$RECORD_ORDER"

  OUT=$(cd "$root" && env PATH="$STUBS:$PATH" \
    STUB_RECORD_DEPLOYS="$RECORD_DEPLOYS" \
    STUB_RECORD_SMOKE="$RECORD_SMOKE" \
    STUB_RECORD_ORDER="$RECORD_ORDER" \
    STUB_FAIL_FN="${FAIL_FN:-}" \
    STUB_SMOKE_EXIT="${SMOKE_EXIT:-0}" \
    STUB_STAMP_EXIT="${STAMP_EXIT:-0}" \
    ${EDGE_SMOKE_VAL:+EDGE_SMOKE="$EDGE_SMOKE_VAL"} \
    bash ./scripts/deploy-functions.sh "$@" 2>&1)
  RC=$?
  DEPLOYS=$(cat "$RECORD_DEPLOYS")
  SMOKE_ARGS=$(cat "$RECORD_SMOKE")
  ORDER=$(tr '\n' ' ' < "$RECORD_ORDER")
}

echo "=== P890 — deploy-functions.sh post-deploy smoke ==="
echo

# --- 1. ACCEPT: the documented deploy-all-to-prod workflow still passes -----
FAIL_FN="" SMOKE_EXIT=0 EDGE_SMOKE_VAL="" run_deploy --env prod
if [ "$RC" -eq 0 ]; then
  ok "ACCEPT: \`deploy-functions.sh --env prod\` (deploy all) still exits 0"
else
  bad "ACCEPT: \`deploy-functions.sh --env prod\` (deploy all) still exits 0" \
      "exit $RC — output: $OUT"
fi

if ! printf '%s\n' "$DEPLOYS" | grep -qx '_shared'; then
  ok "_shared is never handed to \`supabase functions deploy\`"
else
  bad "_shared is never handed to \`supabase functions deploy\`" \
      "deploy list was: $(echo "$DEPLOYS" | tr '\n' ' ')"
fi

if [ "$(printf '%s\n' "$DEPLOYS" | sort | tr '\n' ' ')" = "alpha-fn create-and-sign " ]; then
  ok "exactly the real function directories are deployed"
else
  bad "exactly the real function directories are deployed" \
      "got: $(printf '%s\n' "$DEPLOYS" | sort | tr '\n' ' ')"
fi

# --- 2. the smoke gets only what this run deployed, and no _shared ----------
if echo "$SMOKE_ARGS" | grep -q -- '--only alpha-fn,create-and-sign'; then
  ok "the smoke is scoped to the functions this run deployed"
else
  bad "the smoke is scoped to the functions this run deployed" "smoke args: $SMOKE_ARGS"
fi

if echo "$SMOKE_ARGS" | grep -q -- '--base-url https://stub.supabase.co/functions/v1'; then
  ok "the smoke targets the deployed project's own functions base URL"
else
  bad "the smoke targets the deployed project's own functions base URL" "smoke args: $SMOKE_ARGS"
fi

# --- 3. ordering: manifest stamped BEFORE the smoke -------------------------
if [ "$ORDER" = "stamp smoke " ]; then
  ok "the manifest is stamped before the smoke runs"
else
  bad "the manifest is stamped before the smoke runs" "order was: '$ORDER'"
fi

# --- 4. REJECT: a failing smoke fails the deploy ----------------------------
FAIL_FN="" SMOKE_EXIT=1 EDGE_SMOKE_VAL="" run_deploy --env prod
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q 'post-deploy smoke failed'; then
  ok "REJECT: a failing smoke exits non-zero and says so (exit $RC)"
else
  bad "REJECT: a failing smoke exits non-zero and says so" "exit $RC — output: $OUT"
fi

# --- 5. REJECT: a genuinely failed upload is no longer masked ---------------
FAIL_FN="alpha-fn" SMOKE_EXIT=0 EDGE_SMOKE_VAL="" run_deploy --env prod
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q 'failed to deploy: alpha-fn'; then
  ok "REJECT: a failed upload exits non-zero and names the function (exit $RC)"
else
  bad "REJECT: a failed upload exits non-zero and names the function" "exit $RC — output: $OUT"
fi
if [ -z "$ORDER" ]; then
  ok "a failed upload stamps nothing and smokes nothing"
else
  bad "a failed upload stamps nothing and smokes nothing" "order was: '$ORDER'"
fi

# --- 6. ACCEPT: test/local deploys are unchanged (no smoke unless opted in) --
FAIL_FN="" SMOKE_EXIT=1 EDGE_SMOKE_VAL="" run_deploy
if [ "$RC" -eq 0 ] && [ -z "$SMOKE_ARGS" ]; then
  ok "ACCEPT: a local deploy runs no smoke, so a red smoke cannot break it"
else
  bad "ACCEPT: a local deploy runs no smoke" "exit $RC — smoke args: '$SMOKE_ARGS'"
fi

# --- 7. ACCEPT: EDGE_SMOKE=1 opts a non-prod deploy in ----------------------
FAIL_FN="" SMOKE_EXIT=0 EDGE_SMOKE_VAL="1" run_deploy
if [ "$RC" -eq 0 ] && [ -n "$SMOKE_ARGS" ]; then
  ok "ACCEPT: EDGE_SMOKE=1 opts a non-prod deploy into the smoke"
else
  bad "ACCEPT: EDGE_SMOKE=1 opts a non-prod deploy into the smoke" \
      "exit $RC — smoke args: '$SMOKE_ARGS'"
fi

# --- 8. EDGE_SMOKE=0 skips it on prod, loudly ------------------------------
FAIL_FN="" SMOKE_EXIT=1 EDGE_SMOKE_VAL="0" run_deploy --env prod
if [ "$RC" -eq 0 ] && [ -z "$SMOKE_ARGS" ] && echo "$OUT" | grep -q 'WARN: EDGE_SMOKE=0'; then
  ok "EDGE_SMOKE=0 skips the prod smoke and warns that it did"
else
  bad "EDGE_SMOKE=0 skips the prod smoke and warns that it did" \
      "exit $RC — smoke args: '$SMOKE_ARGS' — output: $OUT"
fi

# --- 9. a refused stamp must NOT cost us the smoke (found by codex review) --
# stamp-deploy-manifest.sh exits 1 by design from inside a worktree, and this script is
# built to run from one. Under `set -e` that abort would have skipped the smoke on the
# exact deploy path the feature exists to cover: uploaded to prod, never verified.
FAIL_FN="" SMOKE_EXIT=0 STAMP_EXIT=1 EDGE_SMOKE_VAL="" run_deploy --env prod
if echo "$ORDER" | grep -q 'smoke'; then
  ok "a refused manifest stamp does not skip the post-deploy smoke"
else
  bad "a refused manifest stamp does not skip the post-deploy smoke" \
      "order was: '$ORDER' — output: $OUT"
fi
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q 'Manifest NOT updated'; then
  ok "a refused manifest stamp still exits non-zero and says the manifest is stale"
else
  bad "a refused manifest stamp still exits non-zero and says the manifest is stale" \
      "exit $RC — output: $OUT"
fi

# --- 10. a missing smoke script fails CLOSED on prod (found by codex review) -
FAIL_FN="" SMOKE_EXIT=0 EDGE_SMOKE_VAL="" NO_SMOKE=1 run_deploy --env prod
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q 'requires a post-deploy smoke'; then
  ok "REJECT: a missing smoke script fails a prod deploy instead of warning (exit $RC)"
else
  bad "REJECT: a missing smoke script fails a prod deploy instead of warning" \
      "exit $RC — output: $OUT"
fi

# --- 11. ...but a local deploy, which needs no smoke, is untouched by that ---
FAIL_FN="" SMOKE_EXIT=0 EDGE_SMOKE_VAL="" NO_SMOKE=1 run_deploy
if [ "$RC" -eq 0 ]; then
  ok "ACCEPT: a local deploy with no smoke script still exits 0"
else
  bad "ACCEPT: a local deploy with no smoke script still exits 0" "exit $RC — output: $OUT"
fi

echo
if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: $PASS passed, $FAIL failed"
  exit 1
fi
echo "RESULT: all $PASS checks passed"
