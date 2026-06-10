---
status: rejected
type: task
rank: 3
tags:
  - kanban
  - canvas
  - ikigai
flow: quick-feature
created_date: 2026-03-19T00:00:00.000Z
locked_at: '2026-03-21T13:37:37.778Z'
---

# P554: Clarity Canvas Page in Kanban

## Problem

The Clarity Canvas (lean canvas + positive externalities + ikigai scores) lives as a standalone markdown/web artifact with no persistent home in the project tooling. Each version (v2.1 → v3.0 → v4.0) is generated in conversations and saved ad-hoc. No single place to see the latest canvas alongside the feature board.

## Solution

Add a "Canvas" page to the kanban sidebar (alongside Board, Focus, Goals, Content). Renders the latest Clarity Canvas with ikigai scores included. Source: a markdown file in `docs/` (e.g. `docs/clarity-canvas.md`).

## Requirements

1. New sidebar entry: Canvas (icon TBD — compass or telescope)
2. New `CanvasPage` component in `tools/kanban/src/components/`
3. Reads and renders `docs/clarity-canvas.md` (markdown → HTML)
4. Ikigai "Extended Ikigai" section included in the same file (founder-product fit scores)
5. Mobile-friendly, single-column layout
6. Design inspiration: will be shared later by user

## Open Questions

- What markdown renderer to use in kanban? (kanban is plain React, no existing markdown dep)
- Should the canvas be editable from kanban or read-only?
- How to handle canvas versioning (show version history or just latest)?

## Out of Scope

- Auto-generating canvas from conversations
- Editing canvas from kanban UI (V1 is read-only)
