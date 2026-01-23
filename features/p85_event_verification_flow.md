# P85: Event Verification Flow

**Status:** Planning
**Created:** 2026-01-23
**Priority:** High — Required for H2 test (30-person event)
**Supersedes:** p84_verify_with_author.md (archived), p91_navigation_ia.md (merged)

---

## Goal

Enable the H2 hypothesis test: Run a 30-person event where verification visibility changes behavior. This requires:
1. Public content (Stories/Points visible globally, filterable by event)
2. Partner discovery (find who to verify with)
3. Verification flow (tap → pick partner → /live → rate → log)
4. Stance prompts (capture position changes after understanding)

---

## Event Page Structure

**Single page with tabs:** `/event/:id`

| Tab | Default for | Content |
|-----|-------------|---------|
| **Info** | Non-members | Description, date, location, host, vertical attendee list |
| **Feed** | Members | Horizontal attendee cards (filter) + Stories/Points below |

- Non-logged-in user lands on Info tab
- Member lands on Feed tab
- Both tabs accessible to members

### Attendees in Two Places (Different Functions)

| Location | Layout | Purpose | Tap action |
|----------|--------|---------|------------|
| **Info tab** | Vertical list (below description) | See who's here | Opens profile |
| **Feed tab** | Horizontal cards (at top) | Filter content | Filters Feed to their Stories/Points |

### Verification Flow Entry

Primary path: Feed → tap person's card → see their content → tap "Verify" on Story

---

## Story Cards in Feed

### Display

```
[Story Card]
"My experience with remote work..."
Author: Carol Chen
🎤 3  ← verification count (people who verified this Story)
[Verify]
```

### Verify Button Rules

| Scenario | Button | Reason |
|----------|--------|--------|
| My own Story | Hidden | Can't verify yourself |
| Author in shared event | Visible | Event = trust boundary |
| Author NOT in shared event | Hidden | No verification with strangers |
| Already verified by me | Shows "✓ Verified" | Once per person per Story |

---

## Verification Flow

### Entry Points

| From | Action | Flow |
|------|--------|------|
| **Story card** | Tap "Verify" | Pick partner → /live |
| **Attendee card** | Tap "Verify with [name]" | Pick their Story → /live |
| **My Story** | Tap "Get Verified" | Share link / pick partner to invite |

### Primary Flow (Listener-initiated)

```
1. Feed: See Carol's Story
2. Tap "Verify" on her Story
3. Get session link/QR
4. Share with Carol (in person or via message)
5. Carol clicks link → both enter /live with Story loaded
6. You explain back → Carol rates (0-10)
7. Verification complete (8/10 minimum to count as "verified")
8. Stance prompt (see below)
9. "Verify another?" prompt
```

### Session Link Screen

```
Verify Carol's Story:
"My experience with remote work..."

Share this link with Carol to start:

[Copy link]  [Show QR]

Waiting for Carol to join...
```

- No presence system needed for MVP
- Works for in-person events (show QR) and remote (share link)
- Once Carol clicks link, both enter /live

---

## Multi-Story Sessions

After each verification:

```
✓ Verification complete!

Verify another Story?
  → [Your turn - pick their Story]
  → [Their turn - they pick yours]
  → [End session]
```

- One Story at a time (focus)
- Stay in session (no exit/re-enter friction)
- Clear turn-taking
- Either person can end anytime

---

## Post-Verification Stance Prompt

After verification completes, **both people** see:

```
✓ Verification complete! You rated 9/10.

This Story relates to:

Point: "Remote work increases productivity"
  Your stance: Disagree
  [Update stance?] [Keep]

Point: "Work-life balance matters more than salary"
  Your stance: Strongly Agree
  [Update stance?] [Keep]

[Done]
```

**Why this matters:**
- Captures position change at moment of understanding
- Identifies "strong" Points (positions rarely change)
- Identifies "soft" Points (positions change after hearing Stories)
- Both prompted = symmetric data

---

## Verification Logs

**One record, three views:**

### View 1: From Story Detail

```
Story: "My remote work experience"
Author: Bob

Verified by:
  Carol → 10/10 (Jan 23)
  You → 8/10 (Jan 22)
  Alice → 7/10 (Jan 20)
```

### View 2: From Profile ("Our History")

```
Carol's Profile
...
[View our 3 verification sessions]

Session history:
  • Jan 23: 2 Stories verified
  • Jan 20: 1 Story verified
  • Jan 15: 1 Story verified
```

### View 3: Session Log

```
Session: Jan 23, 2:30pm
Partner: Carol
Duration: 12 min

Stories verified:
  1. Carol's "Remote work..." → You: 10/10
  2. Your "Office culture..." → Carol: 9/10
```

---

## Key Decisions Summary

| Decision | Answer |
|----------|--------|
| Event page structure | **2 tabs: Info / Feed** |
| Info tab attendees | Vertical list, tap → profile |
| Feed tab attendees | Horizontal cards at top, tap → filter Feed |
| Content scope | **Public only** (no event-scoped privacy for H2) |
| Global feed | **Keep** (unfiltered view of all content) |
| Verify button visibility | Hidden if no shared event |
| Re-verification | Once per person per Story |
| Multi-story sessions | Yes, via "Verify another?" prompt |
| Who initiates | Both (listener picks, or speaker invites) |
| Pairing mechanism | **Both:** notification invite (specific person) + QR (open invite) |
| Verification threshold | 8/10 minimum to count as "verified" |
| Stance prompts | Post-verification, both people, all linked Points (no cap) |
| Log structure | Per-session, viewable from Story/Profile/Session |

---

## Out of Scope (Deferred)

- P55 Ideas swipe during /live (too complex for H2)
- Presence system (green dots for online users)
- AI sifter / brain dump (Phase 5)
- Topology visualization (component exists, not integrated)
- Event-only content privacy (public only for H2)
- Communities layer (see P92)

---

## Dependencies

- [ ] Event page with 2 tabs: Info / Feed
- [ ] Attendee list in Info tab (vertical)
- [ ] Attendee filter cards in Feed tab (horizontal)
- [ ] Filter Feed by attendee (tap card → show their content)
- [x] /live session flow (exists in prototype)
- [x] Story cards with verification count (exists)
- [ ] Partner picker component
- [ ] Post-verification stance prompt
- [ ] Session log storage and views
- [ ] Notification invites for verification

---

## Resolved Questions

| Question | Decision |
|----------|----------|
| Verification threshold | **8/10 minimum** to count as "verified" |
| Partner offline | **Share link/QR** — no presence system for MVP |
| Many linked Points | **Show all** — user taps "Keep" quickly, no cap needed |

---

## Acceptance Criteria

1. Event page shows 2 tabs: Info / Feed
2. Non-member sees Info tab by default
3. Member sees Feed tab by default
4. Info tab shows vertical attendee list; tap → opens profile
5. Feed tab shows horizontal attendee cards at top; tap → filters Feed
6. "Verify" button hidden on Stories from non-shared-event authors
7. "Verify" button hidden on own Stories
8. Tapping "Verify" shows link + QR to share
9. Can send notification invite to specific person
10. Selecting partner starts /live with Story loaded
11. After verification, stance prompt shows for all linked Points
12. "Verify another?" prompt enables multi-story sessions
13. Verification logged and viewable from Story, Profile, and Session views
14. Global feed shows all content (unfiltered)

---

---

## Navigation & Information Architecture

*Merged from P91*

### Global Navigation

| Item | Label | Notes |
|------|-------|-------|
| Home | **Events** | Not "My Events", not "Dashboard" |
| Global feed | **Feed** | Keep — shows all content unfiltered |
| Profile | **Profile** | Not "My Profile" |

### Back Buttons

| Context | Label |
|---------|-------|
| From event detail | `← Events` or just `←` |
| From profile | `←` (browser back) |

### Information Architecture

```
Events (home)
├── Event List
│   └── Event Card → tap to open
│
└── Event Detail `/event/:id`
    ├── Info tab (non-member default)
    │   ├── Description, date, location, host
    │   └── Attendee list (vertical)
    │
    └── Feed tab (member default)
        ├── Attendee cards (horizontal, filter)
        └── Stories + Points

Feed (global)
└── All Stories + Points (unfiltered)

Profile `/p/:slug`
└── Verification history, stats, pledger badge
```

### Naming Rules

- ❌ No "Dashboard" anywhere
- ❌ No "My Events" (just "Events")
- ❌ No "My Profile" (just "Profile")
- ✅ Simple, direct labels

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-23 | Merged P91 navigation decisions. Updated tabs to 2 (Info/Feed). Added content scope (public only). Added notification invites. |
| 2026-01-23 | Created from design session. Supersedes p84. |
