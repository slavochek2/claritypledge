---
status: today
type: story
rank: 488.67
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

# P948: Answer Letter — bootstrap the receiver's own letter from their responses

> **PLACEHOLDER spec.** Captures the idea and its scope boundary. Do NOT design the build
> yet. Expand only when a willingness signal shows receivers actually respond. **Gated on
> P904 (shipped — it already produces the position-Story data this consumes), NOT on P952.**
> P952 only enriches *acquisition* (reveal-moment placement); it is not a hard blocker.

## Problem

**Situation:** When a receiver responds to a Clarity Letter (via P904's reveal-moment
CTAs), "Explain your position" files a **real Story linked to the shared point** (inheriting
the point's privacy, P607). Over the course of reading a letter, the receiver accumulates
their own stories-on-points across the same point-set the author used.

**Complication:** The co-founder program's end goal is **bilateral letters** — each
co-founder writes to the other. The dominant friction is the cost of *each side* authoring
a letter from scratch. But the responses to my letter are already the seed of the receiver's
mirror letter: **same point-set, their stories instead of mine.** Today that material sits
as loose position-Stories with no path to becoming a letter.

**Question:** Can we let a receiver turn their accumulated responses into a draft letter back
— cutting their authoring cost to near-zero — so the dyad exchanges letters and then meets
for /live?

## Appetite

**Placeholder — not yet sized.** Blast radius and decision density TBD at expansion.
Strictly downstream of P904 (data producer). Build only after early signal that receivers
respond at all (avoids betting authoring work on an unvalidated willingness hypothesis —
see P904 crux).

## Solution

*(Sketch, not final — to be designed at expansion.)*

A **results-page action** — e.g. "You've explained your position on N of M points — turn
these into your letter back →" — that assembles the receiver's accumulated position-Stories
on the shared points into a **draft letter**, routed through the existing story-creation /
letter-compose flow (synthesis assist where it already lives). The receiver reviews and sends.

This is where the motivational framing **"build your half of the conversation"** belongs —
because here it does something real (an actual letter results), unlike surfacing an empty
promise during P904 reading. **Explicitly cut from P952 (2026-06-18, adversarial-review
WARN-1):** putting that framing on the reveal-moment CTA before this feature exists is an
empty promise. The framing decision is owned here — evaluate it once the payoff is real.

`[FOUNDER DECISION]` Trigger placement — results-page action vs. an offer right after the
receiver finishes answering. (Leaning results-page: it's an assembly over *accumulated*
atoms, so it naturally follows accumulation.)
`[FOUNDER DECISION]` How much synthesis is automated vs. receiver-authored.

## Risks / Non-Goals

### Risks
- **Willingness unproven (R₀≈0 ghost).** `DEFER` Do not build until P904 shows responses
  happen. A response letter no one bootstraps from is wasted work.
- **Synthesis quality.** `DEFER` Assembling loose position-Stories into a coherent letter
  is non-trivial; design at expansion, not now.

### Non-Goals
- Do NOT build the synthesis or assembly UI now — this is a **placeholder**.
- Do NOT couple to badging or any verification certification (that doctrine is separate).
- Do NOT build async **calibration** here (author scores paraphrase + asks follow-ups) —
  that is a distinct consumer of P904 responses (its own spec). This spec is the **Job-2
  (bootstrapping)** consumer only.
- Do NOT modify the letter compose flow's author-side behavior.

## Done-When

- [ ] **Placeholder** — to be expanded into observable criteria once P904 response data
      justifies the build.

## Related

- **P904** (shipped) — async letter responses (the data producer: position-Stories +
  explain-backs). This spec consumes that output; the data exists today.
- **P952** — reveal-moment placement + responses gate. Enriches acquisition of the data
  P948 assembles; not a hard dependency.
- **Async calibration** (sibling placeholder) — author scores paraphrase + follow-up
  questions; the Job-1 consumer of the same responses.
- **Theory of change:** letters as conversation turns, not terminal artifacts — answering
  cheaply produces a letter back, enabling continuous async clarity exchange within a dyad.
