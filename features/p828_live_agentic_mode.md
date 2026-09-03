---
status: backlog
type: story
rank: 61
created_date: '2026-04-29'
tags: [live, agentic, mode, ai-facilitator, comprehension, badge]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P828: /live Agentic Mode — AI as Facilitator

## Problem

**Situation:** /live has evolved through facilitation modes — guided (high scaffolding, facilitator structures every step) → open (parties self-direct, slider visible, facilitator coaches). Each step reduces human facilitation. Manual badge certification (P686) shipped on top of this; P685's propagation chain depends on /live as the verification primitive.

**Complication:** Open mode revealed a structural problem: **the facilitator is the friction**. Founder field observation — asking parties for slider updates breaks conversational rapport, so updates get skipped, and calibration measurement loses fidelity precisely *because* the human in the room interrupts. Compounding this, /live's per-session human time caps badging propagation speed (P685's chain bottlenecks on facilitator availability). Pure-AI replacement approaches (s2s voice agents) are expensive and unverified.

**Question:** Can /live evolve a third mode — **agentic** — where AI plays the facilitator role, removing both the rapport-friction and the scheduling-bottleneck while preserving the slider-driven calibration loop the previous modes established?

## Mode Heritage

| Mode | Facilitator | Slider behavior | Primary use |
|------|-------------|-----------------|-------------|
| Guided | Human structures every step | Set by facilitator on behalf of parties | First-time pairs, training |
| Open *(current)* | Human coaches; parties self-direct | Visible to both, parties update | Experienced pairs, onboarded users |
| **Agentic *(this spec)*** | **AI plays facilitator role; no human facilitator required** | **Reader updates own; AI sets its own based on comprehension assessment** | **Solo verification, async-friendly, scaling P685's chain** |

The throughline: **progressive autonomy**. Each mode reduces human facilitation while preserving the calibration loop. (Mode-naming convention should be reconciled with existing code in `partners/free-mode-view.tsx` / `live-mode-view.tsx` during /ux.)

## Appetite

High blast radius — extends /live, the verification primitive on which P685's badge chain depends. Medium reversibility — additive mode, can be feature-flagged off; guided and open modes unchanged. High decision density — five founder decisions encode the agent's facilitation philosophy, plus one new structural decision (sync vs async) that didn't exist in prior modes.

## Solution

Add a third mode to /live alongside guided and open. AI takes the facilitator role: drives paraphrase rounds, asks for slider updates, sets its own slider as comprehension assessment, drives termination per founder-defined criteria.

**Components:**
- **Agentic mode flag** on /live sessions (existing schema gets one new field)
- **AI-participant identity** — a new participant source (`agent`) so sessions record who facilitated
- **Facilitator agent system prompt** — encodes founder decisions on rubric, feedback style, termination. **The prompt IS the IP.**
- **Reuses existing /live primitives** — `slider-track.tsx` (slider as already designed), `live-meeting/` components (session frame), `story_id` linkage (sessions stay anchored to stories), session result schema (calibration data flows into existing badge pipeline)
- **Letter integration** — letters (P684 lineage) become a delivery format for agentic-mode sessions. A reader receives a letter, opens it, /live launches in agentic mode anchored to its content.
- **Escalation path** — if agentic mode terminates without verification (comprehension not reached), session can hand off to open mode with a badge holder, preserving P685's chain.

**Pre-engineering validation (mandatory, not optional):**

1. Founder answers the six Open Questions for /ux (sets the philosophy)
2. v1 facilitator agent prompt drafted from those answers
3. Wizard-of-oz: prompt fed into claude.ai with one real existing story; founder plays the reader (or recruits one), uses paper or digital sliders
4. Founder compares AI's verdict to their gut verdict
5. Only if verdicts align after ≤3 prompt iterations does engineering begin
6. If verdicts diverge persistently, the spec is rejected with documented reason — no engineering committed

## Risks / Non-Goals

### Risks

- **Calibration divergence**: AI-facilitated verdicts diverge from what a human facilitator would produce → badge erodes across P685's chain. *Mitigation:* wizard-of-oz validates prompt BEFORE engineering; calibration audits sample agentic sessions post-launch.
- **Generational drift**: agentic-verified users badge others (per P685 chain), small calibration errors compound across the chain. *Mitigation:* founder re-verifies a sample on a defined cadence; prompt revision threshold defined in advance.
- **Slider feels wrong without human**: shared slider state worked because both parties were physically there. Reading the AI's slider may feel uncanny or hard to interpret. *Mitigation:* explicit /ux work on slider-with-agent interaction before /architect.
- **Agentic-verified badges feel less weighty**, suppressing P685's R₀ signal. *Mitigation:* track propagation metrics for agentic-verified vs open-mode-verified populations.
- **Reader gaming**: a determined reader could pass comprehension by parroting back. *Mitigation:* feedback-style decision (Socratic vs direct) directly affects gameability — covered in Open Questions.
- **Mode-selection confusion**: users may pick agentic when open mode would serve them better, or vice versa. *Mitigation:* /ux defines clear mode-affordance and recommendation; default mode for first-timers stays human-led.

### Non-Goals

- Do NOT remove or change guided or open modes — agentic is additive
- Do NOT build the agentic mode before wizard-of-oz validates the facilitator prompt
- Do NOT change /live's session schema beyond adding `mode` and an agent-participant source field
- Do NOT modify the filing agent (P419 / `StoryGuideChat`) as part of this spec
- Do NOT add transcription, voice, or speech-to-speech to agentic mode V1 — text chat only
- Do NOT design or build the calibration audit dashboard in V1 — log agentic sessions first; dashboard is a follow-up spec
- Do NOT change the badge schema beyond a `verification_source` field on certifications
- Do NOT gate Pledge or Partner Agreement on agentic-verification status (P685 Q4/Q5 unresolved)
- Do NOT auto-default new users to agentic mode — mode selection is explicit until propagation data justifies a default change

## Done-When

- [ ] Wizard-of-oz prompt validation completed with at least one real existing story and one real reader
- [ ] Founder records verdict-comparison (AI verdict vs founder verdict) — match or documented divergence
- [ ] **Decision gate:** if verdicts diverge persistently → spec rejected, no engineering
- [ ] If validated: agentic mode ships as a /live mode option, produces one real-world session end-to-end
- [ ] Slider works in agentic mode — reader updates own; agent sets its own; both visible to reader
- [ ] Each agentic session records: `mode=agentic`, `verification_source=agent`, prompt version, transcript, final agent score, final reader self-score
- [ ] First agentic-verified user receives badge with `verification_source=agent`
- [ ] Calibration audit log entry exists per agentic session (founder spot-check field empty, ready for review)
- [ ] Comparison check: an agentic-verified user later goes through open-mode /live with founder — verdicts match (or divergence captured for prompt iteration)
- [ ] Mode-failure escalation path works: when agentic mode terminates without verification, user is offered an open-mode session with a badge holder

## Acceptance Criteria

- [ ] User can select "agentic mode" when starting a /live session anchored to a `story_id` (or letter)
- [ ] Guided and open modes continue to work unchanged
- [ ] Agentic mode shows reader's slider and agent's slider, both visible
- [ ] Reader can update own slider during the session
- [ ] Agent updates own slider per founder-defined termination rule
- [ ] Agent uses founder-defined facilitator prompt (rubric, feedback style, termination)
- [ ] Session ends per termination criterion; result recorded with mode and source flags
- [ ] Agentic-verified status flows into existing badge state with `verification_source=agent`
- [ ] At least one calibration audit log entry exists per agentic session
- [ ] Feature is feature-flagged so it can be disabled if calibration audits reveal drift
- [ ] If agentic session fails to verify, user sees an escalation option to open mode

## UX Notes

These are interaction patterns /ux will design — listed as orientation, not as decisions.

- **Mode entry**: where does the "agentic" mode option appear? Default mode for which user segments? Recommendation logic ("first-timers should pick guided")?
- **Slider visibility in agentic mode**: parity with open mode (both sliders visible to reader) or different (gap shown only at termination)? Trade-off: visible may anchor; hidden may feel opaque.
- **Agent presence representation**: how is the AI shown to the reader — name? Avatar? "Agent" label? Reader needs to know they're not talking to a human.
- **Termination handoff**: how does the user know the session is "done"? Score reveal, badge celebration, score with explanation?
- **Recovery from comprehension failure**: when the agent declines to verify, what does the user see? Try again on same story? Read again? Routed to open-mode with a badge holder (escalation)?
- **Letter integration**: when a session is launched from a letter (P684 flow), how does the reader navigate between letter content and the live agentic session? Side-by-side? Toggle?
- **Async affordance** (only if sync-vs-async resolved as "both"): how does the reader perceive the difference? Does the agent indicate it's "waiting" if the reader steps away?
- **Mode naming**: reconcile "guided / open / agentic" product terminology with existing code (`free-mode-view.tsx`, `live-mode-view.tsx`).

## Open Questions for /ux

Founder decisions that block UX design. /ux must collect answers before proceeding.

1. **[FOUNDER DECISION: scoring rubric]** What must a reader demonstrate to count as "comprehended"?
   - Captures sender's stated intent?
   - Preserves emotional register / tone?
   - Identifies explicit points of disagreement?
   - Ability to paraphrase in own words (not parrot)?
   - Distinguishes verifiable claims (points) from subjective experience (story)?
   - Some weighted combination?
   - *Each choice affects what the agent prompts for and how it scores.*

2. **[FOUNDER DECISION: feedback style]** When the reader's paraphrase falls short, how does the agent respond?
   - Socratic questions ("What did you understand by 'X'?")
   - Direct corrections ("The sender's intent was Y, not X")
   - Reflective mirroring ("So you heard X — let me share what I understand and you tell me what fits")
   - *Each produces a different type of clarity flip and different gameability profile.*

3. **[FOUNDER DECISION: termination]** When does the agentic session end?
   - Fixed iterations (e.g., always 3 rounds)
   - Score threshold (e.g., agent's slider hits ≥8)
   - User self-reports satisfied
   - Agent declares completion
   - Hybrid (e.g., minimum 2 rounds + threshold + agent confirmation)

4. **[FOUNDER DECISION: sync vs async]** *(specific to agentic mode — didn't exist in prior modes)* Does agentic mode run real-time (reader and agent in continuous chat) or async-friendly (reader can step away, agent waits)?
   - Sync only — feels closest to existing /live, simpler product surface
   - Async-friendly — true scheduling unbottleneck, but adds session-resumption UX
   - Both, with reader choice

5. **[FOUNDER DECISION: calibration audit cadence]** How often does the founder re-check agentic sessions to catch drift?
   - Every Nth session?
   - Random sample at fixed rate?
   - Trigger-based (verifications clustering near threshold; agent-reader slider divergence)?

6. **[FOUNDER DECISION: failure path]** If comprehension is not reached, what happens?
   - User offered another story?
   - Routed to open-mode /live with a badge holder (escalation, restores P685 chain)?
   - Letter author notified of the comprehension gap?
   - Reader allowed to retry the same story after a cooldown?

## Next Steps

1. Founder answers the six Open Questions for /ux above
2. v1 facilitator agent prompt drafted from those decisions
3. **Wizard-of-oz validation** in claude.ai with one real existing story (gate — no engineering before this passes)
4. If validated → `/ux features/p828_live_agentic_mode.md` to design mode selection, slider-with-agent interaction, escalation path, and letter integration
5. Then `/architect`, `/generate-tests`, `/dev`

## Related

- **/live mode progression**: this spec is the third generation. Prior modes (guided, open) remain unchanged.
- **P685** (Badge & Propagation Vision) — *parent vision*. Adds Option D ("AI verifies, founder audits sample") to P685's Q3 ("Who can certify others?"). Agentic mode is the mechanism.
- **P686** (Badge Step 1: Manual Certification — *shipped*) — manual /live certification continues; agentic mode is additive
- **P419** (Filing Chat V1) — separate concern (story creation, not verification); production-readiness assumed or specified separately
- **P547** (AI Post-Session Coach) — different timing (post-session education), not facilitation; informs how agentic-mode failures might trigger education flows
- **P684** (One-to-many letter post-reading account creation) — letters as delivery format that can launch agentic-mode sessions
- **P567** (False Belief Workshop Curriculum — *shipped*) — content being verified
- **P606** (Clarity Flip Workshop — *shipped*) — format being tested
- **P570** (Mini-/live on Stories) — sibling concept (async-to-sync gap bridging via /live); this spec adds async-with-agent as another bridge option
- **Code touchpoints** — agentic mode extends:
  - `src/app/components/live-meeting/` — session frame components
  - `src/app/components/partners/slider-track.tsx` — slider primitive (reused as-is)
  - `src/app/components/partners/free-mode-view.tsx` and `live-mode-view.tsx` — existing mode views; agentic adds a third view
  - `src/app/pages/clarity-live-page.tsx` — entry page; mode selection lives here
  - ~~`StoryGuideChat` (`src/app/components/story-guide/StoryGuideChat.tsx`)~~ — **deleted by P803 (2026-09-02) as dead code.** Read it from git history (`git show e7a786b5^:src/app/components/story-guide/StoryGuideChat.tsx`) if the chat scaffold pattern is still wanted; there is nothing to reference in the working tree
