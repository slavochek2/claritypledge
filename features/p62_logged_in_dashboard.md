# P62: Logged-In Dashboard Experience

## Problem

Logged-in users currently land on the marketing landing page, which provides no value to them. There's no central hub showing:
- People they can have Clarity Meetings with
- Events they're registered for or hosting
- Quick actions relevant to their state

## Solution

Create a personalized dashboard at `/home` that becomes the hub for logged-in users, with **people first** (primary action) and event-centric content.

## User Stories

### As a logged-in user
- I want to see people from my next event so I can start Clarity Meetings
- I want to see my upcoming events (attending and hosting) in one place
- I want quick access to start a meeting, host events, and collaborate

### As a potential event host
- I want a clear path to host my first event
- I want to see my draft and published events

### As a contributor
- I want to understand how I can help (events, code, ideas)
- I want a simple way to express interest in collaborating

## Design

### Navigation Changes

```
CHANGES:
1. Add "Dashboard" to logged-in user's dropdown menu
2. Add "Collaborate" link to nav for non-logged-in users

NO CHANGES:
- Logo always → / (don't change)
- CTA "Start a Clarity Meeting" stays the same
```

**Desktop nav (not logged in):**
```
[Events] [Pledgers] [Manifesto] [About] [Collaborate] [Start a Clarity Meeting] [Menu]
```

**Footer (add Collaborate):**
```
Events | Pledgers | Manifesto | About | Collaborate
```

### Dashboard Layout (`/home`)

**Desktop (People left, Events right, Actions bottom):**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Welcome back, {name}                                                        │
│                                                                              │
│  ═══════════════════════════════════════╦════════════════════════════════════│
│  PEOPLE FROM YOUR NEXT EVENT            ║  YOUR EVENTS                       │
│  ═══════════════════════════════════════╬════════════════════════════════════│
│  Clarity Hike — Jan 25                  ║                                    │
│                                         ║  ATTENDING                         │
│  ┌─────────────────────────────────┐    ║  ┌────────────────────────────┐    │
│  │ [Avatar] Sarah Chen             │    ║  │ 📅 Communication Workshop  │    │
│  │ [Invite to a Clarity Meeting]   │    ║  │    Jan 25 · 3pm PT  [View] │    │
│  └─────────────────────────────────┘    ║  └────────────────────────────┘    │
│  ┌─────────────────────────────────┐    ║                                    │
│  │ [Avatar] Marcus Johnson         │    ║  HOSTING                           │
│  │ [Invite to a Clarity Meeting]   │    ║  ┌────────────────────────────┐    │
│  └─────────────────────────────────┘    ║  │ 🎤 My First Event  [Draft] │    │
│  ┌─────────────────────────────────┐    ║  │    Jan 30 · 2pm PT  [Edit] │    │
│  │ [Avatar] Elena Rodriguez        │    ║  └────────────────────────────┘    │
│  │ [Invite to a Clarity Meeting]   │    ║                                    │
│  └─────────────────────────────────┘    ║  UPCOMING EVENTS                   │
│                                         ║  ┌────────────────────────────┐    │
│  Empty: "Join events to meet people"    ║  │ 📅 Bay Area Clarity Meetup │    │
│  [See events →]                         ║  │    Feb 10          [RSVP]  │    │
│                                         ║  └────────────────────────────┘    │
│                                         ║  [See all events →]                │
│                                         ║                                    │
│  ═══════════════════════════════════════╩════════════════════════════════════│
│  QUICK ACTIONS                                                               │
│  ════════════════════════════════════════════════════════════════════════════│
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐     │
│  │ 🎯 Start a Clarity │  │ 🎤 Host an         │  │ 🤝 Collaborate     │     │
│  │    Meeting         │  │    Event           │  │    With Us         │     │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 📜 Take the Pledge — Join 200+ committed to clarity   [Take Pledge →]  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  (only shown if hasPledged === false)                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Mobile (People first, Events collapsible):**

```
┌─────────────────────────────┐
│ Welcome back, {name}        │
│                             │
│ ─── PEOPLE ─────────────── │
│ From: Clarity Hike (Jan 25) │
│                             │
│ [Avatar] Sarah Chen         │
│ [Invite to a Clarity Mtg]   │
│                             │
│ [Avatar] Marcus Johnson     │
│ [Invite to a Clarity Mtg]   │
│                             │
│ [Avatar] Elena Rodriguez    │
│ [Invite to a Clarity Mtg]   │
│                             │
│ ─── YOUR EVENTS ─────────  │
│ ▶ Attending (2)             │
│ ▶ Hosting (1)               │
│                             │
│ ─── UPCOMING EVENTS ─────  │
│ Bay Area Clarity Meetup     │
│ Feb 10           [RSVP]     │
│ [See all events →]          │
│                             │
│ ─── QUICK ACTIONS ──────── │
│ [Start a Clarity Meeting]   │
│ [Host an Event]             │
│ [Collaborate With Us]       │
│                             │
│ ┌─────────────────────────┐ │
│ │ 📜 Take the Pledge      │ │
│ │ [Take Pledge →]         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### People Section (Primary Feature)

**Scope:** People from user's **next upcoming event** only (simpler query, clearer context).

**Person card:** Avatar + Name + Button. No dates, no event context on card (event shown as section header).

**Click behavior:**
- Click **avatar/name** → Profile page (`/p/{slug}`)
- Click **button** → `/live` (sync meeting flow with QR/link)

**Edge cases:**
| Scenario | Behavior |
|----------|----------|
| User is host of next event | Show all attendees |
| Event is TODAY | Show until event end time |
| 0 other attendees | "No one else registered yet" |
| No upcoming events | "Join events to meet people" [See events →] |

**Button flow:** Click "Invite to a Clarity Meeting" → `/live` → User gets link/QR → Shares manually (text/email/etc) → Partner joins

### Events Section

**Attending:** Events user RSVP'd to (upcoming only)
- Click → Event detail page

**Hosting:** Events user created (drafts + published)
- Shows [Draft] or [Published] badge
- Click → Event edit page

**Upcoming Events:** Discovery section
- Shows a few upcoming public events user hasn't RSVP'd to
- [See all events →] links to `/events`

**Empty states:**
- Attending: "No upcoming events" [See events →]
- Hosting: "Not hosting yet" [Host an Event →]

### Quick Actions

| Card | Icon | Label | Destination |
|------|------|-------|-------------|
| Start a Clarity Meeting | 🎯 | "Start a Clarity Meeting" | `/live` |
| Host an Event | 🎤 | "Host an Event" | `/events/create` |
| Collaborate | 🤝 | "Collaborate With Us" | `/collaborate` |

**Conditional:**
- "Take the Pledge" banner — Only shown if `hasPledged === false`

### Collaborate Page (`/collaborate`)

Public page (no auth required). Reuses Web3Forms pattern from About page.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🤝 Collaborate With Us                                         │
│                                                                 │
│  Clarity Pledge is open source. We're building this together.   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ I'm interested in...                                    │   │
│  │ ☐ Hosting an event                                      │   │
│  │ ☐ Contributing code or design                           │   │
│  │ ☐ Sharing feedback or ideas                             │   │
│  │ ☐ Something else                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Email [____________________] (pre-filled if logged in)         │
│                                                                 │
│  Message (optional)                                             │
│  [                                                           ]  │
│                                                                 │
│  [Send]                                                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Or dive into the code: [GitHub →]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Event Page Addition

Add "Invite to a Clarity Meeting" button next to each attendee on event detail page.
Same flow: Click → `/live` → Share link.

## Technical Notes

### Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Events service: user's next event | **Need to add** | Dashboard "People" section |
| Events service: people from event | **Need to add** | Dashboard "People" section |
| Events service: user's registered events | **Need to add** | Dashboard "Attending" section |
| Events service: user's hosted events | **Need to add** | Dashboard "Hosting" section |
| User's pledge status | Exists | "Take Pledge" banner conditional |
| `/live` page | Exists | Meeting initiation destination |
| `/events` page | Exists (P61) | "See all events" link |
| `/events/create` page | Exists (P61) | "Host an Event" link |

### Events Service Changes Required

```typescript
// Add to events-service.interface.ts
interface EventsService {
  // ... existing methods ...

  // NEW: Dashboard queries
  getUserNextEvent(profileId: string): Promise<EventWithHost | null>;
  getPeopleFromEvent(eventId: string, excludeProfileId: string): Promise<EventAttendee[]>;
  getUserRegisteredEvents(profileId: string): Promise<EventWithHost[]>;
  getUserHostedEvents(profileId: string): Promise<EventWithHost[]>;
  getUpcomingPublicEvents(excludeProfileId: string, limit: number): Promise<EventWithHost[]>;
}

// Simplified type for people list
interface EventAttendee {
  profileId: string;
  name: string;
  slug: string;
  avatarColor?: string;
  avatarUrl?: string;
}
```

### New Files

| File | Purpose |
|------|---------|
| `src/app/pages/home-page.tsx` | Dashboard page component |
| `src/app/pages/collaborate-page.tsx` | Collaboration interest form |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add routes: `/home`, `/collaborate` |
| `src/app/components/layout/simple-navigation.tsx` | Add "Collaborate" link (non-logged-in), add "Dashboard" to menu |
| `src/app/components/layout/nav-links.ts` | Add Collaborate to NAV_LINKS |
| `src/app/components/layout/navigation-menu-items.tsx` | Add "Dashboard" menu item for logged-in users |
| Event detail page | Add "Invite to a Clarity Meeting" buttons |

### Route Protection

- `/home` — Requires authentication (redirect to `/` if not logged in)
- `/collaborate` — Public (anyone can express interest)

### Loading & Error States

| Section | Loading | Error |
|---------|---------|-------|
| People | Skeleton cards (3) | "Couldn't load people" [Retry] |
| Events | Skeleton cards (2) | "Couldn't load events" [Retry] |

### Analytics Events

| Event | When | Properties |
|-------|------|------------|
| `dashboard_viewed` | Page load | — |
| `meeting_invite_clicked` | Click "Invite to a Clarity Meeting" | `source: 'dashboard' \| 'event_page'` |
| `collaborate_form_submitted` | Form submit | `interests: string[]` |
| `quick_action_clicked` | Click quick action | `action: 'start_meeting' \| 'host_event' \| 'collaborate'` |

## Phases

### Phase 1: Nav + Dashboard Shell + Collaborate Page
- [ ] Add "Collaborate" link to nav (non-logged-in users)
- [ ] Add "Collaborate" to footer
- [ ] Add "Dashboard" to logged-in user's dropdown menu
- [ ] Create `/home` route (auth-protected)
- [ ] Create `HomePage` with welcome message + placeholder sections
- [ ] Create `/collaborate` route (public)
- [ ] Create `CollaboratePage` with form (Web3Forms)
- [ ] Add GitHub link

**No blockers. Can start immediately.**

### Phase 2: Quick Actions + Take Pledge Banner
- [ ] Add quick action cards (Start Meeting, Host Event, Collaborate)
- [ ] Add conditional "Take the Pledge" banner
- [ ] Track analytics

**No blockers. Can start immediately.**

### Phase 3: Events Integration
- [ ] Add `getUserRegisteredEvents(profileId)` to EventsService
- [ ] Add `getUserHostedEvents(profileId)` to EventsService
- [ ] Add `getUpcomingPublicEvents()` to EventsService
- [ ] Implement in mock + real services
- [ ] Display Attending, Hosting, Upcoming Events sections
- [ ] Add collapsible behavior for mobile
- [ ] Link to event detail/edit pages

**Blocked by:** Events service interface changes (small addition)

### Phase 4: People Section
- [ ] Add `getUserNextEvent(profileId)` to EventsService
- [ ] Add `getPeopleFromEvent(eventId, excludeProfileId)` to EventsService
- [ ] Implement in mock + real services
- [ ] Display people list with avatar + name + button
- [ ] Click avatar/name → profile page
- [ ] Click button → `/live`
- [ ] Empty states for edge cases

**Depends on:** Phase 3

### Phase 5: Event Page Integration
- [ ] Add "Invite to a Clarity Meeting" button to event detail attendee list
- [ ] Same flow as dashboard (→ `/live`)

**Can be done in parallel with Phase 4.**

## Out of Scope

- Async meeting requests (see P64)
- Email notifications for events (see P63)
- Activity feed
- Notification center
- Profile page meeting button
- Past events in people list (MVP: next event only)

## Success Metrics

- Logged-in users spend more time in app
- Increase in Clarity Meetings started from dashboard
- Increase in event RSVPs
- Collaborate form submissions (new contributor pipeline)

## References

- Events service: `features/p61_events_complete_tech_spec.md`
- Navigation: `src/app/components/layout/simple-navigation.tsx`
- Web3Forms pattern: `src/app/pages/about-page.tsx`
- `/live` page: Existing meeting page with QR code for partner to join

## Changelog

- **2025-01-19 (v2)**: Major revision based on UX review:
  - Navigation: Keep logo → /, add "Collaborate" to nav, add "Dashboard" to menu
  - Layout: People LEFT (mobile first), Events RIGHT, Quick Actions BOTTOM
  - People scope: Next upcoming event only (simpler)
  - Person card: Avatar + Name + Button only (no dates)
  - Removed "Discover Events" quick action (redundant)
  - Added "Start a Clarity Meeting" quick action
  - Added "Take the Pledge" conditional banner
  - Added event page integration (Phase 5)
  - Clarified mobile layout with collapsible sections
- **2025-01-19 (v1)**: Initial spec with meeting initiation merged from P61.1/P63.
