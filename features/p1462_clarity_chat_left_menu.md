---
status: backlog
type: task
disclosure: public
rank: 1000103
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - navigation
  - layout
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1462: Move the app's top menu into a left sidebar, desktop and mobile

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.

> Founder framing, verbatim (2026-10-12): *"if we can replicate one-to-one all our menus in all pages to the left, including blog, I guess."*

## Intention

If Clarity Chat becomes the home of the app, the top navigation (Home, Letters, Partners,
Groups, My Profile, Tools, Today's event) moves into the chat's left sidebar, on every page,
desktop and mobile, so the chat and the rest of the app feel like one product.

## How the idea was born

2026-10-12. The founder, comparing the prototype with the production header: *"if we move the
top menu to the left, then we should have home, letters, partners, groups, and my profile...
and also tools and today's events. We need to analyze what we have, both mobile and desktop...
if we can replicate one-to-one all our menus in all pages to the left, including blog, I
guess. And should it be blog included or not?"*

## How it relates

- **P1437**: prototype has its own sidebar (channels, DMs, agents) with no app menu.
- **Placeholder P1461**: channel settings and members may live in the same sidebar.
- **Placeholder P1460**: Partners may become Connections.
- Touches every page's layout: the largest visual blast radius of the placeholders.

## Why it matters

Chain: none. It is product coherence, not hypothesis evidence. Ranked last because it changes
how everything looks without testing whether the loop works.

## Deliberately out / trade-offs considered

- Doing it before the chat direction is validated: if the loop fails, the menu move was wasted.
- Blog inside the app shell: open question (blog is public marketing, the app is signed-in).

## Open questions

- Full inventory of current menu items per state (signed in/out, mobile/desktop).
- Blog in or out of the sidebar?
- Does "Today's event" stay a primary button?

## Done-when for promoting out of placeholder

- Clarity Chat is accepted as the main surface (P1437 passes UAT and one follow-up ships).
