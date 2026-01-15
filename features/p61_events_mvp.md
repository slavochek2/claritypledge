# P61: Events MVP - Reverse Engineering Spec for Claude Code

**Purpose:** Document exactly how Luma works so we can clone the minimum viable UX into claritypledge.com
**Audience:** Claude Code (implementation agent)
**Goal:** Turn social events into Clarity Pledge user acquisition

---

## Jobs-to-be-Done (Why We're Building This)

### For Slava (Event Host)
1. **User acquisition:** Every event RSVP = new authenticated Clarity Pledge user
2. **Community building:** Regular events with real humans while building product
3. **Feature validation:** Workshop attendees test /live and give feedback on roadmap
4. **Authority building:** Public event history ("Slava hosts sensemaking workshops")

### For Event Attendees
1. **Discovery:** Browse upcoming events about clear communication / sensemaking
2. **Easy signup:** RSVP with magic link (same auth as Clarity Pledge - zero friction)
3. **Social proof:** See who else is attending before committing
4. **Post-event value:** (Future) Reflect on event via Stories/Points sifting

---

## Luma Analysis: What We're Reverse Engineering

### Page 1: Event Listing (`luma.com/home`)

**What Luma Does:**
- Grid layout of event cards (2-3 columns on desktop, 1 on mobile)
- Each card shows:
  - Event cover image (colorful gradient or uploaded photo)
  - Event title (H3, bold)
  - Date/time (e.g., "Saturday 10 January, 14:00 - 17:00")
  - Location (e.g., "Weave Artisan Society, Chiang Mai")
  - Host profile pic + name (links to host profile)
  - RSVP count (e.g., "95 Went")
  - Type badge (e.g., "#AI")
- Filter tabs: "Upcoming" / "Past"
- Top-right CTA: "Create Event" button (pink/purple)

**What We Steal:**
- Grid layout (responsive: 3 cols desktop, 2 tablet, 1 mobile)
- Event card structure (title, date, location, host avatar, RSVP count)
- Filter tabs (Upcoming/Past)
- Create Event button (top right)

**What We Skip:**
- Cover image upload (use default gradient based on event type)
- Fancy animations/transitions
- Host "Subscribe" feature
- Hashtag badges (use simpler type badges)

**Implementation Notes:**
- Use existing Clarity Pledge grid components
- Event cards should match pledge card visual style
- Host avatar reuses profile avatar component
- RSVP count format: "12 going" (upcoming) or "12 attended" (past)

---

### Page 2: Create Event Form (`luma.com/create`)

**What Luma Does:**
- Two-column layout:
  - Left: Event image upload + theme picker ("Minimal", "Bold", etc.)
  - Right: Form fields
- Form fields:
  - Event Name (text input)
  - Start Date/Time (datetime picker)
  - End Date/Time (datetime picker)
  - Location (text input with "Add Event Location" placeholder)
  - Description (rich text editor with markdown support)
- Event Options (collapsible sections):
  - Ticket Price (Free / Paid)
  - Require Approval (toggle)
  - Capacity (number input or "Unlimited")
- Bottom: Large "Create Event" button (pink/purple, full width)

**What We Steal:**
- Single-column form (simpler, no image picker for MVP)
- Core fields:
  - Event Name (required)
  - Type (dropdown: Community, Workshop, Experiment)
  - Date & Time (single datetime picker - calculate end time from duration)
  - Duration (dropdown: 1h, 2h, 3h, 4h, All day)
  - Location (text input - physical address OR "Zoom link sent after RSVP")
  - Description (textarea with markdown support)
  - Max Attendees (number input, optional)
  - **NEW FIELD:** "Require Clarity Pledge signup" (checkbox, default ON)
- Bottom: "Create Event" button (blue, matches Clarity Pledge primary CTA)

**What We Skip:**
- Image upload (use auto-generated gradient)
- Theme picker
- Rich text editor (plain textarea with markdown preview)
- Ticket pricing (all events free)
- Approval workflow (auto-approve for MVP)

**Implementation Notes:**
- Form validation: Name, Type, Date, Location required
- Date picker: Must be future date
- Location hint text: "e.g., Golden Gate Park or Zoom (link sent via email)"
- Description supports markdown: headings, lists, links, bold/italic
- "Require Clarity Pledge signup" when ON: Non-users must sign pledge to RSVP

---

### Page 3: Event Detail (`luma.com/htmlk8rst?tk=jdNhN5`)

**What Luma Does:**
- Hero section:
  - Large cover image (full width)
  - Event title (H1, overlay on image)
  - Date/time (prominent)
  - Location with map link
  - Large "Thank You for Joining" banner (if already RSVP'd)
- Host card (sidebar on desktop, below on mobile):
  - "Presented by" label
  - Organization/host avatar + name
  - "Subscribe" button
  - Host bio
  - Social links
  - "Hosted By" individual person (if different from org)
- Main content:
  - RSVP button (state changes based on auth/RSVP status)
  - "About Event" section (markdown-rendered description)
  - Event agenda (if provided)
  - Attendee list: Avatars in grid, "+ X others" if many
- Bottom: Contact host / Report event links

**What We Steal:**
- Simplified hero (no image, just title + date + location)
- RSVP button with clear states:
  - Not logged in: "Sign Up to RSVP"
  - Logged in, not RSVP'd: "RSVP"
  - Logged in, RSVP'd: "You're Registered ✓" (green, disabled)
  - Event full: "Join Waitlist"
- Host card:
  - Avatar (links to /p/slava)
  - Name + role/bio from profile
  - Event count ("Hosting 3 events")
- Description (markdown-rendered)
- Attendee section:
  - "X going" count
  - Grid of avatars (first 20, then "+ 5 more")
  - Each avatar links to attendee profile

**What We Skip:**
- Cover image upload
- Subscribe to host
- Social sharing buttons (can add later)
- Map embed (just show address as text with Google Maps link)
- Contact host form (attendees already have profiles)

**Implementation Notes:**
- RSVP button behavior detailed in Auth Integration section below
- Use existing markdown renderer from pledge `reason` field
- Attendee avatars use same component as pledgers page
- Host card reuses profile card component

---

### Page 4: Post-RSVP Confirmation

**What Luma Does:**
- Full-screen "Thank You for Joining" message
- Event details reminder (date, time, location)
- "Add to Calendar" button (downloads `.ics` file)
- "View Event" link back to event page

**What We Steal:**
- Confirmation message ("You're registered!")
- Event details summary
- "Add to Calendar" button (`.ics` download)
- "Back to Event" link

**What We Skip:**
- Fancy confetti animation
- Social sharing prompts

**Implementation Notes:**
- Show this page after successful RSVP (redirect to `/events/:slug/confirm`)
- `.ics` file generation: Include event title, date, location, description
- Auto-dismiss after 5 seconds → redirect back to event detail

---

## User Journeys (3 Critical Flows)

### Flow 1: Non-User Discovers Event → RSVPs → Becomes User

```
1. User visits claritypledge.com (not logged in)
2. Clicks "Events" in nav
3. Sees grid of events
4. Clicks event card → Event detail page
5. Clicks "Sign Up to RSVP" button
6. Redirected to /sign-pledge?redirect=/events/hiking-feb-15&action=rsvp
7. Enters email, receives magic link
8. Clicks magic link → Profile created in `profiles` table
9. AuthCallbackPage creates profile, redirects to /events/hiking-feb-15
10. Auto-RSVP: Add user ID to `events.attendees[]`
11. Redirect to /events/hiking-feb-15/confirm
12. Show confirmation, offer "Add to Calendar"
```

**Critical:** Step 10 must happen automatically. No second button click needed.

---

### Flow 2: Existing User RSVPs to Event

```
1. User logged in, visits /events
2. Clicks event card → Event detail page
3. Clicks "RSVP" button
4. Add user ID to `events.attendees[]`
5. Redirect to /events/hiking-feb-15/confirm
6. Show confirmation
```

**Critical:** No extra auth step. Instant RSVP.

---

### Flow 3: Host Creates Event

```
1. User logged in, clicks "Create Event" button (nav or /events page)
2. Redirected to /events/new
3. Fills out form (name, type, date, location, description, max attendees)
4. Clicks "Create Event"
5. Validate form fields
6. Create event in `events` table with host_id = current user ID
7. Generate slug from title (e.g., "Clarity Hike" → "clarity-hike-feb15")
8. Redirect to /events/clarity-hike-feb15
9. Show success message: "Event created! Share this link: [copy button]"
```

**Critical:** Only authenticated users can create events (for MVP, only Slava).

---

## Pages to Build

### 1. `/events` - Event Listing

**Access:** Public (no auth required)

**Implementation:**
- Component: `EventListingPage.tsx`
- Use existing grid layout from pledgers page
- Event cards: Reuse card component style
- Filter tabs: Use `<Tabs>` from shadcn/ui
- Empty state: "No upcoming events. Why not host one?"

---

### 2. `/events/new` - Create Event Form

**Access:** Authenticated users only

**Implementation:**
- Component: `CreateEventPage.tsx`
- Protected route (check `useAuth()`)
- Form library: React Hook Form + Zod validation
- Fields match Luma structure (see above)
- Submit handler:
  1. Validate all fields
  2. Generate slug from title + date
  3. Call `createEvent()` from `api.ts`
  4. Redirect to `/events/:slug`

**Form validation rules:**
```typescript
const eventSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  type: z.enum(['community', 'workshop', 'experiment']),
  datetime: z.date().min(new Date(), "Event must be in the future"),
  duration_hours: z.number().min(1).max(24),
  location: z.string().min(3, "Location required"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  max_attendees: z.number().optional(),
  requires_pledge: z.boolean().default(true)
})
```

---

### 3. `/events/:slug` - Event Detail Page

**Access:** Public (no auth required)

**Implementation:**
- Component: `EventDetailPage.tsx`
- Fetch event by slug: `getEventBySlug(slug)` from `api.ts`
- Fetch host profile: `getProfile(event.host_id)`
- Fetch attendees: `getProfiles(event.attendees)` (batch fetch)
- RSVP button logic:
  ```typescript
  const handleRSVP = async () => {
    if (!user) {
      // Redirect to signup with return URL
      navigate(`/sign-pledge?redirect=/events/${slug}&action=rsvp`)
      return
    }

    // Add user to attendees
    await rsvpToEvent(eventId, user.id)
    navigate(`/events/${slug}/confirm`)
  }
  ```

**RSVP button states:**
- Not logged in: "Sign Up to RSVP" (blue button)
- Logged in, not RSVP'd: "RSVP" (blue button)
- Logged in, RSVP'd: "You're Registered ✓" (green, disabled)
- Event full: "Join Waitlist" (gray button)

---

### 4. `/events/:slug/confirm` - RSVP Confirmation

**Access:** Must be authenticated + RSVP'd

**Implementation:**
- Component: `EventConfirmPage.tsx`
- Check: User is in `event.attendees[]`, else redirect to event detail
- Generate `.ics` file on-demand (button click)
- Auto-redirect to event detail after 5 seconds

---

## Mock Data for Testing

### Event 1: Hiking
```json
{
  "id": "hiking-ggate-feb15",
  "title": "Clarity Hike: Golden Gate Park",
  "type": "community",
  "date": "2025-02-15T10:00:00-08:00",
  "duration_hours": 3,
  "location": "Golden Gate Park, Main Entrance (near Conservatory of Flowers)",
  "description": "Join me for a 5-mile hike where we practice active listening.\n\nWe'll walk, talk about remote work, and I'll demo the /live feature from Clarity Pledge. No pressure, just curious humans.\n\n**What to bring:**\n- Water\n- Snacks\n- Open mind\n\n**Route:** Easy terrain, suitable for all fitness levels.",
  "host_id": "slava",
  "max_attendees": 12,
  "attendees": ["alice", "bob", "carol", "dave", "eve", "frank", "grace"],
  "requires_pledge": true
}
```

### Event 2: Workshop
```json
{
  "id": "active-listening-feb22",
  "title": "Active Listening Workshop",
  "type": "workshop",
  "date": "2025-02-22T18:00:00-08:00",
  "duration_hours": 2,
  "location": "Zoom (link sent after RSVP)",
  "description": "Learn to verify understanding in real-time.\n\nWe'll practice the Clarity Pledge /live feature and give feedback on the product roadmap.\n\n**Agenda:**\n- 6:00-6:15 PM: Intros\n- 6:15-7:00 PM: /live demo + practice in pairs\n- 7:00-7:45 PM: Feedback session\n- 7:45-8:00 PM: Q&A\n\n**Perfect for:** Anyone who struggles with misunderstandings at work.",
  "host_id": "slava",
  "max_attendees": 20,
  "attendees": ["alice", "bob", "carol", "dave", "eve", "frank", "grace", "helen", "ivan", "jane", "karl", "lisa", "mike", "nina"],
  "requires_pledge": true
}
```

### Event 3: Experiment
```json
{
  "id": "sensemaking-ai-mar1",
  "title": "Sensemaking Lab: AI & Jobs",
  "type": "experiment",
  "date": "2025-03-01T19:00:00-08:00",
  "duration_hours": 2,
  "location": "TBD (SF Bay Area)",
  "description": "We'll separate Stories (personal experiences with AI) from Points (debatable claims about AI's impact).\n\nAll thoughts will be sifted using the Clarity Sifter engine.\n\n**Format:**\n- Round 1: Everyone shares a Story (5 min each)\n- Round 2: AI extracts Points from all Stories\n- Round 3: We debate the Points\n- Round 4: Reflection\n\n**This is experimental.** Expect rough edges. Your feedback shapes the product.",
  "host_id": "slava",
  "max_attendees": 8,
  "attendees": ["alice", "bob", "carol"],
  "requires_pledge": true,
  "feature_demo": "story_sifter"
}
```

---

---

## Database Schema

### `events` table

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier

  -- Event details
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('community', 'workshop', 'experiment')),
  description TEXT NOT NULL,

  -- Datetime
  datetime TIMESTAMPTZ NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 2,

  -- Location
  location TEXT NOT NULL,  -- Physical address OR "Zoom link sent via email"

  -- Host
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Capacity
  max_attendees INTEGER,  -- NULL = unlimited
  attendees UUID[] DEFAULT '{}',  -- Array of profile IDs who RSVP'd
  waitlist UUID[] DEFAULT '{}',  -- Array of profile IDs on waitlist (if full)

  -- Settings
  requires_pledge BOOLEAN DEFAULT TRUE,  -- Must sign pledge to RSVP

  -- Future hooks for sensemaking
  feature_demo TEXT CHECK (feature_demo IN ('live_session', 'story_sifter', NULL)),
  live_session_id UUID,  -- FK to live_sessions table (future)
  stories_collected INTEGER DEFAULT 0,
  points_emerged INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled'))
);

-- Index for fast queries
CREATE INDEX idx_events_datetime ON events(datetime);
CREATE INDEX idx_events_host ON events(host_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_slug ON events(slug);
```

### RLS Policies

```sql
-- Anyone can view events
CREATE POLICY "Events are viewable by everyone"
  ON events FOR SELECT
  USING (true);

-- Only authenticated users can create events
CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = host_id);

-- Only host can update their event
CREATE POLICY "Hosts can update their own events"
  ON events FOR UPDATE
  USING (auth.uid() = host_id);

-- Only host can delete their event
CREATE POLICY "Hosts can delete their own events"
  ON events FOR DELETE
  USING (auth.uid() = host_id);
```

---

## API Layer (`src/app/data/api.ts`)

Add these functions to the existing API:

```typescript
// Type definitions
export interface Event {
  id: string
  slug: string
  title: string
  type: 'community' | 'workshop' | 'experiment'
  description: string
  datetime: string  // ISO timestamp
  durationHours: number
  location: string
  hostId: string
  maxAttendees?: number
  attendees: string[]  // Array of profile IDs
  waitlist: string[]
  requiresPledge: boolean
  featureDemo?: 'live_session' | 'story_sifter' | null
  createdAt: string
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled'
}

// Fetch all upcoming events
export async function getUpcomingEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'upcoming')
    .gte('datetime', new Date().toISOString())
    .order('datetime', { ascending: true })

  if (error) throw error
  return data.map(mapEventFromDb)
}

// Fetch past events
export async function getPastEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .lt('datetime', new Date().toISOString())
    .order('datetime', { ascending: false })

  if (error) throw error
  return data.map(mapEventFromDb)
}

// Fetch event by slug
export async function getEventBySlug(slug: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null  // Not found
    throw error
  }

  return mapEventFromDb(data)
}

// Create event
export async function createEvent(event: Omit<Event, 'id' | 'slug' | 'attendees' | 'waitlist' | 'createdAt' | 'status'>) {
  // Generate slug from title + date
  const slug = generateEventSlug(event.title, event.datetime)

  const { data, error } = await supabase
    .from('events')
    .insert({
      slug,
      title: event.title,
      type: event.type,
      description: event.description,
      datetime: event.datetime,
      duration_hours: event.durationHours,
      location: event.location,
      host_id: event.hostId,
      max_attendees: event.maxAttendees,
      requires_pledge: event.requiresPledge,
      feature_demo: event.featureDemo
    })
    .select()
    .single()

  if (error) throw error
  return mapEventFromDb(data)
}

// RSVP to event
export async function rsvpToEvent(eventId: string, userId: string): Promise<void> {
  // Fetch current event
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('attendees, max_attendees, waitlist')
    .eq('id', eventId)
    .single()

  if (fetchError) throw fetchError

  // Check if already RSVP'd
  if (event.attendees.includes(userId)) {
    return  // Already registered
  }

  // Check capacity
  const isFull = event.max_attendees && event.attendees.length >= event.max_attendees

  if (isFull) {
    // Add to waitlist
    const { error } = await supabase
      .from('events')
      .update({ waitlist: [...event.waitlist, userId] })
      .eq('id', eventId)

    if (error) throw error
  } else {
    // Add to attendees
    const { error } = await supabase
      .from('events')
      .update({ attendees: [...event.attendees, userId] })
      .eq('id', eventId)

    if (error) throw error
  }
}

// Cancel RSVP
export async function cancelRSVP(eventId: string, userId: string): Promise<void> {
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('attendees')
    .eq('id', eventId)
    .single()

  if (fetchError) throw fetchError

  const { error } = await supabase
    .from('events')
    .update({ attendees: event.attendees.filter(id => id !== userId) })
    .eq('id', eventId)

  if (error) throw error
}

// Utility: Generate event slug
function generateEventSlug(title: string, datetime: string): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const date = new Date(datetime)
  const dateSlug = date.toISOString().split('T')[0]  // YYYY-MM-DD

  return `${titleSlug}-${dateSlug}`
}

// Utility: Map DB row to Event type
function mapEventFromDb(row: any): Event {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    description: row.description,
    datetime: row.datetime,
    durationHours: row.duration_hours,
    location: row.location,
    hostId: row.host_id,
    maxAttendees: row.max_attendees,
    attendees: row.attendees || [],
    waitlist: row.waitlist || [],
    requiresPledge: row.requires_pledge,
    featureDemo: row.feature_demo,
    createdAt: row.created_at,
    status: row.status
  }
}
```

---

## Auth Integration (Critical)

### RSVP Flow for Non-Users

```
[User clicks RSVP]
  ↓
Check auth status
  ↓ NOT LOGGED IN
Redirect to /sign-pledge?redirect=/events/hiking-ggate-feb15&action=rsvp
  ↓
User signs pledge (magic link)
  ↓
Profile created in `profiles` table
  ↓
Redirect to /events/hiking-ggate-feb15
  ↓
Auto-RSVP (add user to attendees[])
  ↓
Redirect to /events/hiking-ggate-feb15/confirm
```

**Key insight:** Every RSVP = new authenticated user on Clarity Pledge platform

### RSVP Flow for Existing Users

```
[User clicks RSVP]
  ↓
Check auth status
  ↓ LOGGED IN
Add to attendees[]
  ↓
Redirect to /events/hiking-ggate-feb15/confirm
```

---

## What We're Stealing From Luma

✅ **Take:**
- Event card grid layout
- Simple create form
- RSVP button UX (clear states)
- Attendee avatars display
- Host profile card

❌ **Skip (for MVP):**
- Ticket pricing
- Event themes/customization
- Host subscription
- Social sharing buttons
- Email notifications (use Mailchimp separately for now)
- Calendar sync (just offer .ics download)
- Event approval workflow

---

## Design System (Match Clarity Pledge)

**Colors:**
- Primary CTA: `blue-500` (RSVP button, Create Event)
- Event type badges:
  - Community: `gray-100` bg, `gray-700` text
  - Workshop: `blue-50` bg, `blue-700` text
  - Experiment: `purple-50` bg, `purple-700` text
- Host card: Use existing profile card component
- Attendee avatars: Use same avatar component as pledgers

**Typography:**
- Event titles: Same as pledge card titles
- Descriptions: Markdown rendered (same as pledge `reason`)

**Components to reuse:**
- `<Button>` from shadcn/ui
- Profile avatar component
- Navigation (add "Events" link)

---

## Success Metrics (Post-Launch)

1. **Acquisition:** % of event RSVPs who become new Clarity Pledge users
2. **Engagement:** # of event attendees who try /live feature
3. **Retention:** % of event attendees who come to 2nd event
4. **Authority:** Event page views (social proof)

---

## Next Steps

1. ✅ **Create mockup** (static HTML/CSS, no backend)
2. ⏳ Get Slava's approval on UX
3. ⏳ Build backend (Supabase tables, RLS, API)
4. ⏳ Deploy to claritypledge.com/events
5. ⏳ Host first real event

---

---

## Implementation Checklist for Claude Code

### Phase 1: Database Setup
- [ ] Create `events` table in Supabase (run SQL from schema section)
- [ ] Add RLS policies
- [ ] Test: Create mock event via Supabase dashboard

### Phase 2: API Layer
- [ ] Add Event type to `src/app/types/index.ts`
- [ ] Implement all API functions in `src/app/data/api.ts`
- [ ] Test: Call `getUpcomingEvents()` from console

### Phase 3: Event Listing Page
- [ ] Create `src/app/pages/EventsPage.tsx`
- [ ] Add route in `App.tsx`: `<Route path="/events" element={<EventsPage />} />`
- [ ] Implement filter tabs (Upcoming/Past)
- [ ] Create `EventCard.tsx` component
- [ ] Add "Events" link to navigation
- [ ] Test: Visit `/events`, see empty state

### Phase 4: Create Event Form
- [ ] Create `src/app/pages/CreateEventPage.tsx`
- [ ] Add protected route (auth required)
- [ ] Implement form with React Hook Form + Zod
- [ ] Add datetime picker (use shadcn/ui calendar)
- [ ] Test: Create event, see it in listing

### Phase 5: Event Detail Page
- [ ] Create `src/app/pages/EventDetailPage.tsx`
- [ ] Fetch event by slug
- [ ] Implement RSVP button with all states
- [ ] Add host profile card
- [ ] Display attendee avatars
- [ ] Render markdown description
- [ ] Test: RSVP flow (logged in + logged out)

### Phase 6: RSVP Confirmation
- [ ] Create `src/app/pages/EventConfirmPage.tsx`
- [ ] Generate `.ics` file download
- [ ] Add auto-redirect after 5 seconds
- [ ] Test: Full RSVP → Confirm → Back to event

### Phase 7: Auth Integration
- [ ] Modify `AuthCallbackPage.tsx` to handle `?action=rsvp` param
- [ ] After profile creation, check for pending RSVP
- [ ] Auto-RSVP user to event
- [ ] Test: Non-user RSVPs → Signs pledge → Auto-RSVP'd

### Phase 8: Polish
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add empty states
- [ ] Test on mobile (responsive)
- [ ] Add to navigation (desktop + mobile)

---

## Success Criteria

**MVP is complete when:**
1. ✅ Non-user can RSVP to event → becomes Clarity Pledge user
2. ✅ Existing user can RSVP instantly
3. ✅ Host can create event
4. ✅ Event listing shows upcoming/past events
5. ✅ Event detail shows host, attendees, description
6. ✅ RSVP confirmation generates `.ics` file

**Nice-to-have (post-MVP):**
- Email notifications (Supabase triggers)
- Event editing/cancellation
- Waitlist management UI
- Social sharing buttons
- Event search/filter by type

---

## Questions for Slava (Before Starting Implementation)

1. **Event creation access:** For MVP, only you? Or all verified pledgers?
2. **Email notifications:** Should attendees get email when RSVP'd? (Can use Supabase trigger)
3. **Event images:** Use default gradients based on type, or skip entirely?
4. **Navigation placement:** Where should "Events" link go? (Between "Pledgers" and "About"?)
5. **Post-event features:** Priority? (Stories collected, Points emerged counts)
