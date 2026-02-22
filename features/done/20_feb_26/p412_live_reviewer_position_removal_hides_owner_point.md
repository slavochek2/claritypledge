---
status: done
completed_at: '2026-02-22'
type: bug
rank: 125464.0
severity: high
workstream: live
date_reported: '2026-02-22'
created_date: '2026-02-22'
tags: [live-session, positions, story-points, live-state]
---

# P412: Reviewer removing their position hides owner's linked story point from the session view

## Summary

When the reviewer removes their own position on a point during a live session, that point disappears from the session view — for both parties. The point belongs to the owner's story and should remain visible regardless of the reviewer's position state.

## Root Cause

The filter in `live-mode-view.tsx` (line 288) hides a point when `livePositions[currentUserName][pointId] === null`:

```typescript
.filter((p) => !(p.id in myPositions && myPositions[p.id] === null))
```

`currentUserName` is the **viewer's session name** — meaning the same filter applies to both owner and reviewer screens. When the reviewer removes their position, `livePositions[reviewerName][pointId] = null` is written to `live_state`. On the reviewer's own screen, `currentUserName = reviewerName`, so the filter drops the point from the reviewer's rendered list.

The filter's intent is correct for the **owner**: if the owner removes their position, their point should unlink (the DB trigger handles permanent cascade; this filter gives immediate feedback). But the filter incorrectly applies the same hide logic to the **reviewer**: a reviewer removing their position should only clear their position badge — not hide the point itself.

The points shown in a live session are the **owner's story-linked points**, not a function of the reviewer's position state. The reviewer's position removal is only relevant to their badge (Agree / Disagree / Unsure → no badge).

## Reproduction Steps

1. Open a live session with two participants (owner + reviewer), each on their own browser
2. Owner selects a story — confirm both sides see 2 linked points
3. Reviewer sets a position on one of the points (e.g. "Agree")
4. Reviewer removes that position ("Unsave" → "Remove position" → confirm)
5. Observe: the point disappears from the reviewer's view (only 1 point shown instead of 2)

**Reproduction rate:** 100% — observed in screenshots Feb 22 2026

## Expected Behavior

After the reviewer removes their position:
- The point remains visible to both parties (it is the owner's linked point, unaffected by reviewer actions)
- The reviewer's position badge for that point is cleared (no Agree/Disagree/Unsure shown)
- Point count stays at 2 for both sides

## Actual Behavior

After the reviewer removes their position:
- The point disappears from the reviewer's view (count drops from 2 → 1)
- Owner's view may also lose the point depending on `live_state` propagation (full overwrite path carries the null entry to both sides)

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — line 288: filter hides points based on `livePositions[currentUserName][pointId] === null`; this logic should only apply when `currentUserName` is the story owner, not the reviewer
- `src/app/pages/clarity-live-page.tsx` — lines 934–944: `onAfterRemove` callback writes `livePositions[name][pointId] = null`; spreads `...currentPositions` which may carry stale null entries from the other participant into the patch, re-broadcasting them on full-overwrite path
- `supabase/migrations/20260220130000_patch_live_state_rpc.sql` — line 21: `||` merge replaces entire `livePositions` key (top-level only), so a reviewer's patch can re-broadcast a previously-resolved null for the owner's name if it was in their local ref

## Severity

**High** — the reviewer loses visibility into owner's points mid-session every time they remove a position; breaks the core session review flow.

## Fix Approach

The filter at `live-mode-view.tsx:288` should be scoped to the **story owner only**. The reviewer's null position should affect only their position badge rendering, not point visibility.

Two options:
1. **Preferred (simple):** Pass the owner's session name into `live-mode-view.tsx` and only apply the hide-filter when `currentUserName === ownerName`. For the reviewer, never filter points based on `livePositions` — always show all story points.
2. **Alternative:** Split the two concerns — a separate `removedByOwner` set in `live_state` tracks owner-removed points (written only when owner removes); the visibility filter reads from that set instead of from `livePositions[currentUserName]`.

Option 1 is simpler and less invasive. The DB cascade trigger already handles the permanent case when the owner removes their position — the point won't appear in `selectedStoryData` for future story selections.

Also worth auditing the `onAfterRemove` stale-ref spread in `clarity-live-page.tsx:934` — the `...currentPositions` spread should not carry other participants' null entries forward in the patch.

## Acceptance Criteria

- [ ] Reviewer removes their position on a point → point remains visible to both owner and reviewer (count unchanged)
- [ ] Reviewer's position badge clears after removal (no Agree/Disagree/Unsure shown for that point)
- [ ] Owner removes their position on a point → point disappears from both views (existing intended behavior preserved)
- [ ] Owner's point count on their own screen is not affected by any reviewer action
- [ ] No console errors during the reviewer position removal flow
