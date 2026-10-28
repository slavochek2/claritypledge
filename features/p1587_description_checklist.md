---
status: qa
type: story
rank: 69
workstream: events
created_date: '2026-10-28'
tags: [events, sales-mastermind]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1587: Ticked checklists in event descriptions

## Problem

> "shouldn't we have like check marks that are checked? You own what you sell, check. ... don't we have like elements for that? Because it's just a bullet menu." (founder, 2026-10-27)
> "the line spacing between the items in one list in our checklist should be smaller and ... put the whole thing a bit to the right" (founder, 2026-10-28)

A "this event is for you if" list should read as a ticked checklist. A ticked task list (`- [x]`) rendered as a bullet plus a grey, disabled browser checkbox, which looks like a form to fill in; ✅ lines as paragraphs had paragraph-sized gaps and no indent.

## Appetite

Low blast radius: CSS scoped to `.event-description`, only for lists that contain task checkboxes. Reversible by git revert. Zero open decisions (founder chose the styled checklist on 2026-10-28).

## Solution

A task list in an event description renders with no bullet, a 1rem indent, tight item spacing, and a filled tick in the same blue as the "Reserve a seat" button. Unticked items (`- [ ]`) show an empty blue box.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Browsers without `:has()` | ACCEPT | Fall back to today's bullet plus checkbox |

- Do NOT change the markdown renderer.
- Do NOT make the checkboxes interactive.

## Known limitations

- A task list nested inside a loose task item may sit slightly off vertically. Not a shape event descriptions use.

## Done-When

- [x] A ticked task list shows blue ticks, no bullets, indented, tight spacing (verified at 375 px on TEST; page width unchanged).
- [x] Ordinary bullet lists are unchanged.
- [x] Unit tests cover the rendered shape and the stylesheet rules.
