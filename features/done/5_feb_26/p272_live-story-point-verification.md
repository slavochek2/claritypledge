---
status: all-done
type: story
rank: 1
workstream: C1
tags:
  - live
  - stories
  - points
  - verification
  - calibration
prepped_date: '2026-02-18'
delivery_stage: implementation
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-02-18T00:00:00.000Z
uat_file: features/uat/p272.md
test_files:
  - e2e/integration/p272-accuracy-achieved-migration.spec.ts
  - e2e/p272-live-verification.spec.ts
  - e2e/p272-smoke.spec.ts
  - e2e/a11y/p272-accessibility.spec.ts
---

# P272: Verification of Stories and Points in /live

## Problem Statement

### Current State

The /live session today is a two-person real-time room where a speaker and listener enter via a 6-character code. The beginning screen (P128) already lets the speaker select a story or point from their library. Once selected, nothing happens — the session ends there. There is no flow for what comes next.

The database schema exists: story_verifications table, ears_count, understood_count, and the triggers that would update them are all in place (P117). Story and point detail pages have a "Clarity Sessions" section in the UI (P116). But there is no data in any of these tables — because the interaction that would write it has never been built. The triggers are live, the display components exist, and the counters sit at zero.

Separately, P269 (in progress) is fixing the profile page display — understood_count is currently hardcoded to 0 in the story adapter, ear count badge doesn't render, calibration bar doesn't show. P269 is wiring up the display; P272 is building the interaction that produces the data P269 will display.

### Pain Points

- **Speakers** have no structured way to test whether their story is understood. They pick a story in /live and then improvise the rest of the session on their own.
- **Listeners** have no prompt or structure to engage. There is nothing guiding them through the interaction after a story appears.
- **Workshop facilitators** cannot run a consistent verification exercise because the product has no defined loop. Every session is ad hoc.
- **The data** (understood_count, ears_count, story_verifications) is never written because the interaction that would write it does not exist — even when P269 fixes the display, there will be nothing to display.

### Who Is Affected

- Speakers (coaches, communicators) who want calibrated feedback on whether their stories land
- Listeners (workshop participants, peers) who need prompts to know their role in the session
- Workshop facilitators running the Feb/Mar pilot who need a repeatable exercise format
- The product itself — without verification data, the core value proposition (calibrated communication practice) cannot be demonstrated


## Intention (Why This Matters)

### Strategic Importance

The product's core claim is that speakers can improve communication by measuring how well they are understood. That claim requires a closed loop: story shared → listener understanding measured → gap surfaced → speaker improves. Right now the loop is open. /live can start but cannot finish.

The C1 milestone target is that 30% of stories get verified in at least one session during the Feb/Mar pilot. That metric is structurally impossible to hit without this feature. There is no mechanism to produce a verification record.

### Why Now

The Feb/Mar pilot is imminent. The beginning screen (P128) is done. The backend is done. The gap between "beginning screen exists" and "verification data gets written" is exactly this feature. Building it now completes the loop the pilot needs to validate.

### Cost of Inaction

Without this feature, /live sessions produce no data. Participants experience an incomplete interaction. Facilitators cannot run a structured exercise. The pilot runs on social goodwill, not product evidence. The primary success metric (≥30% story verification rate) cannot be measured, let alone met.


## Business Requirements

1. Story is the primary and only content unit in /live. When a speaker selects a story, it appears as a card above the existing "Did you get it?" / "Did I get it?" buttons — on both screens simultaneously.

2. The story card is expandable, using the same component as on profile pages. When expanded, it shows linked points with the 7-point position scale, rendered identically to how points appear on profiles.

3. Either participant can expand the story card at any time — before a round begins, during a round, or after a round completes — and update their position on any linked point. No special prompt or CTA is needed; the story card is always accessible.

4. The speaker can remove or replace the selected story at any time before a round begins. Once a round starts, the story is locked for that round.

5. The story picker is search-focused. Stories are not all shown at once — the speaker finds and selects the specific story they want to share. A session with no story selected behaves as the current speak-freely flow.

6. The selected story remains visible to both participants throughout the entire round — during rating, during gap reveal, and during explain-back. It does not disappear between steps.

7. Round mechanics are unchanged from the current /live model: sealed-bid 0–10 ratings from both participants, gap revealed as raw numbers, in-app guided explain-back option, speak freely exit. The only addition is that the round is now anchored to a specific story.

8. A round begins when either participant clicks "Did you get it?" or "Did I get it?". A round can be with a story (story card present) or without (no story selected — speak freely).

9. A session may include multiple rounds. A new round can only begin after the current round is either completed (both ratings submitted, gap shown) or explicitly exited via speak freely. Partial abandonment mid-round is not permitted.

10. A story_verifications record is written and the congratulations screen shown when the speaker's rating is 10 (perfect understanding). This increments the story's understood_count and the listener's ears_count. Ratings of 8–9 complete the round and show the gap, but do not trigger verification or count increments.

    **Backend change required:** The current DB schema has `accuracy_achieved BOOLEAN GENERATED AS (speaker_rating >= 8)` and triggers wired to that threshold. These must be updated to `speaker_rating = 10` before this feature ships. No data migration needed — no story_verifications records currently exist.

11. All state transitions — story selection, story removal, round start, rating submissions, gap reveal — are reflected on both screens in real time.


## User Stories

**As a speaker preparing a round:**
- I want to search for and select a specific story from my library, so that I can bring one story into focus without seeing all my content at once.
- I want the story to appear on my listener's screen the moment I select it, so that we are both looking at the same content.
- I want to be able to remove or replace the selected story before the round starts, so that I can change my mind without disrupting the session.

**As a listener before the round:**
- I want to see the story card as soon as the speaker selects it, so that I can read it and prepare before any rating happens.
- I want to expand the story card to see linked points and set my position on them, so that I can engage with the point of view behind the story before we verify understanding.

**As a speaker starting a round:**
- I want to click "did [partner] understand you?" to begin the rating phase, so that the round is explicitly anchored to the story we just shared.

**As both participants during and after a round:**
- I want to submit a sealed rating before seeing my partner's, so that neither of us anchors to the other's answer.
- I want to see both ratings and the gap immediately after both are submitted, so that we can decide together what to do next — explain-back, speak freely, or move on.
- I want to expand the story card after the round completes, so that I can review linked points and update my position if the verification changed my understanding.

**As a speaker across multiple rounds:**
- I want to start a new round on the same or a different story after the previous round is complete or exited, so that one session can cover multiple stories or multiple attempts at the same story.
- I want a speak freely exit during any round, so that I am never stuck in an incomplete structured flow.

**As a workshop facilitator:**
- I want both 1-on-1 sessions and workshop sessions (entered via event rooms) to follow the same verification flow, so that I can teach one interaction pattern that works in all contexts.


## Jobs to Be Done

- When I want to verify whether my story landed, I want to select it in /live and have it appear on my listener's screen, so that we share the same reference point before I ask them to rate their understanding.

- When I am a listener and a story appears, I want to read it and explore its linked points at my own pace, so that I engage with the full context — not just the headline — before rating.

- When both of us have submitted ratings, I want to see both numbers and the gap immediately, so that I can decide with my partner what to do next without the app prescribing a response.

- When a round completes and the story is still on screen, I want to expand it and update my position on its linked points, so that my positions reflect what I actually understood — not what I assumed before the conversation.

- When I want to verify a different story in the same session, I want to start a new round after completing or exiting the current one, so that one /live session can produce multiple verification records.


## Outcomes (What This Feature Enables)

Before this spec: no story_verifications record can ever be written. understood_count, ears_count, and calibration data are permanently zero regardless of how many /live sessions run.

After this spec:
- A /live session can produce a story_verifications record for the first time
- understood_count and ears_count can increment from real session data
- Calibration scores (built on top of verification records) have data to compute against
- P269's profile display of these metrics has something to show

Pilot adoption targets (≥30% story verification rate, etc.) are tracked in the C1 milestone doc, not here.


## Acceptance Criteria

### New behavior (what this spec builds)

- [ ] Speaker can search for and select a specific story from their library; stories are not all shown at once.
- [ ] Selected story appears on both screens immediately after selection, as a card above the "Did you get it?" / "Did I get it?" buttons.
- [ ] Speaker can remove or replace the selected story before a round begins.
- [ ] When a story is selected but no button has been clicked, "Speak freely" appears below the two buttons for both participants — either can tap it to clear the story from both screens and proceed without it.
- [ ] Story card is expandable on both screens; when expanded, linked points appear with 7-point position scale rendered identically to profile pages.
- [ ] Point positions in the expanded story card show the other person's existing position (as on profile) — not hidden.
- [ ] Either participant can expand the story card and update a point position at any time — before, during, or after a round.
- [ ] Story card remains visible throughout the entire round — including the rating phase, gap reveal, explain-back, and success screen.
- [ ] Share and open/external-link icons are hidden on the story card when rendered inside /live.
- [ ] When a round completes with speaker rating = 10, a story_verifications record is created, understood_count increments, and listener's ears_count increments.

### Preserved behavior (existing — must not regress)

- [ ] Sessions with no story selected behave as the current speak freely flow.
- [ ] A round begins when either participant clicks "Did you get it?" or "Did I get it?".
- [ ] In the rating drawer, neither participant can see the other's understanding rating for the current round until both have submitted — the speaker's assessment of the listener's understanding and the listener's self-assessment are revealed together. Past rounds remain visible in the journey to understanding history above.
- [ ] After both ratings are submitted, both values and the gap are shown to both participants.
- [ ] After gap reveal, participants can choose: in-app explain-back round, speak freely exit, or end the round.
- [ ] Congratulations screen shown at 10 (unchanged).
- [ ] A new round can only begin after the current round is completed or exited via speak freely.
- [ ] All state transitions are reflected on both screens in real time.


## UX Guidance (Decisions for the UX Agent)

The following decisions were made during PRD definition and should not be re-opened in the UX layer. The UX agent should design within these constraints.

**Locked decisions:**

- **Story is the only picker element.** Points are not selectable from the picker. They are accessible exclusively by expanding a story card. Do not add a point picker.

- **Reuse the expandable story card component from profile pages.** No new patterns for displaying a story with linked points. The same component that works on profiles should work in /live, with the story visible above the "Did you get it?" / "Did I get it?" buttons.

- **Hide share and open icons on the story card in /live.** The story card component shows share and open/external-link icons on profile pages — these must be hidden when the card is rendered inside a /live session. Tapping them would navigate the user away from the session, which must not happen.

- **This is additive, not a redesign.** The story-anchored flow is the existing /live flow with a story card placed above it. Reuse existing components throughout — rating screen, gap reveal, explain-back, speak freely exit. Do not redesign any part of the existing flow because a story is now present. The story card being visible provides context; the surrounding components do not need to change to reference it. The only new element is the story card itself (reused from profile pages). Both flows — with and without a story — must feel like the same product.

- **"Did you get it?" / "Did I get it?" buttons are unchanged.** They remain below the story card. The story card is context; the buttons are the action. Do not replace or move the buttons.

- **"Speak freely" is the exit for both participants before a round begins — this is new.** Currently "Speak freely" only appears mid-round as an exit. When a story is selected but no button has been clicked, "Speak freely" must also appear below the two buttons for both participants. Either can tap it to clear the story from both screens and proceed without it. The listener does not get an X to remove the story (they didn't select it); speak freely is their equivalent. The speaker gets speak freely too, alongside the ability to remove/replace the story card directly.

- **Story stays visible throughout the round — including the success screen.** Do not hide or collapse the story card during the rating phase, gap reveal, explain-back, or success screen (where both partners click continue). Participants should be able to refer to it and expand it at any point.

- **Point positions are not sealed — render as on profile.** When a participant expands the story card and sees linked points, they see the other person's existing position exactly as they would on a profile page (position visible before they stake their own). Sealed-bid applies to the 0–10 verification ratings only. Point positions are already public; hiding them in /live would be inconsistent with profiles and add complexity without proportionate benefit.

- **Position update is organic, not prompted.** After a round completes, do not show a special CTA like "update your position on linked points". The story card is already expandable — the listener expands it if they want to update. No modal, no push.

- **Round mechanics are locked.** Sealed-bid ratings (0–10), gap as raw numbers, in-app guided explain-back, speak freely exit. Do not redesign the rating flow itself.

- **Workshop and 1-on-1 are the same UX.** Workshop sessions enter via event rooms (P124). Once inside /live, the flow is identical. Do not create a separate workshop mode.

**Open for UX design:**

- **Story removal/replacement UX.** Speaker must be able to remove or replace the selected story before a round begins. Use common, minimalist patterns — UX agent decides the interaction.

- **Story picker design.** Must be search-focused and not show all stories at once. How the search/browse experience looks (instant filter, recent stories shown first, etc.) is for UX to design.



## Dependencies

**P279 must ship before this spec is implemented.**

This spec requires showing "the other person's existing position" on linked points inside the /live story card (acceptance criterion: "Point positions in the expanded story card show the other person's existing position — not hidden"). That behavior depends on the service layer loading the profile subject's position into the `positions` map — which is exactly what P279 fixes.

Additionally, `live-mode-view.tsx` currently calls the deprecated `getPointsByValidator` (no position data, no counts). P279 replaces that call with `getPointsForProfileDisplay(userId, currentUser?.id)`. Until P279 ships, linked point positions in `/live` will always render empty regardless of this spec's implementation.

---

## Next Steps

This is a UI feature. Next skill: `/ux features/p272_live-story-point-verification.md`

---

## UX Design

### Overview

This design layer sits on top of the existing /live flow. The story card is additive: it appears above the two action buttons (`IdleScreen`) and persists through every subsequent phase. Nothing in the existing flow is redesigned. The two new things requiring design decisions are (1) how the speaker finds and selects a story (story picker), and (2) how the speaker removes or swaps a story before a round begins.

All component names below refer to existing production components in `live-mode-view.tsx` and `live-content-cards.tsx` unless otherwise noted.

---

### 1. User Flows

#### 1.1 Speaker Flow: Selecting a Story

1. Speaker enters `IdleScreen`. Below the two action buttons, a section reads "or share a story" with a search input.
2. Speaker taps the search input. The keyboard opens. No stories are shown yet — the field is empty with placeholder text: "Search your stories…"
3. Speaker types one or more words. Results filter instantly as each character is typed. Each result shows the first ~80 characters of the story and a point count badge.
4. Speaker taps a story. The picker collapses. The selected story card (`StoryCardWithLinks` rendered with `hideActions=true` and `disableNavigation=true`) appears above the action buttons on the speaker's screen.
5. Simultaneously, the selected story card appears above the action buttons on the listener's screen (real-time via shared `liveState.selectedStoryId`).
6. Both screens are now in the "story selected, pre-round" state.

#### 1.2 Listener Flow: Story Appears Before Round

1. Listener is on `IdleScreen`. The action buttons are visible.
2. Speaker selects a story. The story card appears above the buttons on the listener's screen — no action required from the listener.
3. Listener can tap the card's expand toggle (chevron) to expand linked points and read them, and optionally set their position on any point using `PositionButtons`.
4. Listener sees "Speak freely" below the buttons. Tapping it clears the story from both screens and returns both participants to a no-story idle state.
5. Listener may also simply tap one of the two action buttons to start a round immediately with the story visible.

#### 1.3 Story Removal Flow (Pre-Round, Either Participant)

1. When a story is selected but no round has started, either participant can tap "Speak freely" below the action buttons.
2. This clears the selected story from both screens immediately and returns both participants to the no-story idle state.
3. The search input reappears on the speaker's screen. The speaker can search and select a different story — this is the replace flow.
4. There is no separate X or remove button on the story card. Speak freely is the single removal mechanism for both participants.

#### 1.4 Speaker Flow: Starting a Round With Story Selected

1. Both participants are on `IdleScreen` with the story card visible above the buttons.
2. Either participant taps one of the two action buttons to initiate a round. The round is now anchored to the selected story.
3. The story card remains visible above the main content area throughout the rating phase. The rating drawer slides up from the bottom (`RatingCard` in a `Drawer`, non-dismissible).
4. Both participants submit their sealed ratings. Neither sees the other's rating until both submit.
5. Gap is revealed. The story card remains visible.
6. Participants proceed through the existing flow: explain-back, clarify, or speak freely exit.

#### 1.5 Speaker Flow: Starting a Round Without Story (Speak Freely)

1. Both participants are on `IdleScreen` with no story selected (or after speak freely is tapped to clear story).
2. Either participant taps one of the two action buttons. Round proceeds without a story card — exactly the current behavior.
3. No regression from current flow.

#### 1.6 Story Removal via "Speak Freely" (Pre-Round)

1. When a story is selected but no round has started, "Speak freely" appears below the action buttons on both screens.
2. Either participant can tap "Speak freely." This clears the selected story from both screens and returns both to the no-story idle state (current behavior).
3. Both participants use "Speak freely" to clear the story. There is no X button — speak freely is the single clearing mechanism for both.

#### 1.7 Multi-Round Flow

1. A round completes (gap revealed, explain-back done, or speak freely exit). Both participants tap "Continue" on the celebration/results screen.
2. Both return to `IdleScreen`. The story card from the previous round is NOT automatically carried forward. The picker is available again.
3. Speaker can search and select the same story again, or a different one, or start a round with no story.
4. Session history (`SessionHistoryList`) shows completed rounds with story titles.
5. `SessionHistoryList` (round history below the picker showing previous story titles) is out of scope for P272. It is not part of the accepted build sequence. Create a separate feature if needed.

#### 1.8 Listener Expanding Points During / After a Round

1. At any phase (pre-round, rating, gap reveal, explain-back, success screen), the listener can tap the expand toggle on the story card to reveal linked points.
2. Points render with the 7-point `PositionButtons` exactly as on profile pages. The other participant's position is visible (not sealed).
3. Listener taps a position button to update their stance. No special CTA or modal appears after the update — the change is saved inline.
4. The story card returns to collapsed state when the toggle is tapped again.

---

### 2. Screen States

#### IdleScreen — No Story Selected (Current Behavior, Unchanged)

- Top: `LiveHeader` (session banner + partner name + exit)
- Center: `ActionArea` with two buttons
  - "Does [Partner] understand you?" (blue, primary)
  - "Do you understand [Partner]?" (outline, secondary)
- Below buttons: story picker search bar (only for authenticated speakers with at least one story in library)
- Below search bar: session history list (if prior rounds in this session)

#### IdleScreen — Story Selected, Pre-Round (New State)

- Top: `LiveHeader`
- Below header: `StoryCardWithLinks` rendered with `hideActions=true`, `disableNavigation=true`
  - Story card includes: author avatar, story text (collapsed by default on mobile), expand toggle for linked points
- Below story card: `ActionArea` with two buttons (unchanged, same labels)
- Below buttons: "Speak freely" text button (both screens)
- No search bar visible while a story is selected

#### Rating Phase — Story Visible

- Top: `LiveHeader`
- Below header: `StoryCardWithLinks` (same card, collapsed by default; expand toggle still works)
- Main area: `JourneyToUnderstanding` history card (if prior rounds exist)
- Bottom: `RatingCard` in a non-dismissible `Drawer` (unchanged; slides up from bottom)
- Story card remains visible above the drawer — the drawer overlay/scrim must be removed (transparent or absent) so content behind the drawer handle area is readable. The drawer is partial-height (auto-sizes to its content); the story card above is not covered by the drawer itself, only potentially by the scrim. Remove the `DrawerOverlay` or set it to transparent for this drawer instance.

#### Gap Reveal State — Story Visible

- Top: `LiveHeader`
- Below header: `StoryCardWithLinks` (same card, expand toggle works)
- Main area: `JourneyToUnderstanding` showing both ratings and gap (ratings revealed when both submitted)
- Below history card: `ActionArea` with gap insight text and action buttons (explain-back, speak freely) — all unchanged from current

#### Explain-Back State — Story Visible

- Same layout as gap reveal. Story card remains above the `JourneyToUnderstanding` card.
- Speaker sees: listening state message, waiting indicator
- Listener sees: "Explain back what I heard" button and "Speak freely" ghost button

#### Success Screen (Rating = 10) — Story Visible

- Top: `LiveHeader`
- Below header: `StoryCardWithLinks` (same card, expand toggle works; this is a good moment for listeners to update their position on linked points)
- Main area: `JourneyToUnderstanding` with `variant='success'` styling
- Below history: celebration content (existing), "Continue" button for both participants
- No explicit "update your position" CTA — story card is simply available and expandable

#### Multi-Round: Starting Next Round

- After both participants tap "Continue," `IdleScreen` loads fresh
- `SessionHistoryList` is out of P272 scope — not rendered.
- Story card is not pre-loaded — speaker must search and select again if desired

---

### 2b. Screen Wireframes

Mobile-first (`max-w-sm`). These five states cover all new UI surfaces. Existing states (gap reveal, explain-back, success screen) follow the same pattern as State 5 — story card above, drawer or content below.

**State 1 — Picker open, no story selected**
```
┌──────────────────────────────────┐
│ 🔴  You're live with Alex        │  LiveHeader
├──────────────────────────────────┤
│                                  │
│  ┌────────────────────────────┐  │
│  │  Does Alex understand you? │  │  primary (blue)
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Do you understand Alex?   │  │  secondary (outline)
│  └────────────────────────────┘  │
│                                  │
│  ┌─ 🔍 Search your stories ───┐  │
│  └────────────────────────────┘  │
│                                  │  ← empty until user types
└──────────────────────────────────┘
```

**State 2 — Picker: results visible**
```
┌──────────────────────────────────┐
│ 🔴  You're live with Alex        │
├──────────────────────────────────┤
│                                  │
│  ┌────────────────────────────┐  │
│  │  Does Alex understand you? │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Do you understand Alex?   │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌─ 🔍 calibrat______________ ┐  │
│  ├────────────────────────────┤  │
│  │ The calibration story      │  │  result row (<button>)
│  │ "When I first realised..." │  │
│  ├────────────────────────────┤  │
│  │ My calibration method      │  │  result row (<button>)
│  │ "I use a simple framew..." │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**State 3 — Story selected, pre-round (both screens)**
```
┌──────────────────────────────────┐
│ 🔴  You're live with Alex        │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │ The calibration story      │  │  LiveStoryCardExpanded
│  │ "When I first realised..." │  │  collapsed by default
│  │                          ▼ │  │  expand toggle (aria-expanded)
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Does Alex understand you? │  │  primary (blue)
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Do you understand Alex?   │  │  secondary (outline)
│  └────────────────────────────┘  │
│                                  │
│          Speak freely            │  text button — clears story
│                                  │  from both screens (no X button)
└──────────────────────────────────┘
```
*Listener sees identical layout. No X button on either screen. No picker visible.*

**State 4 — Story card expanded (points visible)**
```
┌──────────────────────────────────┐
│ 🔴  You're live with Alex        │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │ The calibration story      │  │
│  │ "When I first realised     │  │
│  │  that clarity is earned,   │  │
│  │  not assumed..."           │  │
│  │                          ▲ │  │  collapse toggle
│  │  ────────────────────────  │  │
│  │  Points (2)                │  │
│  │                            │  │
│  │  Calibration matters       │  │
│  │  ● ○ ○ ○ ○ ○ ○            │  │  7-pt PositionButtons
│  │                            │  │  other person's pos visible
│  │  Clarity is a learned skill│  │
│  │  ○ ○ ● ○ ○ ○ ○            │  │
│  └────────────────────────────┘  │
│                                  │
│  [action buttons scroll off]     │  user scrolls down to reach
└──────────────────────────────────┘
```

**State 5 — Rating drawer open, story visible above (no scrim)**
```
┌──────────────────────────────────┐
│ 🔴  You're live with Alex        │
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │ The calibration story      │  │  ← VISIBLE — DrawerOverlay
│  │ "When I first realised..." │  │    removed/transparent
│  │                          ▼ │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ Journey to Understanding   │  │  JourneyToUnderstanding
│  │ Round 1: You 7 · Alex 5   │  │
│  └────────────────────────────┘  │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤  drawer handle (no dark overlay)
│  Alex wants to know how well     │  DrawerContent
│  you understood them             │
│                                  │
│  How confident are you?          │
│  ○ ○ ○ ○ ● ○ ○ ○ ○ ○ ○          │  0–10 RatingCard
│                                  │
│  ┌────────────────────────────┐  │
│  │         Submit             │  │
│  └────────────────────────────┘  │
│            Decline               │
└──────────────────────────────────┘
```

---

### 3. Story Picker Design

The picker is a search-first surface embedded in `IdleScreen`, below the two action buttons. It replaces the current `ContentPicker` component (which shows all items at once) for the story-only scenario.

#### Before Search (Empty State)

- A single search input is shown with a search icon on the left and placeholder text: "Search your stories…"
- Below the input, nothing else is shown. No story list, no scrollable grid. The field is empty and waiting.
- This is intentional: the speaker knows their stories and can search for the right one. Showing all stories at once creates noise and does not match the search-focused requirement.

#### Typing: Instant Filter

- Results filter on every keystroke (no debounce lag perceptible by the user). Matching is substring-based against the full story text, case-insensitive.
- Each result row shows:
  - Story text preview: first ~80 characters, truncated with an ellipsis
  - Point count badge: "3 points" in muted text
- No avatar in the result row (all stories belong to the speaker; avatars add visual weight with no informational value here)
- Results are sorted by most recently created, descending.
- Maximum 6 results visible without scrolling. If more match, the list scrolls — the container has a fixed max height before it becomes scrollable.

#### Selecting a Story

- Tapping a result row selects the story immediately.
- The picker (search input + result list) collapses.
- The selected story card appears above the action buttons.
- No "confirm" step between tap-to-select and card appearing.

#### Dismissing the Picker Without Selecting

- Tapping anywhere outside the result list (on the action buttons, on the header, on empty space) collapses the result list and returns focus to the main screen.
- The search input remains visible (but collapsed) until a story is selected or the speaker taps the two action buttons to proceed without a story.

#### Empty Library State

- If the authenticated speaker has zero stories in their library, no picker is shown at all. The IdleScreen shows only the two action buttons (current behavior).
- No error state, no "you have no stories" message inline — that information belongs on the profile, not in a session.

#### No-Results State

- If the speaker searches and no story matches the query, a single line appears below the input: "No stories match "[query]"" in muted text.
- No illustrations, no further actions. The speaker clears the search or tries different words.

---

### 4. Story Removal / Replacement UX

#### Single Mechanism: Speak Freely

There is no X button or remove button on the story card. "Speak freely" is the single clearing mechanism for both participants.

- Before a round begins, "Speak freely" appears below the action buttons on both screens.
- Either participant taps "Speak freely" → story clears from both screens immediately → both return to no-story idle state.
- No confirmation dialog. Removal is low-stakes and reversible (speaker can re-search immediately).

#### Replacing the Selected Story

Replacement is: tap "Speak freely" → story clears → speaker searches and selects a different story. The search input reappears in the idle state.

#### Round Lock

Once either participant taps "Does [Partner] understand you?" or "Do you understand [Partner]?", the round begins. At this point:
- The "Speak freely" text button below the action buttons disappears (round is now active; speak freely during a round is handled by the existing mid-round exit flow).
- The story card is locked for this round and cannot be removed.

---

### 5. Edge Cases

#### Disconnection Mid-Round

- If one participant disconnects during an active round, the other sees the existing `PartnerLeftScreen`. The story card that was visible is no longer relevant.
- On reconnection, session state is restored from `liveState` (Supabase Realtime). If `selectedStoryId` is still set and no round has started, the story card reappears. If a round was in progress, the existing recovery path applies.

#### Speaker Tries to Start New Round Before Current Round Is Complete

- This is prevented by existing logic: action buttons are disabled while a round is in progress (`ratingPhase !== 'idle'`).
- No additional UI is needed. The story card is visible but the buttons are non-interactive until the round completes or is exited.

#### Story Has No Linked Points

- The expand toggle in the story card footer still renders ("0 points" label).
- Tapping expand reveals an empty state: "No points linked to this story." One line of muted text, no further actions.
- The story can still be selected and used for a round — linked points are optional.

#### Speaker's Library Is Empty

- No picker is rendered. `IdleScreen` shows only the two action buttons, exactly as today.
- No regression.

#### Very Long Story Text

- Story card is collapsed by default on mobile. The collapsed state shows the first ~80 characters with an ellipsis (matching `StoryCardPreview`'s current behavior).
- Expand reveals the full text in a scrollable container (`max-h-[200px] overflow-y-auto`, matching the existing `LiveStoryCard` expanded state).
- The card does not force the page to scroll to accommodate long text in collapsed mode.

#### Search Returns No Results

- Single muted line below the search input: "No stories match "[query]"". The speaker can clear the field and try again. No action buttons, no illustrations.

#### Story Selected by Speaker, Listener Views on a Small Screen

- The story card renders above the action buttons on both screens. On small viewports (e.g., iPhone SE), the card is collapsed by default and takes approximately 80–100px. The two action buttons remain visible without scrolling.
- If the listener expands the card, the buttons scroll off-screen naturally. The listener scrolls back up to reach them — no pinning or sticky behavior is needed for this flow.

---

### 6. Accessibility

Scope: pilot-appropriate minimum. No aria-live announcements (add non-trivial complexity for a known-cohort pilot with no screen reader users). Use semantic HTML and aria-labels on interactive elements. Revisit before any public or scaled release.

#### Story Picker — Search Input

- The search input has `aria-label`: "Search your stories."
- Each result row is a `<button>` element. The accessible name carries the full story text (not truncated), even if the visible label is truncated.

#### Story Card Expand Toggle

- The expand button (chevron) has `aria-expanded` set to `true`/`false` and `aria-label`: "Expand linked points" / "Collapse linked points."

#### Round State Changes

- When a round begins (buttons become disabled, drawer slides up), the `Drawer` component's `DrawerTitle` (currently `sr-only`) provides the screen reader context for the rating phase.
- Existing patterns in `RatingCard` and `JourneyToUnderstanding` are unchanged.

#### Sealed Rating

- `PositionButtons` on linked points within the story card are interactive during all phases. Their `aria-label` pattern follows the existing profile-page implementation.
- The 0–10 sealed rating in the drawer is separate from point positions — no accessibility change needed there.

---

### 7. Responsive Design

#### Mobile (Primary Use Case)

The /live session hides the main navigation (`SimpleNavigation` is display:none while live). The screen is full-height. All layout is single-column.

**Story card in collapsed state:**
- Takes ~80–100px vertically. This is acceptable above the two action buttons (which are approximately 110px for both buttons with gap).
- Total "above-the-fold" content on the smallest common mobile screen (375px × 667px logical pixels, iPhone SE): header (~56px) + recording band (~32px) + story card collapsed (~96px) + action buttons (~110px) = ~294px. Remaining ~373px is available for session history and picker. This fits comfortably.

**Story card in expanded state:**
- Expands in-place. The action buttons scroll off-screen. This is expected and acceptable — the listener is reading, not rating.
- No sticky or pinned action buttons while the card is expanded.

**Search picker on mobile:**
- The search input is full-width within `max-w-sm` container.
- Result list is a scrollable vertical list, max 6 visible rows, `overflow-y-auto` with a max height of approximately 280px before scrolling.
- The picker is NOT a full-screen sheet (bottom sheet). It is inline, embedded below the action buttons. A full-screen sheet would obscure the story card and the action buttons, creating confusion about how to select without starting a round. Inline is simpler and consistent with the current `ContentPicker` implementation.
- On keyboard open (iOS/Android soft keyboard), the screen shifts up. The search input stays visible because it is mid-page. If the result list is partially off-screen due to keyboard, the list itself scrolls internally.

#### Larger Screens (Tablet / Desktop)

- The existing `max-w-sm` container constrains all /live content. This constraint applies to the story card as well. No full-width expansion on desktop.
- All layouts remain single-column.

---

## Technical Analysis

### Current Code State

**Live session infrastructure (`src/app/pages/clarity-live-page.tsx`):**
The session uses Supabase Realtime + 1-second polling fallback. All shared state lives in `clarity_sessions.live_state` (JSONB). Any call to `updateLiveState(partial)` deep-merges the partial and writes to Supabase. The full `LiveSessionState` type is defined in `src/app/types/index.ts`.

**`LiveSessionState` — synced fields relevant to P272:**
- `selectedStoryId?: string` — already present from P128
- `selectedPointId?: string` — already present from P128
- `selectedContentTitle?: string` — already present from P128
- `sessionHistory?: Array<...>` — already present from P128
- `ratingPhase: RatingPhase` — `'idle' | 'waiting' | 'rating' | 'revealed' | 'results' | 'explain-back'`
- `checkerName`, `checkerRating`, `checkerSubmitted`, `responderRating`, `responderSubmitted` — round state
- `celebrationAcknowledgedBy?: string[]` — both users acknowledge to close a round

**What happens today when a story is "selected" (`src/app/pages/clarity-live-page.tsx` `handleSelectStory`):**
`handleSelectStory` writes `selectedStoryId` to shared state, then immediately calls `setLocalFlowType('check')` and `setIsLocallyRating(true)` — which triggers the rating drawer. Selecting a story today **starts a round immediately**. There is no "story selected, pre-round idle" state. P272 removes this coupling.

**`IdleScreen` content rendering (`src/app/components/partners/live-mode-view.tsx`):**
Renders `ContentPicker` from `live-content-cards.tsx` when `userId && contentLoaded && hasContent`. The `ContentPicker` shows both stories and points, embeds a rating UI inside the `LiveStoryCard` expansion, and calls `onSelectStory(storyId, title, rating)` with a rating already chosen. P272 replaces this entire block with a search-first story-only picker.

**`StoryCardPreview` (`src/app/components/partners/live-content-cards.tsx`):**
Static "selected story" display — text preview + point count, no expand toggle, no linked point interaction. Currently shown in `RatingScreen` and `RatingScreenWithOptionalDrawer`. P272 replaces this with an interactive expandable card.

**`StoryCardWithLinks` (`src/app/components/social/story-card-with-links.tsx`):**
Production profile story card. Has `hideActions` and `disableNavigation` props. Uses prototype types (`Story`, `Point` from `@/app/prototypes/shared/types`), not production `StoryWithPoints`. Adapting between these two type systems requires a non-trivial conversion layer. The profile page `StoryCardFull` pattern in `profile-page-v2.tsx` uses `StoryWithPoints` directly and is the template for the new live card.

**`story_verifications.accuracy_achieved` (`supabase/migrations/20260204_stories_points_calibration.sql`):**
Currently `BOOLEAN GENERATED ALWAYS AS (speaker_rating >= 8) STORED`. Must change to `speaker_rating = 10`. The two triggers reference `accuracy_achieved = true` and will apply the new threshold automatically. The partial index (`WHERE accuracy_achieved = true`) must be dropped and recreated. No data migration needed — the table is empty.

**`calibrationService.recordVerification` (`src/app/data/calibration-service-real.ts`):**
Insert path into `story_verifications` already exists. Requires: `storyId`, `versionId`, `sessionId`, `speakerId`, `listenerId`, `speakerRating`, `listenerRating`. `versionId` must be resolved by querying `story_versions WHERE story_id = $storyId ORDER BY version_number DESC LIMIT 1`.

**`session.creatorProfileId` / `joinerProfileId`:** Added to `clarity_sessions` in the P204 migration. Must verify these are included in the `ClaritySession` TypeScript type in `src/app/data/api.ts` and returned by `getClaritySession`. If not present, add them.

**`DrawerOverlay` (`src/components/ui/drawer.tsx`):**
On mobile, the rating drawer renders `<div className="fixed inset-0 z-50 bg-black/80 ...">` as the overlay. The UX spec requires this overlay to be transparent so the story card above the drawer is visible during the rating phase. Fix: add optional `overlayClassName?: string` prop to `DrawerContent`.

**7-point `PositionButtons` location:**
The 7-point position scale component used in `StoryCardWithLinks` comes from `src/app/prototypes/linkedin-like/components/shared/PositionButtons` — not from `src/app/components/partners/position-buttons.tsx` (which is the old agree/disagree/skip 3-option component).

---

### Architecture Decisions

**Decision 1: Decouple story selection from round start**
- **Chosen:** Remove `setLocalFlowType('check')` and `setIsLocallyRating(true)` from `handleSelectStory` in `clarity-live-page.tsx`. Story selection writes `selectedStoryId` to shared state only. Both participants see the story card. A round starts when either participant taps an action button.
- **Rationale:** The spec requires a "story selected, pre-round idle" state that does not exist today. The current P128 coupling skips this state entirely.
- **Trade-off:** The `onSelectStory` callback signature changes from `(storyId, title, rating)` to `(storyId, title)` — the rating param is removed.
- **Alternative rejected:** Keeping the immediate-rating-drawer with a "cancel and go back" path. Creates a confusing two-step that conflicts with the spec.

**Decision 2: New `StorySearchPicker` replaces `ContentPicker` for story selection**
- **Chosen:** Create `src/app/components/partners/story-search-picker.tsx`. Story-only, search-first (nothing shown until user types), instant filter, max 6 results, no embedded rating UI, calls `onSelectStory(storyId, title)` with two args.
- **Rationale:** `ContentPicker` shows both stories and points, embeds a rating UI, calls `onSelectStory` with three args including a rating. All behaviors contradict P272.
- **Trade-off:** `ContentPicker`, `LiveStoryCard`, `LivePointCard` remain in `live-content-cards.tsx` but are no longer used in the standard `IdleScreen` flow. They become dead code.
- **Alternative rejected:** Extending `ContentPicker` with `storyOnly`, `searchFirst`, `hideRatingUI` props. Too many conditional branches in a shared component.

**Decision 3: New `LiveStoryCardExpanded` component rather than reusing `StoryCardWithLinks`**
- **Chosen:** Create `src/app/components/partners/live-story-card-expanded.tsx` using `StoryWithPoints` (production type). Mirrors the `StoryCardFull` pattern from `profile-page-v2.tsx` but with `hideActions = true` and `disableNavigation = true` hard-coded.
- **Rationale:** `StoryCardWithLinks` uses prototype `Story`/`Point` types from `@/app/prototypes/shared/types`. The live session uses `StoryWithPoints` from `@/app/types`. Bridging these type systems requires a runtime adapter layer. `StoryCardFull` in `profile-page-v2.tsx` already does what we need with the right types.
- **Trade-off:** Does not reuse `StoryCardWithLinks`. If `StoryCardWithLinks` is later migrated to production types, the live card can be consolidated.
- **Alternative rejected:** Type adapter shim to convert `StoryWithPoints` → prototype `Story`. Adds runtime conversion logic and obscures the data model.

**Decision 4: `accuracy_achieved` column change via new migration**
- **Chosen:** `supabase/migrations/20260218_p272_accuracy_achieved_threshold.sql` — drop partial index, drop column, add new column with `= 10`, recreate index.
- **Rationale:** PostgreSQL does not support `ALTER COLUMN` for generated columns. Table is empty. Triggers read `accuracy_achieved = true` and require no changes.
- **Trade-off:** None. The table is empty.
- **Alternative rejected:** Application-level filter in `recordVerification`. Would not fix the `understood_count` and `ears_count` triggers which read the DB column.

**Decision 5: Verification insert fires inside `handleRatingSubmit` at `bothSubmitted` block**
- **Chosen:** In `clarity-live-page.tsx` `handleRatingSubmit`, at the `bothSubmitted` block, when `checkerRatingValue === 10 AND currentState.selectedStoryId` is set, call `writeStoryVerification(...)` fire-and-forget. `speakerId`/`listenerId` are resolved from `session.creatorProfileId` / `session.joinerProfileId` matched against `checkerName`. Guard with a round-scoped `useRef<Set<string>>` to prevent duplicate inserts on re-renders.
- **Rationale:** `handleRatingSubmit` is where `checkerRating` is definitively known and the `bothSubmitted` transition happens. Earliest reliable point.
- **Trade-off:** Only one client fires the insert (the second submitter, inside the `bothSubmitted` block). If both clients race, the DB `UNIQUE` constraint on `story_verifications` handles it.
- **Alternative rejected:** Insert on celebration continue button. Risks missing the insert if participant disconnects before tapping Continue.

**Decision 6: "Speak freely" pre-round uses new `onClearStory` callback, not `onSkip`**
- **Chosen:** New `onClearStory` prop on `LiveModeViewProps` and `IdleScreenProps`. Rendered below action buttons when `liveState.selectedStoryId && ratingPhase === 'idle'`. Calls `updateLiveState({ selectedStoryId: undefined, ... })` only.
- **Rationale:** `onSkip` resets the entire round state. Pre-round clear only removes story selection — no round was in progress. They are semantically different.
- **Trade-off:** None.
- **Alternative rejected:** Reusing `onSkip` for pre-round clear. Would write a spurious `skippedBy` name to shared state and add a history entry when no round occurred.

---

### Security Review

**RLS Policies:**

- ⚠️ `story_verifications` INSERT policy is `WITH CHECK (auth.uid() IS NOT NULL)` only — any authenticated user can insert a verification for any story with any `speaker_id`/`listener_id` and a rating of 10, causing `understood_count` and `ears_count` to increment on arbitrary profiles via triggers. **Must be tightened before ship.** Minimum fix: `WITH CHECK (auth.uid() = speaker_id OR auth.uid() = listener_id)`.
- ⚠️ `story_verifications` SELECT is `USING (true)` — all verification records (including both participant IDs, both ratings, timestamps) are publicly readable. This exposes the session participation graph. Make explicit product decision; consider restricting to `auth.uid() IN (speaker_id, listener_id)`.
- ⚠️ `clarity_sessions` UPDATE policy (`WITH CHECK (creator_profile_id = auth.uid() OR creator_profile_id IS NULL)`) — guest-created sessions where `creator_profile_id IS NULL` are writable by any authenticated user. P272 writes `selectedStoryId` via this path; any user who knows a 6-character room code can overwrite `live_state` on guest sessions.
- ✅ `stories` SELECT correctly blocks non-authors from reading `private` stories. However, `shared` stories are also blocked for non-authors — see Authentication note below.
- ✅ `point_positions` INSERT/UPDATE enforces `auth.uid() = user_id`. Correct.

**Authentication:**

- ✅ Participants use Supabase Auth (`getOrCreateGuestUser()` creates anonymous auth users), providing real `auth.uid()` for all RLS checks.
- ⚠️ `checkerName` / `proverName` in `live_state` are plain text strings stored in `sessionStorage`, not tied to `auth.uid()` at the DB level. Speaker/listener identity for the verification insert is resolved by matching `checkerName` against `session.creatorName` — which is also a plain text field. If `creatorName` is spoofed by a client, `speakerId`/`listenerId` mapping can be wrong.
- ✅ Story visibility in /live: resolved by pushing story content into `live_state.selectedStoryData` — listener reads from session state, not from the `stories` table. No RLS issue.

**Authorization:**

- ⚠️ No server-side enforcement on who can write `selectedStoryId` to `live_state`. The listener can inject a story ID they do not own into the shared state. `updateLiveState` accepts any `Record<string, unknown>` and writes to the JSONB column without an allowlist. For P272, this means the listener can push a `selectedStoryId` pointing to a story they do not own, and the subsequent verification insert would record it under that story.
- ✅ `pointsService.updatePosition` enforces ownership via RLS (`auth.uid() = user_id`). Position saves from inside `/live` are safe.

**Input Validation:**

- ✅ Story search is performed client-side against an already-fetched owned list, or via Supabase `.ilike()` with parameterized queries — no SQL injection risk.
- ✅ `story_verifications` has a DB-level `CHECK (speaker_rating BETWEEN 0 AND 10)` constraint. Out-of-range ratings are rejected at the DB level.
- ⚠️ `live_state` JSONB accepts arbitrary key-value pairs with no schema validation. Any participant can write unexpected keys and potentially corrupt shared session state. Low severity for P272 specifically, but a systemic gap. Recommended: add a Zod schema validation layer in `updateClaritySessionLiveState` before the Supabase call.

**Data Protection:**

- ⚠️ `story_verifications` SELECT exposes session participation data publicly (who participated with whom, ratings given). Make an explicit product decision about whether verification data should be public or restricted to participants.
- ⚠️ `point_position_history` SELECT is `USING (true)` — all historical position changes including free-text `reasoning` field are publicly readable.
- ✅ Stories are protected by visibility-based RLS. Exception: `shared` stories need a session-participation-based grant for listener access (see Authentication above).

**Risks requiring resolution before implementation:**

1. **`story_verifications` INSERT policy** — tighten RLS before writing any verification records. Confidence: 95 (critical).
2. **`shared`-visibility story access for listeners** — define how the listener gets read access to a story selected in the session. Confidence: 80 (will cause broken UX for shared stories).
3. **Guest session write-by-anyone gap** — `creator_profile_id IS NULL` bypasses update restriction. Medium severity for `selectedStoryId` integrity. Confidence: 90.
4. **`live_state` schema validation** — add Zod validation to `updateClaritySessionLiveState`. Low severity for P272 specifically. Confidence: 80.

---

### Implementation Approach

#### DB Migration (do first)

**File:** `supabase/migrations/20260218_p272_accuracy_achieved_threshold.sql`

```sql
-- P272: Change accuracy_achieved threshold from >= 8 to = 10
-- No data migration needed — story_verifications table is empty.
-- Triggers update_story_understood_count and update_profile_ears_count
-- reference accuracy_achieved = true and require no changes.

-- Step 1: Drop dependent partial index
DROP INDEX IF EXISTS idx_verifications_achieved;

-- Step 2: Drop generated column (PostgreSQL cannot ALTER a generated column)
ALTER TABLE story_verifications
  DROP COLUMN accuracy_achieved;

-- Step 3: Add column with updated threshold
ALTER TABLE story_verifications
  ADD COLUMN accuracy_achieved BOOLEAN
  GENERATED ALWAYS AS (speaker_rating = 10) STORED;

-- Step 4: Recreate partial index
CREATE INDEX idx_verifications_achieved
  ON story_verifications(story_id)
  WHERE accuracy_achieved = true;
```

Additionally, tighten the `story_verifications` INSERT RLS policy:

```sql
-- Tighten INSERT policy: caller must be speaker or listener
DROP POLICY IF EXISTS "Anyone can insert verifications" ON story_verifications;
CREATE POLICY "story_verifications_insert" ON story_verifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    (auth.uid() = speaker_id OR auth.uid() = listener_id)
  );
```

---

#### Files to Create

1. **`src/app/components/partners/story-search-picker.tsx`**
   - Story-only search-first picker for `IdleScreen`
   - Props: `stories: StoryWithPoints[]`, `onSelectStory: (storyId: string, title: string) => void`, `disabled?: boolean`
   - Renders nothing when stories array is empty
   - Shows empty search input on mount (no results until typing)
   - Filters by `story.content.toLowerCase().includes(query)` on every keystroke
   - Result row: 80-char preview with ellipsis + muted "N points" badge; no avatar
   - Sorted by `createdAt` descending (passed in pre-sorted)
   - Max 6 visible rows; container `max-h-[280px] overflow-y-auto`
   - No-results: `<p className="text-sm text-muted-foreground">No stories match "{query}"</p>`
   - Tapping a row calls `onSelectStory(story.id, preview)` immediately with no confirm step

2. **`src/app/components/partners/live-story-card-expanded.tsx`**
   - Expandable story card for all /live phases (above action buttons, above drawer, above gap-reveal)
   - Props: `story: StoryWithPoints`, `currentUserId?: string`, `onPositionSelect?: (pointId: string, position: PositionType | null) => void`, `className?: string`
   - Collapsed by default: avatar + 80-char preview + chevron with `aria-expanded`
   - Expanded: full story text (`max-h-[200px] overflow-y-auto`) + linked points list
   - Each linked point: point statement + 7-point `PositionButtons` from `@/app/prototypes/linkedin-like/components/shared`
   - `onPositionSelect` fires on position button click; local state updated immediately (optimistic)
   - `hideActions = true` hard-coded — no share button, no external link icon
   - `disableNavigation = true` hard-coded — card click does nothing
   - Empty points: "No points linked to this story." muted text
   - `data-testid="live-story-card-expanded"`

3. **`supabase/migrations/20260218_p272_accuracy_achieved_threshold.sql`**
   - Content: see DB Migration section above

---

#### Files to Modify

1. **`src/app/components/partners/live-mode-view.tsx`**
   - `LiveModeViewProps`: add `onClearStory?: () => void`
   - `IdleScreenProps`: add `onClearStory?: () => void`, `selectedStory?: StoryWithPoints | null`
   - `IdleScreen`:
     - When `liveState.selectedStoryId && selectedStory`: render `<LiveStoryCardExpanded>` above `<ActionArea>`
     - When `liveState.selectedStoryId && ratingPhase === 'idle'`: render "Speak freely" ghost button below `<ActionArea>`, calling `onClearStory?.()`
     - Replace `ContentPicker` render block with `<StorySearchPicker>` (shown only when `!liveState.selectedStoryId`)
     - `onSelectStory` signature changes to `(storyId: string, title: string)` — no rating param
   - `RatingScreen`: add `selectedStory?: StoryWithPoints | null` prop; render `<LiveStoryCardExpanded>` above drawer; add `overlayClassName="bg-transparent"` to the `<Drawer>`
   - `RatingScreenWithOptionalDrawer`: same story card + overlay change
   - `UnderstandingScreen`: add `selectedStory?: StoryWithPoints | null` prop; render `<LiveStoryCardExpanded>` above `<JourneyToUnderstanding>` in all sub-phases
   - All `IdleScreen` render sites: pass `onClearStory` and `selectedStory`
   - All `UnderstandingScreen` render sites: pass `selectedStory`

2. **`src/app/pages/clarity-live-page.tsx`**
   - `handleSelectStory`: Remove `setLocalFlowType('check')` and `setIsLocallyRating(true)`. Keep `updateLiveState` and analytics.
   - Add `handleClearStory`: `updateLiveState({ selectedStoryId: undefined, selectedPointId: undefined, selectedContentTitle: undefined })`
   - `handleRatingSubmit`, `bothSubmitted` block: add verification insert guard (see code sketch below)
   - Add `writeStoryVerification` async helper (fire-and-forget with error guard)
   - Add `handlePositionSelectInLive(pointId, position)`: calls `pointsService.updatePosition` fire-and-forget
   - Pass `onClearStory`, `onPositionSelect` to `LiveModeView`

3. **`src/components/ui/drawer.tsx`**
   - Add `overlayClassName?: string` prop to `DrawerContent`
   - Mobile overlay `<div>`: use `overlayClassName` as className when provided, falling back to default `"fixed inset-0 z-50 bg-black/80 animate-in fade-in-0"`

4. **`src/app/data/api.ts`** (if needed)
   - Verify `ClaritySession` type includes `creatorProfileId?: string` and `joinerProfileId?: string`
   - Verify `getClaritySession` SELECT query returns these columns; add if missing

---

#### `writeStoryVerification` code sketch

```typescript
// Inside ClarityLivePage component
const verificationFiredRef = useRef<Set<string>>(new Set());

const writeStoryVerification = useCallback(async ({
  storyId, sessionId, checkerName, checkerRating, responderRating,
}: {
  storyId: string;
  sessionId: string | undefined;
  checkerName: string;
  checkerRating: number;
  responderRating: number;
}) => {
  const roundKey = `${storyId}_${sessionId}_${checkerName}`;
  if (verificationFiredRef.current.has(roundKey)) return;
  verificationFiredRef.current.add(roundKey);

  if (!user?.id || !session) return;

  try {
    const speakerId = session.creatorName === checkerName
      ? session.creatorProfileId
      : session.joinerProfileId;
    const listenerId = session.creatorName === checkerName
      ? session.joinerProfileId
      : session.creatorProfileId;

    if (!speakerId || !listenerId) {
      console.error('[P272] Cannot write verification: missing profile IDs');
      return;
    }

    const { data: versionRow } = await supabase
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (!versionRow) {
      console.error('[P272] No version found for story', storyId);
      return;
    }

    await calibrationService.recordVerification({
      storyId, versionId: versionRow.id, sessionId,
      speakerId, listenerId,
      speakerRating: checkerRating, listenerRating: responderRating,
    });

    analytics.track('live_story_verified', {
      session_code: session.code, story_id: storyId,
    });
  } catch (err) {
    console.error('[P272] writeStoryVerification failed:', err);
    // Non-blocking — round completes regardless
  }
}, [user?.id, session, calibrationService]);

// Reset ref at start of each new round (in handleCelebrationComplete and handleSkip)
// verificationFiredRef.current.clear();
```

---

#### Build Sequence

1. **DB migration** — create `supabase/migrations/20260218_p272_accuracy_achieved_threshold.sql` with both the `accuracy_achieved` column change and the tightened RLS INSERT policy. Apply and verify triggers fire correctly.
2. **`StorySearchPicker`** — create `src/app/components/partners/story-search-picker.tsx`. Test: empty on mount, filters on keystroke, max 6 rows, no-results state, tap collapses.
3. **`LiveStoryCardExpanded`** — create `src/app/components/partners/live-story-card-expanded.tsx`. Test: collapsed default, expand toggle, no share/link icons, position buttons per point, `onPositionSelect` fires.
4. **Drawer overlay fix** — add `overlayClassName` prop to `src/components/ui/drawer.tsx`. Verify story card is visible behind transparent overlay.
5. **Decouple selection from round start** in `clarity-live-page.tsx` — remove `setLocalFlowType` + `setIsLocallyRating` from `handleSelectStory`. Add `handleClearStory`. Verify `ClaritySession` has `creatorProfileId`/`joinerProfileId`; add if missing.
6. **Wire `IdleScreen`** in `live-mode-view.tsx` — `StorySearchPicker`, `LiveStoryCardExpanded`, "Speak freely" ghost button, `selectedStory` prop threading.
7. **Replace `StoryCardPreview`** with `LiveStoryCardExpanded` in `RatingScreen`, `RatingScreenWithOptionalDrawer`, `UnderstandingScreen`. Apply transparent overlay to rating Drawers.
8. **`writeStoryVerification` + insert hook** in `clarity-live-page.tsx` — add at `bothSubmitted && checkerRating === 10`. Add round-scoped guard ref.
9. **Wire `onPositionSelect`** through `LiveModeView` props down to `LiveStoryCardExpanded`.
10. **E2E tests** — story visible on both screens after selection, persists through all phases, `story_verifications` row written at rating=10, story cleared by "Speak freely".

---

#### Critical Details

**P279 dependency:** `StoryWithPoints.points[].userPosition` contains the viewer's own position. Showing the other participant's position in the /live story card depends on P279 (which fixes `getPointsForProfileDisplay` to load the profile subject's position). Until P279 ships, linked points will show each participant's own position only — which is the known gap documented in `## Dependencies`.

**Private and shared story visibility — product decision:**
Speakers must be able to bring any story into /live — including `private` stories. The session is an implicit consent boundary: the listener sees the story within the session only, not via profile pages or search.

Technical approach for pilot: when the speaker selects a story, push the story content (not just `selectedStoryId`) into `live_state` as `selectedStoryData: { id, title, content, points }`. The listener's card reads from `live_state.selectedStoryData` — bypassing the `stories` RLS entirely. The listener never queries the `stories` table directly.

This means:
- The `handleSelectStory` handler fetches `StoryWithPoints` and writes both `selectedStoryId` and `selectedStoryData` to `live_state`
- `LiveStoryCardExpanded` receives its data from `live_state.selectedStoryData`, not from a separate `getStory(id)` call on the listener's client
- No RLS policy changes needed for pilot

Post-pilot: replace with a session-participation RLS policy that grants SELECT on stories where the requester is a participant in a session where the story is selected.

**`checkerName` identity trust:** Speaker/listener identity for the verification insert is resolved by matching `checkerName` (a plain text string) against `session.creatorName`. In a trusted pilot context this is acceptable. For a scaled product, speaker identity should be tied to `auth.uid()` rather than a name string.

**`live_state` JSONB validation:** Add a Zod schema for `LiveSessionState` and validate inbound updates before the Supabase call. Low priority for the pilot but closes a systemic gap.

---

## Test Coverage Strategy

**What's Tested:**
- ✅ DB migration threshold (`accuracy_achieved` = 10, not ≥ 8) — integration test (MANDATORY)
- ✅ Tightened RLS INSERT policy (speaker/listener only) — integration test
- ✅ Story picker visible for authenticated creator with stories — E2E
- ✅ Story selection syncs to listener screen — two-party E2E
- ✅ Speak freely pre-round clears story from both screens — two-party E2E
- ✅ Story card visible during rating phase (above drawer) — two-party E2E
- ✅ `story_verifications` record written at speaker_rating=10 — two-party E2E + DB poll
- ✅ Regression: sessions without story still work — E2E
- ✅ Story picker search input aria-label — two-party a11y
- ✅ Expand toggle aria-expanded attribute + keyboard accessible — two-party a11y
- ✅ Share/external-link icons hidden in /live story card — two-party a11y
- ✅ /live page smoke load (auth + guest) — smoke tests

**What's NOT Tested (rationale):**
- ❌ `writeStoryVerification` unit test — it's a fire-and-forget React callback, not an isolated utility; covered by E2E + integration
- ❌ DB triggers (`update_story_understood_count`, `update_profile_ears_count`) — these predate P272 and are tested by existing calibration helper; covered in UAT-5.1
- ❌ Story card expand/collapse with linked points in /live — requires P279 deployed; covered by UAT-6.3 (P279-gated)
- ❌ Multi-round flow (story not carried to next round) — complex E2E, covered by UAT-4.3 manual
- ❌ Disconnection mid-round story recovery — complex edge case, covered by UAT description

**Test Pyramid:**
```
       /\
      /  \   6 two-party E2E tests (story sync, speak freely, verification write, regression)
     /____\
    / 4 A11Y \  (story picker aria, expand toggle, keyboard, hidden icons)
   /__________\
  / 1 INTEGRATION \ (accuracy_achieved migration + RLS — MANDATORY)
 /______________\
/ 2 SMOKE        \  (page load, no console errors)
```

**Files generated:**
- `e2e/integration/p272-accuracy-achieved-migration.spec.ts` — 6 tests (schema + threshold + RLS)
- `e2e/p272-live-verification.spec.ts` — 6 two-party E2E tests
- `e2e/p272-smoke.spec.ts` — 4 smoke tests
- `e2e/a11y/p272-accessibility.spec.ts` — 4 a11y tests
- `features/uat/p272.md` — 18 UAT scenarios

**Total:** 20 automated tests + 18 UAT scenarios

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: DB migration — accuracy_achieved threshold + RLS tighten
- **Files:** `supabase/migrations/20260218_p272_accuracy_achieved_threshold.sql` (create)
- **Spec refs:** "Technical Analysis > Implementation Approach > DB Migration (lines ~773-811)"
- **Tests:** `e2e/integration/p272-accuracy-achieved-migration.spec.ts`
- **Depends on:** None
- **Verify:** Migration applies cleanly; `accuracy_achieved` is `true` only when `speaker_rating = 10` (not ≥ 8); INSERT policy rejects rows where `auth.uid()` ∉ {`speaker_id`, `listener_id`}
- [x] Complete

### Task 2: StorySearchPicker component
- **Files:** `src/app/components/partners/story-search-picker.tsx` (create)
- **Spec refs:** "Technical Analysis > Implementation Approach > Files to Create > #1 (lines ~817-827)", "UX Design > 3. Story Picker Design (lines ~487-528)"
- **Tests:** `e2e/a11y/p272-accessibility.spec.ts`, `e2e/p272-smoke.spec.ts`
- **Depends on:** None
- **Verify:** Empty on mount (no results shown until typing); filters on every keystroke; max 6 visible rows before scroll; no-results line appears; tapping a row collapses picker and calls `onSelectStory(storyId, title)`; `aria-label="Search your stories"` on input; each result row is a `<button>` with full accessible name
- [x] Complete

### Task 3: LiveStoryCardExpanded component
- **Files:** `src/app/components/partners/live-story-card-expanded.tsx` (create)
- **Spec refs:** "Technical Analysis > Implementation Approach > Files to Create > #2 (lines ~829-843)", "UX Design > 2b. Screen Wireframes > State 4 (lines ~436-455)"
- **Tests:** `e2e/a11y/p272-accessibility.spec.ts`
- **Depends on:** None
- **Verify:** Collapsed by default; expand toggle sets `aria-expanded`; no share icon, no external-link icon; linked points render with 7-point `PositionButtons` from `@/app/prototypes/linkedin-like/components/shared`; empty points show "No points linked to this story."; `data-testid="live-story-card-expanded"` present; `onPositionSelect` fires on position button click
- [x] Complete

### Task 4: Drawer overlay fix
- **Files:** `src/components/ui/drawer.tsx` (modify)
- **Spec refs:** "Technical Analysis > Current Code State > DrawerOverlay (lines ~681-683)", "Technical Analysis > Implementation Approach > Files to Modify > #1 > RatingScreen (lines ~856-857)", "UX Design > 2b. Screen Wireframes > State 5 (lines ~457-483)"
- **Depends on:** None
- **Verify:** `overlayClassName?: string` prop added to `DrawerContent`; passing `overlayClassName="bg-transparent"` produces a transparent scrim; default behavior (dark overlay) unchanged when prop is omitted
- [x] Complete

### Task 5: Decouple story selection from round start + write selectedStoryData to live_state
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify), `src/app/data/api.ts` (modify if `creatorProfileId`/`joinerProfileId` missing)
- **Spec refs:** "Technical Analysis > Architecture Decisions > Decision 1 (lines ~691-695)", "Technical Analysis > Implementation Approach > Files to Modify > #2 (lines ~862-869)", "Technical Analysis > Critical Details > Private and shared story visibility (lines ~967-977)"
- **Tests:** `e2e/p272-live-verification.spec.ts`, `e2e/p272-smoke.spec.ts`
- **Depends on:** None
- **Verify:**
  - `handleSelectStory` removes `setLocalFlowType('check')` and `setIsLocallyRating(true)`; selecting a story does NOT open the rating drawer
  - `handleSelectStory` writes both `selectedStoryId` AND `selectedStoryData: { id, title, content, points }` to `live_state` — listener reads from session state, bypassing `stories` RLS
  - `handleClearStory` writes `{ selectedStoryId: undefined, selectedPointId: undefined, selectedContentTitle: undefined, selectedStoryData: undefined }` to `live_state`
  - `ClaritySession` TypeScript type in `api.ts` includes `creatorProfileId?: string` and `joinerProfileId?: string`; `getClaritySession` SELECT query returns these columns
- [x] Complete

### Task 6: Wire IdleScreen — picker, story card, Speak freely
- **Files:** `src/app/components/partners/live-mode-view.tsx` (modify)
- **Spec refs:** "Technical Analysis > Implementation Approach > Files to Modify > #1 > IdleScreen (lines ~849-856)", "UX Design > 2. Screen States > IdleScreen — Story Selected, Pre-Round (lines ~315-330)", "Technical Analysis > Architecture Decisions > Decision 6 (lines ~721-725)"
- **Tests:** `e2e/p272-live-verification.spec.ts`, `e2e/a11y/p272-accessibility.spec.ts`
- **Depends on:** Task 2, Task 3, Task 5
- **Verify:**
  - `LiveModeViewProps` and `IdleScreenProps` accept `onClearStory?: () => void` and `selectedStory?: StoryWithPoints | null`
  - `StorySearchPicker` rendered in `IdleScreen` when `!liveState.selectedStoryId` (replaces `ContentPicker` block)
  - `LiveStoryCardExpanded` rendered above `ActionArea` when `selectedStory` is set
  - "Speak freely" ghost button rendered below `ActionArea` when `liveState.selectedStoryId && ratingPhase === 'idle'`; calls `onClearStory?.()`
  - Picker hidden when story is selected; card reads from `liveState.selectedStoryData` (not a separate fetch)
  - Sessions with no story selected behave as current speak freely flow (regression)
- [x] Complete

### Task 7: Persist story card through rating, gap reveal, and results screens
- **Files:** `src/app/components/partners/live-mode-view.tsx` (modify)
- **Spec refs:** "Technical Analysis > Implementation Approach > Files to Modify > #1 > RatingScreen, UnderstandingScreen (lines ~856-860)", "UX Design > 2. Screen States > Rating Phase through Success Screen (lines ~323-355)"
- **Tests:** `e2e/p272-live-verification.spec.ts`
- **Depends on:** Task 3, Task 4, Task 6
- **Verify:**
  - `RatingScreen` accepts `selectedStory?: StoryWithPoints | null`; renders `<LiveStoryCardExpanded>` above drawer content; `<Drawer>` uses `overlayClassName="bg-transparent"` so story card above is visible
  - `RatingScreenWithOptionalDrawer`: same story card + transparent overlay
  - `UnderstandingScreen` accepts `selectedStory?`; renders `<LiveStoryCardExpanded>` above `<JourneyToUnderstanding>` in all sub-phases (gap reveal, explain-back, success)
  - Story card expand toggle works during rating phase
  - Sealed-bid behavior unchanged (neither participant sees the other's rating before both submit)
- [x] Complete

### Task 8: writeStoryVerification insert hook
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify)
- **Spec refs:** "Technical Analysis > Architecture Decisions > Decision 5 (lines ~715-719)", "Technical Analysis > Implementation Approach > writeStoryVerification code sketch (lines ~882-944)", "Technical Analysis > Implementation Approach > Build Sequence > step 8 (lines ~957-958)"
- **Tests:** `e2e/p272-live-verification.spec.ts`, `e2e/integration/p272-accuracy-achieved-migration.spec.ts`
- **Depends on:** Task 1, Task 5
- **Verify:**
  - `writeStoryVerification` fires inside `handleRatingSubmit` at `bothSubmitted` block when `checkerRatingValue === 10 && currentState.selectedStoryId` is set
  - `verificationFiredRef` (round-scoped `useRef<Set<string>>`) prevents duplicate inserts on re-renders
  - `speakerId`/`listenerId` resolved by matching `checkerName` against `session.creatorName` → `creatorProfileId` / `joinerProfileId`
  - `versionId` fetched from `story_versions WHERE story_id = $storyId ORDER BY version_number DESC LIMIT 1`
  - Error is caught and logged; round completes regardless (non-blocking)
  - `verificationFiredRef.current.clear()` called at round reset (in `handleCelebrationComplete` and `handleSkip`)
  - `analytics.track('live_story_verified', ...)` fires on success
- [x] Complete

### Task 9: Wire onPositionSelect through props
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify), `src/app/components/partners/live-mode-view.tsx` (modify)
- **Spec refs:** "Technical Analysis > Implementation Approach > Files to Modify > #2 > handlePositionSelectInLive (lines ~867-868)", "Technical Analysis > Implementation Approach > Files to Modify > #1 > all IdleScreen render sites (lines ~859)"
- **Tests:** `e2e/p272-live-verification.spec.ts`
- **Depends on:** Task 3, Task 6
- **Verify:**
  - `handlePositionSelectInLive(pointId, position)` added to `clarity-live-page.tsx`; calls `pointsService.updatePosition` fire-and-forget
  - `onPositionSelect` threaded from `LiveModeViewProps` down to `LiveStoryCardExpanded` in all render sites (IdleScreen, RatingScreen, UnderstandingScreen)
  - Tapping a position button in the expanded story card saves the position without navigating away
- [x] Complete

**Total tasks:** 9 | **Can parallelize:** Tasks 1, 2, 3, 4, 5 (no shared dependencies — run all five in parallel) | **Must be sequential:** Tasks 2 + 3 + 5 → Task 6 → Task 7; Tasks 1 + 5 → Task 8; Task 6 → Task 9
