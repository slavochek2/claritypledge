---
type: bug
rank: 1000749.0
severity: high
workstream: Letters
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [letters, privacy, preview, seal-rpc]
delivery_stage: fix
status: qa
pipeline_ran: [create-bug, fix]
---

# P749: Hidden points leak into letter preview and sealed letter reading

## Summary

Points marked hidden by the author in a letter draft still appear in the "Preview as recipient" view and in the receiver's sealed letter — the hidden filter never fires on either path.

## Root Cause

Two leaks, same missing plumbing (per-point `hidden` boolean is never populated, even though the mapper expects it):

**1. Preview path (pre-seal, `/letter/:docId/preview`)**
`src/app/pages/letter-preview-page.tsx:33-51` — `docStoryToSnapshot()` builds the snapshot from `docStory.story.points` directly and never consults `docStory.point_config.hidden`. No per-point `hidden` flag set, no filter applied.

**2. Seal RPC path (sealed letter → receiver)**
`supabase/migrations/20260412135402_fix_block_self_send.sql` (latest `seal_and_send_letter` definition) builds each point's JSON with `{ id, text, authorPosition, visibility }` — omits `hidden`. The doc's hidden array IS copied into a top-level `point_config.hidden` at line 93 of that migration, but the mapper at `src/app/utils/letter-snapshot-mapper.ts:123` filters via per-point `p.hidden` (boolean). The top-level array is ignored → filter never fires for sealed letters.

**Contrast — the path that works:** Non-owner viewing a shared doc at `/d/:id` — `src/app/pages/doc-detail-page.tsx:172` passes `pointConfig.hidden` as `hiddenPointIds` to `StoryCardDetail`, which filters correctly at `src/app/components/social/StoryCardDetail.tsx:143-148`. The bug is that letter paths bypass this working filter.

## Reproduction Steps

1. Signed in as any verified user, navigate to Letters → Drafts tab
2. Open any draft with at least 2 points on one story
3. On a point, click the eye-off icon to hide it (the draft view hides it optimistically and persists `point_config.hidden = [<pointId>]` on `doc_stories`)
4. Click "Preview as recipient" (or go to `/letter/:docId/preview`)
5. Observe: hidden point still renders in the preview walk
6. Complete draft and seal → recipient opens the delivered letter
7. Observe: hidden point still renders on the receiver's reading page

**Reproduction rate:** 100%

## Expected Behavior

A point marked hidden by the author must NOT appear in either:
- (a) The author's "Preview as recipient" view (`/letter/:docId/preview`)
- (b) The recipient's sealed letter reading view

Hidden points must also not count toward any "anti-point lead" calculation (per the security comment in `letter-snapshot-mapper.ts:6-8`). The only place an owner should see their hidden points is the draft editor itself (`doc-detail-page.tsx` as owner, with eye toggles) — that behavior is correct and must remain unchanged.

## Actual Behavior

Hidden points render in both preview and receiver view. No filter is applied on either path. Privacy intent set by the author is silently ignored once the letter leaves the draft editor.

## Affected Files

- `src/app/pages/letter-preview-page.tsx:33-51` — `docStoryToSnapshot()` omits hidden plumbing
- `src/app/utils/letter-snapshot-mapper.ts:118-123` — mapper filters via per-point `p.hidden` boolean only; ignores top-level `config.hidden` array
- `supabase/migrations/20260412135402_fix_block_self_send.sql:75-95` — latest `seal_and_send_letter` RPC per-point jsonb omits `hidden` boolean
- `src/app/pages/letter-reading-page.tsx` — consumes the mapper output (no direct bug, but the surface where the receiver leak manifests)

## Severity

**High** — privacy-intent leak. User explicitly marks a point as hidden on a draft, expecting it not to be shared, and it ships in the sealed letter anyway. Not a crash, but a violation of an explicit user-set privacy control on already-sent letters.

## Fix Approach

Three changes, narrowly scoped:

1. **Preview builder** (`letter-preview-page.tsx`) — in `docStoryToSnapshot`, read `docStory.point_config.hidden` array and set per-point `hidden: hiddenIds.includes(p.id)` so the existing mapper filter works.
2. **Seal RPC** — new migration defining `seal_and_send_letter` with `'hidden', ((ds.point_config->'hidden')::jsonb ? pt.id::text)` added to the per-point `jsonb_build_object`. Fixes all letters sealed after deploy.
3. **Mapper back-compat** (`letter-snapshot-mapper.ts`) — also honor top-level `config.hidden: string[]` as a fallback (filter out points whose id is in that array). Covers already-sealed letters whose snapshots carry only the top-level array.

Canary before fix: create draft with 2 points, hide 1, open `/letter/:docId/preview` — assert only the visible point renders. Also simulate a sealed snapshot with hidden id in top-level array and assert mapper filters it. Both must fail before fix and pass after.

## Acceptance Criteria

- [x] Preview at `/letter/:docId/preview` renders only non-hidden points (hidden ones are absent from the walk and from point counts) — Cases A, B, D in `src/tests/p749-hidden-points-snapshot-mapper.test.ts`; preview path now routes through extracted `docStoryToSnapshot` which populates per-point `hidden`
- [x] Recipient opening a sealed letter (fresh seal after fix) sees only non-hidden points — migration `20260418144500_p749_seal_rpc_hidden_per_point.sql` writes per-point `hidden`; reader filter at `letter-snapshot-mapper.ts:128` consumes it
- [x] Recipient opening a sealed letter from an existing pre-fix snapshot (top-level `hidden` array only, no per-point flag) also sees only non-hidden points — no backfill required — Case B; mapper back-compat reads `config.hidden: string[]`
- [x] Author's draft editor view (`/d/:docId` as owner) still shows all points with eye toggles — unchanged — `doc-detail-page.tsx` not in fix scope; verified by review
- [x] Non-owner shared-doc view at `/d/:docId` still filters hidden points via existing path — unchanged — same file untouched
- [x] Regression test passes: `src/tests/p749-hidden-points-snapshot-mapper.test.ts` — 4 cases passing, 1904 total tests pass, no regressions
- [x] No console errors during either flow — browser smoke confirmed; compose page follow-on fix applied

## Resolution

**Fixed:** 2026-04-18
**Root cause:** Two independent leaks, same missing plumbing — the per-point `hidden` boolean that the mapper filter expects was never populated. (1) Preview builder `docStoryToSnapshot` in `letter-preview-page.tsx` ignored `docStory.point_config.hidden`. (2) Latest seal RPC stored `hidden` as a top-level array in `point_config` but the mapper only inspected per-point booleans.

**Resolution:** Four atomic changes:
1. Extracted `docStoryToSnapshot` from `letter-preview-page.tsx` into `letter-snapshot-mapper.ts` (co-located with the reader to make shape drift visible at review time); populated per-point `hidden` from `docStory.point_config.hidden`.
2. New migration `20260418144500_p749_seal_rpc_hidden_per_point.sql` adds per-point `'hidden'` field to `seal_and_send_letter` JSON output, derived from `doc_stories.point_config.hidden`.
3. Mapper back-compat: `snapshotToStoryWithPoints` now also filters points whose id appears in top-level `config.hidden: string[]`. Permanent — covers letters sealed before this fix.
4. `countTotalPoints` mirrors the same back-compat fallback so cover counts stay honest for pre-fix letters.

**Files changed:**
- `src/app/utils/letter-snapshot-mapper.ts` — added `docStoryToSnapshot` export + top-level-array back-compat in reader
- `src/app/utils/letter-reading-utils.ts` — top-level-array back-compat in count helper
- `src/app/pages/letter-preview-page.tsx` — import swap (removed local builder)
- `supabase/migrations/20260418144500_p749_seal_rpc_hidden_per_point.sql` — new
- `src/tests/p749-hidden-points-snapshot-mapper.test.ts` — Cases A (sanity), B (top-level filter), C (count helper), D (builder→reader round-trip)
