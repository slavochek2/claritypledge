# P77: Dashboard Empty State & Past Events

## Problem

When a user has no upcoming events, the dashboard shows **6 competing CTAs**:

| Location | CTAs | Problem |
|----------|------|---------|
| Quick Actions bar | Browse Events, Host an Event | Fine — canonical location |
| Empty "Participants" card | "See events →" | Redundant |
| Empty "Your Events" card | "Browse events →" + "Host your own →" | Redundant × 2 |
| Discover Events section | Event card + "See all events →" | Confusing when user hasn't joined anything |
| Events List empty state | "Host Event" button | Redundant — header already has it |

Additionally, users who attended **past events** see the same empty state as brand new users — their history is invisible.

## Solution

1. Add **Upcoming/Past tabs** to "Your Events" section
2. Simplify empty states — remove redundant CTAs (quick action buttons suffice)
3. Hide "Discover Events" when user has no upcoming events
4. Remove duplicate "Host Event" button from Events List empty state

## User Stories

**As a new user with no events:**
> I see a clean dashboard with "No upcoming events" and clear quick actions — not 6 competing links.

**As a returning user who attended past events:**
> I can switch to the "Past" tab in "Your Events" to see my history.

## Design

### Dashboard — "Your Events" Section

**With tabs:**
```
Your Events
┌─────────────────────────────────────┐
│ [Upcoming (0)] [Past (2)]           │
├─────────────────────────────────────┤
│                                     │
│  No upcoming events yet             │
│                                     │
└─────────────────────────────────────┘
```

- Tabs show counts: `Upcoming (0)` / `Past (2)`
- Empty state is text-only (no CTA links — buttons at top suffice)
- Past tab shows events user attended or hosted that already happened

### Dashboard — "Participants" Section

**Empty state (no next event):**
```
Participants of Your Next Event
┌─────────────────────────────────────┐
│                                     │
│  Join an event to see participants  │
│                                     │
└─────────────────────────────────────┘
```

- No CTA link (Browse Events button at top is sufficient)

### Dashboard — "Discover Events" Section

- **Hide entirely** when user has no upcoming events
- **Show** when user has upcoming events (gives more options while engaged)

### Events List — Empty State

**Before:**
```
    📅
No upcoming events
Check back later...

[+ Host Event]      ← REMOVE
```

**After:**
```
    📅
No upcoming events
Check back later or host your own!
```

- Remove button, header already has "Host Event"

## Technical Tasks

| # | File | Description |
|---|------|-------------|
| 1 | `events-service.interface.ts` | Add `getUserPastEvents(profileId): Promise<EventWithHost[]>` |
| 2 | `events-service-real.ts` | Implement — same as getUserRegisteredEvents but `datetime < now`, include hosted |
| 3 | `events-service-mock.ts` | Mock implementation |
| 4 | `home-page.tsx` | Fetch past events in dashboard data |
| 5 | `home-page.tsx` | Add Upcoming/Past tabs to "Your Events" section |
| 6 | `home-page.tsx` | Simplify "Participants" empty state (remove CTA link) |
| 7 | `home-page.tsx` | Conditionally hide Discover section when `yourEvents.length === 0` |
| 8 | `EventsList.tsx` | Remove Host Event button from empty state |

## Acceptance Criteria

- [ ] "Your Events" has Upcoming/Past tabs with counts
- [ ] Past tab shows events user attended or hosted that already happened
- [ ] "Participants" empty state shows "Join an event to see participants" (no link)
- [ ] "Your Events" empty state shows "No upcoming events yet" (no links)
- [ ] Discover section hidden when user has no upcoming events
- [ ] Events List empty state has no "Host Event" button (text mentions "host your own")
- [ ] Quick action buttons (Browse Events, Host an Event) remain visible at top

## Edge Cases

| Scenario | Participants | Your Events | Discover |
|----------|-------------|-------------|----------|
| Brand new user | "Join an event..." | Upcoming(0)/Past(0), empty | Hidden |
| Attended past only | "Join an event..." | Upcoming(0)/Past(2), shows past | Hidden |
| Has upcoming event | Shows people | Upcoming(1)/Past(0), shows event | Hidden (or show?) |
| Has upcoming + discover available | Shows people | Shows events | Visible |

## Out of Scope

- Event history page (separate feature)
- "Reconnect with past participants" feature
- Past events on public profile
