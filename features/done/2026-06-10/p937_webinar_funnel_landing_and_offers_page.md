---
status: all-done
type: story
rank: 244.333
workstream: C2
created_date: '2026-06-15'
tags:
  - gtm
  - funnel
  - pricing
  - offers
  - webinar
pipeline_ran: [create-spec, challenge-prd, dev, ship]
completed_at: 2026-06-16
---

# P937: Webinar-funnel landing re-aim + on-landing pricing + thin /offers page

> Full rationale (funnel architecture, price ladder, founding-cohort mechanics, alternatives
> rejected) lives in [docs/decisions.md](../docs/decisions.md) **2026-06-15 "Co-Founder Program
> go-to-market"**. This spec is the tracked *execution* layer — do not restate the rationale here.
> **Revision note (2026-06-16):** the original "landing = awareness, not a buy surface; pricing only
> on a separate /offers page" decision is **reversed by founder call** — the regular price now shows
> *on the landing* (transparency → qualified registrations; the founding €500 + testimonial stay the
> webinar-exclusive close, so the close is not burned). The CTA resolver is dropped (one recurring
> webinar = one static link). `docs/decisions.md` 2026-06-15 must be updated to record this reversal.
> Related: [P925](../../p925_coach_recruitment_interview_funnel.md) recruits the coaches who may host the
> webinar (supply side); this spec is the founder-facing sale surface (demand side). Predecessor:
> [P916](done/) shipped the program page with an apply-form model this spec supersedes.

## Problem

**Situation:** P916 ships the program page at `/` with an "Apply form" (`ApplyForm`, Web3Forms) as
the Phase-1 WTP instrument, a hero CTA "Apply for clarity program" that scrolls to it, and a FAQ
("What if only one of us wants this?") that tells solo founders they can start alone. The page sells
the program in full (value, timeline, gains, Agreement, FAQ) but shows **no price** anywhere.

**Complication:** The real go-to-market (decisions 2026-06-15) is accelerator-distributed and sells
via a **free live webinar**, not a form. The apply-form model manufactures "why apply without a
price?" friction, implies a gate that doesn't exist, and the solo FAQ now contradicts the pairs-only
founding cohort. There is also no surface that presents pricing transparently — and for a
founding-cohort sell, price transparency *qualifies* registrants rather than scaring them off.

**Question:** Re-aim the landing from apply-form → webinar registration, **surface the price on the
landing itself** (free platform + €950/pair program), and give the funnel a thin shareable
`/offers` page + a real buy link to close.

## Appetite

- **Blast radius — medium.** The landing is the public homepage (`/`); `/offers` is a thin net-new
  route. One new `OffersSection` component (pricing only — does *not* re-pitch the program). One
  shared `LocalTime` util that also refactors the event detail page (SSOT). No backend, schema, or
  auth changes. Webinar registration is the existing `/events` RSVP flow.
- **Reversibility — high.** Git-revertible; no migrations. The removed `ApplyForm` can be restored.
- **Decision density — low-to-medium.** Pricing and funnel shape are already decided (decisions
  2026-06-15, as revised above). Remaining `[FOUNDER DECISION]`s: final CTA/headline copy, the static
  webinar event link, and the Stripe Payment Link URL (founder sets up).

## Solution

**Build sequence (one spec):** (1) shared `LocalTime` util; (2) `OffersSection` component;
(3) landing re-aim + compact pricing block; (4) thin `/offers` page. All ship before the first
webinar (Thu Jun 25).

**(0) Shared `LocalTime` util — single source of truth for event time (`src/app/utils/format-time.ts`):**
- Add `formatLocalDateTime(iso)` (or a small `<LocalTime iso={…} />`) that formats a timestamp in the
  **visitor's browser timezone** (`toLocaleString` with no fixed `timeZone` — the existing, working
  mechanism in `src/app/prototypes/events/utils.ts`; **not** IP geolocation).
- **Refactor the event detail page** (`src/app/prototypes/events/components/EventDetail.tsx`) to use
  it, so the landing date-line and the event pages render time through one function.

**(A) Re-aim the program landing (`src/app/pages/program-page.tsx`):**
- Hero + bottom CTA: "Apply for clarity program" → **"Register for the free webinar"**
  (`[FOUNDER DECISION]` on final label) → the **static recurring-webinar event link**
  (`/events/list?series=lost-cofounders` — P939 series-filtered view, no resolver).
- **Localized date line below the CTA:** "Next session: Thursday, June 25 — [visitor-local time]"
  via the `LocalTime` util (anchor: Jun 25 2026 15:30 ICT / UTC+7, recurring weekly).
- **Also update the route-aware nav CTA** (`simple-navigation.tsx` `LoggedOutPrimaryCta`, currently
  "Apply for clarity program" / `nav_cta_clicked {cta: apply_program}`) to match.
- Remove or demote the `ApplyForm` instrument and its bottom "Apply to join the founding cohort"
  section. (Keep the component file; just stop rendering it on `/`.)
- Rewrite the solo FAQ to **pairs-only**: both co-founders take part; you enroll as a pair.
- Add a plain line stating **the app/platform is always free** (Tier 0, in context).
- **Render `<OffersSection variant="compact" />`** as a pricing section near the CTA: two prices +
  guarantee + Register CTA, **no program bullets** (the program is already explained above it).

**(B) New thin `/offers` page (`src/app/pages/offers-page.tsx`, route in `src/App.tsx`, public —
`ClarityLandingLayout` like the program/coach pages, NOT BottomNav/Focus):** renders
`<OffersSection variant="full" />`. Exists as a **shareable URL** (webinar chat / DM / email) and the
**home for the Stripe buy-link**.

**`OffersSection` component (`src/app/components/…`, design adapted from the ladischenski.com
`#pricing` card-grid pattern, rebuilt in cp's design system):** two transparent tiers, per-pair —
| Tier | What | Price | Buy |
|------|------|-------|-----|
| Platform | the app | **Free forever** | — |
| Co-Founder Program (group) | recorded lesson + live group Q&A + facilitated practice + Clarity Partner Agreement, **no personal badge** | **€950/pair** | Stripe Payment Link (`[FOUNDER DECISION]` URL) |

- **`variant`:** `full` (with condensed bullets, for `/offers` cold context) vs `compact` (prices +
  guarantee + CTA, no bullets, for the landing where the program is already explained).
- **Bullets** condense the existing landing `PROGRAM_TIMELINE` (recorded video · live Q&A · group
  practice · Clarity Partner Agreement) — no new copy authored.
- **Public risk-free guarantee strip:** full refund if not satisfied. Universal policy (any paying
  pair), **not** a founding-only sweetener — so it is public and de-risks the buy.
- **Founding price (€500/pair + video testimonial)** stays the **webinar-exclusive close** — NOT
  shown. The close keeps its exclusivity via the half-price + testimonial mechanic.
- **No ladischenski cross-links / "Not included" boundary** — dropped (premature; the "(group)"
  label is sufficient boundary). Add back only if a buyer asks about 1:1.

## Risks / Non-Goals

### Risks
- **Public price pre-anchors top-of-funnel.** **ACCEPT** — decided trade-off (founder, 2026-06-16):
  transparency chosen for *qualified* registrations; founding discount stays the webinar close. Watch
  registration rate as the H-WTP signal.
- **Brand bleed** (founder's 1:1 rates on the cp method brand). **MITIGATE** — Badge/FCO not
  mentioned or priced on cp at all now (links dropped).
- **Static webinar link goes stale if the recurring series changes.** **ACCEPT** — one recurring
  webinar; founder updates the link if the series moves. No resolver to maintain.

### Non-Goals
- Do NOT build a payment/checkout flow in-app — the founder sets up an external **Stripe Payment
  Link**; `OffersSection` only links to it.
- Do NOT build a new registration/email-capture mechanism — reuse the existing `/events` RSVP.
- Do NOT build a latest-event resolver — one static recurring-webinar link.
- Do NOT touch the `/coach` page's funnel (separate audience/motion).
- Do NOT delete the `ApplyForm` component or its Web3Forms key — only stop rendering it on `/`.
- Do NOT add solo/matched-founder enrollment — founding cohort is real pairs only.
- Do NOT show the founding €500 price or the testimonial mechanic publicly.
- Do NOT change ladischenski.com (separate repo).

## Done-When

- [x] Hero CTA + bottom CTA + the route-aware **nav** CTA on `/` all read the chosen webinar label
      (no "Apply for clarity program" copy remains on the page) and link to the static webinar URL.
- [x] A **localized date line** renders below the CTA via the shared `LocalTime` util (visitor-local
      time; correct in at least two timezones — e.g. ICT and CET). *Proven: unit test converts the
      anchor to ICT 3:30 PM / Berlin 10:30 AM / LA 1:30 AM; live headless render showed ICT.*
- [x] `LocalTime` util exists in `format-time.ts` and the **event detail page renders through it**
      (one function, both surfaces).
- [x] The `ApplyForm` no longer renders on `/`.
- [x] The solo FAQ states pairs-only (no "you can start with one").
- [x] `/` states the platform/app is always free, in context.
- [x] `<OffersSection variant="compact" />` renders on the landing (two prices + guarantee + CTA, no
      bullets); `<OffersSection variant="full" />` renders at `/offers`.
- [x] `/offers` route exists, public (`ClarityLandingLayout`), shows **two** tiers: Platform (free) +
      Co-Founder Program (**€950/pair**, regular only — founding €500 NOT shown) + the public
      risk-free guarantee.
- [x] No ladischenski cross-link or "Not included" boundary renders (dropped).
- [x] A `[FOUNDER DECISION]` placeholder exists for the Stripe Payment Link URL (no fake checkout
      link ships).
- [x] Visual QA passed at 320 / 375 / desktop (per `.claude/rules/visual-qa.md`).
- [x] `tsc`, lint, build, tests green.

## UX Notes

- **CTA + date line:** "Register for the free webinar" with "Next session: [Thu, Jun 25 —
  visitor-local time]" directly below. `[FOUNDER DECISION]` on final CTA label.
- **OffersSection hierarchy:** the eye lands on the Co-Founder Program (the product); Platform-free
  reads as reassurance; the guarantee strip sits under the cards. Spacious, scannable. On the landing
  (compact), the program is already explained above, so the block is prices-first, not a re-pitch.
- **Per-pair framing** is explicit (price as "/pair"). NOTE: the original "(€X/founder)" secondary
  was **dropped in dev** — it computes to €500, colliding with the webinar-exclusive founding €500
  (AC: "no surface shows the founding €500 price"). Replaced with "Covers both co-founders — you
  enroll as a pair" (per-pair value, no number). Founder may restore the per-founder number if the
  close strategy changes.

## Visual Specification

> Handed to the `/dev` visual-QA subagent (per `.claude/rules/visual-qa.md`) as the design intent to
> check the build against.

- **Reference layout:** the ladischenski.com `#pricing` card-grid — rounded cards, generous padding,
  a **featured** card (border-accent + small "most effective"-style tag), check-bullet lists, a
  full-width guarantee strip below the grid. Adapt the *structure*, not the palette.
- **Hard constraint:** cp's design system only — reuse the existing card/button/typography/spacing
  tokens and components. No ladischenski colors or fonts. The cards must read as native cp surfaces,
  visually consistent with the program/coach pages.
- **Hierarchy:** the **Co-Founder Program** card is the focal point (featured); **Platform — free**
  reads as lighter reassurance, not a competing CTA. Guarantee strip is supportive, below.
- **Mobile-first:** designed at 320 / 375 first; cards stack vertically on narrow, full grid on
  desktop. Touch targets ≥ 40px. No overflow, clipping, or truncation at 320px.
- **`compact` (landing) vs `full` (/offers):** compact drops the bullet lists (program already
  explained above) — prices + guarantee + CTA only; full keeps the condensed bullets.
- **Iterate** via the visual-QA loop until it passes the checklist at all three widths.

## Acceptance Criteria

- [x] An accelerator-referred founder landing on `/` reaches the webinar event page from the hero CTA
      in one click (RSVP itself is auth-gated; "one click" is to the event, not a completed
      registration).
- [x] A visitor sees the regular program price (€950/pair) **on the landing** without attending,
      and again on `/offers`.
- [x] The webinar date/time shows in the **visitor's local timezone** on the landing.
- [x] No surface implies the paid program is free; no surface implies a solo founder can enroll; no
      surface shows the founding €500 price. *(€500/founder sub-line removed in dev — see UX Notes.)*

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | challenge BLOCK-1 / HQ-1 | Defer `/offers` until first paying pair | **Rejected** — buy surface stays in scope (now: price on landing + thin /offers) | The buy surface IS the WTP experiment; no paying pair possible without it. |
| 2 | founder 2026-06-16 | Latest-event resolver for the CTA | **Replaced by a static recurring-webinar link** | One recurring webinar; no series to resolve over, no dead-link risk, nothing to maintain. |
| 3 | challenge WARN-3 | Nav CTA still says "Apply for clarity program" | **In Solution A + Done-When** | Same-page contradiction otherwise. |
| 4 | challenge NOTE-1 | "Reaches registration in one click" is false (auth-gated RSVP) | **AC reworded** to "one click to the event page" | Accurate to the RSVP/signup flow. |
| 5 | founder 2026-06-16 | Pricing only on a separate /offers page; "Not included" link-out to ladischenski | **Reversed** — regular €950/pair shows **on the landing**; ladischenski links **dropped** | Transparency qualifies registrants (founder call); the "(group)" label is sufficient boundary; founding €500 + testimonial stay the webinar close, so it is not burned. **Update `docs/decisions.md` 2026-06-15.** |
| 6 | founder 2026-06-16 | Risk-free guarantee public or webinar-only | **Public** | Refund is a universal policy, not a founding sweetener; visible guarantee de-risks the buy and lifts conversion. |
| 7 | founder 2026-06-16 | One price surface or two | **One `OffersSection` component, two mounts/variants** (compact on landing, full on /offers) | Single source of truth; /offers kept thin for a shareable URL + Stripe-link home at ~zero marginal cost. |
| 8 | founder 2026-06-16 | Time-localization scope | **Shared `LocalTime` util used by landing + event detail page** | SSOT; the event pages already render browser-local — consolidate into one function. |

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| CTA label | "Register for the free webinar" (`[FOUNDER DECISION]`) | `/` hero + bottom + nav |
| CTA destination | `/events/list?series=lost-cofounders` (P939 series filter) | route-aware link |
| Date line | "Next session: Thursday, June 25 — [visitor-local time]" via `LocalTime` | below CTA |
| Platform tier | "Free forever" | OffersSection (both mounts) |
| Program price | "€950 / pair" (regular only — **founding €500 NOT shown**) | OffersSection |
| Guarantee | "Full refund if not satisfied" (public, universal) | OffersSection |
| Stripe link | `[FOUNDER DECISION: payment-link URL]` | OffersSection program CTA |
