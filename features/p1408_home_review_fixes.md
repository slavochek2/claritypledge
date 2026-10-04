---
status: qa
type: bug
rank: 27
workstream: growth
created_date: '2026-10-04'
tags: [feed, offline, a11y]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1408: Home review fixes (featured focus, offline pack)

## Problem

Independent review of P1404–P1407: (1) opening/closing the featured bar swaps the button, so keyboard focus is lost; (2) the offline pack preloads feed and groups but not the new home highlights, so a user who never opened home before going offline sees no events/groups; (3) the scope test's key list omits 'home'.

## Acceptance Criteria

- [x] The featured toggle is the same button element open and closed (focus stays)
- [x] The offline pack prefetches homeRead()
- [x] The scope-v2 key list includes 'home'
- [x] Codex review: the rail re-reads on reconnect while showing a saved copy or error; a failing group's events no longer overwrite the saved copy

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Page left open past an event's start keeps showing it as next | ACCEPT | Corrected on the next visit or reconnect; one-evening window |
| Featured/group placeholders are fixed heights; wrapped titles or fewer groups still shift a little | ACCEPT | Small residual shift; real data is 2 groups |
| Tag-row placeholder disappears when there are no tags | ACCEPT | Rare; one row |
