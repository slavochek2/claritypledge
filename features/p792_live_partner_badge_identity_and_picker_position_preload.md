---
status: qa
type: bug
rank: 1000752.5
severity: high
workstream: live
date_reported: '2026-04-22'
created_date: '2026-04-22'
tags: [live, partner-badge, positions, picker]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P792: /live partner row shows wrong identity + picker start does not preload positions

## Summary

Two inseparable defects in /live: (A) the partner-row badge shows the story author (viewer) instead of the partner across all 10 in-session phases; (B) picker-sourced /live does not fetch saved positions at story-select time, so own pre-selection and partner badge render incorrectly on first paint.

## Root Cause

### Defect A — badge identity falls back to story author

`live-mode-view.tsx` has 13 `<LiveStoryCardExpanded>` invocation sites. Only 3 (lines 1385, 1702, 1850 — pre-session readiness views) pass `badgePersonName` + `badgePersonEarsCount`. The other 10 (clarify, explain-back, hear-what's-missing, post-rate, celebrate phases — lines 2588, 2663, 2751, 2823, 2913, 2997, 3050, 3184, 3311, 3445) pass neither, so `badgePersonName` arrives `undefined` and the card falls back to `authorName` (the viewer). Additionally, even the 3 correct sites never pass avatar props (`badgePersonAvatarUrl`, `badgePersonAvatarColor`, `badgePersonHasPledged`), so the partner avatar always renders as a default-colored initial with no Gravatar photo and no pledge ring.

### Defect B — picker-start skips position fetch

`clarity-live-page.tsx:1758` (`handleSelectStory`) writes `selectedStoryData` but not `livePositionsCreator` / `livePositionsJoiner`. The letter-sourced bootstrap (`bootstrapLetterSourcedSession`, line 2760-2812, P733) already fetches both parties' positions via `pointsService.getMyPositionsForPoints` and writes them atomically — the picker path needs the same treatment.

## Invariants

- The row directly above a POINT reflects the **other person's** identity + stance. Never the viewer's.
- `livePositionsCreator` and `livePositionsJoiner` must be written in a single `updateLiveState({...})` call — never two separate calls (P643 race-prevention).
- `toPositionRecord` helper (currently inlined at `clarity-live-page.tsx:2768-2769`) must be lifted to module scope so picker-start and letter-start share one definition.

## Reproduction Steps

1. Two accounts (A = story author, B = partner). B saves positions on ≥2 points of A's story.
2. A opens /live, selects a story from the picker (not letter-sourced). B joins.
3. **Observe on A's screen (in-session):** partner row above each point shows A's own avatar + name, not B's.
4. Advance to clarify / explain-back / hear-what's-missing phases. Observe: partner row still shows wrong identity.
5. Also observe: own pre-selection buttons (Disagree/Unsure/Agree) show no saved position for A, even when A had positions saved.

**Reproduction rate:** 100% for picker-sourced sessions.

## Expected Behavior

- Partner row above every point shows B's Gravatar photo (or colored initial) + B's first name + B's pledge ring (if pledged) + B's ear count + B's position badge — across ALL phases.
- Own pre-selection shows A's saved positions on first paint (picker-sourced flow matches letter-sourced P733 behavior).

## Actual Behavior

- Partner row shows A's avatar + A's name in all 10 in-session phases.
- Even in the 3 "correct" pre-session views, partner avatar lacks Gravatar photo and pledge ring.
- Own pre-selection strip shows no saved positions in picker-sourced flow.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — badge-person block (~line 660); 4 sub-component prop declarations (~1090, 1535, 1615, 1756); 3 forwarding call sites (1385, 1702, 1850); 10 bare call sites missing badge props (2588, 2663, 2751, 2823, 2913, 2997, 3050, 3184, 3311, 3445)
- `src/app/pages/clarity-live-page.tsx` — `handleSelectStory` (~1758, missing position fetch); `partnerProfile` state missing (needed for avatar props); `<LiveModeView>` invocation (~4230, missing 3 avatar props); no joiner-preload `useEffect`
- `src/app/components/partners/live-story-card-expanded.tsx` — no change needed; props it reads are already in place

## Severity

**High** — both the primary picker-sourced /live flow and the partner identity row are visually broken for every user in every in-session phase. The defects are inseparable: fixing only one still looks broken.

## Fix Approach

**Fix A — wire badge-person identity through all 13 call sites + add avatar triple everywhere:**
1. In `clarity-live-page.tsx`, add `useEffect` fetching `getProfile(partnerProfileId)` → new `partnerProfile` state (adjacent to existing ears-count effect at ~376-385; leave that block intact).
2. Pass 3 new props to `<LiveModeView>` (~4230): `partnerAvatarUrl`, `partnerAvatarColor`, `partnerHasPledged`.
3. In `live-mode-view.tsx` ~660, extend badge-person block with the 3 new avatar props (same `isAuthorOfSelected ? partnerX : undefined` guard).
4. Thread 3 new props through 4 intermediate sub-components (~1090, 1535, 1615, 1756) and all 13 direct `<LiveStoryCardExpanded>` invocations.

**Fix B — preload positions on picker-start and joiner-joins-after-pick:**
1. In `handleSelectStory` (~1758): lift `toPositionRecord` to module scope; fetch both parties' positions via `Promise.all`; include `livePositionsCreator` + `livePositionsJoiner` in the same `updateLiveState({...})` call (atomic).
2. Add `useEffect` keyed on `[session?.joinerProfileId, liveState.selectedStoryId]`: when both truthy and `livePositionsJoiner` empty, fetch joiner's positions and merge via `updateLiveState`.

Reference: `bootstrapLetterSourcedSession` (same file, P733) is the pattern to mirror.

**Scope discipline:** this fix covers `/live` surfaces only (`live-mode-view.tsx`, `live-story-card-expanded.tsx`, `live-content-cards.tsx`, `clarity-live-page.tsx`). Story-card (`StoryCardDetail.tsx`) and profile/embed (`point-card-with-links.tsx`) surfaces are tracked in a sibling plan and must not be touched here.

## Acceptance Criteria

- [ ] In all 13 `<LiveStoryCardExpanded>` invocations inside `live-mode-view.tsx`, when the viewer is the story author, `badgePersonName` equals the partner's first name (not `undefined` and not the author's name)
- [ ] Partner row above each point shows the partner's Gravatar photo (if set), correct avatar color, and pledge ring (if pledged) — in pre-session AND all in-session phases
- [ ] Picker-sourced /live: own pre-selection buttons show saved positions on first paint (same as P733 letter-sourced behavior)
- [ ] Picker-sourced /live: partner position badges visible on first paint when partner had saved positions
- [ ] Joiner-arrives-after-pick: partner positions load within one Realtime tick of joiner joining
- [ ] No regression on letter-sourced /live (P733 flow unaffected)
- [ ] Unit test passes: `src/tests/p792-live-picker-position-preload.test.tsx`
- [ ] Unit test passes: `src/tests/p792-live-badge-person-all-phases.test.tsx`
- [ ] `./scripts/pre-commit-checks.sh` passes clean
