---
status: backlog
type: bug
rank: 26
tags:
  - live
  - ux
created_date: 2026-03-30T00:00:00.000Z
---

# P612: /live — Header "Start a Session" Button Does Nothing When Already on /live

**Severity:** Low — centered button works, but header CTA is dead
**Found during:** P609 manual UAT

---

## Problem Statement

On the `/live` page (both the landing view and session-ended view), clicking the blue "Start a Session" button in the top-right header does nothing. The button is a `<Link to="/live">` — React Router ignores navigation when the target matches the current route.

The centered "New session" / "Start a Clarity Session" button works because it calls `handleCreate()` directly. But users who click the prominent header CTA get no feedback — no navigation, no session creation, nothing.

**Reproduction:**
1. Navigate to `/live`
2. Click "Start a Session" in the header → nothing happens
3. Click "New session" in the center → works

**Expected:** Both buttons should create a new session (or at minimum, the header CTA should scroll to / highlight the centered action area).

---

## Root Cause

Header button is `<Link to="/live">` in `simple-navigation.tsx` (lines 175-183). React Router's `<Link>` does not trigger navigation when `to` matches the current path.

The centered button is a `<Button onClick={handleCreate}>` in `clarity-live-page.tsx` (lines 3475-3482) which calls actual session creation logic.

---

## Acceptance Criteria

- [ ] Clicking "Start a Session" header CTA when already on `/live` either creates a new session or scrolls to the action area
- [ ] No regression to header CTA behavior from other pages (should still navigate to `/live`)
