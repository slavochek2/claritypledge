---
status: qa
type: story
rank: 47
created_date: '2026-08-20'
tags: [donations, stripe, landing, funding]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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

`/donate` and `/donate/:amount` **redirect straight to Stripe** — no interstitial
page. The ask is a link you paste into an email, a talk, or a footer, and it lands
the donor on checkout. Nothing renders except the failure state.

Amount presets: bare `/donate` → $15; `/donate/5|15|50|150|500` → that amount.
Any other positive whole number resolves to the **nearest** tier — `/donate/55` →
$50, `/donate/145` → $150 — so a number someone invents still lands somewhere
sensible. Ties break upward (`/donate/10` → $15) because rounding must never
quietly lower the ask.
Every link is a *preset*, not a fixed charge — the donor can still edit it at
Stripe, so a tier link never turns away someone who can give less. Non-amounts (`/donate/abc`, `0`, negatives, decimals) fall through to the default
rather than 404ing.

URLs are read from `VITE_STRIPE_DONATE_URL*` and validated with an https +
exactly-`buy.stripe.com` host check. If the URL is missing or malformed, the route
does **not** redirect: it renders a visible notice and alerts Sentry on mount. A
donate link that silently dead-ends is an invisible lost gift.

## Risks / Non-Goals

### Risks
- **Env var missing in the production build** → button dead on a live page. Mitigation: the fail-loud guard above, plus a mount-time alert mirroring the existing pattern in `offers-section.tsx`.
- **Copy written by an agent instead of the founder** → the page states a funding claim the founder never made, on a public site, about money. Mitigation: the copy is marked `[FOUNDER DECISION]` and `/dev` must stop rather than draft it.
- **Donation framing read as a tax-deductible charitable gift.** Clarity Pledge is not a registered charity. Mitigation: copy must not use "tax-deductible", "charity", or "nonprofit" unless the founder confirms that status.

### Non-Goals
- Do NOT embed Stripe checkout in-page. Keeping `claritypledge.com` in the address bar requires Stripe's Buy Button: a `js.stripe.com` script, a CSP allowance (guarded by the `csp-smoke` workflow), and Dashboard-created button objects a restricted API key cannot create — three moving parts in the money path. **Accepted trade-off: the address bar shows `buy.stripe.com` during checkout.**
- Do NOT build an interstitial donate page. Rejected after the first implementation: the founder's ask is a link that goes to Stripe, not a page explaining it.
- Do NOT add recurring/monthly donations — one-time only for now.
- Do NOT create *fixed-charge* tier links. The five tier links are presets — the donor can still edit the amount at Stripe (see Resolved Decisions).
- Do NOT use opaque tier slugs (`/donate/a`, `/donate/b`). A letter's meaning is mutable; a repriced tier silently changes the amount for every already-shared link. The URL states the amount.
- Do NOT add a server-side Checkout Session endpoint to support arbitrary amounts — an edge function in the donation path is one more thing that can be down between intent and Stripe.
- Do NOT modify `offers-section.tsx` or either paid offer.
- Do NOT add a donate link to global nav, footer, or the landing page in this spec — placement is a separate decision.
- Do NOT add analytics events beyond what an existing shared helper already provides for outbound links.

## Done-When

- [x] `/donate/5`, `/donate/15`, `/donate/50`, `/donate/150`, `/donate/500` each redirect to the matching Stripe link
- [x] Bare `/donate` redirects to the $15 preset
- [x] An invented amount resolves to the nearest tier (`/donate/55` → $50, `/donate/145` → $150), ties upward
- [x] A non-amount (`/donate/abc`, `0`, `-5`, `5.5`) redirects to the default rather than 404
- [x] No interstitial page renders — the route goes straight to Stripe
- [x] The Stripe page shows a donor-editable amount at the expected preset
- [x] With the URL unset or non-`buy.stripe.com`, the route does not redirect, shows a notice, and alerts Sentry
- [x] `npm run build` and `npm test` pass

## Acceptance Criteria

- [ ] A supporter can give without buying a program seat, from a link that can be pasted anywhere
- [ ] A tier link presets the amount without locking the donor to it
- [ ] A misconfigured donation URL is visible to the operator rather than silently failing

## UX Notes

- **Happy path:** open the link → Stripe checkout, amount prefilled and editable.
- **Misconfigured:** no redirect; a plain notice renders and Sentry is alerted.
- **Blocked or slow redirect:** a "Continue to checkout" link is on screen from the
  first paint, so a navigation that never happens leaves a working link rather than
  a white page. A blocked navigation fires no callback, so this cannot be scheduled
  after the fact — it has to render up front.
- `window.location.replace()`, not `assign()` — Back from Stripe must not bounce
  the donor through the route into a redirect loop.
- No landing layout on these routes: nav and footer would flash before the redirect.

## Resolved Decisions

Recorded 2026-08-20 via `/goalify` Phase 1.

| open question | decision |
|---|---|
| Tier URLs | `/donate/5`, `/donate/15`, `/donate/50`, `/donate/150`, `/donate/500`, plus bare `/donate` |
| Fixed vs preset | **Preset** — donor can still edit the amount at Stripe |
| Unmapped amount | **Nearest tier**, ties upward. Non-amounts fall to the default. Never 404. |
| Above the top tier | `/donate/1000` resolves down to $500. The donor can still edit at Stripe, so a generous giver is inconvenienced, never blocked. |
| Page vs redirect | **Redirect.** Revised 2026-08-20 after the first build shipped an interstitial page the founder did not want. No page copy is needed. |
| Default amount | **$15** on bare `/donate` (was $5). A $5 default anchors low; $15 lifts the average without the flinch that closes the tab. |
| Address bar during checkout | Shows `buy.stripe.com`. Accepted — the alternative is the Buy Button embed, rejected above. |

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
| `/donate/5` | `VITE_STRIPE_DONATE_URL_5` | $5 |
| `/donate` (default) | `VITE_STRIPE_DONATE_URL` | $15 |
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
| build + typecheck + tests pass | `npm run build && npm test` |
| all six routes redirect to the correct Stripe URL | `npx vitest run src/tests/p1123-donate-routes.test.tsx` |
| an invented amount resolves to the nearest tier, ties upward | same |
| a non-amount redirects to the default, never 404 | same |
| no interstitial page renders | same |
| invalid/unset URL does not redirect, shows notice, alerts Sentry | `npx vitest run src/tests/p1123-donate-guard.test.tsx` |
| a manual fallback link renders from first paint (blocked/slow redirect) | `npx vitest run src/tests/p1123-donate-routes.test.tsx` |
| redirect fires exactly once under StrictMode | same (mutation-checked: fails without the ref guard) |
| a throwing `location.replace` leaves the link usable and alerts Sentry | same |
| host-validation rejects lookalikes, userinfo tricks, http, javascript: | same |

### Known limitations — reviewed, accepted, not fixed

Recorded so a future reader does not mistake green tests for full coverage.

| limitation | why accepted |
|---|---|
| Tests stub `window.location`, so real navigation semantics are not exercised. The back-button guarantee in the code comment is asserted by no test. | Verified by hand in a real browser 2026-08-20: `/about` → `/donate/50` → Back lands on `/about`, not a redirect loop. Tested, just not by the suite. |
| A repriced or removed tier silently downgrades already-distributed links to the default preset, with no operator signal. | The fallback is the desired behaviour for a donor (a working page beats a 404). The cost lands only if a tier is ever repriced — treat this table as the warning to re-issue links if that happens. |
| Nothing validates that `VITE_STRIPE_DONATE_URL_50` really points at a $50-preset link. A swapped pair of env values would pass every test and every gate. | Verified by hand against live Stripe 2026-08-20: all five presets matched their route ($5/$15/$50/$150/$500, each editable). Automating it means calling Stripe at build time — more machinery in the money path than the risk warrants. Re-verify by hand whenever a link is regenerated. |

**Live-payment boundary.** No test may complete a real payment. The Stripe URLs
are live-mode; tests assert the redirect target, never a checkout.
