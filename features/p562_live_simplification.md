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
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P562: /live Simplification — Continuous Sliders with Optional Structured Turns

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

**Design assumption:** Users entering this mode have already practiced structured turn-taking (Level 1). They understand explain-back, paraphrasing, and the calibration protocol. This mode is for pairs ready for fluid conversation with continuous feedback — not first-time users learning the protocol.

**Must-haves:**

1. **Dual continuous sliders.** Both participants have an always-visible slider they can move at any time during conversation. Each slider answers a different question depending on role:
   - **Speaker slider:** "How well do I think they understand me right now?" (outward assessment)
   - **Listener slider:** "How well do I think I understand them right now?" (self-assessment)
   Both sliders are visible to both participants. The gap between them IS the live calibration signal — the same construct as current /live's sealed-bid rating, but continuous. Goal state: both sliders at 10 = mutual comprehension confirmed.

2. **No explicit role assignment needed.** Because both participants always have active sliders, there is no need for a role-switching mechanism. In natural conversation, people shift between speaking and listening fluidly. Each person's slider reflects their current perspective — "am I being understood?" or "do I understand?" — and they move it as the conversation flows. When a story is on the agenda, the story owner's slider naturally means "how well do they understand MY story," but this is contextual, not enforced.

3. **Optional structured turn trigger.** Either participant can trigger a structured turn at any moment. This activates the familiar turn-taking protocol: explicit speaker/listener roles, explain-back request, sealed-bid rating. After the structured turn resolves, the session returns to free slider mode. This is the safety net for when continuous feedback isn't resolving a gap — not the default interaction.

4. **Optional paraphrase request.** Either participant can request the other to paraphrase ("explain back what you understood"). This is lighter than a full structured turn — it's a conversational prompt, not a protocol switch. The other person can respond verbally without the app enforcing a rating ceremony. If the pair wants the full protocol (sealed-bid rating, results reveal), they trigger a structured turn instead.

5. **Single mode, no selection screen.** There is one /live experience: dual sliders with optional structured turns. No "guided vs open" mode picker, no graduation logic. The structured turn button IS the teaching/safety fallback — always available, never forced.

6. **Session history captures slider signal.** All slider position changes from both participants are timestamped and stored in session history. This creates two comprehension trajectories over time — one per participant. The gap between trajectories shows where calibration diverged. Example: "Speaker thought they were understood (8/10) while listener felt lost (3/10) at minute 5 — gap of 5."

**Success conditions:**

- Pairs can have a natural conversation while /live provides continuous mutual feedback
- The "3-click interruption" pattern is eliminated as the default interaction
- Both participants see each other's comprehension signal in real-time
- Goal state (both at 10) is visible and shared — a destination, not a ceremony
- Structured turn-taking is available but not mandatory
- Session history shows dual comprehension trajectories over time

**Constraints:**

- Current /live (the full structured protocol) remains available as the Level 1 mode for new/learning pairs
- New sessions default to slider mode; pairs can switch to structured mode via the structured turn trigger
- Existing session history must remain viewable
- Recording start/stop must be preserved
- Must work on mobile (the primary use case for co-located pairs)

**Hypothesis connection:** Reducing /live friction directly enables H-PairsReturn (pairs won't return to a clunky tool) and supports H-WTP-Pain testing (smoother /live improves workshop demonstrations where pain is surfaced).

---

## User Stories

**As a participant in a /live session:**
- I want my own slider always visible so I can continuously signal my perspective — "how well I understand them" or "how well I think they understand me" — without interrupting the conversation
- I want to see my partner's slider in real-time, so I can see the gap between our assessments as it happens — not after a ceremonial reveal

**As a speaker sharing something important:**
- I want to see whether my partner thinks they understand me (their slider) AND signal whether I think they actually do (my slider), so both perspectives are visible simultaneously
- I want to request a paraphrase when I see a gap, so I can trigger an explain-back at the moment it matters — not on a timer

**As a participant who is struggling:**
- I want either of us to trigger a structured turn (full explain-back protocol), so we have the guided safety net when free sliders aren't resolving the gap
- I want to return to free slider mode after the structured turn completes, so we don't get stuck in the ceremonial protocol

**As a pair reviewing session history:**
- I want to see both comprehension trajectories over time (mine and theirs), so I can see where our assessments diverged and converged
- I want to see when structured turns were triggered and their outcomes, so I have a complete picture of the conversation

---

## Jobs to Be Done

**When having a live conversation about something important:**
- I want continuous comprehension feedback without conversation interruption, so I can focus on communicating — not on clicking buttons (motivation: natural conversation flow)

**When I notice my partner seems confused:**
- I want to trigger a structured explain-back at exactly that moment, so I can use the protocol when it's most useful — not on a fixed schedule (motivation: timely intervention)

**When things get difficult and we're talking past each other:**
- I want a fallback to clear roles and structured instructions, so we have a failure-safe protocol when free conversation breaks down (motivation: safety net for hard moments)

**When reviewing what happened in our conversation:**
- I want to see the comprehension signal trajectory alongside what was discussed, so I can identify patterns in where understanding breaks down (motivation: learning from the conversation)

---

## Outcomes (Success Metrics)

**Interaction friction:**
- Reduce mandatory clicks per comprehension signal from 3 (tap initiate → select rating → submit) to 1 (slide)
- No role-switching ceremony — both participants always have active sliders

**Signal richness:**
- Session history captures N slider data points per participant per session (vs current: 1 rating per round)
- Dual comprehension trajectories visible over session timeline — gap between them shows calibration divergence in real-time

**Protocol usage:**
- Structured turns triggered by choice, not by default — measure % of sessions that use structured turns vs slider-only
- Founder resumes using /live in facilitated sessions (qualitative: the "Don't: /live" instruction is removed from session scripts)

**Naturalness:**
- Session duration increases (pairs talk longer when not interrupted by ceremony)
- Post-session qualitative: "felt like a conversation" vs "felt like a protocol"

---

## Acceptance Criteria

**Dual sliders:**
- [ ] Both participants see their own slider, always visible during the session
- [ ] Both participants see their partner's slider position in real-time
- [ ] Speaker's slider answers "how well do I think they understand me?" (0-10)
- [ ] Listener's slider answers "how well do I think I understand them?" (0-10)
- [ ] Gap between the two sliders is visually apparent (the live calibration signal)
- [ ] Goal state: both sliders at 10 = mutual comprehension confirmed
- [ ] Slider position changes from both participants are recorded with timestamps in session history

**Optional structured interactions:**
- [ ] Either participant can request a paraphrase (conversational prompt, not a mode switch)
- [ ] Either participant can trigger a full structured turn (explain-back protocol with sealed-bid rating)
- [ ] After a structured turn completes, session returns to free slider mode

**Session management:**
- [ ] New sessions default to slider mode
- [ ] Recording start/stop works as before
- [ ] Works on mobile browsers (primary co-located use case)
- [ ] Pull-to-refresh does not kick users out of session (known mobile bug)

**History and compatibility:**
- [ ] Session history shows dual comprehension trajectories over time (one per participant)
- [ ] Session history shows when structured turns were triggered and their outcomes
- [ ] Existing session history from old /live protocol remains accessible
- [ ] Current /live structured mode remains available (Level 1 for new pairs)

---

## UI Contract

**Exact strings, colors, and measurements that downstream skills must reproduce verbatim.**

| Element | Value | Context |
|---------|-------|---------|
| Slider range | 0–10 | Matches P581 letter assessment scale |
| Slider default | TBD by /ux | Options: 5 (neutral), unset (no position until first touch), 10 (optimistic, drops on confusion) |
| Slider UI | Same component as P581 letter slider | Unless /ux agent proposes adaptation for real-time context |
| Slider labels | "How well do I think they understand me?" / "How well do I think I understand them?" | Contextual to which slider the user is moving |
| Structured turn trigger label | TBD by /ux | Working name: "structured turn" |
| Paraphrase request label | TBD by /ux | Either participant can trigger, appears on partner's screen |
| Both sliders visible | Yes | Both participants see both sliders at all times — mutual transparency |

---

## Open Questions for /ux

1. **Slider default position.** Start at 5 (neutral — but implies "half understanding" before anyone speaks)? Unset (no position until first touch)? 10 (optimistic, drops when confusion arises)?

2. **Dual slider layout.** How to show two sliders per screen without cluttering mobile UI? Stacked? Side-by-side? One prominent (yours) + one smaller (theirs)?

3. **Gap visualization.** How to make the gap between two sliders visually salient during conversation? Color coding? Numeric gap display? Visual connector?

4. **Structured turn trigger UI.** What does the button look like? Where does it live? How prominent — available but not distracting?

5. **Paraphrase request appearance.** When triggered, what does the partner see? Inline prompt? Gentle banner?

6. **Dual trajectory visualization in history.** Two overlapping lines? Split view? Annotated timeline with gap markers?

---

## Out of Scope

- Async comprehension assessment (P581 Letters)
- Async-to-sync bridge (P570 mini-/live)
- Transcription pipeline changes (P546/P552)
- AI-facilitated prompts or suggestions during /live
- Automatic structured turn triggers (e.g., "slider below 3 for 30 seconds → auto-prompt")
- Removing the current /live protocol entirely (it stays accessible for in-progress sessions)

---

## Challenge Log

**Challenge run:** 2026-03-25. Verdict: CHALLENGE → resolved via pushback.
- BLOCK-1 (speaker visibility): Resolved — both see both sliders. Mutual transparency IS the feature.
- BLOCK-2 (data model): Deferred to /architect — technical, not business.
- BLOCK-3 (freeform roles): Resolved — dual sliders eliminate role-switching. Both always active.
- BLOCK-4 (migration): Resolved — new sessions default to slider mode; structured mode remains as Level 1.
- WARN-1 (hypothesis connection): Resolved — friction reduction enables H-PairsReturn and H-WTP-Pain testing.
- Key evolution: single listener slider → dual sliders (speaker + listener), each answering a different question.

---

## Next Steps

1. ~~Run `/challenge-prd`~~ ✅ Done (2026-03-25)
2. Run `/ux features/p562_live_simplification.md` to design the interaction (dual slider layout, gap visualization, structured turn UI, history visualization)
3. Run `/architect` for technical architecture (including slider event data model, Realtime bandwidth)
4. Run `/generate-tests` for test automation
5. Run `/dev` for implementation
