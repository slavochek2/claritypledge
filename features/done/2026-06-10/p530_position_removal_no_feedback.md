---
title: "Position removal on click has no visual feedback"
type: bug
status: done
priority: medium
created_date: 2026-03-16
p_number: P530
tags: []
rank: 1000022.0
completed_at: '2026-06-10'
resolution: "Closed per founder 2026-06-10 — already solved."
---

# Position removal on click has no visual feedback

## Problem

Clicking an already-taken position silently removes it. Users don't realize they've un-positioned themselves. No confirmation dialog, no undo option, no visual feedback that the action occurred.

Observed during Pair C session (2026-03-14). Users were confused about their current position state after accidental clicks.

## Fix Hint

Add an undo toast or confirmation step before removing a position. At minimum, provide clear visual feedback that the position was removed.

## Acceptance Criteria

- [ ] Removing a position shows visible feedback (toast, animation, or confirmation)
- [ ] User has a way to undo accidental position removal (undo toast or confirmation dialog)
- [ ] Position state is always clearly visible to the user
