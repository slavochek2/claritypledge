---
status: today
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
delivery_stage: challenge-prd
pipeline_ran:
  - create-spec
  - challenge-prd
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

**Build sequence (one spec, two phases — both ship before the Jun 25 webinar):** Phase A (landing
re-aim) first; Phase B (`/offers` + Stripe link) second. `/offers` is NOT deferred — the buy surface
*is* the WTP experiment (you cannot get a paying pair, the H-PairsReturn/H-WTP-Pain signal, without
one). See Resolved Decisions.

**(A) Re-aim the program landing (`src/app/pages/program-page.tsx`):**
- Hero + bottom CTA: "Apply for clarity program" → **"Reserve your seat"** (`[FOUNDER DECISION]` on
  final label; "Free live webinar" as context) → the **next upcoming webinar event**, resolved via a
  latest-record shortcode resolver (reuse the P772 `resolveLetterShortcode` / `/feed?version=latest`
  pattern — App.tsx — so a `series` of weekly events always resolves to the next one; no hardcoded
  slug, no dead link when an event passes).
- **Also update the route-aware nav CTA** (`simple-navigation.tsx` `LoggedOutPrimaryCta`, currently
  "Apply for clarity program" / `nav_cta_clicked {cta: apply_program}`) to match — otherwise the
  persistent nav button contradicts the hero on the same page.
- Remove or demote the `ApplyForm` instrument and its bottom "Apply to join the founding cohort"
  section — replaced by a webinar CTA. (Keep the component file; just stop rendering it on `/`.)
- Rewrite the solo FAQ to **pairs-only**: both co-founders take part; you enroll as a pair.
- Add a plain line stating **the app/platform is always free** (the home for the removed "Free &
  open source" fact — in context, as Tier 0, not an ambiguous hero badge).

**(B) New `/offers` page (`src/app/pages/offers-page.tsx`, route in `src/App.tsx`, public —
`ClarityLandingLayout` like the program/coach pages, NOT BottomNav/Focus):** **two** transparent
tiers, per-pair pricing —
| Tier | What | Price | Buy |
|------|------|-------|-----|
| Platform | the app | **Free forever** | — |
| Co-Founder Program (group) | recorded lesson + live group Q&A + facilitated practice + Clarity Partner Agreement, **no personal badge** | **€1,000/pair** publicly | Stripe Payment Link (`[FOUNDER DECISION]` URL) |

- **Founding price (€500/pair + video testimonial + money-back) is the webinar-exclusive close** —
  NOT shown on `/offers` (showing it publicly pre-anchors and kills the close's urgency; a public
  "€500 you can't have yet" also frustrates). `/offers` shows the regular €1,000/pair only.
- **"Not included" boundary on the Program card** (expectation management — names the excluded
  offers so a buyer cannot later claim they were in scope): *"Personal Calibration Badge (1:1
  certification) and ongoing FCO coaching are separate — available with the founder at
  ladischenski.com."* **Named, no price** (prices live on ladischenski; keeps the 2026-06-10 brand
  split intact and avoids a public price for personal coaching).

## Risks / Non-Goals

### Risks
- **CTA points at a non-existent event.** Mitigation: latest-upcoming-webinar resolver (Resolved
  Decisions #2) — never a dead link as events pass; the weekly series (Thu Jun 25 + 3) must have at
  least one upcoming record, else the defined fallback renders.
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

- [ ] Hero CTA + bottom CTA + the route-aware **nav** CTA on `/` all read the chosen webinar label
      (no "Apply for clarity program" copy remains anywhere on the page).
- [ ] The CTA resolves to the **next upcoming webinar event** via the latest-record resolver (a
      passed/old event never produces a dead link; if zero upcoming, a defined fallback renders —
      `[FOUNDER DECISION]` fallback copy).
- [ ] The `ApplyForm` no longer renders on `/`.
- [ ] The solo FAQ states pairs-only (no "you can start with one").
- [ ] `/` states the platform/app is always free, in context.
- [ ] `/offers` route exists, public (`ClarityLandingLayout`), and renders **two** tiers: Platform
      (free) + Co-Founder Program (**€1,000/pair**, regular only — founding price NOT shown).
- [ ] The Program card shows a **"Not included"** boundary naming Calibration Badge + FCO, linking to
      ladischenski.com **without** inline prices.
- [ ] A `[FOUNDER DECISION]` placeholder exists for the Stripe Payment Link URL (no fake/broken
      checkout link ships).
- [ ] Visual QA passed at 320 / 375 / desktop (per `.claude/rules/visual-qa.md`).
- [ ] `tsc`, lint, build, tests green.

## UX Notes

- **Landing CTA states:** resolves to the next upcoming webinar event; graceful fallback if none
  upcoming (e.g. "Next session: [date]" / notify). `[FOUNDER DECISION]` on fallback copy + final CTA
  label ("Reserve your seat" recommended over "Join", which overpromises immediacy on an auth-gated
  RSVP).
- **/offers hierarchy:** the eye lands on the Co-Founder Program (the product) first; Platform-free
  reads as reassurance above it; the "Not included" boundary sits within/under the Program card.
  Spacious, scannable.
- **Per-pair framing** is explicit (price shown as "/pair", with "(€X/founder)" secondary).

## Acceptance Criteria

- [ ] An accelerator-referred founder landing on `/` reaches the webinar event page from the hero CTA
      in one click (RSVP itself is auth-gated — cold visitors then RSVP/sign up; "one click" is to the
      event, not to a completed registration).
- [ ] A visitor can see the regular program price (€1,000/pair) on `/offers` without attending.
- [ ] The Program "Not included" boundary makes clear Badge/FCO are separate (founder's personal work
      at ladischenski.com).
- [ ] No surface implies the paid program is free, and no surface implies a solo founder can enroll.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | challenge BLOCK-1 / HQ-1 | Defer `/offers` until first paying pair | **Rejected** — `/offers` stays in scope, sequenced after landing (both before Jun 25) | The buy surface IS the WTP experiment; no paying pair (the P0 signal) is possible without it. Founder override, sound. |
| 2 | challenge BLOCK-2 / HQ-2 | CTA points at a non-existent/hardcoded event | **Latest-upcoming-webinar resolver** (reuse P772 `resolveLetterShortcode` / `version=latest` pattern) over a weekly event series | No hardcoded slug, no dead link as events pass; matches the planned weekly cadence. |
| 3 | challenge WARN-3 | Nav CTA still says "Apply for clarity program" | **Added to Solution A + Done-When** | Same-page contradiction otherwise. |
| 4 | challenge NOTE-1 | "Reaches registration in one click" is false (auth-gated RSVP) | **AC reworded** to "one click to the event page" | Accurate to the RSVP/signup flow. |
| 5 | challenge BLOCK-3 / WARN-2 / HQ-3 | Public pricing fights warm-intro model; founding price pre-anchors; 4-tier merges brands | **Two tiers only** (Platform + Program); regular €1,000/pair public; **founding €500 stays webinar-exclusive**; Badge/FCO named in a "Not included" boundary, no inline price, link out | Transparency (founder-stated) kept for regular price; urgency + brand split preserved; boundary serves expectation management (names what's excluded so it can't be claimed later). |
| 6 | challenge WARN-4 | `/offers` nav type undeclared | **Public page, `ClarityLandingLayout`** (like program/coach) | Not a BottomNav/Focus surface. |
| 7 | challenge BLOCK-1 (split P-number) | Split into P937a/P937b | **Rejected** — one spec, two build phases | The split existed only to gate offers; gate removed (see #1), so no split needed. |

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| CTA label | "Reserve your seat" (`[FOUNDER DECISION]`) + "Free live webinar" context | `/` hero + bottom + nav |
| CTA destination | next upcoming webinar event (latest-record resolver) | route-aware link |
| Platform tier | "Free forever" | `/offers` |
| Program price | "€1,000 / pair" (regular only — **founding €500 NOT shown**) | `/offers` |
| Not-included boundary | "Calibration Badge + FCO — separate, with the founder at ladischenski.com" (no price) | `/offers` Program card |
| Stripe link | `[FOUNDER DECISION: payment-link URL]` | `/offers` program CTA |
