#!/usr/bin/env bash
# P1557: run the specs that need raw SQL against hosted TEST. Only hosted TEST has the Management API,
# so these skip on the self-hosted server. Unsetting the self-hosted target makes dotenv fall back to
# .env.test.local (hosted). Keep the list in step with the specs: src/tests/p1557-test-target.test.ts.
set -euo pipefail
exec env -u SUPABASE_URL -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY -u SELFHOSTED_TEST_ORIGIN \
  npx playwright test --project=integration \
  e2e/integration/p1515-artifact-sharing.spec.ts \
  e2e/integration/p520-account-deletion.spec.ts \
  e2e/integration/20261014160000_p1491_delivery_status_token_binding.spec.ts \
  e2e/integration/p506-backfill-hashtags.spec.ts \
  e2e/integration/p1222-public-agreement-pii.spec.ts \
  "$@"
