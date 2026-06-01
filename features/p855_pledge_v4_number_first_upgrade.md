---
status: qa
type: story
rank: 0.003
created_date: '2026-05-27'
tags:
  - pledge
  - partner-agreement
  - verified-understanding
delivery_stage: ship
pipeline_ran:
  - create-spec
  - challenge-prd
  - upgrade-oath
  - verify
  - ship
locked_at: '2026-05-30T09:17:31.838Z'
---

# P855: Pledge v4 — number-first commitment (upgrade)

## Problem

**Situation:** The pledge is versioned (`pledge-text.tsx`, currently v3). The v3 core, flagged "Crucially" in v1, is the honesty commitment — *"I won't pretend to understand if I don't"* — with paraphrase as the upfront method.

**Complication:** The paraphrase mandate is a heavy ask (field signal: a member accepted a "mini pledge" only verbally, possibly out of politeness). Reframe (2026-05-27): an honest comprehension **number** is the direct *operationalization and quantification* of the core. **We are betting** that giving a low number operationalizes "not pretending" — a lighter ask that keeps the essence, with paraphrase becoming the *triggered* response to a low min rather than the upfront commitment. This is an **unverified bet, not a settled fact** (see Risks). Note the mechanic's robustness comes from the **bilateral min**, not the number alone: the counterparty's lower number caps an inflated self-rating, so overconfidence is structurally capped (the Min Principle, a9/a27/a29).

**Question:** Upgrade the pledge to a v4 number-first commitment, behind the existing version flag so it can be rolled back to v3 — shipping it as provisional wording, not a settled conclusion.

## Appetite

High blast radius — wording lives across pledge surfaces (registry consumers + several hardcoded React surfaces + `full-article.md`). Medium reversibility — versioning supports rollback to v3 via one config flip; grandfathering means existing signers keep their version and are unaffected, and v4 ships with **no notification** (forward-only — see UX Notes), so there is no public artifact to "un-notify." High decision density — the v4 wording is a `[FOUNDER DECISION]`; keep-vs-collapse of the ~1% full pledge (p605) is open.

## Solution

**Ships before P857** — the pledge already has versioning infra (`PLEDGE_VERSIONS`, `profiles.pledge_version`), so it is the lower-risk surface to validate the v4 wording publicly first (no DB migration). **This spec creates the shared `VERIFIED_UNDERSTANDING_OATH` constant** — extracting the oath body from the current pledge text — and composes `PLEDGE_VERSIONS[4]` from it. P857 then references that same constant for the agreement (the min is coherent bilaterally there; text convergence is automatic via the shared constant, deploys stay independent).

Add `PLEDGE_VERSIONS[4]` behind the existing version mechanism so v3 stays intact for rollback. The v4 entry composes the pledge's **unilateral framing** (`title`, `commitmentIntro` = "I, {name}, commit to everyone — including strangers…") with the shared `VERIFIED_UNDERSTANDING_OATH[4]` body — so editing that one constant updates the pledge and the agreement together, while each keeps its own framing. Making v4 **current** is gated on `/challenge-prd` + founder sign-off. Locked v4 wording (resolved — see Open Questions):

> **YOUR RIGHT** — When we speak, please feel free to ask how well I assume I cognitively understand the intention behind what you say.
>
> **MY PROMISE** — I'll give you an honest number, from 0 (not at all) to 10 (I assume I fully understand you). At any time you can give me your own number, for how much you assume I cognitively understand you. If I explain back what I understood, without judging or criticizing, you can tell me what I missed, and ask me to explain it back again. I'll accept the lower of our two numbers as my verified understanding of your intention.
>
> **THE EXCEPTION** — If I can't give you an honest number in the moment, I'll explain why.

**Grandfathering existing signers:** the `profiles.pledge_version` column already stores which version each signer signed (defaults to 2). Existing v2/v3 signers keep their stored version; surfaces render the signer's pinned version → no forced re-affirm. *(Implementation note: verify the sign flow writes the current version at signing time so new v4 signers are recorded as 4.)*

**Surfaces (split by type — see Resolved Decisions #1):**
- **Registry consumers** (`pledge-card`, `sign-pledge-form`, `share-hub`, `profile-certificate`, `share-dropdown`, `export-certificate`) update automatically when the registry changes.
- **Hardcoded React surfaces** (`landing-v4`, `manifesto-section`, `faq-section`, `clarity-live-page`, `live-mode-view`, `clarity-chat-page`, `calibration-display`) — single-source these to `PLEDGE_VERSIONS` so they stop drifting.
- **Prose** (`full-article.md`, currently drifted to **v1**) — narrative artifact; update deliberately + covered by `/upgrade-oath` Gate 1 (stale-text sweep).

## Risks / Non-Goals

### Risks
- **ACCEPT — Wording is provisional, not field-validated.** The residual open question (after the overconfidence concern was refuted — see Resolved Decisions #4) is **complacency**: does an honestly-low min motivate the explain-back repair, or just license honest shrugging? This spec does not instrument or test that. Safety mechanism: keep v3 current until ready; observe qualitatively before making v4 current; one-flip rollback to v3.
- **MITIGATE — Canonical text change under weak evidence.** The pledge text is load-bearing and public. Mitigation: `/challenge-prd` on the v4 wording (done) + founder sign-off before v4 is made current; ship behind the version flag.

### Non-Goals
- Do NOT inline-edit the pledge text — this is a `/dev` feature (touches logic + many surfaces), not a one-line change.
- Do NOT ship v4 for the Chiang Mai event — the number + min is coherent for pairs (workshop/agreements), not the solo event audience.
- Do NOT remove v3 — keep it for rollback and existing signers.
- Do NOT finalize the v4 wording without founder sign-off + `/challenge-prd`.
- **Do NOT merge with P857.** Shared text via the constant ≠ shared deploy. Two specs ship as two independently-reversible deploys (roll back the pledge without reverting the agreement migration).
- **Do NOT instrument number-give / paraphrase events or build any funnel / calibration-slope measurement here.** The falsification apparatus (formerly P853) is dropped — decision 2026-05-31.
- Do NOT decide keep-vs-collapse of the full pledge here (p605 founder decision).

## UX Notes

- Existing signers on v3 — **grandfather** via stored `profiles.pledge_version`; v4 offered, no forced re-affirm.
- ToS references the pledge abstractly (it does **not** inline the oath) → no oath text edit in ToS; the ToS acceptance gate (`terms-acceptance-gate.tsx`) is separate from the pledge oath.
- **No notification — forward-only (resolved 2026-05-31).** Existing signers keep their version and are unaffected; only new signers see v4. Matches the v2→v3 precedent (commit `0f28d505` grandfathered silently, no notice).

## Acceptance Criteria

- [x] `PLEDGE_VERSIONS[4]` exists (composes pledge framing + shared `VERIFIED_UNDERSTANDING_OATH[4]`), v3 retained, current version switchable
- [x] Registry-consuming surfaces render v4 when current (automatic via the registry)
- [x] Hardcoded pledge surfaces single-sourced to the registry; `full-article.md` v1-drift aligned; none left silently on old text
- [x] Existing signers grandfathered via stored `profiles.pledge_version` (no forced re-affirm)
- [x] A dated founder sign-off on the exact final v4 string is recorded in `## Resolved Decisions` (2026-06-01)
- [x] Rollback to v3 is a single config change (`CURRENT_PLEDGE_VERSION`)

## Open Questions

**v4 phrasing — resolved 2026-05-31 (founder-delegated; passed through `/challenge-prd`):**
1. "what I got right and what I missed" — **kept** (covers both up- and down-revision).
2. "without judging your idea" → **"without judging or criticizing"** (parallel verbs; preserves v3's "criticism").
3. "what you share" vs "your story" → **"what you share"** (the pledge is to everyone).
4. Target referent → **"intention"** (not "intended meaning"): one stable referent across DE/RU/ES/FR.
5. Public noun → **"verified understanding"** (never "mutual" — reads as averaging).
6. Terminal noun → **"verified understanding of your intention"** (not "of you"): bookends "the intention behind what you say"; matches what's scored (see Resolved Decisions #5).

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] AC "all ~6 surfaces reflect v4" untestable — only 1 surface is version-switched; `full-article.md` drifted to v1 | Split surfaces by type (registry-auto / single-source / prose); align the article drift | Makes the AC mechanically verifiable; fixes a latent drift deliberately |
| 2 | /challenge-prd | [BLOCK] AC "passed /challenge-prd + sign-off" is circular | Replaced with "dated founder sign-off on the exact v4 string recorded here" | A public real-name oath needs explicit text approval, separable from "the skill ran" |
| 3 | /challenge-prd | [WARN] Problem asserts the reframe as settled fact (N=1 anchored) | Demoted to an explicit unverified bet | Epistemic honesty (Falsify-Before-You-Rely) |
| 4 | /challenge-prd + founder | [WARN] "a number lets the overconfident opt out" | **Refuted** | Bilateral min caps overconfidence (counterparty's lower number); speaker is incentivized to surface the gap; an honest low min already satisfies "don't pretend". Residual = complacency after an honest low min (= the ACCEPT risk), not opt-out |
| 5 | founder | Terminal noun "of you" vs "of your intention" | **"of your intention"** | Bookends the opening referent; scores intended meaning, not the whole person; consistent with #4 |
| 6 | founder | Pledge & agreement share text — merge registries? | **No** — one shared `VERIFIED_UNDERSTANDING_OATH` constant **created here (P855, ships first)**, referenced by two separate registries | Edit-once convergence + free future divergence; keeps grandfathering + framing artifact-specific |
| 7 | founder | sign-off on exact v4 string | **Approved 2026-06-01** (founder) — the exact string in Solution §"Locked v4 wording" (YOUR RIGHT / MY PROMISE / THE EXCEPTION) is signed off verbatim | A public real-name oath needs explicit text approval before v4 is made current |
| 8 | founder | Notify existing signers of v4? | **No — forward-only grandfather** | Existing signers keep their version (unchanged); matches v2→v3 precedent (commit `0f28d505`, silent grandfather). Pledge oath ≠ ToS |
| 9 | founder | Agreement pronoun framing (cross-ref P857) | we-intro + first-person oath body | Keeps the directional min crisp + the shared constant; mutuality via intro + two signatures |

## Related

- **P857** (Clarity Agreement + versioning) — **ships after**; reuses the shared `VERIFIED_UNDERSTANDING_OATH` constant this spec creates.
- **P853** (falsify / measurement design) — **archived; falsification apparatus dropped (decision 2026-05-31).**
- P854 (/live min-display — display-only, not the two-phase loop) · p605 (pledge as graduation, ~1%) · `definitions.md` Clarity Partner Agreement · a9/a29 (verified-understanding model)
- Rationale: decisions.md 2026-05-31 [product] + [content/strategy]
- Context: `pp/docs/business/chiang-mai-clarity-workshop/EVENT-STRATEGY.md`
