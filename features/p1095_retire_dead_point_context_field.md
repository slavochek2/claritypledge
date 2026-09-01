---
status: backlog
type: task
rank: 95
created_date: '2026-08-17'
tags: [tech-debt, points, schema]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1095: Retire the dead `points.context` field

## Problem

`points.context` has existed since the first points migration (2026-02-04, commented *"optional explanation/background"*). Verified 2026-08-17:

- **Nothing writes it.** `createPoint` accepts a `context` argument, but the only production caller (`story-detail-page.tsx:169`) passes `undefined`. No form, no page, no script sets it.
- **One surface renders it** — the compact feed card, clamped to three lines with an expand control. The point **detail** page uses a different component that never renders it, which is why it is invisible on `/point/:id`.

So it reads as available capacity to any agent scanning the schema, while being a field the product does not have. The risk is not the dead column; it is an agent deciding to *use* it and putting a point's grounding somewhere only one of two surfaces displays.

**Grounding belongs in a linked Story** — a Story renders on both the feed and the detail page, carries the quotes that make a point answerable out of context, and is the model's own answer to "why does this point exist". A parallel half-rendered text field competes with that for no gain.

## Correction (2026-09-01)

The "one surface" claim above is **false** — re-verified this session with grep, not re-derived from the same partial read. `point.context` is read/rendered/forwarded across **7 files**, not one:

- `src/app/pages/point-detail-page.tsx:544-547` — **the actual `/point/:id` route component** (confirmed via `src/App.tsx:56,585`) renders `point.context` in an italic paragraph. The spec's central claim — "the detail page never shows it" — was wrong.
- `src/app/components/partners/live-content-cards.tsx` — renders it in three places (`LivePointCard`, `PointCardPreview`, `SelectedContentDisplay`) and uses it in live-session content search matching.
- `src/app/components/feed/feed-point-card.tsx` — the feed card (the one surface the original spec named).
- Read/passthrough chain feeding those renderers: `src/app/data/stories-service-real.ts:137`, `src/app/data/docs-service.ts:154`, `src/app/pages/story-detail-page.tsx:134/188`, `src/app/pages/live/letter-preload.ts:41`.

The decision does not change — drop vs. keep is still the only fork, and the answer is still drop (nothing writes it; grounding belongs in a linked Story). What changes is the blast radius: this touches 7 files plus the `createPoint` signature, not 1.

## Appetite

**Internal, 7 files touched (feed card, point detail page, 3 live-session renderers, 2 read/passthrough services), plus `createPoint`'s signature.** No user sees a change either way — every render site guarded `point.context &&` before this work, and prod carries zero non-null values (verified with the service-role key, bypassing RLS — see Done-When). **Reversible** — a dropped column is restorable from migration history; the client-side removal is a normal revert.

**Decision density: one** — remove the column, or keep it and mark it.

## Solution

Two stages, and only the first has been done:

1. **Done 2026-08-17:** deprecation comment on the row type in `points-service-real.ts`, stating the verification and pointing at this spec. This is the part that actually prevents the failure mode.
2. **Not done:** remove the column and its render. Requires a migration, the `createPoint` signature change (its `context` parameter is positional — callers and both service implementations plus the interface move together), removal of the feed-card render block, and the type update.

## Risks / Non-Goals

### Risks

- **The column may hold rows on prod that nobody knows about.** **MITIGATE:** count non-null values on prod before any drop; if any exist, decide where the content goes before dropping.
- **`createPoint`'s `context` parameter is positional**, so removing it silently shifts `tags` and `visibility` at every call site. **MITIGATE:** whoever does stage 2 changes the signature to an options object, or removes the parameter last, with a typecheck between each step.

### Non-Goals

- **Do NOT write to this field in the meantime** — including in any points-filing skill or script.
- **Do NOT expand the field's rendering** to the detail page "so it can be used". That is the opposite of this spec.
- **Do NOT remove the feed card's render before the column** — leaving a column with no reader is safer than a reader with no column.

## Blocker found mid-implementation (2026-09-01) — not yet resolved

Test DB (`gfjctyxqlwexxwsmkakq`) carries a live RPC, `create_point_with_position`, with a
`p_context` parameter that is **not defined in any file under `supabase/migrations/`** — confirmed
absent via `grep -rli "point_with_position" supabase/migrations/` (zero hits) while a live REST
probe (`POST .../rpc/create_point_with_position` with named params) returns a business-logic error
("Not authenticated"), not a schema-not-found error — i.e. the function exists on test but has no
tracked source. It is exercised only by `e2e/integration/p523-point-references-migration.spec.ts`;
no client code calls it (the only other `createPointWithPosition` reference is fully commented out
in `src/tests/p523-point-references.test.ts`). **Confirmed absent on prod** — its RPC path is not
listed in prod's PostgREST OpenAPI spec.

Dropping `points.context` while this function still references it would break that one e2e spec on
test (not prod — the function doesn't exist there) the next time the RPC runs, and there is no
migration file to patch since none defines this function. I could not safely author a fix blind:
`pg_get_functiondef` needs a live DB connection, `SUPABASE_DB_URL` in `.env.local` failed to
connect (`tenant/user postgres.gfjctyxqlwexxwsmkakq not found` via the pooler) and the `supabase`
MCP requires an OAuth flow I did not run. **Migration B (the DROP) is not written and not applied.**
Commit 1 below (client-side reads/renders) is complete and does not depend on this RPC at all.

## Done-When

- [x] Deprecation comment in place, stating what was verified and when
- [x] Non-null count on prod recorded: **zero** (`content-range: */0`, service-role key — bypasses RLS, covers private rows too, not just the earlier anon-key check)
- [x] Client-side reads/renders removed across all 7 files + `createPoint` signature updated; typecheck (`npx tsc --noEmit`), full vitest (3485 passed / 19 skipped), and eslint on changed files all green
- [ ] Column removed via migration — **blocked**, see "Blocker found mid-implementation" above
- [ ] `grep -rn "\.context" src/app/data/points-service-real.ts` returns nothing for the point row type — true today (comment + field both removed) but re-check after the migration lands, since the DB row type is what this line is actually about
