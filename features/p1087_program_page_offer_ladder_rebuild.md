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

> **Supersedes the offer structure set by [P937](done/2026-06-10/p937_webinar_funnel_landing_and_offers_page.md) (offers page + Free/Standard tiers) and [P951](done/2026-06-10/p951_premium_tier_stripe_offers.md) (Premium tier + Stripe links).** Those specs are not wrong; the offer they encode was retired. [P971](done/2026-06-10/p971_countdown_above_pricing.md)'s countdown stays — only the date it counts to changes.

## Blocking — the paid level has no name yet

**This spec cannot ship until the paid level is named** ([decisions.md](../docs/decisions.md) 2026-08-19 [product], the three-layer naming resolution). That decision split the naming into **Kind** (Clarity Organization — the container, never marketed), **Instance** (Clarity Practice Community · Chiang Mai / · Online — the communities themselves), and **Level** (what a member holds inside an instance: free, and paid — `[FOUNDER DECISION: name]`).

Two consequences for this page, both structural rather than cosmetic:

1. **"Clarity Practice Community" is now the name of an instance, not of this offer.** Using it as the tier heading, the SEO title, or the page lead publishes the collision to a public sales page with a Stripe subscription behind it.
2. **The paid rung stops being a separately-named product.** What it buys is events only paid members may join, visible-but-locked on the org page to every free member. That is a different page than "a third card in a pricing grid" — the upgrade path needs no pitch because the locked events *are* the pitch. Whether `/program` remains the surface that sells it, or whether the org page does, is unresolved.

Everything below is written against the offer's mechanics, which the naming decision did not change. The naming is the gate.

## Problem

**Situation:** `/program` sells the Co-Founder Program as a three-card grid — Free Platform €0, Standard €950/**pair**, Premium €2450/**pair** — above which `ProgramTimelineSection` narrates a Week 1–3 pair timeline. Both paid tiers route to one-time Stripe Payment Links. The SEO title says "Co-Founder Program" and the page is `noIndex`.

**Complication:** Two things are wrong at once.

1. **The offer changed.** The paid unit is now one **person** at **€295/month**, monthly and open-ended ([goals.md](../docs/goals.md):15 · [lean-canvas.md](../docs/lean-canvas.md):590 · [decisions.md](../docs/decisions.md) 2026-08-10, refined by founder decision 2026-08-14/19). Every price, tier name, timeline entry and FAQ on the page describes something not for sale, and both Stripe links sell retired products.
2. **The page's structure never worked.** It has one product and a three-card grid pretending it has three. The timeline describes card 2 only; card 1 is a free thing the visitor already has; card 3 is a different business. Nothing ties them, so the narrative is orphaned from the thing being bought.

**Question:** What does `/program` become so a visitor can buy the membership self-serve, book a call for anything custom, and read one coherent offer instead of three unrelated ones?

## Appetite

**High blast radius** — the only page that takes money, and the destination `/pricing` and `/offers` redirect to. A wrong Stripe link is a silent revenue outage (the exact P954 failure). **High reversibility** — copy, components and two constants; revert is one commit. **Medium decision density** — ladder, price, cadence and month arc are decided below; button labels, FAQ set and final wording are open `[FOUNDER DECISION]`.

## Solution

### Page structure — one offer owns the page

The three-card grid is removed. The membership runs top to bottom; everything else is a subordinate band beneath it.

```
1  Lead — what the paid level is, who it is for
2  What's included
3  Your first three months (the month arc)
4  Price · guarantee · countdown · ONE buy button · badging add-on line
────────────────────────────────────────────────────────────────────
5  Subordinate band, visibly lighter:
     "The platform itself is free" (one line)
     Custom Offers → book 15 minutes
6  FAQ
```

One primary action per view, per the P955 rule already in `.claude/rules/visual-qa.md`.

### The offer — the paid level, €295/month per person

- **Billing:** monthly, **open-ended**. No prepay, no minimum term. Cancel before the next month.
- **Unit:** one **person**. The pair leaves the purchase and enters the practice.
- **Group:** 3–10 people. Minimum **3 paid** or the batch rolls to the next start (3 × €295 = €885).
- **Checkout:** self-serve **Stripe subscription** Payment Link. The one-time €950/€2450 links are retired.
- **Guarantee:** full refund of month one if the first two sessions are not for them. No "no refund after delivery" clause — implied, and defensive on a page selling trust.

### Batch mechanic — batches onboard, then merge into one standing room

**Members do not join a running group.** A batch starts together and runs the 3-month arc together; coordinated delivery is impossible otherwise (a new arrival in someone else's month 2 cannot be brought along). On finishing, every batch merges into **one standing community room** — which is what open-ended billing buys after month 3.

- **Cadence: a new batch every 45 days.** A 90-day arc at 45-day spacing means **at most 2 live batches** plus the standing room = **3 sessions/week**, steady state. Batches never multiply beyond that.
- **Waiting is held by the free events** — the recorded holding pattern for the not-yet-convinced ([goals.md](../docs/goals.md):15). Maximum wait is one cadence, ~6 weeks.
- **Countdown:** keep the component, repoint the date. `COHORT_ENROLLMENT_CLOSES_ISO` (`src/app/content/webinar.ts`) is a hardcoded `2026-08-31T23:59:00+07:00` that renders the expired state permanently from September. It must resolve the **next batch start**.

### What's included — draft, `[FOUNDER DECISION: final wording]`

```
Weekly live practice sessions with your batch (3–10 people)
The nine situations every working relationship eventually hits, learned by running them
Partial Clarity Badges on the situations you cover
Practice partners on tap, so you always have someone to run a real exchange with
Help taking the practice to people in your own organization
Help opening your Clarity Organization and running your first events
The standing practice community after month three, for as long as you stay
Cancel any month. Full refund of month one if the first two sessions aren't for you
```

**Full 9-of-9 badging is NOT included** and must not be implied. Field data ([lean-canvas.md](../docs/lean-canvas.md):396, 2026-04-26): 100–180 minutes per person, founder-only certifier capacity. It is the separate Partnership Clarity Package. **Partial badges (1-of-9 from group work) ARE honest** — [hypotheses.md](../docs/hypotheses.md):385 treats them as the propagation unit.

### The month arc — draft, `[FOUNDER DECISION: final wording]`

Section chips replace `3 weeks, live · ~7 hours · a cohort of 5 pairs` with `monthly, open-ended · weekly live session · a batch of 3–10`.

```
Month 1. Practise together, and learn how and why the clarity principle works.

Weekly live sessions where you run the protocol on real disagreements. The nine
situations are the material: you learn each one by verifying you understood it,
so the practice and the theory are the same activity. You leave able to practise
deliberately rather than by imitation, and able to answer the questions you will
get asked.

Month 2. Take it to a few people you actually work with.

You pick a small number of people in your own organization and start running real
exchanges with them, with a Clarity Partner Agreement where it fits and Clarity
Letters when someone cannot sit in a session. I help you onboard them. This is
where the practice stops being yours and becomes something two people do.

Month 3. Open your Clarity Organization and start running events.

I help you set it up and design your first Clarity events, so the practice reaches
past the two or three early adopters who said yes first.
```

**No job titles anywhere in this copy.** Naming roles (CMO, co-founder, head of transformation) narrows the reader to a demographic that is explicitly untested — [lean-canvas.md](../docs/lean-canvas.md):81 holds role targeting at `PROPOSED-PENDING-CONTACT` with zero field contact. The page must stay readable by a co-founder and by a change lead in a 5,000-person company alike.

**Month 3 promises support, never a launch.** See Risks.

### Badging add-on line — under the price block

A single line offering the **Partnership Clarity Package (€1,450, four sessions, two people, full Clarity Badge)** on ladischenski.com. Two jobs: it answers "how do I get properly badged", and it puts a number above €295 at the moment the visitor reads the price. `[FOUNDER DECISION: wording and whether the FCO retainer (€2,000/month) is named here instead or as well — same billing shape as the membership, so it anchors harder.]`

### Custom Offers — unpriced, call-first

- **No price.** Hours-per-engagement are not yet observable. Revisit filed (`.private/docs/process-learnings.md`, due: month).
- **CTA → `/intro`**, the embedded appointment schedule the main landing already uses, framed as 15 minutes.
- **Must name the 90-minute introductory workshop for their team first**, then training, coaching, tooling customisation, consulting, and **coaching the member through onboarding their colleagues** (the natural month-2 upsell). Folding the workshop into the bare word "custom" deletes the entry offer from the page.
- **One qualifier line** naming who it is for, so self-selection filters bookings. No form, no gate — at current volume an unqualified call is a cheap problem.

### Guests

Non-members attend the **free events**, or come as one-time paid spectators. They never enter the paid room. Month 2's colleagues are practised with **inside the member's own organization** — they are not visitors to the batch.

### Files

- `src/app/pages/offers-page.tsx` — SEO, `noIndex`, section order
- `src/app/components/landing/offers-section.tsx` — the grid collapses to one offer + subordinate band; Stripe constants; `PaidCta`
- `src/app/components/landing/program-timeline-section.tsx` — Week 1–3 → the month arc; chips
- `src/app/content/faqs.ts` — `PROGRAM_FAQS`
- `src/app/content/webinar.ts` — `COHORT_ENROLLMENT_CLOSES_ISO`

## Risks / Non-Goals

### Risks

- **Creating a Clarity Organization is not built.** `OrganizationsService` (`src/app/data/organizations-service.interface.ts`) exposes `getOrganizationBySlug`, `getMembers`, `getMyMembership`, `joinOrganization`, `leaveOrganization` — **no create**; the interface comment records the two existing orgs as DB-seeded. `createEvent` *does* exist (`events-service-real.ts`). P1076 (org invite link) is built but unshipped on `feature/p1076-org-invite-link` in worktree w2; its spec file is not on `main`. **Mitigation:** month-3 copy promises founder help only. Never imply the member can create an organization in the app today.
- **Month 3's promise is a recorded falsifier, not a deliverable.** [lean-canvas.md](../docs/lean-canvas.md):604 — *if no member runs a verified exchange with a colleague inside 3 months, this is a peer group and not a champion engine.* Selling the launch as an outcome converts the test into a guarantee and destroys its value as a test.
- **Implying full badging oversells by 100–180 minutes per person.** Copy that says "get badged" without "partial" commits founder time that does not exist at €295.
- **Stripe misconfiguration is a silent revenue outage.** P954: env-var indirection baked empty strings into the prod bundle and every paid CTA fell to "Checkout temporarily unavailable". **Mitigation:** keep the hardcoded-constant-with-env-override pattern, the host-pinned `buy.stripe.com` validation, and `PaidCta`'s fail-loud state.
- **Founder prerequisite:** the €295/month Stripe **subscription** Payment Link must exist before ship. Dashboard action, not agent work.
- **Cross-property price drift.** ladischenski.com's `app/layout.tsx` structured data publishes €950 / €1,950 / a €2,950 workshop while the live page shows €1,450 / €2,000 and no workshop. If /program cites the badging package, it must cite the **live** €1,450. Fixing ladischenski is out of scope here.

### Non-Goals

- Do **NOT** build organization creation. Dependency, named above, its own spec.
- Do **NOT** implement rolling/anytime join, or per-batch routing beyond one start date. Batches start together.
- Do **NOT** add a free-events section or next-event CTA — that is [P1028](p1028_reusable_event_cta_across_landings.md)'s scope (`status: today`).
- Do **NOT** touch `/hiring`, `/founder`, `/coach`, `/`, `/intro`, or the calendar embed.
- Do **NOT** delete the Free Platform tier — demoted to one line, not removed.
- Do **NOT** name job titles in any page copy.
- Do **NOT** invent prices, button labels, FAQ answers or tier bullets. Every one is `[FOUNDER DECISION]`; ask.
- Do **NOT** edit the ladischenski repo from this spec.
- Do **NOT** update strategy docs here — the workshop rung folding into Custom Offers, the install leaving the public surface, and the batch cadence go through `/slava:maintain:docs-strategy-update` separately.

## Done-When

- [ ] `/program` presents ONE offer with one buy button; the three-card grid is gone
- [ ] The membership CTA opens a Stripe **subscription** checkout at €295/month; no €950 or €2450 one-time product is reachable from the site
- [ ] A deliberately invalid Stripe link renders the disabled fail-loud state, not a working-looking button — exit path exercised, not reasoned about (`.claude/rules/epistemic.md` gate 7)
- [ ] The Custom Offers CTA opens `/intro`, and the 90-minute introductory workshop is named on it
- [ ] The badging add-on line cites €1,450 (the live ladischenski price), not €950
- [ ] The timeline shows the month arc with `monthly, open-ended · weekly live session · a batch of 3–10`; `grep -rin "per pair\|co-founder program\|week 1\|5 pairs" src/app/pages/offers-page.tsx src/app/components/landing/offers-section.tsx src/app/components/landing/program-timeline-section.tsx src/app/content/faqs.ts` returns nothing
- [ ] `grep -rin "CMO\|co-founder\|head of\|CTO\|founder" ` over the same four files returns no job title used as the reader's role
- [ ] No copy states or implies full 9-of-9 badging is included, or that the member can create an organization in the app
- [ ] Guarantee copy states month-one refund after two sessions; no "no refund after delivery" clause
- [ ] The countdown shows a future batch start on any day of any month — verified by running with a system date one and two months ahead, not by reading the code
- [ ] `noIndex` removed; `/pricing` and `/offers` still redirect to `/program`
- [ ] Visual QA passed at 375px, 320px and desktop per `.claude/rules/visual-qa.md`, by a subagent that did not see the diff

## Acceptance Criteria

- [ ] A visitor can buy the €295/month membership without talking to anyone
- [ ] A visitor wanting a workshop, training, coaching or tooling reaches the 15-minute call in one click
- [ ] A visitor can tell when the next batch starts and that they join it with others, not alone
- [ ] A visitor can see the platform is free without that option competing with the paid offer
- [ ] A visitor cannot form the belief that they are buying a pair seat, a fixed term, full badging, or a guaranteed organization launch

## UI Contract

Settled values below. Everything marked `[FOUNDER DECISION]` is collected before implementation, never invented.

| Element | Value | Context |
|---|---|---|
| Offer name | `[FOUNDER DECISION: paid level name]` — NOT "Clarity Practice Community" (retired as a product name, see Blocking) | page lead |
| Price | €295 | per month, per person |
| Billing note | monthly, open-ended | under the price |
| Batch size | 3–10 | chips |
| Batch minimum | 3 paid, else rolls to next start | copy + FAQ |
| Batch cadence | a new batch every 45 days | countdown source |
| Badging add-on | Partnership Clarity Package, €1,450 | line under the price |
| Custom Offers price | *(none)* | no price displayed |
| Custom Offers CTA target | `/intro` | 15-minute call |
| Month 1 heading | Practise together, and learn how and why the clarity principle works | timeline |
| Month 2 heading | Take it to a few people you actually work with | timeline |
| Month 3 heading | Open your Clarity Organization and start running events | timeline |
| Buy button label | `[FOUNDER DECISION]` | — |
| Custom CTA label | `[FOUNDER DECISION]` | — |
| Custom qualifier line | `[FOUNDER DECISION]` | who it is for |
| Free-platform line | `[FOUNDER DECISION]` | subordinate band |
| Guarantee line | `[FOUNDER DECISION]` — must carry: full refund of month one within the first two sessions | assurance band |
| SEO title / description | `[FOUNDER DECISION]` | `offers-page.tsx` |
| FAQ set | `[FOUNDER DECISION]` | `PROGRAM_FAQS` |
