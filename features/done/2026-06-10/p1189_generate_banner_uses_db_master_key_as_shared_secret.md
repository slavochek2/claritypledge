---
status: all-done
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
pipeline_ran: [create-bug, inline, ship]
completed_at: 2026-09-03
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
- [x] The existing "rejects user request without x-service-key header (403)" test still passes —
      **rewritten** (the guard it tested no longer exists), and the property it was rewritten to
      assert is now proven **without a deploy** by
      `supabase/functions/generate-banner/entity-type-contract.test.ts` (4/4). The e2e round trip
      (`point: is not a client entity type (400)`) still reports `403` against the **test** project
      because that project runs the pre-fix build — that is a stale deployment, not a code defect,
      and it is not the basis of this tick. See Evidence below.

## Evidence (2026-09-03, worktree w13 @ `cc12268f`)

### The deploy diagnosis is confirmed, not assumed

Supabase Management API, TEST project (`gfjctyxqlwexxwsmkakq`), read-only: `generate-banner` is
**v19, `updated_at` 2026-04-21T11:45:31Z** — months before this fix (2026-09-01). Its deployed eszip
still carries the pre-fix source:

| String in the deployed bundle | Matches |
|---|---|
| `x-service-key` | 2 |
| `fetchPointData` | 3 |
| `buildPointPrompt` | 3 |
| `VALID_ENTITY_TYPES: EntityType[] = ['event', 'story', 'point', 'profile']` | present verbatim |

So `point` passes the deployed `validateInput()` and falls into the deleted service-key branch —
which is exactly the `403` the e2e case reports. Local `index.ts` on this branch has
`type EntityType = 'event' | 'story' | 'profile'` (line 21),
`VALID_ENTITY_TYPES = ['event', 'story', 'profile']` (line 42), and zero `x-service-key` matches.

### The property is provable here — it does not need the deploy

`validateInput()` runs before the JWT check and before any DB client is used, so the handler can be
exercised directly. `entity-type-contract.test.ts` captures the handler `index.ts` registers with
`Deno.serve` and calls it with real `Request` objects — no port, no outbound call, no source change.

```
$ deno test --allow-net --allow-env supabase/functions/generate-banner/entity-type-contract.test.ts
running 4 tests from ./supabase/functions/generate-banner/entity-type-contract.test.ts
'point' is not a client entity type — 400 before auth ... ok
no header revives the deleted point path — 'x-service-key' is ignored ... ok
the three real entity types are NOT rejected by validateInput ... ok
the other validateInput rejections are unchanged ... ok
ok | 4 passed | 0 failed (19ms)
```

It asserts in both directions: `point` is rejected (400, and no `x-service-key` value revives it),
and `event` / `story` / `profile` are **not** over-rejected — they pass validation and stop at the
JWT gate with 401, which is the next check in `index.ts`.

### Discriminating control — the test fails against the pre-fix source

The same test file run against `main`'s `generate-banner/index.ts` (extracted with `git show`, run
through the identical probe):

```
FAILED | 2 passed | 2 failed
'point' is not a client entity type — 400 before auth        → actual 403
no header revives the deleted point path                     → actual 404
```

Direct probe of the pre-fix handler, for the record:

```
POST {"entityType":"point",...}                    → 403 {"error":"Point banners can only be generated server-side"}
POST same + x-service-key: <the env service key>   → past the guard (404 — no such point row)
```

The two allow-side tests pass against both builds, as they should — they were never what changed.

### Gate run on this branch

| Command | Exit | Result |
|---|---|---|
| `npx vitest run` | 0 | 304 files passed, 2 skipped; **3482 tests passed**, 19 skipped |
| `npx tsc --noEmit` | 0 | no output |
| `npx eslint .` | 0 | no output |
| `./scripts/pre-commit-checks.sh` | 0 | all checks passed |

### Still outstanding (not blocking this spec's ACs)

`e2e/integration/edge-fn-authz-regression.spec.ts` → `point: is not a client entity type (400)`
will keep reporting `403` until someone runs
`supabase functions deploy generate-banner --project-ref <test-ref>`. No deploy was performed here.
