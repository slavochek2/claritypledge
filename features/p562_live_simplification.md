---
status: today
type: story
rank: 0.195
tags:
  - epic-story-first
  - live
  - simplification
flow: dev
created_date: 2026-03-21T00:00:00.000Z
locked_at: '2026-03-23T10:08:26.692Z'
delivery_stage: 3.5-ui-review
reviews:
  ux: null
  architect: null
  alignment: null
uat_file: features/uat/p562.md
test_files:
  - e2e/p562-free-mode.spec.ts
  - e2e/integration/p562-free-mode-state.spec.ts
  - e2e/p562-smoke.spec.ts
  - src/tests/free-mode-phases.test.ts
---

# P562: /live Free Mode — Structured Start, Then Continuous Sliders

**Epic:** story-first (P523 vision)
**Priority:** 3 of 6 — responds to "too clunky, too interruptive" feedback
**Supersedes:** Original P562 "strip to orchestration" framing
**Related:** P581 (Letters — async assessment), P570 (mini-/live — async-to-sync bridge)

---

## Problem Statement

**Current state:** /live uses a rigid 3-click turn-based protocol. Speaker speaks → listener taps "Did you understand?" → both rate 0-10 (sealed bid) → results reveal → accept or retry. Then switch roles. The protocol is ~2,400 lines of state machine code with 6+ phases (idle → rating → waiting → revealed → explain-back → celebration).

**Pain points:**

1. **Protocol interrupts the conversation it's meant to improve.** Jb (session participant): "I don't feel like this is a conversation. How do I feel like this is a conversation between me and you?" The structured clicks break conversational flow.

2. **Social pressure produces false positives.** Blanka: "Can we just discuss it and just go into the app and put already 10?" The ceremonial rating creates pressure to agree rather than honestly assess.

3. **Protocol requires facilitation to work.** 28 transcripts analyzed: role confusion in ~70% of first-time sessions, surface paraphrase in ~60%, premature agreement in ~30%. Self-serve pairs default to "yeah I get it." The founder stopped using /live in facilitated sessions (Mar 10 session script: "Don't: /live").

4. **No continuous comprehension signal.** Current /live only captures understanding at discrete checkpoints (after the explain-back). The listener has no way to continuously signal "I follow you" or "I'm losing you" during natural speech. This is the signal the product actually needs — not post-hoc ratings.

5. **Two interaction modes create confusion.** Current /live offers "with story" (agenda-based) and "without story" (freeform) modes. Without story, there's no way to derive who is speaker and who is listener, creating role ambiguity from the start.

**Who's affected:** All /live users — co-founder pairs practicing calibrated communication. Currently the core (and only) product interaction surface.

---

## Intention (Why This Matters)

**Strategic importance:** /live is the only synchronous interaction surface. If it feels clunky, the entire product feels clunky. The gap between "workshop demo" and "product people return to" lives in whether /live feels like a natural conversation tool or a bureaucratic protocol. From transcript analysis: "The distance between 'oh, interesting' and 'holy shit' is the distance between a workshop demo and a paying customer."

**Why now:** P581 (Letters) introduces the async assessment path. P562 must exist alongside it — Letters handles deep async reflection, /live handles real-time conversation support. Without P562, pairs who meet synchronously have no fluid tool to use. Building P562 now creates the complete sync + async comprehension picture.

**Impact if not solved:** /live continues to be avoided even by the founder in facilitated sessions. The product has no fluid synchronous experience. Pairs who want real-time feedback are stuck with the ceremony or abandon the app entirely.

**Key insight driving the design:** "The explain-back is the product, not the score" (transcript analysis, Mar 2026). The moment of articulation is where gaps surface — not the numerical rating. The dual sliders make the calibration gap visible continuously (speaker's assessment vs listener's self-assessment). When a gap appears, the explain-back is available as a tool — but the sliders ARE the primary interaction, not the explain-back ceremony. Paraphrasing is one way to move sliders toward 10. Talking, clarifying, asking questions are others.

---

## Business Requirements

**Design assumption:** Users entering free mode have already practiced structured turn-taking (Level 1 / guided mode). They understand explain-back, paraphrasing, and the calibration protocol. Free mode gives them the same structured start with a continuous finish.

**Must-haves:**

1. **Mode selection on entry.** A pill toggle on the entry screen: "Free mode" (new) / "Guided mode" (current /live). Both modes share the same session — the toggle switches the interaction style, not the session. Selected mode highlighted in blue.

2. **Single entry button: Speak.** One button: "Does [partner] understand you?" No "Listen" button — if the listener wants to check their own understanding, they do it verbally (no app support needed; this is the easy action). Story selection via "Select your story" link below. When a story is selected, the story card appears above the button and only the story owner sees it. Both see "Speak freely" to deselect. Without a story, either person can tap Speak — whoever taps first is the speaker, the other becomes the listener automatically.

3. **Structured start: sealed-bid with slider.** After role claim, a drawer slides up with the question "How well do you believe [partner] understands your intention?" (speaker) or "How well do you believe you understand [partner]'s intention?" (listener). Scale: 0 ("Not at all") to 10 ("Complete cognitive understanding"). Input is a **slider** (not 0-10 buttons). Both submit sealed — neither sees the other's number until both submit.

4. **Reveal and paraphrase.** After both sealed bids are in, numbers are revealed in the Journey to Understand component (same dot-bar format as guided mode, numbered 0, 1, 2...). Gap badge shown (e.g., "3 points gap"). The listener is automatically prompted to paraphrase — they see "Paraphrase what you understood back to [partner]" with an "I paraphrased" button. The speaker sees "Waiting for [partner] to paraphrase..." The paraphrase happens verbally, face to face.

5. **Sliders unlock after paraphrase.** When the listener clicks "I paraphrased", sliders unlock for both participants. From this point: both can freely move their slider at any time. The drawer stays visible with the question and slider — this is the primary interaction surface. Partner's number is visible in the Journey component (updates live). No separate partner slider on screen.

6. **Journey captures rounds + live.** The Journey to Understand component shows: committed round numbers (0, 1, 2...) with dot-bars for both confidence and belief, plus a live-updating row showing current slider positions. Gap badge is shown only during reveal (before paraphrase), not in unlocked mode.

7. **"Speak freely" exits the round.** Available in the drawer at all times. Tapping it returns to the role claim screen — the session continues but the current round ends. Either person can claim a new role, pick a new story, or the same person can speak again.

8. **Mode switching.** The pill toggle is visible on the entry screen. Once inside a round, no mode toggle is shown — the interaction is committed. "Speak freely" exits to the entry screen where the toggle is available again.

**Success conditions:**

- Free mode starts identically to guided mode — same buttons, same sealed-bid, same reveal
- After one paraphrase round, friction drops to zero — continuous slider updates
- Partner's assessment visible in Journey component, not as a separate slider
- The full flow is: entry → sealed bid → reveal → paraphrase → sliders unlock → speak freely → repeat

**Constraints:**

- Current /live (guided mode) remains the default for new/learning pairs
- Entry screen, story cards, and journey component reuse existing production components
- Recording start/stop preserved
- Must work on mobile (phones on table during face-to-face conversation)
- Existing session history remains viewable

**Hypothesis connection:** Reducing /live friction directly enables H-PairsReturn (pairs won't return to a clunky tool) and supports H-WTP-Pain testing (smoother /live improves workshop demonstrations where pain is surfaced).

---

## User Stories

**As a speaker in free mode:**
- I want the same entry as guided mode (sealed bid), so the start is familiar and produces a calibrated benchmark
- I want to see my partner's confidence in the Journey after reveal, so I know the gap before they paraphrase
- I want my slider to unlock after the paraphrase, so I can continuously update my belief without clicking Submit each time

**As a listener in free mode:**
- I want to submit my initial confidence sealed, so neither of us anchors on the other's number
- I want to click "I paraphrased" after explaining back, so the flow advances without waiting for the speaker to confirm
- I want to move my slider freely after the paraphrase, so I can signal my evolving understanding

**As a pair switching between modes:**
- I want to see Free mode / Guided mode on the entry screen, so I can pick the right level for this conversation
- I want "Speak freely" to return to the entry screen (not end the session), so we can start a new round in either mode

---

## Jobs to Be Done

**When having a live conversation about something important:**
- I want one structured round (sealed bid + paraphrase) to establish a benchmark, then freedom to update continuously (motivation: structured start, fluid finish)

**When the first paraphrase wasn't enough:**
- I want to keep adjusting my slider as the conversation continues, so the signal reflects my evolving understanding (motivation: continuous feedback without ceremony)

**When we want to discuss a different story:**
- I want to exit this round ("Speak freely") and pick a new story on the entry screen, so we can cycle through topics in one session (motivation: multi-story sessions)

---

## Outcomes (Success Metrics)

**Interaction friction:**
- After first paraphrase: zero clicks to update comprehension signal (just slide)
- Same number of clicks as guided mode for the initial round (sealed bid + submit)

**Signal richness:**
- Session history captures: sealed-bid round (committed) + continuous slider updates (live)
- Journey component shows numbered rounds with dot-bars + live row

**Protocol usage:**
- Measure: % of sessions where slider is moved post-unlock (indicates pairs use the continuous feature)
- Measure: average number of rounds before "Speak freely" (indicates how many topics per session)
- Founder resumes using /live in facilitated sessions

---

## Acceptance Criteria

**Entry:**
- [ ] Mode pill toggle visible: "Free mode" / "Guided mode", selected in blue
- [ ] Single button: "Does [partner] understand you?" — no Listen button
- [ ] Without story: either person can tap Speak (first to tap = speaker)
- [ ] With story: only story owner sees the button
- [ ] Story selection: "Select your story" link, search input, story card with author info
- [ ] Story selected: only story owner sees Speak button, both see "Speak freely"

**Sealed bid:**
- [ ] Drawer slides up with question: "How well do you believe [partner] understands your intention?" (speaker) / "How well do you believe you understand [partner]'s intention?" (listener)
- [ ] Scale: 0 ("Not at all") to 10 ("Complete cognitive understanding")
- [ ] Input: slider starting at 0, with number displayed (e.g. "7/10")
- [ ] Submit button seals the bid — partner cannot see until both submit
- [ ] "Speak freely" available below Submit to exit without completing

**Reveal + paraphrase:**
- [ ] Both numbers revealed in Journey to Understand (dot-bar format, numbered)
- [ ] Gap badge shown (e.g., "3 points gap")
- [ ] Listener sees: "Paraphrase what you understood" + "I paraphrased" button
- [ ] Speaker sees: "Waiting for [partner] to paraphrase..."
- [ ] Listener clicking "I paraphrased" unlocks sliders for both

**Unlocked sliders:**
- [ ] Drawer shows same question + slider — now freely movable
- [ ] Number updates in real-time (e.g., "7/10")
- [ ] Partner's number visible in Journey component (live-updating row)
- [ ] No partner slider on screen — only the Journey shows their number
- [ ] No gap badge in unlocked mode
- [ ] "Speak freely" exits round → returns to entry screen

**Session management:**
- [ ] Recording start/stop works as before
- [ ] Works on mobile browsers (primary co-located use case)
- [ ] Pull-to-refresh does not kick users out of session

**History and compatibility:**
- [ ] Journey shows rounds numbered 0, 1, 2... with dot-bars
- [ ] Journey shows live-updating row for current slider positions
- [ ] Existing session history from guided mode remains accessible
- [ ] Guided mode remains available via toggle

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Mode toggle | "Free mode" / "Guided mode" pill, selected in blue (`bg-blue-500 text-white`) | Entry screen only |
| Slider range | 0–10 | Same as guided mode |
| Slider default | 0 | Starts at left edge |
| Slider question (speaker) | "How well do you believe [partner] understands your intention?" | In drawer |
| Slider question (listener) | "How well do you believe you understand [partner]'s intention?" | In drawer |
| Scale labels | "Not at all" (left) / "Complete cognitive understanding" (right) | Below question, above slider |
| Speak freely | Text link in drawer, extra spacing below slider (mt-8) to avoid accidental taps | Same behavior as current /live |
| Journey format | Numbered 0, 1, 2... with dot-bars (●●●●●○○○○○) | Reuse existing JourneyToUnderstanding component |
| Story card | Blue left-border card with avatar, name, text preview, points count | Reuse existing LiveStoryCardExpanded |
| Gap badge | "N points gap" in blue pill | Only during reveal phase, not in unlocked mode |

---

## Out of Scope

- Async comprehension assessment (P581 Letters)
- Async-to-sync bridge (P570 mini-/live)
- Transcription pipeline changes (P546/P552)
- AI-facilitated prompts or suggestions during /live
- Automatic structured turn triggers (e.g., "slider below 3 for 30 seconds → auto-prompt")
- Removing guided mode entirely (it stays as Level 1)
- Pendulum/arc gauge visualization (explored in prototype, rejected for simplicity)

---

---

## UX Design

Reference prototype: `/tree/new-live` (worktree w2, `src/app/pages/prototypes/new-live-prototype.tsx`).

The prototype covers the speaker-side UX completely. This section fills three gaps: (1) what the listener sees at every phase, (2) both screens side by side, and (3) edge cases.

---

### Phase 1: Entry (Idle)

**Speaker sees:**
- Story card (if selected) with author info, text preview, point count
- "Does **[partner]** understand you?" button (blue, full-width) — visible only if no story is selected OR user owns the selected story
- "Select your story" link (when no story selected)
- "Speak freely" link (when story selected) to deselect
- Mode pill toggle at bottom: "Free mode" / "Guided mode"

**Listener sees:**
- Identical screen to speaker. Both users see the same entry screen.
- If a story is selected and the listener does NOT own it, the Speak button is hidden. They see only the story card and "Speak freely."
- If no story is selected, both see the Speak button — whoever taps first becomes the speaker.

**Transition:** Either user taps "Does [partner] understand you?" The tapper becomes the speaker; the other becomes the listener automatically. A Realtime broadcast notifies the partner's device to advance to Phase 2.

---

### Phase 2: Speaker Taps "Does [partner] understand you?"

**Speaker sees:**
- Drawer slides up from bottom with permanent shadow (`shadow-[0_-4px_12px_rgba(0,0,0,0.05)]`, rounded-t-2xl)
- Question: "How well do you believe **[partner]** understands your intention?"
- Scale labels: "Not at all" (left) / "Complete cognitive understanding" (right)
- Slider starting at 0, number display (e.g., "0/10")
- Submit button (blue, full-width)
- "Speak freely" link below Submit (mt-8 spacing to prevent accidental taps)
- Story card visible above the drawer (if a story was selected)

**Listener sees:**
- Drawer slides up simultaneously (triggered by Realtime broadcast of phase change)
- Question: "How well do you believe you understand **[partner]**'s intention?"
- Same slider (starting at 0), same scale labels, same Submit button
- "Speak freely" link below Submit
- Story card visible above the drawer (if a story was selected)

**Key detail:** Both get the drawer at the same time. The sealed bid is simultaneous, not sequential. The speaker's tap initiates the round; both immediately enter the sealed-bid phase.

**Transition:** Each user taps Submit independently. Their value is sealed (written to DB). Whichever submits first enters Phase 4 (waiting). When the second submits, both enter Phase 5 (reveal).

---

Phase 3 (Sealed Bid) = Phase 2 continued. Both deliberating. Neither sees the other's number — slider is local-only until Submit. Whoever submits first enters Phase 4.

---

### Phase 4: Waiting (One Submitted, Other Hasn't)

**User who submitted sees:**
- Drawer content replaced with centered text: "Waiting for **[partner]** to submit..."
- Below: "Your answer: N/10" (small, muted) — confirmation of what they sealed
- No slider visible. No way to change the sealed bid.
- No "Speak freely" link during waiting — the round is committed.

**User who hasn't submitted sees:**
- No change from Phase 3. They still see their slider, question, and Submit button.
- No indication that the partner has already submitted (to prevent anchoring pressure — if the listener saw "partner submitted", they might rush).

**Transition:** Second user taps Submit. Both sealed bids are now in the DB. Both advance to Phase 5 (reveal).

---

### Phase 5: Reveal

**Speaker sees:**
- Journey to Understand component appears above the drawer, containing:
  - Title: "[partner]'s journey to **understand you**"
  - Row: "[partner]'s confidence" with dot-bar + number (listener's sealed bid)
  - Row: "Your belief" (bold) with dot-bar + number (speaker's sealed bid)
- Gap badge below Journey (centered):
  - If gap > 1: blue pill "N points gap" + guidance text "Help [partner] understand you better."
  - If gap <= 1: green pill "Well calibrated!"
  - If both at 10: green pulsing "Both at 10"
- Drawer shows: "Initial guesses revealed" (centered, muted) — no interactive elements
- Story card below Journey (if selected)

**Listener sees:**
- Journey to Understand component appears above the drawer, containing:
  - Title: "Your journey to **understand [partner]**"
  - Row: "Your confidence" with dot-bar + number (listener's sealed bid)
  - Row: "[partner]'s belief" (bold) with dot-bar + number (speaker's sealed bid)
- Same gap badge as speaker (identical content, different pronoun framing)
- Drawer shows: "Initial guesses revealed" (centered, muted)

**Transition:** Auto-transition after 1.5 seconds. Both advance to Phase 6 (paraphrase). The delay gives both users time to read the numbers and gap before the action prompt appears.

---

### Phase 6: Paraphrase

**Speaker sees:**
- Journey component (same as reveal, numbers persist)
- Gap badge persists (same as reveal)
- Drawer content: "Waiting for **[partner]** to paraphrase..."
- Below: "Listen carefully to their explanation" (small, muted)
- No interactive elements for the speaker — they wait and listen verbally

**Listener sees:**
- Journey component (same as reveal, numbers persist)
- Gap badge persists (same as reveal)
- Drawer content: "Paraphrase what you understood back to **[partner]**" (centered, medium weight)
- "I paraphrased" button (blue, full-width)
- The paraphrase happens face-to-face, verbally. The button is a self-report gate, not a text input.

**Key detail:** Only the listener has an actionable button. The speaker's screen is passive — they listen. There is no speaker confirmation of paraphrase quality (that feedback happens through the unlocked slider values in Phase 7).

**Transition:** Listener taps "I paraphrased." Realtime broadcast triggers Phase 7 for both users. The sealed bid round is recorded as Round 0 in the Journey.

---

### Phase 7: Unlocked (Continuous Sliders)

**Speaker sees:**
- Journey component showing:
  - Committed round(s) numbered 0, 1, 2... with dot-bars
  - Live-updating row at bottom: "[partner]'s confidence" + "Your belief" — numbers update in real-time as either user moves their slider
- Drawer with:
  - Question: "How well do you believe **[partner]** understands your intention?"
  - Slider (starts at whatever their sealed bid was, freely movable)
  - Number display updates as they drag
  - "Speak freely" link (mt-8 spacing)
- No gap badge (gap badge is only during reveal/paraphrase, not in unlocked mode)
- Story card above Journey (if selected)

**Listener sees:**
- Journey component showing:
  - Same committed rounds with dot-bars
  - Live-updating row: "Your confidence" + "[partner]'s belief" — updates in real-time
- Drawer with:
  - Question: "How well do you believe you understand **[partner]**'s intention?"
  - Slider (starts at their sealed bid value, freely movable)
  - Number display updates as they drag
  - "Speak freely" link (mt-8 spacing)
- No gap badge

**Key detail:** Partner's number is ONLY visible in the Journey component (the live-updating row), never as a second slider in the drawer. Each user controls exactly one slider. The conversation continues face-to-face while both adjust their sliders to reflect evolving understanding.

**Both at 10 → auto-transition to success screen:** When both sliders reach 10 simultaneously, the session **automatically advances to the success screen** after a 2-second hold (both must stay at 10 for 2 seconds — prevents accidental triggers while sliding through). No "Complete" button needed — 10/10 IS the goal state. If either slider moves away from 10 during the 2-second hold, the timer resets.

**Transition to success:** Auto (both at 10 for 2s) → Phase 8a (success screen). Manual: "Speak freely" → Phase 8b (return to entry).

---

### Phase 8a: Success Screen (Free Mode)

**What makes this different from guided mode success:** Free mode captured continuous slider data — not just a single sealed-bid pair. The success screen reflects this richer signal.

**Both users see:**
- Journey to Understand component showing the full round history:
  - Round 0 (sealed bid): initial guesses with dot-bars
  - Final state: both at 10/10 with dot-bars
- Story card (if a story was discussed)
- Summary stats:
  - "Mutual understanding reached" (green, prominent)
  - Story title (if applicable)
  - Starting gap: N points (from sealed bid)
  - Final: 10/10 — Well calibrated
- Two actions:
  - "Discuss another story" (primary, blue) → returns to entry screen (Phase 1) with session continuing
  - "End session" (secondary, text) → ends the entire session, goes to session end screen

**Key difference from guided mode celebration:** No "Accept as understood" / "Try again" decision. In free mode, 10/10 IS the mutual confirmation — both participants independently moved to 10. The app doesn't ask "do you accept?" because the slider positions already answer that.

**Session history records:** The round is saved with: sealed-bid values (Round 0), final values (10/10), timestamp of mutual-10 moment, story ID (if any). The continuous slider trajectory between sealed bid and 10/10 is captured as timestamped events for the session timeline view.

---

### Phase 8b: Speak Freely (Return to Entry)

**Speaker sees:**
- Entry screen (Phase 1). The round is over. Journey data from the completed round persists in the session but is not shown on the entry screen.
- Mode pill toggle visible again at bottom.
- Can pick a new story, start a new round, or switch modes.

**Listener sees:**
- Same entry screen. Roles are reset — either person can now claim the speaker role.

**Transition:** Back to Phase 1. A new round starts fresh with Phase 2 when someone taps the Speak button.

---

### Edge Cases

**Partner disconnects during sealed bid (Phase 3/4):**
- Reuse existing grace period pattern (120s countdown via `ReconnectingCountdown` component).
- If the disconnected user had already submitted their sealed bid, it remains sealed in the DB. When they reconnect, they rejoin at Phase 4 (waiting) or Phase 5 (reveal) depending on whether the other also submitted.
- If the disconnected user had NOT submitted, their partial slider position is lost (it was local state). On reconnect, they return to Phase 3 with slider at 0.
- If grace period expires: session enters partner-left state. The remaining user sees the `PartnerLeftScreen`. The round's sealed bid data is preserved in session history but marked incomplete.

**Browser reload mid-phase:**
- *Sealed bid (Phase 3):* User returns to Phase 3 with slider at 0. Their previous sealed bid was not submitted, so no data is lost. If they HAD submitted (Phase 4), their sealed value is in the DB; they rejoin at waiting.
- *Paraphrase (Phase 6):* Phase state is stored in liveState (Realtime). On reload, the user re-reads liveState and renders the correct phase. Speaker still sees "Waiting for paraphrase." Listener still sees the "I paraphrased" button.
- *Unlocked (Phase 7):* Phase state re-reads from liveState. Slider resets to the user's last-broadcast value (stored in liveState, not local). The Journey rebuilds from committed rounds in the DB. Minor gap: any slider drag that hadn't been broadcast yet is lost (sub-second window).

**No one taps Speak for extended time:**
- Entry screen stays idle. No timeout. The session remains active (same as current /live — session stays open until explicitly ended via "End Session" in the header).
- Recording pauses during idle if no audio is detected (existing behavior).

**Partner leaves during paraphrase (listener leaves before clicking "I paraphrased"):**
- Grace period starts (120s countdown). Speaker sees `ReconnectingCountdown`.
- If listener reconnects within grace period: they return to Phase 6. The "I paraphrased" button is still available. The verbal paraphrase was interrupted — they decide whether to paraphrase again or click "I paraphrased" anyway.
- If grace period expires: session enters partner-left state. The sealed bid round data is preserved but the round is marked incomplete (no unlock happened).

**Both at 10 in unlocked mode (Phase 7):**
- When both sliders hit 10, a 2-second hold timer starts. Green pulsing "Both at 10" celebration text appears in the Journey area.
- If both stay at 10 for 2 seconds: auto-transition to success screen (Phase 8a). No button needed.
- If either slider moves away from 10 during the 2-second hold: timer resets, celebration disappears, sliders continue as normal.
- Users can also tap "Speak freely" at any time to exit the round without reaching 10/10.

**Story deselected mid-round via "Speak freely":**
- "Speak freely" exits the current round entirely. Available in: sealed bid (Phase 3), paraphrase (Phase 6), unlocked (Phase 7). NOT available in: waiting (Phase 4 — round is committed), reveal (Phase 5 — auto-transitions).
- If tapped during sealed bid (Phase 3): local slider state is discarded. No sealed bid was recorded. Return to entry screen.
- If tapped during paraphrase (Phase 6) or unlocked (Phase 7): the committed round data (sealed bids) remains in session history. The live slider values at exit are NOT recorded as a separate round. Both return to entry screen.
- The story deselection and round exit are one atomic action — "Speak freely" always means "end this round, go back to entry."

---

### Guided Mode: Entry Screen Changes

Listen button removed from both modes (AD-7). Single "Does [partner] understand you?" button. Mode pill shows "Guided mode" selected. Guided flow (0-10 buttons, accept/retry) unchanged once speaker taps.

---

### Summary: Screen State by Phase

| Phase | Speaker Drawer | Listener Drawer | Journey | Gap Badge |
|-------|---------------|-----------------|---------|-----------|
| 1. Entry | (no drawer) | (no drawer) | (hidden) | No |
| 2-3. Sealed Bid | Slider + Submit + "Speak freely" | Slider + Submit + "Speak freely" | (hidden) | No |
| 4. Waiting (I submitted) | "Waiting for [partner]..." | (still in Phase 3) | (hidden) | No |
| 5. Reveal | "Initial guesses revealed" | "Initial guesses revealed" | Sealed bids shown | Yes |
| 6. Paraphrase | "Waiting for paraphrase..." | "I paraphrased" button | Sealed bids shown | Yes |
| 7. Unlocked | Slider + "Speak freely" | Slider + "Speak freely" | Rounds + live row | No |
| 8a. Success (10/10) | Journey + summary + "Discuss another" / "End session" | Same | Full round history | No |
| 8b. Speak freely | (returns to Phase 1) | (returns to Phase 1) | (hidden) | No |

## Technical Architecture

### Technical Analysis

**Current state machine:** `LiveSessionState` in `src/app/types/index.ts` defines `RatingPhase = 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results'`. The guided mode state machine is ~2,400 lines across `clarity-live-page.tsx` (session management, rating submission, round lifecycle) and `live-mode-view.tsx` (rendering per phase). All state syncs via `clarity_sessions.live_state` JSONB column through Supabase Realtime (`subscribeToClaritySession`) with 1s polling fallback.

**Realtime sync mechanism:** Two write paths exist — `updateClaritySessionLiveState` (full overwrite for story fields/clears) and `patchClaritySessionLiveState` (JSONB `||` merge via `patch_live_state` RPC for ratings, phases, booleans). The `shouldUseFullOverwrite` function routes writes. JSONB merge is critical for concurrent writes (both users writing simultaneously).

**Sealed-bid protocol:** `checkerSubmitted`/`responderSubmitted` booleans gate visibility. `checkerRating`/`responderRating` are written to `live_state` on Submit. Neither rating is shown to the partner until both booleans are `true`. The `ratingPhase` transitions: `idle` -> `waiting` (first submit) -> `revealed` (second submit). Role determination uses `checkerIsCreator` boolean (not name comparison, per P525 fix for name collision).

**Calibration storage:** `story_verifications` table stores completed rounds — `speaker_id`, `listener_id`, `speaker_rating`, `listener_rating`, `accuracy_achieved` (generated: `speaker_rating >= 8`). P413 made `story_id`/`version_id` nullable for freeform rounds. `writeVerification` fires on both-submitted in `clarity-live-page.tsx`.

**JourneyToUnderstanding:** Component in `live-mode-view.tsx:1746` — takes `checkerRating`, `responderRating`, `explainBackRatings[]`, `isChecker`, `displayPartnerName`, `hideUntilBothSubmitted`. Shows dot-bar displays with sealed-bid visibility logic. Currently shows a single round at a time — no multi-round history in the component itself (session history is separate).

**Key dependencies:** `Drawer` component (shadcn/ui), `LiveStoryCardExpanded`, `StorySearchPicker`, `ReconnectingCountdown`, `SessionEventsCollector`, `useAudioRecorder`, `useLiveSession` context.

---

### Architecture Decisions

**AD-1: Free mode as parallel phase type, not a fork of guided mode.**

Free mode introduces a new type `FreePhase = 'sealed-bid' | 'waiting' | 'reveal' | 'paraphrase' | 'unlocked'` that runs alongside the existing `RatingPhase`. The session's mode (`'guided' | 'free'`) determines which phase type drives the UI. This avoids modifying guided mode's battle-tested state machine.

Add to `LiveSessionState`:
```typescript
sessionMode?: 'guided' | 'free';  // undefined = guided (backward compat)
freePhase?: FreePhase;             // only meaningful when sessionMode === 'free'
freeSliderCreator?: number;  // creator's live slider position (0-10), top-level to avoid JSONB shallow merge clobber
freeSliderJoiner?: number;   // joiner's live slider position (0-10), top-level for same reason
```

`freePhase` is written via JSONB patch (concurrent-safe). Creator/joiner keys avoid name collision (P525 pattern).

**AD-2: Slider events in `live_state` during round, committed to `story_verifications` on end.**

No new table. Live slider positions in `freeSliderCreator`/`freeSliderJoiner` for real-time sync. On round end, final values → `story_verifications` as `speaker_rating`/`listener_rating`. Sealed-bid initial values also written as Round 0. Slider trajectory not stored (Mixpanel analytics only).

**AD-3: Debounced Realtime writes for unlocked slider.**

In unlocked mode, slider `onChange` fires on every pixel of drag. Writes to `live_state.freeSliderCreator / freeSliderJoiner` must be debounced: 300ms after last drag event. Use `patchClaritySessionLiveState` (JSONB merge) so each user writes their own key without clobbering the partner's.

Client-side: `useRef` + `setTimeout` for debounce. On unmount/disconnect, flush the pending value immediately.

**AD-4: 2-second 10/10 hold timer is client-side with Realtime confirmation.**

Each client independently tracks `bothAtTenSince` timestamp. When `live_state.freeSliderCreator / freeSliderJoiner` shows both at 10, start a 2s timer. If either moves away, reset. When the timer fires, the client that detects it writes `freePhase: 'success'` to `live_state`. The other client sees the phase change via Realtime and transitions. Race condition: if both write simultaneously, JSONB merge is idempotent (both write the same value `'success'`).

**AD-5: Reuse JourneyToUnderstanding with extensions, don't fork.**

Add optional props to `JourneyToUnderstanding`:
- `rounds?: RoundRecord[]` — committed round history (numbered 0, 1, 2...)
- `liveValues?: { listenerConfidence: number; speakerBelief: number }` — live-updating row (only in unlocked phase)
- `showGapBadge?: boolean` — controls gap badge visibility (true during reveal/paraphrase, false in unlocked)

When `rounds` is provided, the component renders numbered rows. When `liveValues` is provided, it appends a borderless live-updating row. Existing guided-mode usage (no `rounds`, no `liveValues`) is unchanged.

**AD-6: Mode toggle is a session-level property, set before round starts.**

`sessionMode` is written to `live_state` on the entry screen via full overwrite (since it's set alongside story selection). Once a round starts (`freePhase !== undefined` or `ratingPhase !== 'idle'`), the mode toggle is hidden. "Speak freely" resets to idle, making the toggle visible again.

**AD-7: Entry screen changes apply to BOTH modes.**

The Listen button removal and single "Does [partner] understand you?" button apply to both free and guided mode entry screens. This is a simplification of the shared entry UI, not a mode-specific change. Implement in `IdleScreen` component.

**AD-8: Round lifecycle for free mode.**

```
Entry (idle) → sealed-bid → waiting → reveal → paraphrase → unlocked → success/exit
                                                                          ↓
                                                                     back to idle
```

On round end, write to `sessionHistory[]` in `live_state` (same as guided mode) AND `story_verifications` table. The `SessionHistoryItem` type already supports this — `type: 'free'` or `type: 'story'` with the mode field.

---

### Security Review

**RLS Policies:**
- ⚠️ **Pre-existing: Sealed-bid values readable before both submit.** `clarity_sessions` SELECT policy is `USING (true)`. First user's sealed bid in `live_state` JSONB is readable before second submits. Seal is client-enforced only. P562 inherits this. **Mitigation:** Accept as pre-existing risk. Track server-side sealed-bid isolation as hardening ticket.
- ⚠️ **Pre-existing: Session data globally readable.** P562 adds continuous slider data, widening exposure. **Mitigation:** Pre-existing debt. Track as hardening.
- ⚠️ **Pre-existing: `patch_live_state` has no caller authorization.** Any client can patch any session. **Mitigation:** UUIDs provide obscurity. Track participant check as hardening.
- ✅ `story_verifications` INSERT requires `auth.uid() IS NOT NULL`.

**Authentication:**
- ✅ Session creation restricted to verified users (P396).
- ⚠️ **Pre-existing: Session joining has no auth check.** P562 doesn't change this.
- ✅ `writeVerification` requires auth.

**Authorization:**
- ⚠️ **Pre-existing: Phase transitions client-driven, no server validation.** P562 adds more phases. **Mitigation:** Client-side state machine (same as guided mode). Server validation is hardening.
- ⚠️ **Pre-existing: Story ownership Speak button is client-only.** Acceptable — pair is face-to-face.

**Input Validation:**
- ⚠️ `live_state` JSONB accepts arbitrary values. **Mitigation:** Client validates 0-10. Server validation is hardening.
- ✅ Session mode CHECK constraint exists.

**Data Protection:**
- ✅ Continuous slider data is NOT PII.
- ✅ Sentry sanitization strips names/content.
- ✅ No new recording surfaces.

**Pre-existing debt (all inherited from guided mode):**

| Severity | Finding | P562 impact | Action |
|----------|---------|-------------|--------|
| HIGH | Sealed-bid client-only seal | Same pattern | Hardening ticket |
| HIGH | No participant-scoped SELECT | More data exposed | Hardening ticket |
| HIGH | No server state machine | More phases | Hardening ticket |
| MEDIUM | `patch_live_state` no caller check | More writes | Hardening ticket |

**Verdict:** No P562-specific security issues. All findings are pre-existing debt. Ship P562 with client-side enforcement (matching guided mode), track server-side hardening separately.

---

### Implementation Approach

#### Build Sequence

1. **Types + LiveSessionState extension** — Add `FreePhase`, `sessionMode`, `freePhase`, `freeSliderCreator`/`freeSliderJoiner` to `LiveSessionState` in `src/app/types/index.ts`. Update `DEFAULT_LIVE_STATE`. Update `sanitizeLiveStateForSentry` safe keys.

2. **Entry screen refactor (both modes)** — Modify `IdleScreen` in `live-mode-view.tsx`: remove Listen/"Did I get it?" button, add mode pill toggle, show single "Does [partner] understand you?" button. Wire `sessionMode` write to `live_state`.

3. **Free mode phase engine** — New component `FreeModeView` (parallel to the guided mode rendering in `LiveModeView`). Handles sealed-bid (reuse existing pattern), reveal (auto-transition 1.5s), paraphrase (listener-only "I paraphrased" button), unlocked (continuous slider), success (auto-transition on 2s hold at 10/10).

4. **Slider component** — Extract `SliderTrack` from the prototype into a production component. Add touch-action handling, debounced `live_state` writes, and accessibility (`role="slider"`, `aria-valuemin/max/now`).

5. **JourneyToUnderstanding extensions** — Add `rounds` and `liveValues` props. Render committed round history with numbered dot-bars, plus live-updating row. Hide gap badge when `showGapBadge === false`.

6. **Round lifecycle integration** — Wire round completion (both 10/10 auto-complete and "Speak freely" exit) into `writeVerification`, `sessionHistory`, and Mixpanel events. Handle edge cases: disconnect during sealed bid, browser reload mid-phase, "Speak freely" disabled during waiting phase (round committed).

7. **Success screen** — New component for free mode success (Phase 8a from UX spec). Shows journey summary, starting gap, "Discuss another story" / "End session" buttons.

8. **Analytics** — Debounced Mixpanel events: `live_slider_moved` (500ms debounce, includes value + role), `live_free_mode_round_completed` (final values, sealed-bid values, story ID, duration).

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/components/partners/free-mode-view.tsx` | Free mode phase rendering (sealed-bid through success) |
| `src/app/components/partners/slider-track.tsx` | Production slider component with debounced writes |
| `src/app/components/partners/free-mode-success.tsx` | Success screen for 10/10 completion |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/app/types/index.ts` | Add `FreePhase`, extend `LiveSessionState` with `sessionMode`, `freePhase`, `freeSliderCreator`/`freeSliderJoiner` |
| `src/app/components/partners/live-mode-view.tsx` | Route to `FreeModeView` when `sessionMode === 'free'`. Modify `IdleScreen`: remove Listen button, add mode pill. Extend `JourneyToUnderstanding` props. |
| `src/app/pages/clarity-live-page.tsx` | Add `sessionMode` to polling drift check fields. Add free mode round completion logic to `writeVerification` call site. Update `sanitizeLiveStateForSentry`. |
| `src/app/data/api.ts` | No changes needed — existing `patchClaritySessionLiveState` handles all free mode writes. |

## Component Strategy

### Classification Legend

- **Reuse** — use existing component as-is, no changes
- **Extend** — add optional props to existing component; existing callers unaffected
- **Extract** — move an existing inline component to its own file
- **New** — build from scratch (no existing equivalent)

---

### Entry Screen (Phase 1)

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| Mode pill toggle ("Free mode" / "Guided mode") | **New** | Prototype `ModePill` | Pill toggle with `bg-blue-500 text-white` selected state. No existing toggle matches this pattern (tab pills in `FilterTabs.tsx` are tab-style, not pill-toggle). Build as inline component in `live-mode-view.tsx` within `IdleScreen`. |
| "Does [partner] understand you?" button | **Reuse** | `IdleScreen` existing `onStartCheck` button | Already exists. Remove the companion "Did I get it?" / `onStartProve` button. Same blue full-width `Button`. |
| "Select your story" link | **Reuse** | `IdleScreen` existing story picker trigger | Already wired to `StorySearchPicker`. No changes. |
| Story search picker | **Reuse** | `StorySearchPicker` (`src/app/components/partners/story-search-picker.tsx`) | Existing component with search input + story list. No changes. |
| Story card | **Reuse** | `LiveStoryCardExpanded` (`src/app/components/partners/live-story-card-expanded.tsx`) | Blue left-border card with avatar, name, text preview, point count. Per UI Contract. No changes. |
| "Speak freely" link (deselect story) | **Reuse** | `IdleScreen` existing `onClearStory` link | Already wired. No changes. |
| Listen / "Did I get it?" button | **Remove** | `IdleScreen` `onStartProve` prop | Remove from both free and guided mode entry (AD-7). The `onStartProve` prop stays on `IdleScreenProps` for backward compat but the button is no longer rendered. |

---

### Sealed-Bid Drawer (Phases 2-4)

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| Bottom drawer container | **Reuse** | `Drawer`/`DrawerContent` from `src/components/ui/drawer.tsx` (shadcn) | Already used in guided mode for responder rating. Style per spec: `shadow-[0_-4px_12px_rgba(0,0,0,0.05)]`, `rounded-t-2xl`. |
| Slider (0-10) | **New** | Prototype `SliderTrack` | Custom slider with pointer-event tracking, `touch-action: none`, large 28px thumb, blue fill. The existing Radix `Slider` in `src/components/ui/slider.tsx` has a 16px thumb (too small for mobile primary input) and no label/value display. Build `SliderTrack` as `src/app/components/partners/slider-track.tsx` with: debounced `live_state` writes (300ms), `aria-valuemin/max/now`, `role="slider"`. NOT extending the Radix slider — the pointer-event-based interaction model from the prototype is better for this use case (continuous drag without snap). |
| Number display ("7/10") | **New** | Part of `SliderTrack` | Integrated into `SliderTrack` component — `text-xl font-light tabular-nums` right-aligned. |
| Scale labels ("Not at all" / "Complete cognitive understanding") | **New** | Part of sealed-bid drawer layout | Static text, inline in `FreeModeView`. Per UI Contract. |
| Submit button | **Reuse** | `Button` from `src/components/ui/button.tsx` | `bg-blue-500 hover:bg-blue-600`, full-width. Same as `RatingCard`'s Submit. |
| "Speak freely" link (exit round) | **Reuse** | Pattern from `WaitingIndicator.onSkip` + `RatingCard.onSkip` | Same ghost button pattern. `mt-8` spacing per UI Contract to prevent accidental taps. |
| Waiting state ("Waiting for [partner] to submit...") | **Reuse** | `WaitingIndicator` (line 2084 of `live-mode-view.tsx`) | Existing component with pulsing dot + message. Add "Your answer: N/10" as subtitle. No "Speak freely" during waiting per spec. |

---

### Reveal + Paraphrase (Phases 5-6)

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| Journey to Understand (sealed-bid display) | **Extend** | `JourneyToUnderstanding` (exported, line 1746) | Add 3 optional props per AD-5: `rounds?: RoundRecord[]`, `liveValues?: { listenerConfidence: number; speakerBelief: number }`, `showGapBadge?: boolean`. When `rounds` is provided, render numbered rows with `DotBar`. When `liveValues` is provided, render borderless live-updating row. Existing callers (no `rounds`/`liveValues`) render unchanged. |
| DotBar (filled/empty dots) | **Extract** | Prototype `DotBar` + existing `RatingDisplay` (line 3373) | `RatingDisplay` already renders a dot-bar pattern internally. Extract the dot rendering into a shared `DotBar` subcomponent within `live-mode-view.tsx` (not a separate file — it's a 7-line render helper). Used by both `JourneyToUnderstanding` (existing) and the new `rounds`/`liveValues` rows. |
| Gap badge ("N points gap") | **New** | Prototype gap banner | Blue pill: `text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1`. Green pill for gap <= 1: "Well calibrated!" Green pulsing for both-at-10. Inline in `FreeModeView` — controlled by `showGapBadge` phase logic. Only during reveal/paraphrase phases per UI Contract. |
| "Initial guesses revealed" text | **New** | Prototype reveal drawer | Static centered muted text in drawer. Inline in `FreeModeView`. |
| "Paraphrase what you understood" prompt | **New** | Prototype paraphrase drawer | Listener sees prompt + "I paraphrased" button. Speaker sees "Waiting for [partner] to paraphrase..." (reuse `WaitingIndicator`). Inline in `FreeModeView`. |
| "I paraphrased" button | **Reuse** | `Button` | Blue full-width. Same `Button` primitive. |

---

### Unlocked Sliders (Phase 7)

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| Continuous slider | **Reuse** | `SliderTrack` (same component as sealed-bid) | In unlocked phase: `onChange` writes debounced to `live_state.freeSliderCreator / freeSliderJoiner` via `patchClaritySessionLiveState`. Initial value = sealed-bid value, not 0. |
| Journey live-updating row | **Extend** | `JourneyToUnderstanding` with `liveValues` prop | Borderless row below committed rounds. Updates in real-time via Realtime subscription on `live_state.freeSliderCreator / freeSliderJoiner`. No gap badge (`showGapBadge: false`). |
| "Both at 10" celebration | **New** | Prototype `MutualTenCelebration` | Green pulsing text: `text-green-600 animate-pulse`. Appears in Journey area when both sliders at 10. Inline in `FreeModeView`. Triggers 2-second hold timer (AD-4). |
| "Speak freely" link (exit round) | **Reuse** | Same pattern as sealed-bid phase | `mt-8` spacing per UI Contract. |

---

### Success Screen (Phase 8a)

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| Free mode success screen | **New** | `src/app/components/partners/free-mode-success.tsx` | Shows: Journey component (full round history), story card (if any), summary stats ("Mutual understanding reached", starting gap, final 10/10). Two buttons: "Discuss another story" (primary blue), "End session" (secondary text). Distinct from guided mode's `RoundSummaryScreen` which has accept/retry logic. |
| Journey in success screen | **Reuse** | `JourneyToUnderstanding` with `rounds` prop | Shows Round 0 (sealed bid) + final 10/10 as committed rounds. No `liveValues` (sliders are done). |
| Story card in success | **Reuse** | `LiveStoryCardExpanded` | Same as entry screen. No changes. |
| "Discuss another story" button | **Reuse** | `Button` | Primary blue. Routes back to entry screen (Phase 1). |
| "End session" button | **Reuse** | `Button` variant="ghost" | Ends session, goes to session end screen. |

---

### Routing (FreeModeView container)

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| `FreeModeView` | **New** | `src/app/components/partners/free-mode-view.tsx` | Phase engine component — renders the correct drawer content and Journey state for each `FreePhase`. Receives same props as the guided-mode rendering path in `LiveModeView` (partner name, live state, callbacks). `live-mode-view.tsx` routes to this when `liveState.sessionMode === 'free'`. |
| Mode routing in `LiveModeView` | **Extend** | `live-mode-view.tsx` main render | Add conditional: when `sessionMode === 'free'` and not idle, render `<FreeModeView>` instead of guided-mode phases. |

---

### Component Count Summary

| Type | Count | Components |
|------|-------|-----------|
| **Reuse** | 9 | Button, Drawer, LiveStoryCardExpanded, StorySearchPicker, WaitingIndicator, IdleScreen (speak button), story link, clear story link, "I paraphrased" button |
| **Extend** | 2 | JourneyToUnderstanding (+rounds, +liveValues, +showGapBadge), LiveModeView (mode routing) |
| **Extract** | 1 | DotBar (from RatingDisplay internals) |
| **New** | 5 | FreeModeView, SliderTrack, ModePill, free-mode-success, gap badge |
| **Remove** | 1 | Listen/"Did I get it?" button from IdleScreen |

---

---

## Test Coverage Strategy

### Files Generated

| File | Type | Test Count | Purpose |
|------|------|-----------|---------|
| `e2e/p562-free-mode.spec.ts` | E2E (two-party) | 3 | Full free mode flow with two browser contexts: sealed bid, reveal, paraphrase, unlock, speak freely, 10/10 success |
| `e2e/integration/p562-free-mode-state.spec.ts` | Integration (DB) | 7 | Phase state machine validation: live_state JSONB structure, phase transitions, slider values, JSONB merge, 10/10 detection, round exit |
| `e2e/p562-smoke.spec.ts` | Smoke (single-party) | 5 | Entry screen loads, mode toggle visible, no Listen button, story link present, no console errors |
| `src/tests/free-mode-phases.test.ts` | Unit (Vitest) | 22 | Phase transition logic, "Speak freely" availability, sealed-bid isolation, 10/10 detection, 2-second hold timer, slider bounds |
| `features/uat/p562.md` | UAT (manual) | 13 | All 8 phases + edge cases (disconnect, reload, mobile touch) |

**Total: 50 automated tests + 13 UAT scenarios**

### What's Tested and Why

| Layer | What | Why |
|-------|------|-----|
| **Unit** | Phase transition validity (valid + invalid) | The phase state machine is the core logic — invalid transitions would break the entire flow. Pure functions, fast feedback. |
| **Unit** | 10/10 detection + 2-second hold timer | Auto-success is a novel interaction (no button). Timer edge cases (reset on slider move, restart) must be deterministic. |
| **Unit** | Sealed-bid isolation booleans | Preventing anchoring bias is a core product requirement. Logic must be verifiable without Realtime. |
| **Unit** | Slider value bounds (0-10) | Input validation — prevents corrupt data in live_state. |
| **Integration** | live_state JSONB structure | Validates that the DB accepts and returns the new free mode fields (sessionMode, freePhase, freeSliderCreator, freeSliderJoiner). Catches schema mismatches before E2E. |
| **Integration** | JSONB patch merge | Critical for concurrent writes — both users write slider values simultaneously. Verifies one user's write doesn't clobber the other. |
| **E2E** | Complete two-party flow | The only way to test Realtime synchronization between two browser contexts. Covers: drawer appearance on both sides, sealed-bid visibility, phase transitions via Realtime. |
| **E2E** | Sealed bid secrecy | Verifies the anti-anchoring requirement: listener does NOT see speaker's number before both submit. |
| **E2E** | 10/10 auto-success | Verifies keyboard-driven slider drag to max + 2-second hold + success screen transition. |
| **Smoke** | Entry screen regression | Fast check that mode toggle renders, Listen button is removed, no console errors. Catches deployment regressions. |
| **UAT** | Edge cases (disconnect, reload, mobile) | Manual verification required — these involve network conditions and touch interaction that automated tests can't fully replicate. |

### What's NOT Tested and Why

| Gap | Why Not Tested |
|-----|----------------|
| Slider debounce timing (300ms) | Implementation detail — testing the exact debounce interval is brittle and adds no value. The integration test verifies values reach the DB; the timing is a UX polish concern. |
| Mixpanel analytics events | Analytics are fire-and-forget. Testing them couples tests to a third-party SDK. Verified manually via Mixpanel Live View in UAT. |
| Guided mode regression | Guided mode is unchanged (AD-1: parallel phase type, not a fork). Existing guided mode E2E tests provide regression coverage. No new guided-mode tests needed. |
| Recording start/stop | Recording is orthogonal to free mode (AC: "works as before"). Existing recording tests cover this. |
| Mobile visual rendering | Visual QA requires real device or `/verify` with Chrome — not automatable in Playwright. Covered by UAT-13. |
| Session history display | History reading is an existing feature. Free mode writes to the same `story_verifications` table. No new read path to test. |
| Reveal auto-transition 1.5s timing | Client-side setTimeout — testing exact timing is brittle. E2E test verifies the paraphrase phase appears (which implicitly confirms the transition happened). |

### Test Pyramid

```
        /\
       /  \        UAT: 13 manual scenarios
      / UAT\       (edge cases, mobile, disconnect)
     /------\
    /  E2E   \     E2E: 8 tests (3 two-party + 5 smoke)
   /----------\    (Realtime sync, full flow, regression)
  / Integration\   Integration: 7 tests
 /--------------\  (DB state, JSONB merge, phase storage)
/     Unit       \ Unit: 22 tests
\________________/ (transitions, timer, detection, bounds)
```
