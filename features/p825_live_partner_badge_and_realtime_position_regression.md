---
status: in-progress
type: bug
rank: 1000822
severity: high
workstream: live
date_reported: '2026-04-27'
created_date: '2026-04-27'
tags: [live, partner-badge, positions, realtime, p792-regression]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_files:
    - src/tests/p825-free-mode-badge-identity.test.tsx
  test_pattern_notes: "Layer A canary uses it.todo (P818 pattern) — verified failing locally before mark. /fix flips to `it`. Layer B canary is structural: src/tests/p637-drift-detection-completeness.test.ts already lists livePositionsCreator/Joiner in KNOWN_UNCOVERED with a TODO. /fix removes those two entries to surface the failing assertion, then extends drift detection in clarity-live-page.tsx to make it pass."
  root_cause: "Two confirmed defects. (A) free-mode-view.tsx:226 invokes <LiveStoryCardExpanded> without badgePersonName props — when viewer is story author, badge falls back to story.authorName. P792 fix scope was live-mode-view.tsx only; free mode was never wired. (B) clarity-live-page.tsx:1445 drift-poll fallback compares deprecated livePositions field instead of livePositionsCreator/livePositionsJoiner — when Realtime WebSocket drops on mobile, partner position writes are silently never detected as drift."
  confidence: high
  surfaces_in_scope: [free-mode-view-badge, drift-detection-livePositions]
  surfaces_deferred: [round-summary-screen-badge, letter-flow-content-badge]
  reproduced_at: 2026-04-27
---

# P825: /live shows viewer's own name above point + partner position taps don't propagate

## Summary

In a /live picker session on prod (2026-04-26), the row above each point showed the viewer's own full name ("Vyacheslav Ladischenski") instead of the partner's first name ("Su"), AND the partner's position taps during the session did not propagate to the viewer's screen. P792 was meant to fix the badge identity (shipped 2026-04-23, in main) but the symptom returned. The position-not-updating part is not covered by P792 — P792 only preloads positions on join, not Realtime updates during the session.

## Root Cause

**Confirmed via code-level disproofs (no live repro needed). Session was free mode (user-confirmed).**

### Layer A — Free-mode badge identity falls back to story author

`free-mode-view.tsx:226` invokes `<LiveStoryCardExpanded>` with only `story`, `isOwnStory`, `isGuest`, `className`, `defaultExpanded` — **no badge props.** P792's fix threaded `badgePersonName` / `badgePersonEarsCount` / avatar props through all 13 invocation sites in `live-mode-view.tsx`, but its scope was explicitly that file only. Free mode is a separate file with its own caller (`<FreeModeView>` at `live-mode-view.tsx:874`) that doesn't even receive `userId` or `partnerEarsCount` — the data isn't threaded down.

Result: in `live-story-card-expanded.tsx:288, 295`, when `badgePersonName` is `undefined`, the row falls back to `story.authorName`. When the viewer is the story author (the common case in /live), the row above the point displays the viewer's own full legal name — exactly matching the screenshot.

**Why H2 of the original hypothesis (`isAuthorOfSelected` gate) was wrong:** that gate is in `live-mode-view.tsx` (guided mode). User confirmed the session was free mode, so guided-mode logic never ran.

### Layer B — Drift-poll fallback uses deprecated position field shape

`clarity-live-page.tsx:1445`:
```ts
const livePositionsDrift = JSON.stringify(serverState.livePositions ?? {}) !== JSON.stringify(localState.livePositions ?? {});
```

Position writes go to `livePositionsCreator` / `livePositionsJoiner` (P562, see `clarity-live-page.tsx:1901-1902, 1955, 2916-2917`). The `livePositions` field is marked `@deprecated` in `src/app/types/index.ts:750`. Both `serverState.livePositions` and `localState.livePositions` are always `undefined` after P562 — the JSON.stringify comparison always returns `false`, drift never fires.

Realtime WebSocket DOES propagate position changes via wholesale `setLiveState` at `clarity-live-page.tsx:1272`. But when the WS drops (common on mobile per the comment at line 1444 — "P490: livePositions missing from drift check caused guest positions to never sync when Realtime WebSocket dropped"), the drift-poll fallback is the only way deltas arrive. With the wrong field shape, partner position writes are silently lost forever.

**Confirmed by existing test:** `src/tests/p637-drift-detection-completeness.test.ts:116-117` already documents `livePositionsCreator` / `livePositionsJoiner` as `KNOWN_UNCOVERED` with a TODO to file a follow-up. P825 is that follow-up.

## Invariants

(From P792 — preserved)
- The row directly above a POINT reflects the **other person's** identity + stance. Never the viewer's.
- `livePositionsCreator` and `livePositionsJoiner` must be written in a single `updateLiveState({...})` call — never two separate calls (P643 race-prevention).

(New, this bug)
- Partner position changes during a session must propagate to the viewer's screen within one Realtime tick — initial-load-only is insufficient.
- The badge identity gate must not fall back to story author when the gate evaluates false. Either show partner unconditionally for /live picker sessions, or render no badge at all.

## Reproduction Steps

1. Two accounts (A = story author, B = partner). B saves positions on ≥2 points of A's story.
2. A opens /live on mobile, selects a story from the picker (not letter-sourced). B joins from B's account.
3. A advances to post-rate / explain-back phase.
4. **Observe on A's screen:** row above each point shows A's own full name + author avatar, not B's first name.
5. B taps a different position on a point.
6. **Observe on A's screen:** B's position change is NOT reflected.

**Reproduction rate:** TBD via /reproduce — both symptoms seen in single prod session 2026-04-26.

## Expected Behavior

- Row above each point shows partner's first name + partner's avatar + partner's ear count + partner's position badge — across all 13 in-session phases.
- Partner's position taps during the session propagate to the viewer's screen within one Realtime tick.

## Actual Behavior

- Row above each point shows viewer's own full legal name + author avatar (fallback path triggered).
- Partner's position taps during the session do not propagate — viewer sees stale position state for the entire session.

## Affected Files

**Layer A (free-mode badge identity):**
- `src/app/components/partners/free-mode-view.tsx` — `FreeModeViewProps` (lines 34-53) is missing `userId`/`partnerEarsCount`/`partnerAvatarUrl`/`partnerAvatarColor`/`partnerHasPledged`. The `<LiveStoryCardExpanded>` invocation at line 226 passes none of the badge props.
- `src/app/components/partners/live-mode-view.tsx` — caller of `<FreeModeView>` at lines 874-885; needs to thread the new partner props (already in scope at this site — see lines 1090-1100 sibling block which already uses them for guided-mode invocations).
- `src/app/components/partners/live-story-card-expanded.tsx` — no change needed. The fallback at lines 288, 295 (`badgePersonName ?? authorName`) is correct behavior; it only misfires because callers don't pass `badgePersonName`.

**Layer B (drift detection coverage):**
- `src/app/pages/clarity-live-page.tsx` — drift detection block at line 1445 currently checks deprecated `livePositions` field. Add two new drift comparisons next to it for `livePositionsCreator` and `livePositionsJoiner`. Include both in the `serverHasUpdate` OR-chain at line 1453.
- `src/tests/p637-drift-detection-completeness.test.ts` — remove `livePositionsCreator` and `livePositionsJoiner` entries from `KNOWN_UNCOVERED` (lines 116-117). The structural test then enforces the fix.

## Severity

**High** — two visually broken behaviors in the primary /live flow on prod. Witnessed in real partner session, not synthetic. Erodes trust in the calibrated communication mechanic.

## Fix Approach

The fix is mechanical — both layers mirror existing patterns. No architectural decisions remain after /reproduce.

### Layer A — Thread badge props into FreeModeView (mirror P792)

P792's pattern in `live-mode-view.tsx:678-685` is the reference:

```ts
const isAuthorOfSelected = userId !== undefined && selectedStory?.authorId === userId;
const badgePersonName = isAuthorOfSelected ? getFirstName(partnerName) : undefined;
const badgePersonEarsCount = isAuthorOfSelected ? partnerEarsCount : undefined;
const badgePersonAvatarUrl = isAuthorOfSelected ? partnerAvatarUrl : undefined;
const badgePersonAvatarColor = isAuthorOfSelected ? partnerAvatarColor : undefined;
const badgePersonHasPledged = isAuthorOfSelected ? (partnerHasPledged ?? false) : undefined;
```

Steps:

1. **Extend `FreeModeViewProps`** in `free-mode-view.tsx:34-53`. Add five required-or-optional props matching the partner-side fields already in scope at the caller:
   - `userId?: string`
   - `partnerEarsCount?: number`
   - `partnerAvatarUrl?: string`
   - `partnerAvatarColor?: string`
   - `partnerHasPledged?: boolean`

2. **Compute badge gate inside `FreeModeView`** (after line 69 where `displayPartnerName` is derived). Mirror the P792 block above verbatim, swapping `partnerName` for the prop already present.

3. **Pass the five `badgePerson*` props** to `<LiveStoryCardExpanded>` at line 226 — same shape as `live-mode-view.tsx:906-911` (and 12 other sites in that file).

4. **Thread the five new props from the caller** at `live-mode-view.tsx:874-885`. The values are already in scope at that call site (the parent `LiveModeView` component receives them as props per P792). No new fetch, no new effect.

### Layer B — Add new-shape drift comparisons

In `src/app/pages/clarity-live-page.tsx`, next to line 1445:

```ts
const livePositionsCreatorDrift = JSON.stringify(serverState.livePositionsCreator ?? {}) !== JSON.stringify(localState.livePositionsCreator ?? {});
const livePositionsJoinerDrift = JSON.stringify(serverState.livePositionsJoiner ?? {}) !== JSON.stringify(localState.livePositionsJoiner ?? {});
```

Add both flags to the `serverHasUpdate` OR-chain at line 1453 and the `analytics.track('live_state_drift_detected', ...)` payload at lines 1462-1474 (same pattern as `livePositionsDrift`, `freeSliderCreatorDrift`, etc.).

In `src/tests/p637-drift-detection-completeness.test.ts`, remove these two lines from `KNOWN_UNCOVERED`:

```ts
livePositionsCreator: 'P562 replacement for nested livePositions',
livePositionsJoiner: 'P562 replacement for nested livePositions',
```

The structural assertion at line 137 then forces both fields to appear in the drift block — which the new code at clarity-live-page.tsx:1445 satisfies.

### Canary flips

After Layer A is in:

- `src/tests/p825-free-mode-badge-identity.test.tsx` — change `it.todo(...)` to `it(...)`. Test asserts `<span class="font-medium">Bob</span>` exists in the rendered DOM and `<span class="font-medium">alice</span>` does not.

After Layer B is in:

- `src/tests/p637-drift-detection-completeness.test.ts` — already failing once `KNOWN_UNCOVERED` entries are removed; passes once drift comparisons are added.

## Acceptance Criteria

- [ ] **Layer A:** Free-mode /live, viewer is story author, partner has saved positions on a point — the row above the point shows partner's first name (e.g., "Su"), not viewer's name.
- [ ] **Layer A regression guard:** Guided-mode /live behavior unchanged — P792's wiring in `live-mode-view.tsx` not touched.
- [ ] **Layer B:** When `live_sessions.live_state.livePositionsJoiner` (or `Creator`) is updated server-side and the Realtime WS is degraded, the drift-poll picks up the change within one poll interval and merges into local state.
- [ ] **Layer B regression guard:** No new false-positive drift events — JSON.stringify comparison normalizes empty `{}` for both sides (matches existing `livePositions` pattern at line 1445).
- [ ] **Canary 1 passes:** `npm test -- --run src/tests/p825-free-mode-badge-identity.test.tsx` (after flipping `it.todo` → `it`).
- [ ] **Canary 2 passes:** `npm test -- --run src/tests/p637-drift-detection-completeness.test.ts` (after removing `livePositionsCreator`/`livePositionsJoiner` from `KNOWN_UNCOVERED`).
- [ ] **No regression in P792 tests:** `npm test -- --run src/tests/p792-live-badge-person-all-phases.test.tsx` and `p792-live-picker-position-preload.test.tsx` both still pass.
- [ ] `./scripts/pre-commit-checks.sh` passes clean.

## Surfaces Audited — Not Affected

- `src/app/components/partners/round-summary-screen.tsx:84` — `<LiveStoryCardExpanded>` with `defaultExpanded={false}`; points are not rendered, so the badge row above the point doesn't appear. No bug surface here.
- `src/app/components/letters/letter-flow-content.tsx:249, 291` — `<LiveStoryCardExpanded hidePoints />`; points are explicitly not rendered. No bug surface here.
- `src/app/components/letters/story-walk.tsx:147`, `src/app/components/letters/letter-prediction-walk.tsx:95` — letter-mode flows; per the rendering condition at `live-story-card-expanded.tsx:285`, letter mode follows a different gate (`letterMode && authorName`) which intentionally shows the author. Not in scope.
