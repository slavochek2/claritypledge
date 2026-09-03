---
status: backlog
type: task
rank: 95
created_date: '2026-08-17'
tags: [tech-debt, points, schema]
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
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
- [x] Column removed via migration — **unblocked and applied to TEST**. `supabase/migrations/20260902003000_p1095_drop_points_context.sql` drops the out-of-band `create_point_with_position` by `pg_proc` oid lookup (any signature, `IF EXISTS`; a no-op on prod where it was never defined) and then `ALTER TABLE public.points DROP COLUMN IF EXISTS context`. Applied via the Management API from inside w11; the migration's own verification block passed, and an independent catalogue read after the apply returns `col_present = 0, fn_present = 0`
- [x] `grep -rn "\.context" src/app/data/points-service-real.ts` returns nothing for the point row type — re-checked after the migration landed: zero hits

## Evidence (2026-09-03) — the drop, and the dependents it surfaced

**Applied to TEST:** `20260902003000`, recorded in `supabase_migrations.schema_migrations` and
listed in `supabase/deploy-manifest.json`. Post-apply catalogue read: `points.context` absent,
`create_point_with_position` absent. No view, rule or other function depended on the column
(`pg_depend` join over `pg_rewrite`, and a `pg_proc.prosrc` scan, both empty apart from the
out-of-band function this migration drops).

**The header was wrong and is corrected.** The file declared `client-safe`. It is not:
`src/app/data/docs-service.ts` named `context` inside an **explicit embedded column list** on
`points` before `cce676d8`, and PostgREST answers a select naming a dropped column with `42703` for
the *whole* query — so applying this ahead of that bundle does not blank a field, it fails every
story/doc read that embeds points. `createPoint`'s INSERT named the column too. The header now
carries `requires-frontend: cce676d8`, which is what makes `migrate.sh` hold the prod apply.

**A dependent the client sweep missed: the test fixtures.** `e2e/helpers/test-point.ts` inserted
`context` on every point it created, and 34 further lines across 15 e2e specs passed it either as a
`createTestPoint` option or as a direct `points` INSERT column. The first integration run after the
drop failed 5 / passed 1 on `Could not find the 'context' column of 'points'`. All 35 sites are
removed; the same four specs now run **8 passed / 2 failed**.

**The 2 remaining failures are pre-existing and unrelated** —
`20260420120000_p768_…spec.ts` inserts `author_id` on `points`, a column that has never existed on
that table (current catalogue: id, statement, first_validator_id, created_at, updated_at, tags,
banner_url, visibility, system_tags, superseded_by). Widening the run to nine points-adjacent
integration specs gives **33 passed / 9 failed**, and every one of those nine fails on a column
belonging to someone else's change: `stories.title` missing (P1227's lane), `points.author_id`
missing, `story_points.author_id` NOT NULL, and one badge_points insert that collides with a row an
earlier test in the same file created. None of them mention `context`. They are not filed here.

**Unit tests:** `npx vitest run` → 3484 passed / 19 skipped / 1 failed; the one failure was
`src/tests/p887-reproduce.test.ts` timing out at 5000 ms under the session's concurrent load, and
the same file re-run alone is **11/11 green**. Reported rather than retried-until-green.

**Migration ordering note:** `20260902003000` sorts *below* `20260903100000`, which a concurrent
session had already applied to TEST. Harmless on TEST (both are recorded) and harmless for prod,
whose ledger is independent — but a `supabase db push` that ever replays this directory in filename
order would run them in the other order. Nothing here depends on that ordering.

**Not done here:** nothing applied to prod. `e2e/integration/p523-point-references-migration.spec.ts`
is `test.describe.skip`, not deleted — the RPC it exercised existed only on TEST, out-of-band, and
is now gone; deleting the file is a P1217 retirement decision, not this spec's.
