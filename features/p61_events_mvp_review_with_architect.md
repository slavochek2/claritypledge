# P61: Events MVP

**Status:** Ready for Implementation
**Priority:** High
**Est. Effort:** Phase 1: 1 day | Phase 2: 3-4 days
**Created:** 2026-01-15
**Depends On:** P50 (Profile & Pledge Separation)

---

## One-Sentence Goal

Build a Luma-style events platform where every RSVP creates a Clarity Pledge user with a public profile, turning offline meetups into user acquisition.

---

## Jobs-to-be-Done

### For You (Event Host)
1. **User acquisition:** Every event RSVP = verified email + authenticated user
2. **Community building:** Recurring events with real humans while building product
3. **Feature validation:** Workshop attendees test /live and give roadmap feedback
4. **Authority:** Public event history builds credibility

### For Attendees
1. **Discover events:** Browse upcoming sensemaking/clarity workshops
2. **RSVP easily:** Magic link auth (same as pledge signup)
3. **See attendees:** Know who's coming before committing
4. **Get calendar file:** Add event to Google Calendar, Apple Calendar, Outlook

---

## Implementation Phases

### Phase 1: Working Prototype (Approval Gate)

**Goal:** Build clickable React prototype mimicking Luma's UX (no backend yet)

**Deliverables:**
1. Screenshot Luma pages (event list, detail, create form)
2. Inspect HTML structure (Chrome DevTools)
3. Build React prototype with mock data
4. Runs on `localhost:5001` (main branch)
5. Clickable, realistic UX
6. Get your approval before Phase 2

**What to prototype:**
- `/events` - Event listing (grid of cards, Upcoming/Past tabs)
- `/events/new` - Create event form
- `/events/:slug` - Event detail (hero, description, attendee list, RSVP button)
- `/events/:slug/confirm` - RSVP confirmation

**Design source:** Luma.com (inspect, screenshot, copy UX patterns - not code)

---

### Phase 2: Backend Integration (After Approval)

**Implementation:**
1. Database schema (events table + RLS policies)
2. API layer (CRUD operations in api.ts)
3. Supabase Brevo integration (magic link + confirmation emails)
4. Event creation flow
5. RSVP flow (magic link for new users, instant for existing)
6. Confirmation page + .ics calendar file
7. Profile pages show event attendance (future)

---

## Key Decisions

| Question | Decision |
|----------|----------|
| **Event types** | Workshop, Experiment, Community (badge only, no functional difference) |
| **Location** | Offline only (plain text address) |
| **Email confirmation** | Required (magic link with `?source=event`) |
| **Calendar integration** | .ics file download (Google, Apple, Outlook compatible) |
| **Attendee visibility** | Public (anyone can see attendee list before RSVP) |
| **Event creation** | Any authenticated user can create events |
| **Capacity** | Unlimited for MVP (no waitlist) |
| **Filters** | None (KISS - just Upcoming/Past tabs) |
| **Zoom events** | Not MVP (offline only) |
| **Communities** | Not MVP (events are standalone) |
| **Reminder emails** | Not MVP (you handle manually via Brevo) |

---

## User Flows

### Flow 1: New User Discovers Event → RSVPs → Becomes User

```
1. User visits claritypledge.com (not logged in)
2. Clicks "Events" in nav
3. Sees grid of upcoming events
4. Clicks event card → Event detail page
5. Clicks "Sign Up to RSVP" button
6. Redirected to /sign-pledge?redirect=/events/:slug&action=rsvp
7. Enters name + email + details, clicks "Sign the Pledge"
8. Magic link sent with ?source=event&redirect=/events/:slug
9. Clicks magic link → AuthCallbackPage:
   - Creates profile: has_pledged=false, slug generated
   - Redirects to /events/:slug
10. Auto-RSVP: Add user ID to events.attendees[]
11. Redirect to /events/:slug/confirm
12. Show confirmation + "Add to Calendar" button (.ics download)
```

**Critical:** Step 10 must happen automatically (no second button click).

---

### Flow 2: Existing User RSVPs to Event

```
1. User logged in, visits /events
2. Clicks event card → Event detail page
3. Clicks "RSVP" button
4. Add user ID to events.attendees[]
5. Redirect to /events/:slug/confirm
6. Show confirmation + calendar download
```

**Critical:** No extra auth step. Instant RSVP.

---

### Flow 3: Host Creates Event

```
1. User logged in, visits /events
2. Clicks "Create Event" button (top right)
3. Redirected to /events/new
4. Fills out form:
   - Event name (required)
   - Type: Workshop / Experiment / Community
   - Date & time (future dates only)
   - Duration (1h, 2h, 3h, 4h, All day)
   - Location (plain text, e.g., "Golden Gate Park, Main Entrance")
   - Description (markdown supported)
   - Max attendees (optional, default unlimited)
5. Clicks "Create Event"
6. Validate form fields
7. Create event in database with host_id = current user
8. Generate slug from title + date (e.g., "clarity-hike-feb15")
9. Redirect to /events/:slug
10. Show success message: "Event created! Share this link: [copy button]"
```

---

## Routes

### 1. `/events` - Event Listing

**Access:** Public (no auth required)

**Content:**
- Header: "Upcoming Events" / "Past Events" tabs
- Grid layout: 3 columns desktop, 2 tablet, 1 mobile
- Each event card shows:
  - Event title
  - Date & time
  - Location (first 40 chars + "...")
  - Host avatar + name (links to `/p/:slug`)
  - Attendee count ("12 going" or "12 attended")
  - Type badge (Workshop / Experiment / Community)
- Empty state: "No upcoming events."
- Top right: "Create Event" button (if authenticated)

**Filter tabs:**
- Upcoming: `datetime >= now()`, sorted ASC
- Past: `datetime < now()`, sorted DESC

---

### 2. `/events/new` - Create Event Form

**Access:** Authenticated users only

**Form fields:**
```yaml
title:
  label: "Event Name"
  type: text
  required: true
  min: 5 characters

type:
  label: "Event Type"
  type: select
  options: ["Workshop", "Experiment", "Community"]
  required: true

datetime:
  label: "Date & Time"
  type: datetime-local
  required: true
  validation: Must be future date

duration_hours:
  label: "Duration"
  type: select
  options: [1, 2, 3, 4, 24] # 24 = All day
  required: true

location:
  label: "Location"
  type: text
  placeholder: "e.g., Golden Gate Park, Main Entrance"
  required: true
  min: 3 characters

description:
  label: "Description"
  type: textarea
  placeholder: "What will you do? Who should come? (Markdown supported)"
  required: true
  min: 20 characters
  markdown: true

max_attendees:
  label: "Max Attendees"
  type: number
  optional: true
  placeholder: "Leave blank for unlimited"
```

**Submit button:** "Create Event" (blue, primary CTA)

**Validation errors:** Show inline below each field

---

### 3. `/events/:slug` - Event Detail Page

**Access:** Public (no auth required)

**Content:**

**Hero section:**
- Event title (H1)
- Date & time (large, prominent)
- Location (with Google Maps link: `https://maps.google.com/?q={location}`)
- Type badge (Workshop / Experiment / Community)

**RSVP button** (state changes based on auth/RSVP status):
- Not logged in: "Sign Up to RSVP" (blue button)
- Logged in, not RSVP'd: "RSVP" (blue button)
- Logged in, RSVP'd: "You're Registered ✓" (green, disabled)
- Event full: "Event Full" (gray, disabled)

**Host card:**
- "Hosted by" label
- Host avatar (placeholder, links to `/p/:slug`)
- Host name + role (from profile)
- Event count ("Hosting 3 events")

**Description:**
- Markdown-rendered (same renderer as pledge `reason`)
- Support: headings, lists, links, bold/italic

**Attendees section:**
- "X going" count
- Grid of avatars (first 20, then "+ 5 more")
- Each avatar links to attendee profile (`/p/:slug`)

---

### 4. `/events/:slug/confirm` - RSVP Confirmation

**Access:** Authenticated + RSVP'd users only

**Content:**
- "You're registered!" message
- Event details summary (title, date, time, location)
- "Add to Calendar" button (downloads `.ics` file)
- "Back to Event" link
- Auto-redirect to event detail after 5 seconds

**`.ics` file format:**
```
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:{title}
DTSTART:{datetime_start}
DTEND:{datetime_end}
LOCATION:{location}
DESCRIPTION:{description}
END:VEVENT
END:VCALENDAR
```

---

## Database Schema

### `events` table

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,

  -- Event details
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('workshop', 'experiment', 'community')),
  description TEXT NOT NULL,

  -- Datetime
  datetime TIMESTAMPTZ NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 2,

  -- Location
  location TEXT NOT NULL,

  -- Host
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Capacity
  max_attendees INTEGER, -- NULL = unlimited
  attendees UUID[] DEFAULT '{}', -- Array of profile IDs who RSVP'd

  -- Future hooks
  feature_demo TEXT CHECK (feature_demo IN ('live_session', 'story_sifter', NULL)),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_events_datetime ON events(datetime);
CREATE INDEX idx_events_host ON events(host_id);
CREATE INDEX idx_events_slug ON events(slug);
```

### RLS Policies

```sql
-- Anyone can view events
CREATE POLICY "Events are viewable by everyone"
  ON events FOR SELECT
  USING (true);

-- Authenticated users can create events
CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = host_id);

-- Hosts can update their events
CREATE POLICY "Hosts can update their own events"
  ON events FOR UPDATE
  USING (auth.uid() = host_id);

-- Hosts can delete their events
CREATE POLICY "Hosts can delete their own events"
  ON events FOR DELETE
  USING (auth.uid() = host_id);
```

---

## API Layer

### Add to `src/app/data/api.ts`

```typescript
export interface Event {
  id: string;
  slug: string;
  title: string;
  type: 'workshop' | 'experiment' | 'community';
  description: string;
  datetime: string; // ISO timestamp
  durationHours: number;
  location: string;
  hostId: string;
  maxAttendees?: number;
  attendees: string[]; // Array of profile IDs
  createdAt: string;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export async function getUpcomingEvents(): Promise<Event[]>
export async function getPastEvents(): Promise<Event[]>
export async function getEventBySlug(slug: string): Promise<Event | null>
export async function createEvent(event: Omit<Event, 'id' | 'slug' | 'attendees' | 'createdAt' | 'status'>): Promise<Event>
export async function rsvpToEvent(eventId: string, userId: string): Promise<void>
export async function cancelRSVP(eventId: string, userId: string): Promise<void>
```

**Slug generation:**
```typescript
function generateEventSlug(title: string, datetime: string): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const date = new Date(datetime);
  const dateSlug = date.toISOString().split('T')[0]; // YYYY-MM-DD

  return `${titleSlug}-${dateSlug}`;
}
// Example: "Clarity Hike" on 2025-02-15 → "clarity-hike-2025-02-15"
```

---

## Email Integration (Brevo)

### Email 1: Magic Link (for RSVP)

**Trigger:** User clicks "Sign Up to RSVP", enters email

**Subject:** Confirm your RSVP for {event_title}

**Body:**
```
Hi {name},

Click below to confirm your RSVP for:

{event_title}
{datetime}
{location}

[Confirm RSVP] → {magic_link}

This link expires in 1 hour.

— Clarity Pledge
```

**Magic link URL:**
```
https://claritypledge.com/auth/callback?token={token}&source=event&redirect=/events/{slug}
```

---

### Email 2: Confirmation (after RSVP)

**Trigger:** User confirms email, RSVP'd to event

**Subject:** You're registered for {event_title}!

**Body:**
```
Hi {name},

You're all set for:

{event_title}
{datetime}
{location}

[Add to Calendar] → {ics_download_link}
[View Event Details] → {event_url}

See you there!

— Clarity Pledge
```

---

## Design System (Match Clarity Pledge)

**Colors:**
- Primary CTA: `blue-500` (RSVP button, Create Event button)
- Event type badges:
  - Workshop: `blue-50` bg, `blue-700` text
  - Experiment: `purple-50` bg, `purple-700` text
  - Community: `gray-100` bg, `gray-700` text
- Success state: `green-50` bg, `green-700` text ("You're Registered ✓")

**Typography:**
- Event titles: Same as pledger card titles
- Descriptions: Markdown rendered (same as pledge `reason`)

**Components to reuse:**
- `<Button>` from shadcn/ui
- Profile avatar component (attendee list)
- Navigation (add "Events" link between "Pledgers" and "About")

---

## Phase 1 Deliverables (Working Prototype)

### What You'll See

1. **Screenshots folder:** `docs/bmad/diagrams/p61-luma-screenshots/`
   - event-list.png
   - event-detail.png
   - create-form.png

2. **Prototype route:** `localhost:5001/events-prototype`
   - Clickable React components
   - Mock data (3 sample events)
   - No backend calls
   - Realistic UX matching Luma + Clarity Pledge design system

3. **Approval checkpoint:** You review prototype, confirm UX works, approve Phase 2

---

## Phase 2 Deliverables (Backend Integration)

- ✅ Events table created in Supabase
- ✅ RLS policies applied
- ✅ API functions implemented
- ✅ Brevo emails configured
- ✅ Event listing page functional
- ✅ Event detail page functional
- ✅ Create event form functional
- ✅ RSVP flow works (new + existing users)
- ✅ Confirmation page + .ics download works
- ✅ Navigation updated ("Events" link)

---

## Testing Checklist

**Phase 1 (Prototype):**
- [ ] Event listing shows mock events
- [ ] Clicking event card navigates to detail
- [ ] RSVP button states look correct
- [ ] Create event form is filled out-able
- [ ] Attendee avatars display in grid
- [ ] Host card shows mock data
- [ ] Mobile responsive (375px width)

**Phase 2 (Backend):**
- [ ] Create event → Appears in listing
- [ ] Non-user RSVPs → Magic link sent → Profile created → Auto-RSVP'd
- [ ] Existing user RSVPs → Instant RSVP
- [ ] Confirmation page shows correct event details
- [ ] .ics file downloads with correct data
- [ ] Attendee list updates in real-time
- [ ] Host can see their event in listing
- [ ] `/pledgers` excludes event-only users (`has_pledged: false`)

---

## Success Metrics (Post-Launch)

| Metric | Target | Why |
|--------|--------|-----|
| RSVP → Signup conversion | >80% | Do people complete magic link? |
| Event attendee show-up rate | >60% | Are RSVPs real? |
| Repeat attendance | >30% | Do people come back? |
| Event page views | 5x RSVP count | Are people browsing? |

---

## What We're Copying From Luma

✅ **Take:**
- Event card grid layout
- Simple create form
- Clear RSVP button states
- Attendee avatar display
- Host profile card
- Markdown description rendering

❌ **Skip (for MVP):**
- Cover image upload (use default gradients)
- Ticket pricing (all free)
- Event themes/customization
- Host subscription
- Social sharing buttons
- Waitlist UI (unlimited capacity)
- Filters/search (KISS)
- Zoom integration (offline only)

---

## Related Documents

- [P50: Profile & Pledge Separation](./p50_non_pledger_experience.md) - Required first
- [P58: Story Sifter MVP](./p58_sifter_mvp.md) - Future integration (post-event reflections)

---

## Open Questions for Phase 1

None - proceed with Luma reverse engineering.

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Two-phase approach** | Prototype first = faster iteration, avoid wasted backend work |
| **Luma as reference** | Proven UX, saves design time, users already familiar |
| **Magic link for RSVP** | Same auth as pledge = zero cognitive load |
| **Offline only** | KISS - most events are in-person, Zoom adds complexity |
| **Unlimited capacity** | KISS - waitlist UI not needed yet |
| **Public attendee list** | Social proof drives RSVPs (Luma pattern) |
| **Any user can create** | Community-driven, easier than admin-only |
| **.ics download** | Universal calendar compatibility, no API integrations needed |
