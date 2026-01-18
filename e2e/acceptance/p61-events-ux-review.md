# P61 Events UX Acceptance Script

**For:** `claude --chrome` or manual verification
**Server:** `http://localhost:5400`
**Date:** 2026-01-18

---

## Pre-requisites

1. Dev server running: `npm run dev` (port 5400 for worktree 4)
2. Browser open to localhost

---

## Test 1: Timezone Display

**Goal:** Verify event times show explicit timezone labels

### Steps:
1. Navigate to `http://localhost:5400/events`
2. Click on any event card
3. Look at the date/time line below the title

### Expected:
- Time shows format: `6:00 PM - 8:00 PM (Pacific Time)`
- NOT just `6:00 PM - 8:00 PM`

### Pass criteria:
- [ ] Timezone label visible in parentheses

---

## Test 2: Host Controls Visible (As Host)

**Goal:** Verify host sees Edit/Cancel buttons on their own events

### Steps:
1. Navigate to `http://localhost:5400/events`
2. Click on "Sensemaking Workshop: AI & Communication" (hosted by Slava)
3. Look for blue "Host Controls" section below calendar button

### Expected:
- Blue box with "Host Controls" heading
- "Edit Event" button with pencil icon
- "Cancel Event" button with red text

### Pass criteria:
- [ ] Host Controls section visible
- [ ] Edit Event button present
- [ ] Cancel Event button present (red styling)

---

## Test 3: Host Controls Hidden (As Non-Host)

**Goal:** Verify host controls don't appear on other people's events

### Steps:
1. Navigate to `http://localhost:5400/events`
2. Click on "Clarity Coffee: Casual Meetup" (hosted by Maya Chen)
3. Check the area below "Add to Calendar"

### Expected:
- NO "Host Controls" section
- Description starts immediately after calendar button

### Pass criteria:
- [ ] No Host Controls section visible

---

## Test 4: Cancel RSVP Button Works

**Goal:** Verify RSVP'd users can cancel their registration

### Steps:
1. Navigate to `http://localhost:5400/events/sensemaking-workshop-2026-01-22`
2. Find the green "You're Registered!" box
3. Click "Cancel RSVP" button
4. Confirm the dialog

### Expected:
- Confirmation dialog appears: "Cancel your RSVP for this event?"
- After confirm: Green box disappears, RSVP button reappears

### Pass criteria:
- [ ] Cancel RSVP button is clickable (not disabled)
- [ ] Confirmation dialog appears
- [ ] RSVP status updates after cancel

---

## Test 5: Cancel Event Flow (Host Only)

**Goal:** Verify host can cancel their event

### Steps:
1. Navigate to `http://localhost:5400/events/clarity-hike-golden-gate-2026-01-20`
2. Click "Cancel Event" in Host Controls
3. Confirm the dialog

### Expected:
- Confirmation dialog: "Cancel this event? All attendees will lose their RSVP."
- After confirm: Redirects to `/events`

### Pass criteria:
- [ ] Confirmation dialog appears with warning
- [ ] Redirects to events list after cancel

---

## Test 6: Create Event - Timezone Selector

**Goal:** Verify timezone can be selected when creating events

### Steps:
1. Navigate to `http://localhost:5400/events/new`
2. Find the "Timezone" field (below Time)
3. Click the dropdown

### Expected:
- Dropdown with options:
  - Pacific Time (PT) [default]
  - Mountain Time (MT)
  - Central Time (CT)
  - Eastern Time (ET)
  - UK Time (GMT/BST)
  - Central European (CET)

### Pass criteria:
- [ ] Timezone field present with globe icon
- [ ] 6 timezone options available
- [ ] Pacific Time selected by default

---

## Test 7: Edit Event Link (Host Only)

**Goal:** Verify Edit Event button navigates correctly

### Steps:
1. Navigate to any Slava-hosted event
2. Click "Edit Event" in Host Controls

### Expected:
- Navigates to `/events/{slug}/edit`
- (Page may show 404 since EditEvent component not yet implemented - that's OK for mockup)

### Pass criteria:
- [ ] Edit Event button navigates to edit URL

---

## Summary Checklist

| # | Test | Status |
|---|------|--------|
| 1 | Timezone Display | [ ] |
| 2 | Host Controls Visible | [ ] |
| 3 | Host Controls Hidden | [ ] |
| 4 | Cancel RSVP Works | [ ] |
| 5 | Cancel Event Flow | [ ] |
| 6 | Create Event Timezone | [ ] |
| 7 | Edit Event Link | [ ] |

**All tests passing?** Ready for implementation phase.

---

## Quick Manual Test Commands

```bash
# Open browser to events list
open http://localhost:5400/events

# Direct links for testing
open http://localhost:5400/events/sensemaking-workshop-2026-01-22  # Host event
open http://localhost:5400/events/clarity-coffee-2026-01-18        # Non-host event
open http://localhost:5400/events/new                              # Create form
```
