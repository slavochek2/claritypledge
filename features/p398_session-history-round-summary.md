---
status: backlog
type: story
rank: 10
workstream: C1
tags:
  - live
  - history
  - ux
  - calibration
created_date: 2026-02-19T00:00:00.000Z
reviews:
  ux: pending
  architect: null
---

# P398: Clickable Session Round History with Summary Screen

## Problem Statement

### Current State

After a story round completes — both parties click "Continue" on the celebration screen — the completed round is added to a "THIS SESSION" history list shown on the idle screen below the action buttons. Each entry shows a checkmark icon, a content-type icon, and the story/point title. Nothing else.

The list is read-only. There is no way to revisit the details of a completed round.

### Pain Points

- **Users lose the journey data immediately.** The celebration screen shows the full "Journey to Understanding" — checker rating, responder rating, all explain-back rounds. When the user clicks "Continue", that screen disappears and there is no way to view it again.
- **The history list signals completion but provides no insight.** A checkmark and a title confirm something happened, but not how it went. Coaches running a pilot session cannot refer back to earlier round scores during debrief.
- **Missed coaching moment.** The explain-back journey is the product's core differentiator. Surfacing it after the fact (not just during) reinforces its value and gives facilitators something concrete to discuss.

### Who Is Affected

- Workshop facilitators running /live sessions who want to debrief each story round at the end of the session
- Both participants who want to recall how a specific round progressed (e.g. "what was the gap on the second story?")


## Intention (Why This Matters)

### Strategic Importance

Calibration data is the product's core value. The "Journey to Understanding" is already computed and displayed during each round. Making it accessible after the round costs little and returns significant value: facilitators can reference exact numbers in debrief, and participants can see their progress across the session at a glance.

### Why Now

P272 (Live Story Point Verification) shipped the full rating flow and the celebration screen. The journey data is now being written to `sessionHistory` in local state. This is the natural next step — enrich those entries with journey data at capture time and surface them on demand.

### Impact If Not Solved

Session history entries remain decorative. Facilitators and participants cannot revisit completed round details without relying on memory. The explain-back journey — the product's differentiator — is only visible during a narrow window and then disappears.


## Business Requirements

### Must-Haves

1. Each entry in the "THIS SESSION" list is tappable.
2. Tapping an entry opens a round summary screen showing: story/point title, partner name, timestamp, and the full Journey to Understanding (checker rating, responder rating, all explain-back ratings).
3. The summary screen has a "Back" action that returns to the idle screen.
4. Journey data is captured at round completion time and persisted in `sessionHistory` for the duration of the session (in-memory; no cross-session persistence).

### Out of Scope

- Cross-session persistence (history is still in-memory, lost when the session ends — that is a separate future feature).
- Sharing or exporting round summaries.
- Summary screens for skipped rounds (skipped rounds already appear in the history list with the same `{ title, type }` shape; they will remain non-clickable or display a simplified "Skipped" summary — decision at implementation time).


## Data Model Change

### Current Type (`SessionHistoryItem` in `live-content-cards.tsx` and `sessionHistory` in `src/app/types/index.ts`)

```ts
{ title: string; type: 'story' | 'point' | 'free' }
```

### Required Extension

```ts
interface SessionHistoryItem {
  title: string;
  type: 'story' | 'point' | 'free';
  // Journey data — undefined for skipped rounds
  checkerRating?: number;
  responderRating?: number;
  explainBackRatings?: number[];
  checkerName?: string;         // who was the checker in this round
  partnerName?: string;         // display name of the partner
  completedAt?: string;         // ISO timestamp, Date.now().toISOString()
  skipped?: boolean;            // true if round was skipped
}
```

The `sessionHistory` field in `LiveState` (currently typed inline in `src/app/types/index.ts` line 656) should be updated to use the enriched type.


## Implementation Guide

### 1. Update `SessionHistoryItem` type

`SessionHistoryItem` is currently defined locally inside `live-content-cards.tsx`. It must be promoted to a shared location — either `src/app/types/index.ts` or a dedicated live-session types file — so both the list component and the page can reference it.

### 2. Capture journey data on round completion

In `src/app/pages/clarity-live-page.tsx`, two callbacks build `historyEntry` before calling `updateLiveState`:

- **`handleCelebrationComplete`** (line ~1165) — natural completion path (both click Continue)
- **`handleSkip`** (line ~1109) — skip path

The natural completion path (`handleCelebrationComplete`, inside the `bothAcknowledged` branch) is where full journey data is available in `confirmedLiveStateRef.current` and should be captured:

```ts
const historyEntry = currentState.selectedStoryId
  ? {
      title: contentTitle || 'Story verification',
      type: 'story' as const,
      checkerRating: currentState.checkerRating,
      responderRating: currentState.responderRating,
      explainBackRatings: currentState.explainBackRatings,
      checkerName: currentState.checkerName,
      partnerName: partnerName ?? undefined,
      completedAt: new Date().toISOString(),
    }
  : /* similar for point and free */;
```

The skip path can set `skipped: true` and omit rating fields.

### 3. Make history items clickable — `SessionHistoryList`

Add an `onItemClick` callback prop to `SessionHistoryList`:

```ts
interface SessionHistoryListProps {
  history: SessionHistoryItem[];
  className?: string;
  onItemClick?: (index: number) => void;
}
```

Each history row becomes a `<button>` (or a div with `role="button"`) when `onItemClick` is provided. Rows for skipped rounds (or rounds without journey data) may render without click affordance, or open a simplified view — decide at implementation time.

Visual affordance: add a subtle right-chevron icon to clickable rows. Existing checkmark + content-type icon layout is preserved.

### 4. Round summary screen — new component

A new component `RoundSummaryScreen` (or `SessionHistoryDetail`) renders the summary view. It is not a page route — it is an in-session overlay, likely:

- A **sheet/drawer** (bottom sheet on mobile, side panel on desktop), OR
- An **inline view replacement** (the idle screen content is replaced by the summary, and a back button restores it)

The inline view replacement is simpler — no sheet infrastructure needed. Prefer it unless design review identifies a reason to use a sheet.

The component receives a `SessionHistoryItem` and renders:

1. Story/point title (heading)
2. Partner name and round timestamp (subtitle)
3. `JourneyToUnderstanding` component — already exists in `live-mode-view.tsx`, already accepts `checkerRating`, `responderRating`, `explainBackRatings`, `checkerName`, `displayPartnerName`, `isChecker`
4. A "Back" button that calls `onBack` prop

`JourneyToUnderstanding` is not currently exported — it will need to be exported from `live-mode-view.tsx` or the summary component will need to be co-located in the same file.

### 5. State wiring in `clarity-live-page.tsx`

Add local state for the selected history index:

```ts
const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number | null>(null);
```

Pass to `SessionHistoryList`:

```tsx
<SessionHistoryList
  history={liveState.sessionHistory ?? []}
  onItemClick={(i) => setSelectedHistoryIndex(i)}
/>
```

When `selectedHistoryIndex !== null`, render `RoundSummaryScreen` instead of the idle content (or on top of it via overlay). Pass `onBack={() => setSelectedHistoryIndex(null)}`.

Reset `selectedHistoryIndex` to `null` when a new round starts (e.g. when `ratingPhase` leaves `'idle'`).


## Acceptance Criteria

1. After a round completes naturally (both click Continue), the history entry in "THIS SESSION" is visually distinct from non-clickable entries (e.g. has a chevron icon).
2. Tapping a completed history entry opens the summary screen without navigating away from the /live session.
3. The summary screen shows: title, partner name, timestamp, and the Journey to Understanding with correct ratings for that round.
4. The "Back" button on the summary screen returns to the idle state without disrupting session state.
5. The summary screen is not accessible during an active round (i.e. while `ratingPhase !== 'idle'`).
6. Skipped rounds either have no click affordance or show a clearly labelled "Skipped" summary — no crash if tapped.
7. Session history data is not persisted across sessions (page reload clears it — same as today).


## Files Likely Touched

- `src/app/types/index.ts` — extend `sessionHistory` item type
- `src/app/components/partners/live-content-cards.tsx` — `SessionHistoryItem` interface, `SessionHistoryList` component (add `onItemClick`, row button affordance)
- `src/app/pages/clarity-live-page.tsx` — `handleCelebrationComplete` (capture journey fields), `handleSkip` (capture skipped flag), state wiring for selected history index
- `src/app/components/partners/live-mode-view.tsx` — export `JourneyToUnderstanding` if co-locating the summary component elsewhere; OR add `RoundSummaryScreen` here
- New component file (if not co-located): `src/app/components/partners/round-summary-screen.tsx`
