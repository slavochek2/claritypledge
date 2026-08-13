---
status: week
type: bug
rank: 1000988.0
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [feed, points, stories, pagination]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1075: Feed tag filter is client-side only — silently empty once a tag's matches fall outside the 50-row window

## Summary

`/feed?tag=X` (with or without `&sort=oldest`) can silently show "No content matching #X yet" even though matching public content exists, because the tag filter is applied client-side on a single fixed 50-row page instead of server-side before the page is cut.

## Root Cause

`src/app/pages/feed-page.tsx` `fetchData()` calls both feed services with the tag argument hardcoded to `undefined`:

```
storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, undefined, ascending)
pointsService.getPublicPointsFeed(FEED_LIMIT, 0, undefined, viewerUserId, ascending)
```

`FEED_LIMIT = 50`, offset is always `0` — there is no pagination. Tag filtering then happens **client-side**, via `filterByTags()` (`src/lib/feed-utils.ts`) on whatever 50 rows came back. Both underlying service methods already implement working **server-side** tag filtering (`.contains('tags', [tag])` / `.contains('system_tags', [tag])`) — `points-service-real.ts` ~line 776, `stories-service-real.ts` ~line 528 — it's just never invoked, because the caller never passes `activeTags` through.

Effect: once total public rows for a table exceed 50, the fetched window (oldest-50 or newest-50, depending on `ascending`) may not contain any row carrying the requested tag, even though such rows exist and are publicly readable via direct query. The empty state renders with no error — it looks identical to "this tag genuinely has no content."

**Not a regression of a specific decision, but an incomplete one:** [decisions.md 2026-03-13 "Feed sort toggle — URL-param approach"](../docs/decisions.md) deliberately made **sort** DB-level specifically to avoid the client-side-breaks-pagination failure mode ("Client-side sort reversal — breaks pagination when >50 items exist" was explicitly rejected). That reasoning was never extended to the **tag filter half** of the same query — sort is correctly DB-level, tag filtering is not.

## Invariants

- Zero-position points are deliberately excluded from all listing surfaces (P543, `decisions.md` 2026-03-17) — this is correct, separate behavior, not part of this bug. Do not conflate: a tagged, positioned Point can still be invisible on a tag-filtered URL purely because of the windowing bug described here.
- Sort must stay DB-level (`order().range()`), per the P505 decision above — the fix here is to make the tag filter DB-level too, not to revert sort to client-side.

## Reproduction Steps

1. On any environment where the `points` table has more than ~50 public rows older/newer than a given tag's rows (test project `gfjctyxqlwexxwsmkakq` already qualifies — 2,377 public points as of 2026-08-13).
2. Create or locate a Point tagged `X` whose `created_at` falls outside the oldest-50 (if testing `sort=oldest`) or newest-50 (if testing default sort) public rows.
3. Load `/feed?tag=X&sort=oldest` (or `/feed?tag=X` for default newest-first).
4. Observe: "No content matching #X yet", despite `GET /rest/v1/points?tags=cs.{X}&visibility=eq.public` returning matching rows.

**Reproduction rate:** 100% once the row-count/window precondition is met. Confirmed directly in this session on `gfjctyxqlwexxwsmkakq` (test) via Playwright screenshots + matching REST responses; prod (`besjtuodziykmjidubzw`) does not currently trigger it (only 29 public points, under the 50-row window) — this is latent there, not fixed.

## Expected Behavior

`/feed?tag=X&sort=oldest` shows all publicly visible, tag-matching content in the requested order, regardless of how many other public rows exist in the table.

## Actual Behavior

Silently shows an empty state ("No content matching #X yet") whenever the tag's matching rows fall outside the single fetched 50-row window. No error, no indication that more content might exist.

## Affected Files

- `src/app/pages/feed-page.tsx` — `fetchData()` (~line 51-67): passes `undefined` instead of `activeTags` to both service calls.
- `src/app/data/points-service-real.ts` — `getPublicPointsFeed` (~line 776): server-side tag filter already implemented, unused by the only caller.
- `src/app/data/stories-service-real.ts` — `getPublicStoriesFeed` (~line 528): same — server-side tag filter implemented, unused by the only caller.
- `src/lib/feed-utils.ts` — `filterByTags()`: the client-side filter that currently does this job on a partial page; stays relevant for multi-tag OR filtering if the server-side call only takes one tag at a time (see Fix Approach).

## Severity

**Medium** — feature partially works (small/young tags or default sort at low row-counts are unaffected; the underlying data and RLS are correct) and a workaround exists (browsing without a tag filter, or a tag whose matches happen to be recent). But the failure is **silent** — no error surfaces, and it affects the core public content-discovery surface for any tag once the site's content volume grows past 50 public rows per table. Will eventually affect prod as public content accumulates.

## Fix Approach

In `feed-page.tsx`'s `fetchData`, pass the active tag through to both service calls instead of `undefined`, so PostgREST filters server-side before `LIMIT`/`OFFSET` is applied:

```ts
const [storiesData, pointsData] = await Promise.all([
  storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, activeTags[0], ascending),
  pointsService.getPublicPointsFeed(FEED_LIMIT, 0, activeTags[0], viewerUserId, ascending),
]);
```

Both service signatures already accept a single `tag?: string` — this only supports **one** tag server-side. `activeTags` can currently hold multiple tags (`?tag=X,Y` OR semantics via `filterByTags`). Options to reconcile, for whoever picks this up: (a) extend both service methods to accept `tag: string[]` and use `.overlaps()` instead of `.contains()` for OR semantics, or (b) keep server-side filtering to the single-tag case (by far the common case in practice — every existing tag URL in this codebase filters by exactly one tag) and leave multi-tag URLs on the current client-side path with a documented limitation. Needs a decision, not assumed here.

Also verify the **tag cloud** computation (`feed-page.tsx` `tagCounts` from the fetched `points`/`stories` state) doesn't quietly become wrong once the fetch itself is tag-scoped — the tag cloud is meant to reflect ALL content, not just the current filter's matches, so it may need its own unfiltered fetch or a separate lightweight count query.

## Acceptance Criteria

- [ ] `/feed?tag=X&sort=oldest` renders all publicly visible `X`-tagged content, for a tag whose matches fall outside the naive 50-row window (reproducible today on test with `cmp10`/`cmp7`/`cmp3`)
- [ ] `/feed?tag=X` (default newest-first) shows the same completeness guarantee
- [ ] Tag cloud (checkbox list) still reflects the full set of tags across public content, not just tags present in the current filtered result
- [ ] No regression to the existing `sort=oldest`/`sort` toggle behavior (P505) — sort stays DB-level
- [ ] No console errors during the affected flow
- [ ] Verified on the test project (`gfjctyxqlwexxwsmkakq`) where the bug is currently reproducible, via the concrete URLs `/feed?tag=cmp10&sort=oldest`, `/feed?tag=cmp7&sort=oldest`, `/feed?tag=cmp3&sort=oldest`
