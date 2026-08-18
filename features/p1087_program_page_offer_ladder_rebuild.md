---
status: today
type: story
rank: 0.25
created_date: '2026-08-14'
tags:
  - offers
  - pricing
  - program
  - stripe
delivery_stage: create-spec
pipeline_ran:
  - create-spec
driver: heuristic
locked_at: '2026-08-17T07:29:45.667Z'
---

# P1087: Rebuild /program to the membership offer ladder

> **Supersedes the offer structure set by [P937](done/2026-06-10/p937_webinar_funnel_landing_and_offers_page.md) (offers page + Free/Standard tiers) and [P951](done/2026-06-10/p951_premium_tier_stripe_offers.md) (Premium tier + Stripe links).** Those specs are not wrong — the offer they encode was retired. [P971](done/2026-06-10/p971_countdown_above_pricing.md)'s countdown-above-cards layout is **kept**; only the date it counts to changes.

## Problem

**Situation:** `/program` sells the Co-Founder Program — Free Platform €0, Standard €950/**pair**, Premium €2450/**pair**, both paid tiers routing to one-time Stripe Payment Links. The page's supporting furniture matches that offer: the SEO title says "Co-Founder Program", the page is `noIndex`, `ProgramTimelineSection` renders a Week 1–3 pair timeline, and `PROGRAM_FAQS` answers pair questions.

**Complication:** The offer ladder was replaced on 2026-08-10 ([decisions.md](../docs/decisions.md) 2026-08-10 · [goals.md](../docs/goals.md):15 · [lean-canvas.md](../docs/lean-canvas.md):590) and refined by founder decision on 2026-08-14. The paid unit is now **one person, €295/month, monthly and open-ended** — not €950 per pair. The pair is no longer the purchase unit; it moved into the practice. Every price, tier name, CTA, timeline and FAQ on the page now describes an offer that is not for sale, and both Stripe links sell products that no longer exist.

**Question:** What does `/program` become so that a visitor can buy the membership self-serve, book a call for anything custom, and see nothing that contradicts the live ladder?

## Appetite

**High blast radius** — this is the only page where money is taken, and it is the destination `/pricing` and `/offers` redirect to. A wrong Stripe link is a silent revenue outage (the exact failure P954 was filed for). **High reversibility** — copy, components and two constants; revert is one commit. Stripe links are config, replaceable without a deploy if the env override is used. **Medium decision density** — the ladder, prices and month arc are decided (below); button copy, the free-platform band wording, custom-tier bullets and the FAQ set are open `[FOUNDER DECISION]`.

## Solution

Three tiers replace the current three. The countdown stays above the cards (P971).

### Tier 1 — Free Platform: kept, demoted out of the card grid

No longer a pricing card. It becomes a **single line beneath the offers** stating the platform itself is free and open-source, with a link into the app. It must not carry visual weight comparable to the paid tier — a free option rendered as a peer card competes with the thing being sold.

`[FOUNDER DECISION: exact wording of the free-platform line]`

### Tier 2 — Clarity Practice Community: €295 / month, per person

Replaces "Standard Program €950/pair".

- **Billing:** monthly, **open-ended**. No 3-month prepay, no minimum term. Cancel before the next month.
- **Unit:** one **person**, not a pair. The pair requirement leaves the purchase and enters the practice — members practice with each other.
- **Group:** 3–10 people, one weekly session.
- **Checkout:** self-serve **Stripe subscription** Payment Link. The current one-time links (`STRIPE_STANDARD_URL`, `STRIPE_PREMIUM_URL`) are retired.
- **Guarantee:** full refund of month one if the first two sessions are not for them. No "we cannot refund after delivery" clause — implied, and defensive on a page selling trust.
- **Curriculum, published as the *member's own* months** (see Join mechanic — these are personal milestones, not a group cohort track):
  - **Month 1** — badging.
  - **Month 2** — practising with others; discussing frictions.
  - **Month 3** — opening their own Clarity Organization and running events, **with founder support**.

### Tier 3 — Custom Offers: unpriced, call-first

Replaces "Premium Program €2450".

- **No price.** Deliberate — hours-per-engagement are not yet observable. Revisit filed (`.private/docs/process-learnings.md`, due: month).
- **CTA → `/intro`** (the embedded Google appointment schedule the main landing's CTA already uses), framed as a 15-minute call.
- **The card must name the 90-minute introductory workshop for their team as the first listed option**, then training, coaching, tooling customisation, and consulting on spreading clarity. The workshop is the entry offer; folding it into the bare word "custom" deletes it from the page.

`[FOUNDER DECISION: the custom-tier bullet wording and the CTA label]`

### Join mechanic — monthly join dates into ONE shared session

New members join on a monthly date. They all join **the same weekly session** — a new cohort with its own session does **not** start each month.

**Why:** parallel cohorts multiply founder delivery time (three tracks by month 3 ≈ 12 sessions/month against ~4) and split 3–10 people three ways. Mixed tenure is a feature: a new member's month-1 badging partner is a month-2 member who needs someone to practise with, which is what month 2 *is*.

- The **minimum-3-paid gate applies to the first start only.** If fewer than 3 have paid, that start rolls to the next month. Once the group exists, a later joiner needs no minimum.
- **Countdown:** keep the component; repoint the date. `COHORT_ENROLLMENT_CLOSES_ISO` (`src/app/content/webinar.ts`) is a single hardcoded value (`2026-08-31T23:59:00+07:00`) that will render the expired state permanently from September. It must resolve the **next monthly join date**.

### Guests

Outsiders attend the **free events** the founder runs, or come as one-time paid spectators — never into the paid member sessions. This is the already-recorded guest rung ([goals.md](../docs/goals.md):15) and it is what keeps month 3 (*their* turn to host) distinct from month 2.

### Page collateral

| Surface | Now | Becomes |
|---|---|---|
| SEO title / description | "Co-Founder Program … €950 per pair" | Clarity Practice Community `[FOUNDER DECISION: copy]` |
| `noIndex` | set | removed |
| `ProgramTimelineSection` | Week 1–3 pair timeline | the Month 1–3 arc |
| `PROGRAM_FAQS` | pair-program questions | rewritten `[FOUNDER DECISION: content]` |
| Route | `/program` | unchanged (`/pricing`, `/offers` keep redirecting) |

**Free events do not get a section on this page.** They surface under a tag, and CTA consolidation is owned by [P1028](p1028_reusable_event_cta_across_landings.md) (`status: today`).

### Files

- `src/app/pages/offers-page.tsx` — SEO, `noIndex`, section order
- `src/app/components/landing/offers-section.tsx` — tiers, prices, bullets, Stripe constants, `PaidCta`
- `src/app/components/landing/program-timeline-section.tsx` — Week 1–3 → Month 1–3
- `src/app/content/faqs.ts` — `PROGRAM_FAQS`
- `src/app/content/webinar.ts` — `COHORT_ENROLLMENT_CLOSES_ISO`

## Risks / Non-Goals

### Risks

- **Opening a Clarity Organization is not built.** `OrganizationsService` (`src/app/data/organizations-service.interface.ts`) exposes `getOrganizationBySlug`, `getMembers`, `getMyMembership`, `joinOrganization`, `leaveOrganization` — **no create method**; the interface comment records that the two existing orgs are DB-seeded. `createEvent` *does* exist (`events-service-real.ts`). P1076 (org invite link) is built but unshipped on `feature/p1076-org-invite-link` in worktree w2 — its spec file is not on `main`, so there is no link to it from here. **Mitigation:** month-3 copy promises **founder support**, never a self-serve launch, until an org-creation spec ships. Do not write copy that implies the member can create an organization in the app today.
- **Month 3's promise is a recorded falsifier, not a deliverable.** [lean-canvas.md](../docs/lean-canvas.md):604 — *if no member runs a verified exchange with a colleague inside 3 months, this is a peer group and not a champion engine*. Selling the launch as an outcome converts the test into a guarantee and destroys its value as a test. **Mitigation:** the deliverable is the founder's help designing and running their first event; the launch is the member's.
- **Stripe misconfiguration is a silent revenue outage.** P954: env-var indirection baked empty strings into the prod bundle and every paid CTA fell back to "Checkout temporarily unavailable". **Mitigation:** keep the hardcoded-constant-with-env-override pattern and the host-pinned `buy.stripe.com` validation; keep `PaidCta`'s fail-loud behaviour. A subscription link that 404s must not render as a working button.
- **Nothing anchors €295.** It becomes the only number on the page — the €4,500 install price leaves the public surface with the Premium tier. Accepted deliberately by founder decision; revisit filed (due: month).
- **Founder prerequisite:** the €295/month Stripe **subscription** Payment Link must exist before this can ship. Creating it is a founder action in the Stripe dashboard, not agent work.

### Non-Goals

- Do **NOT** build organization creation. It is a dependency, named above, and belongs in its own spec.
- Do **NOT** add a free-events section, event list, or next-event CTA to this page — that is P1028's scope.
- Do **NOT** touch `/hiring`, `/founder`, `/coach` or the `/` landing. Their CTAs point at `/intro` and stay as they are.
- Do **NOT** change `/intro` or the calendar embed.
- Do **NOT** delete the Free Platform tier. It is demoted, not removed.
- Do **NOT** invent prices, button labels, FAQ answers, or the custom-tier bullets. Every one is `[FOUNDER DECISION]`; ask.
- Do **NOT** implement a per-cohort session track or per-cohort routing. One shared weekly session.
- Do **NOT** update the strategy docs from this spec — the workshop rung folding into Custom Offers and the install leaving the public surface go through `/slava:maintain:docs-strategy-update` separately. (Monthly open-ended billing is already recorded correctly and needs no change.)

## Done-When

- [ ] `/program` shows exactly two priced/actionable cards — Clarity Practice Community (€295/month) and Custom Offers (no price) — plus a free-platform line that is not a card
- [ ] The membership CTA opens a Stripe **subscription** checkout for €295/month; no one-time €950 or €2450 product is reachable from the site
- [ ] A deliberately invalid Stripe link renders the disabled fail-loud state, not a working-looking button (exercise the failure path — `.claude/rules/epistemic.md` gate 7)
- [ ] The Custom Offers CTA opens `/intro`
- [ ] The 90-minute introductory workshop is named on the Custom Offers card
- [ ] The timeline section shows the Month 1–3 arc; no "Week 1–3" or pair-program text remains anywhere on the page (`grep -ri "per pair\|co-founder program\|week 1" src/app/pages/offers-page.tsx src/app/components/landing/offers-section.tsx src/app/components/landing/program-timeline-section.tsx src/app/content/faqs.ts` returns nothing)
- [ ] The countdown shows a future date on any day of any month — verified by running it with a system date in the following month, not by reading the code
- [ ] `/program` is indexable (`noIndex` removed); `/pricing` and `/offers` still redirect to it
- [ ] Month-3 copy promises founder support, and nowhere states or implies the member can create an organization in the app
- [ ] Guarantee copy states month-one refund after two sessions; the "no refund after delivery" clause is absent
- [ ] Visual QA passed at 375px, 320px and desktop against `.claude/rules/visual-qa.md`, by a subagent that did not see the diff

## Acceptance Criteria

- [ ] A visitor can buy the €295/month membership without talking to anyone
- [ ] A visitor who wants a workshop, training, coaching or tooling reaches the 15-minute call in one click
- [ ] A visitor can see that the platform itself is free without that option competing with the paid tier
- [ ] A visitor reading the page cannot form the belief that they are buying a pair seat, a fixed 3-month term, or a guaranteed organization launch

## UI Contract

Values below are settled. Everything marked `[FOUNDER DECISION]` must be collected before implementation, not invented.

| Element | Value | Context |
|---|---|---|
| Tier 2 name | Clarity Practice Community | card heading |
| Tier 2 price | €295 | per month, per person |
| Tier 2 billing note | monthly, open-ended | under the price |
| Tier 3 name | Custom Offers | card heading |
| Tier 3 price | *(none)* | no price displayed |
| Tier 3 CTA target | `/intro` | 15-minute call |
| Month 1 label | badging | timeline |
| Month 2 label | practising with others; discussing frictions | timeline |
| Month 3 label | opening your own Clarity Organization and running events | timeline |
| Tier 2 CTA label | `[FOUNDER DECISION]` | — |
| Tier 3 CTA label | `[FOUNDER DECISION]` | — |
| Free-platform line | `[FOUNDER DECISION]` | below the cards |
| Guarantee line | `[FOUNDER DECISION]` — must carry: full refund of month one within the first two sessions | assurance band |
| SEO title / description | `[FOUNDER DECISION]` | `offers-page.tsx` |
| FAQ set | `[FOUNDER DECISION]` | `PROGRAM_FAQS` |
