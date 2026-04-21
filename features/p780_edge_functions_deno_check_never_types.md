---
status: qa
type: bug
rank: 1000750.0
severity: medium
workstream: infra
date_reported: '2026-04-21'
created_date: '2026-04-21'
tags: [deno, typescript, edge-functions, types]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P780: 5 edge functions fail `deno check` — DB query results typed as `never`

## Summary

5 edge functions fail `deno check` with `TS2339: Property '<x>' does not exist on type 'never'` on DB query results. Discovered when Deno was installed as part of P776. The 8 functions P776 migrated pass cleanly — the 5 that fail are pre-existing.

## Root Cause

**Not stale types — there are no generated types.** None of the edge functions import a `Database` type, and `createClient()` is called without a generic parameter. The `src/` side also runs without a `Database` generic (see `src/lib/supabase.ts`), so the project has never had a generated schema type.

Mechanism: when the CDN-published `@supabase/supabase-js` types (`https://esm.sh/@supabase/supabase-js@2`) see `createClient()` with no `Database` generic, `.from('table_name')` falls back to `never` for the row type. The error `Property 'title' does not exist on type 'never'` fires only when code then reads a property off `data`.

**Asymmetry (5 fail, 8 pass):** unconfirmed. All 13 functions query the DB without a typed client, so the split is likely driven by whether the function dereferences fields on the result. The 8 P776-migrated functions may only `.insert()` / `.update()` without reading returned rows, or cast results locally. This must be verified during the fix — if the real discriminator is different, the chosen remedy may miss cases.

## Invariants

- Edge function runtime (Supabase Edge Runtime, Deno-based) does not enforce types at deploy time — type errors do not block deploy and have not been blocking production. Any fix must preserve this (i.e., do not introduce CI gates that block deploy until the project is ready for that).
- `src/` (client) and `supabase/functions/` (edge) use different type worlds today: client uses `import.meta.env`, edge uses `Deno.env.get`, and neither imports a shared `Database` type. A fix that introduces a shared type file must work under both import constraints (esm.sh for edge, bundler-resolved for client) or be scoped to edge only.
- Regenerating types alone is insufficient. A generated `database.types.ts` is dead weight unless each consumer imports it **and** passes it as the generic to `createClient<Database>(...)`.

## Affected Files

- `supabase/functions/generate-banner/index.ts` — `ai_rate_limits`, story/event row types
- `supabase/functions/generate-event-banner/index.ts` — event row types
- `supabase/functions/send-agreement-emails/index.ts` — agreement row types
- `supabase/functions/send-event-emails/index.ts` — rsvp/event row types
- `supabase/functions/story-guide-chat/index.ts` — rate limit types

**Not affected:** The 8 functions migrated by P776 all pass cleanly. This is a pre-existing issue predating P776.

## Reproduction Steps

1. Install Deno: `brew install deno`
2. Run: `deno check supabase/functions/generate-banner/index.ts`
3. Observe: `TS2339` / `TS2769` errors referencing `never`

**Reproduction rate:** 100%

## Expected Behavior

`deno check supabase/functions/*/index.ts` passes with 0 errors.

## Actual Behavior

5 functions fail with `TS2339: Property '<x>' does not exist on type 'never'` errors on DB query result access.

## Severity

**Medium** — functions deploy and run in prod (Supabase Edge Runtime strips types at execution, so `never` in a type position does not crash at runtime). The observed cost is absence of compile-time type safety: schema changes won't surface as `deno check` errors for these 5 functions, and they don't block deploy today.

**Caveat:** "runs correctly in prod" is not verified in this spec. The fix should include a post-deploy smoke check of at least one affected function (e.g. banner generation) before closing.

## Appetite

Blast radius: 5 edge function files + possibly one new shared types file. Reversibility: high (pure type changes; if the fix breaks something, revert is a single commit). Decision density: low — the only real choice is narrow (Option B) vs broad (Option A) below.

## Solution

**Recommended: Option B — narrow, local typing (lowest runtime-observable change).**

For each of the 5 failing functions, declare a local `interface` for the rows being read and cast the query result:

```ts
interface AiRateLimitRow { ip_hash: string; call_count: number; window_start: string; }
const { data, error } = await supabase.from('ai_rate_limits').select('*').single();
const row = data as AiRateLimitRow | null;
```

This matches the project's existing convention (`src/app/types/index.ts` uses hand-written row types — see line 78) and touches only the 5 failing files. No new tooling, no new generated artifacts, no cross-codebase migration.

### Alternatives Considered

**Option A — Generate `Database` types for edge functions only.**
Run `supabase gen types typescript --project-id <ref>`, commit to `supabase/functions/_shared/database.types.ts`, update each function to `import type { Database }` and `createClient<Database>(supabaseUrl, key)`. Introduces a generated file that drifts with every migration; adds regeneration step to the migration workflow; still leaves `src/` untyped. **Rejected** — inconsistent with project convention and higher ongoing cost.

**Option C — Generate `Database` types project-wide.**
Same as A but include `src/`. Correct long-term direction, but scope is far beyond this bug. **Rejected** — file as separate story if desired.

## Risks / Non-Goals

**Risks**
- Local interfaces in edge functions will drift from the real schema if columns are renamed. Acceptable under Invariant 1 (edge runtime doesn't enforce types anyway) and same risk the `src/` side already carries.
- If the 5-vs-8 asymmetry is driven by something other than property access (e.g. specific query shapes), the narrow fix might miss cases. Fix-time verification is required — run `deno check supabase/functions/*/index.ts` after each file and confirm the count goes from 5 failing to 0 failing, with the 8 passing functions remaining green.

**Non-Goals**
- Introducing `Database` type generation for the project.
- Changing `createClient()` call signatures in `src/`.
- Adding CI gates that block deploy on `deno check` failures.
- Migrating edge functions to use the `src/app/types/index.ts` hand-written types (different module systems — esm.sh vs bundler).

## Done-When

- [x] `deno check supabase/functions/generate-banner/index.ts` passes
- [x] `deno check supabase/functions/generate-event-banner/index.ts` passes
- [x] `deno check supabase/functions/send-agreement-emails/index.ts` passes
- [x] `deno check supabase/functions/send-event-emails/index.ts` passes
- [x] `deno check supabase/functions/story-guide-chat/index.ts` passes
- [x] `deno check supabase/functions/*/index.ts` passes with 0 errors (regression guard for the 8 P776 functions)
- [ ] One affected function (banner generation) smoke-tested on prod post-deploy, Sentry checked for new errors in first 10 minutes
- [x] 5-vs-8 asymmetry confirmed: the discriminator is whether the function passes the supabase client as a typed parameter to helper functions. The 5 failing functions all had `supabase: ReturnType<typeof createClient>` parameters — without the generic, Database resolves to `never`, propagating to all row types. The 8 P776 functions call `.from()` directly on a top-level `const client` without passing it through typed params.
