---
id: P679
type: bug
status: all-done
completed_at: 2026-04-09
severity: high
date_reported: 2026-04-09
date_resolved: 2026-04-09
root_cause: sessionHistory.length > 0 in hasScrollableContent triggered isCleanIdle=false, hiding the story button
resolution: Removed session history display from /live entirely; history remains on /sessions
pipeline_ran: [fix, ship]
---

# P679: Remove Session History from /live

## Bug Description

**Reported:** 2026-04-09
**Severity:** High (blocks story selection after completing a round)

**Symptoms:**
- After a round completes on /live, a "THIS SESSION" history list appears inline
- The "Select your story" button becomes hidden, blocking subsequent rounds
- Session history already has a dedicated page at /sessions shown after live ends

**Root cause chain:**
`sessionHistory.length > 0` → `hasScrollableContent = true` → `isCleanIdle = false` → layout switches from two-zone (which has the story button) to scrollable (which doesn't show it in the clean-idle path)

**Reproduction steps:**
1. Start a session on /live
2. Complete a round
3. Expected: "Select your story" button remains visible for next round
4. Actual: "THIS SESSION" history appears; "Select your story" button is hidden

## Acceptance Criteria

- [ ] No "THIS SESSION" section appears after completing a round on /live
- [ ] "Select your story" button remains visible after a round completes
- [ ] /sessions page still shows full session history (unaffected)
- [ ] `npm run build` passes (no type errors)
- [ ] `npm test` passes

## Files to Change

**`src/app/components/partners/live-mode-view.tsx`**

1. Remove `sessionHistory.length > 0` from `hasScrollableContent` (line ~1225)
2. Remove `SessionHistoryList` from clean-idle bottom zone (lines ~1333-1338)
3. Remove `SessionHistoryList` from non-clean-idle layout (lines ~1405-1411)
4. Remove inline `RoundSummaryScreen` (lines ~1343-1348)
5. Clean up `selectedHistoryIndex` state (lines ~1126-1133): remove useState, useEffect, and all references
6. Remove `SessionHistoryList` import if no longer used

**Keep intact:**
- `sessionHistory` data collection in `clarity-live-page.tsx`
- `SessionHistoryList` component itself
- `hideHistory` prop (still controls `hasRatingData`)
