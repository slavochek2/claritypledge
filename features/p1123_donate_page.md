---
status: in-progress
type: story
rank: 47
created_date: '2026-08-20'
tags: [donations, stripe, landing, funding]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
driver: heuristic
---

# P1123: Donate page at /donate

## Problem

**Situation:** Clarity Pledge is an impact-first project. The only ways to give money today are the two paid program offers (Standard, Premium) surfaced in `offers-section.tsx` — both are purchases of a program seat, not support of the mission.

**Complication:** People who value the work but do not want a program seat have nowhere to give. A live Stripe payment link now exists (donor-chosen amount, USD, $5 preset), but it is a bare `buy.stripe.com` page with no context — a donor arriving there sees a product name and an amount field, and nothing about what the money funds.

**Question:** How do we give supporters a page on claritypledge.com that explains what donations fund and routes them to the Stripe link?

## Appetite

Low blast radius — one new route and one new page component; no existing flow, auth path, or offer changes. Fully reversible (delete the route and the file). Medium decision density: the page copy is entirely a founder decision and is not yet supplied.

## Solution

A `/donate` route rendering a page with:
- A headline and a short explanation of what donations fund `[FOUNDER DECISION: page copy]`
- A single primary button linking out to the Stripe payment link (new tab)

The link URL is read from `VITE_STRIPE_DONATE_URL`, validated with the same `new URL(u).host === "buy.stripe.com"` check used at `src/app/components/landing/offers-section.tsx:53-65`, and fails loud the same way — if the env var is missing or malformed, the button renders disabled with a visible notice rather than silently linking somewhere wrong. A donate button that looks live but is not is an invisible loss of a gift.

Stripe objects already created (live mode): product `prod_V6cBZRlqvIv38x`, price `price_1U6OzbFXhjM6Ief0MXtLb4MG` (custom amount, USD, preset $5, min $1, max $5,000), payment link `plink_1U6OzcFXhjM6Ief0j8ihLRTK`.

## Risks / Non-Goals

### Risks
- **Env var missing in the production build** → button dead on a live page. Mitigation: the fail-loud guard above, plus a mount-time alert mirroring the existing pattern in `offers-section.tsx`.
- **Copy written by an agent instead of the founder** → the page states a funding claim the founder never made, on a public site, about money. Mitigation: the copy is marked `[FOUNDER DECISION]` and `/dev` must stop rather than draft it.
- **Donation framing read as a tax-deductible charitable gift.** Clarity Pledge is not a registered charity. Mitigation: copy must not use "tax-deductible", "charity", or "nonprofit" unless the founder confirms that status.

### Non-Goals
- Do NOT embed Stripe checkout in-page (`<stripe-buy-button>` or embedded Checkout) — both add an external script or a server endpoint for the same outcome as an outbound link.
- Do NOT add recurring/monthly donations — one-time only for now.
- Do NOT create *fixed-charge* tier links. The five tier links are presets — the donor can still edit the amount at Stripe (see Resolved Decisions).
- Do NOT use opaque tier slugs (`/donate/a`, `/donate/b`). A letter's meaning is mutable; a repriced tier silently changes the amount for every already-shared link. The URL states the amount.
- Do NOT add a server-side Checkout Session endpoint to support arbitrary amounts — an edge function in the donation path is one more thing that can be down between intent and Stripe.
- Do NOT modify `offers-section.tsx` or either paid offer.
- Do NOT add a donate link to global nav, footer, or the landing page in this spec — placement is a separate decision.
- Do NOT add analytics events beyond what an existing shared helper already provides for outbound links.

## Done-When

- [x] `/donate/5`, `/donate/15`, `/donate/50`, `/donate/150`, `/donate/500` each open the matching Stripe link
- [x] An unmapped amount (`/donate/37`) falls through to `/donate` rather than 404
- [x] `/donate` renders the page on desktop, 375px, and 320px with no horizontal overflow
- [x] The primary button opens the Stripe donation link in a new tab
- [x] The Stripe page shows a donor-editable amount defaulting to $5 USD (verified: `customUnitAmount` = US$5.00, `readOnly: false`)
- [x] With `VITE_STRIPE_DONATE_URL` unset or non-`buy.stripe.com`, the button renders disabled with a visible notice and does not navigate
- [ ] Page copy on the deployed page is the founder's text, not placeholder
- [x] `npm run build` and `npm test` pass

## Acceptance Criteria

- [ ] A supporter who wants to give but not buy a program seat can do so from claritypledge.com
- [ ] Before clicking through to Stripe, the supporter can read what the money funds
- [ ] A misconfigured donation URL is visible to the operator rather than silently failing

## UX Notes

- **Happy path:** land on `/donate` → read headline + funding explanation → click the button → Stripe checkout in a new tab.
- **Misconfigured state:** button disabled, notice visible explaining the link is unavailable.
- No loading or empty state — the page is static content plus one link.
- One primary action only, per the P955 rule in `.claude/rules/visual-qa.md`.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/donate` | `src/App.tsx` |
| Headline | `[FOUNDER DECISION]` | Top of page |
| Funding explanation | `[FOUNDER DECISION]` — 1–2 sentences | Below headline |
| Button label | `[FOUNDER DECISION]` (e.g. "Donate") | Single primary CTA |
| Button target | `VITE_STRIPE_DONATE_URL` | `target="_blank" rel="noopener noreferrer"` |
| Disabled notice | Reuse the wording pattern from `offers-section.tsx` | When URL invalid/unset |

## Resolved Decisions

Recorded 2026-08-20 via `/goalify` Phase 1.

| open question | decision |
|---|---|
| Tier URLs | `/donate/5`, `/donate/15`, `/donate/50`, `/donate/150`, `/donate/500`, plus bare `/donate` preset at $5 |
| Fixed vs preset | **Preset** — donor can still edit the amount at Stripe |
| Unmapped amount | Falls through to `/donate`, never 404 |
| Headline | "Support Clarity Pledge" — matches the Stripe product name the donor sees at checkout |
| Funding copy | "Clarity Pledge is open source and free to use. Donations cover hosting and fund the research behind it." |
| Button label | "Support the work" |

**Why no URL parameter.** Stripe Payment Link URLs accept only `utm_*`,
`client_reference_id`, `prefilled_email`, and `prefilled_promo_code`
(https://docs.stripe.com/payment-links/url-parameters, read 2026-08-20). There is
no amount parameter, and invalid params are *silently dropped* — so a
`?amount=55` approach would appear to work while charging the preset. Hence one
pre-created link per tier.

### Stripe objects (live mode, created 2026-08-20)

Product `prod_V6cBZRlqvIv38x` — "Support Clarity Pledge". All prices USD,
`custom_unit_amount`, min $1, max $5,000. Each URL verified HTTP 200.

| route | env var | preset |
|---|---|---|
| `/donate` and `/donate/5` | `VITE_STRIPE_DONATE_URL`, `VITE_STRIPE_DONATE_URL_5` | $5 |
| `/donate/15` | `VITE_STRIPE_DONATE_URL_15` | $15 |
| `/donate/50` | `VITE_STRIPE_DONATE_URL_50` | $50 |
| `/donate/150` | `VITE_STRIPE_DONATE_URL_150` | $150 |
| `/donate/500` | `VITE_STRIPE_DONATE_URL_500` | $500 |

Two earlier links were created and **deactivated** during exploration
(`plink_1U6OxmFXhjM6Ief0koywDxN1` $10 preset, `plink_1U6OzcFXhjM6Ief0j8ihLRTK`
duplicate $5). Do not reuse them.

## Test Plan

| line | decided by |
|---|---|
| DW-1 build + typecheck + tests pass | `npm run build && npm test` |
| DW-2 all six routes resolve and link to the correct Stripe URL | `npx vitest run src/tests/p1123-donate-routes.test.tsx` |
| DW-3 unmapped amount falls through to `/donate`, never 404 | same |
| DW-4 invalid/unset URL renders disabled button + notice, does not navigate | `npx vitest run src/tests/p1123-donate-guard.test.tsx` |
| DW-5 renders at 320 / 375 / desktop with no horizontal overflow | visual QA at the UAT gate |
| DW-6 one primary action, hierarchy leads to it (P955) | visual QA at the UAT gate |
| DW-7 deployed copy is the founder's text | founder |

**Live-payment boundary.** No test may complete a real payment. The Stripe URLs
are live-mode; tests assert the `href`, never a checkout.
