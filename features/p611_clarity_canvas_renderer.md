---
status: today
type: story
rank: 1000030.0
tags:
  - canvas
  - clarity-doc
  - lean-canvas
  - ikigai
  - parallel
created_date: 2026-03-30
---

# P611: Clarity Canvas — File Content + Build Renderer

## Problem Statement

The Clarity Canvas concept (Lean Canvas + 3 missing boxes: disagreement filing, ikigai fit, positive externalities) exists only in conversations and docs. No public artifact exists that people can engage with. The lean canvas content (hypotheses, assumptions, problem statements) hasn't been filed as stories/points in prod, so the protocol can't operate on it. And there's no canvas-view renderer — clarity docs render as linear story lists, not as a structured canvas layout.

**Parallel track:** This work has NO dependency on P581 (Letters). P551 (Clarity Docs) is already shipped. Filing content and building a renderer can happen alongside P581 development. The two tracks converge when the canvas-doc can be sent as a Clarity Letter (P581) for comprehension assessment.

## Solution

Two parallel workstreams:

### A. Content Filing (stories/points in prod)

Map `docs/lean-canvas.md` sections to stories and points:
- Each canvas box (Problem, Solution, Channels, etc.) becomes a story with Slava as author
- Key assumptions within each box become extracted points (challengeable via positions)
- The 3 new boxes (disagreement filing, ikigai fit, positive externalities) get their own stories
- Tag stories by canvas section for the renderer to group them

### B. Canvas Renderer (UI)

Build a canvas-view skin for clarity docs tagged as `canvas`:
- Instead of linear story list, render stories grouped by canvas section in a grid/box layout
- Each box shows its stories + extracted points with position counts
- Visitors can take positions on points directly from the canvas view
- Responsive — works on mobile as stacked sections
- The canvas IS a clarity doc — same data model, different render. No new entities.

## Architecture Notes

- A clarity doc with a `canvas` tag (or doc type) triggers the canvas renderer instead of default list view
- Stories need a `canvas_section` metadata field (or tag convention like `#canvas-problem`, `#canvas-solution`) so the renderer knows which box to place them in
- The 3 new boxes are just sections with no Lean Canvas equivalent — renderer treats all sections equally
- Canvas evolution over time = doc edit history (stories added/removed/updated)

## Acceptance Criteria

- [ ] Lean canvas content filed as stories/points in prod (Slava's account)
- [ ] Each story tagged with its canvas section
- [ ] Canvas-view renderer displays doc content in grid layout (not linear list)
- [ ] Points within each canvas box show position counts and allow position-taking
- [ ] The 3 new boxes (disagreement, ikigai, externalities) render alongside standard Lean Canvas boxes
- [ ] Mobile responsive
- [ ] Public visitors can view the canvas and engage with points

## Test Coverage Strategy

_Visual QA + position-taking smoke test on the canvas view. Verify stories group correctly by section. Verify positions work from canvas context._

## Out of Scope (V1)

- Sending canvas as Clarity Letter (requires P581)
- Multi-user canvas creation (others building their own canvas)
- Canvas versioning/timeline view (show evolution over time)
- Editable canvas from the UI (V1 is Slava-filed via normal story creation)
