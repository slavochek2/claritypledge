# P61 Events MVP - Branch Summary

**Branch:** `p61-events-mvp-wt4`
**Date:** 2026-01-16
**Status:** Frontend integration complete, using mock data, blocked on backend + account separation

---

## What We Built

### 1. Landing Page - "Connect in person" Section
- **File:** `src/app/components/landing/upcoming-events-section.tsx` (new)
- **Location:** Between Signature Wall and CTA sections
- **Shows:** 3 upcoming events with date, title, location, attendee count
- **CTA:** "View all events" → `/events`

### 2. Navigation Integration
- **Events in hamburger menu:** Added to `nav-links.ts`
- **"My Events" for logged-in users:** Added to `simple-navigation.tsx` (both desktop dropdown and mobile menu)
- **Footer:** Events link appears in footer nav

### 3. Route Change: `/prototype/events` → `/events`
- **Updated files:**
  - `App.tsx` - route definition
  - `nav-links.ts` - nav link
  - `EventCard.tsx` - card links
  - `EventDetail.tsx` - back link, RSVP redirect
  - `EventsList.tsx` - create event link
  - `CreateEvent.tsx` - navigation
  - `RsvpConfirm.tsx` - redirects

### 4. Standard Navigation on Events Pages
- **Wrapped in `ClarityLandingLayout`** in `App.tsx`
- **Removed:** Sticky prototype headers from all event components
- **Added:** "Back to Events" inline links in EventDetail and CreateEvent

### 5. Prototype Toggle for Testing
- **File:** `EventsList.tsx`
- **UI:** Amber banner at top of events list
- **Shows:** "Prototype Mode: Viewing as **logged-in user** / **visitor**"
- **Toggle button:** Switches between states

---

## How It Works

### Logged-in User View
- Sees "Create Event" button
- Sees "You're Going" badges on RSVP'd events
- Can RSVP to events (mock - navigates to confirm page)
- Sees "My Events" in user menu

### Visitor View
- No "Create Event" button
- No "You're Going" badges
- Sees "Want to host an event? Sign Up to Host" CTA
- RSVP triggers signup flow (mock - goes to `/sign-pledge`)

### Mock Data System
- **File:** `src/app/prototypes/events/mock-data.ts`
- `mockCurrentUser.isLoggedIn` - toggled by UI
- `mockCurrentUser.rsvpdEventIds` - hardcoded RSVP list
- `mockEvents` - 4 upcoming, 2 past events
- `setMockLoggedIn()` - function to toggle state

---

## What's Working

| Feature | Status |
|---------|--------|
| Events section on landing page | ✅ Working |
| Events in nav menu | ✅ Working |
| "My Events" for logged-in users | ✅ Working |
| Standard nav header on events pages | ✅ Working |
| Events list with tabs (Upcoming/Past) | ✅ Working |
| Event detail page | ✅ Working |
| "You're Going" badges | ✅ Working (mock) |
| Create event form | ✅ Working (mock, doesn't persist) |
| RSVP flow | ✅ Working (mock, doesn't persist) |
| Prototype toggle (logged-in/visitor) | ✅ Working |
| Add to calendar (Google, .ics) | ✅ Working |
| Location links to Google Maps | ✅ Working |

---

## What's NOT Working / Limitations

| Issue | Reason |
|-------|--------|
| RSVPs don't persist | Using mock data, no backend |
| Created events disappear on refresh | No backend storage |
| "Sign Up to Host" goes to `/sign-pledge` | Should go to account creation (blocked on account-vs-pledge separation) |
| Can't actually log in/out | Toggle is mock, not connected to real auth |
| Event detail page doesn't respect toggle | Only EventsList has the toggle - navigating to detail resets context |

---

## Files Changed (from main)

```
src/App.tsx                                          # Route + layout wrapper
src/app/components/landing/upcoming-events-section.tsx   # NEW - landing section
src/app/components/layout/nav-links.ts               # Events nav link
src/app/components/layout/simple-navigation.tsx      # My Events menu item
src/app/pages/clarity-pledge-landing.tsx             # Import + render events section
src/app/prototypes/events/index.tsx                  # No change (just routes)
src/app/prototypes/events/mock-data.ts               # Added setMockLoggedIn()
src/app/prototypes/events/components/EventCard.tsx   # isLoggedIn prop, /events links
src/app/prototypes/events/components/EventDetail.tsx # Removed header, back link, /events links
src/app/prototypes/events/components/EventsList.tsx  # Removed header, added toggle, /events links
src/app/prototypes/events/components/CreateEvent.tsx # Removed header, back link, /events links
src/app/prototypes/events/components/RsvpConfirm.tsx # /events links
```

---

## Test URLs

- **Events list:** http://localhost:5400/events
- **Event detail:** http://localhost:5400/events/clarity-hike-golden-gate-2026-01-20
- **Create event:** http://localhost:5400/events/new
- **Landing page (scroll to events):** http://localhost:5400

---

## Open Questions (Blocked)

### 1. Account Creation Without Pledge

**Context:** Events allows RSVP/hosting. Currently account creation = pledge signing.

**Current state:**
- `/sign-pledge` → magic link → creates profile WITH pledge
- `/login` → magic link → existing users only
- No "create account without pledging" flow

**Needed:**
- New `/signup` route
- Profile with `hasPledged: false`
- Pledge becomes optional

**Blocked on:** Separate story for account-vs-pledge separation

---

### 2. Log In vs Create Account UX

**Options:**
| Option | Pros | Cons |
|--------|------|------|
| Two buttons → same `/login` | Matches expectations | Slightly misleading |
| Two buttons → different flows | Clear separation | Needs new flow |
| One "Continue" button | Modern (Google style) | Less familiar |

**Deferred** until account-vs-pledge work.

---

### 3. What Can Non-Pledged Accounts Do?

- [x] RSVP to events
- [x] Host events
- [x] View others' pledges
- [ ] Have public profile? (probably not)
- [ ] Appear in pledgers directory? (no)
- [ ] Collect endorsements? (no - pledge feature)

---

### 4. Branding: Clarity Pledge vs Claritygram

Events becoming main entry point → name may not fit.

**Decision:** Defer. Don't block Events MVP. Renaming is separate project.

---

### 5. "Sign Up to Host" Destination

**Current:** `/sign-pledge` (wrong intent)
**Temporary:** `/login` (workaround)
**Proper:** `/signup` (after account separation)

---

## Next Steps

1. **Merge to main** when ready (frontend complete)
2. **Separate story:** Account-vs-pledge separation
3. **Backend story:** Events + RSVPs tables, API, real auth integration
4. **Then:** Update nav with proper Log In / Create Account
