---
status: all-done
type: story
rank: 68
workstream: events
created_date: '2026-10-28'
tags: [events, sales-mastermind, canvas]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
completed_at: 2026-10-28
---

# P1585: Swipeable images inside an event description

## Problem

> "the person on mobile, he can swap and see different Canvas. That's pretty cool." (founder, 2026-10-27)
> "swipable show could maybe reusse some of code that we have for hikes to swipe photos and videos - typicaly its above the event descirpiotn but here we want it inside" (founder, 2026-10-27)

The Sales Mastermind page shows example Clarity Canvases. Two or more stacked full-width images make the description long, and there is no way to show several images side by side inside the description.

## Appetite

Low blast radius: one CSS rule scoped to `.event-description`, only for paragraphs holding two or more images. Reversible by git revert. Zero open decisions.

## Solution

Images written on one line of the description render in one paragraph. That paragraph becomes a horizontal scroll-snap strip, the same pattern as the hike photo strip. Each slide is at most 20rem wide and at most 88% of the column, so a phone shows a sliver of the next slide and a desktop shows two side by side. Tap still opens the lightbox. Images on separate lines keep today's full-width layout.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A host who already put two images on one line now gets a strip instead of stacked images | ACCEPT | Same images, still all visible; checked 2026-10-28: one live event has description images, none with two in one paragraph |
| Old browsers without `:has()` | ACCEPT | They fall back to today's stacked images |

- Do NOT change the markdown renderer or its image allowlist.
- Do NOT add a component or a marker syntax.

## Known limitations

- Text written on the same line as two images joins the strip as a narrow item. Put images on their own line(s). Fixing it needs a renderer change, a Non-Goal here.

## Done-When

- [x] Two images on one line render in one paragraph that scrolls sideways with snap (verified at 375 px: strip 293 px wide, content 528 px, page width unchanged).
- [x] Images on separate lines are unchanged.
- [x] Desktop (1440 px) shows the slides side by side, not taller than the viewport.
- [x] Unit tests cover the paragraph shape and the stylesheet rule.
