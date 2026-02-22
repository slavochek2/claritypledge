---
status: done
completed_at: "2026-02-22"
type: story
rank: 1
tags:
  - live
  - events
  - session-start
created_date: 2026-02-20T00:00:00.000Z
delivery_stage: ready
reviews:
  ux: '2026-02-20'
  architect: '2026-02-20'
  tea: null
uat_file: features/uat/p406.md
test_files:
  - e2e/integration/p406-practice-rooms-migration.spec.ts
  - e2e/p406-practice-rooms.spec.ts
  - e2e/p406-smoke.spec.ts
locked_at: '2026-02-21T09:01:56.939Z'
---

# P406: Practice Rooms — Event-Native Session Start

## Problem Statement

**Current state:** Starting a /live session requires one person to share a link or QR code out-of-band — copy/paste, scan, or text. Even at an event where all participants are known and logged in, there is no way to discover or join someone's open session from the event page.

**Pain points:**
- Two people at the same event still need to exchange a link to start a session
- The waiting screen (QR + link) is designed for strangers — not for a room of known participants
- Coaches facilitating group events lose the room fumbling through link-sharing mechanics
- No visibility into who's waiting to practice at any given moment

**Who's affected:**
- Event participants who want to pair up without exchanging links
- Coaches/hosts facilitating group clarity practice at events

---

## Intention (Why This Matters)

**Strategic importance:** Events are the highest-leverage distribution channel for Clarity Pledge. A coach gets 10 people in a room and wants them to pair up for /live sessions. If pairing requires link exchange, the coach loses momentum. If it's one tap from the event page, every session starts immediately.

**Why now:** Event infrastructure is built (participant lists, RSVP, event detail page). The /live page already tracks sessions. The missing piece is surfacing open sessions on the event page so participants can discover and join each other without any out-of-band step.

**Impact if not solved:** Coaches avoid using /live in facilitated settings. Event-to-session conversion stays low. The product's most powerful social proof moment is undermined by logistics.

---

## The Model

A **Practice Rooms** section lives on the event page, below the Participants list. Always visible — no host setup, no event state required.

- **Open a room** → navigates to normal `/live` waiting screen (QR + link unchanged)
- **Others on the event page** see your open room → tap [Join →] → joins the session directly
- **QR and link still work** as fallback for anyone not on the event page
- **Zero changes to `/live`** — this is purely additive

---

## Business Requirements

**Must-haves:**
- Practice Rooms section visible on every event page, below Participants
- Section shows all currently waiting sessions for this event
- Anyone can open a room (navigates to normal /live waiting screen)
- Anyone can join an open room directly from the event page
- In-session rooms (2 people) visible but not joinable
- No host action required — section works from the moment the event exists

**States:**
- No open rooms → empty state + [+ Open a room]
- Someone waiting → their name + [Join →]
- Two people in session → names + locked indicator
- You have an open room → "You · waiting..." + [Leave]

**Success conditions:**
- Two people at the same event can go from intent to active /live session without exchanging anything out-of-band
- QR/link fallback still works for participants not on the event page

**Constraints:**
- Zero changes to /live page
- No push notification infrastructure required
- Must use existing session polling pattern

---

## User Stories

**As an event participant wanting to practice:**
- I want to open a room from the event page, so I can signal I'm ready without sending anyone a link
- I want to see who's waiting to practice, so I can join them in one tap
- I want to use the normal QR/link if my partner isn't on the event page, so I'm never stuck

**As an event participant receiving visibility:**
- I want to see open rooms on the event page, so I know who's available to practice right now
- I want joining to take me directly to the session, so there's no extra navigation

**As a coach/host:**
- I want participants to pair up from the event page without my involvement, so facilitated practice flows without interruption

---

## Jobs to Be Done

**When I'm at an event and want to start a session:**
- I want to signal readiness from the event page, so others can find and join me without needing a link (motivation: remove logistics from social moment)

**When I see someone waiting on the event page:**
- I want to join them in one tap, so the session starts immediately (motivation: zero friction)

**When my partner isn't looking at the event page:**
- I want QR/link to still work, so I'm never blocked (motivation: no dead ends)

---

## Outcomes (Success Metrics)

- Reduce median time from "want to practice" to active session at events (target: <10s when both on event page)
- Increase event-page-to-session conversion rate
- % of event-originated sessions using room join vs link/QR (target: >60% when both parties are on event page)

---

## Acceptance Criteria

- [ ] Practice Rooms section appears on event page below Participants
- [ ] Section visible regardless of event date or host action
- [ ] [+ Open a room] navigates to /live waiting screen with `returnTo=/events/[slug]`
- [ ] Waiting sessions for this event appear with participant name + [Join →]
- [ ] [Join →] navigates directly to /live/[code] join flow
- [ ] In-session rooms (2 people) show as locked — not joinable
- [ ] Section polls and updates without page refresh
- [ ] Empty state shown when no open rooms exist
- [ ] [Leave] removes your open room from the list
- [ ] QR/link on /live waiting screen still works as fallback
- [ ] Zero changes to /live page behaviour

---

## Next Steps

1. ~~Run `/ux features/p406_event-native-session-start.md` — design the Practice Rooms section, all states, mobile + desktop~~ ✓ Done
2. Run `/architect features/p406_event-native-session-start.md` — session-event linking, polling query, DB changes if any
3. Run `/generate-tests` → `/dev`

---

## UX Design

### Layout

Practice Rooms card sits below the Participants card. Same card shell. Always visible.

**Mobile:** single column stack below Participants
**Desktop:** right sidebar below Participants

```
┌──────────────────────┐  ┌──────────────────────┐
│  Event details       │  │  Organizer           │
│  Description         │  ├──────────────────────┤
│  RSVP                │  │  Participants        │
│                      │  ├──────────────────────┤
│                      │  │  Practice Rooms  ← NEW│
└──────────────────────┘  └──────────────────────┘
```

---

### States

**Empty:**
```
┌─────────────────────────────────────────────┐
│ Practice Rooms              [+ Open a room] │
│─────────────────────────────────────────────│
│  No open rooms yet. Be the first!           │
└─────────────────────────────────────────────┘
```

**Rooms exist:**
```
┌─────────────────────────────────────────────┐
│ Practice Rooms              [+ Open a room] │
│─────────────────────────────────────────────│
│ 👤 Alice · waiting...          [Join →]     │
│ 👤 Bob + Carol · in session       🔵        │
│ 👤 Dave · waiting...           [Join →]     │
└─────────────────────────────────────────────┘
```

**You have an open room:**
```
┌─────────────────────────────────────────────┐
│ Practice Rooms         [+ Open a room] (dim)│
│─────────────────────────────────────────────│
│ 👤 You · waiting...            [Leave]      │
│ 👤 Dave · waiting...           [Join →]     │
└─────────────────────────────────────────────┘
```

Row rules:
- Waiting row: name + `· waiting...` + `[Join →]`
- In-session row: both names + `· in session` + 🔵 dot — not tappable
- Your row: `"You"` + `· waiting...` + `[Leave]`, always first
- `[+ Open a room]` disabled when you already have a room

---

### Actions

**[+ Open a room]**
→ navigate to `/live` waiting screen with `returnTo=/events/[slug]`
→ /live is unchanged — QR + link visible as normal

**[Join →]**
→ navigate directly to `/live/[code]` join flow
→ if you already have an open room: silently close it first, then join

**[Leave]**
→ close your room immediately (optimistic)
→ no confirmation needed — reversible (just open a new room)

---

### Flows

**Primary — Alice opens, Bob joins via event page:**
```
Alice: [+ Open a room] → /live/[code] waiting screen
Bob:   sees Alice on event page → [Join →] → /live/[code]
Alice: event page polls → auto-navigates to /live/[code]
→ both in session
```

**Fallback — Bob joins via QR/link:**
```
Alice: [+ Open a room] → /live waiting screen → shares QR/link
Bob:   scans/clicks → joins normally
→ both in session
```

**Alice joins Bob (already waiting):**
```
Alice: arrives on event page → sees Bob waiting → [Join →] → session starts
```

**After session ends:**
```
/live ends → "Back to event" link (returnTo) → event page
→ Practice Rooms section reflects current state
→ Alice can open another room
```

---

### Polling

- Poll every 5s
- Auto-navigate to `/live/[code]` when partner joins your open room
- On error: show empty state, keep `[+ Open a room]` enabled

---

### Accessibility

- `[Join →]` buttons: `aria-label="Join [Name]'s room"`
- Room list: `aria-live="polite"` so screen readers announce updates
- In-session rows: not focusable, `aria-label="[Name1] and [Name2] in session"`
- `[+ Open a room]` when disabled: `aria-disabled="true"`

---

### What This Does Not Cover (Architect Scope)

- Session-event linking in DB
- Polling query / endpoint
- Session state detection (waiting → in-session)
- How `returnTo` is handled on /live side

---

## Technical Architecture

### 1. What Exists Today

**`event_sub_rooms` table** — already migrated (20260213). Schema:
```
id, event_id, session_id (nullable), initiator_id, target_id, status, created_at, expires_at, session_code
```
Status machine: `pending → active → completed | cancelled | expired`. Guards in 20260215 migration: immutable columns + valid status transitions. DB unique indexes prevent one active sub-room per initiator and per target per event.

**Problem:** This table is built for the P124 paired-invitation model (initiator targets one specific person). P406 uses an open-room model: one person waits, anyone can join. `target_id` is NOT NULL and is required by the current schema — the P124 model is incompatible.

**`clarity_sessions`** — session creation is in `src/app/data/api.ts` (`createClaritySession`). RLS: SELECT is public (`USING(true)`), INSERT requires verified user, UPDATE requires `creator_profile_id IS NOT NULL`.

**`returnTo` param** — already wired in `/live`. `clarity-live-page.tsx` reads `returnTo` from URL, shows "← Back to event" button on the waiting screen when present. `isFromEvent` flag is already derived.

**Polling pattern** — `/live` uses `setInterval` at 1000ms + Supabase Realtime subscription. Both patterns are proven and available.

**No service layer for `event_sub_rooms`** — P124 was marked `all-done` with the table in place but zero implementation in `src/`. The interface, mock, and real service have no sub-room methods.

---

### 2. Architecture Decisions

#### Decision 1: Open Rooms via New Table — Don't Extend `event_sub_rooms`

**Option A (rejected):** Make `target_id` nullable in `event_sub_rooms` to support open rooms alongside paired invitations.
- Con: Mixed model in one table makes queries and status semantics ambiguous. The DB guards (status transitions, immutable columns) are built for the paired model. Two concurrent models in one table add fragility.

**Option B (chosen):** New table `event_practice_rooms` for open rooms. Separate from `event_sub_rooms` (which may be needed later for the paired-invitation model).
- Schema is clean, purpose-specific, no migration surgery on guards.
- Simpler RLS: any authenticated user can see all rooms for an event (needed for "show everyone's open room").

**New table: `event_practice_rooms`**
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE
creator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
session_id  UUID REFERENCES clarity_sessions(id) ON DELETE SET NULL
status      TEXT NOT NULL DEFAULT 'waiting'
            CHECK (status IN ('waiting', 'active', 'closed'))
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Status machine:**
- `waiting` — creator is on /live waiting screen, no partner yet
- `active` — partner joined (joiner_name set on clarity_session), both in /live
- `closed` — creator left /live, [Leave] tapped, or session ended

**One room per person constraint:** Partial unique index:
```sql
CREATE UNIQUE INDEX idx_one_waiting_room_per_creator
  ON event_practice_rooms(event_id, creator_id)
  WHERE status = 'waiting';
```
This is DB-enforced. INSERT of a second waiting room for the same creator+event fails with a unique violation — client handles this by closing the existing room first.

#### Decision 2: Session-Event Linking via `event_practice_rooms.session_id`

No `event_id` column added to `clarity_sessions`. Instead, the link is `event_practice_rooms.session_id → clarity_sessions.id`. This keeps `clarity_sessions` unchanged (zero impact on existing /live flows) and satisfies the "zero changes to /live page" constraint.

**Write path:** When [+ Open a room] is tapped:
1. Call `createClaritySession(name, profileId)` — existing function, unchanged
2. Insert row into `event_practice_rooms` with `creator_id`, `event_id`, `session_id` from step 1
3. Navigate to `/live/[code]?returnTo=/events/[slug]`

#### Decision 3: Polling — Simple `setInterval` at 5s, No Supabase Realtime

The spec says "must use existing session polling pattern." Supabase Realtime (Postgres Changes) would work but requires a channel subscription per event page visitor — more complex for limited gain in a same-room in-person context.

Polling every 5s on `event_practice_rooms` for a given `event_id` is sufficient. At a 10-person event that's 10 SELECT queries per 5s — negligible.

**Auto-navigate (creator detects partner joined):** The event page polls for its own room. When the room's `status` changes from `waiting` to `active` (triggered by joiner tapping [Join →]), the event page auto-navigates to `/live/[code]`.

Alternatively, the creator is already on `/live/[code]` waiting screen (Realtime subscription there fires immediately when `joiner_name` is set). The event page auto-navigate is a nice-to-have but may not be needed — the creator is watching `/live`, not the event page. **Omit auto-navigate from MVP.** The /live waiting screen already handles this via its existing Realtime subscription.

#### Decision 4: [Join →] Race Condition Handling

Two users tap [Join →] on the same room simultaneously:
1. Both call `joinClaritySession(code, name, profileId)` — existing function in `api.ts`
2. `joinClaritySession` does a SELECT then UPDATE. If two UPDATEs hit simultaneously, last-write-wins on `joiner_name`. This is pre-existing behavior.
3. Additionally, update `event_practice_rooms.status = 'active'` after successful join.

The real protection against "room stolen" is UX: once `status = 'active'`, the room disappears from the [Join →] list on the next poll. Worst case: both people end up in the same /live session (the intended outcome anyway). No additional DB locking needed.

#### Decision 5: [Leave] / Room Cleanup

**[Leave] tapped by creator:** Update `event_practice_rooms.status = 'closed'`. Optimistic update in UI. Does NOT end the `/live` session itself (creator may re-navigate there). Room is gone from the list.

**Creator closes /live tab without ending session:** The `event_practice_rooms` row stays `waiting` until the session expires or a future cleanup job runs. Mitigation: add `expires_at = created_at + 30 minutes` to the room row. Poll query filters `expires_at > NOW()`. No cron job needed — stale rows become invisible automatically.

**User opens a second room (while one is open):** The partial unique index prevents the INSERT. Client must close the existing room first. Flow: [+ Open a room] → check for existing room → if found, close it (`status = 'closed'`) → create new room. No second modal, no friction.

---

### 3. Security Review

**Can users see other people's session codes?**
`clarity_sessions` has `SELECT USING(true)` — fully public. Codes are always readable by anyone. This is intentional (joining requires knowing the code). No change needed.

**Can someone join a session they weren't invited to?**
Open rooms are intentionally joinable. The `event_practice_rooms` query returns the `session_code` for `waiting` rooms. Anyone who can see the event page can join. This is the product intent for P406.

**RLS for `event_practice_rooms`:**
- SELECT: `USING(true)` — all rooms for an event visible to anyone (needed for the practice rooms list)
- INSERT: `WITH CHECK(auth.uid() = creator_id)` — must be the creator, must be authenticated
- UPDATE: `USING(auth.uid() = creator_id OR EXISTS(SELECT 1 FROM clarity_sessions WHERE id = event_practice_rooms.session_id AND joiner_profile_id = auth.uid()))` — creator can close/update; joiner can set `status = 'active'` on join

**One room per person — server-side enforcement?**
Yes, DB-level partial unique index (`WHERE status = 'waiting'`). Server rejects duplicate inserts. Client handles the error by closing the existing room first, then retrying.

**Input validation on join:**
`joinClaritySession` already validates the session code and that `joiner_name` is non-empty. The `event_id` for the room query comes from the event slug (URL param) — not user-provided input.

**Expiry protection:** `expires_at` filters prevent stale zombie rooms from appearing. No orphaned rooms block new sessions.

---

### 4. Implementation Approach

#### DB Migration (new)
**File:** `supabase/migrations/20260220HHMMSS_p406_event_practice_rooms.sql`

```sql
CREATE TABLE public.event_practice_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'waiting'
             CHECK (status IN ('waiting', 'active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

ALTER TABLE public.event_practice_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_practice_rooms_select"
  ON public.event_practice_rooms FOR SELECT USING (true);

CREATE POLICY "event_practice_rooms_insert"
  ON public.event_practice_rooms FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "event_practice_rooms_update"
  ON public.event_practice_rooms FOR UPDATE
  USING (
    auth.uid() = creator_id
    OR EXISTS (
      SELECT 1 FROM public.clarity_sessions cs
      WHERE cs.id = event_practice_rooms.session_id
        AND cs.joiner_profile_id = auth.uid()
    )
  );

CREATE UNIQUE INDEX idx_one_waiting_room_per_creator
  ON public.event_practice_rooms(event_id, creator_id)
  WHERE status = 'waiting';

CREATE INDEX idx_event_practice_rooms_event ON public.event_practice_rooms(event_id);
```

Run `./scripts/migrate.sh` after creating the file.

#### Types (modify existing)
**File:** `src/app/types/index.ts`

Add:
```ts
export interface EventPracticeRoom {
  id: string;
  eventId: string;
  creatorId: string;
  sessionId: string | null;
  sessionCode: string | null;  // fetched via join to clarity_sessions
  status: 'waiting' | 'active' | 'closed';
  createdAt: string;
  expiresAt: string;
  // Joined from profiles:
  creatorName: string;
  creatorSlug: string;
  creatorAvatarColor: string;
  creatorAvatarUrl: string | null;
}
```

#### Service Layer (modify existing)
**File:** `src/app/data/events-service.interface.ts` — add methods:
```ts
getPracticeRooms(eventId: string): Promise<EventPracticeRoom[]>;
openPracticeRoom(eventId: string, creatorId: string, sessionId: string): Promise<EventPracticeRoom>;
closePracticeRoom(roomId: string): Promise<void>;
joinPracticeRoom(roomId: string, sessionId: string): Promise<void>;
```

**File:** `src/app/data/events-service-real.ts` — implement the four methods.

`getPracticeRooms` query:
```sql
SELECT epr.*, cs.code as session_code,
  p.name as creator_name, p.slug as creator_slug,
  p.avatar_color, p.avatar_url
FROM event_practice_rooms epr
LEFT JOIN clarity_sessions cs ON cs.id = epr.session_id
JOIN profiles p ON p.id = epr.creator_id
WHERE epr.event_id = $eventId
  AND epr.status IN ('waiting', 'active')
  AND epr.expires_at > NOW()
ORDER BY epr.created_at ASC
```

**File:** `src/app/data/events-service-mock.ts` — add mock implementations returning `[]` for getPracticeRooms and no-ops for mutations.

#### New Component
**File:** `src/app/prototypes/events/components/PracticeRooms.tsx`

Props:
```ts
interface PracticeRoomsProps {
  eventId: string;
  eventSlug: string;
  currentUserId: string | null;
}
```

Responsibilities:
- Poll `getPracticeRooms(eventId)` every 5s via `setInterval` (same pattern as `/live`)
- Render all UX states (empty, rooms exist, you have a room)
- [+ Open a room]: call `createClaritySession` → `openPracticeRoom` → navigate to `/live/[code]?returnTo=/events/[slug]`
- [Join →]: call `joinClaritySession(code, name, profileId)` → `joinPracticeRoom(roomId, sessionId)` → navigate to `/live/[code]`
- [Leave]: call `closePracticeRoom(roomId)` optimistically

#### Mount Point (modify existing)
**File:** `src/app/prototypes/events/components/EventDetail.tsx`

Add `<PracticeRooms>` below the Participants card in the right column. Pass `event.id`, `event.slug`, `user?.id`. No other changes to this file.

#### Build Sequence
1. DB migration → `./scripts/migrate.sh`
2. Types in `index.ts`
3. Service interface + real + mock implementations
4. `PracticeRooms` component (with polling, all states)
5. Mount in `EventDetail.tsx`
6. Manual QA: two-browser test (open room, join from second browser, verify both land in /live)

---

### 5. Edge Cases

| Case | Handling |
|------|----------|
| User tries to open second room while one is open | Partial unique index rejects INSERT. Client: detect error → close existing room → retry insert. No user-visible error unless close itself fails. |
| Two users tap [Join →] simultaneously | Both call `joinClaritySession`. Last write wins on `joiner_name`. Both get into same /live session — the correct outcome. Room status updates to `active` on next poll for everyone else. |
| Creator closes /live tab without ending session | Room row has `expires_at = NOW() + 30min`. After expiry, room disappears from poll results automatically. No orphan room shown to others indefinitely. |
| Creator ends session normally | `endClaritySession` sets `ended_at` on clarity_session. Client should also call `closePracticeRoom` at that point — wire this up in the [+ Open a room] flow (pass room ID back from openPracticeRoom, store in component state, close on unmount or when navigating back). |
| User is unauthenticated | `[+ Open a room]` and `[Join →]` both require auth (INSERT policy + `createClaritySession` requires verified user). Show sign-in prompt instead. |
| Network error during poll | Catch error in poll callback, show empty state, keep `[+ Open a room]` enabled (per spec). Log error, don't surface to user unless persistent. |
| Event has no participants | Practice Rooms section still renders (no RSVP requirement per spec). Empty state + `[+ Open a room]` enabled for any authenticated user. |

---

## Test Coverage Strategy

### What Was Generated

Three automated test files + one UAT checklist, covering the full P406 surface area.

#### 1. Integration Test — `e2e/integration/p406-practice-rooms-migration.spec.ts`

**Why:** P406 introduces a new DB table (`event_practice_rooms`) with custom RLS policies, a status CHECK constraint, a default `expires_at`, and a partial unique index. None of these can be verified by E2E UI tests alone — a migration that isn't applied silently breaks the feature at runtime. The integration test catches this class of bug immediately.

**What it covers:**
- Table and all columns exist (catches migration not applied)
- Status CHECK constraint: `'invalid_status'` is rejected at DB level
- `expires_at` defaults to NOW() + 30 minutes (within 1-minute tolerance)
- RLS SELECT: anonymous client can read all rooms (needed for public event page)
- RLS INSERT: authenticated user can insert with their own `creator_id`
- RLS INSERT: authenticated user is BLOCKED from spoofing another user's `creator_id`
- RLS INSERT: anonymous caller is blocked entirely
- Partial unique index: second waiting room for same `(event_id, creator_id)` is rejected
- Partial unique index: new room IS allowed after closing the first (index is `WHERE status='waiting'`)
- ON DELETE CASCADE: rooms deleted when parent event is deleted

**Pattern:** Two-client pattern (supabaseAdmin for schema checks + user-scoped JWT client for RLS assertions). Matches `p396-host-rls-migration.spec.ts` and `p272-accuracy-achieved-migration.spec.ts`.

#### 2. E2E Tests — `e2e/p406-practice-rooms.spec.ts`

**Why:** The UI behavior (room states, navigation, button states, leave flow) can't be verified at the DB level. These tests verify the component renders correctly for each state from the user's perspective.

**What it covers:**
- Empty state: Practice Rooms section visible with enabled [+ Open a room]
- [+ Open a room] navigates to /live with `returnTo` param containing the event slug
- Waiting room shows creator name + "waiting..." + [Join →]
- [Join →] navigates to `/live/[code]` (with a real session code in the room)
- Active (in-session) room shows "in session" indicator, no [Join →]
- Your own room shows "You · waiting..." + [Leave], no [Join →]
- [+ Open a room] is disabled/aria-disabled when you already have a waiting room
- [Leave] removes the room from the list and shows empty state
- Unauthenticated [+ Open a room] click redirects to /login or /signup

**Test data:** Rooms seeded via `supabaseAdmin` directly (bypasses RLS for test setup). No actual two-party /live session started — component state driven purely by DB data.

#### 3. Smoke Tests — `e2e/p406-smoke.spec.ts`

**Why:** Fast regression check that catches crashes before deeper tests run. These catch: component throws on mount, Practice Rooms accidentally injected into /live, section missing from event page.

**What it covers:**
- Authenticated: event page loads with Practice Rooms section, zero JS errors
- Anonymous: event page loads with Practice Rooms section, zero JS errors
- /live page has NO Practice Rooms heading (zero-changes-to-/live constraint)
- Practice Rooms section renders after Participants in the DOM (layout order)

#### 4. UAT Checklist — `features/uat/p406.md`

**Why:** Automated tests can't fully cover: visual polish (row animation, locked row styling, dimmed button), real device touch targets, two-party live flow (both parties land in session), polling latency verification, 30-minute expiry behavior, screen reader announcements.

**What it covers (9 categories):**
- UAT-1: Practice Rooms section always visible (all event types)
- UAT-2: Opening a room (navigation, returnTo, QR fallback, disabled state, unauth)
- UAT-3: Joining a room (row appearance, [Join →] navigation, both parties in session, room state after join)
- UAT-4: In-session room locked state (no Join, not focusable)
- UAT-5: Leaving a room (optimistic, no confirmation, auto-expiry)
- UAT-6: One-room-per-person constraint (DB enforcement + client handling)
- UAT-7: Polling and real-time updates (5s update, error graceful degradation)
- UAT-8: Accessibility (aria-label on Join, aria-live on list, in-session row not in tab order)
- UAT-9: Mobile layout (stacking below Participants, touch target size)

### Coverage Gaps (Intentional)

- **Race condition (two simultaneous [Join →] taps):** Not automated. The spec's decision is "last write wins → both end up in same session — the correct outcome." This is behavioral, not a correctness concern, and requires two real concurrent browser contexts with tight timing. UAT-3.3 covers the observable outcome.
- **Auto-navigate on /live when partner joins:** Spec decision is to omit this from MVP (creator is watching /live, which already handles it via Realtime). No test needed.
- **5s polling timing:** Not tested precisely — polling is an implementation detail. What matters is that the UI reflects DB state; integration tests verify DB state directly.
- **Expiry at exactly 30 minutes:** Integration test verifies the `expires_at` default is set correctly. Real 30-minute expiry is not tested (would require `pg_sleep` or time manipulation).
