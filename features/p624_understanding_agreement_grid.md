---
status: rejected
type: feature
rank: 0.196
created_date: 2026-04-02T00:00:00.000Z
tags:
  - grid
  - visualization
  - letters
  - live
  - p581-follow-up
superseded_by: p700
---

# P624: Understanding × Agreement Grid Visualization

**Depends on:** P581 (Clarity Letters — provides position + understanding data), /live (provides verified understanding data)
**Related:** P619 (per-story accumulation view), definitions.md > Verification Outcome States

## Problem Statement

After P581 ships, position and understanding data exists per-point across letters and /live sessions. But there's no combined visualization showing where a pair stands on the understanding × agreement axes. The grid (Y=understanding 0-10, X=agreement -3 to +3) becomes meaningful when BOTH letter data (initial guesses) and /live data (verified scores) exist for the same point — showing movement from unverified to verified positions.

P581 shows simpler per-point and per-story comparisons (dual numbers, positions side by side). This spec adds the 2D grid visualization that combines all data sources on a point.

## Solution

SVG-based scatter plot component showing position + understanding per point:
- Y-axis: understanding (0-10)
- X-axis: agreement (-3 to +3)
- Upper quadrants: ✓ Verified agreement/disagreement (post-/live)
- Lower quadrants: ⚠️ Potential false agreement/disagreement (pre-verification, letter only)
- Dots: letter data (dashed), /live data (solid), arrows showing movement
- Lives on point detail page — canonical location for all engagement data
- Shared component: works in letters, /live, and point pages

## Key Decisions (from P581 session)

- Grid triages WHERE gaps exist; stories diagnose WHAT kind (flip/fork/verified) — D38
- No mechanical classification of flip types on grid — behavior encodes distinction — D38
- Quadrant labels: "Potential false agreement/disagreement ⚠️" (bottom) / "Verified agreement/disagreement ✓" (top)
- Blue dots for positions (design system), amber/green for quadrant tint (data viz exception)
- Position without understanding = horizontal line at Y=0? Or excluded? [OPEN — resolve in /ux]
- Understanding without position = vertical line at rated Y level? [OPEN — resolve in /ux]

## Acceptance Criteria

- [ ] SVG scatter plot component, responsive to container width
- [ ] Four labeled quadrants with tint backgrounds (amber bottom, green top)
- [ ] Dots from letter data (source='letter') shown as dashed/hollow
- [ ] Dots from /live data (source='live') shown as solid
- [ ] Arrows from letter dot to /live dot when both exist for same person on same point
- [ ] Hover/tap dot shows: name, understanding score, agreement score, source
- [ ] Component reusable: works on point detail page, inside letters (future), inside /live (future)
- [ ] Mobile: fills width, maintains aspect ratio, tap for tooltip
- [ ] Accessible: aria-label on grid, role="button" on dots

## Test Coverage Strategy

_How to verify this works._
