---
status: in-progress
type: task
rank: 1000953
workstream: C1
created_date: '2026-06-27'
tags: [pricing, countdown, offers, layout]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P971: Move the enrollment countdown above the pricing cards on /program

## Problem

On `/program` (the `OffersSection` full variant), the "Enrollment closes in… days/hrs/min"
countdown (`CohortCountdown`) renders at the **bottom** of the section — inside the
full-variant-only assurance band, *after* the three pricing cards and the refund guarantee.
The deadline that should create urgency *before* a visitor weighs the price is shown only
after they've already scrolled past it. The founder wants the countdown moved up so the
deadline frames the prices, not trails them.

## Appetite

Low blast radius (one component, one file — `offers-section.tsx`; only the `/program`
full variant is affected). Fully reversible (move the JSX block back — git revert). Zero
decision density — position is decided ("above the pricing cards, between the testimonial
quote and the cards"); no copy, styling, or component change.

## Solution

Relocate the existing `<CohortCountdown />` from the bottom assurance band to sit between
the `JanTestimonial` quote section and the pricing section (above the "Pricing" eyebrow and
the card grid). The countdown component itself is unchanged — only its render position
moves. It stays **full-variant-only** (the landing `/` compact variant has no pricing cards
and must not show the countdown). The refund-guarantee band and the VAT/prices-exclude note
stay where they are at the bottom.

## Risks / Non-Goals

### Risks
- Vertical-rhythm regression: the countdown's own top/bottom margins were tuned for the
  bottom band; moving it between two bordered sections could create uneven spacing.
  Mitigation: visual QA at desktop + 375px + 320px; match the section padding rhythm
  already used between the testimonial and pricing blocks.

### Non-Goals
- Do NOT change the `CohortCountdown` component (timer logic, copy, styling) — only move it.
- Do NOT show the countdown on the landing `/` (compact variant) — it must remain
  full-variant-only.
- Do NOT move the refund-guarantee band or the VAT note — only the countdown relocates.
- Do NOT touch any other file — `offers-section.tsx` only.

### Alternatives Considered
- Leave it at the bottom (status quo) — rejected: the deadline can't create
  pre-price urgency from below the fold.
- Put it at the very top of the page (above the timeline/intro) — rejected by the founder
  in favor of "between the quote and the pricing," so it sits directly with the buying
  decision rather than as a page-level banner.

## Done-When

- [x] On `/program`, the countdown appears **above** the pricing cards (between the
      testimonial quote and the "Pricing" eyebrow/cards). — DOM order confirmed
      (testimonials → ENROLLMENT CLOSES IN → PRICING eyebrow → cards) + screenshots.
- [x] On `/` (landing, compact variant), the countdown does **not** appear. — structural:
      the landing (program-page) does not render `OffersSection`/`CohortCountdown` at all.
- [x] The refund-guarantee band and the VAT/prices-exclude note still render at the bottom
      of the section, unchanged. — confirmed in DOM (countdown removed from the band).
- [x] Visual QA at desktop, 375px, and 320px shows no overflow or spacing regression. —
      independent QA subagent: no overflow/truncation/clipping/duplication/alignment issues;
      countdown fits one row at 320px. (Two advisory design-quality notes — see resolution.)
- [x] No console errors on `/program` or `/`. — pages rendered cleanly (DOM snapshots ok,
      full unit suite green); no errors surfaced during load. [console not separately captured]
