# P62: Logged-In Dashboard Experience

## Problem

Logged-in users currently land on the marketing landing page, which provides no value to them. There's no central hub showing:
- Events they're registered for
- Events they're hosting
- Quick actions relevant to their state

The navigation CTA ("Start a Clarity Meeting") is the same for everyone, missing the opportunity to guide users based on their journey stage.

## Solution

Create a personalized dashboard at `/home` that becomes the hub for logged-in users, with event-centric content and contextual quick actions.

## User Stories

### As a logged-in user
- I want to see my upcoming events (attending and hosting) in one place
- I want quick access to start a meeting, view/take the pledge, and collaborate
- I want the logo to take me to my dashboard, not the marketing page

### As a potential event host
- I want a clear path to host my first event
- I want to see my draft/published events

### As a contributor
- I want to understand how I can help (events, code, ideas)
- I want a simple way to express interest in collaborating

## Design

### Navigation Changes

```
CURRENT:
Logo → / (landing for everyone)
CTA  → "Start a Clarity Meeting" (always)

AFTER:
Logo → / (logged-out) | /home (logged-in)
CTA  → "Start a Clarity Meeting" (logged-out) | "Home" (logged-in)
```

### Dashboard Layout (`/home`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Welcome back, {name}                                           │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  YOUR EVENTS                                                    │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 📅 Attending                                            │    │
│  │                                                         │    │
│  │ [Event Card] Communication Workshop — Jan 25    [View]  │    │
│  │ [Event Card] Clarity Meetup SF — Feb 2          [View]  │    │
│  │                                                         │    │
│  │ Empty state: "No upcoming events" [Discover Events →]   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🎤 Hosting                                              │    │
│  │                                                         │    │
│  │ [Event Card] My First Event — Jan 30            [Edit]  │    │
│  │                                                         │    │
│  │ Empty state: "Not hosting yet" [Host an Event →]        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  PEOPLE FROM YOUR EVENTS                                        │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 👤 Sarah Chen        Clarity Hike (Jan 25)              │    │
│  │                                      [Start Meeting]    │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ 👤 Marcus Johnson    Clarity Hike (Jan 25)              │    │
│  │                                      [Start Meeting]    │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ 👤 Elena Rodriguez   Live Session Lab (Jan 20)          │    │
│  │                                      [Start Meeting]    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Empty state: "RSVP to events to connect with people"           │
│  [Discover Events →]                                            │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  QUICK ACTIONS                                                  │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ 📅 Discover   │  │ 🤝 Collaborate│  │ 🎤 Host an    │       │
│  │    Events     │  │    With Us    │  │    Event      │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### People From Your Events (Meeting Initiation)

This section replaces the separate P61.1 meeting initiation feature. One place, one action.

**Shows:** All attendees from user's upcoming events (attending + hosting)

**Click "Start Meeting":** Navigate to `/live?partner={slug}` — partner joins via existing QR code

**Logic:**
- Fetch attendees from all user's registered + hosted events
- Filter out current user (no self-meetings)
- Dedupe by person (if same person in multiple events, show most recent event)
- No search/filter for MVP (events are small, 5-15 people)

**Empty state:** "RSVP to events to connect with people" with link to `/events`

### Quick Action Cards

**Note:** "Start a Meeting" moved to "People From Your Events" section above — more discoverable with partner context.

| Card | Icon | Label | Destination | Notes |
|------|------|-------|-------------|-------|
| Discover Events | 📅 | "Discover Events" | `/events` | Find events to attend |
| Collaborate | 🤝 | "Collaborate With Us" | `/collaborate` | Open source + ideas |
| Host an Event | 🎤 | "Host an Event" | `/events/create` | For potential hosts |

**Removed:**
- ~~Start a Meeting~~ — Now in "People From Your Events" section (with partner context)
- ~~View/Take Pledge~~ — Already in menu + profile
- ~~Settings~~ — Not a primary action, lives in menu
- ~~My Profile~~ — Accessible from avatar menu

### Collaborate Page (`/collaborate`)

New page with interest form (reuses Web3Forms pattern from About page):

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🤝 Collaborate With Us                                         │
│                                                                 │
│  Clarity Pledge is open source (AGPL-3.0). We're building       │
│  this together. Tell us how you'd like to be involved.          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ What interests you? (select all that apply)             │    │
│  │ ☐ Host an event                                         │    │
│  │ ☐ Contribute code or design                             │    │
│  │ ☐ Suggest a feature or improvement                      │    │
│  │ ☐ Something else                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Email: [________________________]                              │
│                                                                 │
│  Tell us more:                                                  │
│  [                                                           ]  │
│  [                                                           ]  │
│                                                                 │
│  [Send Message]                                                 │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Or dive into the code:                                         │
│  [View on GitHub →] github.com/slavochek2/claritypledge         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Events service: user's registered events | **Missing — need to add** | Dashboard "Attending" section |
| Events service: user's hosted events | **Missing — need to add** | Dashboard "Hosting" section |
| Events service: people from user's events | **Missing — need to add** | Dashboard "People" section |
| User's pledge status | Exists | Quick action card conditional |
| User's profile slug | Exists | Pledge card link |
| `/live` page with QR code | Exists | Meeting initiation destination |

### Events Service Changes Required

The current `EventsService` interface (from p61) lacks user-specific queries. Add these:

```typescript
// Add to events-service.interface.ts
interface EventsService {
  // ... existing methods ...

  // NEW: User-specific queries for dashboard
  getUserRegisteredEvents(profileId: string): Promise<EventWithHost[]>;
  getUserHostedEvents(profileId: string): Promise<EventWithHost[]>;

  // NEW: Meeting initiation (people from user's events)
  getPeopleFromUserEvents(profileId: string): Promise<EventAttendeeWithEvent[]>;
}

// New type for meeting initiation
interface EventAttendeeWithEvent {
  profileId: string;
  name: string;
  slug: string;
  avatarColor?: string;
  avatarUrl?: string;
  eventTitle: string;      // Most recent shared event
  eventDate: string;       // For display context
}
```

**Implementation notes:**
- `getUserRegisteredEvents`: Query `event_rsvps` WHERE `profile_id = ?`, join to `events`
- `getUserHostedEvents`: Query `events` WHERE `host_id = ?`
- `getPeopleFromUserEvents`:
  1. Get user's registered + hosted event IDs
  2. Get all attendees from those events
  3. Filter out current user
  4. Dedupe by profileId (keep most recent event)
- All filter to upcoming events only

Data already exists in DB:
- `event_rsvps.profile_id` — tracks who RSVP'd
- `events.host_id` — tracks who created the event

### New Files

| File | Purpose |
|------|---------|
| `src/app/pages/home-page.tsx` | Dashboard page component |
| `src/app/pages/collaborate-page.tsx` | Collaboration interest form |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add routes: `/home`, `/collaborate` |
| `src/app/components/layout/simple-navigation.tsx` | Logo destination logic, CTA logic |

### Route Protection

- `/home` — Requires authentication (redirect to `/login` if not logged in)
- `/collaborate` — Public (anyone can express interest)

## Phases

### Phase 1: Nav Changes + Dashboard Shell
- [ ] Update logo destination (logged-in → `/home`)
- [ ] Update nav CTA (logged-in → "Home" button)
- [ ] Create `/home` route (auth-protected)
- [ ] Create `HomePage` with welcome message + empty sections

**No blockers. Can start immediately.**

### Phase 2: Quick Actions + Collaborate Page
- [ ] Add quick action cards (Meeting, Discover Events, Host, Collaborate)
- [ ] Create `/collaborate` page with interest form (Web3Forms)
- [ ] Add GitHub link
- [ ] Track analytics (collaborate_form_submitted, collaborate_interest_type)

**No blockers. Can start immediately.**

### Phase 3: Events Integration (requires p61 extension)
- [ ] Add `getUserRegisteredEvents(profileId)` to EventsService interface
- [ ] Add `getUserHostedEvents(profileId)` to EventsService interface
- [ ] Implement in mock service
- [ ] Implement in real service
- [ ] Fetch and display user's registered events on dashboard
- [ ] Fetch and display user's hosted events on dashboard
- [ ] Link to event detail/edit pages

**Blocked by:** Events service interface changes (small addition to p61)

### Phase 4: People From Your Events (Meeting Initiation)
- [ ] Add `getPeopleFromUserEvents(profileId)` to EventsService interface
- [ ] Add `EventAttendeeWithEvent` type
- [ ] Implement in mock service (reuse existing mock attendees)
- [ ] Implement in real service
- [ ] Display people list on dashboard with "Start Meeting" button
- [ ] "Start Meeting" → `/live?partner={slug}`
- [ ] Empty state: "RSVP to events to connect with people"

**Depends on:** Phase 3 (uses same event queries)

**Replaces:** Separate P61.1/P63 meeting initiation feature — simpler, one place.

## Out of Scope

- Activity feed (future feature)
- Notification center (future feature)
- Collaboration event calendar (future feature, Slava considering hybrid events)
- AI chatbot for orientation (deferred to p67/p68)

## Open Questions (Resolved)

1. ~~**Events data availability**~~: ✅ **Resolved** — P61 has `event_rsvps.profile_id` + `events.host_id`. Need to add 3 methods to interface (Phase 3-4).

2. ~~**Collaborate form routing**~~: ✅ **Resolved** — All to one inbox (simpler). Revisit if volume warrants separate routing.

3. ~~**Hybrid collaboration events**~~: ✅ **Deferred** — Future feature. Not blocking.

4. ~~**Meeting initiation approach**~~: ✅ **Resolved** — Merged into dashboard as "People From Your Events" section. Replaces separate P61.1/P63 feature. Simpler: one place, one action, no profile-page banners or URL-param notifications.

## Success Metrics

- Logged-in users spend more time in app (not bouncing from landing)
- Increase in event registrations (clear path from dashboard)
- Collaborate form submissions (new contributor pipeline)
- Reduction in "where do I go?" confusion (qualitative feedback)

## References

- UX discussion: Sally (UX Designer agent) session, Jan 2025
- Events service: `features/p61_events_complete_tech_spec.md`
- Navigation: `src/app/components/layout/simple-navigation.tsx`
- Web3Forms pattern: `src/app/pages/about-page.tsx`
- `/live` page: Existing meeting page with QR code for partner to join

## Changelog

- **2025-01-19**: Merged meeting initiation (formerly P61.1/P63) into Phase 4. Added "People From Your Events" section. Resolved all open questions.
