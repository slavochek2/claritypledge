---
status: rejected
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
completed_at: '2026-08-07'
---

# P918: Misunderstanding-risk self-diagnostic (solo CTA instrument) — REJECTED

> **Rejected 2026-08-07 during a board priority review. Never built.** Two independent
> reasons, the first of which this spec already states about itself:
>
> 1. **It contradicts the product's own thesis.** Its Problem section names the tension
>    outright — a solo risk score is *a self-assessment*, and self-report is the exact
>    miscalibration ClarityPledge exists to fix (self-assessed understanding correlates
>    r=.178 with actual comprehension, Yang et al. 2023, N=15,889). Shipping a self-rated
>    number as a *measure* would sell the illusion the protocol removes.
> 2. **It targets a dormant wedge.** It was written for the solo founder. The active focus
>    since 2026-07-20 is a seed–A **team pair** entering through felt build-the-wrong-thing
>    pain (`lean-canvas.md` §active-market-focus).
>
> Kept as the reasoning record. Before re-proposing any solo instrument, answer (1): what
> makes this output a measurement rather than a self-report? P926 (gap-location guide) holds
> the surviving half of the idea — topic selection — without claiming to measure anything.


## Problem

**Situation:** P916 (program/delivery page) names its primary CTA as a Clarity Letter **risk score** — a short instrument that returns a misunderstanding-risk number to a solo founder ("How much misunderstanding risk are you carrying into your next big decision?"). It was floated 2026-06-09 as "cool for cta on landing! easy to implement."

**Complication:** Verified this session — **no such instrument exists.** `grep -rniE "risk[ _-]?score" src/` returns zero hits; the only matches in the whole repo are inside the p916 spec itself. What *does* exist is the **two-party** letter reveal system (`letter-results-page.tsx`, `letter-reveal-numeric.tsx`, `letter-reveal-ordinal.tsx`, `gap-banner.tsx`) — it measures a comprehension **gap between a reader and an author**, and needs a second party plus ideally /live. A landing CTA needs a **solo** self-diagnostic: one person answers, a score returns. That is architecturally distinct, so p916's instruction "reuse the existing risk-score-capable letter component" points at a component that does not exist.

**The load-bearing tension:** a solo "risk score" is a **self-assessment** — and self-report is the *exact* miscalibration ClarityPledge exists to fix (lean-canvas §Problem: self-assessed understanding correlates only r=.178 with actual comprehension, Yang et al. 2023, N=15,889). A self-rated number presented as a *measured* one would make this instrument the very thing CP critiques. The resolution is to make the uncalibration the point: the score surfaces the reader's *confidence*, then names that confidence as untrustworthy — "you can't verify your own number; that's why you verify with the other person." The instrument's honest weakness becomes the wedge into the program.

**Question:** What is the minimal honest solo instrument that returns a misunderstanding-risk score and routes the reader into the program — without dressing self-assessment as measurement, and without forking the two-party engine?

## Reframe (2026-06-10) — reuse the demo letter, don't build a new self-rated instrument

The Problem above assumes a solo CTA must be a **new, self-rated** instrument because "the two-party letter reveal needs a second party." Verified this session — **that premise is wrong.** `/letter/ck` (the sealed one-to-many demo letter, doc "CK-9", anon-readable, verified on prod; routed from `simple-navigation.tsx` and `coach-partnership-page.tsx` as "Try a Clarity Letter") is **already solo-experienceable**: a lone visitor predicts a fixed author's positions and sees a **measured** gap, not a self-rated one.

Consequence: the self-assessment trap that drove the original design (a self-rated number dressed as measured) **does not apply to the demo-letter gap — that gap is real.** The original spec reused the gap-reveal grammar for the *dishonest* case (a self-rated number) and banned it for the *honest* case (a real demo gap); that inversion is the signal the solution was narrowed too early.

**Leading approach (when the gate opens): the demo letter *is* the diagnostic.**
- **Option B** — frame `/letter/ck` with expectation-setting before + an Apply hand-off after. Real measured gap; reuses the built-and-verified letter engine (no new scoring engine, no new two-party fork).
- **Option C (preferred)** — bracket the demo letter: capture the reader's **confidence** first → they read + predict → reveal **measured accuracy** → the "risk score" is the **confidence − accuracy delta**. Real, honest, *and* personal — it measures the visitor's own miscalibration (the r=.178 finding the Problem cites) instead of asserting a self-rated number.

**Still FOUNDER DECISIONS — not set here:** the confidence prompt, the score wording/scale, the CTA copy, and whether to capture email. The pure self-rated path (original `## Solution` below) is **set aside, not deleted** — kept as rejected-alternative context.

**Stage 2 (paired, depends on P904) — the strongest form.** The solo instrument (Stage 1 above) is the *hook* — one founder feels a gap on a stranger's letter. The payoff is **paired**: both co-founders answer the diagnostic, a letter is generated *from each other's responses*, and they exchange + answer it via **P904 (async letter verification threads)**. That turns the felt gap from "a stranger's letter" into *their own measured gap with their actual co-founder* — no self-rating trap, no synchronous /live needed (P904 is the async rail). Trade-off: activation rises from 1 click (solo hook) to 2 co-founders both completing — so this is the **post-Apply first experience, not the top-of-funnel CTA**. Dependency: requires P904 shipped (currently spec-review). Same gate as below.

**Gate unchanged — do NOT build.** Same Phase-2 gate as the Dependency section: build only after (a) P916 Phase-1 WTP signal AND (b) a committed co-delivery coach. Neither holds as of 2026-06-10.

## Appetite

**Blast radius — small.** New, self-contained instrument/component reachable from p916 (and reusable elsewhere, e.g. the coach landing). No existing flow changes.
**Reversibility — high.** Git-revertable. Aim for **no schema**; if result-capture/email is wanted, that is a FOUNDER DECISION, not a default.
**Decision density — HIGH.** Multiple FOUNDER DECISIONs: the scoring model (which inputs map to the score), the question set + CTA copy, the honest-framing wording, and whether the result captures an email / persists. Do **not** invent any — mark and ask.

## Solution

> **Read through the Reframe (2026-06-10) above.** The pure self-rated path described here is set aside in favor of the demo-letter engine (Option B/C); kept as rejected-alternative context. The hand-off principle ("the letter sells the session") and "keep the model legible" still apply to the reframed approach.

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
| Landing entry CTA | `[FOUNDER DECISION: exact copy]` — candidate (2026-06-12): **"Experience the reveal of your understanding gap"** (vs current "Try a Clarity Letter" in `simple-navigation.tsx` / `coach-partnership-page.tsx`) — names the *value* (the reveal), not the mechanism (a letter). Same naming principle as the P932 close. Gated; not built. | landing / page entry |
| Prompt / hero question | `[FOUNDER DECISION: exact prompt]` (floated: "How much misunderstanding risk are you carrying into your next big decision?") | instrument entry |
| Question set (inputs) | `[FOUNDER DECISION: which self-rated inputs feed the score]` | instrument body |
| Score model | `[FOUNDER DECISION: inputs → score mapping]` — keep legible enough that the honest framing is literally true | scoring |
| Score display | reuse numeric/ordinal reveal grammar; label as self-rated | reveal |
| Honest-framing line | `[FOUNDER DECISION: wording]` — must name the score as self-rated + uncalibrated, in the same view (hard requirement) | reveal |
| Primary CTA after reveal | `[FOUNDER DECISION: CTA copy]` — routes into the program (verify-with-the-other-person) | reveal |
| Result capture / email | `[FOUNDER DECISION: capture email & persist, or stateless]` — stateless is the no-schema default | reveal |

## Open Questions for /architect

1. (Reframed) Can `/letter/ck` (the sealed demo letter) be wrapped with a pre-read **confidence capture** + a post-reveal **Apply hand-off** as a thin shell around the existing route — or does the bracketing require changes inside the reveal flow itself? (Original framing: which reveal primitives can display a solo self-rated score without implying a verified gap — set aside per the Reframe.)
2. Can the instrument be fully **stateless/client-side** (no schema), or does any chosen result-capture/email option force a table? (gated on the email FOUNDER DECISION)
3. Is there a shared shell with p916's CTA, or is this a standalone route the page embeds/links?

## Dependency

- **P916 (program/delivery page)** is the consumer — this is P916's **Phase-2** CTA. P916 was staged after a 2026-06-10 /challenge-prd RETHINK along a static-vs-interactive line: **Phase 1 ships the full static page (hook + value map + Apply CTA) and does NOT use P918** — P918 is the one genuinely separate interactive build, wired only in Phase 2.
- **Gated — do NOT build yet.** P918's Phase-2 gate fires only after BOTH: (a) H-WTP-Pain returns ≥3/10 warm applicants naming a concrete cost (P916 Phase-1 signal), AND (b) a co-delivery coach commits (goals.md step 6; 2026-06-10 — two candidates assessed, neither fit). The `status: today` is for visibility on the board, not a signal to build ahead of the gate.
