---
status: backlog
type: bug
rank: 214
severity: low
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [feed, pagination, tag-cloud]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1079: Feed tag cloud is windowed at scale — a tag can be un-highlightable even while its content correctly renders

## Summary

The `/feed` tag cloud (checkbox chips, BR-8 — P602 2026-03-29) is computed from an unfiltered top-`FEED_LIMIT` (50) page, same as the content list was before [P1075](./done/2026-06-10/p1075_feed_tag_filter_client_side_only.md). P1075 fixed the **content list** to be server-side tag-filtered (correct at any scale), but deliberately left the **cloud** windowed/unfiltered to preserve its existing (already-accepted) behavior. At current data volume (test project: 229 public stories, 2,377+ public points), a real, currently-in-use tag (e.g. `understanding`) can fall outside that window — its content renders correctly via the tag-filtered URL, but the cloud never shows it as a selectable/highlighted chip.

## Root Cause

`src/app/pages/feed-page.tsx` `fetchData()` (post-P1075) fetches `cloudStories`/`cloudPoints` via `getPublicStoriesFeed(FEED_LIMIT, 0, undefined, ascending)` / `getPublicPointsFeed(FEED_LIMIT, 0, undefined, viewerUserId, ascending)` — always the newest-or-oldest 50 public rows, no tag scoping. `tagCloud` (useMemo) only counts tags present in that window. [P602 (2026-03-29) BR-8](../docs/decisions.md) explicitly chose this ("Dataset is 21 points — fetching all is trivial, no new API needed") when the assumption of a small dataset held; it no longer does.

## Invariants

- The cloud's purpose (BR-8) is "all tags remain selectable regardless of current filter" — this bug is exactly that guarantee failing at scale, not a new requirement.
- Do not conflate with P1075's fix: the content *list* is already correct at any scale (server-side filtered). Only the cloud's chip visibility is windowed.

## Reproduction Steps

1. On test (`gfjctyxqlwexxwsmkakq`, 229+ public stories): load `/feed?tag=understanding`.
2. Observe: the "understanding"-tagged story content renders correctly in the list (P1075's fix works).
3. Observe: no `#understanding` chip appears (checked or otherwise) in the tag cloud — `curl` confirms `understanding`-tagged rows exist but fall outside the newest-50 window (`order=created_at.desc&limit=50` — checked 2026-08-13, 0 of 50 carry it).

**Reproduction rate:** 100% at current data volume; will recur for any tag whose matches sit outside the top-50 window by recency.

## Expected Behavior

Every tag with at least one public, taggable item should appear in the cloud, regardless of table size — matching BR-8's stated guarantee.

## Actual Behavior

Only tags present in the newest/oldest 50 public rows appear in the cloud. Older or sparser tags become permanently un-discoverable via the cloud UI (though still directly reachable by a shared URL, since the list itself is fixed).

## Affected Files

- `src/app/pages/feed-page.tsx` — `fetchData()` (cloud fetch branch) and `tagCloud` useMemo
- Possibly a new lightweight service method (`select('tags, system_tags')` only, no row cap, or a dedicated distinct-tags RPC) rather than reusing the full-row-limited feed methods

## Severity

**Low** — a real content-discovery gap (a tag can be un-highlightable), but the tag's content still renders via its own shared/direct URL (P1075 fixed that half). No data loss, no broken write path, workaround exists (direct URL still works).

## Fix Approach

Not assumed here — needs a decision. Candidate directions: (a) a dedicated lightweight query selecting only `tags`/`system_tags` columns with no row limit (cheap: two array columns, not full rows) to build a scale-independent cloud; (b) a `DISTINCT` tags RPC computed server-side; (c) accept the limitation and cap cloud staleness with a documented "recent tags only" framing in the UI. Whoever picks this up should re-read [P602's BR-8 rationale](../docs/decisions.md) before choosing, since it explicitly traded correctness for simplicity at the time.

## Acceptance Criteria

- [ ] A tag whose content falls outside the naive top-50 window still appears as a selectable chip in the tag cloud
- [ ] `e2e/p602-feed-multi-tag.spec.ts` "single-tag URL backward compatibility" passes without a data-volume-dependent workaround
- [ ] No regression to existing cloud behavior (tag counts, st/v-tag hiding, sort order by frequency)
