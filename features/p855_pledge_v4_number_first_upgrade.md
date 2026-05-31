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

Add `PLEDGE_VERSIONS[4]` (number-first) and set it current, behind the existing version mechanism so v3 stays intact for rollback. The pledge carries the verified-understanding mechanic in first person (give a number, explain back, accept the lower); the **agreement (P857) uses this same locked text, applied bilaterally** — both partners affirm it to each other. Locked v4 wording (resolved — see Open Questions):

> **YOUR RIGHT** — When we speak, please feel free to ask how well I assume I cognitively understand the intention behind what you say.
>
> **MY PROMISE** — I'll give you an honest number, from 0 (not at all) to 10 (I assume I fully understand you). At any time you can give me your own number, for how much you assume I cognitively understand you. If I explain back what I understood, without judging or criticizing, you can tell me what I missed, and ask me to explain it back again. I'll accept the lower of our two numbers as my verified understanding of you.
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

**v4 phrasing — resolved 2026-05-31 (founder-delegated; still passes through `/challenge-prd`):**
1. "what I got right and what I missed" — **kept** (covers both up- and down-revision; "revise up or down" already states direction).
2. "without judging your idea" → **"without judging or criticizing your idea"** (parallel verbs; preserves v3's "criticism").
3. "what you share" vs "your story" → **"what you share"** (the pledge is to everyone, not only in-product stories).
4. Target referent → **"intention"** (not "intended meaning") in the oath: maps to one stable referent across DE/RU/ES/FR (Absicht / намерение / intención / intention) with no collapse, and locates the speaker's authority over their own intent. Gricean "speaker-meaning (intended meaning)" reserved for a9/a29 where precision reads and translation isn't a constraint.
5. Public noun → **"verified understanding"** (not "recursively verified"): "recursive" is a method qualifier, article-only; the relational/min character is carried by the rule ("the lower of our two numbers" — two-party and explicitly not-a-mean), not an adjective. "joint" only if a qualifier is ever forced; never "mutual" (reads as averaging).

Migration (`[FOUNDER DECISION]`, resolves the UX-Notes question): **grandfather** — existing v3 signers stay on v3; v4 is offered, no forced re-affirm. The ToS bump applies going forward / is informational; it does NOT force existing signers to re-affirm.

## Related

- **P857** (Clarity Agreement + versioning) — **ships first**; this pledge bump follows.
- **P853** (falsify / measurement design) — **superseded; absorbed into P857.**
- P854 (/live min-display — display-only, not the two-phase loop) · p605 (pledge as graduation, ~1%) · `definitions.md` Clarity Partner Agreement · a9/a29 (verified-understanding model)
- Rationale: decisions.md 2026-05-31 [product] + [content/strategy]
- Context: `pp/docs/business/chiang-mai-clarity-workshop/EVENT-STRATEGY.md`
