---
status: done
type: comment
tags: []
rank: 125415.0
created_date: 2026-01-23
---

# P90: Navigation & Information Architecture

## Problem

The prototype has conflicting navigation patterns:
- "My Events" implies ownership, but shows all events
- "Back to Dashboard" appears everywhere but leads to events list
- "Dashboard" promises metrics/control but is just a list
- Feed and Events compete to be "home"
- Feed is global but we said events are the growth engine

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| What is home? | **Events list** | Events are the B2B2C growth engine; users come for an event |
| What to call event list? | **"Events"** | Not "My Events" (implies ownership), not "Dashboard" (implies metrics) |
| Where does Feed live? | **Inside each Event** | Each event is a container with its own feed; no global feed for MVP |
| What does back button say? | **"←"** (no label) or **"← Events"** | Simple, predictable, avoids naming debate |
| Global feed? | **Remove or rename to "Explore"** | Secondary discovery feature, not home |

## Information Architecture

```
Events (home)
├── Event List
│   └── Event Card → tap to open
│
└── Event Detail
    ├── Header (title, date, location, participants)
    └── Tabs
        ├── Feed (default) ← Stories + Points mixed
        ├── Stories
        └── Points
```

## Event Detail Page Structure

```
┌─────────────────────────────┐
│ ← Events                    │
├─────────────────────────────┤
│ Event Title                 │
│ Date · Time · Location      │
│ 8/12 participants           │
│ [Join] [Share]              │  ← Collapsible header
├─────────────────────────────┤
│ Feed │ Stories │ Points     │  ← Tabs
├─────────────────────────────┤
│                             │
│   (content for active tab)  │
│                             │
└─────────────────────────────┘
```

## Changes Required

### Navigation (top nav)

| Current | New |
|---------|-----|
| Feed | Remove (or rename to "Explore" as secondary) |
| My Events | Events |
| My Profile | Profile |

### Back buttons

| Current | New |
|---------|-----|
| "Back to Dashboard" | "←" or "← Events" |
| "Back to Mock Events" | "← Events" |

### Event detail page (port 5300)

- Add tabs: Feed / Stories / Points
- Feed shows Stories with attached Points (like current global feed)
- Move current static info into collapsible header

### Feed page (port 5100)

- **Option A:** Remove entirely (feed lives in events only)
- **Option B:** Rename to "Explore" — discovery of public content across events

## Open Questions

1. **Event types:** Can users create meetings, webinars, workshops? (Yes, "Event" is the generic container)
2. **Whose events show on home?** Events I'm attending + events I'm hosting (not all public events)
3. **Where to discover public events?** Separate "Explore" page? Or filter on Events page?

## Out of Scope

- Global feed cross-event aggregation
- Event creation flow
- Event search/filtering
- Notifications system

## Success Criteria

- [ ] User lands on Events page (home)
- [ ] Tapping event opens detail with Feed tab active
- [ ] No "Dashboard" word anywhere in UI
- [ ] No "My Events" (just "Events")
- [ ] Back navigation is consistent (← or ← Events)
- [ ] Each event contains its own Feed/Stories/Points
