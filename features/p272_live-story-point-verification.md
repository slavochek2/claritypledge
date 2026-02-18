---
status: today
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
delivery_stage: ux-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-02-18
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

#### 1.3 Story Removal Flow (Speaker, Pre-Round)

1. While in the "story selected, pre-round" state, the speaker sees an X button in the top-right corner of the story card.
2. Tapping X removes the story from both screens immediately — no confirmation dialog. This is a low-stakes, reversible action (the speaker can re-select).
3. After removal, the picker search bar reappears below the action buttons, ready for a new search.
4. To replace (not just remove), the speaker types in the search bar again and selects a different story — the same flow as initial selection.

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
3. The speaker also has the X button on the story card for direct removal. The listener only has "Speak freely" — they did not select the story and cannot remove it independently.

#### 1.7 Multi-Round Flow

1. A round completes (gap revealed, explain-back done, or speak freely exit). Both participants tap "Continue" on the celebration/results screen.
2. Both return to `IdleScreen`. The story card from the previous round is NOT automatically carried forward. The picker is available again.
3. Speaker can search and select the same story again, or a different one, or start a round with no story.
4. Session history (`SessionHistoryList`) shows completed rounds with story titles.

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
  - X button in top-right corner of the card (speaker screen only; listener screen shows no X)
- Below story card: `ActionArea` with two buttons (unchanged, same labels)
- Below buttons: "Speak freely" text button (both screens)
- No search bar visible while a story is selected

#### Rating Phase — Story Visible

- Top: `LiveHeader`
- Below header: `StoryCardWithLinks` (same card, collapsed by default; expand toggle still works)
- Main area: `JourneyToUnderstanding` history card (if prior rounds exist)
- Bottom: `RatingCard` in a non-dismissible `Drawer` (unchanged; slides up from bottom)
- Story card is not hidden when drawer is open — it scrolls normally above the drawer handle area

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
- `SessionHistoryList` shows the completed round
- Story card is not pre-loaded — speaker must search and select again if desired

---

### 3. Story Picker Design

The picker is a search-first surface embedded in `IdleScreen`, below the two action buttons. It replaces the current `ContentPicker` component (which shows all items at once) for the story-only scenario.

#### Before Search (Empty State)

- A single search input is shown with a search icon on the left and placeholder text: "Search your stories…"
- Below the input, nothing else is shown. No story list, no scrollable grid. The field is empty and waiting.
- This is intentional: the speaker knows their stories and can search for the right one. Showing all stories at once creates noise and does not match the search-focused requirement.
- Exception: if the speaker has 1–2 stories in their library, show those stories immediately below the search input without requiring a search. At this quantity, scrolling a full list is not cognitively expensive.

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

#### Removing the Selected Story (Speaker)

The speaker sees an X button (using `lucide-react`'s `X` icon) in the top-right corner of the story card header row, rendered only on the speaker's screen.

- The X button is rendered inline in the card, to the right of the author avatar and story text, aligned with the top of the card content.
- Tapping X removes the story from both screens immediately. No confirmation dialog.
- Justification for no confirmation: removing a story before a round is low-stakes (no data written, no round in progress). Adding a dialog adds friction for a reversible action.
- The story card disappears on both screens simultaneously (via shared state update).
- The search bar reappears in its place on both screens — speaker can immediately search for a replacement.

#### Replacing the Selected Story

There is no separate "replace" affordance. Replacement is simply: remove (tap X) → search → select. Two taps at most.

- This keeps the interaction surface minimal and consistent with the search-first design.

#### Round Lock

Once either participant taps "Does [Partner] understand you?" or "Do you understand [Partner]?", the round begins. At this point:
- The X button disappears from the story card on both screens.
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

#### Real-Time Story Card Appearance (Listener Screen)

- When the story card appears on the listener's screen (pushed via real-time state update), announce to screen readers: "A story has been shared." This announcement uses `aria-live="polite"` on a region that wraps the story card area.
- The card itself is focusable. When it appears, focus does NOT jump to it automatically (the listener may be mid-action). The `aria-live` announcement is sufficient.

#### Story Picker — Search Input

- The search input has a visible label or a descriptive `aria-label`: "Search your stories."
- As results appear, announce the count using a live region: "3 stories found" (or "No results for [query]"). This uses `aria-live="polite"` on a results-status element.
- Each result row is a `<button>` element with the full story preview as its accessible name (not truncated — the `aria-label` carries the full text, the visible text is truncated).

#### Story Picker — Keyboard Navigation

- Tab moves focus into the search input.
- Typing filters results.
- Arrow Down from the search input moves focus to the first result row.
- Arrow Up / Arrow Down navigate between result rows.
- Enter or Space selects the focused result.
- Escape collapses the result list and returns focus to the search input.

#### Story Card Expand Toggle

- The expand button (chevron) has `aria-expanded` set to `true`/`false` and `aria-label`: "Expand linked points" / "Collapse linked points."
- When points expand, the newly visible content is announced via `aria-live="polite"` if the point count is non-zero. For empty state, announce "No points linked to this story."

#### X Button (Remove Story)

- The X button on the story card has `aria-label`: "Remove selected story."
- After tapping, the live region for the story card area announces "Story removed." using `aria-live="polite"`.

#### Round State Changes

- When a round begins (buttons become disabled, drawer slides up), the `Drawer` component's `DrawerTitle` (currently `sr-only`) provides the screen reader context for the rating phase.
- Existing `aria-live` patterns in `RatingCard` and `JourneyToUnderstanding` are unchanged.

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

**Story removal X button on mobile:**
- Minimum tap target: 44×44px (Apple HIG / WCAG). The X button is a `<button>` with padding to meet this minimum.

#### Larger Screens (Tablet / Desktop)

- The existing `max-w-sm` container constrains all /live content. This constraint applies to the story card as well. No full-width expansion on desktop.
- All layouts remain single-column.
