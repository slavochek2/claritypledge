---
status: all-done
type: task
rank: 67
workstream: clarity-canvas
created_date: '2026-10-27'
tags: [canvas, sales-mastermind]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
completed_at: 2026-10-27
---

# P1581: Rename two Clarity Canvas boxes

## Problem

> "What I have tested so far is not as powerful as what I have falsified… Hypothesis I have falsified is better… clarity canvas should be precise." (founder, 2026-10-26)

Two founder-fit box titles are imprecise. "Who else wins when I win?" reads as a positive-externality claim that is hard to check. "My biggest challenge" does not say it is the challenge right now. Founder decision (2026-10-26): falsified hypotheses are more powerful than tested ones, and the canvas should be precise.

## Appetite

Low blast radius (two display strings). Reversible by git revert. Zero open decisions: both titles founder-approved.

## Solution

Titles only, tags unchanged (as in P1535 / sixth round R1):
- `canvas:good-at` → "My current biggest challenge"
- `canvas:world-needs` → "Hypotheses I've falsified"

Update the tests that pin the titles. The P1536 box-question table still names the old box; that spec lives on its own branch and is updated there.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Existing points under `canvas:world-needs` no longer fit the new title | ACCEPT | Only the founder's own TEST canvas has them; the founder rewrites that content separately |

- Do NOT change any tag key.
- Do NOT touch box order or layers.

## Done-When

- [x] `CANVAS_BOXES` carries both new titles; tags unchanged.
- [x] Unit and e2e assertions on the titles updated; unit tests pass.
