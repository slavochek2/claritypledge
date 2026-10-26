---
status: qa
type: bug
rank: 91
workstream: product
created_date: '2026-10-26'
tags: [canvas, mobile, visual]
disclosure: public
pipeline_ran: [create-spec, fix]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1569: Canvas panel at 320px — owner name cut off, story button too small to tap

Promoted from the task inbox, 2026-10-26.

## Problem

The P1535 visual QA noted three problems on the canvas point panel at 320px. Measured on 2026-10-26 with the new e2e check, two of them were not real: the filter tabs and Next are already 44px tall. The real problems were:

1. The owner row above the card cut the owner's name off ("P1508 Canvas O…"). This appeared when P1535 moved the row above the card.
2. The "1 story" button in the position list was 26px tall, under the 40px tap minimum. This is pre-existing and also on the point page.

> "ok go"

## Appetite

Low blast radius: styling only, no data. Reversible by git revert. No founder decisions beyond approving the screenshots.

## Solution

- The canvas owner row lets the name wrap (and the badges wrap under it) instead of truncating. Only the canvas passes `wrapName`; feed and profile lists keep truncation.
- The story toggle button is a 44px tap area around the unchanged pill: vertical padding cancelled by a negative margin, so the row height does not change. Hover is scoped to the button.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| At 320px the "Agrees" badge drops to its own line | ACCEPT | the cost of showing the whole name; founder sees the screenshot |

Do NOT change the filter tabs or the Previous/Next buttons (already 44px).

## Done-When

- [x] At 320px the open panel has no truncated text, no sideways scroll, and every control is at least 40px tall, with the story buttons at 44px. The new e2e test failed on the old code ("P1508 Canvas Owner" clipped; story button 26px) and now passes.
- [x] All 32 canvas e2e tests and 7,383 unit tests pass.
- [x] Codex review: two LOW findings (hover leaking from the row, 44px test threshold), both fixed. Visual QA by a separate reviewer: the badge wrap at 320px is intended; its other findings are disproved by measurement.
