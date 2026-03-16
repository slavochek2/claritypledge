---
status: backlog
type: story
rank: 500.0
tags: [points, stories, profiles, ux]
created_date: 2026-03-16
---

# P533: Short Human-Readable IDs for Points, Stories, Profiles

## Concept

Profiles have slugs (`/p/username`). Points and stories only have UUIDs — no short IDs. Add human-readable short IDs (e.g., `#P42`, `#S17`) so content can be referenced in text, session notes, stories, chat, etc.

Could also support @-mention syntax for profiles (`@username`), points (`#P42`), and stories (`#S17`).

## When to revisit

When users or the founder find themselves needing to reference specific points/stories in text and UUIDs are unwieldy.

## Open questions

- Sequential integers or short hashes?
- Display in UI (badges, links)?
- Auto-linking in story text (@mentions)?
