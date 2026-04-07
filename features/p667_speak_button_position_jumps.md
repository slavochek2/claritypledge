---
status: qa
type: bug
rank: 1000067.0
severity: medium
date_reported: '2026-04-06'
created_date: 2026-04-06T00:00:00.000Z
tags:
  - live
  - ux
  - layout
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P667: /live — Speak Button Position Jumps on Idle Screen

## Summary

The Speak button on the /live idle screen jumps vertically in three related scenarios: when stories load, when the partner enters rating mode, and when session history appears after a round completes. All three share the same root cause.

## Root Cause

The two-zone flex layout (P600) derives the Speak button's vertical position from transient state that changes after mount. The top zone toggles between `justify-center` (no bottom content) and `justify-end` (bottom content present), and the bottom zone toggles between `flex-none` and `flex-[3]`. When these states change — stories load async, partner state arrives via Realtime, or history appears — the button snaps to a new position.

Deeper: the architectural decision to "derive layout structure from content presence" means the button position is a side-effect of what's below it, rather than being anchored independently.

## Invariants

- P600's design intent: avoid an empty 60% gap when the user has no stories. The two-zone layout was introduced to solve this — any fix must not regress this.
- `overflowAnchor: 'none'` on the scroll container prevents scroll jumping when history entries are prepended — must be preserved.
- `scrollContainerRef` reset-on-round-complete (`useLayoutEffect`) must continue to target the correct scroll container div.

## Reproduction Steps

### Symptom 1: Stories load → button jumps up
1. Open /live as a user with stories. Start a session.
2. Observe the Speak button position on initial render (centered vertically).
3. Wait for stories to finish loading (~1-2s).
4. Observe: Speak button jumps upward to the ~40% mark as "+ Select your story" appears below.

### Symptom 2: Mode locked → button jumps for listener
1. Open /live as User A (creator) in browser 1. Start a session.
2. Open /live as User B (guest) in browser 2. Join the session.
3. Both users see Speak button at stable position.
4. As User A: click Speak.
5. Observe User B: Speak button may shift position as `isListenerDuringLocalRating` changes and the story-select button hides.

### Symptom 3: Round complete → button jumps up
1. Complete a full rating round (both users rate).
2. After celebration, observe the idle screen with session history visible below the Speak button.
3. Observe: Speak button has jumped upward compared to the pre-round position. The `isCleanIdle` flag flips to `false` and the entire two-zone layout is replaced with `CONTENT_LAYOUT` (top-aligned scroll container).

**Reproduction rate:** 100% for symptoms 1 and 3. Symptom 2 is intermittent (depends on timing of bottom-zone content changes).

## Expected Behavior

Speak button stays at a stable vertical position regardless of what content loads below it. Transitions between states should not cause visible position snapping.

## Actual Behavior

Speak button snaps from one vertical position to another when bottom content changes. The jump is instantaneous — no transition or animation.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — IdleScreen component:
  - Line ~1224: `isCleanIdle` computation (gates the layout mode switch)
  - Line ~1284: `justify-end` vs `justify-center` toggle on top zone
  - Line ~1279-1328: entire two-zone layout block
  - Line ~1306: bottom zone `flex-[3]` vs `flex-none` toggle

## Severity

**Medium** — cosmetic UX issue, no functionality broken. However, button jumping creates a perception of instability and can cause misclicks on mobile.

## Fix Approach

Three options analyzed (from code-explorer agent):

**Option B (recommended — quick, low risk):** Always render the bottom zone as `flex-[3]`, show nothing inside it when `hasBottomContent` is false. The button stays at `justify-end` from first render. Cost: empty space for zero-story users (minor regression from P600 intent, but acceptable since most active users have stories).

**Option C (thorough, higher risk):** Restructure into a single layout with a fixed-position button slot and conditionally rendered content below. Eliminates the `isCleanIdle` layout-mode switch entirely. Resolves all 3 symptoms but is a larger refactor.

**Option D (polish layer):** CSS transition on the top zone. Masks the jump with animation. Not a fix, but could be layered on top.

## Acceptance Criteria

- [x] Speak button does not visibly jump when session history appears after round (symptom 3 — fixed: bottom zone always flex-[3], history renders in two-zone)
- [x] Zero-story users still see a reasonable layout (no giant empty gap)
- [x] Session history scroll behavior preserved (`overflowAnchor: 'none'`)

**Narrowed scope:** Symptoms 1 (story load) and 2 (partner rating mode) were originally listed here but have a deeper root cause: `hasScrollableContent` is role-blind — it reacts to the partner's `selectedStoryId` via shared Realtime state. This requires a separate fix (see P-number TBD). P667 only addresses the session history trigger.

## Resolution

**Fixed:** 2026-04-06
**Root cause:** The two-zone flex layout toggled between `justify-center`/`justify-end` and `flex-none`/`flex-[3]` based on transient state (`hasBottomContent`, `isCleanIdle`). When stories loaded async, partner state changed, or session history appeared, these toggles fired and the button snapped to a new position.
**Resolution:** Option B extended — always use `justify-end` and `flex-[3]` in the two-zone layout. Session history now renders in the bottom zone instead of triggering a layout mode switch to `CONTENT_LAYOUT`. The `isCleanIdle` gate no longer includes `sessionHistory.length > 0`.

**Files changed:**
- `src/app/components/partners/live-mode-view.tsx` (lines ~1222-1340)

**Regression test:** `e2e/p667-speak-button-position.spec.ts`
