# P85: Event Verification Flow

**Status:** Planning
**Created:** 2026-01-23
**Priority:** High — Required for H2 test (30-person event)
**Supersedes:** p84_verify_with_author.md (archived)

---

## Goal

Enable the H2 hypothesis test: Run a 30-person event where verification visibility changes behavior. This requires:
1. Event-scoped content (Stories/Points visible within event)
2. Partner discovery (find who to verify with)
3. Verification flow (tap → pick partner → /live → rate → log)
4. Stance prompts (capture position changes after understanding)

---

## Event Page Structure

**Single page with tabs:** `/event/:id`

| Tab | Default for | Content |
|-----|-------------|---------|
| **Info** | Non-members | Description, date, location, host |
| **Feed** | Members | Stories + Points scoped to event |
| **Attendees** | — | List with positions, "Verify" buttons |

- Non-logged-in user lands on Info tab
- Member lands on Feed tab
- All tabs accessible to members

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
| Event page structure | Tabs: Info / Feed / Attendees |
| Verify button visibility | Hidden if no shared event |
| Re-verification | Once per person per Story |
| Multi-story sessions | Yes, via "Verify another?" prompt |
| Who initiates | Both (listener picks, or speaker invites) |
| Pairing mechanism | Share link/QR (no presence system) |
| Verification threshold | 8/10 minimum to count as "verified" |
| Stance prompts | Post-verification, both people, all linked Points (no cap) |
| Log structure | Per-session, viewable from Story/Profile/Session |

---

## Out of Scope (Deferred)

- P55 Ideas swipe during /live (too complex for H2)
- Global feed (event IS the feed for MVP)
- Presence system (green dots for online users)
- Async verification requests with notifications
- AI sifter / brain dump (Phase 5)
- Topology visualization (component exists, not integrated)

---

## Dependencies

- [ ] Event page with tabs (new)
- [ ] Event-scoped Stories/Points data model
- [x] /live session flow (exists in prototype)
- [x] Story cards with verification count (exists)
- [ ] Partner picker component
- [ ] Post-verification stance prompt
- [ ] Session log storage and views

---

## Resolved Questions

| Question | Decision |
|----------|----------|
| Verification threshold | **8/10 minimum** to count as "verified" |
| Partner offline | **Share link/QR** — no presence system for MVP |
| Many linked Points | **Show all** — user taps "Keep" quickly, no cap needed |

---

## Acceptance Criteria

1. Event page shows Info/Feed/Attendees tabs
2. Non-member sees Info tab by default
3. Member sees Feed tab by default
4. "Verify" button hidden on Stories from non-shared-event authors
5. "Verify" button hidden on own Stories
6. Tapping "Verify" opens partner picker with shared-event attendees
7. Selecting partner starts /live with Story loaded
8. After verification, stance prompt shows for all linked Points
9. "Verify another?" prompt enables multi-story sessions
10. Verification logged and viewable from Story, Profile, and Session views

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-23 | Created from design session. Supersedes p84. |
