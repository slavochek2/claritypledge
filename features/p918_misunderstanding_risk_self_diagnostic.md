---
status: today
type: story
rank: 1954.659
created_date: '2026-06-10'
tags:
  - risk-score
  - self-diagnostic
  - program-page
  - p916
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-06-10T07:59:26.799Z'
---

# P918: Misunderstanding-risk self-diagnostic (solo CTA instrument)

## Problem

**Situation:** P916 (program/delivery page) names its primary CTA as a Clarity Letter **risk score** — a short instrument that returns a misunderstanding-risk number to a solo founder ("How much misunderstanding risk are you carrying into your next big decision?"). It was floated 2026-06-09 as "cool for cta on landing! easy to implement."

**Complication:** Verified this session — **no such instrument exists.** `grep -rniE "risk[ _-]?score" src/` returns zero hits; the only matches in the whole repo are inside the p916 spec itself. What *does* exist is the **two-party** letter reveal system (`letter-results-page.tsx`, `letter-reveal-numeric.tsx`, `letter-reveal-ordinal.tsx`, `gap-banner.tsx`) — it measures a comprehension **gap between a reader and an author**, and needs a second party plus ideally /live. A landing CTA needs a **solo** self-diagnostic: one person answers, a score returns. That is architecturally distinct, so p916's instruction "reuse the existing risk-score-capable letter component" points at a component that does not exist.

**The load-bearing tension:** a solo "risk score" is a **self-assessment** — and self-report is the *exact* miscalibration ClarityPledge exists to fix (lean-canvas §Problem: self-assessed understanding correlates only r=.178 with actual comprehension, Yang et al. 2023, N=15,889). A self-rated number presented as a *measured* one would make this instrument the very thing CP critiques. The resolution is to make the uncalibration the point: the score surfaces the reader's *confidence*, then names that confidence as untrustworthy — "you can't verify your own number; that's why you verify with the other person." The instrument's honest weakness becomes the wedge into the program.

**Question:** What is the minimal honest solo instrument that returns a misunderstanding-risk score and routes the reader into the program — without dressing self-assessment as measurement, and without forking the two-party engine?

## Appetite

**Blast radius — small.** New, self-contained instrument/component reachable from p916 (and reusable elsewhere, e.g. the coach landing). No existing flow changes.
**Reversibility — high.** Git-revertable. Aim for **no schema**; if result-capture/email is wanted, that is a FOUNDER DECISION, not a default.
**Decision density — HIGH.** Multiple FOUNDER DECISIONs: the scoring model (which inputs map to the score), the question set + CTA copy, the honest-framing wording, and whether the result captures an email / persists. Do **not** invent any — mark and ask.

## Solution

A lightweight **solo self-diagnostic**: a small set of self-rated inputs → a misunderstanding-risk score, displayed with **explicit honest framing** that the number is self-rated and uncalibrated. The reveal does two jobs in sequence: (1) give the reader a number that makes the gap *felt*, (2) immediately name the number as untrustworthy-by-construction and offer verification — routing into the program CTA, consistent with the 2026-06-10 decision "the letter sells the /live session; the session sells itself."

- **Reuse existing reveal UI primitives** (the numeric/ordinal/gap presentation grammar) **only where it stays honest** — i.e. to display a *self-rated* number, never to imply a verified gap.
- **Do not build or fork a two-party comprehension engine.** This instrument has one participant by design.
- The score model is intentionally simple (self-rated inputs → a heuristic score). Its accuracy is **not** the value; the *felt gap between confidence and evidence* is. Keep the model legible enough that the honest framing is true.

## Risks / Non-Goals

### Risks
- **Self-assessment-as-measurement (the core trap).** Presenting a self-rated score as a measured one reintroduces exactly the miscalibration CP critiques. *Mitigation (MITIGATE):* the honest-framing line is a hard requirement, not copy polish — the reveal must name the number as self-rated and uncalibrated in the same view it shows it. Acceptance Criteria gate this.
- **Instrument creep into a second-party engine.** "Make the score real" pressure could pull this toward needing an author/verifier. *Mitigation (ACCEPT):* solo-by-design is the scope; verification is what the *program* sells, not what this instrument delivers. If a verified score is wanted, that is /live, not this.
- **Scoring-model bikeshed ahead of a real offer.** Over-engineering the score model before a co-delivery program exists is wasted motion. *Mitigation (DEFER):* ship the minimal honest model; refine only when a real program is running (shares p916's launch gate).

### Non-Goals
- Do NOT present the self-assessed score as a measured/verified number (honest-scope — hard constraint).
- Do NOT build, fork, or extend a two-party comprehension engine.
- Do NOT duplicate the existing two-party letter reveal (`gap-banner` / `letter-reveal-*`) — reuse primitives only where honest.
- Do NOT invent the scoring model, question set, CTA copy, or honest-framing wording — all FOUNDER DECISIONs.
- Do NOT add a schema change or new table unless result-capture is explicitly chosen (FOUNDER DECISION).
- Do NOT launch/promote ahead of p916's sequencing gate (no committed co-delivery coach yet — goals.md step 6). Build-ahead is fine; promotion is gated.

## Done-When

- [ ] A solo reader answers the diagnostic and receives a misunderstanding-risk score, on desktop and 320/375px.
- [ ] The reveal names the score as **self-rated and uncalibrated** in the same view it shows the number (honest-scope verified, not implied-measured).
- [ ] After the reveal, the reader is routed into the program CTA (the score hands off to the offer, per "the letter sells the session").
- [ ] No two-party engine added; no duplication of the existing `gap-banner` / `letter-reveal-*` two-party reveal.
- [ ] Every FOUNDER DECISION (scoring model, question set, CTA copy, honest-framing wording, email/persist) is surfaced as an explicit placeholder, not silently filled.
- [ ] No schema change unless result-capture was explicitly chosen.

## Acceptance Criteria

- [ ] A solo founder can complete the diagnostic and reach a score without a second party, an author, or /live.
- [ ] The score is unmistakably presented as the reader's *own self-rating* — a reader cannot reasonably believe it is a measured/verified number.
- [ ] The reveal converts the score's uncalibration into the wedge (confidence shown → confidence named as untrustworthy → verify-with-the-other-person offer).
- [ ] The instrument reuses existing reveal primitives without adding a parallel engine (verified: no new two-party scoring engine).
- [ ] The instrument is reachable as p916's primary CTA (dependency satisfied).

## UX Notes

- **One participant, by design.** No author, no /live, no second rater. The whole flow is solo.
- **Sequence is the design:** answer → number (felt gap) → "this is your own guess, and you can't check it alone" → verify-with-the-other-person CTA. The let-down from "I got a number" to "the number is untrustworthy" is the intended emotional arc — it is the product thesis in miniature.
- **States to cover:** pre-completion (questions), post-completion (score + honest framing + CTA), and re-entry (a reader who already has a score). Empty/edge: very-low and very-high score both must render the honest framing — a low "risk" score must not read as "you're fine, no need to verify."

## UI Contract

| Element | Value | Context |
|---|---|---|
| Prompt / hero question | `[FOUNDER DECISION: exact prompt]` (floated: "How much misunderstanding risk are you carrying into your next big decision?") | instrument entry |
| Question set (inputs) | `[FOUNDER DECISION: which self-rated inputs feed the score]` | instrument body |
| Score model | `[FOUNDER DECISION: inputs → score mapping]` — keep legible enough that the honest framing is literally true | scoring |
| Score display | reuse numeric/ordinal reveal grammar; label as self-rated | reveal |
| Honest-framing line | `[FOUNDER DECISION: wording]` — must name the score as self-rated + uncalibrated, in the same view (hard requirement) | reveal |
| Primary CTA after reveal | `[FOUNDER DECISION: CTA copy]` — routes into the program (verify-with-the-other-person) | reveal |
| Result capture / email | `[FOUNDER DECISION: capture email & persist, or stateless]` — stateless is the no-schema default | reveal |

## Open Questions for /architect

1. Which existing reveal primitives (`letter-reveal-numeric` / `letter-reveal-ordinal` / `gap-banner`) can display a **solo self-rated** score *without* implying a two-party verified gap — and where does honest reuse end and a fresh component begin?
2. Can the instrument be fully **stateless/client-side** (no schema), or does any chosen result-capture/email option force a table? (gated on the email FOUNDER DECISION)
3. Is there a shared shell with p916's CTA, or is this a standalone route the page embeds/links?

## Dependency

- **P916 (program/delivery page)** depends on this — p916's primary CTA wires to this instrument. p916 will be updated to reference P918 instead of "reuse existing risk-score infra" (which does not exist). Cross-link both specs.
- **Shares p916's launch gate:** no committed co-delivery coach yet (goals.md step 6) — build ahead, do not promote.
