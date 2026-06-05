---
status: today
type: story
rank: 500392.5
created_date: '2026-06-04'
tags:
  - navigation
  - partners
  - agreements
  - discovery
delivery_stage: create-spec
flow: dev
pipeline_plan: [create-spec, dev, verify]
pipeline_ran:
  - create-spec
pipeline_skipped: [ux -- pattern copy of Letters badge with UI Contract already in spec, architect -- no schema/auth change; hook reads existing agreementsService, generate-tests -- single hook + nav rendering; /dev TDD covers badge/page parity, decompose -- ~4 files]
locked_at: '2026-06-04T16:59:49.887Z'
---

# P885: "Partners" Navigation Item with Invitation Badge

## Problem

**Situation:** A user's clarity partners — active agreements plus incoming pending invitations — live at `/p/:slug/partners` (`ProfileConnectionsPage`). The page is reachable only from the user's own profile. Mobile bottom nav (Home, Letters, Events, My Profile) and the desktop nav have no entry for it.
**Complication:** People don't find their clarity partners, and when a new partner invitation arrives there is no signal anywhere in the navigation — it waits invisibly until the user happens to visit the page.
**Question:** How do we make the partners page a first-class navigation destination with an unread-style counter for waiting invitations?

**Note:** Partners ≠ Pledgers. `/pledgers` is the public gallery of pledge-takers and is NOT touched by this spec.

## Appetite

Low blast radius (navigation components + one new count hook; partners page itself unchanged). Fully reversible (git revert). Low decision density — pattern copied from the existing Letters badge.

## Solution

Add a **Partners** nav item for logged-in users, linking to `/p/{slug}/partners`, with a badge showing the count of incoming pending invitations.

1. **Mobile bottom nav:** 5th item — `UsersIcon` (lucide), label "Partners". Badge: blue pill, same style/position as the Letters badge (`bottom-nav.tsx:117-124`).
2. **Desktop nav:** add "Partners" to the logged-in menu (alongside existing items; "Pledgers" link stays untouched).
3. **Badge count:** new hook (e.g. `usePendingPartnerInvitationCount`) mirroring `useUnreadLetterCount` — counts incoming pending `clarity_agreements` addressed to the current user (same query logic as `profile-connections-page.tsx:109` "Incoming invitations"). Live-ish freshness matching whatever the Letters badge does (refetch pattern, not necessarily realtime).

## Risks / Non-Goals

### Risks
- 5 items shrink each bottom-nav tab on narrow screens. Mitigation: still above 40px touch target at 320px; verify with screenshot.
- Count query duplication drifting from the page's own "incoming invitations" filter. Mitigation: extract/share the filter logic so badge and page always agree.
- Badge promises an item the page doesn't surface prominently. Mitigation: page already has an "Incoming invitations" section at top — verify it renders for the badge cases.

### Non-Goals
- Do NOT rename or modify the Pledgers page, route, or its nav links — Pledgers is a different concept.
- Do NOT redesign `ProfileConnectionsPage` (accept/decline flows unchanged).
- Do NOT add realtime subscriptions if the Letters badge doesn't use them — match the existing freshness pattern.
- Do NOT show the Partners item for logged-out users (they have no partners page).

## Done-When

- [ ] Mobile bottom nav (logged-in) shows 5 items including Partners (UsersIcon) — order: Home, Letters, Partners, Events, My Profile (founder-decided 2026-06-05: groups the two relationship surfaces)
- [ ] Tapping Partners opens `/p/{slug}/partners`; tab shows active state on that route
- [ ] Badge shows count of incoming pending invitations; hidden when 0; "99+" cap like Letters
- [ ] Badge count always matches the "Incoming invitations" section on the partners page (shared filter logic)
- [ ] Desktop logged-in nav shows a "Partners" entry linking to the same page
- [ ] Pledgers link/page completely unchanged
- [ ] 320px screenshot confirms no overflow/truncation in bottom nav

## Acceptance Criteria

- [ ] A logged-in mobile user reaches their partners page in one tap from any browse page
- [ ] When a new partner invitation arrives, the user sees a numbered badge on the Partners nav item (after the normal refetch cadence)
- [ ] Accepting/declining an invitation clears it from the count

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Nav label | "Partners" | Mobile bottom nav + desktop menu, logged-in only |
| Icon | `UsersIcon` (lucide) | 1.5px/2.5px stroke matching siblings |
| Link target | `/p/{slug}/partners` | Current user's slug |
| Badge style | blue-500 pill, white text, top-right of icon | Identical to Letters badge |
| Badge cap | "99+" | Same as Letters |
| Badge hidden | count = 0 | Same as Letters |
