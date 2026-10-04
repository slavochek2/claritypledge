---
status: backlog
type: bug
rank: 27
workstream: growth
created_date: '2026-10-04'
tags: [feed, offline, a11y]
disclosure: public
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1408: Home review fixes (featured focus, offline pack)

## Problem

Independent review of P1404–P1407: (1) opening/closing the featured bar swaps the button, so keyboard focus is lost; (2) the offline pack preloads feed and groups but not the new home highlights, so a user who never opened home before going offline sees no events/groups; (3) the scope test's key list omits 'home'.

## Acceptance Criteria

- [ ] The featured toggle is the same button element open and closed (focus stays)
- [ ] The offline pack prefetches homeRead()
- [ ] The scope-v2 key list includes 'home'
