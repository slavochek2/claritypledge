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
delivery_stage: prd-review
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

- **"Speak freely" is the exit for both participants before a round begins.** When a story is on screen but no button has been clicked, either participant can press "Speak freely" to clear the story from both screens and proceed without it. This is the same pattern used to exit mid-round — consistent. The listener does not get an X to remove the story (they didn't select it); speak freely is their equivalent. The speaker gets speak freely too, alongside the ability to remove/replace the story card directly.

- **Story stays visible throughout the round — including the success screen.** Do not hide or collapse the story card during the rating phase, gap reveal, explain-back, or success screen (where both partners click continue). Participants should be able to refer to it and expand it at any point.

- **Point positions are not sealed — render as on profile.** When a participant expands the story card and sees linked points, they see the other person's existing position exactly as they would on a profile page (position visible before they stake their own). Sealed-bid applies to the 0–10 verification ratings only. Point positions are already public; hiding them in /live would be inconsistent with profiles and add complexity without proportionate benefit.

- **Position update is organic, not prompted.** After a round completes, do not show a special CTA like "update your position on linked points". The story card is already expandable — the listener expands it if they want to update. No modal, no push.

- **Round mechanics are locked.** Sealed-bid ratings (0–10), gap as raw numbers, in-app guided explain-back, speak freely exit. Do not redesign the rating flow itself.

- **Workshop and 1-on-1 are the same UX.** Workshop sessions enter via event rooms (P124). Once inside /live, the flow is identical. Do not create a separate workshop mode.

**Open for UX design:**

- **Story removal/replacement UX.** Speaker must be able to remove or replace the selected story before a round begins. Use common, minimalist patterns — UX agent decides the interaction.

- **Story picker design.** Must be search-focused and not show all stories at once. How the search/browse experience looks (instant filter, recent stories shown first, etc.) is for UX to design.

- **Explain-back round UX.** The round is in-app guided. What does "guided" look like — explicit steps, a timer, a prompt? UX agent decides.

- **Real-time sync indicators.** Each participant needs to know when to act vs wait. How this is communicated (spinner, "waiting for partner...", progress indicator) is for UX to design.


## Next Steps

This is a UI feature. Next skill: `/ux features/p272_live-story-point-verification.md`
