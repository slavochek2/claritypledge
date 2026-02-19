---
status: done
type: task
tags: []
rank: 125451.0
created_date: 2026-01-20
completed_at: '2026-02-09'
---

# P77: Dashboard Empty State & Past Events — Acceptance Tests

## Scorecard

| Category | Tests | Status |
|----------|-------|--------|
| 1. Your Events Tabs | 4 | ✅✅✅✅ |
| 2. Past Events Data | 3 | ✅✅✅ |
| 3. Empty States | 3 | ✅✅✅ |
| 4. Discover Section | 2 | ✅✅ |
| 5. Events List | 1 | ✅ |

**Total: 13/13 (100%)**

---

## 1. Your Events Tabs

### UAT-1.1: Tabs render with counts
- **Given:** User is logged in on dashboard
- **When:** Dashboard loads
- **Then:** "Your Events" section shows two tabs: "Upcoming (N)" and "Past (N)" with correct counts
- **Status:** ✅

### UAT-1.2: Upcoming tab is default
- **Given:** User navigates to dashboard
- **When:** Page loads
- **Then:** Upcoming tab is selected by default
- **Status:** ✅

### UAT-1.3: Tab switching works
- **Given:** User is on dashboard with both tabs visible
- **When:** User clicks "Past" tab
- **Then:** Past events are displayed, tab shows selected state
- **Status:** ✅

### UAT-1.4: Tab keyboard accessibility
- **Given:** User focuses on tabs
- **When:** User presses arrow keys
- **Then:** Tab selection moves between Upcoming and Past
- **Status:** ✅

---

## 2. Past Events Data

### UAT-2.1: Past attended events show
- **Given:** User attended events in the past (RSVP'd, event datetime passed)
- **When:** User clicks "Past" tab
- **Then:** Those events appear in the list
- **Status:** ✅

### UAT-2.2: Past hosted events show
- **Given:** User hosted events in the past (event datetime passed)
- **When:** User clicks "Past" tab
- **Then:** Those events appear with hosting indicator
- **Status:** ✅

### UAT-2.3: Past events ordered by date
- **Given:** User has multiple past events
- **When:** User views Past tab
- **Then:** Events are ordered by date (most recent first)
- **Status:** ✅

---

## 3. Empty States

### UAT-3.1: Your Events empty state (no links)
- **Given:** User has no upcoming events
- **When:** Dashboard loads
- **Then:** Empty state shows "No upcoming events yet" with NO CTA links
- **Status:** ✅

### UAT-3.2: Participants empty state (no link)
- **Given:** User has no upcoming events
- **When:** Dashboard loads
- **Then:** Participants section shows "Join an event to see participants" with NO CTA link
- **Status:** ✅

### UAT-3.3: Past tab empty state
- **Given:** User has no past events
- **When:** User clicks "Past" tab
- **Then:** Empty state shows appropriate message (no events attended yet)
- **Status:** ✅

---

## 4. Discover Section

### UAT-4.1: Hidden when no upcoming events
- **Given:** User has 0 upcoming events
- **When:** Dashboard loads
- **Then:** "Discover Events" section is NOT visible
- **Status:** ✅

### UAT-4.2: Visible when has upcoming events
- **Given:** User has 1+ upcoming events AND public events exist
- **When:** Dashboard loads
- **Then:** "Discover Events" section IS visible
- **Status:** ✅

---

## 5. Events List

### UAT-5.1: No Host Event button in empty state
- **Given:** User is on /events page with no upcoming events
- **When:** Page loads showing empty state
- **Then:** Text says "Check back later or host your own!" but NO "Host Event" button (header has it)
- **Status:** ✅
