---
status: week
type: story
rank: 1000937.0
workstream: C2
created_date: '2026-06-15'
tags: [gtm, funnel, pricing, offers, webinar]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P937: Webinar-funnel landing re-aim + /offers pricing-ladder page

> Full rationale (funnel architecture, price ladder, founding-cohort mechanics, alternatives
> rejected) lives in [docs/decisions.md](../docs/decisions.md) **2026-06-15 "Co-Founder Program
> go-to-market"**. This spec is the tracked *execution* layer — do not restate the rationale here.
> Related: [P925](p925_coach_recruitment_interview_funnel.md) recruits the coaches who may host the
> webinar (supply side); this spec is the founder-facing sale surface (demand side). Predecessor:
> [P916](done/) shipped the program page with an apply-form model this spec supersedes.

## Problem

**Situation:** P916 ships the program page at `/` with an "Apply form" (`ApplyForm`, Web3Forms) as
the Phase-1 WTP instrument, a hero CTA "Apply for clarity program" that scrolls to it, and a FAQ
("What if only one of us wants this?") that tells solo founders they can start alone.

**Complication:** The real go-to-market (decisions 2026-06-15) is accelerator-distributed and sells
via a **free live webinar**, not a form. The landing is awareness, not a buy surface; the webinar is
the sell; checkout happens at the webinar close. The apply-form model manufactures "why apply without
a price?" friction, implies a gate that doesn't exist, and the solo FAQ now contradicts the
pairs-only founding cohort. There is also no surface that presents pricing transparently.

**Question:** Re-aim the landing from apply-form → webinar registration, and build a transparent
`/offers` pricing-ladder page that gives the funnel a real place to point and to close.

## Appetite

- **Blast radius — medium.** The landing is the public homepage (`/`); the `/offers` page is
  net-new. No backend, schema, or auth changes. The webinar registration is the existing `/events`
  RSVP flow (no new capture mechanism to build).
- **Reversibility — high.** Git-revertible; no migrations. The removed `ApplyForm` can be restored.
- **Decision density — low-to-medium.** Pricing and funnel shape are already decided (decisions
  2026-06-15). Remaining `[FOUNDER DECISION]`s: final CTA/headline copy, the Stripe Payment Link URL
  (founder sets up), and the exact ladischenski links.

## Solution

**(A) Re-aim the program landing (`src/app/pages/program-page.tsx`):**
- Hero + bottom CTA: "Apply for clarity program" → **"Join a free live webinar"**, linking to the
  webinar event on `/events` (route-aware native link, not the `#apply` scroll).
- Remove or demote the `ApplyForm` instrument and its bottom "Apply to join the founding cohort"
  section — replaced by a webinar CTA. (Keep the component file; just stop rendering it on `/`.)
- Rewrite the solo FAQ to **pairs-only**: both co-founders take part; you enroll as a pair.
- Add a plain line stating **the app/platform is always free** (the home for the removed "Free &
  open source" fact — in context, as Tier 0, not an ambiguous hero badge).

**(B) New `/offers` page (`src/app/pages/offers-page.tsx`, route in `src/App.tsx`):** transparent
full value ladder, per-pair pricing —
| Tier | What | Price | Where it transacts |
|------|------|-------|--------------------|
| Platform | the app | **Free forever** | cp (free) |
| Co-Founder Program (group) | recorded lesson + live group Q&A + facilitated practice + Clarity Partner Agreement, **no personal badge** | **€1,000/pair** (founding: **€500/pair** for a video testimonial + money-back) | cp — priced inline; founder adds Stripe Payment Link |
| Calibration Badge (1:1) | 5h personal certification + guidance | **from €1,450/pair** | **links out to ladischenski.com** |
| FCO Retainer | ongoing | **by application** | **links out to ladischenski.com** |

Badge + FCO are framed as "personal work with the founder" and link out (method brand stays distinct
from the founder's personal coaching). Founding discount + promo code are the webinar-exclusive close
(not shown as a checkout on `/offers` by default).

## Risks / Non-Goals

### Risks
- **CTA points at a non-existent event.** Mitigation: the `/events` webinar records (Thu Jun 25 +
  3 weekly) must exist before the landing CTA ships, or the CTA links to a 404. Sequence: create the
  events first (or gate the CTA behind their existence).
- **Pricing on a public page invites competitor/observer scrutiny and pre-anchors.** Mitigation:
  decided trade-off (decisions 2026-06-15) — transparency chosen; the *founding* discount stays the
  webinar close.
- **Brand bleed** — putting the founder's 1:1 rates on the cp method brand. Mitigation: Badge/FCO are
  *linked out*, not priced inline on cp.

### Non-Goals
- Do NOT build a payment/checkout flow in-app — the founder sets up an external **Stripe Payment
  Link**; `/offers` only links to it.
- Do NOT build a new registration/email-capture mechanism — reuse the existing `/events` RSVP.
- Do NOT touch the `/coach` page's funnel (separate audience/motion).
- Do NOT delete the `ApplyForm` component or its Web3Forms key — only stop rendering it on `/`.
- Do NOT add solo/matched-founder enrollment — founding cohort is real pairs only.
- Do NOT change ladischenski.com (separate repo) — only link to it.

## Done-When

- [ ] Hero and bottom CTAs on `/` read "Join a free live webinar" and navigate to the `/events`
      webinar (not `#apply`).
- [ ] The `ApplyForm` no longer renders on `/`; no dead "Apply for clarity program" copy remains.
- [ ] The solo FAQ states pairs-only (no "you can start with one").
- [ ] `/` states the platform/app is always free, in context.
- [ ] `/offers` route exists and renders the four-tier ladder with the prices above.
- [ ] Co-Founder Program price shown inline (€1,000/pair, founding €500/pair + testimonial +
      money-back); Badge and FCO link out to ladischenski.com.
- [ ] A `[FOUNDER DECISION]` placeholder exists for the Stripe Payment Link URL until the founder
      provides it (no fake/broken checkout link ships).
- [ ] Visual QA passed at 320 / 375 / desktop (per `.claude/rules/visual-qa.md`).
- [ ] `tsc`, lint, build, tests green.

## UX Notes

- **Landing CTA states:** default (link to event), and a graceful state if no upcoming webinar exists
  (e.g. "Next session: [date]" or a fallback). `[FOUNDER DECISION]` on the no-event fallback copy.
- **/offers hierarchy:** the eye should land on the Co-Founder Program (the funnel's product) first;
  Platform-free reads as reassurance above it, Badge/FCO as "go deeper" below. Spacious, scannable.
- **Per-pair framing** is explicit everywhere (price shown as "/pair", with "(€X/founder)" secondary).

## Acceptance Criteria

- [ ] An accelerator-referred founder landing on `/` can reach webinar registration in one click.
- [ ] A visitor can see the full price ladder transparently on `/offers` without attending the webinar.
- [ ] Badge/FCO clearly read as the founder's personal work and route to ladischenski.com.
- [ ] No surface implies the paid program is free, and no surface implies a solo founder can enroll.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Hero CTA label | "Join a free live webinar" | `/` hero + bottom |
| CTA destination | `/events/[webinar]` | route-aware link |
| Platform tier | "Free forever" | `/offers` Tier 0 |
| Program price | "€1,000 / pair" (founding "€500 / pair") | `/offers` |
| Badge price | "from €1,450 / pair" → ladischenski.com | `/offers` |
| FCO | "By application" → ladischenski.com | `/offers` |
| Stripe link | `[FOUNDER DECISION: payment-link URL]` | `/offers` program CTA |
