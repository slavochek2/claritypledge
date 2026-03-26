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

2. **Same entry as guided mode.** Role claim buttons: "Speak — Does [partner] understand you?" and "Listen — Do you understand [partner]?" Story selection via "Select your story" link below buttons. When a story is selected, the story card appears above the buttons and only the story owner sees the Speak button. Both see "Speak freely" to deselect.

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
- [ ] Same role claim buttons as guided mode: "Speak — Does [partner] understand you?" / "Listen — Do you understand [partner]?"
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

## Prototype

Interactive prototype at `/tree/new-live` (branch `prototype/p562-new-live`, worktree w2). Shows the complete flow with simulated partner responses. Design decisions validated through iterative prototyping on 2026-03-25/26.

---

## Challenge Log

**Challenge run:** 2026-03-25. Verdict: CHALLENGE → resolved via pushback + prototype iteration.
- BLOCK-1 (speaker visibility): Resolved — partner's number shown in Journey, not as separate slider.
- BLOCK-2 (data model): Deferred to /architect.
- BLOCK-3 (freeform roles): Resolved — same role claim as guided mode. Story owner = speaker.
- BLOCK-4 (migration): Resolved — mode toggle on entry screen. Guided mode unchanged.
- WARN-1 (hypothesis connection): Resolved — friction reduction enables H-PairsReturn and H-WTP-Pain.
- Key evolutions: dual visible sliders → single slider in drawer + Journey display. Always-on → structured start then unlock. No role claim → same role claim as guided.

---

## Next Steps

1. ~~Run `/challenge-prd`~~ ✅ Done (2026-03-25)
2. ~~Prototype~~ ✅ Done (2026-03-25/26) — `/tree/new-live`
3. Run `/architect` for technical architecture (slider events data model, Realtime, phase state machine)
4. Run `/generate-tests` for test automation
5. Run `/dev` for implementation
