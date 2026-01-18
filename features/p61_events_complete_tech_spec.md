# P61: Events — Complete Implementation Spec

**Status:** Ready for Implementation
**Approach:** TDD with embedded verification
**Run with:** `/loop`
**Scope:** Everything needed to go from "disconnected mockup" → "fully working events in production"

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
  type TEXT NOT NULL CHECK (type IN ('workshop', 'experiment', 'community')),
  description TEXT NOT NULL,

  -- When
  datetime TIMESTAMPTZ NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 2,

  -- Where
  location TEXT NOT NULL,

  -- Who
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Capacity
  max_attendees INTEGER, -- NULL = unlimited

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
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

## Phase 2: Types & API Layer

### Task 2.1: Add Event types

**File:** `src/app/types/index.ts`

```typescript
// ============= EVENTS (P61) =============

export interface Event {
  id: string;
  slug: string;
  title: string;
  type: 'workshop' | 'experiment' | 'community';
  description: string;
  datetime: string;
  durationHours: number;
  location: string;
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

### Task 2.2: Add API functions

**File:** `src/app/data/api.ts`

Add all functions from the original spec:
- `mapEventFromDb()`
- `getUpcomingEvents()`
- `getPastEvents()`
- `getEventBySlug()`
- `getEventAttendees()`
- `getEventAttendeeCount()`
- `isUserRsvpd()`
- `generateEventSlug()`
- `createEvent()`
- `rsvpToEvent()` — includes capacity check
- `cancelRsvp()`

### Task 2.3: Unit tests for API

**File:** `src/tests/events-api.test.ts`

Test cases:
- `getUpcomingEvents` returns empty on error
- `getUpcomingEvents` maps snake_case to camelCase
- `createEvent` generates correct slug
- `createEvent` retries on slug conflict
- `rsvpToEvent` checks capacity
- `rsvpToEvent` returns false when full

### Checkpoint 2
- [ ] `npm test -- events-api` passes
- [ ] `npm run build` succeeds
- [ ] Types import correctly: `import { Event, EventWithHost } from '@/app/types'`

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

## Phase 4: Frontend Integration

### Task 4.1: EventsList — Real data

**File:** `src/app/prototypes/events/components/EventsList.tsx`

- Remove mock data imports
- Use `getUpcomingEvents()`, `getPastEvents()`
- Use `useAuth()` for login state (not mock toggle)
- Remove amber prototype banner
- Loading state while fetching

### Task 4.2: EventDetail — Real data + RSVP

**File:** `src/app/prototypes/events/components/EventDetail.tsx`

- Fetch event by slug via `getEventBySlug()`
- Fetch attendees via `getEventAttendees()`
- Check RSVP status via `isUserRsvpd()`
- RSVP button states:
  - Not logged in → "Sign Up to RSVP" → `/signup?redirect=/events/:slug&action=rsvp`
  - Logged in, not RSVP'd → "RSVP" → call `rsvpToEvent()`, then `/events/:slug/confirm`
  - Logged in, RSVP'd → "You're Going ✓" (green badge, not clickable)
  - Past event → "Event Ended" (gray, disabled)
  - Event full → "Event Full" (gray, disabled)
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

### Task 4.6: Landing page events section

**File:** `src/app/components/landing/upcoming-events-section.tsx`

- Fetch from `getUpcomingEvents()`
- Show first 3 events
- Empty state: "No upcoming events" or hide section

### Task 4.7: Fix badge colors (all blue)

All event type badges use blue per design system:

```tsx
<span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-1 text-xs font-medium">
  {event.type}
</span>
```

### Task 4.8: Delete mock-data.ts

After all components use real API, delete:
- `src/app/prototypes/events/mock-data.ts`

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
      await page.getByRole('button', { name: /sign up/i }).click();
      await expect(page).toHaveURL(/\/signup.*redirect.*events/);
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

**HALT if:** Any violations (amber colors, green buttons, purple UI)

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
   - Click event → Click "Sign Up to RSVP"
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
**Spec:** bmad/artifacts/p61-events-complete-tech-spec.md

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

## Phase 7: Cleanup & Polish

### Task 7.1: Remove prototype artifacts

- Delete `src/app/prototypes/events/mock-data.ts`
- Remove prototype toggle code
- Remove amber banner CSS

### Task 7.2: Consider moving from prototypes/

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
# NEW
supabase/migrations/20260118_create_events.sql
src/tests/events-api.test.ts
e2e/events.spec.ts
docs/events-implementation-learnings.md

# MODIFY
src/app/types/index.ts                              # Add Event types
src/app/data/api.ts                                 # Add 11 Event functions
src/auth/AuthCallbackPage.tsx                       # Handle action=rsvp
src/app/pages/signup-page.tsx                       # Preserve redirect params
src/app/prototypes/events/components/EventsList.tsx
src/app/prototypes/events/components/EventDetail.tsx
src/app/prototypes/events/components/EventCard.tsx
src/app/prototypes/events/components/CreateEvent.tsx
src/app/prototypes/events/components/RsvpConfirm.tsx
src/app/components/landing/upcoming-events-section.tsx

# DELETE
src/app/prototypes/events/mock-data.ts
```

---

## User Flows (Final State)

### Flow 1: New User RSVPs
```
1. Visit /events
2. Click event card
3. Click "Sign Up to RSVP"
4. → /signup?redirect=/events/:slug&action=rsvp
5. Enter name, email
6. Receive magic link
7. Click link → /auth/callback
8. AuthCallback: creates profile, auto-RSVPs
9. → /events/:slug/confirm
10. See confirmation + calendar download
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
