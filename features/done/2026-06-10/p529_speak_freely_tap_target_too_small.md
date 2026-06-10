---
title: "Speak freely tap target too small for mobile users"
type: bug
status: done
priority: medium
created_date: 2026-03-16
p_number: P529
tags: []
rank: 1000021.0
completed_at: '2026-03-18'
resolution: "Resolved by P515 (touch target >=44px + clicker feedback + cancel request), shipped 2026-03-18. Duplicate — no separate work."
---

# Speak freely tap target too small for mobile users

## Problem

Users with long nails miss intended buttons and accidentally hit "speak freely" instead. After the accidental tap, it's unclear what mode they're in. P515 partially addressed tap target sizing but may need further work.

Observed during Pair C session (2026-03-14).

## Fix Hint

Verify all /live interactive elements meet the >= 48px touch target minimum. Ensure adequate spacing between adjacent tap targets to prevent mis-taps.

## Acceptance Criteria

- [ ] All interactive elements in /live are >= 48px touch targets
- [ ] Adequate spacing between adjacent buttons prevents accidental taps
- [ ] Current mode/state is clearly visible after any button tap
