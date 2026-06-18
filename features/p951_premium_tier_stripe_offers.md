---
status: in-progress
type: story
rank: 1000938.0
workstream: C2
created_date: '2026-06-18'
tags: [offers, pricing, stripe, premium]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P951: Premium tier + Stripe Payment Links on /offers

## Problem

**Situation:** `/offers` shows two tiers — Platform (Free) and Co-Founder Program
(€950/pair). The program CTA routes to webinar registration because no Stripe link
was provisioned (`STRIPE_PAYMENT_URL = ""`).
**Complication:** We now want a third, higher tier to (a) deliver deep "kill the
illusion of understanding" value — personal verification of the 9 stories with an
issued Clarity Badge plus guidance on one real high-stakes conversation — and (b) act
as a price **anchor** that makes the €950 the obvious middle choice. Stripe products
and Payment Links now exist for both paid tiers.
**Question:** How do we add the premium tier to `/offers` only (not the landing) and
route both paid CTAs straight to Stripe checkout, without leaking any Stripe keys into
the client bundle?

## Appetite

Low blast radius — one component (`offers-section.tsx`), additive. The landing
(compact variant) must stay byte-for-byte equivalent in behavior. Fully reversible
(remove the card + revert routing). Low decision density — pricing, copy, and links
are all decided (see UI Contract).

## Solution

Single file: `src/app/components/landing/offers-section.tsx`.

1. Replace the empty `STRIPE_PAYMENT_URL` constant with two values read from
   `import.meta.env`: `VITE_STRIPE_STANDARD_URL` and `VITE_STRIPE_PREMIUM_URL`
   (payment-link URLs are public; `VITE_` exposure is correct — no secret key).
2. Variant-aware program CTA routing:
   - `full` (/offers) → standard Stripe link, straight to checkout, label "Reserve your seat".
   - `compact` (/) → unchanged: `WEBINAR_REGISTER_URL`, existing label.
3. Add a third card **"Co-Founder Program Premium" · €2450**, rendered only when `full`.
   Mirror the Program card; CTA → premium Stripe link, label "Reserve premium seat".
4. Grid columns conditional: `full ? md:grid-cols-3 : md:grid-cols-2`.
5. Section-level seat scarcity line (full only): "5 seats per cohort, shared across both
   program tiers." Premium is an upgrade on a seat, not a separate allocation.
6. Founding €750 is a Stripe **promotion code** entered at checkout — no app-side code
   field. Public price stays €950.

Stripe-side (founder, already done / to confirm): two Payment Links created; "Allow
promotion codes" enabled on the standard link; a €200-off promo code (`FOUNDING`)
created. URLs go in `.env.local` (gitignored).

## Risks / Non-Goals

### Risks
- **Landing regression:** the component is shared by `/` and `/offers`. Mitigation:
  every new UI element and the straight-to-Stripe routing is gated on `variant === "full"`;
  verify the compact landing renders two cards with the webinar CTA unchanged.
- **3-up grid overflow at narrow widths.** Mitigation: screenshot at 375px and 320px;
  cards stack to one column below `md`.
- **Missing env var in some environment** → broken CTA. Mitigation: keep an `IS_SET`
  guard per URL; fall back to the webinar URL if a link is unset (no broken checkout ships).

### Non-Goals
- Do NOT put any Stripe secret or publishable key in the app — Payment Links only.
- Do NOT build a custom discount-code input — Stripe promo codes handle €750.
- Do NOT add a discount/promo to the premium tier (anchor holds at €2450).
- Do NOT change the compact (landing) variant's cards, labels, or routing.
- Do NOT add a server endpoint or Supabase edge function for checkout.

## Done-When

- [ ] `/offers` shows three cards: €0 / €950 / €2450, equal heights on desktop.
- [ ] Standard CTA on /offers opens the standard Stripe Payment Link; premium CTA opens
      the premium link (both in a new tab).
- [ ] Entering the `FOUNDING` promo code at standard checkout shows €750.
- [ ] Landing `/` still shows exactly two cards; program CTA still routes to the webinar.
- [ ] Section-level "5 seats per cohort" line shows on /offers.
- [ ] Renders cleanly at 320px, 375px, and desktop (no overflow/clipping).
- [ ] `npm run build` passes.

## Acceptance Criteria

- [ ] A founder pair can buy the standard or premium tier directly from /offers.
- [ ] The founding discount applies via promo code without any custom UI.
- [ ] The landing page is visually and behaviorally unchanged.

## UI Contract

| Element | Value |
|---------|-------|
| Premium card title | Co-Founder Program Premium |
| Premium subtitle | For pairs who want certainty, not assumption |
| Premium price | €2450 / pair |
| Premium bullets | Everything in the Co-Founder Program · I personally verify you and your co-founder both understand the clarity protocol deeply, not just feel you do, and fill every gap I find · Issued Clarity Badge — verified proof you share the framework · Personal guidance applying the protocol to one real highest-stakes conversation |
| Premium CTA | Reserve premium seat → VITE_STRIPE_PREMIUM_URL |
| Standard CTA (full) | Reserve your seat → VITE_STRIPE_STANDARD_URL |
| Seat scarcity line (full) | 5 seats per cohort, shared across both program tiers |
| Standard URL | https://buy.stripe.com/aFa28rgxXex14FlaGo1Jm01 |
| Premium URL | https://buy.stripe.com/aFafZh2H7ex1go3g0I1Jm00 |
| Analytics tier values | platform · program · premium |
