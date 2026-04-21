---
status: week
type: bug
rank: 1000750.0
severity: medium
workstream: infra
date_reported: '2026-04-21'
created_date: '2026-04-21'
tags: [deno, typescript, edge-functions, types]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P780: 5 edge functions fail `deno check` — stale Supabase TypeScript types

## Summary

5 edge functions have pre-existing `deno check` failures caused by Supabase-generated TypeScript types that don't include tables added after the last type generation. Discovered when Deno was installed as part of P776.

## Root Cause

The functions reference DB tables (`ai_rate_limits`, `events`, `rsvps`, `agreements`) that exist in the live database but are absent from the local Supabase TypeScript types. When Deno resolves these queries, the row type resolves to `never`, causing downstream property access errors (`TS2339: Property 'title' does not exist on type 'never'`).

The types file needs to be regenerated against the current schema: `supabase gen types typescript --project-id <ref> > supabase/functions/_shared/types.ts` (or equivalent).

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
3. Observe: TS2769/TS2339 errors about `never` types

**Reproduction rate:** 100%

## Expected Behavior

`deno check` passes on all edge function files.

## Actual Behavior

5 functions fail with property-does-not-exist errors on DB query results because the TypeScript types don't include the relevant tables.

## Severity

**Medium** — functions deploy and run correctly at runtime (Deno runtime is not affected by type errors at deploy time). Risk: type safety is absent for these 5 functions, so schema changes won't surface as compile-time errors.

## Fix Approach

Regenerate Supabase TypeScript types against test project schema:
```bash
SUPABASE_ACCESS_TOKEN=<token> supabase gen types typescript --project-id gfjctyxqlwexxwsmkakq > supabase/functions/_shared/database.types.ts
```

Then update the 5 affected functions to import from that shared types file. Alternatively, add inline type assertions where the generated type is narrow enough.

## Acceptance Criteria

- [ ] `deno check supabase/functions/generate-banner/index.ts` passes
- [ ] `deno check supabase/functions/generate-event-banner/index.ts` passes
- [ ] `deno check supabase/functions/send-agreement-emails/index.ts` passes
- [ ] `deno check supabase/functions/send-event-emails/index.ts` passes
- [ ] `deno check supabase/functions/story-guide-chat/index.ts` passes
- [ ] `deno check supabase/functions/*/index.ts` passes with 0 errors
