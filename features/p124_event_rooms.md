---
status: today
type: story
workstream: C1
blocked_by:
  - p305
prepped_date: '2026-02-05'
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed-with-notes
decisions:
  - Dropped dedicated Room screen — event page IS the room (simplification)
  - No Supabase Presence — RSVP list + DB status sufficient for in-person events
  - Navigate to /live with returnTo param — no ClarityLivePage refactoring needed
  - Scores private to pair — room shows completion only, not numbers
  - Auto room open at event start time
  - Room closes when event ends
  - Reverses 2026-01-23 "QR/link sufficient" decision based on P123 data (0% join rate)
rank: 9
tags: []
created_date: 2026-02-06
---
# P124: Event Rooms — Tap to Step Aside

## User Story

As an event participant, I want to tap someone on the event page and start a /live verification session, so that I don't need QR codes, links, or codes — everyone at the event is already here.

---

## Problem

Current /live join rate: 15 page views → 5 sessions created → **0 joined** (P123).

The root cause: sharing a link/QR/code to someone standing right next to you is awkward and fragile. The second person never makes it in.

Events solve discovery (you see participants). But there's no bridge from "I see Carol at the event" to "Carol and I are in a /live session."

**Decision reversal:** This reverses the 2026-01-23 decision that "QR/link is sufficient for /live pairing." P123 data proves it isn't — 0% join rate.

**Tests:** H4 (visibility changes group behavior), H3 (social FOMO drives participation).

---

## Core Concept

**The event page IS the room. Pairs step aside into /live.**

```
EVENT PAGE (the room)                  /LIVE SESSION
─────────────────────                  ──────────────
Location, time, RSVP                   You + Carol
Who's here (RSVPs)                     Pick story/point or free live
Active sessions                        Verify
Completed sessions                     Rate
              tap person ──→
              ←── "← Back to event"
```

No separate room screen. The event page gains a "Sessions" section when the event goes live. Tap a person → confirm → both navigate to /live. That's it.

---

## User Flows

### Flow 1: Event page goes live

**Before event start (unchanged):**
- Event page shows info, location, description, participant list, RSVP button
- No session UI. Pure event info.

**At event start time (auto):**
- "Sessions" section appears on the event page below the participant list
- Participant list gains tap-to-select behavior
- Hint text: "Tap someone to start a verification session"

**States:**
- **No sessions yet:** "No sessions yet. Tap someone above to start."
- **Active sessions:** "🔒 Slava + Carol · in session"
- **Completed sessions:** "✓ Slava + Carol · verified"

### Flow 2: Start a session (tap to step aside)

Tap Carol in the participant list →

```
  Start a session with Carol?

  You'll pick a story to verify, or speak freely.
  Carol will see the invitation and can join.

       [Start session]       [Cancel]
```

Tap [Start session] → Sub-room created in DB. You wait on the event page.

**Your view (on event page):**
- Sessions section shows: "You + Carol · waiting for Carol..."
- [Cancel] option available
- Hint: "Tell Carol to check the event page"

**Carol's view (on event page):**
- Sessions section shows: "Slava + You · [Join →]"

**Everyone else:**
- Sessions section shows: "🔒 Slava + Carol · waiting"

**Availability:** People currently in a session are grayed out in the participant list. You can't tap someone who's occupied.

**Race condition:** If two people tap Carol simultaneously, DB partial unique index ensures first wins. Second tapper sees "Carol is already in a session."

### Flow 3: Carol joins → navigate to /live

Carol taps [Join →] → sub-room status updates to `active` → both navigate to `/live?code=SESSION_CODE&returnTo=/events/EVENT_SLUG`.

From here, P128's beginning screen takes over (pick story/point or free live), then the standard /live flow. "← Back to event" replaces "← End session" (via `returnTo` param from P128).

### Flow 4: Session ends → back to event

After verification, both see their results (private to the pair).

Tap [Back to event] → navigate back to event page.

Event page now shows:
- Sessions section: "✓ Slava + Carol · verified" (no numeric score — completion only)
- Both people available again in participant list
- Social proof: everyone sees it happened, which drives the next pair

### Flow 5: Sub-room expiry

If Carol doesn't join within **3 minutes**, the sub-room auto-expires. The initiator can also cancel anytime. Carol's "Join" button disappears. Initiator sees "Session expired" and can tap someone else.

---

## Why Sub-Rooms, Not Notifications

| Invite/notification model | Sub-room model |
|---------------------------|----------------|
| Send notification = interruption | Event page changes = visible |
| "Accept/Decline" = social pressure | "Join when ready" = no pressure |
| What if app backgrounded? | State persists in DB — she'll see it on return |
| Others can't see invites (private) | Others see sessions forming (social proof) |
| Async timing problem | Sync: you're at the same event |

**In-person fallback:** If Carol's phone is in her pocket, you say "Carol, check the event page." The physical context solves notification better than software.

---

## What Changes vs. What Stays

### Keep as-is
- Event page layout (info, location, RSVP, participant list)
- /live session mechanics (stories, explain-back, rating, verification)
- QR code + link sharing (for non-event /live use)

### Add
- Sessions section on event page (when event is live)
- Tap-to-select on participant list (with availability state)
- Sub-room creation (tap → confirm → DB row + session code)
- Sub-room state visible to all event participants (via Postgres Changes)
- Sub-room status update triggers navigation to /live (P128 handles the rest)

### Do NOT build (yet)
- Dedicated room screen (event page IS the room)
- Supabase Presence (RSVP list + DB status is enough for in-person events)
- Persistent rooms per user (rooms exist only during events)
- Notification system (event page visibility replaces notifications)
- AI matching ("talk to X about Y")
- Draft stories from free live sessions (P127)

---

## Room Lifecycle

| Event | Room behavior |
|-------|---------------|
| Before start time | No sessions section. Pure event info. |
| At start time (auto) | Sessions section appears. Participant list becomes tappable. |
| During event | Sessions can be created, joined, completed. |
| At end time | Room closes. Active sessions can finish. No new sessions. |
| After close | Sessions section shows completed results (read-only). |

---

## Technical Approach

### No Supabase Presence needed

At a 5-15 person in-person event, you know who's there — you're standing with them. The RSVP list IS who's here. Supabase Presence adds complexity (mobile backgrounding, heartbeat timeouts, zero codebase experience) for near-zero value.

**What we use instead:**
- **Who's here:** RSVP list from `event_participants` table (already exists)
- **Session state:** `event_sub_rooms` table + Supabase Postgres Changes (proven pattern in codebase)

### /live integration via navigation

No ClarityLivePage refactoring. Sub-room creates a `clarity_session`, both users get the code, both navigate to `/live?code=CODE&returnTo=/events/SLUG`. The `returnTo` param and beginning screen are handled by P128.

### Database

**New table: `event_sub_rooms`**
- `id`, `event_id`, `session_id` (nullable — filled when /live starts), `initiator_id`, `target_id`
- `status`: pending → active → completed | cancelled | expired
- Partial unique index: one active sub-room per target per event (prevents simultaneous-tap race condition)
- Subscribe via Postgres Changes for real-time updates on event page

**No `event_rooms` table needed** — room open/close is determined by event start/end time.

### Auth requirement

Room features require authentication. You can't "tap a person" without a profile. This simplifies implementation (no guest flow in the room context).

---

## Scores Privacy

**In the room (event page):** Completed sessions show "✓ verified" or "done" — no numeric scores. Social proof is "they did it," not "how well."

**In /live (between the pair):** Both participants see their scores, calibration gap, and full results as usual.

**On story pages (later):** The `ClaritySessions` component currently shows `RatingDots` to anyone viewing the story. This is a separate concern — fix when story cards ship, not in P124.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Empty event (0 RSVPs) | Participant list empty. No one to tap. |
| Only you at the event | "No one else has joined yet." |
| All participants in sessions | Everyone grayed out. "Everyone is in a session. Wait for one to finish." |
| Carol's phone in pocket | In-person fallback: "Carol, check the event page." |
| Browser backgrounded | Sub-room state is in DB (not presence). Carol sees the invitation when she returns. |
| Network drops mid-session | Existing /live handles this (polling fallback). Known: departure detection is unreliable (P126). |
| Page refresh | Room state from DB survives refresh. Participant re-enters same state. |
| Late arrival | Sees completed sessions + available participants. Full context on arrival. |
| Tap yourself | Own entry is non-tappable in the participant list. |
| Re-pair with same person | Allowed. You can verify multiple stories with the same person. |

---

## Success Metrics

| Metric | Target | What it tests |
|--------|--------|---------------|
| Session creation rate | >50% of attendees tap someone | Will they initiate? |
| Session join rate | >80% of created sessions get joined | Does the model work? |
| /live completion (from event) | >70% complete verification | Same as /live baseline |
| Second-pair rate | >30% of events have 2+ sessions | Does social proof drive participation? |

---

## Dependencies

- **P128** (prepped): /live beginning screen — story/point picker + returnTo param. P124 navigates into this.
- **P126** (bug): /live departure detection unreliable — affects "back to event" flow
- **P127** (draft): Draft stories from free live — future enhancement for freeform sessions

## Related

- **P123:** Two-Party Join Problem — the problem this solves (0% join rate)
- **P56:** Event as Clarity Container — original event concept (archived)
- **P85:** /live Verification with Cards — the /live flow that sub-rooms connect to
- **Prototype:** `/prototype/linkedin-like/live` — mocked /live beginning screen with story picker

---

## Implementation Tasks

### Layer 1: Database
- [x] Create `event_sub_rooms` migration (table + RLS + indexes + partial unique index)
- [x] Add TypeScript types for EventSubRoom (types/index.ts)

### Layer 2: Service
- [x] Add sub-room methods to events-service.interface.ts
- [x] Implement sub-room CRUD in events-service-real.ts
- [x] Implement sub-room mock in events-service-mock.ts
- [x] Add expiry logic (3-minute timeout for pending sub-rooms)

### Layer 3: UI — Event Page Sessions Section
- [x] Create EventSessions component (sessions list below participants)
- [x] Add tap-to-select behavior on participant list (when event is live)
- [x] Create session confirmation dialog (bottom sheet on mobile)
- [x] Show session states (waiting, active, completed) with real-time updates
- [x] Gray out participants who are in active sessions
- [x] Wire up Supabase Postgres Changes for real-time sub-room state

### Layer 4: /live Integration
- [x] Create sub-room → create clarity_session → navigate to /live with code (returnTo pending P128)
- [ ] Handle "Back to event" navigation via returnTo param (depends on P128)

### Layer 5: Polish
- [x] Accessibility: aria-live for session changes, button labels
- [ ] Mobile touch targets (44x44px) — needs design review
- [x] Edge cases: tap yourself (disabled), all in session message, empty event

---

## Prep Notes

### From UX review
- First-time hint needed: "Tap someone to start a verification session" (not jargon like "step aside")
- Mobile touch targets: 44x44px minimum for participant rows
- Bottom sheet for confirmation dialog (not center modal) on mobile
- Accessibility: participant rows as buttons with "Start session with Carol" labels, aria-live for session state changes
- Design system: use blue "LIVE" badge, not red dot emoji

### From Architect review
- Prototype Supabase Postgres Changes for sub-room state on 3+ phones at an event before full build
- Implementation order: DB migration → sub-room CRUD → event page UI → /live returnTo param → integration testing
- The `returnTo` param approach is dramatically simpler than refactoring ClarityLivePage

### From Alignment review
- Explicitly reverses 2026-01-23 "QR sufficient" decision (P123 data)
- Run /kdd after implementation to capture: decision reversal, sub-room model reasoning, event room validation data
