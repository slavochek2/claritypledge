---
status: qa
type: bug
rank: 1000746.0
severity: high
workstream: infra
date_reported: '2026-04-21'
created_date: '2026-04-21'
tags: [cors, edge-functions, dev-experience, class-bug]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P776: CORS class bug — 12 edge functions use single-origin pattern, break on any non-5200 worktree

## Summary

12 Supabase edge functions hardcode a single allowed origin via `APP_URL` or `ALLOWED_ORIGIN` env var, causing CORS preflight rejections for any dev worktree not running on port 5200. P753 fixed `generate-story-image-url` with a `resolveAllowedOrigin(req)` helper and explicitly deferred the other 12; this spec covers the deferred class.

## Root Cause

Each affected function builds `corsHeaders` at module load time using a static env var:

```ts
const ALLOWED_ORIGIN = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, ... };
```

The test project has `APP_URL=http://localhost:5200` (w2 port). Any other dev origin (w0=5001, w1=5100, w3=5300…) is rejected at preflight. The `corsHeaders` object is module-scoped so the running function can never adapt to a different request origin.

P753 introduced `resolveAllowedOrigin(req)` in `generate-story-image-url/index.ts` (lines 29–51) — a per-request resolver that accepts any recognized dev, Vercel preview, or prod origin. The pattern exists; it was just not propagated.

## Reproduction Steps

1. Start dev server on a non-5200 port (e.g. w0 at `http://localhost:5001` or w1 at `http://localhost:5100`)
2. Navigate to `http://localhost:<port>/signup?source=letter-response&letterId=<real-id>&senderName=...&redirect=...`
3. Fill the form and click **Save my responses**
4. Observe: DevTools Network tab shows OPTIONS preflight to `request-letter-response-signin` returns CORS error; toast shows "Failed to send a request to the Edge Function."

**Reproduction rate:** 100% on any non-5200 worktree

## Expected Behavior

The edge function responds to the preflight with `Access-Control-Allow-Origin: http://localhost:<port>` that matches the request origin. The signup flow completes, no CORS error.

## Actual Behavior

Preflight response: `Access-Control-Allow-Origin: http://localhost:5200` (fixed). Browser rejects because it doesn't match the actual origin. All downstream calls blocked.

Observed error today: `The 'Access-Control-Allow-Origin' header has a value 'http://localhost:5200' that is not equal to the supplied origin.`

## Affected Files

**Functions with `APP_URL` pattern (5):**
- `supabase/functions/confirm-letter-response/index.ts`
- `supabase/functions/create-and-open-letter/index.ts`
- `supabase/functions/request-letter-response-signin/index.ts` ← triggered today's report
- `supabase/functions/send-letter-emails/index.ts`
- `supabase/functions/send-letter-response-signin/index.ts`

**Functions with static `ALLOWED_ORIGIN` pattern (7):**
- `supabase/functions/create-and-sign/index.ts`
- `supabase/functions/gcs-signed-url/index.ts`
- `supabase/functions/generate-banner/index.ts`
- `supabase/functions/generate-event-banner/index.ts`
- `supabase/functions/send-agreement-emails/index.ts`
- `supabase/functions/send-event-emails/index.ts`
- `supabase/functions/story-guide-chat/index.ts`

**Also refactor (to consume helper instead of inline copy):**
- `supabase/functions/generate-story-image-url/index.ts` — lines 29–51 (canonical source → move to shared)

**New files:**
- `supabase/functions/_shared/cors.ts` — shared helper
- `supabase/functions/_shared/cors.test.ts` — unit test for helper
- `docs/technical/edge-functions.md` — pattern documentation

**Pre-commit gate:**
- `scripts/pre-commit-checks.sh` — add CORS-helper enforcement check

## Severity

**High** — breaks browser-callable edge functions for any dev on a non-w2 worktree. Intermittently invisible (only surfaces when you switch worktrees), which makes it dangerous: works in one worktree, silently breaks in another.

## Fix Approach

Per architect plan `~/.claude/plans/create-a-detialed-plan-federated-sparrow.md`:

1. **Extract shared helper** — promote `resolveAllowedOrigin`/`buildCorsHeaders` from `generate-story-image-url/index.ts` (lines 29–51) to `supabase/functions/_shared/cors.ts` verbatim (no redesign).

2. **Migrate all 12 functions** — for each: delete local `corsHeaders` constant, add `import { buildCorsHeaders } from '../_shared/cors.ts'`, compute `const corsHeaders = buildCorsHeaders(req)` inside the handler. All downstream `...corsHeaders` spreads remain unchanged.

3. **Refactor `generate-story-image-url`** — delete inline helper (lines 29–51), import from `_shared/cors.ts`.

4. **Env var standardization** — `ALLOWED_ORIGIN` is the single env var; `APP_URL` references removed from all functions. After ship, remove `APP_URL` secret from test + prod projects (option B confirmed).

5. **Pre-commit gate** — extend `pre-commit-checks.sh` to fail if any `supabase/functions/*/index.ts` declares a local `corsHeaders = {` without importing `buildCorsHeaders`.

6. **Unit test** — `_shared/cors.test.ts` asserts: w0/w1/w2/w3 origins reflect back, prod reflects back, Vercel preview reflects back, unknown origin returns prod default, missing Origin header returns prod default.

7. **Doc stub** — one paragraph in `docs/technical/edge-functions.md`: "All new edge functions must import `buildCorsHeaders` from `_shared/cors.ts`."

**Env var secret changes (manual, requires user action after ship):**
- Test project `gfjctyxqlwexxwsmkakq`: add `ALLOWED_ORIGIN=https://claritypledge.com`, remove `APP_URL`
- Prod project `besjtuodziykmjidubzw`: confirm `ALLOWED_ORIGIN=https://claritypledge.com`, remove `APP_URL`

## Acceptance Criteria

- [x] `supabase/functions/_shared/cors.ts` exists with `resolveAllowedOrigin` and `buildCorsHeaders` exports
- [x] All 12 affected functions import `buildCorsHeaders` from `_shared/cors.ts` — no local `corsHeaders` constant block remains
- [x] `generate-story-image-url/index.ts` imports from `_shared/cors.ts` (no inline copy at lines 29–51)
- [x] `deno check` passes on 9/13 function index files — 5 pre-existing failures (generate-banner, generate-event-banner, send-agreement-emails, send-event-emails, story-guide-chat) exist on main before P776 and are unrelated to CORS; filed as P780 (stale Supabase TS types). Pre-commit gate added to catch future regressions.
- [x] Helper unit test exists: `supabase/functions/_shared/cors.test.ts` — 8 cases (deno test, run locally with Deno)
- [x] `./scripts/pre-commit-checks.sh` passes (including new CORS gate)
- [x] Pre-commit gate blocks a function that declares local `corsHeaders` without importing `buildCorsHeaders`
- [x] Letter-response signup flow works on w0 (port 5001) — curl preflight returns `access-control-allow-origin: http://localhost:5001` ✅
- [x] Letter-response signup flow works on w1 (port 5100) — curl preflight returns `access-control-allow-origin: http://localhost:5100` ✅
- [x] No regressions on `generate-story-image-url` — curl preflight from 5001/5100 both reflect correctly ✅
- [x] `docs/technical/edge-functions.md` contains the shared CORS pattern requirement
- [x] Regression test exists: `supabase/functions/_shared/cors.test.ts`
