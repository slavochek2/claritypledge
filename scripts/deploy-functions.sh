#!/bin/bash
# scripts/deploy-functions.sh — Deploy edge functions to Supabase + stamp deploy manifest
#
# Usage:
#   ./scripts/deploy-functions.sh                    # deploy all to test (default)
#   ./scripts/deploy-functions.sh --env prod         # deploy all to prod
#   ./scripts/deploy-functions.sh generate-banner    # deploy one function to test
#   ./scripts/deploy-functions.sh generate-banner --env prod  # deploy one function to prod
#   ./scripts/deploy-functions.sh fn-a fn-b --env prod        # deploy several named functions (P1690)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Derive project dir from git root of CWD — works correctly from worktrees.
# SCRIPT_DIR follows symlinks and always resolves to main repo; do NOT use it for PROJECT_DIR.
PROJECT_DIR="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/supabase/deploy-manifest.json"
FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"

# --- Parse args ---
ENV_NAME="local"
# P1690: every positional argument is a function name, kept in order and once each. They used to
# share one variable, so `a b --env prod` deployed and stamped only `b` and reported success.
FUNCTION_NAMES=()
prev_arg=""
# P1690: --env must carry a value. `fn --env`, `--env=` and `--env --help` used to fall through to
# a TEST deploy with exit 0 when the operator meant prod; `--env` alone deployed everything there.
# Each value is checked where it is read, so a later valid --env cannot hide an earlier empty one,
# and `--env --env prod` is refused instead of reading the second --env as the first one's value.
# Which names are valid is not decided here: anything else that is not "prod" still means TEST.
refuse_env_value() {
  echo "ERROR: --env needs a value, for example --env prod. Nothing was deployed." >&2
  exit 1
}
for arg in "$@"; do
  if [ "$prev_arg" = "--env" ]; then
    # This argument is the value of --env, whatever it looks like.
    if [ -z "$arg" ] || [[ "$arg" == -* ]]; then refuse_env_value; fi
    ENV_NAME="$arg"
  elif [ "$arg" = "--env" ]; then
    :  # next iteration picks the value
  elif [[ "$arg" == --env=* ]]; then
    ENV_NAME="${arg#--env=}"
    if [ -z "$ENV_NAME" ] || [[ "$ENV_NAME" == -* ]]; then refuse_env_value; fi
  elif [[ "$arg" != -* ]]; then
    if [ -z "$arg" ]; then
      # An empty name (an unset variable in quotes) used to count as "no name": deploy everything.
      echo "ERROR: an empty function name was given. Nothing was deployed." >&2
      exit 1
    fi
    # Bare function names only, the rule the self-hosted script has always had. Without it
    # `alpha-fn _shared`, `alpha-fn beta-fn/` (tab completion) or `alpha-fn ./x` passed the
    # directory check, uploaded `alpha-fn`, and only then failed on the name the CLI refuses.
    # `beta-fn/` would also miss its entry in the no-verify-jwt list.
    if ! [[ "$arg" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
      echo "ERROR: not a function name: '$arg'. Nothing was deployed." >&2
      exit 1
    fi
    name_seen=0
    for name_prev in ${FUNCTION_NAMES[@]+"${FUNCTION_NAMES[@]}"}; do
      if [ "$name_prev" = "$arg" ]; then name_seen=1; fi
    done
    if [ "$name_seen" = 0 ]; then FUNCTION_NAMES+=("$arg"); fi
  fi
  prev_arg="$arg"
done
# --env as the last argument has no value either.
if [ "$prev_arg" = "--env" ]; then refuse_env_value; fi

# --- TEST follows the active server (P1606; migrate.sh has done this since P1591) ---
# Fails closed when the active server is unknown. Hosted is reached only when it is active, or by an
# explicit --env hosted-test with the founder's decision on record.
EXPLICIT_HOSTED=false
if [ "$ENV_NAME" = "hosted-test" ]; then
  EXPLICIT_HOSTED=true
  if [ -z "$(printf '%s' "${CP_HOSTED_TEST_REASON:-}" | tr -d '[:space:]')" ]; then
    # shellcheck source=lib/active-test.sh
    source "$SCRIPT_DIR/lib/active-test.sh"
    # A write: only a resolved "hosted" passes without a decision. Unknown state refuses too.
    if [ "$(active_test_target 2>/dev/null || true)" != "hosted" ]; then
      echo "REFUSED: hosted TEST is switched off; the founder decides when it is switched on. Nothing was deployed." >&2
      echo "  See docs/technical/hosted-test-parity.md." >&2
      exit 1
    fi
  fi
fi
if [ "$EXPLICIT_HOSTED" = true ]; then
  # The code below keys its test behaviour, including the manifest stamp, off ENV_NAME=local.
  ENV_NAME="local"
elif [ "$ENV_NAME" != "prod" ]; then
  # shellcheck source=lib/active-test.sh
  source "$SCRIPT_DIR/lib/active-test.sh"
  ACTIVE_TARGET=$(active_test_target) || { echo "ERROR: cannot resolve the active TEST server (see above). Nothing was deployed." >&2; exit 1; }
  if [ "$ACTIVE_TARGET" = "selfhosted" ]; then
    # The opt-in smoke lives in the hosted body below. Say so before deploying, never skip it silently.
    if [ "${EDGE_SMOKE:-}" = "1" ]; then
      echo "REFUSED: EDGE_SMOKE=1 is not available on self-hosted TEST, so it could not run. Nothing was deployed." >&2
      exit 1
    fi
    # P1612: the TEST deploy lock is taken by the self-hosted script itself, so every entry point
    # (this wrapper, a direct run, a landing) is serialized the same way.
    "$SCRIPT_DIR/selfhosted/deploy-functions.sh" ${FUNCTION_NAMES[@]+"${FUNCTION_NAMES[@]}"}
    exit $?
  fi
fi

# --- Every named function must exist (P1690) ---
# Checked here, before the env file is read and before the prod token is asked for, so one bad name
# refuses the whole call: nothing uploaded, and no authorization dialog spent on a typo.
for fn in ${FUNCTION_NAMES[@]+"${FUNCTION_NAMES[@]}"}; do
  if [ ! -d "$FUNCTIONS_DIR/$fn" ]; then
    echo "ERROR: Function directory not found: $FUNCTIONS_DIR/$fn. Nothing was deployed."
    exit 1
  fi
done

# --- Is this a worktree, and where is the main checkout? (prod only, P1690) ---
# The main checkout is the parent of git's common directory, whichever worktree this runs in. Only
# a common directory named .git sits inside a checkout: a bare repository, or a git directory kept
# somewhere else, has no main checkout, and its parent is an unrelated folder that must not be searched.
MAIN_CHECKOUT=""
IN_WORKTREE=0
if [ "$ENV_NAME" = "prod" ]; then
  MAIN_GIT_DIR="$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$MAIN_GIT_DIR" ] && [ "$(basename "$MAIN_GIT_DIR")" = ".git" ]; then
    MAIN_CHECKOUT="$(dirname "$MAIN_GIT_DIR")"
    if [ "$MAIN_CHECKOUT" != "$PROJECT_DIR" ]; then IN_WORKTREE=1; fi
  fi
fi

# --- Determine project ref ---
if [ "$ENV_NAME" = "prod" ]; then
  ENV_FILE="$PROJECT_DIR/.env.prod"
else
  ENV_FILE="$PROJECT_DIR/.env.local"
fi

OWN_ENV_FILE="$ENV_FILE"
if [ ! -f "$ENV_FILE" ] && [ "$IN_WORKTREE" = 1 ]; then
  # .env.prod is gitignored: it exists only in the main checkout, never in a worktree. Fall back
  # to the main checkout's copy so a prod deploy works from any worktree. P1690: this used to be
  # the parent of SCRIPT_DIR, from when a worktree's scripts/ was a link to main's; scripts/ is a
  # native checkout in every worktree now, so that named the worktree again and never main.
  ENV_FILE="$MAIN_CHECKOUT/.env.prod"
fi
if [ ! -f "$ENV_FILE" ]; then
  if [ "$ENV_FILE" != "$OWN_ENV_FILE" ]; then
    echo "ERROR: .env.prod not found in this checkout ($OWN_ENV_FILE) or in the main checkout ($ENV_FILE). Nothing was deployed."
  else
    echo "ERROR: $ENV_FILE not found. Nothing was deployed."
  fi
  exit 1
fi

# A prod deploy from a worktree ships the worktree's code, and the manifest stamp refuses to run
# from this repository's worktrees. Said here, before the prod token is asked for, because the
# remedy a stamp failure prints (re-stamp from the main checkout) records MAIN's source: run before
# the branch is merged, it makes the drift check report prod in sync while prod runs the branch
# (P1690 review).
if [ "$IN_WORKTREE" = 1 ]; then
  echo "NOTICE: this run deploys this worktree's code to prod: $PROJECT_DIR"
  if [ "$ENV_FILE" != "$OWN_ENV_FILE" ]; then
    echo "        .env.prod was read from the main checkout: $ENV_FILE"
  fi
  # The stamp refuses by PATH, not by asking git (stamp-deploy-manifest.sh: its guard is the test
  # copied on the next line). A worktree kept somewhere else is not refused, so the non-zero exit
  # is promised only where it will happen. scripts/test-p1690-deploy-args.sh fails if the stamp's
  # guard stops being this test.
  if [[ "$PWD" == *".claude/worktrees"* ]]; then
    echo "        The manifest stamp refuses to run from a path under .claude/worktrees,"
    echo "        so this run will end non-zero after the upload and the smoke. That is expected."
  fi
  echo "        Do not re-stamp from the main checkout until this branch is merged: before the merge,"
  echo "        a stamp from main records main's source, not the code prod is running."
fi
# Printed under every re-stamp hint below when this run is in a worktree.
restamp_caveat() {
  if [ "$IN_WORKTREE" = 1 ]; then
    echo "       Run that re-stamp only AFTER this branch is merged. Until then the main checkout holds"
    echo "       main's source, and a stamp from it would record code that prod is not running."
  fi
}

SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d. -f1)

# Get PAT for deployment (P1214 / P1239).
# prod — ONLY the locked keyring item: one authorization dialog per deploy. Not .env.prod's
#   plaintext copy and not the Supabase CLI's saved login, both readable with no prompt.
# test/local — .env.local's SUPABASE_TEST_FUNCTIONS_TOKEN: scoped to the test project (edge functions
#   read-write, function secrets read), refused by prod (P1318). Never the account-wide token, which
#   reaches prod. The CLI's saved login is no longer a fallback.
if [ "$ENV_NAME" = "prod" ]; then
  # shellcheck source=keyring.sh
  source "$SCRIPT_DIR/keyring.sh"
  if ! KEYRING_REASON="${KEYRING_REASON:-deploy-functions.sh --env prod}" \
       keyring_require PROD_SUPABASE_ACCESS_TOKEN; then
    echo "ERROR: the prod management token was not unlocked — nothing was deployed."
    exit 1
  fi
  SUPABASE_PAT="$PROD_SUPABASE_ACCESS_TOKEN"
else
  SUPABASE_PAT=$(grep "^SUPABASE_TEST_FUNCTIONS_TOKEN=" "$ENV_FILE" | cut -d= -f2- || true)
  if [ -z "$SUPABASE_PAT" ]; then
    echo "ERROR: SUPABASE_TEST_FUNCTIONS_TOKEN is empty in $ENV_FILE — nothing was deployed."
    exit 1
  fi
fi

export SUPABASE_ACCESS_TOKEN="$SUPABASE_PAT"
# Tells check-edge-function-secrets.sh the exported token was resolved FOR this project, so it
# reuses it instead of raising a second dialog — and ignores an ambient SUPABASE_ACCESS_TOKEN
# that nobody resolved for this ref.
export CP_SUPABASE_TOKEN_REF="$PROJECT_REF"

# --- Build list of functions to deploy ---
if [ ${#FUNCTION_NAMES[@]} -gt 0 ]; then
  # P1690: every name given, each already checked above (a bare name with a directory).
  FUNCTIONS=("${FUNCTION_NAMES[@]}")
else
  FUNCTIONS=()
  for dir in "$FUNCTIONS_DIR"/*/; do
    [ -d "$dir" ] || continue
    fn_base="$(basename "$dir")"
    # P890: skip underscore-prefixed directories. `_shared` is a library, not a
    # function: `supabase functions deploy _shared` fails its own name validation
    # ("Invalid Function name ... ^[A-Za-z][A-Za-z0-9_-]*$", exit 1). That failure was
    # invisible while the deploy ran through `| tail -1`, which returned TAIL's status;
    # once the exit code is read honestly (below) an unfiltered list would abort every
    # deploy-all run. The manifest is unaffected — stamp-deploy-manifest.sh walks the
    # directory itself and keeps hashing `_shared`.
    case "$fn_base" in _*) continue ;; esac
    FUNCTIONS+=("$fn_base")
  done
fi

if [ ${#FUNCTIONS[@]} -eq 0 ]; then
  echo "No edge functions found in $FUNCTIONS_DIR"
  exit 0
fi

# --- Pre-deploy secret check (P834) ---
# Verifies every referenced env var without a real code-level fallback exists
# on the target project. SKIP_EDGE_SECRET_CHECK=1 exists for first-run
# bootstrap deploys where the function and its secret are added together.
if [ "${SKIP_EDGE_SECRET_CHECK:-0}" = "1" ]; then
  echo "WARN: SKIP_EDGE_SECRET_CHECK=1 : secret hygiene check bypassed"
else
  CHECK_SCRIPT="$SCRIPT_DIR/check-edge-function-secrets.sh"
  if [ -x "$CHECK_SCRIPT" ]; then
    if ! "$CHECK_SCRIPT" --env "$ENV_NAME"; then
      echo ""
      echo "ERROR: secret hygiene check failed for $ENV_NAME. Set the missing secrets above before deploying."
      echo "       To bypass for a bootstrap deploy: SKIP_EDGE_SECRET_CHECK=1 $0 $*"
      exit 1
    fi
  fi
fi

# --- JWT policy list (P1557) ---
# Fail closed on a missing list: silently deploying create-and-sign WITH jwt verification would
# break anonymous invitees on the target, with no error at deploy time.
NO_VERIFY_JWT_FILE="$PROJECT_DIR/supabase/no-verify-jwt-functions.txt"
if [ ! -f "$NO_VERIFY_JWT_FILE" ]; then
  echo "ERROR: $NO_VERIFY_JWT_FILE not found — nothing was deployed."
  exit 1
fi
is_no_verify_jwt() {
  grep -qxF "$1" < <(grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$NO_VERIFY_JWT_FILE")
}

# --- Deploy ---
echo "Deploying ${#FUNCTIONS[@]} function(s) to $ENV_NAME ($PROJECT_REF)..."
DEPLOYED=()
FAILED=()

for fn in "${FUNCTIONS[@]}"; do
  echo -n "  $fn... "
  # create-and-sign is reached by anonymous invitees before they have a Supabase account
  # (since P1487 it validates the invitation and emails a sign-in link to the invited address;
  # it never returns a session).
  # --no-verify-jwt lets those unauthenticated requests through the gateway.
  # P1380: event-email-link is opened from an inbox with no session; its ticket is the
  # credential (hashed, scoped to one page of one event, dies with the event).
  # All other functions require a valid JWT and must NOT use this flag.
  # The list lives in supabase/no-verify-jwt-functions.txt (P1557: the self-hosted router
  # reads the same file, so the two targets cannot drift).
  if is_no_verify_jwt "$fn"; then
    DEPLOY_FLAGS="--no-verify-jwt"
  else
    DEPLOY_FLAGS=""
  fi
  # P890: `supabase ... | tail -1` returned TAIL's status, not the deploy's, so every
  # failed upload was recorded as DEPLOYED and the manifest stamped as if it had landed.
  # That also defeats the post-deploy smoke below: the previous, still-working function
  # answers the probe, so a silently failed deploy leaves prod on stale code and reports
  # success twice. Capture the output to a file and test the deploy's own exit code.
  DEPLOY_LOG=$(mktemp)
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF" $DEPLOY_FLAGS >"$DEPLOY_LOG" 2>&1; then
    tail -1 "$DEPLOY_LOG"
    DEPLOYED+=("$fn")
  else
    echo "FAILED"
    tail -5 "$DEPLOY_LOG"
    FAILED+=("$fn")
  fi
  rm -f "$DEPLOY_LOG"
done

# P1620: stamp exactly the functions that uploaded, never "everything". A partial failure stamps
# its successes (they ARE live) and leaves the failures with their old hash, so they stay reported.
stamp_deployed() {
  local args=() fn
  for fn in ${DEPLOYED[@]+"${DEPLOYED[@]}"}; do args+=(--function "$fn"); done
  "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --functions-only ${args[@]+"${args[@]}"}
}

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "ERROR: ${#FAILED[@]} function(s) failed to deploy: ${FAILED[*]}"
  if [ ${#DEPLOYED[@]} -gt 0 ]; then
    if stamp_deployed; then
      echo "Manifest stamped for the ${#DEPLOYED[@]} that deployed: ${DEPLOYED[*]}. The failed ones stay reported as drift."
    else
      echo "ERROR: manifest stamp for the successful deploys also failed; re-stamp from the main repo root: ./scripts/stamp-deploy-manifest.sh --env $ENV_NAME --functions-only$(printf ' --function %s' "${DEPLOYED[@]}")"
      restamp_caveat
    fi
  fi
  exit 1
fi

# --- Stamp manifest ---
# Stamped BEFORE the smoke, deliberately. The upload has landed: prod is running this
# code whether or not it answers its probes. A manifest left unstamped would make
# check-deploy-manifest.sh report FUNCTION_STALE ("local code changed since last
# deploy") for functions that did deploy, and the drift alarm would describe the wrong
# failure.
#
# NOT under `set -e`: stamp-deploy-manifest.sh refuses to run from inside a worktree
# (it exits 1 by design), and this script is explicitly built to work from one — see
# the PROJECT_DIR comment at the top. Letting `set -e` abort here would mean a worktree
# deploy uploads to prod and then skips the post-deploy smoke entirely, which is the
# one thing this feature exists to prevent. Record the failure, run the smoke anyway,
# and exit non-zero at the end.
STAMP_OK=1
if ! stamp_deployed; then
  STAMP_OK=0
  echo "ERROR: manifest stamp failed — the functions ARE deployed but the manifest does"
  echo "       not record it, so drift checks will misreport. Re-stamp from the main"
  echo "       repo root, naming exactly what deployed (a bare stamp is refused, P1620):"
  echo "       ./scripts/stamp-deploy-manifest.sh --env $ENV_NAME --functions-only$(printf ' --function %s' "${DEPLOYED[@]}")"
  restamp_caveat
fi
echo ""
if [ "$STAMP_OK" -eq 1 ]; then
  echo "Deployed ${#DEPLOYED[@]} function(s). Manifest updated."
else
  echo "Deployed ${#DEPLOYED[@]} function(s). Manifest NOT updated (see above)."
fi

# --- Post-deploy smoke (P890) ---
# Deploy success is upload success: a bundle that throws at invocation time uploads
# fine and 500s for every real user until Sentry or a person notices. Smoke ONLY the
# functions this run deployed (no blanket prod traffic per deploy).
#
# Prod is smoked by default. Test/local deploys are NOT, so the existing test-deploy
# loop is unchanged — opt in with EDGE_SMOKE=1. Every probe is credential-free and
# lands on a refusal path: no email, no payment, no write.
SMOKE_SCRIPT="$SCRIPT_DIR/edge-function-smoke.mjs"
if [ "${EDGE_SMOKE:-}" = "0" ]; then
  echo "WARN: EDGE_SMOKE=0 : post-deploy smoke skipped"
elif [ "$ENV_NAME" = "prod" ] || [ "${EDGE_SMOKE:-}" = "1" ]; then
  if [ -f "$SMOKE_SCRIPT" ]; then
    echo ""
    if ! node "$SMOKE_SCRIPT" --base-url "$SUPABASE_URL/functions/v1" --only "$(IFS=,; echo "${DEPLOYED[*]}")"; then
      echo ""
      # Say what the manifest really holds: after a failed stamp it does not record this upload.
      if [ "$STAMP_OK" -eq 1 ]; then
        echo "ERROR: post-deploy smoke failed. The upload succeeded and the manifest records it,"
      else
        echo "ERROR: post-deploy smoke failed. The upload succeeded and the manifest was NOT updated (see above),"
      fi
      echo "       but at least one function is not answering as expected — see the named"
      echo "       function(s) above."
      exit 1
    fi
  else
    # Fail CLOSED. A missing smoke on a run that requires one (prod, or an explicit
    # opt-in) means the deploy has no post-deploy verification at all — a partial
    # checkout or a bad cherry-pick would otherwise deploy prod and report success,
    # which is exactly the unverified-deploy state this feature closes.
    echo ""
    echo "ERROR: $SMOKE_SCRIPT not found, but this run requires a post-deploy smoke."
    echo "       The functions ARE deployed and are now unverified. Restore the script"
    echo "       and run: npm run smoke:edge"
    exit 1
  fi
fi

if [ "$STAMP_OK" -eq 0 ]; then
  exit 1
fi
