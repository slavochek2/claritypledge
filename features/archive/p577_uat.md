---
status: backlog
feature: p523
type: uat
created_date: 2026-03-18
tags: []
rank: 1000024.0
---

# UAT: P523 — Point-to-Point References & Standalone Point Creation

## Standalone Point Creation

### UAT-1: Create dropdown on feed
**Given:** Verified user is on /feed
**When:** User clicks the `[+ Create]` button
**Then:** Dropdown opens with two options: "Story" and "Point"
**When:** User clicks "Point"
**Then:** Navigates to /create-point
**Verify:** Dropdown opens, both options visible, Point navigates to /create-point.

### UAT-2: Create dropdown on profile
**Given:** Verified user is on their own profile page
**When:** User clicks the `[Share]` button
**Then:** Dropdown opens with "Share a Story" and "Make a Point"
**When:** User clicks "Make a Point"
**Then:** Navigates to /create-point
**Verify:** Dropdown on profile works identically to feed. Non-own profiles show no dropdown.

### UAT-3: Standalone point creation flow
**Given:** Verified user is on /create-point (no respondTo param)
**When:** User types a statement (e.g. "Remote work reduces pollution")
**Then:** Character counter shows live count (e.g. 32/1000)
**When:** User selects a position (Agree)
**Then:** "Publish Point" button becomes enabled
**When:** User clicks "Publish Point"
**Then:** Button shows spinner + "Publishing...", then navigates to /point/<newId>
**Then:** Point text is visible on the detail page
**Verify:** Create point end-to-end. Check DB: point + position created atomically.

### UAT-4: Character limit enforcement
**Given:** User is on /create-point
**When:** User types 950 characters
**Then:** Counter shows amber (text-amber-600)
**When:** User types 1000 characters
**Then:** Counter shows red (text-red-500), further input is blocked
**Verify:** Type 1001+ chars — input is hard-capped at 1000.

### UAT-5: Publish button disabled without position
**Given:** User has typed a statement but not selected a position
**Then:** "Publish Point" button is disabled
**When:** User selects a position
**Then:** Button becomes enabled
**Verify:** Cannot publish without both statement and position.

## Point Responses

### UAT-6: Respond button on point detail
**Given:** Verified user is on a point detail page
**Then:** "Responses" section visible below "Positions"
**Then:** "Respond" button visible in section header
**When:** User clicks "Respond"
**Then:** Navigates to /create-point?respondTo=<pointId>
**Verify:** Respond button navigates correctly.

### UAT-7: Response creation flow
**Given:** User is on /create-point?respondTo=<pointId>
**Then:** "Responding to" preview shows original point text (truncated, read-only)
**Then:** Search field is hidden (reference locked)
**When:** User types response, selects position, clicks Publish
**Then:** New point created with reference to original
**Then:** Navigates to new point's detail page
**Then:** "Responding to" header visible linking back to original
**Verify:** Create response end-to-end. DB: point + position + point_reference created.

### UAT-8: Response visible on original point
**Given:** A response has been created for a point
**When:** User visits the original point's detail page
**Then:** Response appears in the "Responses" section with point card + PositionButtons
**Verify:** Response card with position buttons visible below Positions section.

### UAT-9: "Responding to" preview on response detail
**Given:** User visits a response point's detail page
**Then:** "Responding to: [pin icon] [truncated text] · [position] ->" shown above statement
**When:** User clicks the link/arrow
**Then:** Navigates to the original point
**Verify:** Responding to preview visible with correct text and working link.

### UAT-10: Response chain navigation
**Given:** Point A, Response B (to A), Response C (to B)
**When:** User visits Point C detail
**Then:** "Responding to" shows Point B text
**When:** User clicks through to Point B
**Then:** "Responding to" shows Point A text, "Responses" shows Point C
**Verify:** Chain A->B->C navigable in both directions.

### UAT-11: Progressive disclosure (3+ responses)
**Given:** A point has 5+ responses
**When:** User visits the point detail page
**Then:** First 3 responses shown chronologically
**Then:** "Show N more" button visible with correct count
**When:** User clicks "Show N more"
**Then:** All remaining responses load
**Verify:** Only 3 shown initially, rest behind "Show N more".

### UAT-12: Empty responses state (0 responses)
**Given:** A point with no responses
**When:** User visits the point detail page
**Then:** "Responses (0)" header visible with "Respond" button
**Then:** No empty list area, no "No responses yet" text
**Verify:** Clean empty state — header + button only.

## Feed & Profile Display

### UAT-13: Response count badge on feed
**Given:** A point with 3 responses appears in the feed
**Then:** Feed card shows response count badge (message icon + "3")
**Given:** A point with 0 responses
**Then:** No badge shown
**Verify:** Badge only appears when count > 0.

### UAT-14: Reply overlay icon (↩) on response cards
**Given:** A response point appears in the feed or profile Points tab
**Then:** Pin icon shows small ↩ (CornerDownLeft) overlay at bottom-right
**Given:** A standalone point (not a response)
**Then:** Pin icon has no overlay — just the pin
**Verify:** Overlay distinguishes responses from standalone points.

### UAT-15: Profile Points tab includes responses
**Given:** User has created both standalone points and response points
**When:** Viewing their profile Points tab
**Then:** Both types appear naturally
**Then:** Response points show ↩ overlay, standalone points do not
**Verify:** No separate tab for responses. Both types in one list.

## Auth & Constraints

### UAT-16: Unverified user blocked from Respond
**Given:** Unverified user is on a point detail page
**When:** User clicks "Respond"
**Then:** Redirected to signup/auth flow
**Verify:** Unverified cannot access /create-point via Respond button.

### UAT-17: Creating response does not affect original point
**Given:** Original point has 3 Agree, 2 Disagree positions
**When:** A user creates a response to it
**Then:** Original point's position counts remain 3 Agree, 2 Disagree (unchanged)
**Then:** No new position is added to the original point
**Verify:** Response creation is isolated from original's data.

### UAT-18: Search and select reference on standalone create
**Given:** User is on /create-point (standalone)
**Then:** "Responding to" area shows search field with placeholder "Search points..."
**When:** User types "climate"
**Then:** Dropdown shows matching points (max 6)
**When:** User selects a point
**Then:** Preview replaces search field, with [x remove] button
**When:** User clicks remove
**Then:** Search field returns
**Verify:** Optional reference via search. Removable. Can publish with or without.

### UAT-19: Original point deleted while writing response
**Given:** User is on /create-point?respondTo=<id>, original gets deleted
**When:** User clicks Publish
**Then:** Error toast: "The original point no longer exists"
**Then:** User can remove reference and publish as standalone
**Verify:** Graceful handling of deleted reference target.

### UAT-20: Network failure during publish
**Given:** User has filled form and clicks Publish
**When:** Network drops mid-request
**Then:** Error toast: "Failed to publish. Please check your connection..."
**Then:** Button re-enables, form state preserved (text + position + reference)
**Verify:** No partial data created. Full form recovery.
