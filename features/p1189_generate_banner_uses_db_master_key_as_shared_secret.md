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
delivery_stage: ship
pipeline_ran: [create-bug, inline, ship]
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

## Root cause correction (2026-09-01)

**The caller does not exist.** A dedicated secaudit lane (repo + full git history, `.private/`,
`pp/`, and the deployed gcloud Cloud Run/Scheduler jobs) found zero senders of the `x-service-key`
header anywhere. `grep -rn "x-service-key" supabase/functions/ src/ scripts/` only ever matched the
check itself (`generate-banner/index.ts:449-450`, pre-fix). P803's dead-code sweep independently
confirmed the same fact from a different angle: point banners were removed by **P519** (2026-03-14,
`docs/decisions.md`), and no client code anywhere constructs a `generate-banner` request with
`entityType: 'point'` — `banner-utils.ts`'s `generateAIBanner()` is only ever called with `'event'`
and `'story'` literals (`events-service-real.ts:482`, `stories-service-real.ts:215`), and the two
`useBanner()` call sites (`EventDetail.tsx`, `profile-page-v2.tsx`) pass `'event'` and `'profile'`.

**This changes the Fix Approach from "rotate to a dedicated secret" (steps 2-3) to "delete the dead
path."** There is no caller to migrate onto a new secret, and no accept-path test to write for a
path that no longer exists. Fixed by deleting the `entityType === 'point'` branch entirely (former
`index.ts:413-457`), the `SUPABASE_SERVICE_ROLE_KEY`-as-shared-secret comparison it contained, the
now-unreachable `fetchPointData()` and `buildPointPrompt()` helpers, and `'point'` from both
`EntityType` (server) and `BannerEntityType` (`src/app/prototypes/events/banner-utils.ts`, client).
`SUPABASE_SERVICE_ROLE_KEY` remains in the file only for its two DB-client constructions (rate
limiting, event/story/profile data fetch) — never compared against a request header.

**Deploy-pending test note.** The rewritten e2e test (`edge-fn-authz-regression.spec.ts`) asserts
the corrected source behavior — `entityType: 'point'` is now rejected by `validateInput()` before
auth, "entityType must be one of: event, story, profile" (400) — but the **test Supabase project
still runs the pre-fix deployed function**, so a live run currently returns 403 (the old
service-key-absent guard) until `generate-banner` is redeployed. This is a deploy step, not a code
defect — same shape as a migration file that needs `migrate.sh` before the schema exists on test.
Deploying was out of scope for this worktree (code + tests + commit only, no push/ship/deploy).

## Acceptance Criteria

- [x] The caller that sends `x-service-key` is identified and named in this spec — **it does not
      exist**; see Root cause correction above
- [x] Point-banner generation succeeds using the new dedicated secret, proven by a test that exercises
      the accept path (not only the 403) — **superseded**: there is no accept path to prove: the
      point-banner service path is deleted, not rotated onto a new secret
- [x] `grep -rn "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/generate-banner/index.ts` shows the key
      used only for its DB client, never for caller authorization — verified: 2 remaining matches,
      both `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`, zero header comparisons
- [ ] The existing "rejects user request without x-service-key header (403)" test still passes —
      **rewritten** (the guard it tested no longer exists); the replacement test
      (`point: is not a client entity type (400)`) currently fails against the **test** Supabase
      project with `403` because that project has not been redeployed with this fix — see
      "Deploy-pending test note" above. Will pass once `generate-banner` is redeployed to test.
