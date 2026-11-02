#!/usr/bin/env bash
# P1592: pinned erasure interleavings against the self-hosted TEST database (psql sessions held open over
# gcloud IAP SSH, parked on advisory-lock barriers). Opt-in because it needs gcloud and the TEST VM; the spec
# is skipped everywhere else. Exit code is playwright's: non-zero when a title, member list or message still names or carries the
# erased person.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export P1592_INTERLEAVING=1
exec npx playwright test --project=integration e2e/integration/p1592-erasure-interleaving.spec.ts "$@"
