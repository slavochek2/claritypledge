---
status: week
type: bug
rank: 86
severity: medium
workstream: infrastructure
date_reported: '2026-08-28'
created_date: '2026-08-28'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [edge-functions, auth, secrets, api-key-migration]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1189: `generate-banner` uses the database master key as its service-to-service shared secret

## Summary

The point-banner path in `generate-banner` authorizes callers by comparing an `x-service-key` header
against `SUPABASE_SERVICE_ROLE_KEY` — using the database master key as a service credential, on a key
the API-key migration is retiring.

## Root Cause

`supabase/functions/generate-banner/index.ts:449-450`:

```ts
const serviceKeyHeader = req.headers.get('x-service-key');
if (!serviceKeyHeader || serviceKeyHeader !== SUPABASE_SERVICE_ROLE_KEY) { ...403 }
```

The check itself is correct and does **not** fail silently — unlike P1178, the receiver expects this
credential deliberately and rejects a caller that lacks it. Two things make it worth changing anyway:

1. The service-role key is the database master credential. A service-to-service caller needs to prove
   it is trusted, not to hold full DB authority, and every extra place the key travels widens where a
   leak can originate.
2. The P46 API-key migration retires the legacy `service_role` key. When it goes, any caller sending
   the old value stops matching and the point-banner path fails — a scheduled breakage with no test
   covering it.

**No caller in this repo sends `x-service-key`** — grep across `supabase/functions/`, `src/` and
`scripts/` returns only the two lines above (the check itself). Whoever invokes this path does so from
outside the repo, so the blast radius of a change cannot be established from the codebase alone. That
unknown is the first thing to resolve.

## Invariants

- The credential a caller presents to prove it is an internal service must not also be a credential
  that grants direct database authority.

## Reproduction Steps

Not a runtime failure today — this is a latent break plus a credential-hygiene defect. To observe the
current shape:

1. `grep -rn "x-service-key" supabase/functions/ src/ scripts/` → only `generate-banner/index.ts:449-450`
2. Read `generate-banner/index.ts:447-460` — the point path skips JWT validation and rate limiting
   entirely once the header matches
3. Confirm the covering test asserts only the refusal: `edge-fn-authz-regression.spec.ts` →
   "point: rejects user request without x-service-key header (403)". Nothing exercises the accept path.

**Reproduction rate:** n/a — latent

## Expected Behavior

The point-banner path is authorized by a purpose-made shared secret (the `WEBHOOK_SECRET` /
`CRON_SECRET` / `GCS_UPLOAD_SECRET` / `INTERNAL_FN_SECRET` pattern), so retiring the legacy
`service_role` key cannot break it and the master key does not travel as a request header.

## Actual Behavior

Authorization is a string comparison against `SUPABASE_SERVICE_ROLE_KEY`, and the caller lives outside
this repo.

## Affected Files

- `supabase/functions/generate-banner/index.ts:447-460` — the point-path service-key branch
- `e2e/integration/edge-fn-authz-regression.spec.ts` — covers the refusal, not the accept path

## Severity

**Medium** — nothing is broken today and the guard does reject unauthorized callers, but it is a
master credential used as a service secret with a migration deadline attached and an unidentified
external caller.

## Fix Approach

1. **Identify the caller first** — find what sends `x-service-key` (outside this repo). Rotating the
   credential without knowing the caller breaks point banners silently.
2. Introduce a dedicated secret and accept it alongside the current check, so caller and receiver can
   be cut over independently.
3. Remove the `SUPABASE_SERVICE_ROLE_KEY` comparison once the caller is confirmed migrated.
4. Add an accept-path test, not only the existing refusal test — P1178 is the precedent for a
   service-to-service path that was 100% broken while every happy-path test stayed green.

Reference implementation: P1178 (`INTERNAL_FN_SECRET` on `send-agreement-emails`), which pairs a
shared secret with an action allowlist and a state check so a leaked secret has bounded reach.

## Acceptance Criteria

- [ ] The caller that sends `x-service-key` is identified and named in this spec
- [ ] Point-banner generation succeeds using the new dedicated secret, proven by a test that exercises
      the accept path (not only the 403)
- [ ] `grep -rn "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/generate-banner/index.ts` shows the key
      used only for its DB client, never for caller authorization
- [ ] The existing "rejects user request without x-service-key header (403)" test still passes
