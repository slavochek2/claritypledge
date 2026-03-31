---
status: backlog
type: bug
rank: 6
tags:
  - live
  - ux
  - toast
created_date: 2026-03-30T00:00:00.000Z
---

# P613: /live — Position-Change Toast Obstructs Action Buttons

**Severity:** Medium — blocks user interaction during active session
**Found during:** P609 manual UAT

---

## Problem Statement

During an active /live session, when one user takes a position on a point (Agree/Disagree), the partner sees a Sonner toast notification showing the position change. This toast is correct behavior — it's useful feedback.

However, the toast appears at the bottom of the screen where it **overlaps the action area** — covering buttons like "Speak freely", "Explain back what I heard", and the mode switcher. During the 3 seconds the toast is visible, the user cannot interact with these controls.

**Reproduction:**
1. Two users in /live session, story selected with points
2. User A takes a position on a point (clicks Agree/Disagree)
3. User B sees position-change toast at bottom of screen
4. Toast covers "Speak freely" / "Explain back" buttons → user B can't tap them for 3 seconds

**Expected:** Toast should appear in a location that does not obstruct the action area (e.g., top of screen, or above the action drawer).

---

## Root Cause

The position-change toast is rendered via Sonner at `live-mode-view.tsx:456-470`. Sonner's `<Toaster />` is mounted in `clarity-landing-layout.tsx:76` with default bottom positioning. The action buttons (Speak, Explain back, mode switcher) also sit at the bottom of the viewport, creating a z-index / spatial conflict.

---

## Acceptance Criteria

- [ ] Position-change toast does not overlap any interactive element in the live session view
- [ ] Toast remains visible and readable (not hidden behind header or off-screen)
- [ ] No regression to other toast notifications in the app
