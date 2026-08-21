---
status: qa
type: story
rank: 0.25
created_date: '2026-08-14'
tags:
  - offers
  - pricing
  - program
  - stripe
delivery_stage: ship
pipeline_plan:
  - create-spec
  - dev
  - verify
pipeline_ran: [create-spec, dev, ship]
pipeline_skipped:
  - "challenge-prd -- spec's own Risks section already names the falsifiers (month-3 promise, org-creation gap, badging oversell) with mitigations"
  - "ux -- design already fully specified in Solution (page structure, month arc) and UI Contract, nothing undecided left but wording"
  - "architect -- no new architecture; reuses the existing verified Stripe host-pinned-validation + fail-loud pattern, folded into dev's own checks"
  - "generate-tests -- the one new business logic (countdown date resolution) is covered by dev's own TDD, no separate pass needed"
  - "decompose -- 5 files but one cohesive page rebuild, not independent concerns"
driver: heuristic
flow: dev
locked_at: '2026-08-17T07:29:45.667Z'
---

# P1087: Rebuild /program to the membership offer ladder

> **Supersedes the offer structure set by [P937](done/2026-06-10/p937_webinar_funnel_landing_and_offers_page.md) (offers page + Free/Standard tiers) and [P951](done/2026-06-10/p951_premium_tier_stripe_offers.md) (Premium tier + Stripe links).** Those specs are not wrong; the offer they encode was retired. [P971](done/2026-06-10/p971_countdown_above_pricing.md)'s countdown stays — only the date it counts to changes.

## Naming — resolved 2026-08-20

The paid-level naming block ([decisions.md](../docs/decisions.md) 2026-08-19 [product], the three-layer naming resolution: Kind = Clarity Organization, unmarketed container; Instance = Clarity Practice Community · Chiang Mai / · Online; Level = what a member holds inside an instance) is settled: the paid level is named **Clarity Champions** — deliberately not "community" (that word stays reserved for Instance names, which is the exact collision that triggered this naming pass) and worn from day one of payment, not only after month 3 (graduation is when the name is *earned in practice*, not when it's first granted).

`/program` stays the sales surface, unchanged in mechanism — self-serve, no qualifying call. Two reasons converged: (1) the founder's own funnel already double-qualifies before anyone reaches this page — free-event attendance first, the money-back guarantee second — so a call gate would be a third, redundant filter; (2) at the event, the founder's own instinct was "go to `/program`," not "go to `/intro`" — confirming self-serve was always the intended path for standard membership interest. `/intro` stays reserved for what it already covers: workshops, training, org-level asks — never the standard membership path.

**New, small addition:** `/program` and `/org/cm` (and `/org/online` once it exists) cross-link — `/program` references what a member's practice community looks like; the org page's locked paid-only events (already decided to show free members, per the naming resolution) link back to `/program` to buy. Neither page gates the other; it's discovery in both directions, not a funnel stage.

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
7  Cross-link to /org/cm (and /org/online once it exists) — "see what a practice
   community looks like" — discovery, not a gate
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

### What's included — confirmed, ship as written

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

### The month arc — confirmed, ship as written

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

A single line offering the **Partnership Clarity Package (€1,450, four sessions, two people, full Clarity Badge)** on ladischenski.com. Two jobs: it answers "how do I get properly badged", and it puts a number above €295 at the moment the visitor reads the price. **Resolved, see UI Contract** — wording leads with personalized delivery, not badge status; the FCO retainer (€2,000/month) is deliberately NOT named here, it anchors the wrong direction against €295/month.

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
- Do **NOT** add a qualifying call gate in front of the membership CTA — self-serve is the confirmed mechanism (see Naming). `/intro` stays reserved for Custom Offers only.
- Do **NOT** build the `/org/cm` → `/program` reverse link (locked events pointing back to buy) — that lives with the locked-events-on-org-page mechanic, [P1060](p1060_link_events_to_organizations.md)'s territory. This spec only adds the one outbound link, `/program` → `/org/cm`.

## Done-When

- [x] ~~`/program` presents ONE offer with one buy button; the three-card grid is gone~~ **REVISED at founder UAT** → `/program` presents a THREE-card ladder with exactly ONE selected card and ONE primary buy button. What P1087 was actually retiring was the *P951 Standard/Premium/Free tiers*, not the three-card shape; collapsing to a single card also lost the CTA consistency the page used to have. Verified: e2e asserts zero "Standard Program"/"Premium Program" headings and all three new headings present; unit test asserts exactly one `.border-2.border-blue-500` card and exactly one `bg-blue-500` CTA
- [x] The membership CTA opens a Stripe **subscription** checkout at €295/month; no €950 or €2450 one-time product is reachable from the site — `STRIPE_STANDARD_URL`/`STRIPE_PREMIUM_URL` deleted; one `STRIPE_MEMBERSHIP_URL` remains; €950/€2450 grep-confirmed absent from all four scoped files. **Prerequisite discharged at UAT:** the live product/price/payment-link were created via the Stripe API at founder request (see UI Contract), the link returns HTTP 200, and both the e2e smoke test and a unit test assert the CTA points at a `buy.stripe.com` URL with no fail-loud state on the page
- [x] A deliberately invalid Stripe link renders the disabled fail-loud state, not a working-looking button — exit path exercised, not reasoned about — the real current default (link genuinely unset) was rendered and screenshotted; unit test asserts the fail-loud text and absence of the buy link. Disabled styling was also tightened (bg-muted, not a dimmed blue) after a visual-QA subagent flagged it as reading too close to "still active"
- [x] The Custom Offers CTA opens `/intro` — e2e test clicks the CTA and asserts the URL. **REVISED at UAT:** the "90-minute introductory workshop" line was cut (it read as a second, conflicting commitment next to a "Book 15 minutes" button); the card now names training, coaching and consulting instead, asserted by unit test
- [x] The badging add-on line cites €1,450 (the live ladischenski price), not €950 — component test + screenshot confirm
- [x] The timeline shows the month arc with `weekly live session · a batch of 3–10`; the banned-phrase grep returns nothing (verified live). **REVISED at UAT:** the `monthly, open-ended` chip was cut as a restatement of the "/ month" price line
- [x] The job-title grep returns no job title used as the reader's role in this page's own copy — residual matches are all benign, not P1087 copy: the restored `PROGRAM_FAQS` (co-founder-pair content, correctly reinstated for `/founder` after a code-review catch — see commit history), pre-existing `KEY_HIRE_FAQS` unrelated to this page, a consented testimonial's own real title, and a `cto` substring inside "introductory". `CHAMPIONS_FAQS` and the rest of the actual `/program` copy carry no job titles
- [x] No copy states or implies full 9-of-9 badging is included, or that the member can create an organization in the app — component test asserts absence of "full Clarity Badge"/"9-of-9"; month-3 copy says "I help you set it up," never "you create it"
- [x] Guarantee copy states month-one refund after two sessions; no "no refund after delivery" clause — component test + screenshot confirm. **REVISED at UAT:** moved OUT of the offer card into a shared band below the grid (pre-P1087 placement) and scoped to Champions by name; unit test asserts no `.rounded-2xl` card contains it and that its text names the offer
- [x] The countdown shows a future batch start on any day of any month — verified by running with a system date one and two months ahead, not by reading the code — `src/tests/p1087-next-batch-start.test.ts` uses `vi.setSystemTime` at +1 and +2 months and asserts the result is still in the future
- [x] `noIndex` removed; `/pricing` and `/offers` still redirect to `/program` — verified live: rendered `<meta name="robots" content="index, follow">`, both redirects confirmed in-browser and by e2e test
- [x] Visual QA passed at 375px, 320px and desktop per `.claude/rules/visual-qa.md`, by a subagent that did not see the diff — see Next Steps note: one real finding (disabled-button contrast) was fixed and re-verified in-browser; the subagent's other finding (header "ghosting") was demonstrated to be a screenshot-timing artifact from instant scroll outrunning the page's fade-in animation, not a real defect, via an A/B screenshot at the same scroll position with a settle delay

## Acceptance Criteria

- [x] A visitor can buy the €295/month membership without talking to anyone — self-serve CTA reachable in one click, now pointing at the live Stripe subscription checkout (created at UAT; link verified HTTP 200). The fail-loud path remains covered by unit tests that blank the env var
- [x] A visitor wanting a workshop, training, coaching or tooling reaches the 15-minute call in one click
- [x] A visitor can tell when the next batch starts and that they join it with others, not alone — live countdown labeled "Next batch starts in," plus "a batch of 3–10" chip and bullets
- [x] A visitor can see the platform is free without that option competing with the paid offer — **REVISED at UAT:** the founder cut the subordinate free-platform link from this page as "spam". The fact is still available here via the FAQ pair "How is this different from the free platform?" ("The platform is the tool, always free"), and the free platform remains promoted on `/` and in the nav. P955 unaffected: still exactly one full-width primary action
- [x] A visitor cannot form the belief that they are buying a pair seat, a fixed term, full badging, or a guaranteed organization launch — copy states per-person/open-ended/partial badging/founder-assisted org setup throughout

## UI Contract

Settled values below. Everything marked `[FOUNDER DECISION]` is collected before implementation, never invented.

| Element | Value | Context |
|---|---|---|
| Offer name | Clarity Champions — NOT "Clarity Practice Community" (that name is reserved for the free Instance, see Naming) | page lead |
| Price | €295 | per month, per person |
| Billing note | ~~monthly, open-ended~~ **CUT at UAT** — the price line already reads "/ month"; the FAQ still defines "open-ended" | was: under the price + chips |
| Batch size | 3–10 | chips ONLY — cut from the membership bullet at UAT (stated twice) |
| Batch minimum | 3 paid, else rolls to next start | copy + FAQ |
| Batch cadence | a new batch every 45 days | countdown source |
| Badging add-on | Partnership Clarity Package, €1,450 | line under the price |
| Custom Offers price | *(none)* | no price displayed |
| Custom Offers CTA target | `/intro` | 15-minute call |
| Month 1 heading | Practise together weekly, and learn why the clarity principle works. | timeline — **one sentence, no second paragraph** (UAT) |
| Month 2 heading | Take it to a few people you actually work with. | timeline — one sentence |
| Month 3 heading | Open your Clarity Organization and run your first events. | timeline — one sentence |
| Month explainer paragraphs | *(none)* | **CUT at UAT** — "just need one sentence, what's the goal of this month, and not too much info" |
| Buy button label | "Start at €295/month" | — |
| Custom CTA label | "Book 15 minutes" | — |
| Custom Offers bullets | "Training, coaching, and consulting, shaped around your situation" · "For a team, a department, or one person" | UAT: "be more specific… custom training, coaching, and consulting", and NOT co-founder-only |
| Free-platform line | *(none)* | **CUT at UAT** ("spam") — the free platform is still covered by the FAQ pair "How is this different from the free platform?" |
| `/org/cm` cross-link | *(none)* | **CUT at UAT** ("spam") — reverses the 2026-08-20 founder decision that added it |
| Webinar fallback under the broken CTA | *(none)* | **CUT at UAT** ("spam") — the disabled control alone states the fact |
| Guarantee line | "Clarity Champions is risk-free: try the first two sessions, and if it's not for you, full refund on month one." | assurance band **BELOW the grid**, not inside a card (UAT question: "do we really put it inside the package… or outside as it was before?" — outside, matching the pre-P1087 shared band). Scoped to Champions by name because the other two rungs don't carry it. |
| SEO title / description | Title: "Clarity Champions — Clarity Pledge" · Description: "Weekly live practice with a small batch of peers, €295/month, cancel anytime. Full refund if the first two sessions aren't for you." | `offers-page.tsx` |
| FAQ set | See below | `PROGRAM_FAQS` |
| Badging add-on line | ~~footnote under the price~~ **PROMOTED at UAT to its own card** — the Partnership Clarity Package is rung 2 of a three-card ladder, not fine print. Bullets: "Four 1:1 sessions, run personally rather than in a batch" · "For two people who work together" · "Booked and delivered on ladischenski.com". CTA "See the package" → `https://ladischenski.com`. (FCO retainer still NOT named — anchors the wrong direction against €295/month.) | card 2 of 3 |
| Offer ladder | THREE cards, one selected: Clarity Champions €295/month (selected, primary CTA) · Partnership Clarity Package €1,450 one-off · Custom Offers, unpriced ("Custom") | UAT: "maybe they should be like two packages near each other, like we did in the past… and the third one, the Clarity Partnership Package — if it is, let's put it. I think one of them is selected." |
| CTA geometry | All three CTAs `h-12 w-full`; ONLY Champions is filled blue (P955: one primary action) | UAT: "they have to be consistent as before. Before we had the consistency, and now we don't anymore." |
| Countdown position | Directly under the page title, above the month arc | UAT: "the next batch starts maybe much higher — maybe it's the first thing" |
| Stripe membership link | `https://buy.stripe.com/fZu8wPchH88D9ZFaGo1Jm09` — hardcoded default (P954), env-overridable. Live `price_1U6UwuFXhjM6Ief0bOfULOPg`: €295/month EUR recurring, `tax_behavior=exclusive`, automatic tax + VAT-ID collection on, redirect to `/signup` | created live at founder request during UAT |
| Countdown anchor | First batch starts **2026-10-01**. Every subsequent batch = anchor + 45×N days, computed forward from today, never hardcoded again | `COHORT_ENROLLMENT_CLOSES_ISO` replacement logic |

**FAQ set (`PROGRAM_FAQS`) — 5 pairs:**

1. Q: "What happens if fewer than 3 people sign up for a batch?" A: "Your batch rolls to the next start, 45 days later. You're not charged until your batch actually runs."
2. Q: "Can I cancel anytime?" A: "Yes. Month-to-month, no minimum term. Cancel before the next billing date and you're not charged again."
3. Q: "What does 'open-ended' mean?" A: "No fixed end date. After your batch's first three months, you move into the standing practice community and stay as long as you keep paying, no re-enrollment."
4. Q: "What if the first two sessions aren't for me?" A: "Full refund of month one. No questions."
5. Q: "How is this different from the free platform?" A: "The platform is the tool, always free. The membership is the room: a live batch, a facilitator, and eventually the standing community."

**Guests confirmed as spec'd:** no one joins another member's batch. Colleagues (month 2) are practiced with inside the member's own organization, never as visitors to the shared room — consistent with "batches start together" (Non-Goals).

---

## Shipped shape — deltas from the spec above (UAT rounds 1–6)

The spec body describes the design as approved. Six rounds of founder UAT changed it
materially, and the Acceptance Criteria above are still met in substance but not always in
wording. What actually shipped:

**Canonical URL flipped.** `/pricing`, not `/program`. `/program` and `/offers` redirect
in; the sitemap lists only `/pricing`. Anywhere the spec says "/program", read "/pricing".

**Page order reversed.** Pricing grid first, then what Champions is + the month arc, then
testimonials, then a Champions-only closing CTA with its own heading, then the FAQ. The
original order described one program at length and *then* showed three cards, so the grid
read as three sizes of that program rather than three distinct offers.

**The month arc runs to four.** "Month 4 and beyond" was added: the price is monthly and
open-ended, so an arc stopping at three read like a course that then charges forever.

**Bullets are benefit-led, not feature lists.** Founder diagnosis: three feature lists made
three offers look alike, because features are the axis on which they genuinely overlap.
Each card now names who has the problem; its last bullet is the outcome.

**The €1,450 Partnership package buys directly.** A live Stripe product was created during
UAT (`prod_V705q5JLbzLr1s` / `price_1U6m5aFXhjM6Ief0P1Zns7JE`, EUR one-off, automatic tax +
VAT ID). It no longer routes to `/intro` — the 15-minute call is the gate for work that
must be *scoped* before it can be priced, which a fixed-price fixed-deliverable package is
not. AC #2 still holds: the unpriced Coaching/Training/Consulting rung keeps the call.

**Countdown label and placement.** AC #3 says "Next batch starts in"; it ships as "Next
Clarity Champions batch starts in" and sits with the batch facts inside the Champions
section. It moved three times across rounds 3–5; an e2e assertion now pins where it landed.

**SITE-WIDE nav changes — beyond this spec's stated scope, done at founder request.** The
four audience landings collapsed under a "Use cases" dropdown beside a new "Pricing" link,
rendered from one shared `PUBLIC_NAV_GROUPS` structure (Use cases → Product → Learn) by
both the mobile sandwich and the desktop hamburger. Self-filtering was removed everywhere:
the page you were on used to be the one entry missing from the list. The nav's marketing
CTA is suppressed on the pricing URLs.

**Adversarial review (3 hostile reviewers): 2 HIGH, 4 MEDIUM, all fixed.** The two HIGHs
are worth carrying forward. (1) A single CTA-suppression flag also hid the logged-in
"Start a Clarity Session" button on `/pricing`; the bottom nav has no `/live` entry, so a
signed-in user had no route to the core product from anywhere in the chrome. Split into
`hideMarketingCta` / `hideSessionCta`. (2) `CHAMPIONS_FAQS` had zero coverage of any kind,
while its answers make contractual claims (billing trigger, cancellation, refund scope)
that overlap the assurance band — the tests now bind the two so they cannot drift apart.

**Known-stale, deliberately not fixed here:** `e2e/p967-calibration-breakdown.spec.ts:371`
asserts a CTA absent from `src/` on this branch *and* on main — a pre-existing orphan,
verified by grep on both, outside this branch's scope.

**Unverified by any test, flagged for the founder:** the analytics `tier` values changed
(`program`/`premium` → `membership`/`partnership`/`custom`), so any live Mixpanel funnel
keyed on the old strings is silently broken — nothing in the repo defines dashboards, so
this could not be checked here. And no test proves the hardcoded Stripe link IDs actually
correspond to the described prices; that is an infra fact, not a component-testable one.
