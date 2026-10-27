#!/usr/bin/env bash
# P1557: run the specs that need raw SQL against hosted TEST. Only hosted TEST has the Management API,
# so these skip on the self-hosted server. Keep the list in step with the specs:
# src/tests/p1557-test-target.test.ts.
#
# Target: when .env.test.local carries HOSTED_TEST_* lines (written at the switch, once its main
# values point at the self-hosted server), those become the run's values. Otherwise the file's main
# values are hosted already and dotenv supplies them. Values are exported, never put in argv.
set -euo pipefail
ROOT="$(git -C "$(pwd)" rev-parse --show-toplevel)"
ENV_FILE="$ROOT/.env.test.local"
unset SUPABASE_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SELFHOSTED_TEST_ORIGIN

val() { { grep -m1 -E "^$1=" "$ENV_FILE" 2>/dev/null || true; } | cut -d= -f2- | sed -E 's/^["'"'"']//; s/["'"'"']$//'; }
hosted_url="$(val HOSTED_TEST_SUPABASE_URL)"
if [ -n "$hosted_url" ]; then
  case "$hosted_url" in
    https://ayibkeoyukulbsjpxgaw.supabase.co) ;;
    *) echo "ERROR: HOSTED_TEST_SUPABASE_URL in .env.test.local is not hosted TEST. Nothing was run." >&2; exit 1 ;;
  esac
  anon="$(val HOSTED_TEST_ANON_KEY)"; service="$(val HOSTED_TEST_SERVICE_ROLE_KEY)"
  [ -n "$anon" ] && [ -n "$service" ] || { echo "ERROR: HOSTED_TEST_ANON_KEY or HOSTED_TEST_SERVICE_ROLE_KEY missing. Nothing was run." >&2; exit 1; }
  export VITE_SUPABASE_URL="$hosted_url" SUPABASE_URL="$hosted_url" VITE_SUPABASE_ANON_KEY="$anon" SUPABASE_SERVICE_ROLE_KEY="$service"
fi

exec npx playwright test --project=integration \
  e2e/integration/p1515-artifact-sharing.spec.ts \
  e2e/integration/p520-account-deletion.spec.ts \
  e2e/integration/20261014160000_p1491_delivery_status_token_binding.spec.ts \
  e2e/integration/p506-backfill-hashtags.spec.ts \
  e2e/integration/p1222-public-agreement-pii.spec.ts \
  "$@"
