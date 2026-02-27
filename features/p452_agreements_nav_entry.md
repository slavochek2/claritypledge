---
id: p452
title: "Nav: Agreements entry point"
type: story
status: backlog
priority: medium
source: sim
changes: p422
persona: invited-party
created: 2026-02-27
tags: []
rank: 125500.0
created_date: 2026-02-27
---

## Problem

After accepting or creating an agreement, there is no way to get back to it from the nav. The only current path is Profile page → "Partner Agreements" section — but only if you know to go there. The nav bar (desktop and mobile bottom nav) has no Agreements entry point.

This gap is most painful for the **invited party**: they arrive via an invitation link, accept the agreement, and then have no obvious way to find it again. The "Create Agreement" button on the profile page is a creation CTA, not a navigation link to existing agreements.

_Surfaced during /sim of p422 (Clarity Partner Agreement)._

---

## Proposed Change

### Option A — Nav link (preferred if `/agreements` route exists)

Add an "Agreements" icon-link to the logged-in user nav alongside Session History, My Events, and My Profile:

- **Desktop nav** (`src/app/components/layout/simple-navigation.tsx`, logged-in icon row): add `HandshakeIcon` / `FileCheckIcon` link pointing to `/agreements`
- **Mobile bottom nav** (`src/app/components/layout/bottom-nav.tsx`, `navItems` array): add matching entry

**Dependency:** `/agreements` does not exist yet. Building it is a separate story (full agreements list page). Until that story ships, this option is blocked.

### Option B — Profile page section (simpler alternative, no new route needed)

If the viewer is the owner and has any agreements (pending or active), surface them prominently on the Profile page with a clear "My Agreements" heading and direct links to each agreement detail page (`/agreements/:id`).

The section already exists (`src/app/components/agreements/profile-agreements-section.tsx`) but is rendered only when the user is viewing their own profile and knows to scroll there. The fix is UX clarity, not new infrastructure:

1. Add a nav dropdown entry "My Agreements" pointing to `/p/:slug#agreements` (or `/me#agreements`) so there is a one-click path back.
2. OR add "Agreements" to the hamburger dropdown (`src/app/components/layout/navigation-menu-items.tsx`) for logged-in users, pointing to the profile page with a hash anchor.

This option requires no new route and no new page. It is the preferred starting point.

---

## Acceptance Criteria (Option B — preferred)

- [ ] Logged-in user with at least one agreement (any status) can reach the Partner Agreements section on their profile in one click from anywhere in the app.
- [ ] The nav entry is visible on desktop (dropdown or icon row) and on mobile (hamburger or bottom nav).
- [ ] Clicking the nav entry scrolls to / opens the agreements section on the profile page.
- [ ] Users with no agreements do not see a broken or empty agreements destination (either hide the nav entry until they have at least one pending/active agreement, or show the existing "No agreements yet. Create Agreement" state).
- [ ] The nav entry is only shown to logged-in (verified) users — not to logged-out visitors.

---

## Out of Scope

- Building a standalone `/agreements` list page — that is a separate story (Option A dependency).
- Agreement filtering, search, or sorting.
- Any changes to the agreement detail page (`/agreements/:id`).
