---
status: all-done
type: change-request
rank: 1000798.0
changes: p50
tags:
  - redesign
  - p50
created_date: 2026-06-06
pipeline_ran: [change-request, dev, ship]
completed_at: 2026-06-06
---

# P910: Pledger Card Links to Pledge Certificate

> **Redesign of:** P50: Profile & Pledge Separation — original spec file removed from repo in a cleanup commit; recover with `git show 735aab2b^:features/done/3_2_jan26/p50_non_pledger_experience.md`. Surviving on-disk artifact: [P50.1: Implementation Gaps](../3_2_jan26/p50_1_implementation_gaps.md).
> **What was wrong:** Before P50, `/p/:slug` WAS the pledge certificate — so `PledgerCard`'s link pointed at the pledge. P50 reassigned `/p/:slug` to mean "profile" and created `/p/:slug/pledge` for the certificate, but never updated `PledgerCard` (the card was not in P50's scope). The card's destination silently changed meaning from "their pledge" to "their profile" — a route-reassignment drift, not a deliberate choice. The card's content is entirely pledge-themed (Witnessed By, Pledged After, Signed on date, reason quote), so the click promise is "see their pledge," yet it lands on the profile.

## Operating Mode

> This spec is an **incremental correction** to P50, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P50 (route structure, profile/pledge separation, certificate cross-links) are not up for re-examination.

## Problem Statement

Visitors clicking a pledger from the landing signature wall or the `/pledgers` page expect to see that person's pledge — the card promises it (witness count, signed date, reason quote). Instead they land on the general profile (`/p/:slug`) and must find the "Their Clarity Pledge" link to reach the certificate. This:

1. Mismatches click intent — the pledge-themed card delivers a profile.
2. Buries the visitor-facing **witness CTA** (on `/p/:slug/pledge`) one click deeper. Witnessing is the product-led-growth loop; every extra click costs conversions on the highest-intent path (someone actively browsing pledgers).

P50's original problem statement ("the app conflated profiles and pledge certificates") is still valid and untouched — this correction relies on that separation existing.

## Jobs To Be Done

- **Preserved from P50:** Profile and pledge certificate remain separate concepts at separate URLs. Certificate page cross-links (QR → certificate, name/avatar → profile) unchanged. Nav "View My Pledge" → certificate unchanged.
- **Corrected:** "As a visitor browsing pledgers, when I click a pledger I see their pledge certificate" — the job the card visually promises but currently doesn't deliver.
- **New:** none. (The witness CTA already exists on the certificate page; this change only shortens the path to it.)

## Current State

`PledgerCard` ([src/app/components/social/pledger-card.tsx:48](../../../src/app/components/social/pledger-card.tsx)) is rendered by two surfaces:

- Landing page signature wall (`src/app/components/social/signature-wall.tsx`)
- `/pledgers` page (`src/app/pages/clarity-pledgers-page.tsx`)

The whole card is one `<Link to={`/p/${slug}`}>` with a hover hint reading "Open Profile" and a `pledger_card_clicked` Mixpanel event (`{ pledger_slug }`, documented in P35).

**Before (current):**
```
┌──────────────────────────────┐
│ (avatar)  Jane Doe           │
│           Co-founder         │
│                              │
│ "Why I pledged..."           │
│ ──────────────────────────── │
│  3              2            │
│  Witnessed By   Pledged After│
│ ──────────────────────────── │
│ Signed on January 5, 2026    │
│                              │
│             Open Profile  ←──┼── whole card → /p/jane-doe (profile)
└──────────────────────────────┘
```

## Root Cause

Route-meaning drift. Pre-P50, `/p/:slug` rendered the certificate; the card's `to={`/p/${slug}`}` was correct then. P50 split the routes and reassigned `/p/:slug` to the profile, but `pledger-card.tsx` was not in P50's surface list (confirmed by predecessor analysis — neither P50 nor P50.1 mentions PledgerCard, the signature wall, or `/pledgers`). The link was never revisited.

Live evidence of the drift in the component itself: the comment at [pledger-card.tsx:138](../../../src/app/components/social/pledger-card.tsx) reads "Spacer to push **Open pledge** to bottom" while the rendered hint at line 143 says "**Open Profile**".

## Redesign

Point the card at the pledge certificate. One destination change + label to match:

- `to={`/p/${slug}`}` → ``to={`/p/${slug}/pledge`}``
- Hover hint "Open Profile" → "Open Pledge" `[FOUNDER DECISION: label copy — "Open Pledge" proposed; alternatives: "View Pledge", "See Their Pledge"]`
- `pledger_card_clicked` analytics event unchanged (same name, same `pledger_slug` prop) — dashboards keep continuity.

**After (redesign):**
```
┌──────────────────────────────┐
│ (avatar)  Jane Doe           │
│           Co-founder         │
│                              │
│ "Why I pledged..."           │
│ ──────────────────────────── │
│  3              2            │
│  Witnessed By   Pledged After│
│ ──────────────────────────── │
│ Signed on January 5, 2026    │
│                              │
│              Open Pledge  ←──┼── whole card → /p/jane-doe/pledge (certificate)
└──────────────────────────────┘
                 │
                 ▼
   /p/jane-doe/pledge (visitor view)
   ┌──────────────────────────────┐
   │  Pledge certificate          │
   │  (avatar/name → /p/jane-doe) │ ← profile still 1 click away (P50 cross-link)
   │  witnesses · reason · QR     │
   │  [ Witness this pledge ]     │ ← PLG loop now 1 click from the wall
   └──────────────────────────────┘
```

Both contexts (landing signature wall, `/pledgers` grid) change identically — they share the component and pass no destination override.

**404 safety:** `/p/:slug/pledge` 404s for non-pledgers (P50 AC). Both card surfaces are fed by `get_featured_profiles` RPC, which returns only verified **and pledged** non-test profiles (`api.ts getVerifiedProfiles`/`getFeaturedProfiles`) — every card subject has a pledge page. No guard needed.

## Predecessor Sections Superseded

No predecessor sections superseded — this spec extends P50. The corrected surface (`pledger-card.tsx`) was never in P50's scope; P50's route structure, certificate cross-links, and nav destinations all remain authoritative. The superseded artifact is pre-P50 component code, not P50 itself.

| Section | P50 said | Status | Replaced by |
|---------|----------|--------|-------------|
| (none) | — | — | — |

## Requirements

1. `PledgerCard` links to `/p/{slug}/pledge` for all consumers.
2. Hover hint text matches the destination (pledge, not profile).
3. `pledger_card_clicked` event continues to fire with `{ pledger_slug }` on click.
4. `pledger-card.test.tsx` updated: href assertion (`/p/john-doe` → `/p/john-doe/pledge`) and label-text assertions. These tests ARE the spec being corrected — updating them is the change, not test-fudging.

## What Stays the Same

- Routes: `/p/:slug` (profile) and `/p/:slug/pledge` (certificate) — untouched.
- Profile page's "Their Clarity Pledge" / "My Clarity Pledge" link ([profile-page-v2.tsx:908](../../../src/app/pages/profile-page-v2.tsx)) — untouched.
- Certificate page cross-links (name/avatar → profile, QR → certificate) — untouched; this is how the profile stays one click away.
- `signature-wall.tsx` and `clarity-pledgers-page.tsx` — no code change (they consume the shared card).
- "View All Pledgers" link on the wall → `/pledgers` — untouched.
- Analytics event name and props.
- Data fetching (`get_featured_profiles` RPC) — untouched.

## Surfaces in Scope

**In scope:**
- `src/app/components/social/pledger-card.tsx` (link target, hint label, stale comment at line 138)
- `src/app/components/social/pledger-card.test.tsx` (href + label assertions)

**Out of scope:**
- `src/app/components/social/signature-wall.tsx` (consumer — inherits change, no edit)
- `src/app/pages/clarity-pledgers-page.tsx` (consumer — inherits change, no edit)
- `src/app/pages/pledge-page.tsx`, `src/app/pages/profile-page-v2.tsx`
- Any other `GravatarAvatar`/`PersonRow` click destinations elsewhere in the app

## Acceptance Criteria

- [x] Clicking any pledger card on the landing signature wall lands on `/p/{slug}/pledge`
- [x] Clicking any pledger card on `/pledgers` lands on `/p/{slug}/pledge`
- [x] Hover hint reads the approved label (default "Open Pledge"), not "Open Profile"
- [x] `pledger_card_clicked` fires with `{ pledger_slug }` on card click (unchanged)
- [x] The landed certificate page shows the visitor witness CTA for logged-out/other-user visitors
- [x] Profile remains reachable from the certificate via the existing name/avatar cross-link (P50 regression check)
- [x] Surfaces NOT in scope are visually unchanged
- [x] All existing P50 tests still pass (`navigation-acceptance-full.test.tsx`, route behavior)
- [x] `pledger-card.test.tsx` passes with updated assertions

