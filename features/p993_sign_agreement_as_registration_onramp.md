---
status: backlog
type: story
rank: 76
created_date: '2026-07-15'
tags: [registration, agreement, pledge, front-door]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P993: Sign your clarity partner agreement as the registration on-ramp (substitute for "Take the Pledge")

## Problem

**Situation:** The cp homepage (`/`) offers a low-commitment secondary door — a "Take the Pledge" text link → `/sign-pledge` — alongside the primary "Book your free alignment audit" CTA. Taking the pledge is how a visitor who isn't ready to book a call starts registration. It is solo: you pledge alone, and a `PledgerAvatarStack` provides the social proof.

**Complication:** The pledge is not the thing the product is about. The **Clarity Partner Agreement** is — it's the artifact the method produces, it already renders on `/` as a TEMPLATE-stamped demo (`AgreementCertificate` + `CURRENT_AGREEMENT_VERSION`), and it has a real signing path (`accept-agreement-page.tsx` → `agreementsService.acceptAgreement()`, backed by an `agreements` table with RLS). But that path is **bilateral**: you create an agreement *with* a named counterparty, they're invited, they accept. A cold anonymous visitor has no counterparty. So the artifact the page shows off cannot currently be the door the page opens.

**Question:** Can signing the agreement become the solo, low-commitment registration on-ramp that "Take the Pledge" is today — without breaking the agreement's bilateral meaning, which is the entire point of it?

## Appetite

**Medium-high blast radius** — touches the public front door's secondary CTA, the registration entry path, and the agreement data model's assumption that an agreement has two parties. **Reversibility: good** — the pledge flow stays intact behind it until this replaces it; revert = point the link back at `/sign-pledge`. **Decision density: HIGH** — the central question below is unresolved and is a genuine product decision, not an implementation choice. This spec exists to hold the decision, not to pre-empt it.

## Solution / Approach

Deliberately **not designed here.** The founder deferred this during P987: *"in future i guess we can substitute take the pledge with sign your clarity partner agreement — once there is a way to sign it as part of registration… we don't do it now."* What this spec fixes in place is the **question** and the **blocker**, so the next session doesn't rediscover them.

The unresolved fork, which any solution must answer first:

- **(A) Solo signature.** A visitor signs the agreement alone — a commitment to *how they'll work with whoever comes next*, counterparty added later. Preserves the low-commitment door exactly as the pledge works today. Cost: an agreement with one party is, semantically, a pledge with better branding — this may be a rename, not a product change. Ask honestly whether it earns the build.
- **(B) Sign-then-invite.** Registration creates the agreement and prompts for a counterparty. Higher intent, real bilateral meaning preserved. Cost: it is no longer a *low-commitment* door — naming a person is a bigger ask than booking a call, which inverts the CTA hierarchy on `/`.
- **(C) Neither.** The pledge stays; the agreement is the paid artifact, not the door.

Whichever wins, the outcome must be reconciled with the `PledgerAvatarStack` — social proof for a pledge nobody takes any more is dead weight at the fold.

## Risks / Non-Goals

### Risks
- **The rename trap.** MITIGATE: option A may deliver a renamed pledge and a migration for no behaviour change. Before building, state what a signer can *do* that a pledger cannot. If the answer is "nothing," this is a copy change, not a feature.
- **Inverting the CTA hierarchy.** MITIGATE: P955 permits one full-width primary; the pledge link is subordinate *because* it's low-commitment. Option B raises the secondary's commitment above the primary's — re-test the hierarchy if B wins.
- **Breaking the bilateral invariant.** MITIGATE: the `agreements` table and its RLS assume two parties (see `p422`, `p453` migrations). A one-party agreement is a data-model change with existing consumers — grep them before designing.

### Non-Goals
- **Do NOT build this now.** Filed to backlog by founder decision during P987.
- **Do NOT remove "Take the Pledge" or `PledgerAvatarStack`** until the replacement ships — P987 deliberately restored both.
- **Do NOT change the paid agreement flow** (`create-agreement-page`, `accept-agreement-page`) — this is about the *entry door*, not the existing bilateral product.
- **Do NOT alter `CURRENT_AGREEMENT_VERSION` or the agreement's text** as part of this.
- **Do NOT decide the fork in an architect pass** — it's a `[FOUNDER DECISION]`.

## Done-When

- [ ] The A/B/C fork above is resolved by the founder, with the reasoning recorded
- [ ] If A or B: a visitor arriving cold on `/` can start registration by signing the agreement, and the secondary CTA reads accordingly
- [ ] The pledge flow (`/sign-pledge`) and `PledgerAvatarStack` are either retired deliberately or kept deliberately — not left as orphans
- [ ] The bilateral invariant is either preserved or explicitly and knowingly relaxed, with the RLS consequences named
- [ ] P987's hero still has exactly one full-width primary (P955)

## Acceptance Criteria

- [ ] A cold visitor not ready to book a call still has a lower-commitment door into the product
- [ ] The artifact the homepage demonstrates and the artifact registration produces are the same thing

## Open Questions for /challenge-prd

1. Does a solo-signed agreement mean anything the pledge doesn't? If not, is this a copy change?
2. Is the low-commitment door load-bearing at all, given `/`'s job is now a cold-outreach credibility surface rather than an inbound funnel (decisions.md 2026-07-15)?

**Supersedes on landing:** the pledge secondary CTA + `PledgerAvatarStack` restored by P987 (`features/p987_cp_front_door_realignment.md`).
