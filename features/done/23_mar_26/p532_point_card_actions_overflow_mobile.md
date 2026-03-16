---
status: all-done
completed_at: "2026-03-16"
type: bug
rank: 250011.75
workstream: E1
severity: low
date_reported: 2026-03-16
date_resolved: 2026-03-16
created_date: 2026-03-16
root_cause: Footer rows used flex justify-between without flex-wrap causing overflow at narrow widths
resolution: Added flex-wrap and gap-y-1 to both footer row variants
flow: fix
tags: []
---

# BUG: Point card action row overflows on narrow mobile viewports

## Problem

On viewports 327px and below the point card action row overflows the card boundary.

## Resolution

Added flex-wrap gap-y-1 to both footer row containers in point-card-with-links.tsx.
