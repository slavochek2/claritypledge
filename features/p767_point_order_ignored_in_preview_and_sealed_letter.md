---
status: qa
type: bug
rank: 1000760.0
severity: high
workstream: letters
date_reported: '2026-04-20'
created_date: '2026-04-20'
tags: [letters, points, ordering, snapshot-mapper]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P767: Point order chosen in draft not reflected in preview or sealed letter

## Summary

When an author reorders points in the letter draft (drag/move-up-down), the chosen order is honored in the draft view but ignored in both the preview (`/letter/:docId/preview`) and the sealed letter receiver view. All three surfaces should render points in the same user-chosen order.

## Root Cause

`src/app/utils/letter-snapshot-mapper.ts` — the local `PointConfig` interface (lines 22–28) omits `order?: string[]`, so `snapshotToStoryWithPoints()` (lines 121–139) never reads or applies the field. The seal RPC has been persisting `point_config.order` since P757 (migration `20260418210000_p757_set_receiver_profile_id_on_seal.sql:95`), and the draft UI already sorts client-side via `StoryCardDetail.tsx`. The data is present; the mapper simply never consumes it.

The preview path compounds this: `docStoryToSnapshot()` (lines 174–197) builds a synthesized snapshot from `docStory.story.points` in insertion order and does not forward `docStory.point_config.order` into the snapshot's `point_config`. Even if the mapper were fixed, the preview path would still lose the order without this passthrough.

Bug only manifests when the author has actively reordered points (`point_config.order` non-empty). Letters where default insertion order was never changed appear correct by coincidence.

## Reproduction Steps

1. Open a draft letter as the author — e.g. `/letters/drafts/8fa22210-f0c4-4d72-96af-3747fb787bcf`
2. Drag the anti-point (or use move-up/down) so it appears **first** in the draft
3. Observe draft view: anti-point renders first ✅
4. Navigate to `/letter/8fa22210-f0c4-4d72-96af-3747fb787bcf/preview`
5. Observe preview: anti-point renders **second** (after the story) ❌

**Reproduction rate:** 100% when `point_config.order` is non-empty and differs from insertion order.

## Expected Behavior

Preview and sealed receiver view render points in the same order the author set in the draft. The anti-point moved to first position should appear first in preview and in the receiver's story-walk.

## Actual Behavior

Preview (and sealed receiver) render points in insertion order, ignoring `point_config.order`. The anti-point that was moved to first in the draft appears second in preview.

## Affected Files

- `src/app/utils/letter-snapshot-mapper.ts` — local `PointConfig` interface missing `order?: string[]` (lines 22–28); `snapshotToStoryWithPoints()` never sorts by order (lines 121–139); `docStoryToSnapshot()` does not pass `point_config.order` through (lines 174–197)

**Consumers impacted (no changes needed, fix propagates):**
- `src/app/components/letters/letter-flow-content.tsx:133`
- `src/app/components/letters/story-walk.tsx`
- `src/app/hooks/useLetterReadingState.ts`
- `src/app/pages/letter-preview-page.tsx`

**Not affected:**
- Draft view — already correct via `StoryCardDetail.tsx`
- Seal RPC / migrations — `order` already persisted
- `DocPointConfig` in `src/app/types/index.ts:1310` — already has `order?: string[]`

## Severity

**High** — silently violates author intent; the order chosen during authoring is a core expressive feature of the letter. Sealed letters already delivered are unaffected (data correct, reader just renders wrong order).

## Fix Approach

Three-line change in one file (`letter-snapshot-mapper.ts`):

1. Add `order?: string[]` to local `PointConfig` interface.
2. After filtering hidden points in `snapshotToStoryWithPoints()`, sort `visiblePoints` using an `orderMap` (same pattern as `StoryCardDetail.tsx:150–152`).
3. In `docStoryToSnapshot()`, add `order: docStory.point_config?.order` to the returned `point_config` object.

No migration, no backfill, no seal-RPC change needed.

## Acceptance Criteria

- [x] Preview renders points in the order set by the author in the draft (anti-point first if moved to first)
- [x] Sealed receiver view renders points in the same author-chosen order
- [x] Letters where the author never reordered points continue to render in insertion order (regression guard)
- [x] Letters sealed before P757 (no `order` field) continue to render in insertion order without error
- [x] If `order` array is stale (doesn't list every point), unlisted points appear at the end in insertion order
- [x] Hidden points are excluded from output even if listed in `order`
- [x] Regression tests pass: `src/tests/p767-point-order-snapshot-mapper.test.ts`
- [x] No console errors on preview or receiver delivery routes — mapper is a pure function; no new error paths (null/empty/stale order all handled via Array.isArray guards)
