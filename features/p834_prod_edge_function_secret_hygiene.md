---
status: qa
type: task
rank: 1000765.0
severity: medium
workstream: infra
date_reported: '2026-05-15'
created_date: '2026-05-15'
tags: [edge-functions, secrets, infra, hardening]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
flow: fix
---

# P834: Prod edge function secret hygiene gap

## Summary

No system enforces that env vars referenced by edge functions are configured on the prod Supabase project — `IP_HASH_SECRET` was silently absent on prod and caused user-visible "Server misconfiguration" errors on the letter landing page until hotfixed manually.

## Root Cause

`supabase/functions/create-and-open-letter/index.ts:65` and `create-and-sign/index.ts:61` both hard-fail with HTTP 500 + message "Server misconfiguration" when `IP_HASH_SECRET` is missing. The var was set in `.env.local` but never pushed to the prod project (`besjtuodziykmjidubzw`). Audit of all `Deno.env.get` calls vs `supabase secrets list` shows 5 referenced vars were missing on prod; 4 had safe code-level fallbacks (`APP_URL`, `GCS_CLOUD_FUNCTION_URL`, `MAILGUN_FROM`, `TALLY_FORM_ID`) and only `IP_HASH_SECRET` was hard-fail.

The hotfix (set `IP_HASH_SECRET` to a fresh `openssl rand -hex 32` value via `supabase secrets set`) stops the bleed. This spec covers the systemic gap so the next new edge function var doesn't repeat the outage.

Three coupled deliverables, single root cause:

1. **No deploy-time check** that referenced vars exist on the target project.
2. **Error message leaks implementation detail** — "Server misconfiguration" tells an attacker the cause; same pattern likely in other 500 paths.
3. **Prod secret values are unrecoverable** — `IP_HASH_SECRET` now only lives on Supabase. If project rebuilt, secret is lost. Pattern matters even when the specific impact is low.

## Reproduction Steps

Original outage (now mitigated):

1. Open https://claritypledge.com letter delivery link on mobile (any "For X" landing page).
2. Tap "Open the Letter".
3. Observe: red error box renders "Server misconfiguration" below the CTA.
4. Edge function logs would show `[create-and-open-letter] IP_HASH_SECRET not configured`.

Reproducing the systemic gap (current state):

1. Add a new `Deno.env.get('NEW_REQUIRED_VAR')` with hard-fail to any edge function in `supabase/functions/`.
2. Deploy via `supabase functions deploy <name>`.
3. No CI/pre-deploy step flags that `NEW_REQUIRED_VAR` is absent from prod secrets.
4. Bug ships silently. Discovered only when a user hits the broken path.

**Reproduction rate:** 100% (deterministic for any new hard-fail var)

## Expected Behavior

- A check (script + CI hook or pre-commit) fails the deploy if any referenced env var with no code-level fallback is absent from the target project's secrets.
- User-facing 500 messages do not leak server implementation details.
- Every prod-required secret has a documented source of truth so it can be regenerated or recovered if the project is rebuilt.

## Actual Behavior

- No check exists. Outages are discovered by users in prod.
- "Server misconfiguration" is rendered verbatim from edge function to user-facing error UI.
- `IP_HASH_SECRET` (and likely other prod secrets) only exist in the Supabase secrets store — no registry or recovery doc.

## Affected Files

- `supabase/functions/create-and-open-letter/index.ts:66` — error string leak
- `supabase/functions/create-and-sign/index.ts:62` — same string leak
- `supabase/functions/**/*.ts` — sweep all `jsonResponse(..., 500, ...)` calls for similar leaks
- `scripts/` — new script needed (`check-edge-function-secrets.sh` or similar)
- `.private/docs/accounts.md` or new `.private/docs/edge-function-secrets.md` — registry doc
- `scripts/pre-commit-checks.sh` or CI workflow — wire the new check in

## Severity

**Medium** — the acute outage is mitigated. The systemic gap is real but not currently blocking any user. High likelihood of recurrence on any new edge function deploy with a new required var.

## Fix Approach

Three deliverables, one PR (or one branch with three commits):

1. **Deploy-check script.** Parse all `Deno.env.get('<NAME>')` calls in `supabase/functions/**/*.ts`. For each, detect whether it has a fallback (`?? '...'` or similar). Diff vars without fallback against `supabase secrets list --project-ref <ref>` for both test and prod. Exit non-zero if any "must-set" var is missing. Optionally also list vars with hardcoded fallbacks so we can decide per-var: promote to required secret or document the fallback. Wire into `scripts/pre-commit-checks.sh` or a make target so it runs before any edge function deploy.

2. **Error message hardening.** Replace "Server misconfiguration" in both `create-and-open-letter/index.ts:66` and `create-and-sign/index.ts:62` with a generic user-facing string ("Couldn't open this letter. Please try again."). Keep the real reason in `console.error` only. Sweep all `jsonResponse(..., 500, ...)` calls across `supabase/functions/` for similar leaks and harden them in the same commit.

3. **Recoverable storage.** Add `.private/docs/edge-function-secrets.md` (or extend `.private/docs/accounts.md`) listing every prod edge function secret: name, generator command (e.g. `openssl rand -hex 32`), where else the value is stored (if anywhere), rotation policy. Document `IP_HASH_SECRET` specifically with the value set on 2026-05-15.

## Acceptance Criteria

- [x] Running the new deploy-check script against current prod exits 0 (no missing must-set vars) — proves the check works and the current state is clean.
- [x] Adding a fake `Deno.env.get('FAKE_REQUIRED')` with no fallback and running the script exits non-zero with a clear message naming the missing var and target project — proves the check actually catches regressions.
- [x] Grepping `supabase/functions/` for `"Server misconfiguration"` returns zero matches. No HTTP 500 response body across `supabase/functions/` contains the string `"misconfig"` (case-insensitive).
- [x] `.private/docs/edge-function-secrets.md` (or equivalent) exists and lists at least `IP_HASH_SECRET` with provenance.
- [x] No console errors or regressions during the letter-opening flow after the error-message change. Verified on test env 2026-05-15: deployed `create-and-open-letter` to `gfjctyxqlwexxwsmkakq`; unset `IP_HASH_SECRET`; hit endpoint → got `HTTP 500 {"error":"INTERNAL","message":"Couldn't open this letter. Please try again."}` (no `Server misconfiguration` leak). Restored secret; same endpoint with bogus token → `HTTP 400 INVALID_INPUT` (env guard cleared, validation works). All 6 modified functions deployed.
