---
status: week
type: story
rank: 24
workstream: growth
created_date: '2026-10-04'
tags: [feed, featured-story, polish]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1404: Featured story — the open state does not repeat the author

## Problem

> Founder, 2026-10-04 (annotated screenshot): "to see my face twice on the featured story and then when opening up again. Maybe when opening up the featured thing has to be somehow different."

Open, the featured bar keeps the author photo while the story card below repeats it, and the card sits boxed inside the blue panel (card in card).

## Solution

- Closed: unchanged (author photo, title, video thumbnail with play).
- Open: the bar becomes a slim label row — "Featured story · <title>" and a "Hide" control, no photo; the normal story card follows directly, not inside the tinted panel. The author appears once, in the card.

## Acceptance Criteria

- [ ] Open state shows the author photo exactly once (in the card)
- [ ] Open state is visibly different from closed (slim label row, card not boxed in the blue panel); "Hide" collapses
- [ ] 320 / 375 / desktop: no overflow, closed and open

## Related

- P1397, P1401
