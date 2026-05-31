---
status: today
type: story
rank: 0.006
created_date: '2026-05-31'
tags:
  - partner-agreement
  - versioning
  - verified-understanding
  - experiment
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-05-31T05:25:35.542Z'
---

# P857: Clarity Agreement versioning + number-first (verified-understanding) v-next

## Problem

**Situation:** The Clarity Pledge is versioned (`pledge-text.tsx`, `PLEDGE_VERSIONS`, currently v3). The **Clarity Partner Agreement has NO version registry** — it is a facilitated artifact plus certificate components (`agreement-certificate.tsx`, `export-agreement-certificate.tsx`), with no equivalent of `PLEDGE_VERSIONS`.

**Complication:** The verified-understanding model (decisions.md 2026-05-31 [product]) upgrades the agreement to a number-first, verified-understanding commitment. But the *number + min* mechanic is only coherent **bilaterally** — which is exactly where the agreement lives (two opted-in people), unlike the unilateral pledge. The agreement is also the **test population** for the falsify (pairs, per P853). So the agreement, not the pledge, is the first place the new model should ship — and it can't, because there is no versioning to ship it behind or to roll back to.

**Question:** Add version-registry infrastructure to the Clarity Agreement (mirroring the pledge pattern), then upgrade the agreement + `/partner-template` to the number-first model — without breaking the one existing real agreement, and without shipping the mechanic as a settled conclusion before its empirical gate clears.

## Appetite

High blast radius — introduces a new versioning layer to a previously-unversioned artifact, touches the certificate components and `/partner-template`, and changes the canonical agreement text. Medium reversibility (versioning supports rollback to v-old; no data migration if the existing agreement is grandfathered). High decision density — the addendum wording is a `[FOUNDER DECISION]`, and the whole mechanic rests on an **unrun empirical test** (see Risks).

## Solution

Two stages, sequenced:

**Stage A — versioning infrastructure.** Add an `AGREEMENT_VERSIONS` registry mirroring `PLEDGE_VERSIONS` (current-version pointer, switchable, per-version text). The **existing real agreement between the two users stays pinned to its old version** — grandfathered, never auto-migrated. The certificate components render whichever version an agreement was created under.

**Stage B — number-first v-next.** Add the new version using the **same locked v4 verified-understanding text as the pledge (see P855)** — number → explain-back → both numbers → accept the lower — and update `/partner-template`. The agreement applies that text **bilaterally**: both partners affirm the promise to each other, which is where the min as a joint action is coherent.

(Wording is shared with P855 and still gated by `/challenge-prd` + founder sign-off. The earlier separate "codified algorithm" draft is retired — one canonical text, applied unilaterally as the pledge, bilaterally as the agreement.)

**Measurement (absorbs P853's design):** instrument the agreement to log number-give and explain-back events. Two metrics, reconcile in the Deliverable below: the **funnel** (adoption × trigger × low-min→paraphrase conversion) is the *propagation* metric; the **dynamic calibration-slope** (does a person's stated comprehension track their confirmed comprehension more tightly with practice) is the deeper *outcome* metric. Do NOT kill number-first on a static-funnel snapshot — the slope is the real bet.

## Risks / Non-Goals

### Risks
- **MITIGATE — Unverified core mechanic.** The whole model rests on P853's **unrun cheapest-disproof**: when the min comes back low, do people actually explain back, or shrug and move on? If they shrug, number-first institutionalizes the failure mode CP exists to fix. Mitigation: run the cheapest-disproof on a handful of real pairs (needs the min-display, P854) **before** broad rollout; ship behind the version flag; roll back to v-old if conversion is weak.
- **MITIGATE — Versioning bug breaks the existing agreement.** The one real agreement must keep rendering on its old version. Mitigation: the Done-When validation explicitly checks the existing agreement is unchanged while a new agreement renders v-next.

### Non-Goals
- Do NOT change the **pledge** here — that is P855 (ships *after* this).
- Do NOT migrate the existing agreement to v-next — grandfather it.
- Do NOT finalize the shared v4 wording without founder sign-off + `/challenge-prd`.
- Do NOT wire the min to any commitment behavior in `/live` — the min-display (P854) is display-only; the two-phase update loop is a separate, still-unspecified surface.
- Do NOT decide keep-vs-collapse of the ~1% full pledge (p605) here.

## Acceptance Criteria

- [ ] `AGREEMENT_VERSIONS` registry exists; current version is switchable; old version retained
- [ ] The existing real agreement renders unchanged on its old version
- [ ] A newly created agreement renders the number-first v-next (the text-swap is the feature's validation)
- [ ] `/partner-template` reflects v-next when current
- [ ] Shared v4 wording (per P855) passed `/challenge-prd` + founder sign-off
- [ ] Number-give and explain-back events logged for the measurement (funnel + calibration-slope)
- [ ] Rollback to v-old is a single config change

## UX Notes

- Certificate components must read the agreement's pinned version, not the global current version.
- Existing signers/agreements: grandfather (stay on old version); new agreements get v-next. No forced re-affirm.

## Rollback Strategy

Flip the current-version pointer back to v-old (single config change). The existing agreement is unaffected either way (pinned). No data migration to reverse.

## Done-When

- [ ] Versioning infra ships; existing agreement verified unchanged; new agreement renders v-next (evidence: side-by-side render)
- [ ] P853 cheapest-disproof has been run on real pairs and reported (go/no-go on broad rollout)
- [ ] Measurement logging produces the funnel + calibration-slope data

## Deliverable (measurement design, absorbed from P853)

A decision doc / decisions.md entry recording: did a low min convert to an explain-back (funnel), and did calibration tighten with practice (slope); go/no-go on broad rollout and on the coupled pledge upgrade (P855).

## Related

- **P853** (falsify / measurement design) — **superseded; measurement absorbed here.**
- **P855** (pledge v4) — ships *after* this (agreement-first: pairs are the test population, min is coherent bilaterally).
- P854 (/live min-display — display-only, NOT the two-phase loop) · p605 (pledge as graduation, ~1%)
- `definitions.md` Clarity Partner Agreement (v-next decided, pending this spec) · `agreement-certificate.tsx`, `export-agreement-certificate.tsx`, `/partner-template`
- Rationale: decisions.md 2026-05-31 [product] + [content/strategy] · a9/a29 (verified-understanding model)
