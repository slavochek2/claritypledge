---
status: today
type: story
rank: 0.02
workstream: letter
created_date: '2026-05-15'
tags:
  - letter
  - ux
  - redesign
  - superdesign
delivery_stage: challenge-prd
pipeline_ran:
  - create-spec
  - challenge-prd
locked_at: '2026-05-18T14:26:18.985Z'
---

# P842: Letter full-flow UX redesign

## Problem

**Situation:** The letter experience walks a recipient through anti-point → story → point(s) per story unit, culminating in a calibration reveal (their predicted confidence vs the author's actual stance, with cognitive/emotional/agreement breakdown). The letter pre-collects calibration data — the actual position flip is a separate moment that happens in /live when the recipient verifies understanding and shifts position. The letter's job is to make the in-/live flip more predictable and pre-loaded.

**Complication:** Founder review on a small live letter surfaced 5 UX failures that combine to hide or undermine the reveal:

1. **Reveal invisibility (HIGH)** — After submitting confidence on the anti-point, the "Submit" button becomes "Next" with identical visual treatment. The reveal (author's actual stance "Agree+" badge + explanation panel) appears between the question and the next button. Users tap "Next" without seeing the reveal. The most important moment in the product is being skipped.

2. **Reveal panel weight (HIGH)** — On the story screen the calibration panel (confidence comparison + "Perfectly calibrated" badge + brain/heart/handshake icons) is the main reveal, but the story card below dominates visually. Hierarchy is inverted: story feels primary, calibration feels secondary.

3. **Progress not sticky (LOW)** — Progress bar scrolls away. Users lose sense of position within and across story units. **[CLEARED by P846 — shipped]**

4. **Progress grouping ambiguity (MED)** — Segments don't visually communicate the anti-point/story/point grouping. Users perceive a flat sequence; they don't see the "story unit" structure that underpins the experience.

5. **Footer dissonance (LOW)** — Global site footer (terms/privacy/etc.) appears at the bottom of the letter route. Letter recipients have already accepted ToS at letter open — the footer is redundant and breaks the focused-reading mode. **[CLEARED by P846 — shipped]**

**Question:** What does the letter flow look like end-to-end if we redesign it around making the reveal unmissable, with correct hierarchy and grouping cues? The remaining open critiques (#1, #2, #4) are design-quality questions, not omissions — they need a holistic redesign pass, not point fixes.

**Reference letter for design work:** `https://claritypledge.com/letter/d533e728-3163-4572-ab20-78230cd7b72c` — a small letter with 1 story unit, ideal for whole-flow exploration.

**Screenshots:** `~/Screenshots/Screenshot at May 15 16-28-14.png`, `16-28-54.png`, `16-29-39.png`, `16-31-12.png`.

## Appetite

**Blast radius:** Medium-high — touches the primary recipient-facing flow. Does not touch data model, scoring, or /live. Single route family (`/letter/*`).

**Reversibility:** High in code (revert merge). Medium in user perception — once a redesigned letter is sent, recipients see the new design; if they share or screenshot, it's "in the world."

**Decision density:** High. Founder calls needed on: copy for the reveal button (e.g. "Next" → what?), reveal as inline vs modal vs interstitial, whether to explain grouping or only signal it, what to do with the footer (remove entirely, or replace with a minimal letter-context footer).

## Solution

Two-phase approach: divergent exploration in SuperDesign, then implementation in cp.

**Phase A — SuperDesign exploration (this spec covers Phase A; Phase B is downstream):**

Frame for the brief: "design the letter to feel like a finished product." Not "fix 5 critiques." Whole-flow design quality (vibe, hierarchy, typography, pacing) is what SD earns its keep on; enumerating pre-decided reveal patterns wastes the tool.

1. Create `sd/cp-letter/` sandbox (peer of existing `sd/cp-live/`, `sd/cp-landing/`).
2. Write tight design brief at `sd/cp-letter/brief.md` distilling:
   - Recipient context (already accepted ToS, no sign-in, reading from a personal message)
   - Goal: read author's point, predict their position, get a calibrated reveal of the gap
   - Strategic intent: the letter is the scale unit. It must feel forward-able. Reveal must be unmissable.
   - The remaining open critiques (#1, #2, #4) as design questions, not point-fix asks
   - **Explicit permission to deviate from standard story/point chrome.** Browsing-context components hide positions behind buttons; the letter is guided reading where engagement is required. Inline visible scales, opinionated typography, etc. are on the table.
   - Constraint: anti-point → story → point(s) structure is fixed (data shape locked, presentation open)
3. Snapshot the reference letter as `sd/cp-letter/current.html` (the "before").
4. Run SuperDesign with open variant prompts focused on whole-flow feel — not pre-decided reveal patterns. Founder evaluates against the brief.
5. Founder picks winning direction. Variant becomes the design contract for Phase B.

**Phase B — implementation (separate downstream: /architect → /generate-tests → /dev):**

Port the chosen variant to cp, resolving the open critiques (#1, #2, #4). Not in scope for this spec — Phase A deliverable is the picked variant + critique resolutions documented in this file.

**Why no T14 fix:** A prior intervention forced a 400ms delay before the "Next" button rendered, betting that empty space would draw attention to the reveal. That's the wrong axis — it treats the symptom (tap-through) instead of the cause (weak reveal weight). Make the reveal visually compelling and the user pauses naturally; the button can be instant and the design holds. Phase A should replace T14, not preserve it.

**Success measurement:** P849 (reveal-dwell instrumentation) provides the baseline. Phase B should ship only after ≥3 days of pre-redesign dwell data exists, so we can read whether the redesign actually moves reader behavior.

## Risks / Non-Goals

### Risks
- **SD variants diverge from production constraints** (real dynamic data, multi-step state machine, real progress data). Mitigation: brief includes explicit constraint list; snapshot is from a real letter, not a mockup.
- **Scope creep into adjacent letter specs.** P836 (letter overview structural redesign) is in flight and may conflict. Mitigation: read P836 before writing the SD brief; coordinate on what's owned where.
- **Founder decisions blocking the SD step.** Multiple copy/UX calls needed. Mitigation: enumerate `[FOUNDER DECISION]` items at the brief stage so they're surfaced before SD runs.
- **Reveal-as-modal pattern may regress accessibility** (focus management, mobile). Flag for Phase B if chosen.

### Non-Goals
- Do NOT change the letter data model or the anti-point/story/point structure.
- Do NOT redesign /live or any author-side flow.
- Do NOT redesign the letter overview screen — that's P836's territory.
- Do NOT change scoring logic or the calibration computation.
- Do NOT add new database tables or migrations.
- Do NOT block this spec on P836 — coordinate, don't merge scopes.

## Done-When (Phase A)

- [ ] `sd/cp-letter/brief.md` exists and captures JTBD + 5 critiques + constraints in ≤1 page.
- [ ] `sd/cp-letter/current.html` is a captured snapshot of the reference letter.
- [ ] SuperDesign produced ≥3 whole-flow variants under `sd/cp-letter/variants/`.
- [ ] Founder has reviewed variants and named the chosen direction (written in this spec).
- [ ] All 5 critiques have a named resolution in the chosen variant (table at bottom of this file).
- [ ] `[FOUNDER DECISION]` items resolved before /architect handoff.

## UX Notes

States the design must cover end-to-end:
- Letter open (ToS accept moment — already exists, not redesigned)
- Anti-point question (predict confidence)
- Submit pressed → reveal injected
- Reveal seen → next action (story screen)
- Story + calibration panel
- Point question(s)
- Final state / overview handoff

## Founder Decisions (open)

- [FOUNDER DECISION] Reveal pattern: inline-disruptive vs modal vs full-page interstitial?
- [FOUNDER DECISION] Button copy: "Submit" stays for prediction. What does the post-reveal advance button say? ("Continue", "See next", "Next story", etc.)
- [FOUNDER DECISION] Progress grouping: explain with labels above segments, or signal visually only (e.g. grouped pills)?
- [FOUNDER DECISION] Footer: remove entirely on `/letter/*`, or replace with minimal letter-context strip (e.g. "Powered by ClarityPledge")?
- [FOUNDER DECISION] Should the calibration panel get an isolated screen of its own (interstitial) before the story, instead of competing with the story card?

## Resolution Map (filled during Phase A)

| Critique | Severity | Resolution in chosen variant |
|---|---|---|
| 1. Reveal invisibility | HIGH | _TBD — open for Phase A_ |
| 2. Reveal panel weight | HIGH | _TBD — open for Phase A_ |
| 3. Progress not sticky | LOW | **Cleared by P846 (shipped)** |
| 4. Progress grouping ambiguity | MED | _TBD — open for Phase A_ |
| 5. Footer dissonance | LOW | **Cleared by P846 (shipped)** |

## Related

- **P849** — letter reveal dwell instrumentation. Success-measurement dependency. Phase B should not start until ≥3 days of baseline data exists.
- **P846** (shipped) — letter chrome cleanup. Cleared critiques #3 (sticky progress) and #5 (footer).
- **P836** — letter overview structural redesign (in flight). Coordinate scope.
- **P773** (archive) — letters visual hierarchy polish (predecessor learning).
- **P676** (archive) — letter reading visual corrections (predecessor learning).
- **P700** — letter results aggregate overview (data context).
- **P724** — letter visibility treatment.
- **P725** — letter other participant identity.

## Next Step

Phase A execution: create `sd/cp-letter/` sandbox, write the reframed brief (holistic, permission to deviate from standard story/point chrome), snapshot the reference letter, run SuperDesign variants, founder picks direction. Phase B (implementation) happens after that, gated on ≥3 days of P849 baseline data.
