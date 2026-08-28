---
status: backlog
type: story
rank: 4
workstream: letters
created_date: '2026-06-17'
tags:
  - letters
  - response-letter
  - co-founder
  - bootstrapping
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P948: Answer Letter — bootstrap the receiver's own STORY from their responses

> **PLACEHOLDER spec.** Captures the idea and its scope boundary. Do NOT design the build
> yet. Expand only when a willingness signal shows receivers actually respond.
>
> **Re-scoped 2026-06-23: STORY, not letter.** This spec now owns **responses → the
> receiver's own /live-ready STORY** (Job A). Packaging that story into a *letter back* and
> sending it (the bilateral exchange — Job B) is a **separate downstream spec**, deliberately
> split out: the story is the verification unit (dyad-internal, no send); the letter is the
> distribution artifact (the exchange). Conflating them is what made the old scope read as
> "delivery." See [cofounder-program-facilitator-guide.md](../docs/cofounder-program-facilitator-guide.md)
> §"Clarity Experiment variant".

## Problem

**Situation (corrected 2026-06-23 — verified against code, not spec prose).** Answering a
Clarity Letter does **not** create a story. The default answer actions — *lock in position*
(`setPosition`) and *explain back* (`uploadExplainBack`) — write a position and an
explain-back, neither of which touches the `stories` table. The **only** path that creates a
real, /live-pickable story today is the optional **"Add a story"** dialog
(`createLetterPositionStory` → inserts a private story linked to the point, author = the
receiver). It is a manual, per-point action separate from answering.

> An earlier version of this spec wrongly claimed *"'Explain your position' files a real
> Story"* — that conflated the optional "Add a story" affordance with the core answer flow.
> Corrected here so no downstream agent re-inherits the false assumption.

**Complication.** The co-founder program and the Clarity Experiment both need each
co-founder to arrive at /live with **their own story** to be verified against (the /live
picker lists the user's own authored stories — a position-story qualifies once it exists).
Today that only happens if the receiver manually "Add a story"s on each point. Their
positions + explain-backs already *are* the seed of that story — same point, their reasoning
instead of mine — but there is no path that turns those loose responses into a story
automatically.

**Question.** Can we let a receiver turn their accumulated responses (positions +
explain-backs) into a draft **STORY** on the shared point — cutting authoring cost to
near-zero — so each side has /live-ready content without hand-authoring? (Letter assembly +
send is out of scope here; see Non-Goals.)

## Appetite

**Placeholder — not yet sized.** Blast radius and decision density TBD at expansion.
Strictly downstream of P904 (data producer). Build only after early signal that receivers
respond at all (avoids betting authoring work on an unvalidated willingness hypothesis —
see P904 crux). **Not on the Clarity Experiment critical path:** the manual "Add a story"
affordance already produces a /live-pickable story today, so the first experiments run
without this; this spec only removes the manual step at delivery scale.

## Solution

*(Sketch, not final — to be designed at expansion.)*

A **post-answer / results-page action** — e.g. "You've taken a position and explained back
on N of M points — turn these into your story →" — that assembles the receiver's
accumulated responses on a point into a **draft Story** linked to that point, routed through
the existing `createLetterPositionStory` path (synthesis assist where it already lives). The
receiver reviews and saves. Output is a private story, /live-verifiable immediately. **No
letter, no send.**

`[FOUNDER DECISION]` Trigger placement — results-page action vs. an offer right after the
receiver finishes answering a point.
`[FOUNDER DECISION]` How much synthesis is automated (assemble position + explain-back into
prose) vs. receiver-authored.
`[FOUNDER DECISION]` One consolidated story across all answered points, vs. one story per
point (the current "Add a story" granularity). The /live verification unit is per-story, so
this choice sets what gets verified.

## Risks / Non-Goals

### Risks
- **Willingness unproven (R₀≈0 ghost).** `DEFER` Do not build until P904 shows responses **[R₀≈0's completions figure is FALSE — prod 2026-08-14: 28 deliveries / 12 completed (43%). The retirement itself stands (the OR's *zero forwards* leg was true on 2026-06-02), but both legs are false now ⇒ grounds to revisit. Re-check this decision: docs/hypotheses.md#corrected-the-completions-figure H-LetterAsProduct §CORRECTED, decisions.md 2026-08-27.]**
  happen. A story-bootstrap no one uses is wasted work.
- **Synthesis quality.** `DEFER` Assembling a position + explain-back into a coherent story
  is non-trivial; design at expansion, not now.

### Non-Goals
- Do NOT build the synthesis or assembly UI now — this is a **placeholder**.
- **Do NOT build the letter-back (Job B) here.** Packaging the bootstrapped story into a
  *letter* and sending it to the partner — the bilateral exchange — is a **separate
  downstream spec**. It is the distribution/exchange step and is delivery-only; in the
  Clarity Experiment the dyad deliberately does **not** exchange (the exchange spends the
  live rupture — see facilitator guide). Keep the boundary at: this spec ends at a story.
- Do NOT couple to badging or any verification certification (that doctrine is separate).
- Do NOT build async **calibration** here (author scores paraphrase + asks follow-ups) —
  that is a distinct consumer of P904 responses (its own spec).
- Do NOT modify the letter compose flow's author-side behavior.

## Done-When

- [ ] **Placeholder** — to be expanded into observable criteria once P904 response data
      justifies the build.

## Related

- **P904** (shipped) — async letter responses (positions + explain-backs + the optional
  "Add a story" path via `createLetterPositionStory`). This spec consumes the responses and
  automates the story creation that is manual today.
- **P952** — reveal-moment placement + responses gate. Enriches acquisition of the
  responses this spec consumes; not a hard dependency.
- **Letter-back / send (Job B)** — *future spec, not yet filed.* Packages a bootstrapped
  story into a letter and sends it (the bilateral exchange). Split out of this spec
  2026-06-23.
- **Async calibration** (sibling placeholder) — author scores paraphrase + follow-up
  questions; another consumer of the same responses.
- [cofounder-program-facilitator-guide.md](../docs/cofounder-program-facilitator-guide.md) —
  the Clarity Experiment uses the manual "Add a story" until this ships.
