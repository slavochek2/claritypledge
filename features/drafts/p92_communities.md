---
status: draft
type: story
---
# P92: Communities

**Status:** Deferred (post-H2)
**Created:** 2026-01-23
**Priority:** Low — Future feature after H2 validation

---

## Overview

Communities are ongoing groups (like Meetup groups) that host multiple events over time.

```
Community
├── Feed (ongoing discussions between events)
├── Members
└── Events
    └── Event Feed (scoped to event)
```

---

## Why Deferred

H2 test focuses on single-event verification. Communities add:
- Membership management
- Ongoing feed between events
- Event creation within community
- Cross-event reputation

These are valuable but not required to test H2 hypothesis.

---

## When to Build

After H2 validates:
- Verification visibility changes behavior
- Event-based growth model works

Then communities enable:
- Retention (ongoing relationship between events)
- Organizer tools (manage recurring events)
- Content portability (Stories live in community, not just event)

---

## Open Questions (for later)

1. Can an event exist without a community? (Yes for H2)
2. Can content be shared across communities?
3. Who can create events within a community?
4. How does verification work across community events?

---

## See Also

- P85: Event Verification Flow (current focus)
