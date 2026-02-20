---
status: all-done
type: story
rank: 1
workstream: C1
tags:
  - live
  - history
  - ux
  - calibration
created_date: 2026-02-19T00:00:00.000Z
reviews:
  ux: review
  architect: approved
uat_file: features/uat/p398.md
test_files:
  - src/tests/live-mode-view.test.tsx
  - e2e/p398-session-history-summary.spec.ts
  - e2e/p398-smoke.spec.ts
  - e2e/a11y/p398-accessibility.spec.ts
delivery_stage: tests-generated
locked_at: '2026-02-20T12:09:34.247Z'
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

---

## Technical

### Technical Analysis

#### Current Code State

**`SessionHistoryItem` — dual definition problem**

The type currently exists in two places with conflicting ownership:

1. `src/app/types/index.ts` line 656 — inline anonymous type inside `LiveSessionState.sessionHistory`:
   ```ts
   sessionHistory?: Array<{ title: string; type: 'story' | 'point' | 'free' }>;
   ```
2. `src/app/components/partners/live-content-cards.tsx` — local named interface `SessionHistoryItem` with identical shape, used only by `SessionHistoryList`.

These are structurally identical today but are not linked by TypeScript. The promotion to a shared named type in `src/app/types/index.ts` resolves this.

**`SessionHistoryList` component — `live-content-cards.tsx`**

- Props: `history: SessionHistoryItem[]`, `className?: string`
- Renders a `<div>` with a "THIS SESSION" label and a list of plain `<div>` rows (not buttons)
- Each row: `CheckCircle2` icon + content-type icon + title span
- No click handler, no chevron, no interactive affordance
- Imported in `live-mode-view.tsx` and used in `IdleScreen`

**`IdleScreen` component — `live-mode-view.tsx`**

- Receives `liveState: LiveSessionState`
- Renders `SessionHistoryList` when `sessionHistory.length > 0`
- Has no `selectedHistoryIndex` state or summary-view rendering
- `LiveHeader` sits *outside* the scrollable body `<div className={layoutClass} overflow-y-auto>` — confirms the inline swap pattern keeps the header visible unchanged

**`JourneyToUnderstanding` component — `live-mode-view.tsx`**

- Currently a **non-exported** function: `function JourneyToUnderstanding(`
- Props include: `checkerRating?`, `responderRating?`, `explainBackRatings: number[]`, `isChecker: boolean`, `displayPartnerName: string`, `checkerName: string` (required, not optional), `hideUntilBothSubmitted?`, `variant?`
- Used 10+ times within `live-mode-view.tsx` but never imported elsewhere
- The celebration phase is a conditional branch inside `UnderstandingScreen`, not a separate component — the summary screen will replicate that branch's JSX pattern, not reuse `UnderstandingScreen`

**History capture in `clarity-live-page.tsx`**

Two callbacks build `historyEntry` objects:
- `handleCelebrationComplete` — natural completion path; has full access to `currentState.checkerRating`, `responderRating`, `explainBackRatings`, `checkerName`, and `partnerName` from closure scope
- `handleSkip` — skip path; currently sets only `{ title, type }` without `skipped: true`

**`live_state` DB persistence note**

`sessionHistory` is written into the `live_state` JSONB column on `clarity_sessions` on every `updateLiveState` call. The spec describes history as "in-memory", but the enriched fields (including ratings and names) will be persisted to the DB for the session's lifetime. This is not a new vulnerability but is a documentation inaccuracy — see Security Review.

**Existing tests**

`src/tests/live-mode-view.test.tsx` tests `SessionHistoryList` with the current `{ title, type }` shape — these will need updating when the type is enriched.

#### Dependencies

- `live-mode-view.tsx` imports `SessionHistoryList` from `live-content-cards.tsx`
- `JourneyToUnderstanding` is used only within `live-mode-view.tsx` (not yet exported)
- `clarity-live-page.tsx` delegates all idle-screen rendering to `LiveModeView`
- `CONTENT_LAYOUT` constant in `live-mode-view.tsx` is not currently exported

---

### Architecture Decisions

**Decision 1: Where to define `SessionHistoryItem`**

Chosen: Promote to `src/app/types/index.ts` as a named exported interface; replace the inline anonymous type in `LiveSessionState.sessionHistory`; delete the local duplicate in `live-content-cards.tsx`.

Rationale: Both `clarity-live-page.tsx` (which writes entries) and `live-content-cards.tsx` (which reads entries) need the type. `src/app/types/index.ts` is the canonical shared types file — it already houses `LiveSessionState`. Co-locating the type with the state that owns it prevents drift.

Trade-off: One additional export from `types/index.ts`. The local `SessionHistoryItem` in `live-content-cards.tsx` must be deleted to avoid shadowing — a two-file change for a type promotion, but straightforward.

Alternative rejected: Keep type in `live-content-cards.tsx` and import from there into `clarity-live-page.tsx`. Violates the dependency direction — pages should not import types from component files; both should import from `types/index.ts`.

---

**Decision 2: Where to place `RoundSummaryScreen`**

Chosen: New file `src/app/components/partners/round-summary-screen.tsx`. Export `JourneyToUnderstanding` and `JourneyToUnderstandingProps` from `live-mode-view.tsx` (add `export` keyword to the function and interface declarations).

Rationale: `RoundSummaryScreen` is a distinct rendering concern — it consumes a `SessionHistoryItem` and renders a static (non-live) journey view. Co-locating it in `live-mode-view.tsx` (already 2800+ lines) makes that file harder to navigate. Exporting `JourneyToUnderstanding` is a one-word change and enables clean cross-file reuse.

Trade-off: Exporting `JourneyToUnderstanding` makes it part of the public API of `live-mode-view.tsx`. It is a display-only component with no side effects, so this is safe.

Alternative rejected: Co-locating `RoundSummaryScreen` inside `live-mode-view.tsx`. The file is too long already; the spec itself calls out a separate file as the preferred location.

---

**Decision 3: Where to manage `selectedHistoryIndex` state**

Chosen: Local `useState` in `IdleScreen` (inside `live-mode-view.tsx`), not in `clarity-live-page.tsx`.

Rationale: `selectedHistoryIndex` is purely a display concern — it controls which view the idle screen shows. It does not need to be part of `LiveSessionState` (not synced to partner, not persisted). Keeping state in the component that uses it avoids prop-drilling through `clarity-live-page.tsx` → `LiveModeView` → `IdleScreen`. The auto-reset when `ratingPhase` leaves `'idle'` is handled via a `useEffect` inside `IdleScreen` watching `liveState.ratingPhase`.

Trade-off: `clarity-live-page.tsx` cannot observe the selected history index. This is acceptable — the page has no reason to know which summary is open.

Alternative rejected: State in `clarity-live-page.tsx` with prop-drilling through `LiveModeView` → `IdleScreen`. Creates unnecessary prop surface for a concern the page does not need to own. The spec's Implementation Guide Step 5 suggests this location but the codebase pattern argues against it.

---

**Decision 4: `RoundSummaryScreen` rendering — inline swap vs overlay**

Chosen: Inline content swap within `IdleScreen`'s scrollable body. When `selectedHistoryIndex !== null`, the scrollable `<div>` renders `<RoundSummaryScreen>` instead of the normal idle content.

Rationale: The spec explicitly says "The inline view replacement is simpler — no sheet infrastructure needed. Prefer it." `LiveHeader` sits outside the scrollable content div; the swap is a conditional render inside that div. No new layout primitives needed.

Trade-off: No browser back gesture support (intentional per spec — this is an in-page content swap, not a route change).

Alternative rejected: Bottom sheet using the existing `Drawer` component (already imported in `live-mode-view.tsx`). Adds modal overlay complexity for what is essentially a content view, not a confirmation dialog.

---

**Decision 5: Store `isChecker` in `SessionHistoryItem`**

Chosen: Add `isChecker?: boolean` to `SessionHistoryItem`, derived at capture time as `currentState.checkerName === name`.

Rationale: `JourneyToUnderstanding` requires `isChecker` to render the correct perspective labels. By the time the user opens the summary, `checkerName` in `liveState` has been cleared (reset to `undefined` when the round completes). The user's role at round completion time is a property of that history entry, not of the current session state.

Trade-off: One additional field in `SessionHistoryItem`. Small cost for correct summary rendering.

Alternative rejected: Derive `isChecker` at summary-view time from `liveState.checkerName === name`. Wrong — `checkerName` is cleared after round completion.

---

### Security Review

**RLS Policies:**
- ✅ No new database tables introduced by P398. Session history lives in `live_state` (JSONB) on `clarity_sessions`, already governed by existing RLS policies.
- ⚠️ **Documentation inaccuracy:** The spec describes history as "in-memory only (no DB writes)" — this is incorrect. `sessionHistory` is serialised into `live_state` on every `updateLiveState` call. After P398, enriched fields (`checkerRating`, `responderRating`, `explainBackRatings`, `checkerName`, `partnerName`) will persist to the DB for the session's lifetime. Not a new vulnerability, but teams relying on the "in-memory" assumption for data-minimisation decisions should be aware.
- ⚠️ **Pre-existing (not new in P398):** The existing UPDATE policy only checks `creator_profile_id IS NOT NULL`, meaning both host and anonymous guest can overwrite the entire `live_state` blob including `sessionHistory`. P398 does not change this exposure.

**Authentication:**
- ✅ No new API calls, routes, or authentication flows.
- ✅ The round summary screen is gated behind local React state (`selectedHistoryIndex !== null`) — not accessible via URL or API. No auth bypass risk.
- ✅ Exporting `JourneyToUnderstanding` as a rendering component introduces no auth concerns.

**Input Validation:**
- ✅ All enriched fields sourced from `confirmedLiveStateRef.current` (server-confirmed state): numeric ratings are integers; `checkerName`/`partnerName` are display names already stored in DB with length constraints; `completedAt` is `new Date().toISOString()` used for display only.
- ✅ All values rendered in React JSX as text content with automatic HTML escaping. No XSS risk in the rendering path.
- ✅ Names rendered as JSX children in template literals (React children, not raw HTML injection).

**Data Protection:**
- ✅ Both participants already see each other's ratings on the celebration screen — the summary screen re-displays data both users have already seen. No new information asymmetry.
- ✅ `selectedHistoryIndex` is per-session component instance local state. No cross-session leakage path.
- ✅ `partnerName` and `checkerName` are already visible to both parties throughout the session; storing them in history does not expose them to new audiences.
- ✅ No raw HTML rendering (unsafe HTML injection) found anywhere in the rendering path for history items or `JourneyToUnderstanding`.

**Action item:** Update the spec's "Data Model Change" section to remove the claim that history is in-memory only — or add a clarifying note that "in-memory" refers to cross-session non-persistence, not absence of DB writes within a session.

---

### Implementation Approach

#### Files to Create

**`src/app/components/partners/round-summary-screen.tsx`**

New component. Responsibilities:
- Receives a `SessionHistoryItem` (enriched) and an `onBack: () => void` callback
- Renders journey header + exported `JourneyToUnderstanding` + full-width `variant="outline"` Back button
- Handles Escape key via `useEffect` → `document.addEventListener('keydown', ...)`
- Focus management: `useRef` on the title heading, `focus()` on mount; restore focus to the triggering button on unmount

Interface:
```ts
interface RoundSummaryScreenProps {
  item: SessionHistoryItem;
  onBack: () => void;
}
```

#### Files to Modify

**`src/app/types/index.ts`**
1. Add exported `SessionHistoryItem` interface (before `LiveSessionState`):
   ```ts
   export interface SessionHistoryItem {
     title: string;
     type: 'story' | 'point' | 'free';
     checkerRating?: number;
     responderRating?: number;
     explainBackRatings?: number[];
     checkerName?: string;
     partnerName?: string;
     completedAt?: string;
     skipped?: boolean;
     isChecker?: boolean;
   }
   ```
2. Update `LiveSessionState.sessionHistory` from inline anonymous type to `SessionHistoryItem[]`

**`src/app/components/partners/live-content-cards.tsx`**
1. Delete local `SessionHistoryItem` interface
2. Add import: `import type { SessionHistoryItem } from '@/app/types'`
3. Add `onItemClick?: (index: number) => void` to `SessionHistoryListProps`
4. Add `ChevronRight` to lucide imports
5. Convert rows: clickable rows (`!item.skipped && item.checkerRating !== undefined && !!onItemClick`) → `<button>` with `aria-label="View round summary: {title}"`, `min-h-[44px]`, hover/focus states, chevron with `group-hover:translate-x-0.5`; skipped/no-data rows → `<div>` with `opacity-60`, "Skipped" label

**`src/app/pages/clarity-live-page.tsx`**
1. `handleCelebrationComplete` — enrich `historyEntry` with: `checkerRating`, `responderRating`, `explainBackRatings: [...(currentState.explainBackRatings ?? [])]`, `checkerName`, `partnerName`, `completedAt: new Date().toISOString()`, `isChecker: currentState.checkerName === name`
2. `handleSkip` — add `skipped: true` to the history entry

**`src/app/components/partners/live-mode-view.tsx`**
1. Add `export` to `function JourneyToUnderstanding(` and `interface JourneyToUnderstandingProps`
2. Export `CONTENT_LAYOUT` constant (and `ActionArea` if used by `RoundSummaryScreen`)
3. In `IdleScreen`: add `const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number | null>(null)`, `useEffect` auto-reset on `liveState.ratingPhase !== 'idle'`, import `RoundSummaryScreen`, conditional early return when `selectedHistoryIndex !== null`, pass `onItemClick` to `SessionHistoryList`

**`src/tests/live-mode-view.test.tsx`**
- Update history fixtures to enriched `SessionHistoryItem` shape
- Add tests: clickable entry opens summary, Back button restores idle, `ratingPhase !== 'idle'` auto-closes, skipped entry has no chevron, entry without `checkerRating` has no chevron

#### Build Sequence

1. **Phase 1 — Type promotion** (no behavior change): promote `SessionHistoryItem` to `types/index.ts`, update `LiveSessionState.sessionHistory`, delete local duplicate. Run `npm run build`.
2. **Phase 2 — Capture enriched data** (no UI change): enrich `historyEntry` in `handleCelebrationComplete`; add `skipped: true` in `handleSkip`. Run `npm test`.
3. **Phase 3 — Export `JourneyToUnderstanding`**: add `export` keyword, export `CONTENT_LAYOUT`/`ActionArea` as needed. Run `npm run build`.
4. **Phase 4 — Create `RoundSummaryScreen`**: implement rendering, Escape handler, focus management. Run `npm run build`.
5. **Phase 5 — Make history rows clickable**: add `onItemClick` prop, button/div conditional rendering, chevron. Run `npm run build` + `npm test`.
6. **Phase 6 — Wire state in `IdleScreen`**: `selectedHistoryIndex` state, auto-reset effect, conditional render, pass `onItemClick`. Run `npm test` + `npm run build`.
7. **Phase 7 — Update and add tests**: update fixtures, add 5 new tests. Run full test suite.
8. **Phase 8 — E2E verification**: run `/verify` — complete a round, tap history entry, verify summary shows correct ratings, Back restores idle, Escape closes, skipped rows have no affordance, keyboard flow works.

---

## Test Coverage Strategy

**What's Tested:**

- ✅ `SessionHistoryList` — completed entry renders as `<button>` with correct `aria-label` (unit)
- ✅ `SessionHistoryList` — skipped entry renders as non-interactive div with "Skipped" label (unit)
- ✅ `SessionHistoryList` — legacy entry (no `checkerRating`) renders non-interactive / graceful fallback (unit)
- ✅ `IdleScreen` — clicking a history entry opens the summary screen / Back button appears (unit)
- ✅ `IdleScreen` — Back button restores idle content (unit)
- ✅ `IdleScreen` — summary auto-closes when `ratingPhase` leaves `'idle'` (unit via `rerender`)
- ✅ Happy path — complete round → history button appears → click → summary shows title + Back → Back restores idle (E2E)
- ✅ Auto-close — partner starts new round while summary is open → summary closes (E2E)
- ✅ Skip flow — skipped round has no button/chevron (E2E)
- ✅ Semantic HTML — history row is `<button>` with `aria-label="View round summary: [title]"` (a11y)
- ✅ Skipped row — NOT a button (a11y)
- ✅ Escape key — closes summary screen (a11y)
- ✅ Keyboard activation — Tab + Enter opens summary (a11y)
- ✅ No console errors on /live page load (smoke)

**What's NOT Tested (rationale):**

- ❌ Focus restoration to originating row after Back (complex to verify in Playwright; covered by UAT-4.2 manual check)
- ❌ Cross-session history persistence — explicitly out of scope per spec; behavior is "page reload clears history"
- ❌ JourneyToUnderstanding internals in summary — component is tested independently; P398 tests only verify it is rendered and Back works
- ❌ No integration test — P398 adds no DB migration; data flows through existing `live_state` JSONB column

**Test Pyramid:**

```
       /\
      /  \   3 E2E (two-party round completion)
     /    \
    /------\
   /  4 A11y \  (accessibility in real browser)
  /____________\
 /   6 Unit     \  (component behavior via @testing-library)
/________________\
```

**Files generated:**

| File | Type | Tests |
|------|------|-------|
| `src/tests/live-mode-view.test.tsx` | Unit (updated) | +6 tests in P398 block |
| `e2e/p398-session-history-summary.spec.ts` | E2E | 3 tests |
| `e2e/p398-smoke.spec.ts` | Smoke | 2 tests |
| `e2e/a11y/p398-accessibility.spec.ts` | Accessibility | 4 tests |
| `features/uat/p398.md` | UAT | 14 scenarios |

**Total automated tests:** 15
**UAT scenarios:** 14
**Estimated run time:** Unit ~2s · Smoke ~10s · E2E ~90s · A11y ~90s
