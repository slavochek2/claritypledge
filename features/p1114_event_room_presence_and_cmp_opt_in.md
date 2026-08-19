---
status: week
type: story
rank: 46
created_date: '2026-08-19'
tags: [events, cmp, meet, ready, opt-in, room]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1114: The event room — who is here, and who opted in

## Problem

**Situation:** The Clarity Meeting Principle opt-in at `/meet` writes nothing to the
server. It lives in one localStorage key (`cp.meeting-terms.v1`,
[meeting-terms-page.tsx](../src/app/pages/meeting-terms-page.tsx):57), and the file says so
deliberately: *"Deliberately has no backend… The agreement is witnessed in the room, not
recorded."* Separately, `event_rsvps` records who said they would come, and nothing records
who actually came.

**Complication:** The event run-of-show now depends on both facts.
[clarity-practice-event.md](../docs/events/clarity-practice-event.md):95 block 6 gives opt-ins
a job — *"challenge each other to give the number"* — but nobody in the room can see who
opted in, so nobody knows whose non-answer is a broken promise and whose is a right they
never gave up. And [p1055](p1055_norm_measurement_instrument.md) measures what people
*believe* about the principle; nothing measures whether anyone acted on it. The norm is the
product, and the norm currently leaves no trace.

**Question:** How does a room see who opted in, without turning the room into twelve people
looking at phones — and without the record lying about who was there?

## Appetite

**Blast radius: medium.** One new table, one new page inside the existing events router, one
new tab on the event page. Nothing existing changes behaviour: standalone `/ready` and
`/meet` are untouched, `event_rsvps` is untouched, and
[p1083](done/2026-06-10/p1083_ready_live_distribution_reveal.md) — **shipped** — requires no
change.

**Reversibility: high.** Additive migration, new routes, one tab. Removing the tab and the
routes returns the product to today's behaviour with an orphaned table.

**Decision density: low.** Fourteen design decisions were settled in a `/grill-me`
walkthrough on 2026-08-19 and are recorded below as the Solution. What remains open is copy,
marked `[FOUNDER DECISION]`.

## Solution

A **room** is an event. Joining a room is a separate act from RSVPing, and the room is where
the Clarity Meeting Principle opt-in is recorded, displayed, and projected.

### 1. Room presence is not RSVP

A new table records room presence and everything that happens in the room: the event, a
display name, a profile id **when the person has one**, when they joined, their opt-in state
with **full history**, their readiness value, and a cascade counter.

`event_rsvps` is untouched and stays account-only —
[EventDetail.tsx](../src/app/prototypes/events/components/EventDetail.tsx):168 redirects
anonymous users to `/signup`, and that behaviour does not change. RSVP means *"I said I'd
come."* The room means *"I was here."* Three valid states, all fine: registered and absent,
registered and present, unregistered and present.

Walk-in versus registered attendee is readable from whether the room row carries a profile id.

### 2. Identity: name or login

Reuse the two-state guest pattern already shipped in `/live` (P396,
[clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx):3318 and :4015) — continue
with an account, or join with a name only. No email collected, no profile created. Logged-in
users are pre-filled. A name persists locally so a refresh does not eject someone mid-event.

### 3. Routes

All three go inside the existing nested events router
([index.tsx](../src/app/prototypes/events/index.tsx):54-63, which already carries
`:slug/edit` and `:slug/confirm`):

| Route | Job |
|---|---|
| `/events/:slug/room` | The join screen. Passes straight through if already identified. |
| `/events/:slug/ready` | **Canonical.** Readiness first, the principle below, roster beside both. |
| `/events/:slug/meet` | Second door onto the **same page**, positioned at the principle. |

One page, not three, because the roster must be visible the whole time — two pages would
render it twice or drop it. The projected link never changes as the evening moves.

**Standalone `/ready` and `/meet` are untouched.** They stay roomless, for people arriving
from Point links who have never heard of us. The event key is purely additive.

### 4. A Room tab on the event page

Reuse the tab pattern from [org-page.tsx](../src/app/pages/org-page.tsx):24-34.
`EventDetail` has no tabs today, so this is new work on that page.

**Visible to everyone, no permission logic** — gating by registration protects nothing,
because the walk-in arrives by the projected link and never sees the tab. Content adapts to
timing instead: before, during, after.

### 5. When the room is open

Open **any time before** the event — early opt-ins mean names are already on the wall when
the evening starts, and the cascade is running before anyone sits down.

**Frozen read-only** at the existing `EVENT_GRACE_HOURS` boundary
([events-service-real.ts](../src/app/data/events-service-real.ts):16 — value `5`, anchored to
event **start**, not end, per P494). The room is open exactly as long as the event is in
"upcoming," and closes when it drops out. One constant, one rule.

Frozen means the wall still shows who was there; nothing can be added. A room that accepts
joins forever stops recording attendance and starts recording browsing.

**No capacity cap on the room.** `max_attendees` governs RSVP only. Turning away someone
who is visibly standing in the room is not a thing software should do.

### 6. The opt-in

Everyone passes through the principle. **Default is opt-out.**

The roster is visible **before** the person answers — consistent with
[p1083](done/2026-06-10/p1083_ready_live_distribution_reveal.md), which shows its
distribution ungated on load, and because seeing eight names already opted in is the strongest thing that can sit in
front of person nine.

**Opt-ins are shown. Opt-outs are never shown.**

**Changes are allowed and the full history is kept**, not just current state. The in-room
flip from opt-out to opt-in — someone watching the norm work for forty minutes and then
joining it — is the conversion signal the event exists to produce. Storing only current state
overwrites it permanently.

**A cascade counter is recorded per answer:** how many had already opted in at that moment.
One integer. Without it, cascade cannot be separated from conviction, ever.

### 7. Readiness lives with the room

The room holds its **own** readiness values. No mixing with the general `/ready` in either
direction, and **no expiry** — the general page forgets after ten minutes because it is a
rolling stream of strangers; a room is bounded and has an evening.

Stored against the person (everyone in the room already has a name attached), **displayed as
dots**, and **never described as anonymous in copy** — claiming anonymity we do not have is
the version that hurts us. Storing it against the person keeps one research question
available: do people who arrive more ready opt in more?

### 8. Present toggle

A toggle on the room page that hides controls and enlarges names, for projecting.
**Not a separate route** — a second view is a second thing to keep in sync and to break at
7pm in a room full of people.

### 9. Membership does not auto-opt-in

Organization membership does **not** grant a CMP opt-in, and the Clarity Organization
Agreement is not modified. Members confirm for the room like everyone else, with their
standing commitment shown as pre-filled context.

Two reasons: in a room of mostly members, auto-opt-in makes the display show near-total
opt-in and teaches us nothing — the variance *is* the measurement. And the opt-in's value is
that it is taken in the room, in front of the people it binds.

## Risks / Non-Goals

### Risks

- **The same human appears twice** — once via their account, once by name from a phone on a
  second device. No dedupe is possible. *Mitigation: none at room scale (twelve people at a
  table will see it). Accepted. It matters only if room counts are later aggregated into a
  reach claim, and that aggregation is out of scope here.*
- **Promoting the room link early thins out run-of-show block 3**, where the room opts in
  together. *Mitigation: operational, not technical — how early the link is shared is the
  facilitator's lever. Do not solve this in code.*
- **Cascade contaminates the opt-in rate.** Showing the roster before answering means the
  number partly measures conformity. *Mitigation: the cascade counter (§6) makes this
  detectable in analysis rather than invisible.*
- **The wall is a live surface in front of a room.** A failed realtime connection is visible
  to everyone at once. *Mitigation: the roster must degrade to a readable static list, never
  to an error state or an empty wall.*
- **Identified readiness could be mistaken for anonymous.** *Mitigation: copy never uses the
  word; the UI Contract below fixes the phrasing.*

### Non-Goals

- Do **NOT** modify standalone `/ready` or `/meet`. They stay roomless and behave exactly as
  today.
- Do **NOT** modify [p1083](done/2026-06-10/p1083_ready_live_distribution_reveal.md) or its
  shipped `ready_submissions` table (migration `20260816120000_p1083_ready_submissions.sql`).
  It needs no room key — the room stores its own readiness, separately.
- Do **NOT** modify `event_rsvps`, its RLS, or the RSVP flow. Room presence is a separate
  table.
- Do **NOT** add a capacity check to the room.
- Do **NOT** build a separate `/screen` or display route — the Present toggle is a state on
  the room page.
- Do **NOT** build any invocation-counting surface, table, or button. The bell is analog and
  stays analog; invocation rate is sampled by an observer at instrumented events, not
  captured in-app.
- Do **NOT** grant an opt-in from organization membership, and do **NOT** edit the Clarity
  Organization Agreement.
- Do **NOT** gate the room on having opted in. Opt-outs are load-bearing —
  [decisions.md](../docs/decisions.md) 2026-08-12 records them as a carrier mechanic, not a
  filter.
- Do **NOT** link events to organizations here — that is
  [p1060](p1060_link_events_to_organizations.md).
- Do **NOT** show opt-outs on the roster, in any form, including a count.

### Governing prior decision — do not contradict

[decisions.md](../docs/decisions.md) 2026-08-12 [product]: **invocation is universal.** Anyone
in the room may ask anyone. **Opt-ins owe an answer** — a number, or an explicit *"not now,
because X."* **Opt-outs owe nothing.** Nothing in this spec may restrict who can ask.

## Done-When

- [ ] A person can open `/events/:slug/room`, join with a name only (no account, no email),
      and appear on that event's roster
- [ ] A logged-in person passes through the join screen without re-entering their name
- [ ] `/events/:slug/ready` and `/events/:slug/meet` render the same page, positioned at
      readiness and at the principle respectively
- [ ] Standalone `/ready` and `/meet` behave identically to before this spec (verified by
      existing tests still passing, unmodified)
- [ ] The roster is visible before the person answers, and shows opt-ins only — no opt-out
      is displayed or counted anywhere in the UI
- [ ] A second browser opting in causes the first browser's roster to update **without a
      reload**
- [ ] Changing an answer is possible, and the prior answer is still queryable afterwards
- [ ] Each opt-in row stores how many people had already opted in at that moment
- [ ] Room readiness values do not appear in the general `/ready` distribution, and general
      `/ready` submissions do not appear in any room
- [ ] Room readiness values survive longer than 10 minutes
- [ ] The Present toggle hides controls and enlarges the roster on the same route
- [ ] Joining the room does **not** create an `event_rsvps` row
- [ ] A room row is distinguishable as walk-in vs registered
- [ ] After `EVENT_GRACE_HOURS` past event start, the room rejects new joins and answer
      changes, and still displays who was there
- [ ] A room with `max_attendees` already reached still accepts new room joins
- [ ] An organization member sees themselves as **not** opted in until they confirm in the room
- [ ] Roster degrades to a static readable list if realtime fails — never an error state or
      an empty wall

## UX Notes

**States the room page must handle:** not yet identified (join screen) · identified but has
not answered readiness · answered readiness, has not answered the principle · opted in ·
opted out · room frozen (read-only) · realtime disconnected · zero people in the room.

**Zero-state matters more than usual** — the first person to open the room sees an empty
wall, and that is also what the projector shows before anyone arrives.

**The participant's own device** shows their current state and a way to change it. Nothing
else. Everything worth looking at is on the wall — putting a live scoreboard on twelve phones
is the outcome this whole design exists to avoid.

**Mobile:** single column, roster below the action. **Desktop:** two columns, roster beside.
Detailed layout is a `/ux` question, not settled here.

**The tab's three time states:** before the event (an invitation to join early), during (the
room), after (who was there, frozen).

## Acceptance Criteria

- [ ] A walk-in with no account can join the room and be seen on the wall within one minute
      of arriving, without installing, registering, or giving an email
- [ ] A person in the room can tell who has opted in without asking anyone
- [ ] A person who opted out at the start can opt in later in the same event, and that change
      is visible on the wall
- [ ] The facilitator can project the room from one link that does not change during the event
- [ ] After the event, the event page still shows who was in the room
- [ ] Nothing in the room UI reveals, counts, or implies who opted out

## UI Contract

`[FOUNDER DECISION]` on every user-facing string below — these are placeholders marking where
copy is required, not proposed copy.

| Element | Value | Context |
|---|---|---|
| Tab label | `[FOUNDER DECISION]` — "Room"? | Event page tab |
| Join screen heading | `[FOUNDER DECISION]` | `/events/:slug/room` |
| Guest join field label | `[FOUNDER DECISION]` | Join screen, name-only path |
| Account path label | Reuse `/live`'s existing wording | Join screen |
| Roster heading | `[FOUNDER DECISION]` | Room page + Present mode |
| Readiness dot caption | Must **not** contain "anonymous" / "anonymised" | Below the dots |
| Member pre-fill line | `[FOUNDER DECISION]` — shows standing commitment as context, must not read as already opted in | Principle section |
| Frozen-room notice | `[FOUNDER DECISION]` | After grace boundary |
| Present toggle label | `[FOUNDER DECISION]` | Room page |
| Zero-state line | `[FOUNDER DECISION]` | Empty roster |

## Related

- [p1055](p1055_norm_measurement_instrument.md) — the CMP Point Set; this spec records the
  opt-in that its flow step 1 assumes
- [p1083](done/2026-06-10/p1083_ready_live_distribution_reveal.md) — general `/ready`
  distribution, shipped 2026-08-16; deliberately untouched
- [p1060](p1060_link_events_to_organizations.md) — events belong to an organization; the
  reach count this spec's data eventually feeds
- [decisions.md](../docs/decisions.md) 2026-08-12 — universal invocation
- [clarity-practice-event.md](../docs/events/clarity-practice-event.md):95 — run-of-show
  blocks 2, 3 and 6
- [facilitator-guide.md](../docs/facilitator-guide.md):406 — the comprehension challenge; the
  bell is a docs-only change filed there, **not** part of this spec
