---
status: rejected
type: story
rank: 1000922
created_date: '2026-06-10'
tags:
  - coach-landing
  - clarity-badge
  - p915-followup
locked_at: '2026-06-17T10:33:00.912Z'
completed_at: '2026-08-07'
---

# P922: Clarity Badge example page — REJECTED

> **Rejected 2026-08-07 during a board priority review. Never built.** The spec serves the
> **coach** landing (P915), and the coach channel is explicitly a *later scaling option*,
> not the start: `lean-canvas.md` §active-channel reads **"Active channel (2026-07-20):
> direct-first… Investor and coach are later scaling options."** The observation is correct
> — the Badge has no on-page example where the Agreement has two — but building show-don't-
> tell for a channel nobody is currently entering through is work against a dormant path.
>
> Kept as the reasoning record. Revive if and when the coach channel is made active.


## Problem

**Situation:** The coach landing (P915) how-it-works step 1 reads "Give a Clarity Badge to your customer once they understand why gaps in understanding are normal — and how to bridge them." Step 2 (the Clarity Partner Agreement) links to an on-page example (`#agreement` → the real `AgreementCertificate`), so a coach can see what they're signing.

**Complication:** There is **no equivalent example for the Clarity Badge.** A coach reading step 1 can't see what a Clarity Badge looks like or what it certifies, so "Give a Clarity Badge" stays abstract — unlike the agreement, which has both `/partner-template` and the on-landing certificate.

**Question:** How do we give the Clarity Badge the same "show, don't tell" treatment the agreement already has, and link it from the landing?

## Appetite

**Blast radius — small.** A new static example page/section + one link from the coach landing. No schema, no badge-issuance logic.
**Reversibility — high.** New route/section + a link; git-revertable.
**Decision density — medium.** Open founder decisions: what the badge visually *is*, what it *certifies*, and whether it's a `/clarity-badge` route (parallels `/partner-template`) or an on-landing section with a `#clarity-badge` anchor.

## Solution

Mirror the agreement's pattern (`/partner-template` + the on-landing `AgreementCertificate` under `#agreement`):

1. **Design an example Clarity Badge** — a visual artifact a coach can show a customer (mirrors `AgreementCertificate`). `[FOUNDER DECISION: visual design + what the badge certifies.]`
2. **Add a route/section** to display it — either a `/clarity-badge` page (parallels `/partner-template`) or an on-landing section with a `#clarity-badge` anchor. `[FOUNDER DECISION: route vs on-landing.]`
3. **Link it from the landing** — make "Clarity Badge" in how-it-works step 1 an anchor/link to the example (parallels the existing `#agreement` link on step 2).

## Risks / Non-Goals

- Do NOT build the actual badge-issuance / verification feature — this is a **static example/template** only (like `/partner-template`).
- Do NOT block P915 ship — P915's step-1 text already references "Clarity Badge" as plain text; this adds the example + link afterward.
- Founder must define what a Clarity Badge certifies before the example copy can be written.

## Acceptance Criteria

- [ ] An example Clarity Badge renders (route or on-landing section), styled consistently with the existing certificate/template treatment.
- [ ] The coach landing's how-it-works step 1 "Clarity Badge" links to that example.
- [ ] Mobile-narrow (320px) renders without overflow.

## Notes

- Predecessor: **P915** (coach landing reframe) — the step-1 copy that motivates this.
- Pattern to mirror: `/partner-template` + `AgreementCertificate` under the landing's `#agreement` section.
