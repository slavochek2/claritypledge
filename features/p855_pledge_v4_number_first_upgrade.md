---
status: today
type: story
rank: 0.008
created_date: '2026-05-27'
tags:
  - pledge
  - partner-agreement
  - virality
  - experiment
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-05-30T09:17:31.838Z'
---

# P855: Pledge v4 — number-first commitment (upgrade + test)

## Problem

**Situation:** The pledge is versioned (`pledge-text.tsx`, currently v3). The v3 core, flagged "Crucially" in v1, is the honesty commitment — *"I won't pretend to understand if I don't"* — with paraphrase as the upfront method.

**Complication:** The paraphrase mandate is a heavy ask (field signal: a member accepted a "mini pledge" only verbally, possibly out of politeness). Reframe (2026-05-27): an honest comprehension **number** is the direct *operationalization and quantification* of the core — giving a low number IS "not pretending." It's a much lighter ask that keeps the essence, with paraphrase becoming the *triggered* response to a low min rather than the upfront commitment.

**Question:** Upgrade the pledge to a v4 number-first commitment and test whether it propagates the verification norm (more total paraphrases across the population) better than v3 — without ever shipping it as a settled conclusion.

## Appetite

High blast radius — wording lives in ~6 surfaces (`pledge-text.tsx`, `full-article.md`, `tos.md`, `agreement-certificate.tsx`, `export-agreement-certificate.tsx`, share components) + `definitions.md`. Medium reversibility (versioning supports rollback to v3; ToS bump notifies users). High decision density — the v4 wording is a `[FOUNDER DECISION]`; keep-vs-collapse of the ~1% full pledge (p605) is open.

## Solution

**Sequenced after P857** — the Clarity Agreement gets versioning + the number-first model *first* (pairs are the test population; the min is coherent bilaterally). This spec then bumps the **pledge** to v4.

Add `PLEDGE_VERSIONS[4]` (number-first) and set it current, behind the existing version mechanism so v3 stays intact for rollback. Design split (decisions.md 2026-05-31 [product]): the **pledge accepts the verification standard + gives a number** (light); the bilateral *algorithm* — the min as a joint action, the explain-back loop — lives in the **agreement addendum (P857)**, not the oath. Locked v4 wording (three small phrasing calls open — see Open Questions):

> **YOUR RIGHT** — When we speak, please feel free to ask how well I think I cognitively understand the intention behind what you share.
>
> **MY PROMISE** — I'll give you an honest number, from 0 (not at all) to 10 (I assume full understanding). What we can claim we share is never higher than the lower of our two numbers. If I explain back what I understood, without judging your idea, you can show me what I got right and what I missed, and I'll revise my number, up or down, but never above what I honestly find.
>
> **THE EXCEPTION** — If I can't give you an honest number in the moment, I'll explain why.

Instrument as an experiment: surface the min (P854, display-only), log number-give and explain-back events; two metrics — the **funnel** (adoption × trigger × low-min→paraphrase conversion, *propagation*) and the **dynamic calibration-slope** (*outcome*, refines H-CalibrationTrainable). Do not kill number-first on a static-funnel snapshot.

**Empirical gate:** the mechanic rests on P853's unrun cheapest-disproof (does a low min trigger an explain-back, or a shrug?) — run via P857 before broad rollout.

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

## Open Questions

Three v4 phrasing calls (`[FOUNDER DECISION]` — resolve before `/challenge-prd` sign-off):
1. "what I got right and what I missed" — recommended **keep** (covers both up- and down-revision).
2. "without judging your idea" vs "without judging or criticizing" (v3 had "or criticism").
3. "what you share" vs "your story" — recommended **"what you share"** (the pledge is to everyone, not only in-product stories).

Migration (`[FOUNDER DECISION]`, resolves the UX-Notes question): **grandfather** — existing v3 signers stay on v3; v4 is offered, no forced re-affirm. The ToS bump applies going forward / is informational; it does NOT force existing signers to re-affirm.

## Related

- **P857** (Clarity Agreement + versioning) — **ships first**; this pledge bump follows.
- **P853** (falsify / measurement design) — **superseded; absorbed into P857.**
- P854 (/live min-display — display-only, not the two-phase loop) · p605 (pledge as graduation, ~1%) · `definitions.md` Clarity Partner Agreement · a9/a29 (verified-understanding model)
- Rationale: decisions.md 2026-05-31 [product] + [content/strategy]
- Context: `pp/docs/business/chiang-mai-clarity-workshop/EVENT-STRATEGY.md`
