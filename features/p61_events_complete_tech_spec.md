# P61: Events — Complete Implementation Spec

**Status:** Ready for Implementation
**Approach:** TDD with mock-as-specification
**Run with:** `/loop`
**Scope:** Everything needed to go from "disconnected mockup" → "fully working events in production"

---

## One-Sentence Goal

Build a Luma-style events platform where every RSVP creates a Clarity Pledge user with a public profile, turning offline meetups into user acquisition.

---

## Architecture Principle: Mock as Source of Truth

The working mockup defines correct behavior. The real implementation must match it exactly.

### Why This Matters

```
❌ Old approach (risky):
   Mock → Replace piece by piece → Hope nothing breaks
   (mockup stops working during transition)

✅ New approach (safe):
   Mock ──────────────────────────────→ (stays working as fallback)
        ↓
   Real API → Tests pass → Switchover → Delete mock
```

### How It Works

1. **Mock defines the spec** — If mock shows behavior X, real API must produce behavior X
2. **Tests written against mock first** — Capture expected behavior in tests
3. **Same tests run against real API** — Discrepancies = bugs (usually in backend)
4. **Parallel operation** — Feature flag switches between mock/real
5. **Switchover only when ready** — All E2E tests pass with real backend

### When Mock vs Real Disagree

| Situation | Action |
|-----------|--------|
| Real API returns different data shape | Fix real API to match mock shape |
| Real API handles edge case differently | Usually fix real API; if mock was wrong, fix mock first then re-test |
| Real API is slower/has loading states | Add loading states to match real experience (mock may need update) |
| Real API has errors mock doesn't show | Add error states (this is expected — mock doesn't cover network failures) |

### Data Abstraction Layer

Components import from `eventsService` which has two implementations:

```typescript
// src/app/data/events-service.ts
import { mockEventsService } from './events-service-mock';
import { realEventsService } from './events-service-real';

const USE_REAL_API = import.meta.env.VITE_USE_REAL_EVENTS_API === 'true';

export const eventsService = USE_REAL_API ? realEventsService : mockEventsService;
```

Both implementations must satisfy the same interface — components don't know which is active.

---

## Known Blindspots (Mock Doesn't Cover)

Address these during implementation:

| Blindspot | Mock Behavior | Real System Needs |
|-----------|---------------|-------------------|
| **Race conditions** | Instant, synchronous | Atomic DB operations (two people RSVP for last spot) |
| **Data normalization** | `hostName`, `hostSlug` baked into event | `host_id` FK → join to profiles, transform in API |
| **Auth integration** | `mockCurrentUser.id = 'host-1'` | Real auth from `useAuth()` + Supabase session |
| **Slug collisions** | Hardcoded unique slugs | Generate unique slugs, handle conflicts |
| **State transitions** | Direct status mutation | State machine (can't un-cancel an event) |
| **Network errors** | Always succeeds | Loading, error, retry states |
| **Pagination** | Returns all events | Limit results for scale (not MVP, but design for it) |
| **Concurrent edits** | Single user, no conflicts | Last-write-wins or conflict detection |

### Pre-Implementation: Align Mock Data Shape

Before building, verify mock data shape matches planned DB/API response:

```typescript
// Mock has denormalized host data:
interface MockEvent {
  hostId: string;
  hostName: string;      // ← denormalized
  hostSlug: string;      // ← denormalized
  hostAvatarColor: string; // ← denormalized
}

// Real API should return same shape (join + transform):
interface EventWithHost {
  hostId: string;
  hostName: string;      // ← from profiles join
  hostSlug: string;      // ← from profiles join
  hostAvatarColor?: string; // ← from profiles join
}
```

**Decision:** API layer transforms DB data to match mock shape. Components don't change.

---

## Jobs-to-be-Done

### For Event Hosts
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

## Success Criteria (ALL must pass)

| Criteria | Threshold | How to Verify |
|----------|-----------|---------------|
| Unit tests | 100% pass | `npm test` |
| Build | 0 errors | `npm run build` |
| E2E tests | 100% pass | `npm run test:e2e -- --grep events` |
| Design check | 0 violations | `/design-check` on changed files |
| UX score | ≥ 9.0/10 | Playwright MCP + rubric (Phase 6) |
| Full RSVP flow works | Yes | New user → signup → auto-RSVP → confirm |
| Events persist on reload | Yes | Create event, refresh, still there |
| Profile links work | Yes | Click attendee → `/p/:slug` loads |
| Cancel RSVP works | Yes | RSVP'd user can cancel, spot opens |
| Host can edit/cancel | Yes | Host sees controls, changes persist |
| Timezone displays correctly | Yes | Time shows with explicit timezone label |
| Learnings documented | Yes | `docs/events-implementation-learnings.md` exists |

---

## Pre-Implementation Checks

```bash
# 1. Verify P50 is complete (signup without pledge)
grep -r "source=signup" src/auth/AuthCallbackPage.tsx && echo "P50: OK"

# 2. Detect worktree and port
pwd | xargs basename  # claritypledge-N → port 5N00

# 3. Verify dev server
curl -s http://localhost:${PORT} > /dev/null && echo "Server: OK"
```

---

## Design Decisions

### Cancelled Events

**Decision:** Cancelled events are shown to everyone with clear visual indicators.

**Events List (`/events`):**
- Cancelled events appear in the Upcoming tab
- Card shows "Cancelled" badge (red) instead of "You're Going"/"You're Hosting"
- Card has muted styling (opacity + grayscale header)
- Clicking opens event detail page

**Event Detail (`/events/:slug`):**
- Shows full event details (title, description, date, location, attendees)
- Red banner at top: "This event has been cancelled"
- RSVP section hidden (no action available)
- "Add to Calendar" hidden
- Host controls hidden

**Rationale:**
- Users can see event history including cancelled events
- Full details visible for context (who was going, what was planned)
- Simpler than filtering based on user role

**Test coverage (mock data):**
- `evt-7` (maya-workshop-cancelled) — Cancelled by another host, user was registered
- `evt-8` (my-cancelled-event) — Cancelled by user as host

---

## Phase 0: Service Abstraction Layer

**Goal:** Refactor mock to use a service interface, so components can switch between mock/real.

### Task 0.1: Define EventsService interface

**File:** `src/app/data/events-service.interface.ts`

```typescript
import { EventWithHost, EventAttendee } from '@/app/types';

export interface EventsService {
  // Queries
  getUpcomingEvents(): Promise<EventWithHost[]>;
  getPastEvents(): Promise<EventWithHost[]>;
  getEventBySlug(slug: string): Promise<EventWithHost | null>;
  getEventAttendees(eventId: string): Promise<EventAttendee[]>;
  isUserRsvpd(eventId: string, profileId: string): Promise<boolean>;
  isEventFull(event: EventWithHost): boolean;
  getSpotsRemaining(event: EventWithHost): number | null;

  // Mutations
  createEvent(data: CreateEventInput): Promise<EventWithHost | null>;
  updateEvent(eventId: string, data: UpdateEventInput): Promise<boolean>;
  cancelEvent(eventId: string): Promise<boolean>;
  rsvpToEvent(eventId: string, profileId: string): Promise<boolean>;
  cancelRsvp(eventId: string, profileId: string): Promise<boolean>;

  // Current user (for mock toggle; real uses useAuth)
  getCurrentUserId(): string | null;
  isLoggedIn(): boolean;
}

export interface CreateEventInput {
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number;
  timezone: string;
  location: string;
  maxAttendees?: number;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {}
```

### Task 0.2: Create mock service implementation

**File:** `src/app/data/events-service-mock.ts`

Wrap existing `mock-data.ts` functions in the service interface:

```typescript
import { EventsService } from './events-service.interface';
import {
  getUpcomingEvents as mockGetUpcoming,
  getPastEvents as mockGetPast,
  getEventBySlug as mockGetBySlug,
  isUserRsvpd as mockIsRsvpd,
  isEventFull as mockIsFull,
  getSpotsRemaining as mockGetSpots,
  cancelEvent as mockCancelEvent,
  cancelRsvp as mockCancelRsvp,
  mockCurrentUser,
} from '@/app/prototypes/events/mock-data';

export const mockEventsService: EventsService = {
  // Wrap sync functions as async to match real API signature
  async getUpcomingEvents() {
    return mockGetUpcoming();
  },
  async getPastEvents() {
    return mockGetPast();
  },
  async getEventBySlug(slug) {
    return mockGetBySlug(slug) ?? null;
  },
  async getEventAttendees(eventId) {
    const event = mockEvents.find(e => e.id === eventId);
    return event?.attendees ?? [];
  },
  async isUserRsvpd(eventId, _profileId) {
    return mockIsRsvpd(eventId);
  },
  isEventFull: mockIsFull,
  getSpotsRemaining: mockGetSpots,

  async createEvent(data) {
    // Mock: generate slug and add to mockEvents (temporary)
    // Real implementation will persist to DB
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    // For mock, just return success shape
    return { ...data, id: 'new-' + Date.now(), slug, hostId: mockCurrentUser.id, /* ... */ } as any;
  },
  async updateEvent(_eventId, _data) {
    return true; // Mock always succeeds
  },
  async cancelEvent(eventId) {
    return mockCancelEvent(eventId);
  },
  async rsvpToEvent(eventId, _profileId) {
    mockCurrentUser.rsvpdEventIds.push(eventId);
    return true;
  },
  async cancelRsvp(eventId, _profileId) {
    return mockCancelRsvp(eventId);
  },

  getCurrentUserId() {
    return mockCurrentUser.isLoggedIn ? mockCurrentUser.id : null;
  },
  isLoggedIn() {
    return mockCurrentUser.isLoggedIn;
  },
};
```

### Task 0.3: Create service switch

**File:** `src/app/data/events-service.ts`

```typescript
import { mockEventsService } from './events-service-mock';
// import { realEventsService } from './events-service-real'; // Phase 3

const USE_REAL_API = import.meta.env.VITE_USE_REAL_EVENTS_API === 'true';

// For now, only mock is available. Real added in Phase 3.
export const eventsService = USE_REAL_API
  ? mockEventsService // TODO: replace with realEventsService
  : mockEventsService;

// Re-export interface for type checking
export type { EventsService } from './events-service.interface';
```

### Task 0.4: Update one component as proof-of-concept

**File:** `src/app/prototypes/events/components/EventsList.tsx`

Change imports to use service:

```typescript
// Before:
import { getUpcomingEvents, getPastEvents, mockCurrentUser, setMockLoggedIn } from '../mock-data';

// After:
import { eventsService } from '@/app/data/events-service';
import { useEffect, useState } from 'react';

// Usage changes from sync to async:
const [upcomingEvents, setUpcomingEvents] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  eventsService.getUpcomingEvents().then(events => {
    setUpcomingEvents(events);
    setLoading(false);
  });
}, []);
```

### Checkpoint 0
- [ ] `npm run build` succeeds
- [ ] EventsList still works with mock data
- [ ] No behavior changes visible to user
- [ ] Service interface compiles

---

## Phase 1: Database Schema

### Task 1.1: Create events table

**File:** `supabase/migrations/20260118_create_events.sql`

```sql
-- Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,

  -- Details
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- When
  datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120, -- Supports 30-min, 90-min, etc.
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles', -- IANA timezone for display

  -- Where (single field for physical OR virtual)
  -- Examples: "123 Main St, SF" or "Zoom: https://zoom.us/j/123"
  location TEXT NOT NULL,

  -- Who
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Capacity (NULL = unlimited; host is auto-included but doesn't count against cap)
  max_attendees INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_events_datetime ON events(datetime);
CREATE INDEX idx_events_host ON events(host_id);
CREATE INDEX idx_events_slug ON events(slug);

-- RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are viewable by everyone"
  ON events FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own events"
  ON events FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own events"
  ON events FOR DELETE USING (auth.uid() = host_id);
```

### Task 1.2: Create event_rsvps table

```sql
-- Event RSVPs
CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rsvped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, profile_id)
);

CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_profile ON event_rsvps(profile_id);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RSVPs are viewable by everyone"
  ON event_rsvps FOR SELECT USING (true);

CREATE POLICY "Authenticated users can RSVP"
  ON event_rsvps FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can cancel their own RSVP"
  ON event_rsvps FOR DELETE USING (auth.uid() = profile_id);
```

### Checkpoint 1
- [ ] Run migration via Supabase dashboard
- [ ] Verify: `SELECT * FROM events LIMIT 1;` returns empty (no error)
- [ ] Verify: `SELECT * FROM event_rsvps LIMIT 1;` returns empty (no error)

---

## Phase 2: Types & Real API Implementation

### Task 2.1: Add Event types

**File:** `src/app/types/index.ts`

```typescript
// ============= EVENTS (P61) =============

export interface Event {
  id: string;
  slug: string;
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number; // Supports 30, 60, 90, 120, etc.
  timezone: string; // IANA timezone, e.g., "America/Los_Angeles"
  location: string; // Physical address OR virtual link (e.g., "Zoom: https://...")
  hostId: string;
  maxAttendees?: number;
  createdAt: string;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export interface EventWithHost extends Event {
  hostName: string;
  hostSlug: string;
  hostRole?: string;
  hostAvatarColor?: string;
  hostAvatarUrl?: string;
}

export interface EventAttendee {
  profileId: string;
  name: string;
  slug: string;
  avatarColor?: string;
  avatarUrl?: string;
}
```

### Task 2.2: Create real service implementation

**File:** `src/app/data/events-service-real.ts`

Implement the `EventsService` interface using Supabase:

```typescript
import { EventsService, CreateEventInput } from './events-service.interface';
import { supabase } from '@/lib/supabase';
import { EventWithHost, EventAttendee } from '@/app/types';

// Transform DB row to match mock data shape (components expect this)
function mapEventFromDb(row: any): EventWithHost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    datetime: row.datetime,
    durationMinutes: row.duration_minutes,
    timezone: row.timezone,
    location: row.location,
    hostId: row.host_id,
    maxAttendees: row.max_attendees ?? undefined,
    createdAt: row.created_at,
    status: row.status,
    // Joined from profiles
    hostName: row.profiles?.full_name ?? 'Unknown',
    hostSlug: row.profiles?.slug ?? '',
    hostRole: row.profiles?.headline ?? undefined,
    hostAvatarColor: row.profiles?.avatar_color ?? '#3B82F6',
    hostAvatarUrl: row.profiles?.avatar_url ?? undefined,
  };
}

export const realEventsService: EventsService = {
  async getUpcomingEvents() {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles!host_id(full_name, slug, headline, avatar_color, avatar_url)')
      .or(`status.eq.upcoming,status.eq.cancelled`)
      .gte('datetime', now)
      .order('datetime', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming events:', error);
      return [];
    }
    return (data ?? []).map(mapEventFromDb);
  },

  async getPastEvents() {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles!host_id(full_name, slug, headline, avatar_color, avatar_url)')
      .or(`status.eq.completed,and(status.eq.cancelled,datetime.lt.${now})`)
      .order('datetime', { ascending: false });

    if (error) {
      console.error('Error fetching past events:', error);
      return [];
    }
    return (data ?? []).map(mapEventFromDb);
  },

  async getEventBySlug(slug) {
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles!host_id(full_name, slug, headline, avatar_color, avatar_url)')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    return mapEventFromDb(data);
  },

  async getEventAttendees(eventId) {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('profile_id, profiles(full_name, slug, avatar_color, avatar_url)')
      .eq('event_id', eventId);

    if (error) return [];
    return (data ?? []).map((row: any) => ({
      profileId: row.profile_id,
      name: row.profiles?.full_name ?? 'Unknown',
      slug: row.profiles?.slug ?? '',
      avatarColor: row.profiles?.avatar_color,
      avatarUrl: row.profiles?.avatar_url,
    }));
  },

  async isUserRsvpd(eventId, profileId) {
    const { data } = await supabase
      .from('event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', profileId)
      .single();
    return !!data;
  },

  isEventFull(event) {
    // Note: This needs attendee count - may need to fetch separately
    // For now, use a simple check
    return false; // TODO: implement with attendee count
  },

  getSpotsRemaining(event) {
    if (!event.maxAttendees) return null;
    // TODO: fetch attendee count
    return event.maxAttendees;
  },

  async createEvent(data) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return null;

    const slug = await generateUniqueSlug(data.title);

    const { data: newEvent, error } = await supabase
      .from('events')
      .insert({
        slug,
        title: data.title,
        description: data.description,
        datetime: data.datetime,
        duration_minutes: data.durationMinutes,
        timezone: data.timezone,
        location: data.location,
        host_id: user.user.id,
        max_attendees: data.maxAttendees ?? null,
      })
      .select('*, profiles!host_id(full_name, slug, headline, avatar_color)')
      .single();

    if (error) {
      console.error('Error creating event:', error);
      return null;
    }
    return mapEventFromDb(newEvent);
  },

  async updateEvent(eventId, data) {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.datetime !== undefined) updateData.datetime = data.datetime;
    if (data.durationMinutes !== undefined) updateData.duration_minutes = data.durationMinutes;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.maxAttendees !== undefined) updateData.max_attendees = data.maxAttendees;

    const { error } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventId);

    return !error;
  },

  async cancelEvent(eventId) {
    const { error } = await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', eventId);
    return !error;
  },

  async rsvpToEvent(eventId, profileId) {
    // Check capacity first (atomic would be better, but simple for MVP)
    const event = await this.getEventBySlug(eventId); // TODO: getById
    if (event && this.isEventFull(event)) return false;

    const { error } = await supabase
      .from('event_rsvps')
      .insert({ event_id: eventId, profile_id: profileId });

    return !error;
  },

  async cancelRsvp(eventId, profileId) {
    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('profile_id', profileId);
    return !error;
  },

  getCurrentUserId() {
    // Real implementation: this is sync, so can't call supabase here
    // Components should use useAuth() instead
    return null;
  },

  isLoggedIn() {
    // Components should use useAuth() instead
    return false;
  },
};

// Helper: Generate unique slug with collision handling
async function generateUniqueSlug(title: string): Promise<string> {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let slug = baseSlug;
  let attempt = 0;

  while (attempt < 10) {
    const { data } = await supabase
      .from('events')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!data) return slug; // Unique!

    attempt++;
    slug = `${baseSlug}-${Date.now()}`;
  }

  return `${baseSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
```

### Task 2.3: Update service switch to include real implementation

**File:** `src/app/data/events-service.ts`

```typescript
import { mockEventsService } from './events-service-mock';
import { realEventsService } from './events-service-real';

const USE_REAL_API = import.meta.env.VITE_USE_REAL_EVENTS_API === 'true';

export const eventsService = USE_REAL_API ? realEventsService : mockEventsService;

export type { EventsService } from './events-service.interface';
```

### Task 2.4: Unit tests for both implementations

**File:** `src/tests/events-service.test.ts`

Test cases that should pass for BOTH mock and real:
- `getUpcomingEvents` returns array (empty or with events)
- `getUpcomingEvents` returns events with correct shape (all fields present)
- `getEventBySlug` returns null for non-existent slug
- `isEventFull` returns false for event without maxAttendees
- `isEventFull` returns true when attendees >= maxAttendees

```typescript
import { mockEventsService } from '@/app/data/events-service-mock';
// import { realEventsService } from '@/app/data/events-service-real'; // Test separately

describe('EventsService (mock)', () => {
  it('getUpcomingEvents returns array', async () => {
    const events = await mockEventsService.getUpcomingEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it('events have correct shape', async () => {
    const events = await mockEventsService.getUpcomingEvents();
    if (events.length > 0) {
      const event = events[0];
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('slug');
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('hostName'); // Denormalized
      expect(event).toHaveProperty('hostSlug'); // Denormalized
    }
  });

  it('getEventBySlug returns null for non-existent', async () => {
    const event = await mockEventsService.getEventBySlug('non-existent-slug');
    expect(event).toBeNull();
  });
});
```

### Checkpoint 2
- [ ] `npm test -- events-service` passes
- [ ] `npm run build` succeeds
- [ ] Types import correctly: `import { Event, EventWithHost } from '@/app/types'`
- [ ] Mock service still works (no regressions)

---

## Phase 3: Auth Callback Integration

**Critical:** Handle `source=event-rsvp` for auto-RSVP after signup.

### Task 3.1: Update AuthCallbackPage

**File:** `src/auth/AuthCallbackPage.tsx`

Add handling for event RSVP flow:

```typescript
// After profile creation/update, check for event RSVP action
const searchParams = new URLSearchParams(window.location.search);
const redirectPath = searchParams.get('redirect');
const action = searchParams.get('action');

// If this was an event RSVP signup, auto-RSVP
if (action === 'rsvp' && redirectPath?.startsWith('/events/')) {
  const eventSlug = redirectPath.split('/')[2];
  if (eventSlug) {
    const event = await getEventBySlug(eventSlug);
    if (event && profile) {
      const success = await rsvpToEvent(event.id, profile.id);
      if (success) {
        // Redirect to confirmation page
        navigate(`/events/${eventSlug}/confirm`);
        return;
      }
    }
  }
}

// Normal redirect handling
if (redirectPath) {
  navigate(redirectPath);
} else {
  // ... existing redirect logic
}
```

### Task 3.2: Update signup page to pass event context

**File:** `src/app/pages/signup-page.tsx`

Ensure redirect params are preserved in magic link:

```typescript
// Read redirect and action from URL
const searchParams = new URLSearchParams(location.search);
const redirect = searchParams.get('redirect');
const action = searchParams.get('action');

// Pass to magic link
const redirectUrl = `${window.location.origin}/auth/callback?source=signup${redirect ? `&redirect=${redirect}` : ''}${action ? `&action=${action}` : ''}`;
```

### Checkpoint 3
- [ ] Signup with `?redirect=/events/test&action=rsvp` preserves params
- [ ] Auth callback detects `action=rsvp`
- [ ] Auto-RSVP happens after profile creation

---

## Phase 4: Frontend Integration (Use Service Layer)

**Key principle:** Components use `eventsService` from Phase 0. They don't know if it's mock or real.

### Task 4.1: EventsList — Use service layer

**File:** `src/app/prototypes/events/components/EventsList.tsx`

- Import from `eventsService` (already done in Phase 0.4)
- Use `useAuth()` for login state (not mock toggle)
- Keep prototype toggle for now (useful for testing both states)
- Add loading state while fetching
- Add error state for network failures

### Task 4.2: EventDetail — Real data + RSVP

**File:** `src/app/prototypes/events/components/EventDetail.tsx`

- Fetch event by slug via `getEventBySlug()`
- Fetch attendees via `getEventAttendees()`
- Check RSVP status via `isUserRsvpd()`
- RSVP button states:
  - Not logged in → "Create Account to RSVP" → `/signup?redirect=/events/:slug&action=rsvp`
  - Logged in, not RSVP'd → "RSVP" → call `rsvpToEvent()`, then `/events/:slug/confirm`
  - Logged in, RSVP'd → "You're Going ✓" (green badge, not clickable)
  - Past event → "Event Ended" (gray, disabled)
  - Event full → "Event Full" (gray, disabled)
- Post-signup toast: When user returns to event page after signup with `?action=rsvp`, show toast: "Account created! Click RSVP to confirm your spot." and clear the param from URL.
- Host card links to `/p/:hostSlug`
- Attendee avatars link to `/p/:attendeeSlug`

### Task 4.3: EventCard — Profile links

**File:** `src/app/prototypes/events/components/EventCard.tsx`

- Host name links to `/p/:hostSlug`
- Use `Link` from react-router-dom
- Add `data-testid="event-card"` for E2E tests

### Task 4.4: CreateEvent — Persist to DB

**File:** `src/app/prototypes/events/components/CreateEvent.tsx`

- Require auth (redirect to `/signup?redirect=/events/new` if not)
- Call `createEvent()` on submit
- Navigate to `/events/:slug` on success
- Show error message on failure

### Task 4.5: RsvpConfirm — Real data

**File:** `src/app/prototypes/events/components/RsvpConfirm.tsx`

- Fetch event by slug
- Show real event details (title, date, time, location)
- Calendar download uses real event data
- "Back to Event" links to `/events/:slug`

### Task 4.6: Host Controls (Edit/Cancel Event)

**File:** `src/app/prototypes/events/components/EventDetail.tsx`

When `auth.uid() === event.hostId`, show host controls section:

```tsx
{/* Host Controls - only visible to event host */}
{isHost && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
    <h3 className="font-semibold text-blue-900 mb-3">Host Controls</h3>
    <div className="flex gap-3">
      <Button variant="outline" onClick={() => navigate(`/events/${slug}/edit`)}>
        Edit Event
      </Button>
      <Button
        variant="outline"
        className="text-red-600 border-red-200 hover:bg-red-50"
        onClick={handleCancelEvent}
      >
        Cancel Event
      </Button>
    </div>
  </div>
)}
```

**Cancel Event flow:**
1. Show confirmation dialog: "Cancel this event? All attendees will lose their RSVP."
2. On confirm → call `cancelEvent(eventId)`
3. Redirect to `/events` with toast "Event cancelled"

> See [Design Decisions: Cancelled Events](#cancelled-events-kiss) for visibility rules.

### Task 4.7: Edit Event Page

**File:** `src/app/prototypes/events/components/EditEvent.tsx` (NEW)

- Same form as CreateEvent, pre-filled with event data
- Only accessible to host (`auth.uid() === event.hostId`)
- On submit → call `updateEvent(eventId, data)`
- Redirect to `/events/:slug` with toast "Event updated"

### Task 4.8: Cancel RSVP — Always Available

**File:** `src/app/prototypes/events/components/EventDetail.tsx`

Fix existing Cancel RSVP button to work for all RSVP'd users:

```tsx
{/* Current bug: disabled={isLoading || alreadyRsvpd} */}
{/* Fix: disabled={isLoading} only */}
<Button
  variant="ghost"
  size="sm"
  onClick={handleCancelRsvp}
  disabled={isLoading}
  className="text-red-600 hover:text-red-700 hover:bg-red-50"
>
  <X className="w-4 h-4 mr-1" />
  Cancel RSVP
</Button>
```

**Cancel RSVP flow:**
1. Click "Cancel RSVP"
2. Show confirmation: "Cancel your RSVP for this event?"
3. On confirm → call `cancelRsvp(eventId, profileId)`
4. Update UI to show RSVP button again

### Task 4.9: Timezone Display

**File:** `src/app/prototypes/events/components/EventDetail.tsx`

Display time with explicit timezone label using UTC offset format:

```tsx
// Before: "2:00 PM - 4:00 PM"
// After:  "2:00 PM - 4:00 PM (UTC-8 Los Angeles)"

const timezoneLabel = getTimezoneLabel(event.timezone); // "UTC-8 Los Angeles", "UTC+7 Bangkok", etc.

<span>{formatTime(eventDate)} - {formatTime(endDate)} ({timezoneLabel})</span>
```

**File:** `src/app/prototypes/events/utils.ts`

Add helper with comprehensive timezone list (24 zones):
```typescript
export function getTimezoneLabel(ianaTimezone: string): string {
  const labels: Record<string, string> = {
    // Americas
    'Pacific/Midway': 'UTC-11 Samoa',
    'Pacific/Honolulu': 'UTC-10 Hawaii',
    'America/Anchorage': 'UTC-9 Alaska',
    'America/Los_Angeles': 'UTC-8 Los Angeles',
    'America/Denver': 'UTC-7 Denver',
    'America/Chicago': 'UTC-6 Chicago',
    'America/New_York': 'UTC-5 New York',
    'America/Halifax': 'UTC-4 Halifax',
    'America/Sao_Paulo': 'UTC-3 São Paulo',
    // Europe & Africa
    'UTC': 'UTC',
    'Europe/London': 'UTC+0 London',
    'Europe/Paris': 'UTC+1 Paris',
    'Europe/Helsinki': 'UTC+2 Helsinki',
    'Europe/Moscow': 'UTC+3 Moscow',
    // Middle East & Asia
    'Asia/Dubai': 'UTC+4 Dubai',
    'Asia/Karachi': 'UTC+5 Karachi',
    'Asia/Kolkata': 'UTC+5:30 Mumbai',
    'Asia/Dhaka': 'UTC+6 Dhaka',
    'Asia/Bangkok': 'UTC+7 Bangkok',
    'Asia/Singapore': 'UTC+8 Singapore',
    'Asia/Shanghai': 'UTC+8 Shanghai',
    'Asia/Tokyo': 'UTC+9 Tokyo',
    // Oceania
    'Australia/Sydney': 'UTC+10 Sydney',
    'Pacific/Auckland': 'UTC+12 Auckland',
  };
  return labels[ianaTimezone] || ianaTimezone;
}
```

### Task 4.10: Landing page events section

**File:** `src/app/components/landing/upcoming-events-section.tsx`

- Fetch from `getUpcomingEvents()`
- Show first 3 events
- Empty state: "No upcoming events" or hide section

### Task 4.11: Use shared constants for timezone and duration

**File:** `src/app/prototypes/events/utils.ts` (single source of truth)

**Already implemented in mock.** Import shared constants in forms:

```tsx
import { DURATIONS, TIMEZONES } from '../utils';

// TIMEZONES: 24 zones from UTC-11 to UTC+12
// DURATIONS: 30min, 1hr, 1.5hr, 2hr, 3hr, 4hr, All day (stored as minutes)

// Default to Bangkok (founder's current location)
const [timezone, setTimezone] = useState('Asia/Bangkok');
const [durationMinutes, setDurationMinutes] = useState(120); // 2 hours
```

**Note:** Both CreateEvent and EditEvent import from `utils.ts` to avoid timezone/duration list inconsistencies.

### Task 4.12: Verify mock fallback still works

**Do NOT delete mock-data.ts yet.** Verify both modes work:

```bash
# Test with mock (default)
npm run dev
# Verify: Events work, no errors

# Test with real API
VITE_USE_REAL_EVENTS_API=true npm run dev
# Verify: Events work with real data
```

### Checkpoint 4
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Events list shows data from database
- [ ] Created events persist after page reload
- [ ] Profile links navigate to `/p/:slug`

---

## Phase 5: E2E Tests

### Task 5.1: Create events E2E test file

**File:** `e2e/events.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Events - Public', () => {
  test('can view events list', async ({ page }) => {
    await page.goto('/events');
    await expect(page.locator('h1')).toContainText(/events/i);
  });

  test('can switch between upcoming and past tabs', async ({ page }) => {
    await page.goto('/events');
    await page.getByRole('tab', { name: /past/i }).click();
    await expect(page.getByRole('tab', { name: /past/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('can view event detail page', async ({ page }) => {
    await page.goto('/events');
    const firstCard = page.locator('[data-testid="event-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await expect(page.getByRole('button', { name: /rsvp/i })).toBeVisible();
    }
  });

  test('RSVP redirects anonymous user to signup', async ({ page }) => {
    await page.goto('/events');
    const firstCard = page.locator('[data-testid="event-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await page.getByRole('button', { name: /create account/i }).click();
      await expect(page).toHaveURL(/\/signup.*redirect.*events.*action=rsvp/);
    }
  });
});

test.describe('Events - Authenticated', () => {
  // These tests require authenticated user
  // Use test helpers from e2e/helpers/test-user.ts

  test.skip('authenticated user can RSVP', async ({ page }) => {
    // TODO: Implement with test user auth
  });

  test.skip('authenticated user can create event', async ({ page }) => {
    // TODO: Implement with test user auth
  });
});
```

### Task 5.2: Add data-testid attributes

Ensure these exist in components:
- `data-testid="event-card"` on EventCard
- `data-testid="rsvp-button"` on RSVP button
- `data-testid="create-event-form"` on create form

### Checkpoint 5
- [ ] `npm run test:e2e -- --grep events` passes (public tests)
- [ ] Skipped tests documented for future auth integration

---

## Phase 6: Verification

### Step 6.1: Design System Check

```bash
/design-check
```

Check files:
- `src/app/prototypes/events/**/*.tsx`
- `src/app/components/landing/upcoming-events-section.tsx`
- `src/auth/AuthCallbackPage.tsx`

**Design system rules (from `docs/design-system.md`):**
| Rule | Check |
|------|-------|
| Blue for actions/CTAs | All buttons use `bg-blue-*` or `text-blue-*` |
| Green for SUCCESS only | Only "You're Going ✓" confirmation uses green |
| No amber/orange/yellow | None in event UI |
| No purple | None in event UI |

**HALT if:** Any violations

### Step 6.2: UX Scoring (Playwright MCP)

| Page | Check | Pass? |
|------|-------|-------|
| `/events` | Grid layout renders | |
| `/events` | Tabs switch correctly | |
| `/events` | Empty state if no events | |
| `/events/:slug` | Event details display | |
| `/events/:slug` | RSVP button has correct state | |
| `/events/:slug` | Attendee list with profile links | |
| `/events/:slug` | Host card with profile link | |
| `/events/:slug` | Calendar download works | |
| `/events/new` | Form validation works | |
| `/events/new` | Submit creates event | |
| `/events/:slug/confirm` | Shows correct event | |
| All pages | Mobile responsive (375px) | |
| All pages | No console errors | |

**Score:** Count passes / 13 total. Minimum 12/13 (92%) = 9.2 score.

**HALT if:** Score < 9.0

### Step 6.3: Flow Testing

Test each user flow via Playwright MCP:

1. **New user RSVP flow:**
   - Visit `/events`
   - Click event → Click "Create Account to RSVP"
   - Verify URL includes `?redirect=/events/:slug&action=rsvp`

2. **Logged-in RSVP flow:** (manual or skip if no test user)
   - RSVP button → Confirmation page → Event shows "You're Going"

3. **Create event flow:** (manual or skip)
   - `/events/new` → Fill form → Submit → Event appears in list

### Step 6.4: Edge Cases

Verify these work:
- [ ] Past event shows "Event Ended" (no RSVP button)
- [ ] Full event shows "Event Full" (RSVP disabled)
- [ ] Non-existent event slug → redirects to `/events`
- [ ] Duplicate event title → slug has timestamp suffix

### Step 6.5: Document Learnings

**File:** `docs/events-implementation-learnings.md`

```markdown
# Events Implementation Learnings

**Date:** YYYY-MM-DD
**Spec:** features/p61_events_complete_tech_spec.md

## What Worked Well
-

## What Was Harder Than Expected
-

## Patterns Discovered
-

## Edge Cases Found
-

## Recommendations for Future Features
-

## Tech Debt / Follow-ups
-
```

---

## Phase 7: Switchover

**Goal:** Switch from mock to real API as default, with rollback capability.

### Switchover Criteria (ALL must pass)

| Criteria | How to Verify |
|----------|---------------|
| All E2E tests pass with real API | `VITE_USE_REAL_EVENTS_API=true npm run test:e2e -- --grep events` |
| All unit tests pass | `npm test` |
| Build succeeds | `npm run build` |
| Manual smoke test passes | Create event → RSVP → Cancel → Reload |
| No console errors | Check browser console during smoke test |
| Data persists correctly | Create event, close browser, reopen → event still there |

### Task 7.1: Enable real API by default

**File:** `.env` (or `.env.local`)

```bash
VITE_USE_REAL_EVENTS_API=true
```

### Task 7.2: Run full test suite with real API

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e -- --grep events

# Manual smoke test
npm run dev
# → Create event
# → RSVP as different user (use incognito)
# → Cancel RSVP
# → Reload page
# → Verify all changes persisted
```

### Task 7.3: Monitor for 24-48 hours

Keep mock available as fallback. If issues arise:

```bash
# Rollback to mock
VITE_USE_REAL_EVENTS_API=false npm run dev
```

### Checkpoint 7 (Switchover Complete)
- [ ] Real API is default
- [ ] No regressions reported
- [ ] Ready to delete mock

---

## Phase 8: Cleanup & Polish

**Only proceed after Phase 7 switchover is stable.**

### Task 8.1: Remove mock implementation

- Delete `src/app/prototypes/events/mock-data.ts`
- Delete `src/app/data/events-service-mock.ts`
- Update `events-service.ts` to only export real service
- Remove `VITE_USE_REAL_EVENTS_API` env var (no longer needed)

### Task 8.2: Remove prototype toggle UI

- Remove "View as Visitor / View as Logged In" toggle from EventsList
- Remove toggle from EventDetail
- Use real auth state everywhere

### Task 8.3: Consider moving from prototypes/

Options:
1. Keep in `prototypes/events/` (simpler, already wired)
2. Move to `src/app/pages/events/` (cleaner long-term)

**Recommendation:** Keep in `prototypes/` for now, move in future cleanup task.

### Task 7.3: Pre-commit checks

```bash
./scripts/pre-commit-checks.sh
```

Must pass before committing.

---

## HALT Conditions

Stop and ask user if:
- [ ] Schema migration fails
- [ ] Tests fail 3+ times on same issue
- [ ] RLS policy blocks expected operations
- [ ] Auth callback changes break existing login flow
- [ ] Design violations seem intentional
- [ ] UX score < 9.0 after 2 fix attempts

---

## Files Changed (Complete List)

```
# NEW (Phase 0: Service Abstraction)
src/app/data/events-service.interface.ts            # Service interface (shared contract)
src/app/data/events-service-mock.ts                 # Mock implementation (wraps mock-data.ts)
src/app/data/events-service-real.ts                 # Real Supabase implementation
src/app/data/events-service.ts                      # Service switch (feature flag)

# NEW (Phase 1: Database)
supabase/migrations/20260118_create_events.sql

# NEW (Phase 2: Types & Tests)
src/tests/events-service.test.ts                    # Tests for both implementations
e2e/events.spec.ts

# NEW (Phase 6: Verification)
docs/events-implementation-learnings.md

# MODIFY
src/app/types/index.ts                              # Add Event types (no type field, incl. timezone)
src/auth/AuthCallbackPage.tsx                       # Handle action=rsvp
src/app/pages/signup-page.tsx                       # Preserve redirect params
src/app/prototypes/events/components/EventsList.tsx # Use eventsService + loading states
src/app/prototypes/events/components/EventDetail.tsx # Use eventsService, host controls, timezone
src/app/prototypes/events/components/EventCard.tsx  # Profile links
src/app/prototypes/events/components/CreateEvent.tsx # Use eventsService
src/app/prototypes/events/components/EditEvent.tsx  # Use eventsService
src/app/prototypes/events/components/RsvpConfirm.tsx # Use eventsService
src/app/prototypes/events/utils.ts                  # Add getTimezoneLabel()
src/app/components/landing/upcoming-events-section.tsx # Use eventsService

# KEEP UNTIL PHASE 8 (mock fallback)
src/app/prototypes/events/mock-data.ts              # Kept as fallback until switchover complete

# DELETE (Phase 8: After Switchover)
src/app/prototypes/events/mock-data.ts              # Only after 24-48h stable
src/app/data/events-service-mock.ts                 # Only after 24-48h stable
```

---

## User Flows (Final State)

### Flow 1: New User RSVPs
```
1. Visit /events
2. Click event card
3. Click "Create Account to RSVP"
4. → /signup?redirect=/events/:slug&action=rsvp
5. Enter name, email
6. Receive magic link
7. Click link → /auth/callback
8. AuthCallback: creates profile
9. → /events/:slug?action=rsvp
10. See toast: "Account created! Click RSVP to confirm your spot."
11. Click RSVP button
12. → /events/:slug/confirm
```

### Flow 2: Logged-in User RSVPs
```
1. Visit /events/:slug
2. Click "RSVP"
3. → /events/:slug/confirm (instant)
```

### Flow 3: Host Creates Event
```
1. Logged in, visit /events
2. Click "Create Event"
3. Fill form, submit
4. → /events/:slug (new event)
5. Event appears in list
```

---

## Post-Completion Checklist

- [ ] All success criteria pass
- [ ] Pre-commit checks pass
- [ ] Learnings documented
- [ ] Ready for commit

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

## Key Decisions

| Question | Decision |
|----------|----------|
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

## Related Documents

- [P50: Profile & Pledge Separation](./done/p50_non_pledger_experience.md) - Required first
