---
status: week
type: story
rank: 0.003
created_date: '2026-05-27'
tags:
  - pledge
  - partner-agreement
  - virality
  - experiment
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P855: Pledge v4 — number-first commitment (upgrade + test)

## Problem

**Situation:** The pledge is versioned (`pledge-text.tsx`, currently v3). The v3 core, flagged "Crucially" in v1, is the honesty commitment — *"I won't pretend to understand if I don't"* — with paraphrase as the upfront method.

**Complication:** The paraphrase mandate is a heavy ask (field signal: a member accepted a "mini pledge" only verbally, possibly out of politeness). Reframe (2026-05-27): an honest comprehension **number** is the direct *operationalization and quantification* of the core — giving a low number IS "not pretending." It's a much lighter ask that keeps the essence, with paraphrase becoming the *triggered* response to a low min rather than the upfront commitment.

**Question:** Upgrade the pledge to a v4 number-first commitment and test whether it propagates the verification norm (more total paraphrases across the population) better than v3 — without ever shipping it as a settled conclusion.

## Appetite

High blast radius — wording lives in ~6 surfaces (`pledge-text.tsx`, `full-article.md`, `tos.md`, `agreement-certificate.tsx`, `export-agreement-certificate.tsx`, share components) + `definitions.md`. Medium reversibility (versioning supports rollback to v3; ToS bump notifies users). High decision density — the v4 wording is a `[FOUNDER DECISION]`; keep-vs-collapse of the ~1% full pledge (p605) is open.

## Solution

Add `PLEDGE_VERSIONS[4]` (number-first) and set it current, behind the existing version mechanism so v3 stays intact for rollback. Core shape (the **wording is a `[FOUNDER DECISION]`** — draft to react to, not final):

> YOUR RIGHT: When we speak, ask me how much I think I understood you.
> MY PROMISE: I'll tell you honestly — as a number, not a nod — and I won't pretend it's higher than it is. We take the lower of our two numbers as where we really stand. If it's low, ask me to explain back what I think you meant, and we raise it together.

Instrument it as an experiment: surface the min (P854), log number-give events and paraphrase events, measure the funnel (adoption × trigger × low-min→paraphrase conversion) per P853.

## Risks / Non-Goals

### Risks
- **Institutionalizing the unreliable signal.** If a low min produces complacency rather than a paraphrase, v4 enshrines the failure mode CP exists to fix. Mitigation: instrument + the P853 cheapest-disproof; roll back to v3 if conversion is weak.
- **Canonical text change under weak evidence.** Mitigation: `/challenge-prd` on the v4 wording before rollout; ship behind the version flag.

### Non-Goals
- Do NOT inline-edit the pledge text — this is a `/dev` feature (touches logic + many surfaces), not a one-line change.
- Do NOT ship v4 for the Chiang Mai event — the test population is pairs (workshop/agreements), not the solo event audience.
- Do NOT remove v3 — keep it for rollback and existing signers.
- Do NOT finalize the v4 wording without founder sign-off + `/challenge-prd`.
- Do NOT decide keep-vs-collapse of the full pledge here (p605 / P853 founder decision).

## UX Notes

- Existing signers on v3 — decide migration: grandfather, or prompt to re-affirm v4? (`[FOUNDER DECISION]`)
- ToS references the pledge wording → version bump + update dialog (per existing ToS-change pattern).

## Acceptance Criteria

- [ ] v4 exists in `PLEDGE_VERSIONS`, v3 retained, current version switchable
- [ ] All ~6 wording surfaces + `definitions.md` reflect v4 when current
- [ ] v4 wording passed `/challenge-prd` + founder sign-off
- [ ] Number-give and paraphrase events are logged for the P853 funnel
- [ ] Rollback to v3 is a single config change

## Related

- P853 (falsify / measurement design — the rationale + success metric) · P854 (min-display instrument)
- p605 (pledge as graduation, ~1%) · `definitions.md` Clarity Partner Agreement · a9/a27 Min Principle
- Context: `pp/docs/business/chiang-mai-clarity-workshop/EVENT-STRATEGY.md`
