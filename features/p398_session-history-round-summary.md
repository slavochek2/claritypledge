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
  ux: review
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
- Summary screens for skipped rounds — skipped entries are non-clickable (no chevron, muted appearance).
- Continuing a round from history (re-entering a completed round to resume explain-back from where it left off) — would require restoring shared live state and partner coordination; start a fresh round instead.


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

---

## UX Requirements

### User Flows

#### Happy Path — View a Completed Round

1. Both participants click "Continue" on the celebration screen. The round is added to the "THIS SESSION" list on the idle screen.
2. The new history entry shows a right-chevron icon, signalling it is tappable.
3. The user taps the history entry.
4. The idle screen content is replaced inline by the Round Summary Screen — the header and overall session frame remain unchanged; only the scrollable body content swaps.
5. The user sees the same celebration screen that appeared when the round completed — the existing component reused as-is.
6. The user taps "Back". The idle screen content is restored exactly as it was before the tap. Session state is unchanged.

#### Skipped Round

1. A round is skipped. The history entry appears in "THIS SESSION" with no chevron icon and a visual treatment indicating it is not interactive (muted text, no hover affordance).
2. The skipped entry is not tappable. No summary opens. No error occurs.

Decision rationale: showing a "Skipped" stub summary adds complexity for minimal coaching value. Skipped rounds are visually identified by the absence of a chevron; facilitators already understand what a skip means.

#### Active Round Starts While Summary Is Open

1. The user is viewing a round summary.
2. Their partner triggers a new round (rating phase moves away from idle).
3. The summary closes automatically. The user is returned to the active-round UI immediately, as if they had pressed Back first. No data is lost; session state is unaffected.

#### Back Navigation — Keyboard and Touch

- Tapping "Back" button returns to idle content.
- Pressing the Escape key also returns to idle content (desktop).
- No browser back/forward navigation is involved; this is an in-page content swap, not a route change.

---

### Screen Designs

#### A. Enhanced History List Item (idle screen)

**Current layout:** `[checkmark icon] [content-type icon] [title text]`

**Enhanced layout — completed round (clickable):**

```
[checkmark icon] [content-type icon] [title text ............] [chevron-right icon]
```

- The entire row is a tappable button with a clear affordance (cursor pointer, hover state).
- The chevron is a right-pointing icon (16×16), color `text-muted-foreground`, right-aligned with `ml-auto` or `flex justify-between`.
- Title text truncates with `line-clamp-1` as today, so it never wraps and the chevron always stays on the same line.
- Minimum tap target: 44px height.

**Enhanced layout — skipped round (non-clickable):**

```
[checkmark icon] [content-type icon] [title text] [Skipped label]
```

- No chevron. No button wrapper.
- Title text and icons use reduced opacity (e.g. `opacity-60`) or a muted color to communicate the entry is inert.
- A small "Skipped" label in `text-xs text-muted-foreground` appears at the right end of the row as a passive indicator.

**Visual states for clickable rows:**

| State | Treatment |
|-------|-----------|
| Default | Background transparent; icons and text in their standard muted colors |
| Hover (desktop) | Subtle background highlight: `hover:bg-muted/50`; chevron shifts slightly right via `group-hover:translate-x-0.5` |
| Pressed / active | `active:bg-muted`; slight opacity reduction |
| Focus (keyboard) | Standard focus ring (`focus-visible:ring-2 focus-visible:ring-ring`) |

---

#### B. Round Summary Screen

The idle screen body content is replaced with the existing celebration screen — the same component already shown when a round completes. No new design. The `LiveHeader` (partner name + exit button) remains visible above unchanged.

**No new header, no timestamp, no extra metadata.** The partner name is already visible in `LiveHeader`. The time is irrelevant. Just show the story/journey exactly as the celebration screen shows it.

- Reuse the existing celebration screen component with the stored journey data from `SessionHistoryItem`.
- `isChecker`, `displayPartnerName`, `checkerName` come from the history item.
- `hideUntilBothSubmitted` = `false` — all ratings are final.
- A "Back" button (`variant="outline"`, full width) below the celebration content returns to idle.

**Idle screen layouts (for reference — nothing changes here):**

No story selected, user has stories:
```
┌─────────────────────────────────┐
│  👤 Alex              [Leave]  │  ← LiveHeader
├─────────────────────────────────┤
│  [Does Alex understand you?  ] │
│  [Do you understand Alex?    ] │
│                                 │
│  🔍 Search stories...          │  ← StorySearchPicker
│                                 │
│  THIS SESSION                   │
│  ✓ 📖  "The bridge story"   ›  │  ← clickable (chevron added)
│  ✓ 📌  "Trust in teams"     ›  │
│  ✓ 📖  "Weekend hike"  Skipped │  ← no chevron, muted
└─────────────────────────────────┘
```

Story selected:
```
┌─────────────────────────────────┐
│  👤 Alex              [Leave]  │
├─────────────────────────────────┤
│  ┌──────────────────────────┐  │
│  │ 📖 The bridge story      │  │  ← LiveStoryCardExpanded
│  │ "Once upon a time in..." │  │
│  └──────────────────────────┘  │
│  [Does Alex understand you?  ] │
│  [Do you understand Alex?    ] │
│         Speak freely            │  ← clears story
│                                 │
│  THIS SESSION                   │
│  ✓ 📖  "The bridge story"   ›  │
└─────────────────────────────────┘
```

After tapping a history entry (body swaps, header stays):
```
┌─────────────────────────────────┐
│  👤 Alex              [Leave]  │  ← unchanged
├─────────────────────────────────┤
│                                 │
│  ← existing celebration screen  │
│     with stored journey data    │
│                                 │
│  [        ← Back        ]      │
└─────────────────────────────────┘
```

---

### Edge Cases

#### No Journey Data on a Completed Round

Should not occur in normal operation (journey data is captured at round completion). If it does occur (e.g., data corruption or a very old in-memory entry from before this feature shipped), the history row renders without a chevron (treated as non-clickable). This is the safest fallback — the entry remains visible and informational, but no broken summary screen is shown.

#### Skipped Round Tap Attempt

Skipped rows have no button wrapper and no keyboard role. They cannot receive click or keyboard activation. No action fires if somehow reached.

#### Summary Open During Active Round Start

When `ratingPhase` transitions away from `'idle'`, the selected history index is reset to `null`. This closes the summary and restores the idle content, which is then immediately replaced by the active-round UI. The transition is seamless from the user's perspective.

#### Single Explain-Back Round vs. Multiple Rounds

`JourneyToUnderstanding` already handles both cases. When there are no explain-back rounds, the component shows only the initial ratings (round 0) without round-number labels. When there are one or more explain-back rounds, round numbers appear. The summary screen inherits this behaviour without any special casing.

#### Very Long Title

The celebration screen already handles long titles. No special casing needed in the summary.

#### History List with Many Entries

The history list is inside a scrollable container (`overflow-y-auto`). As entries accumulate, the user scrolls to reach older ones. The summary screen is accessed from any entry regardless of scroll position; returning via Back restores the previous scroll position.

---

### Accessibility

**Tappable history rows:**

- Each clickable row is a `<button>` element (not a `div` with `role="button"`), ensuring native keyboard accessibility (Enter and Space activate it).
- Accessible name: `"View round summary: [title]"` — set via `aria-label` so screen readers announce the full action, not just the visible truncated text.
- Skipped rows are plain non-interactive elements with no button role; screen readers read them as static text.

**Summary screen — focus management:**

- When the summary screen opens, focus moves programmatically to the summary heading (the story/point title). This signals the context change to keyboard and screen reader users without requiring a new page load.
- When the summary screen closes (Back button or Escape), focus returns to the history row that was tapped.

**Back button and Escape:**

- The Back button has a visible label ("Back") and is focusable in the natural tab order.
- Pressing Escape anywhere within the summary content also triggers the back action. This is a standard pattern for inline overlay-like views.

**JourneyToUnderstanding ratings in the summary:**

- The component already renders rating values as visible numbers. In the summary context, where `hideUntilBothSubmitted` is `false` and all ratings are final, there are no "Pending…" states to announce.
- Rating rows use `<p>` elements with label text. Screen readers will read them as "[label]: [number]" which is meaningful without additional ARIA.

**Color and contrast:**

- Muted/skipped entry treatment uses reduced opacity. Ensure the resulting contrast ratio for skipped title text meets WCAG AA (4.5:1) against the card background.

---

### Responsive Design

**Mobile (320px – 767px):**

- The summary screen replaces the idle body content at full width within the existing `max-w-sm` container (320px effective width).
- The `JourneyToUnderstanding` card is already sized to `w-full` within that container and scrolls normally.
- All tap targets (history rows, Back button) are at least 44px tall to meet mobile touch guidelines.
- The bottom padding of the scroll area (already `pb-6` in `CONTENT_LAYOUT`) ensures the Back button is not obscured by system UI on mobile browsers.

**Tablet / Desktop (768px and above):**

- The session UI renders within a centered `max-w-lg` column. The summary content inherits this constraint naturally.
- The `max-w-sm` inner width on the `JourneyToUnderstanding` card and Back button prevents the layout from stretching too wide on large viewports — consistent with all other idle-screen cards.
- No separate sheet or side-panel treatment is needed. The inline swap pattern works identically at all breakpoints.

**Hover state (pointer devices):**

- Chevron icons and row hover backgrounds are visible only on devices with a hover capability (`@media (hover: hover)`), preventing the "sticky hover" issue on touch devices.
- The Back button shows a standard outline button hover style consistent with the existing `variant="outline"` usage across the session UI.
