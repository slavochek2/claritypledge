---
status: qa
type: bug
rank: 1000988.0
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
date_resolved: '2026-08-13'
root_cause: feed-page.tsx never passed the active tag to either feed service's already-implemented server-side filter, so filtering happened client-side on a fixed 50-row page
tags: [feed, points, stories, pagination]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/p1075-reproduce.spec.ts
  root_cause: "feed-page.tsx fetchData() is the sole caller of getPublicPointsFeed/getPublicStoriesFeed in the codebase and always passes undefined for the tag param, so tag filtering happens client-side on a single fixed 50-row page instead of via the tag/system_tags contains() filter both services already implement server-side."
  confidence: high
  surfaces_in_scope: [feed-page-points-tab, feed-page-stories-tab]
  surfaces_deferred: []
  reproduced_at: '2026-08-13'
---

# P1075: Feed tag filter is client-side only — silently empty once a tag's matches fall outside the 50-row window

## Summary

`/feed?tag=X` (with or without `&sort=oldest`) can silently show "No content matching #X yet" even though matching public content exists, because the tag filter is applied client-side on a single fixed 50-row page instead of server-side before the page is cut.

## Root Cause

**Confirmed 2026-08-13** via `/reproduce` — canary test `e2e/p1075-reproduce.spec.ts` fails for the expected reason (empty state renders instead of the mocked tagged content, because the mocked server-side-filtered branch never fires — the outgoing request never carries a tag filter). Surface audit: `feed-page.tsx` is the sole caller of both `getPublicPointsFeed` and `getPublicStoriesFeed` in the codebase (`grep -rn "getPublicPointsFeed\|getPublicStoriesFeed" src/`) — exactly one surface (both tabs of `/feed`), no deferred surfaces.

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

- [x] `/feed?tag=X&sort=oldest` renders all publicly visible `X`-tagged content, for a tag whose matches fall outside the naive 50-row window — verified: `/feed?tag=cmp10&sort=oldest` renders 10 items in order (browser-verify agent, 2026-08-13)
- [x] `/feed?tag=X` (default newest-first) shows the same completeness guarantee — verified: `/feed?tag=understanding` renders the correct content (16 cards) instead of the empty state
- [x] Tag cloud (checkbox list) still reflects the full set of tags across public content, not just tags present in the current filtered result — BR-8 preserved via separate `cloudStories`/`cloudPoints` state (independently code-reviewed and traced through all three branches: no filter, single tag, multi-tag); `e2e/p602-feed-multi-tag.spec.ts` "tag cloud shows all tags regardless of current filter" passes
- [x] No regression to the existing `sort=oldest`/`sort` toggle behavior (P505) — sort stays DB-level, unchanged by this fix
- [x] No console errors during the affected flow — confirmed via browser-verify agent across 4 navigations (0 errors, 0 warnings each)
- [x] Verified on the test project (`gfjctyxqlwexxwsmkakq`) where the bug is currently reproducible, via the concrete URLs `/feed?tag=cmp10&sort=oldest`, `/feed?tag=cmp7&sort=oldest`, `/feed?tag=cmp3&sort=oldest` — all three verified rendering correctly on prod during the P1055 session (screenshots) and re-confirmed here on test

## Resolution

**Fixed:** 2026-08-13
**Root cause:** see Root Cause section above — `feed-page.tsx` never passed the active tag to either feed service's already-implemented server-side filter.
**Resolution:** `fetchData()` now passes the single active tag through server-side when exactly one tag is active (multi-tag `?tag=X,Y` stays on the pre-existing client-side path — documented decision, not this bug's scope). Added separate `cloudStories`/`cloudPoints` state so the tag cloud keeps reflecting all public content (BR-8) independent of the active filter, fetched concurrently with the filtered list (not sequentially) to avoid doubling round-trip latency. Code review (2026-08-13) surfaced two additional gaps, both fixed in the same diff: `cloudPoints` wasn't synced by the P543 position-removal callback (now uses a shared `removePointPosition` helper for both `points` and `cloudPoints`), and `fetchData` had no guard against an older, slower request overwriting fresher state (now uses a request-id ref, matching the `cancelled`-flag pattern used elsewhere in this codebase).

**Regression suite:** `e2e/p491-hashtag-feed.spec.ts` and `e2e/p602-feed-multi-tag.spec.ts` "single-tag URL backward compatibility" have pre-existing failures unrelated to this fix — confirmed via wip-commit-and-compare against unmodified `main` (identical failures) and filed separately: [P1078](p1078_p491_hashtag_feed_tests_stale_since_p543.md) (P543 zero-position filter vs. a stale test fixture that never stakes a position), [P1079](p1079_feed_tag_cloud_windowed_at_scale.md) (the tag cloud's own windowing limitation at scale — same root pattern as this bug, deliberately out of scope here per the BR-8-preservation decision above).

**Files changed:**
- `src/app/pages/feed-page.tsx`
- `e2e/p1075-reproduce.spec.ts` (new canary)
- `e2e/p602-feed-multi-tag.spec.ts` (added a wait for a pre-existing race this fix's extra concurrent queries exposed more reliably; no assertions changed)
