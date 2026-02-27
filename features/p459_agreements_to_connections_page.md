---
status: in-progress
type: story
rank: 1
workstream: C1
created_date: 2026-02-27T00:00:00.000Z
flow: dev
tags: []
uat_file: features/uat/p459.md
test_files:
  - src/tests/p459-agreements-visibility.test.ts
  - e2e/p459-connections-page.spec.ts
  - e2e/a11y/p459-accessibility.spec.ts
  - e2e/p459-smoke.spec.ts
locked_at: '2026-02-27T15:13:20.290Z'
---

# P459: Move Partner Agreements to Connections Page

## Problem

Partner Agreements appear sandwiched between the "Create a Story" CTA and the Stories/Points tab bar on the profile page — treating them like browseable content. They are a relationship/social layer (who you've made commitments with), not content in the same category as stories or calibration points. The placement creates a wrong visual hierarchy and blocks the natural upgrade path to a full Connections model (P431).

## Solution

Move agreements off the profile content area into two surfaces:

1. **Profile header metadata line** — compact count + link ("✦ 2 Clarity Partners →") visible to the right viewer set, linking to the new Connections page.
2. **New `/p/:slug/connections` route** — dedicated Connections page listing all agreements the viewer is permitted to see, with layout designed to accommodate the P431 Known/Unknown/Clarity Partner expansion.

## UX Design

### ASCII Wireframes

**Owner profile header (has agreements):**
```
┌──────────────────────────────────────────────┐
│  [Avatar]  Name Surname                       │
│            @slug                              │
│            ✦ 2 Clarity Partners →            │  ← metadata line, links to /p/slug/connections
│            [Edit Profile]                    │
└──────────────────────────────────────────────┘
```

**Owner with no agreements:**
```
│  ✦ No Clarity Partners yet  [+ Create Agreement] │
```
(or omit metadata line entirely if empty — owner sees CTA on the Connections page itself)

**Visitor (public agreements exist):**
```
│  ✦ 2 Clarity Partners →   │   ← links to /p/slug/connections
```

**Visitor (viewer is a party to at least one agreement):**
```
│  ✦ You have 1 agreement with this person →  │
```

**Visitor (no visible agreements):**
```
(metadata line hidden — returns null)
```

---

**Connections page `/p/:slug/connections`:**

```
┌──────────────────────────────────────────────┐
│  ← Name Surname's Connections                │
├──────────────────────────────────────────────┤
│  ✦ Partner Agreements                        │
│  ┌─────────────────────────────────────────┐ │
│  │ [Agreement title]          [Active] [→] │ │
│  │ With: @partnerSlug  |  Since: Mar 2025  │ │
│  ├─────────────────────────────────────────┤ │
│  │ [Agreement title 2]        [Active] [→] │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [+ New Agreement]   (owner only)            │
└──────────────────────────────────────────────┘
```

**P431 upgrade (future — no profile page change needed):**
```
│  ✦ Known Connections (3)                     │
│  [mutual /live session list]                 │
│                                              │
│  ✦ Partner Agreements (2)                   │
│  [agreement list]                            │
```

### Viewer State Matrix

| Viewer | Metadata line shows | Connections page shows |
|--------|--------------------|-----------------------|
| Owner | All agreements count | All agreements + "New Agreement" CTA |
| Visitor (party to agreement) | "You have N agreement(s)" | Shared agreements only |
| Visitor (public agreements exist) | Count of public active | Public active agreements |
| Visitor (no visible agreements) | Hidden | 404 or empty state |

## Technical Notes

- **Visibility logic already correct** — `filterAgreementsForViewer()` in `profile-agreements-section.tsx` handles all 5 states. Reuse as-is.
- **Profile page change** — remove `ProfileAgreementsSection` from content area; add a compact metadata line component to profile header (near avatar/bio area in `profile-page-v2.tsx`).
- **New route** — add `/p/:slug/connections` to router. New `connections-page.tsx` (or `profile-connections-page.tsx`) renders the agreement list.
- **Data** — no new DB queries needed; existing `useAgreements` hook / agreements service already fetches what's needed. Pass data from profile page or fetch in the new connections page independently.
- **No DB migration** — pure UI relocation.
- **P431 upgrade path** — Connections page gains Known/Unknown sections when P431 ships. Zero layout change to profile page header.

**Files to touch:**
- `src/app/pages/profile-page-v2.tsx` — remove `ProfileAgreementsSection`, add header metadata line
- `src/app/components/agreements/profile-agreements-section.tsx` — repurpose or replace with new `AgreementsMetadataLine` component
- `src/app/pages/profile-connections-page.tsx` — new file
- `src/app/App.tsx` (or router file) — add `/p/:slug/connections` route
- Possibly: `src/app/components/agreements/agreements-list.tsx` — extracted list for the connections page

## Acceptance Criteria

- [ ] Profile page no longer shows Partner Agreements section between story CTA and tab bar
- [ ] Profile header shows compact metadata line with agreement count (owner: all; visitor: filtered by existing visibility rules)
- [ ] Metadata line links to `/p/:slug/connections`
- [ ] `/p/:slug/connections` route renders agreement list with correct visibility filtering
- [ ] Owner sees "New Agreement" CTA on connections page
- [ ] Visitor with no visible agreements: metadata line hidden, connections page shows appropriate empty state
- [ ] No regression in existing agreement visibility logic (all 5 viewer states pass)
- [ ] Mobile layout correct on both profile header and connections page

## Testing

Key scenarios requiring tests:
- Metadata line renders correct count for each viewer state (owner, visitor-party, visitor-public, visitor-none)
- Metadata line hidden when no visible agreements
- Connections page route renders and passes correct `profileId` + `viewerProfileId`
- Connections page shows "New Agreement" CTA only for owner
- Existing `filterAgreementsForViewer()` unit tests still pass unchanged

---

## Test Coverage Strategy

### Overview

Test coverage is split across four layers, aligned with what each layer can verify reliably:

| Layer | File | What it covers |
|-------|------|----------------|
| Unit | `src/tests/p459-agreements-visibility.test.ts` | Pure `filterAgreementsForViewer()` logic — all 5 viewer states, edge cases, deduplication |
| E2E | `e2e/p459-connections-page.spec.ts` | Full viewer-state matrix against real DB: metadata line copy, connections page content, CTA presence |
| Accessibility | `e2e/a11y/p459-accessibility.spec.ts` | ARIA contract: keyboard navigation, heading structure, accessible labels |
| Smoke | `e2e/p459-smoke.spec.ts` | Fast load-without-crash gate: profile page, /connections route, regression check |
| UAT | `features/uat/p459.md` | Manual validation checklist: all 5 viewer states × 2 surfaces × mobile layout |

### Layer Details

**Unit tests (`p459-agreements-visibility.test.ts`)**

Tests the pure `filterAgreementsForViewer()` function in isolation. No DB, no mocks, no UI. Runs instantly. Covers:
- Owner sees all agreements (active, pending, expired, terminated, private, public)
- Visitor-party sees their agreement even when private
- Visitor-party sees terminated/expired agreements they are party to
- Anonymous (`null` viewerProfileId) sees only public active
- Stranger sees only public active; private agreements for others are hidden
- No duplicates when visitor is party to a public agreement (filter short-circuits)

The function is copied locally in the test file (mirroring the source). When the function is exported from the source module, the local copy should be replaced with a direct import.

**E2E tests (`p459-connections-page.spec.ts`)**

Live browser + real test users + seeded agreements. Covers all four viewer states end-to-end:
- Owner: metadata line shows count → connections page shows all + New Agreement CTA
- Visitor-Party: "You have N agreement(s)" copy → shared agreements only on connections page
- Public-Only Visitor: count of public active → public active list on connections page
- No-Agreements Visitor: metadata line hidden → empty state or graceful handling

Regression check: `section[aria-label="Partner Agreements"]` must not be visible on the profile page after P459 ships.

**Accessibility tests (`e2e/a11y/p459-accessibility.spec.ts`)**

ARIA contract for both surfaces:
- Metadata line link is Tab-reachable and Enter-activatable
- Link has descriptive accessible name (not just "→" or "✦")
- ✦ symbol is `aria-hidden="true"` when rendered as a span
- Connections page has an h1 heading
- Agreement list has an accessible label
- Agreement list items have non-empty text content
- "New Agreement" CTA is focusable and has accessible name

**Smoke tests (`e2e/p459-smoke.spec.ts`)**

Fast gate that runs after every deploy:
- Profile page loads without console errors (agreements removed from content area — no crash)
- `/p/:slug/connections` returns a page (not 404) without console errors
- Metadata line appears for profile with agreements
- Old `ProfileAgreementsSection` (`section[aria-label="Partner Agreements"]`) is absent from profile content
- Connections page loads for anonymous visitor without errors

**UAT (`features/uat/p459.md`)**

Manual checklist covering 30+ scenarios across:
- Profile header metadata line (5 viewer states)
- Connections page (owner, visitor-party, public-only visitor, no-agreements visitor)
- Profile page regression (agreements section gone, tab bar intact)
- Mobile layout (375px viewport, touch targets)
- Navigation and routing (direct URL, back navigation, row clicks)

### When Tests Run

| Layer | Trigger |
|-------|---------|
| Unit | `npm test -- --testPathPattern="p459"` — runs immediately (no DB needed) |
| E2E + A11y + Smoke | `npm run test:e2e -- p459` — after implementation is on the feature branch |
| UAT | Manual — after merge to staging, before `/ship p459` |

### Pre-implementation Note

The E2E, accessibility, and smoke tests will fail until the P459 implementation ships (the `/p/:slug/connections` route and metadata line component do not exist yet). The unit tests pass immediately — they test the pre-existing `filterAgreementsForViewer()` logic.
