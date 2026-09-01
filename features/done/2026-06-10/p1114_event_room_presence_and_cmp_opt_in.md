---
status: all-done
type: story
rank: 46
created_date: '2026-08-19'
tags: [events, cmp, meet, ready, opt-in, room]
flow: dev
pipeline_plan: [create-spec, architect, generate-tests, dev, verify]
pipeline_skipped: [challenge-prd -- the /grill-me walkthrough ran the same adversarial pass live with founder answers on all 14 decisions, ux -- spec already carries the 8 states and layout; the 10 copy strings are founder decisions no skill can produce, spec-compact -- the 302 lines are decisions not pipeline residue, decompose -- one coherent surface of one page one table one tab not 5 independent concerns]
pipeline_ran: [create-spec, architect, generate-tests, dev, verify, ship]
driver: heuristic
completed_at: 2026-08-23
---

# P1114: The event room — who is here, and who opted in

## Run This

Run from `<cp-root>/.claude/worktrees/w2` — the claimed worktree for this spec, already on
`feature/p1114-event-room`.

    /goal "./scripts/goal-gate.sh p1114 exits 0, output pasted. Stop after 30 turns."

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent can invoke
it for them. The condition names an exit code on purpose: the loop's evaluator reads the
transcript and runs nothing, so the only trustworthy condition is one naming an artifact the
agent cannot author.

**What this does and does not guarantee.** The loop still stops on the agent's *paste* of the
exit code, and nothing here changes that. What the pinned contract buys is that forgery and
decay are caught at the merge boundary by CI, before anything reaches `main`. Expect a
walk-back that is usually-but-not-always green — not a self-proven branch.

**The loop stops at a committed branch.** Merging, migrating prod, deploying and pushing are
all ALWAYS-ASK and none of them are pre-approvable.


## Problem

**Situation:** The Clarity Meeting Principle opt-in at `/meet` writes nothing to the
server. It lives in one localStorage key (`cp.meeting-terms.v1`,
[meeting-terms-page.tsx](../../../src/app/pages/meeting-terms-page.tsx):57), and the file says so
deliberately: *"Deliberately has no backend… The agreement is witnessed in the room, not
recorded."* Separately, `event_rsvps` records who said they would come, and nothing records
who actually came.

**Complication:** The event run-of-show now depends on both facts.
[clarity-practice-event.md](../../../docs/events/clarity-practice-event.md):95 block 6 gives opt-ins
a job — *"challenge each other to give the number"* — but nobody in the room can see who
opted in, so nobody knows whose non-answer is a broken promise and whose is a right they
never gave up. And [p1055](../../p1055_norm_measurement_instrument.md) measures what people
*believe* about the principle; nothing measures whether anyone acted on it. The norm is the
product, and the norm currently leaves no trace.

**Question:** How does a room see who opted in, without turning the room into twelve people
looking at phones — and without the record lying about who was there?

## Appetite

**Blast radius: medium.** One new table, one new page inside the existing events router, one
new tab on the event page. Nothing existing changes behaviour: standalone `/ready` and
`/meet` are untouched, `event_rsvps` is untouched, and
[p1083](p1083_ready_live_distribution_reveal.md) — **shipped** — requires no
change.

**Reversibility: high.** Additive migration, new routes, one tab. Removing the tab and the
routes returns the product to today's behaviour with an orphaned table.

**Decision density: low.** Fourteen design decisions were settled in a `/grill-me`
walkthrough on 2026-08-19 and are recorded below as the Solution. What remains open is copy,
marked `[FOUNDER DECISION]`.

## Solution

> ## ⚠ REVISED (2) 2026-08-20 — supersedes the block below it
>
> **The founder retired the walk-in.** Asked directly whether an unregistered person ever
> shows up — even at an in-person event — the answer was: *"this person doesn't exist even for
> normal events."* That single fact invalidates the largest and most exotic part of this spec.
>
> ### Entry is gated by registration + sign-in
> A person reaches the principle only if they are **registered for this event AND signed in**.
> Anyone else sees one screen: *register for this event, or sign in if you already have.*
>
> Superseded by this: §1's third state (**"unregistered and present"** — deleted, two states
> remain), §2 (**"Identity: name or login"** — name-only entry is deleted; identity is the
> signed-in profile), and §4's *"Visible to everyone, no permission logic."* §4's premise was
> *"gating protects nothing, because the walk-in arrives by the room link and never sees the
> tab."* With no walk-in the premise is void — and note it cut the other way even while true:
> if the walk-in never saw the tab, gating the tab never cost the walk-in anything.
>
> `event_rsvps` is now the room's gate. It was already the gate for RSVP — one rule, not two.
>
> ### `/room` collapses to the gate
> | Route | Job |
> |---|---|
> | `/events/:slug/room` | Gate only. Registered + signed in → redirect to `…/ready`. Otherwise the register-or-sign-in screen. Renders no content of its own. |
> | `/events/:slug/ready` | Readiness. The shipped `/ready` composition, event-scoped. |
> | `/events/:slug/meet` | The principle, the roster, the decision. |
>
> Supersedes revision (1)'s **"one scroll, this order"** and §3's *"One page, not three."* The
> founder approved a two-page flow in ASCII on 2026-08-20 after seeing the one-scroll build:
> the merged page read as two shipped pages crammed together, annotated *"this is a page
> before! /read and now we are on /meet."*
>
> ### The two pages mirror the shipped ones exactly
> **`…/ready`** — `ready-page.tsx`'s composition unchanged: one question, `SliderTrack`,
> `Continue`, vertically centred. Only the distribution differs (this event's people, not the
> global last-10-minutes). **No caption under the slider** — the `Readiness caption` row in the
> UI Contract is retired, founder-annotated *delete*.
>
> **`…/meet`** — `meeting-terms-page.tsx`'s composition: `CertificateFrame` scrolling under a
> `FixedBottomBar`. **The decision lives in that bar** — the loose `Opt in` / `Opt out` block
> below the scroll is deleted; it duplicated a control the shipped page already carries. Roster
> renders **above the bar, below the certificate** (founder-chosen: faces sit where the decision
> is made). Level stays 3; the room has no level picker.
>
> **Both pages mount under `ClarityLandingLayout compact`** — no marketing nav, no footer.
> Resolves two founder annotations (*hide footer*, *delete* on the `Project` chip) with one
> change. The Present toggle leaves this surface entirely; the `Present toggle` UI Contract row
> is retired with it.
>
> **No understanding number in the room.** Shipped `/meet` asks it after opting in, then offers
> `Start meeting`. Both are built for one situation — two people, one phone, a host standing
> there to ask the follow-up out loud. In a room of forty nobody asks, so the number is a number
> with no question attached, and there is no phone to hand back. This is the ONE deliberate
> divergence from `/meet`; everything else is the same components in the same order.
>
> ### The anonymous machinery is removed, not kept dormant
> The bearer-secret design existed solely to let a person with no account mutate their own row.
> With no such person, it is replaced by the pattern used everywhere else in this codebase:
> `auth.uid()`-based ownership.
>
> - **Supersedes Architecture Decision 1** in full, and the Security Review findings that rest
>   on it.
> - `GRANT EXECUTE … TO anon` on all four RPCs is **revoked** — an unauthenticated surface with
>   no user is a surface, not a spare part.
> - `client_secret` and the localStorage identity are removed from the read/write path.
> - **`GuestOrAccountJoin` is NOT deleted.** It is `/live`'s production join form
>   (`clarity-live-page.tsx`:4019); this spec only extracted it. `src/tests/p1114-shared-component-reuse.test.tsx`'s
>   assertion that *the room* imports it is retired; the assertion that `/live` does must stay.
>
> *Rejected: keeping the machinery dormant for a future walk-in.* The future case is
> unregistered people entering an event, decided against twice in one sitting. If it returns it
> returns as a decision, not as code that happened to survive.
>
> ### Event page — two founder corrections
> 1. **The tab bar moves above the event card**, directly under `← Events`. Tabs switch the whole
>    page body, not a strip beneath it.
> 2. **Practice Rooms returns to its position on `main`** — inside the left column, after the
>    description. Moving it into a tab was uninstructed scope creep, annotated *"leave it where
>    it was!"* Revision (1) already said Practice Rooms stays untouched; the build broke that.


> ## ⚠ REVISED 2026-08-20 — read this before anything below it
>
> The first UI build was **rejected by the founder on sight**: it reinvented controls that already
> ship (an eleven-button 0–10 ladder next to an already-extracted `SliderTrack`), and it framed the
> feature as "a room" when the thing a person actually does is **review the Clarity Meeting
> Principle and opt in, in front of people who already have**.
>
> ### Built, green, and NOT to be rebuilt
> | Layer | State |
> |---|---|
> | `event_room_members` + `event_room_answers`, RLS, grants, CHECKs | done — **28/28** integration, serial and parallel |
> | Four `SECURITY DEFINER` RPCs (join / opt-in / readiness / self-status) | done — freeze guard + server-computed cascade counter verified |
> | Realtime row-level filtering | **measured green ×3** with a live control — see Decision 2 |
> | `event-room-service.ts`, types, three routes | done |
> | `guest-or-account-join` + `SliderTrack` reuse | done — guarded by `src/tests/p1114-shared-component-reuse.test.tsx` |
>
> **The data model, the RPCs and the security design are unchanged by this revision.** Only the
> page's composition, order and wording change. Do not re-derive the backend.
>
> ### The revised page — one scroll, this order
> 1. **Readiness** — "How up for thinking are you right now?", the shipped `SliderTrack`.
> 2. **The Clarity Meeting Principle** — the terms themselves.
> 3. **Who opted in** — *before* the buttons. Seeing eight names already opted in is the strongest
>    thing that can sit in front of person nine; putting it after the decision wastes it.
> 4. **Opt in / Opt out** — the page **ends here**, on the decision. An earlier draft placed a
>    readiness distribution below this and it was cut: ending on a chart buries the call to action.
>
> ### Naming
> **Nothing is called a "room" in user-facing copy.** The word survives only in table and route
> names, which are internal. The tab reads **Clarity Meeting Principle**; the page heading is
> **Review the Clarity Meeting Principle**. There is no "empty room" state — an unanswered page is
> simply one where nobody has opted in yet.
>
> ### The event page keeps its existing shape
> **Two tabs only: `Details` and `Clarity Meeting Principle`.** Practice Rooms stay exactly where
> they are today, inside Details, untouched — this spec does not restructure that page. The tab
> selection must live in the URL so the browser back button behaves the way a person expects.
>
> ### The roster renders people properly
> Signed-in attendees render as the **normal person row used elsewhere in the product** — full name,
> link to profile, avatar image, pledge ring, ear badge. Not a stripped-down text list. This needs a
> read-side join to `profiles` for those fields; no schema change. **Walk-ins have no profile**, so
> they render as name-only with no link — the truthful rendering, not a degraded one, since there is
> nothing to link to.


A **room** is an event. Joining a room is a separate act from RSVPing, and the room is where
the Clarity Meeting Principle opt-in is recorded, displayed, and projected.

### 1. Room presence is not RSVP

A new table records room presence and everything that happens in the room: the event, a
display name, a profile id **when the person has one**, when they joined, their opt-in state
with **full history**, their readiness value, and a cascade counter.

`event_rsvps` is untouched and stays account-only —
[EventDetail.tsx](../../../src/app/prototypes/events/components/EventDetail.tsx):168 redirects
anonymous users to `/signup`, and that behaviour does not change. RSVP means *"I said I'd
come."* The room means *"I was here."* Three valid states, all fine: registered and absent,
registered and present, unregistered and present.

Walk-in versus registered attendee is readable from whether the room row carries a profile id.

### 2. Identity: name or login

Reuse the two-state guest pattern already shipped in `/live` (P396,
[clarity-live-page.tsx](../../../src/app/pages/clarity-live-page.tsx):3318 and :4015) — continue
with an account, or join with a name only. No email collected, no profile created. Logged-in
users are pre-filled. A name persists locally so a refresh does not eject someone mid-event.

### 3. Routes

All three go inside the existing nested events router
([index.tsx](../../../src/app/prototypes/events/index.tsx):54-63, which already carries
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

Reuse the tab pattern from [org-page.tsx](../../../src/app/pages/org-page.tsx):24-34.
`EventDetail` has no tabs today, so this is new work on that page.

**Visible to everyone, no permission logic** — gating by registration protects nothing,
because the walk-in arrives by the projected link and never sees the tab. Content adapts to
timing instead: before, during, after.

### 5. When the room is open

Open **any time before** the event — early opt-ins mean names are already on the wall when
the evening starts, and the cascade is running before anyone sits down.

**Frozen read-only** at the existing `EVENT_GRACE_HOURS` boundary
([events-service-real.ts](../../../src/app/data/events-service-real.ts):16 — value `5`, anchored to
event **start**, not end, per P494). The room is open exactly as long as the event is in
"upcoming," and closes when it drops out. One constant, one rule.

Frozen means the wall still shows who was there; nothing can be added. A room that accepts
joins forever stops recording attendance and starts recording browsing.

**No capacity cap on the room.** `max_attendees` governs RSVP only. Turning away someone
who is visibly standing in the room is not a thing software should do.

### 6. The opt-in

Everyone passes through the principle. **Default is opt-out.**

The roster is visible **before** the person answers — consistent with
[p1083](p1083_ready_live_distribution_reveal.md), which shows its
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

## Resolved Decisions

Answered by the founder 2026-08-20 during `/goalify`. These close the last open
`[FOUNDER DECISION]` markers; the build uses them verbatim.

**Gate copy** — what an unregistered or signed-out visitor sees, and the whole screen:

| Slot | Value |
|---|---|
| Heading | `This is for people coming to the event` |
| Body | `Register for the event to see the Clarity Meeting Principle and who has opted in.` |
| Primary action | `Register for this event` |
| Secondary action | `Sign in` |

Nothing else renders on that screen — no roster, no readiness, no principle text, no
count of who has opted in. *Learns nothing else about the room* is an acceptance
criterion, not a preference.

**Register path.** `Register for this event` navigates to `/events/:slug` — the existing
event page, with the RSVP button it already has. **No second RSVP-creating path is
built.** A person RSVPs there and returns. Rejected: inline RSVP on the gate — one tap
fewer, at the price of a second place that writes `event_rsvps` and has to stay in step
with the first one forever.

**Return visit — founder chose the non-recommended option, deliberately.** A registered,
signed-in person opening `/events/:slug/room` goes to `…/meet` **if they have already set
readiness for this event**, and to `…/ready` otherwise.

*"Already set" means a readiness value was committed for this member — i.e. they pressed
`Continue` at least once in this event.* It does **not** mean the slider sits somewhere:
`ready-page.tsx` cannot distinguish untouched from deliberately-left-at-Neutral (its own
`touched` flag exists for exactly that reason), so slider position is not a usable signal.
A committed row is.

The consequence, recorded because it was chosen with eyes open: the room link lands
different people on different screens, so *"open the room link and set your readiness"*
stops being true for anyone on their second visit. Readiness stays changeable from
`…/meet` by going back.

**Blind-reviewer reference.** The live `/ready` and `/meet` pages, captured at 320px,
375px and desktop at review time. The reference is the shipped product itself, so it
cannot drift from it. The reviewer receives those six images, the six matching room
images, and the empty state — and **never** the diff, the spec, or any statement of
intent.


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
- **An offensive display name reaches the projected wall.** No reliable automated filter exists —
  word-lists are evaded and false-positive on real names (Security Review → Input Validation).
  *Mitigation: none in code. **ACCEPTED** 2026-08-19 — the facilitator handles it in the room.
  The record of who was there is never deleted, so adding a host soft-hide later remains open.*
- **Roster flooding via the public join RPC** — no auth, no captcha, and the output is on a wall.
  *Mitigation: **MITIGATED** 2026-08-19 — a soft per-event row cap inside `join_event_room`.
  Chosen over ACCEPT because this failure mode is visible to the whole room at once, unlike
  `/ready`'s equivalent.*

### Non-Goals

- Do **NOT** modify standalone `/ready` or `/meet`. They stay roomless and behave exactly as
  today.
- Do **NOT** modify [p1083](p1083_ready_live_distribution_reveal.md) or its
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
  [decisions.md](../../../docs/decisions.md) 2026-08-12 records them as a carrier mechanic, not a
  filter.
- Do **NOT** link events to organizations here — that is
  [p1060](./p1060_link_events_to_organizations.md).
- Do **NOT** show opt-outs on the roster, in any form, including a count.

### Governing prior decision — do not contradict

[decisions.md](../../../docs/decisions.md) 2026-08-12 [product]: **invocation is universal.** Anyone
in the room may ask anyone. **Opt-ins owe an answer** — a number, or an explicit *"not now,
because X."* **Opt-outs owe nothing.** Nothing in this spec may restrict who can ask.

## Done-When

**Revised 2026-08-20 (revision 2).** Three items are struck rather than edited, because the
walk-in they tested no longer exists: *"join with a name only",* *"a room row is distinguishable
as walk-in vs registered",* and *"the Present toggle hides controls and enlarges the roster."*

### The gate
- [x] Someone not registered for the event, or not signed in, sees only *register for this
      event / sign in* — no roster, no principle, no readiness, nothing that leaks the room
      (UAT-1, UAT-2)
- [x] A registered, signed-in person opening `/events/:slug/room` lands on `…/ready` without
      typing a name or seeing a join form (UAT-6)
- [x] `anon` holds **no** `EXECUTE` on any of this spec's RPCs (verified 2026-08-21 by reading
      `supabase/migrations/20260819171000_p1114_event_room_rpcs.sql` and
      `20260821120000_p1114_public_roster_reversal.sql` — every `join_event_room`,
      `set_room_opt_in`, `set_room_readiness`, `get_my_room_status`, `reset_room_answer` carries
      `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated`)
- [x] No `client_secret` value is read or written anywhere in the client path (verified
      2026-08-21: only occurrences in `src/` are the type definition and the dedicated guard
      `src/tests/p1114-no-anon-surface.test.ts`, 4/4 passing)
- [x] `clarity-live-page.tsx` still imports `GuestOrAccountJoin` (verified 2026-08-21:
      `src/app/pages/clarity-live-page.tsx:81`; `src/tests/p1114-shared-component-reuse.test.tsx`
      5/5 passing)

### The two pages
- [x] `…/ready` renders the shipped `/ready` composition — one question, `SliderTrack`,
      `Continue` — with **no caption** beneath the slider (UAT-7)
- [ ] Its distribution shows this event's people only, and general `/ready` submissions never
      appear in it — **not independently re-verified 2026-08-21**; AC-to-test mapping (§ line
      ~1127) already marks the reverse direction PARTIAL/structural-only, not positively tested
- [x] `…/meet` renders the shipped certificate composition with **`Opt in` / `Opt out` in the
      fixed bottom bar** — no loose duplicate of that control anywhere on the page (UAT-9, UAT-12)
- [x] **SUPERSEDED 2026-08-21 (round 4):** replaced by "the certificate is centered via a
      3-column grid, roster as a narrow right-margin card" — see UAT-26/27. The original
      single-column "roster above the bar, below the certificate" layout no longer exists by
      design (founder-driven redesign, not a regression).
- [x] Neither page renders the marketing nav, the footer, or a Present/`Project` control (UAT-18)
- [x] The room has **no** understanding-number step and no `Start meeting` button (UAT-13)
- [x] Standalone `/ready` and `/meet` behave identically to before this spec (existing tests
      pass unmodified) (UAT-24)

### The roster and the record
- [x] **SUPERSEDED 2026-08-21 (commit `ccd8dee3`, founder-confirmed):** "shows opt-ins only, no
      opt-out displayed/counted" was deliberately reversed — a facilitator running a live,
      projected room wants "who's still undecided" visible to everyone present. The roster now
      shows all three groups (opted in / opted out / undecided) by name; RLS was widened to match
      (`20260821120000_p1114_public_roster_reversal.sql`) and the realtime canary was rewritten to
      assert the opposite invariant. Recorded in `docs/decisions.md`. Not a leak — an intentional,
      documented pivot.
- [x] Signed-in attendees render as the normal person row — full name, profile link, avatar,
      pledge ring, ear badge (UAT-11)
- [x] A second browser opting in causes the first browser's roster to update **without a reload**
      (UAT-14)
- [x] Changing an answer is possible, and the prior answer is still queryable afterwards (UAT-15)
- [ ] Each opt-in row stores how many people had already opted in at that moment — **checked
      2026-08-21, not found**: no `opted_in_count`/`position_at`-style column in
      `event_room_members` (`20260819161000_p1114_event_room_tables.sql`). Appears unbuilt, not
      just untested.
- [x] Room readiness values survive longer than 10 minutes (verified 2026-08-21: no cleanup/TTL
      job exists against `event_room_members` in any p1114 migration — an ordinary table row,
      durable by default; absence-of-cleanup check, not a positive timed test)
- [x] Opting in does **not** create an `event_rsvps` row (verified 2026-08-21: no `event_rsvps`
      reference anywhere in `set_room_opt_in`'s migration)
- [x] After `EVENT_GRACE_HOURS` past event start, the room rejects new answers and still
      displays who was there (UAT-20)
- [ ] A room with `max_attendees` already reached still accepts opt-ins — **not independently
      re-verified 2026-08-21**
- [ ] An organization member sees themselves as **not** opted in until they confirm — **not
      independently re-verified 2026-08-21**
- [x] Roster degrades to a static readable list if realtime fails — never an error state or an
      empty wall (the 30s reconciliation poll documented in UAT-15/Decision 3 is this fallback,
      confirmed working live in that check)

### The event page
- [x] The tab bar sits **above the event card**, directly under `← Events` (UAT-21)
- [x] **SUPERSEDED 2026-08-21 (round 4):** `<PracticeRooms>` moved off the Details page entirely,
      into `/meet` below the roster — reverses the round-2 "leave it where it was!" call. See
      UAT-28.
- [x] Tab selection lives in the URL; one Back press moves one tab (UAT-23)

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

**Revised 2026-08-20 (revision 2)** — the walk-in criterion is struck and replaced by its
inverse.

- [x] A registered, signed-in attendee opens the room link and is on the roster within a
      minute, without being asked anything they have already told us (UAT-6, UAT-8, UAT-12)
- [x] Someone who is not registered is told what to do about it in one screen, and learns
      nothing else about the room (UAT-1, UAT-2)
- [x] A person in the room can tell who has opted in without asking anyone (UAT-9, UAT-11)
- [x] A person who opted out at the start can opt in later in the same event, and that change
      is visible to everyone (UAT-15)
- [x] After the event, the event page still shows who was in the room (UAT-20)
- [x] **SUPERSEDED 2026-08-21 (commit `ccd8dee3`, founder-confirmed):** same reversal as the
      Done-When roster item above — a facilitator wants opted-out people visible too. Now reads
      "the roster shows every member's current answer, grouped opted in / opted out / undecided."
- [x] The two pages are recognisably the same pages as `/ready` and `/meet` — a person who has
      used one is not learning a new screen (UAT-7, UAT-9)

## UI Contract

**Approved by the founder 2026-08-20.** These are decided copy, not placeholders. The build must use
them verbatim. Any string NOT listed here is still `[FOUNDER DECISION]` and must render as a visible
`PLACEHOLDER: ...` marker — never invented, never blank.

| Element | Value | Note |
|---|---|---|
| Event-page tab | `Clarity Meeting Principle` | Second tab; first is `Details`. Selection lives in the URL so back works. |
| Page heading | `Review the Clarity Meeting Principle` | Replaces the rejected "Join the room" — the person is reviewing terms, not entering a place. |
| Readiness question | `How up for thinking are you right now?` | Reused verbatim from the shipped `/ready`, with its `Keep it light / Neutral / Go deep` anchors. |
| Roster heading | `Who opted in` | Deliberately **not** "who's here": opt-outs are never shown, so a presence claim would be false. |
| Opt-in buttons | `Opt in` / `Opt out` | Chosen over `Accept`/`Decline`, which read as a legal form. |
| Member pre-fill line | `Your organization runs on the Clarity Organization Terms. This is a separate yes.` | Shows the standing commitment as context; must not read as already opted in (§9). |
| Zero state | `No one has opted in yet.` | Also what a projector shows before anyone arrives. |
| Frozen notice | `This has closed. Here's who opted in.` | Frozen means still visible, not gone. |
| ~~Readiness caption~~ | **RETIRED (rev 2)** | Founder-annotated *delete*. The marks sit on the visitor's own track and need no caption. |
| ~~Present toggle~~ | **RETIRED (rev 2)** | Founder-annotated *delete*. Projection leaves this surface entirely. |
| ~~Guest join form~~ | **RETIRED (rev 2)** | The room no longer has a guest door. `GuestOrAccountJoin` stays in the codebase as `/live`'s form. |
| Gate heading | `[FOUNDER DECISION]` → renders as `PLACEHOLDER: gate heading` | New in rev 2. What an unregistered visitor is told. |
| Gate body | `[FOUNDER DECISION]` → renders as `PLACEHOLDER: gate body` | Must offer both: register for this event, and sign in if already registered. |
| Gate actions | `[FOUNDER DECISION]` → renders as `PLACEHOLDER: gate primary` / `PLACEHOLDER: gate secondary` | Two routes out of one screen. |

## Related

- [p1055](../../p1055_norm_measurement_instrument.md) — the CMP Point Set; this spec records the
  opt-in that its flow step 1 assumes
- [p1083](p1083_ready_live_distribution_reveal.md) — general `/ready`
  distribution, shipped 2026-08-16; deliberately untouched
- [p1060](./p1060_link_events_to_organizations.md) — events belong to an organization; the
  reach count this spec's data eventually feeds
- [decisions.md](../../../docs/decisions.md) 2026-08-12 — universal invocation
- [clarity-practice-event.md](../../../docs/events/clarity-practice-event.md):95 — run-of-show
  blocks 2, 3 and 6
- [facilitator-guide.md](../../../docs/facilitator-guide.md):406 — the comprehension challenge; the
  bell is a docs-only change filed there, **not** part of this spec

## Technical Architecture

### Technical Analysis

**Current code state:**

- `events/index.tsx`:54-63 nests three routes under `:slug` today (`edit`, `confirm`, plus the
  detail route itself). No `room`/`ready`/`meet` children exist.
- `EventDetail.tsx` has no tab component. It renders one scrolling column: hero → sticky RSVP
  bar → host card → Participants card → `PracticeRooms` (P406, gated `isLoggedIn &&`, EventDetail.tsx:633-639).
  Redirect-to-signup for anonymous RSVP is EventDetail.tsx:169, inside `handleRsvp` — this path is
  untouched; the room never calls it.
- `events-service-real.ts:16` exports `EVENT_GRACE_HOURS = 5` and `getGraceCutoff()` (line 18-20),
  anchored to `datetime` (event start), consumed across the app for upcoming/past classification.
  Nothing in this spec may fork that constant's TS-side meaning.
- `events` table (`20260118_create_events.sql:7-31`): `datetime`, `max_attendees` (nullable =
  unlimited), `status` (`upcoming`/`completed`/`cancelled`), `host_id`. No room-related columns.
- `event_rsvps` (`20260118_create_events.sql:57-71`): `UNIQUE(event_id, profile_id)`,
  `profile_id NOT NULL` — account-only by construction, RLS ties INSERT/DELETE to `auth.uid() =
  profile_id`. Confirmed untouched by this design; the room table has no FK to it.
- `ready_submissions` (`20260816120000_p1083_ready_submissions.sql`): anonymous, no owner column,
  10-minute RLS-filtered SELECT window, `pg_cron` hard-delete, column-level `INSERT (value)`
  grant only (no client-writable `created_at`). Confirmed: room readiness does not touch this
  table — it is a distinct table with no expiry.
- `clarity_sessions` guest-join RPCs (`claim_joiner_seat`/`release_joiner_seat`,
  `20260812150000_p1053_joiner_seat_claim_rpcs.sql`, hardened by
  `20260812160000_p1053_revoke_client_joiner_writes.sql`): the established pattern in this repo
  for **an anonymous actor mutating a row it doesn't own via `auth.uid()`** — a bearer capability
  (there, the 6-char room `code`) is validated *inside* a `SECURITY DEFINER` RPC, and the columns
  the RPC writes are revoked from direct client `UPDATE` so the RPC is the only path. This spec's
  Decision 1 is the same idiom applied to a new bearer secret.
- `clarity_sessions.code` confidentiality (`20260817140001_p1057_revoke_code_select.sql`, decision
  log 2026-08-13 "RLS row-level policies... anon subscriber to a null-target room receives
  **exactly the granted columns**"): confirms, by measurement on this project (not vendor docs),
  that Supabase Realtime `postgres_changes` enforces both column-level grants and row-level RLS
  for the subscribing role. This is load-bearing for Decision 2 below.
- Decision log 2026-08-12 "Zero RLS policies is not locked down" and 2026-08-13 P1057 entry:
  both confirm row-level RLS gates `postgres_changes` delivery, and that publication membership
  (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`) is a separate, easily-missed surface.

**Reuse inventory:**

| Need | Reused from | File |
|---|---|---|
| Guest name-only join, pre-filled when logged in | P396 two-state guest pattern | `clarity-live-page.tsx`:3318 (name form, "or join as guest"), :4015 (auto-join `useEffect` for authenticated users) |
| Local persistence across refresh | `saveSessionToStorage` idiom | `clarity-live-page.tsx`:1135 (adapted: `localStorage`, not the per-tab `sessionStorage` used there — an evening-long, multi-tab room needs to survive a fresh tab, not just a reload) |
| Bearer-capability RPC pattern for an anon actor mutating its own row | `claim_joiner_seat`/`release_joiner_seat` | `20260812150000_p1053_joiner_seat_claim_rpcs.sql`, `20260812160000_p1053_revoke_client_joiner_writes.sql` |
| Column-level confidentiality (secret must never be client-SELECT-able) | `clarity_sessions.code` REVOKE | `20260817140001_p1057_revoke_code_select.sql` |
| `localStorage` key naming (`cp.<feature>.<version>`) | `meeting-terms-page.tsx`:59 | `STORAGE_KEY = "cp.meeting-terms.v1"` |
| Tab component + pattern | `org-page.tsx`:32,53,280-315 (`OrgTab` type, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`) | `org-page.tsx` |
| Live roster updates | `postgres_changes` channel-per-entity | `api.ts` (`.channel(`clarity_session:${id}`)`:1434, `.channel(`chat_messages:${id}`)`:1810) |
| Realtime table registration | `ALTER PUBLICATION supabase_realtime ADD TABLE` | `20260403224331_p581_clarity_letters.sql`:614-626 |
| Degrade-on-failure polling | `PracticeRooms` 5s `setInterval` poll | `PracticeRooms.tsx`:15,38-43 |
| Event capacity / grace-window helpers | `eventsService.isEventFull`, `EVENT_GRACE_HOURS` | `events-service-real.ts` — **not called** by the room path (Decision 4, Non-Goal: no capacity check) |
| Service singleton for event-scoped data access | `eventsService.getPracticeRooms`/`openPracticeRoom` | `events-service-real.ts`:822,879 |

**Dependencies:** no new npm packages. `@supabase/supabase-js` realtime client, `Tabs` primitive,
and `sonner` toasts are already in the tree.

### Architecture Decisions

**Decision 1 — Anonymous identity: server-minted bearer secret + `SECURITY DEFINER` RPCs, not RLS-visible row ownership**

*Chosen:* `join_event_room(p_event_id uuid, p_display_name text)` is the only INSERT path. It runs
`SECURITY DEFINER`, derives `profile_id` from `auth.uid()` (never from a client argument — see
Security note below), mints `client_secret uuid DEFAULT gen_random_uuid()`, and returns the new
row including the secret. Every subsequent mutation —
`set_room_opt_in(p_member_id, p_secret, p_opted_in)`,
`set_room_readiness(p_member_id, p_secret, p_value)`, and the self-read
`get_my_room_status(p_member_id, p_secret)` — is its own `SECURITY DEFINER` RPC that re-validates
`p_secret = client_secret FOR that member_id` before touching the row. Direct client
`UPDATE`/`INSERT` on `event_room_members` is never granted to `anon`/`authenticated` — the RPCs
are the only path, exactly as `claim_joiner_seat` is the only path onto a `clarity_sessions` seat.
The secret is stored client-side in `localStorage` alongside `member_id` and never re-derived from
anything guessable (name, event id, IP).

*Rationale:* Reuses `claim_joiner_seat`'s exact shape (reuse inventory row 3) instead of inventing
a new anonymous-auth primitive. `SECURITY DEFINER` + column-revoke is the only pattern in this
repo proven to survive an adversarial pass (P1053's two-migration split exists because the RPC
alone, without the revoke, is "decorative" — decision log 2026-08-12).

*Trade-off:* A leaked `localStorage` value on a shared/projected device lets someone else flip
that person's opt-in. Accepted — same shape as `clarity_sessions`' code-as-bearer-capability, and
the room is a room full of people who can see the wall regardless.

*Alternative rejected:* Supabase anonymous auth (`signInAnonymously`) — would mint a real
`auth.uid()` per guest, letting standard `auth.uid() = owner_column` RLS do the work. Rejected: it
creates a Supabase Auth user per walk-in (session rows, refresh tokens, a new identity class this
codebase has never had for guests), where P396/P1053 already solved "anonymous actor, own row,
no account" without one. Introducing a second anonymous-identity mechanism alongside the existing
bearer-capability one is the kind of two-pattern drift the reuse-inventory check exists to catch.

**Decision 2 — Opt-outs invisible to everyone but the answering device: RLS SELECT filter + a bypassing self-read RPC, not client-side hiding**

*Chosen:* `event_room_members.opted_in` is nullable (`NULL` = hasn't answered yet, distinct from
`false` = explicitly opted out — see Decision 6's state list). The **only** SELECT policy granted
to `anon`/`authenticated` is `USING (opted_in = true)`. This is the direct-REST policy, and it is
**assumed but NOT VERIFIED** to be the realtime `postgres_changes` filter as well.

> **`VERIFIED 2026-08-19` — measured, no longer assumed. Row-level RLS DOES filter Realtime.**
> `e2e/integration/p1114-realtime-payload.spec.ts` ran green three consecutive times with **no
> retries and no flakes**, in both directions: an `opted_in = false` row never appeared in any
> received payload, and a `true → false` UPDATE never delivered the new state. Critically, the
> **live control fired** — the opted-in row in the same channel, poked identically, DID receive
> payloads, so the green is not the vacuous kind where silence reads as an all-clear.
> **Decision 2 stands, and `event_room_members` correctly stays in the `supabase_realtime`
> publication.** The P1048 fallback (drop from publication, poll-only roster) is NOT needed.
>
> **This extends the repo's knowledge, and belongs in `decisions.md` at `/kdd`:**
> [decisions.md](../../../docs/decisions.md) 2026-08-17 [technical] (P1057) measured only the
> **column**-level case and explicitly declined to generalise — *"This does NOT generalise to
> row-level questions."* That row-level gap is now measured for this project. It remains a
> measurement, not a vendor guarantee: any future change to this table's SELECT policy silently
> changes what Realtime delivers, so the canary must be kept in step with the policy — exactly
> the standing rule P1057 set for the grant.
>
> *Historical — the assumption as it stood before the canary ran:*
> **`UNVERIFIED` — this is the load-bearing assumption of the whole opt-out guarantee.**
> [decisions.md](../../../docs/decisions.md) **2026-08-17** [technical] (P1057) measured that Realtime
> filters payloads by **column-level** SELECT privilege, and closes with: *"This does NOT
> generalise to row-level questions."* This spec needs the **row-level** case, which nobody has
> measured. The neighbouring 2026-08-13 [technical] entries are about feed tag filters and
> zero-position Points — they contain no realtime finding; an earlier draft of this section cited
> them in error. Note also that the prior decision on this surface (P1048) distrusted the vendor
> guarantee enough to remove a table from the publication rather than rely on it.
> **Falsifier — must run at `/generate-tests` before any of this ships:** a WebSocket canary,
> modelled on `e2e/integration/p1057-realtime-payload.spec.ts` (the repo's only WebSocket test),
> subscribing as anon and asserting that (a) an `opted_in = false` row never appears in a received
> payload, and (b) an UPDATE flipping a row from `true` to `false` does not deliver the new state.
> The canary must carry a control that FAILS on an empty payload — per that same P1057 entry,
> silence must never read as an all-clear. **If the canary shows row-level filtering does not
> hold, Decision 2 is void** and the fallback is P1048's move: keep `event_room_members` out of
> the `supabase_realtime` publication entirely and drive the roster from the Decision 3
> reconciliation poll alone.

An opt-out or not-yet-answered row is invisible over the **REST** surface to every client holding
only the anon key, which is every client in this feature (no service-role key ships to the browser). The room's own
device reads its own row — including an opt-out — through `get_my_room_status(member_id, secret)`,
which is `SECURITY DEFINER` and therefore bypasses the SELECT policy entirely once the secret
checks out. `client_secret` itself has `SELECT` revoked from `anon`/`authenticated` at the column
level (same idiom as `clarity_sessions.code`), so even an opted-in row visible on the public roster
never exposes the value that would let someone else impersonate that row.

*Rationale:* Satisfies "opt-ins are shown, opt-outs are never shown" as a **data-layer** guarantee
— true for anyone hitting the table directly with the anon key, not just true of what the roster
component chooses to render — while still giving the participant's own device its own true state,
per UX Notes ("the participant's own device shows their current state"). This is the
row-visible-to-owner-only-via-a-separate-channel shape P1057 verified for **columns**, extended
here to **rows** — an extension P1057 explicitly declines to make, hence the `UNVERIFIED` block
above.

*Trade-off:* Two read paths (public roster query vs. self-status RPC) to keep in sync client-side.
Mitigated by keeping them structurally identical — both return the same row shape.

*Alternative rejected:* A `WITH CHECK`/`USING` clause parameterized on a request header
(`current_setting('request.header.x-room-secret', true)`) so the *table* SELECT policy itself
could authorize the owner's read, avoiding a second RPC. Rejected: no precedent in this repo for
trusting a client-supplied request header inside RLS (every anon-identity check found in the
reuse inventory routes through a `SECURITY DEFINER` function argument, never a raw header), and it
would make every table SELECT (including PostgREST's automatic realtime-relevant reads) implicitly
depend on a header PostgREST doesn't document as stable across client versions.

**Decision 3 — Realtime: `postgres_changes` on `event_room_members`, plus a reconciliation poll that also serves as the degrade path**

*Chosen:* One channel, `event_room:${eventId}`, subscribed with a `postgres_changes` `filter:
event_id=eq.${eventId}` against `event_room_members`, added to `supabase_realtime` (reuse
inventory row "Realtime table registration"). `event_room_answers` (the history table, Decision 6)
is **not** added to the publication — nothing client-side ever reads it. On top of the realtime
subscription, the roster component runs a low-frequency reconciliation fetch (30s, reusing
`PracticeRooms`' `setInterval` shape) that re-runs the same SELECT the initial load used. Two
purposes, one mechanism: (a) it is the "degrade to a readable static list" path required by the
spec's Risks and Done-When — if the channel never reaches `SUBSCRIBED` or drops to
`CHANNEL_ERROR`/`TIMED_OUT`, the roster is still current within 30s and never shows an error or
empty state on a transient failure; (b) it closes a specific, verified-nowhere gap: Postgres
logical replication does not emit a client-visible event when an `UPDATE` moves a row from
matching the SELECT policy to *not* matching it (an opt-in flipping back to opt-out). Realtime
correctly pushes the opt-out→opt-in direction the AC actually tests (new row state matches the
policy → delivered), but the reverse direction — required by "opt-outs are never shown" in general,
even though no Done-When item exercises it — has no proven live-removal signal in this repo (the
P1057 precedent measured column payload shape on a matching row, not a policy-driven disappearance).
The poll is the backstop for that untested case rather than a claimed fix — it bounds staleness to
30s instead of asserting the removal is instant. Flagging this as **UNTESTED**, per epistemic gate
7: the reverse-direction realtime behavior should be measured with a websocket-opening test
(`e2e/integration/p1057-realtime-payload.spec.ts` is the precedent for "the REST suite structurally
cannot see this") during `/generate-tests`, not assumed from Postgres/Supabase documentation.

*Rationale:* Reuses two already-proven patterns (channel-per-entity subscription, `PracticeRooms`
polling) instead of introducing a new sync primitive, and gets the degrade-path requirement "for
free" from the same poll that plugs the known RLS-realtime gap.

*Trade-off:* Up to 30s staleness for the flip-back-to-opt-out case, and one extra request per
30s per open roster (single event, low concurrency — the same order of magnitude as
`PracticeRooms`' existing 5s poll, which runs continuously today with no reported load issue).

*Alternative rejected:* Polling only, no realtime channel. Rejected — fails the Done-When
requirement for sub-poll-interval, no-reload updates ("a second browser opting in causes the
first browser's roster to update without a reload") is explicitly about not waiting for a poll
tick; 30s is acceptable as a *backstop*, not as the primary update path.

**Decision 4 — Freeze boundary: server-enforced in SQL with a hardcoded twin of `EVENT_GRACE_HOURS`, guarded by a cross-reference comment and a canary test; client-side reuses the existing exported constant for display only**

*Chosen:* Every mutating RPC (`join_event_room`, `set_room_opt_in`, `set_room_readiness`) re-reads
`events.datetime` for the target event and rejects (`42501`) if
`now() > datetime + interval '5 hours'`. The `5` is a second literal, declared once as a local
`CONSTANT` inside each RPC with a comment: *"MUST equal `EVENT_GRACE_HOURS` in
`events-service-real.ts:16` (P494) — changing one without the other desyncs client-displayed room
state from server-enforced room state."* This is the enforcement boundary the spec's Done-When
requires ("the room rejects new joins and answer changes") — SELECT/roster reads carry no time
gate, so "still displays who was there" holds trivially. Client-side, the room page **imports the
existing exported `EVENT_GRACE_HOURS`** (no new TS constant) purely to choose which of the three
UX-Notes time states (before/during/after) to render; a client/server mismatch there is a cosmetic
UI-state error, never a security gap, because the RPC is the authoritative gate regardless of what
the UI believed.

*Rationale:* CLAUDE.md's Reference Over Duplication rule is written for one language/runtime; a
Postgres function cannot `import` a Vite-bundled TS constant, so *some* duplication across the
SQL/TS boundary is structurally unavoidable here — the choice is between silent duplication and
loud, tested duplication. This is loud: the cross-reference comment plus a `/generate-tests`
canary (assert `EVENT_GRACE_HOURS === 5` with a comment naming the SQL twin, so a future change to
either side without the other fails a test instead of silently diverging) is the same shape as
this repo's other cross-boundary constant risk (P1057's payload canary exists because a grant
change silently changes a realtime payload).

*Trade-off:* Two source locations for one number, mitigated by the test rather than eliminated.

*Alternative rejected:* Move `EVENT_GRACE_HOURS` itself into the database (a `get_event_grace_hours()`
RPC or config table) and have the TS layer fetch it. Rejected as disproportionate to this spec's
**medium** blast radius: `EVENT_GRACE_HOURS` is consumed across the whole app's upcoming/past
classification (P494), not just this room; migrating its source of truth is a change to shipped,
unrelated behavior this spec's Non-Goals explicitly forbid touching, for the sake of one new
feature's constant-duplication aesthetics.

**Decision 5 — `event_sub_rooms` and `event_practice_rooms`: one is genuinely dead, one is very much alive; the new table coexists with both and changes neither**

*Correcting the premise this run was briefed on:* `grep -rln "event_practice_rooms" src/` returns
`events-service-real.ts` (`getPracticeRooms`/`openPracticeRoom`, lines 822-946) — and
`EventDetail.tsx` imports and renders `PracticeRooms.tsx`, gated `isLoggedIn &&`
(EventDetail.tsx:633-639), a P406 peer-matching lobby that opens 1:1 `clarity_sessions` from the
event page. It is live, shipped, and unrelated in concept to room presence/opt-in. `event_sub_rooms`
(P124), by contrast, has zero `src/` references — only migration files, `docs/decisions.md`,
`docs/technical/database.md`, and an **archived** spec (`features/archive/p124_event_rooms.md`) —
confirming it is genuinely orphaned.

*Chosen:* The new `event_room_members`/`event_room_answers` tables **coexist** with both. No
change to `event_practice_rooms` (it solves 1:1 pairing, not whole-room presence — different job).
`event_sub_rooms` is left as-is; **dropping it is out of scope for this spec** and flagged here
only as an observation for a separate cleanup decision, not proposed — removing a table nothing
in `src/` touches is still an ALWAYS-ASK action per CLAUDE.md (shared-value removal), and this
spec's Appetite is additive-only.

**Decision 6 — Two new tables, not one: a mutable current-state row plus an append-only answer log — flagged deviation from Appetite's "One new table"**

*Chosen:* `event_room_members` (current state, one row per person per event, mutated in place by
the RPCs above: `event_id`, `profile_id NULLABLE`, `display_name`, `client_secret` (SELECT-revoked),
`opted_in NULLABLE boolean`, `readiness_value NULLABLE smallint`, `joined_at`). `event_room_answers`
(append-only history, service-role-only — no client SELECT policy, not in the realtime publication:
`room_member_id`, `opted_in`, `cascade_count`, `answered_at`). `set_room_opt_in` does both in one
transaction: compute `cascade_count := count(*) FROM event_room_members WHERE event_id = … AND
opted_in = true` (the count **before** applying this answer — "how many had already opted in at
that moment"), `INSERT` the answer row, then `UPDATE event_room_members SET opted_in = …`.

*Rationale — why not the one-table design the Appetite section describes:* Two single-table shapes
were considered and rejected as **incorrect**, not just inconvenient, against "opt-outs are never
shown":
1. *Append-only single table, roster = latest row per person.* A raw `SELECT ... WHERE opted_in =
   true` (which is what an RLS `USING` clause and a realtime filter both must be, since neither can
   express "and this is the newest row for this person") would still return a person's **stale**
   opted-in row after they later opted out — the row satisfying the policy is the old one, not the
   current one. This directly violates "opt-outs owe nothing... never shown."
2. *Single table with `UPDATE`-in-place plus an `is_current` flag flipped on the superseded row.*
   Closes gap 1, but reduces to the same table Decision 3 already uses for current state — the
   append-only rows underneath it are exactly `event_room_answers` in disguise, minus the ability
   to scope grants/publication membership independently. Splitting them into two physical tables
   makes that scoping explicit (history is never in the realtime publication or the anon SELECT
   grant) rather than relying on every future query remembering to add `AND is_current = true`.

The Appetite's "one new table" is a deviation this design makes deliberately: `event_room_answers`
carries **zero product-facing surface** (no RLS SELECT grant to any client role, not in
`supabase_realtime`, queried only by service-role for the research question the spec names in §7)
— it exists purely to make "full history is kept" true without also making "opt-outs are never
shown" false. The roster/realtime/RLS complexity the founder was scoping against in Appetite is
entirely on `event_room_members`; `event_room_answers` adds storage and a migration, not surface.

*Trade-off:* One extra table and one extra `INSERT` per opt-in-answer RPC call. No added client
complexity — the client never queries `event_room_answers`.

*Alternative rejected:* Store `cascade_count` and history as a JSONB array column on
`event_room_members` (e.g. `answer_history jsonb[]`). Rejected: unindexable for the research
question ("do people who arrive more ready opt in more?"), and every `UPDATE` would need to
read-modify-write the array under the same row lock `set_room_opt_in` already needs for the
cascade count — no complexity saved over a second table, while losing normal SQL query access to
history.

**Decision 7 — Routes: one shared page component mounted at three paths, not three components**

*Chosen:* `EventRoomPage.tsx` (new), taking a `focus: 'join' | 'ready' | 'principle'` prop derived
from which of the three new `<Route>` entries matched (`room` → `'join'`, `ready` → `'ready'`,
`meet` → `'principle'`), added alongside the existing `:slug/edit` and `:slug/confirm` children in
`events/index.tsx`. Internally the component always renders the full state machine (join → ready →
principle, roster beside/below throughout per UX Notes) and uses `focus` only to decide initial
scroll position / which section is expanded first — never to omit the roster, per spec §3 ("the
roster must be visible the whole time — two pages would render it twice or drop it").

*Rationale:* Directly implements spec §3's stated reasoning; reuses inventory's routing pattern
(`events/index.tsx`'s flat `<Route path=":slug/...">` list) with no new nesting scheme.

**Decision 8 — Local identity persistence: a new localStorage key, not reuse of the `/live` session-storage keys**

*Chosen:* `cp.event-room.<eventId>.v1` in `localStorage` (not `sessionStorage`), holding
`{ memberId, clientSecret, displayName }`. On mount, `EventRoomPage` checks this key first; if
present, calls `get_my_room_status(memberId, secret)` to hydrate and skips the join screen
("passes straight through if already identified," spec §3). If absent and `auth.uid()` exists,
auto-joins via `join_event_room` using the profile's name (mirrors the P396/P406 auto-join
`useEffect` at `clarity-live-page.tsx`:4015). If absent and anonymous, shows the guest name field.

*Rationale:* `/live`'s keys are deliberately per-tab `sessionStorage` (reuse-inventory note, "per-tab
using sessionStorage instead of localStorage" — api.ts:97) because a live 1:1 session is scoped to
one browser tab's conversation. A room spans an entire evening and is explicitly expected to be
open in multiple tabs/devices at once (a phone and a projector, per §8's Present toggle) and to
survive a refresh mid-event (spec §2: "a refresh does not eject someone mid-event") — `localStorage`
is the correct persistence tier for that lifetime, and reusing the *pattern* (not the *key*) from
`meeting-terms-page.tsx`'s `cp.<feature>.<version>` naming keeps the convention consistent without
colliding with an unrelated feature's key.

### Security Review

**RLS Policies:**
- ⚠️ **No identity exists to bind an UPDATE to.** The person is nickname-only — there is no `auth.uid()` to write `WITH CHECK (auth.uid() = ...)` against. A naive `FOR UPDATE USING (true)` (or any policy that isn't keyed to something only the original browser holds) lets anyone with the anon key edit or mass-edit every row in the roster: flip other people's opt-in answers, forge cascade counters, rewrite display names. **Required handling:** do not give clients a direct `UPDATE` policy on this table at all — same shape as `ready_submissions` (`supabase/migrations/20260816120000_p1083_ready_submissions.sql:55`, "No UPDATE/DELETE policy for clients"). Route every state change (opt-in change, and the join-write itself) through a `SECURITY DEFINER` RPC. See Authorization below for the token mechanism the RPC must check.
- ⚠️ **A single public `SELECT ... USING (true)` cannot satisfy "opt-ins shown, opt-outs never shown."** RLS is table-and-role-wide — it cannot know "this browser is the one that owns this specific opted-out row" without an identity signal, and it cannot selectively redact one column per row for different viewers of the same query. **Required handling:** the base table's client-facing `SELECT` policy (and therefore anything `postgres_changes` broadcasts — see Data Protection) must only ever return rows/values consistent with "currently opted in" — i.e. filter `WHERE current_opt_in = true` at the RLS/view layer, not in the frontend. Serve the public roster through a restricted view or a policy that structurally cannot emit an opted-out state. The person's own current state (which legitimately can be opted-out) must come from a **different** channel that doesn't reuse this public-safe read path — see Authorization.
- ⚠️ **The freeze boundary must be enforced in SQL, not only in the client.** `EVENT_GRACE_HOURS` (`src/app/data/events-service-real.ts:16`, value `5`) is a TypeScript constant; nothing stops a client from calling the INSERT/RPC endpoint directly with the UI hidden. **Required handling:** the `INSERT` policy (for joining) and the opt-in-change RPC must independently compute `now() < events.datetime + interval '5 hours'` by joining to `events.datetime` server-side, duplicating the same 5-hour constant in SQL with a comment cross-referencing `events-service-real.ts:16` (same pattern the codebase already uses for cross-file constant duplication elsewhere). Flag in the migration that if `EVENT_GRACE_HOURS` ever changes, this SQL literal needs a matching migration.
- ⚠️ **Column-level grants are required, not just row-level policy** — same finding class as the p1083 adversarial review referenced in that migration's comments (`20260816120000_p1083_ready_submissions.sql:34-44`). A `WITH CHECK (true)` INSERT policy says nothing about which *columns* a client may set. Required handling: `REVOKE INSERT ... FROM anon, authenticated` then `GRANT INSERT (event_id, display_name, profile_id, readiness_value) ON <table> TO anon, authenticated` — explicitly excluding the cascade counter, the current opt-in state/history columns, and any client-secret/edit-token column (see Authorization) from the client-writable list. Those must only ever be set by `DEFAULT` or by the `SECURITY DEFINER` RPC.

**Authentication:**
- ✅ Reusing the `/live` two-state guest pattern (name-only, no email, no profile row created) is consistent with how this codebase already treats anonymous participants (P396). No new authentication primitive is being invented, which is good — fewer places to get it wrong.
- ⚠️ **"No auth identity" is the root cause of findings (a) and (b) above, and needs one explicit mechanism, not an implicit one.** Required handling — a row-secret pattern: on join/INSERT, the row gets a server-generated, non-INSERT-able secret column (`DEFAULT gen_random_uuid()`, never included in the `GRANT INSERT (...)` column list from the RLS finding above, so a client cannot set it to a guessed or predictable value). Return it to the calling browser via `RETURNING` and persist it client-side (localStorage, matching the existing "name persists locally" pattern already planned in the spec's §2). Never put this token in a URL or query string (browser history, referrer leakage, screenshots of a projected room) — POST body / RPC argument only.
- ⚠️ **The secret column must never be client-readable.** Required handling: `REVOKE SELECT` on that column from `anon, authenticated` (or omit it from any view/`select=` the client ever issues) — otherwise anyone reading the roster table can lift every row's edit token and impersonate every attendee. This is a distinct grant from the INSERT-column restriction above; both are needed.
- ⚠️ **Losing the token = losing the ability to change your answer**, and it's the same failure mode the spec already accepts for the `/live` guest pattern (cleared storage, second device). Not a gap to close — just confirm the UI's "change your answer" affordance degrades to "rejoin with a new name" rather than erroring, consistent with the room's own no-account model.

**Authorization:**
- ⚠️ **Concrete mechanism required for "change my opt-in answer":** a `SECURITY DEFINER` Postgres function, e.g. `set_room_opt_in(room_row_id uuid, edit_token uuid, new_state boolean)`, callable via RPC by `anon`/`authenticated`, that: (1) looks up the row by id, (2) checks `edit_token` matches the stored secret column (constant-time-ish via normal `=` is acceptable here — this is not a password, and the token space is a full UUID, not brute-forceable at any meaningful rate through PostgREST/RPC), (3) re-checks the freeze boundary server-side against `events.datetime`, (4) computes the cascade counter itself (see below) and (5) inserts a new history row / updates current-state — bypassing RLS internally since it's `SECURITY DEFINER`, but only ever touching the one row the caller proved ownership of. **Failure modes to accept, not fix:** a stolen/leaked token (e.g. shared device at the venue) lets someone else flip that one person's answer — bounded blast radius (one row), and matches the "same human on two devices, no dedupe" risk the spec already accepts. Token has no expiry tied to the freeze boundary check itself — expiry is enforced by the boundary check on every call, not by the token going stale.
- ⚠️ **Cascade counter (item c) — must be computed inside that same `SECURITY DEFINER` function, at the moment of insert, as `SELECT count(*) FROM <table> WHERE event_id = ... AND current_opt_in = true`, never accepted as a function/RPC argument.** If it's ever accepted as client input (directly or indirectly, e.g. a client-supplied "index" the server trusts), the measurement is worthless — anyone can set it to 0 or to a large number to fabricate cascade pressure. This is the single most important integrity requirement in the spec and needs its own test: assert that submitting a spoofed value in the request body is silently ignored / rejected, not honored.
- ⚠️ **Roster visibility is explicitly "no permission logic" per the spec (§4)** — confirm the Room tab and `/events/:slug/room|ready|meet` routes are unauthenticated-readable by design (matches the walk-in-via-projected-link requirement) and that no route guard accidentally requires login, which would contradict Done-When item 1.
- ⚠️ **`max_attendees` / capacity must not be checked anywhere in the room's INSERT path** — this is a spec Non-Goal, but worth a build-sequence note since `event_rsvps`' sibling table has capacity logic nearby (`EventDetail.tsx` `isFull` check) that could get copy-pasted into the new join flow by mistake.

**Input Validation:**
- ⚠️ **Display name (item d):** add a DB `CHECK` constraint on length (e.g. 1–60 chars after trim) and reject empty/whitespace-only names — mirrors the `value BETWEEN 0 AND 10` pattern already used in `ready_submissions`. Strip or reject Unicode control characters, zero-width characters, and bidi/RTL-override code points (`U+200E`–`U+200F`, `U+202A`–`U+202E`, etc.) — these are a real impersonation/display-corruption vector on a projected wall (e.g. an RTL override can visually reverse a name, or a zero-width character can make two visually-identical names hash as distinct rows). Required handling: normalize/validate server-side (a Postgres `CHECK` using a regex on allowed codepoint ranges, or a trigger) — do not rely on client-side validation alone, since the RPC/INSERT endpoint is reachable directly.
- ⚠️ **Impersonation via display name (e.g. "Slava (host)"):** free text cannot be trusted for identity claims. Required handling: any "host" badge or similar UI marker must be derived from the actual `host_id`/`profile_id` match against the event's real host column — never from string content of `display_name`. Confirm the Architect's build sequence does not parse or pattern-match display names for role inference.
- ✅ **XSS:** nothing in the spec calls for `dangerouslySetInnerHTML`, markdown rendering, or HTML injection into the roster/projector view — plain text display names render through React's default escaping. Required handling is only a confirmation step at implementation time: the roster and Present-mode components must render `display_name` as a plain text child (`{name}`), not via any raw-HTML path, and this should be called out explicitly in the code review checklist for this feature.
- ⚠️ **Profanity/abuse on a projected wall** has no reliable automated filter (word-list filters are trivially evaded and produce false positives on legitimate names). Required handling: this needs an explicit product decision the spec doesn't currently make — at minimum, give the facilitator/host a way to hide/remove a row from the projected view without deleting the underlying data (soft-hide flag, host-only mutation path). Flag this to the Architect as an open decision, not an implicit "someone will handle it live."
- ⚠️ **Rate limiting / roster flooding:** unlike `ready_submissions` (low-stakes, low-visibility, explicitly accepted no-rate-limit risk), this table's output is **projected live in front of a room** — a flood of junk rows is a more visible, more embarrassing failure mode than P1083's. No infra-level rate limiting exists in this repo today. Required handling: flag this as an explicit ACCEPT or MITIGATE decision for the founder (per the spec's own Risks convention of labeling each risk) rather than leaving it implicit — this spec currently doesn't mention it at all. Minimum viable mitigation if MITIGATE is chosen: a per-`(event_id)` row-count sanity check inside the join RPC (soft cap, e.g. reject/flag past some large N) — cheap, doesn't require new infra, doesn't block legitimate walk-ins.

**Data Protection:**
- ⚠️ **Realtime broadcasts bypass frontend "hide opt-outs" logic entirely (item b, continued).** This codebase already uses `postgres_changes` subscriptions elsewhere (`src/app/data/api.ts`, multiple channels) — the pattern here would be identical: any row change reaches every subscribed browser's payload, regardless of what the UI chooses to render. If the RLS `SELECT` policy is `USING (true)`, `postgres_changes` will broadcast full opt-out rows to every open browser tab, and a user could read them straight out of the network payload even if the rendered UI hides them. **Required handling:** this is the same fix as the RLS finding above, stated again because it's the concrete mechanism that makes the fix necessary, not optional — the restrictive `SELECT` policy (`current_opt_in = true` only) is what both the direct-query path and the realtime broadcast path share, so fixing it once at the RLS layer closes both. Verify this with a build-sequence test: subscribe to the channel as an anonymous client and assert an opt-out row/transition never appears in a received payload.
- ⚠️ **The participant's own opt-out state, shown only on their own device, must be sourced client-side (from the RPC's return value / cached local state after their own write), not by loosening the shared table/realtime read path to include it.** Loosening the read path to solve this would reopen the exact leak just closed. Required handling: state this explicitly in the Architect's design so it isn't "fixed" later by relaxing the RLS policy.
- ⚠️ **`profile_id` linkage:** confirm any query/view that joins the room table to `profiles` for the "registered vs walk-in" badge (spec §1) selects only columns already public on that user's profile page today (display name, avatar) and never joins to anything private (email, auth metadata). Given profiles are already public-by-design in this app, this is likely fine, but it should be verified rather than assumed — check `docs/technical/database.md` for what `profiles` currently exposes via existing public policies before writing the join.
- ✅ No email or other PII beyond a free-text nickname is collected by this feature, consistent with the spec's explicit "no email collected, no profile created" for guests.

**AI Prompt Security:**
- Not applicable — the spec sends no data into an LLM; it's a presence/roster/opt-in table with no AI-facing surface.

### Implementation Approach

#### Build Sequence

1. Migration: `event_room_members` + `event_room_answers` tables, RLS (SELECT `opted_in = true`
   only; no client INSERT/UPDATE grant on either table), column-level `client_secret` SELECT
   revoke, partial unique index `(event_id, profile_id) WHERE profile_id IS NOT NULL`, add
   `event_room_members` to `supabase_realtime`.
   **`display_name` CHECK constraint** (Security Review → Input Validation): reject empty /
   whitespace-only, and bound length at **1–100 characters after trim** — matching the shipped
   `MAX_NAME_LENGTH = 100` (`src/app/data/api.ts`:56) that `validateName` already enforces on
   `/live`. *The Security Review proposed "e.g. 1–60" as an illustration; 60 would reject names
   the existing guest-join client accepts today.* Also reject Unicode control, zero-width, and
   bidi-override code points — a projected wall is the one surface where a reversed or
   zero-width-padded name does visible damage. Server-side, since the RPC is reachable directly.
   **Publication membership is conditional** — see Decision 2's `UNVERIFIED` block: if the
   row-level realtime canary fails, `event_room_members` must NOT be added to
   `supabase_realtime`, and the roster runs on the Decision 3 poll alone.
2. Migration: `join_event_room`, `set_room_opt_in`, `set_room_readiness`, `get_my_room_status`
   RPCs — `SECURITY DEFINER`, `SET search_path = public`, grace-boundary guard, cascade-count
   computation, `EXECUTE` granted to `anon, authenticated` (the RPCs are the intended public
   surface; direct table grants stay revoked).
3. `events-service-real.ts` (or a new `event-room-service.ts`): typed wrappers for the four RPCs
   plus `getRoomRoster(eventId)` (SELECT, RLS-filtered) and `subscribeToRoomRoster(eventId, cb)`
   (realtime channel + 30s reconciliation poll per Decision 3).
4. `src/app/types/index.ts`: `EventRoomMember` type (mirrors the RPC return shape).
5. `EventRoomPage.tsx`: join screen, readiness section, principle/opt-in section, roster
   (opt-ins-only list + zero-state), Present toggle (local state, no route), 8-state handling per
   UX Notes. Reuses `PersonRow`/`PersonAvatar` for roster entries.
   Four constraints carried from the Security Review, each verifiable at code review:
   - **Render `display_name` as a plain text child (`{name}`)** — no `dangerouslySetInnerHTML`,
     no markdown, no raw-HTML path anywhere in the roster or Present mode. React's default
     escaping is the control; nothing may bypass it.
   - **Any host/role badge derives from the real `host_id`/`profile_id` match**, never from
     pattern-matching the display-name string. Free text cannot carry an identity claim — a
     walk-in typing "Slava (host)" must not render as the host.
   - **The `profiles` join for the registered-vs-walk-in badge selects only columns already
     public on that user's profile page today** (display name, avatar). Verify against
     `docs/technical/database.md` before writing the join; never reach for auth metadata.
   - **Lost `client_secret` degrades to "rejoin with a new name", never an error state** —
     cleared storage and second devices are expected in a room, and this matches the no-account
     model the `/live` guest pattern already accepts.
   Do **NOT** copy the `isFull` / `max_attendees` check from `EventDetail.tsx` into the join
   path — capacity governs RSVP only, and a room capacity check is an explicit spec Non-Goal.
6. `events/index.tsx`: add `room`, `ready`, `meet` routes under `:slug`, each rendering
   `EventRoomPage` with its `focus` prop.
7. `EventDetail.tsx`: add the Room tab (reusing `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`,
   `org-page.tsx`'s pattern), visible unconditionally (no `isLoggedIn` gate, unlike
   `PracticeRooms`), content switching on before/during/after per UX Notes.
8. `[FOUNDER DECISION]` copy strings (UI Contract) — left as placeholders; `/dev` must not invent
   them. Slots 3 and 4 are **not** founder decisions but lookups, already resolved against the
   shipped `/live` guest form (`clarity-live-page.tsx`:4020-4055): guest field label
   *"What should we call you?"*, placeholder *"Enter your name"*, submit *"Join as Guest"*,
   divider *"or join as guest"*, account path = `GoogleAuthButton` + *"Log in with email"*.

#### Founder decisions raised by the Security Review — RESOLVED 2026-08-19

- **Projected-wall abuse → ACCEPT, handled socially.** No host soft-hide is built. The facilitator
  handles an offensive display name in the room the way they would handle anyone being disruptive.
  Recorded as an accepted risk in Risks below. Reversible: the soft-hide column + host-gated RPC
  can be added after the first event that actually needs it, and nothing in this build forecloses
  it. *Rejected: building the soft-hide now — it prices a problem that has not occurred at a scale
  of twelve people who can see each other.*
- **Roster flooding → MITIGATE with a soft cap.** `join_event_room` performs a per-`event_id`
  row-count check and rejects past a large N. No new infrastructure, no captcha, and a room of
  twelve never approaches it. Chosen over ACCEPT because, unlike `/ready`'s invisible bad number,
  this failure mode is visible to everyone in the room at once. **N = 1000**, set in
  `join_event_room` (`supabase/migrations/20260819171000_p1114_event_room_rpcs.sql`). Reasoning:
  the largest event this product runs today is on the order of dozens of people, and the spec's
  own reference point for "never approaches it" is a room of twelve — 1000 is roughly two orders
  of magnitude of headroom above any plausible legitimate room size, so no real event is ever
  refused, while still bounding a flood's damage to a row count small enough for manual cleanup
  rather than unbounded growth.
- **UI Contract copy → placeholders now, real copy at `/verify`.** `/dev` builds with **visible**
  `PLACEHOLDER:` markers rendered in the UI — not invented copy, and not empty strings that look
  like a rendering bug. The founder sets the eight remaining strings once they can be seen in a
  real room. This is a deliberate second pass over the same components, accepted so that copy is
  written against the rendered surface rather than against a table. **`/dev` must not invent any
  user-facing string.** The two resolved slots (guest field, account path) use the shipped `/live`
  wording verbatim and are NOT placeholders.

#### Files to Create

- `supabase/migrations/<timestamp>_p1114_event_room_tables.sql`
- `supabase/migrations/<timestamp>_p1114_event_room_rpcs.sql`
- `src/app/prototypes/events/components/EventRoomPage.tsx`
- `src/app/data/event-room-service.ts` (or equivalent methods added to `events-service-real.ts` —
  `/dev` to decide based on file-size budget; either way, `EventsService` interface gets the new
  method signatures)

#### Files to Modify

- `src/app/prototypes/events/index.tsx` — add `room`/`ready`/`meet` routes
- `src/app/prototypes/events/components/EventDetail.tsx` — add Room tab
- `src/app/data/events-service.interface.ts` — new method signatures
- `src/app/types/index.ts` — `EventRoomMember` type
- `docs/technical/database.md` — document the two new tables (pattern: existing
  `event_practice_rooms` entry at line 74)

## Verification Contract

**Pinned to main.** The gate reads this section from `main`, never from the branch it is
judging — otherwise a loop can delete the row it is about to fail. Adding a heading inside
this section breaks the digest; put new prose above it.

**33 Done-When and Acceptance-Criteria lines: 30 MECHANICAL, 2 COMPARABLE, 1 HUMAN-ONLY.**
HUMAN-ONLY is 3% — well under goalify's 25% refusal bar.

| line | class | decided by | artifact |
|---|---|---|---|
| DW-gate copy verbatim, leaks nothing, register routes to the event page; DW-pages mirror shipped /ready and /meet; DW-roster above the bar, no duplicate decision control, no understanding number; DW-guest door gone from the room but intact in /live; DW-compact layout on all three routes; DW-tab bar above the event card; DW-Practice Rooms lives in /meet under the roster, not on the event Details page (round 4 — reverses the round-2 "leave it where it was!" call) | MECHANICAL | `npx vitest run src/tests/p1114-room-composition.test.tsx` | src/tests/p1114-room-composition.test.tsx |
| DW-anon holds no EXECUTE on the four RPCs; DW-no anon table grant; DW-no client_secret in the client path; DW-no room identity in localStorage | MECHANICAL | `npx vitest run src/tests/p1114-no-anon-surface.test.ts` | src/tests/p1114-no-anon-surface.test.ts |
| DW-the room's freeze boundary stays pinned to EVENT_GRACE_HOURS | MECHANICAL | `npx vitest run src/tests/p1114-grace-hours-sync.test.ts` | src/tests/p1114-grace-hours-sync.test.ts |
| DW-shared components are reused, not re-reinvented (guard survives the split) | MECHANICAL | `npx vitest run src/tests/p1114-shared-component-reuse.test.tsx` | src/tests/p1114-shared-component-reuse.test.tsx |
| DW-whole unit suite green — the regression baseline for everything above | MECHANICAL | `npx vitest run` | package.json |
| AC-a signed-out visitor is turned away at every door and learns nothing about the room; AC-a signed-in but unregistered person is turned away too; DW-no name field on any room route; DW-no footer on either page | MECHANICAL | `npx playwright test e2e/p1114-gate.spec.ts` | e2e/p1114-gate.spec.ts |
| DW-roster shows opt-ins only; DW-realtime update without reload; DW-answer changeable with history retained; DW-cascade counter; DW-freeze behaviour; DW-cap does not block; DW-no event_rsvps row written; DW-org member not auto-opted-in; DW-roster degrades to a static list | MECHANICAL | `npx playwright test e2e/p1114-event-room.spec.ts` | e2e/p1114-event-room.spec.ts |
| DW-schema, RLS and RPC contracts hold under a real database | MECHANICAL | `npx playwright test e2e/integration/p1114-db-schema.spec.ts e2e/integration/p1114-room-rpcs.spec.ts` | e2e/integration/p1114-*.spec.ts |
| DW-row-level RLS filtering of realtime still holds (the load-bearing canary) | MECHANICAL | `npx playwright test e2e/integration/p1114-realtime-payload.spec.ts` | e2e/integration/p1114-realtime-payload.spec.ts |
| DW-standalone /ready and /meet behave identically to before this spec | MECHANICAL | `npx playwright test e2e/p1077-ready.spec.ts e2e/p1016-meeting-terms.spec.ts e2e/p1083-ready-distribution.spec.ts` | e2e/p1077-ready.spec.ts, e2e/p1016-meeting-terms.spec.ts, e2e/p1083-ready-distribution.spec.ts |
| DW-tab selection lives in the URL; one Back press moves one tab | MECHANICAL | `npx playwright test e2e/p1114-event-room.spec.ts --grep "tab"` | e2e/p1114-event-room.spec.ts |
| AC-the two room pages are recognisably the same pages as /ready and /meet, at 320/375/desktop | COMPARABLE | blind-reviewer | features/verification/p1114/review-round-*.md |
| AC-a person can tell who has opted in without asking anyone; the roster reads as people, not a list | COMPARABLE | blind-reviewer | features/verification/p1114/review-round-*.md |
| DW-no `it.fails` marker survives — the red-first tests assert for real, not merely expect to fail | MECHANICAL | `bash -c '! grep -rqn "it\.fails" src/tests/p1114-room-composition.test.tsx src/tests/p1114-no-anon-surface.test.ts'` | src/tests/p1114-*.test.ts* |
| AC-the gate copy is the right thing to say to someone standing outside | HUMAN-ONLY | founder | — |

### The blind reviewer

**It must not be the agent that built the thing.** That is the one durable constraint here:
every defect in the two rejected builds was found by someone given renders and nothing else,
and every rejected version had already passed its own implementer's review.

**Given:** twelve images — the live `/ready` and `/meet` at 320px, 375px and desktop (the
named reference, captured at review time so it cannot drift from the shipped product), and
the room's `…/ready` and `…/meet` at the same three widths — plus the roster's empty state.

**Forbidden:** the diff, the spec, the rationale, this contract, and any statement of what
the build was trying to do.

**Writes** `features/verification/p1114/review-round-N.md` itself: `VERDICT: PASS|FAIL`, then
one `SCREENSHOT: <sha256>  <path>` line per image judged. The gate re-hashes every image
itself and never trusts a hash it is handed.

### Evidence

| file | holds |
|---|---|
| `contract.sha256` | the pin |
| `review-round-N.md` | the verdict and the image hashes |
| `assumptions.md` | every call the loop made alone. There is no escalation clause — the agent decides, logs, continues |
| `feedback.md` | **two numbers**: corrections given, and turns consumed. Quality bought with runaway spend reads as success on a one-axis scoreboard |

### Red-first (run 2026-08-20, before the loop existed)

| command | result |
|---|---|
| `npx vitest run src/tests/p1114-room-composition.test.tsx` | **13 failed, 1 passed** — the pass is `/live` still importing `GuestOrAccountJoin`, which must stay green throughout |
| `npx vitest run src/tests/p1114-no-anon-surface.test.ts` | **3 failed, 1 passed** — the pass is the absence of anon *table* grants, already true |
| `npx playwright test e2e/p1114-gate.spec.ts` | **unproven at pin time** — needs a seeded fixture event and a running dev server; flagged rather than counted as evidence |

Two of the three commands were watched failing for the right reason. The third is flagged
**unproven**: a check nobody has seen fail is not a check, and saying so is cheaper than
discovering it later.

**The `it.fails` caveat, stated rather than buried.** The two vitest files are committed under
this repo's `it.fails` convention (P835/P895) so `npm test` stays green while the build is
outstanding. While that marker is present those commands exit 0 over assertions nobody has
satisfied — a vacuous green. The row above is what closes it: the gate cannot pass until every
`.fails` is gone, at which point the assertions are load-bearing for real. Two tests carry no
marker at all, because they are already true and must stay true: `/live` keeping its
guest-join import, and the absence of anon table grants.


## Test Coverage Strategy

**Phase-0 inventory: zero P1114 tests existed before this pass** (confirmed via glob over
`e2e/p1114-*.spec.ts`, `e2e/integration/p1114-*.spec.ts`, `e2e/a11y/`, `src/tests/p1114-*`,
`features/uat/`). Everything below is net-new, written before `/dev` — the tables, RPCs, and
routes do not exist yet, so every test in the three integration files and the e2e file fails
today for the correct pre-implementation reason (`PGRST205` relation-not-found /
`PGRST202` function-not-found / `room-page` test-id not found). Each was run once against the
test DB during authoring to confirm it fails for THAT reason, not a typo in the test itself —
evidence, not inference (CLAUDE.md "Falsify Before You Rely").

### The load-bearing test: Decision 2's realtime canary

`e2e/integration/p1114-realtime-payload.spec.ts` is written first and treated as the gate for
Architecture Decision 2 itself, per that decision's own `UNVERIFIED` block. Modeled structurally
on `e2e/integration/p1057-realtime-payload.spec.ts` (the repo's only other WebSocket test): a
control that fails loudly on silence, the triggering write re-fired in a loop (a one-shot
trigger is what made P1057's canary flaky), and a file header stating plainly what a RED result
means — Decision 2 is void, and the fallback is Decision 2's own named move (drop
`event_room_members` from `supabase_realtime`, drive the roster from the Decision 3
reconciliation poll alone). It asserts BOTH directions the "opt-outs are never shown" guarantee
requires: (a) a row with `opted_in = false` never appears in any payload, proven against a live
control row on the same channel in the same window; (b) an UPDATE flipping a row from
`opted_in = true` to `false` never delivers the new `false` state — the transition Architecture
Decision 3 named explicitly as untested and unmeasured anywhere in this repo.

### Test ID Contract required of `/dev`

Every user-facing string in the UI Contract is `[FOUNDER DECISION]`, so the e2e file asserts on
roles/structure/test-ids, never on placeholder copy (the two exceptions are the UI Contract's
already-resolved slots: label "What should we call you?", button "Join as Guest", reused
verbatim from `/live`). `/dev` must implement these test-ids for `e2e/p1114-event-room.spec.ts`
to pass — full contract and rationale is in that file's header comment:
`room-page` (carries `data-room-focus` = `join`/`ready`/`principle`, Decision 7's `focus` prop
made observable), `room-join-form`, `room-controls`, `room-roster` (carries `data-present` in
Present mode), `room-roster-item`, `room-zero-state`, `room-present-toggle` (`aria-pressed`),
`room-my-opt-in-status` (`data-opted-in` = `true`/`false`/`unanswered`), `room-opt-in-yes` /
`room-opt-in-no`, `room-frozen-notice`.

### Done-When coverage (17 items — 17 covered, 1 by reference to existing tests, 1 partially)

| # | Done-When | Covered by |
|---|---|---|
| 1 | Walk-in joins with name only, appears on roster | `e2e/p1114-event-room.spec.ts` "a walk-in can join…" (identification) + "changing an answer updates…live" (opt-in → roster appearance) + `p1114-room-rpcs.spec.ts` "anon guest can join…" |
| 2 | Logged-in person passes through without re-entering name | `p1114-event-room.spec.ts` "a logged-in person passes through…" |
| 3 | `/ready`/`/meet` render same page, different focus | `p1114-event-room.spec.ts` "/room, /ready, and /meet render the SAME page…" (asserts `data-room-focus`) |
| 4 | Standalone `/ready`/`/meet` unchanged | **Not a new test — by design.** Covered by `e2e/p1077-ready.spec.ts` and `e2e/p1083-ready-distribution.spec.ts`, unmodified. Named explicitly per the Done-When's own wording ("verified by existing tests still passing, unmodified"). |
| 5 | Roster visible before answering, opt-ins only, no opt-out shown/counted | `p1114-db-schema.spec.ts` "anon SELECT on the roster returns only opted_in = true…" + `p1114-event-room.spec.ts` "the roster is visible before the visitor answers…" |
| 6 | Second browser's opt-in updates first browser's roster, no reload | `p1114-event-room.spec.ts` "changing an answer updates the room page live…across two browser contexts" |
| 7 | Changing an answer is possible; prior answer still queryable | `p1114-room-rpcs.spec.ts` "the answer history is retained across multiple changes…" |
| 8 | Each opt-in row stores the cascade count | `p1114-room-rpcs.spec.ts` "cascade_count is server-computed…" |
| 9 | Room readiness / general `/ready` don't cross-contaminate | `p1114-room-rpcs.spec.ts` "set_room_readiness never writes to ready_submissions…" **PARTIAL** — the reverse direction (a general `ready_submissions` row never appearing in a room query) is only structurally implied (distinct tables, no shared read path exists to test); not independently probed with a positive seed-and-check. |
| 10 | Room readiness survives past 10 minutes | `p1114-room-rpcs.spec.ts` "room readiness has no expiry…" |
| 11 | Present toggle hides controls, enlarges roster, same route | `p1114-event-room.spec.ts` "the Present toggle hides participant controls…" |
| 12 | Joining creates no `event_rsvps` row | `p1114-room-rpcs.spec.ts` "joining the room creates NO event_rsvps row…" |
| 13 | Room row distinguishable walk-in vs registered | `p1114-db-schema.spec.ts` "a room row is distinguishable as walk-in…vs registered" |
| 14 | Past `EVENT_GRACE_HOURS`: rejects new joins/changes, still displays who was there | `p1114-room-rpcs.spec.ts` "join_event_room is refused past the freeze boundary" + "set_room_opt_in is refused past the freeze boundary…" + `p1114-event-room.spec.ts` "a frozen room…still displays who was there…" |
| 15 | Room at `max_attendees` still accepts joins | `p1114-room-rpcs.spec.ts` "room join is NOT blocked by max_attendees…" |
| 16 | Org member sees themselves as not opted in until they confirm | `p1114-event-room.spec.ts` "an organization member sees themselves as NOT opted in…" |
| 17 | Roster degrades to static list on realtime failure, never error/empty | `p1114-event-room.spec.ts` "roster degrades to a readable list…" |

### Acceptance Criteria coverage (6 items — 6 covered, 1 partially)

| # | AC | Covered by |
|---|---|---|
| 1 | Walk-in seen on the wall within a minute, no install/register/email | `p1114-event-room.spec.ts` "a walk-in can join…" + the live cross-browser test. **PARTIAL** — "no email" is proven server-side (`profile_id` stays NULL, the table has no email column at all) but the UI's absence of an email field is not independently asserted. |
| 2 | Person in room can tell who opted in without asking | `p1114-event-room.spec.ts` "the roster is visible before the visitor answers…shows opt-ins only" |
| 3 | Opt-out-then-opt-in later in the same event is visible on the wall | `p1114-room-rpcs.spec.ts` "the answer history is retained…" (server-side sequencing) + `p1114-event-room.spec.ts` "changing an answer updates the room page live…" (live-wall visibility of the flip) |
| 4 | Facilitator projects from one link, unchanged during the event | `p1114-event-room.spec.ts` "/room, /ready, and /meet render the SAME page…" + the Present-toggle test's URL-unchanged assertion |
| 5 | After the event, the event page still shows who was in the room | `p1114-event-room.spec.ts` "a frozen room…still displays who was there…" |
| 6 | Nothing reveals/counts/implies who opted out | `p1114-event-room.spec.ts` "…an opted-out name never appears" (UI/body-text) + `p1114-realtime-payload.spec.ts` (a)/(b) (data-layer — the strongest form of this guarantee) + `p1114-db-schema.spec.ts` "anon SELECT…returns only opted_in = true" |

### Explicitly NOT covered

- **The two open founder decisions (Implementation Approach) are BLOCKING and unanswered — no
  tests were written for either**, since writing one would encode an answer the spec explicitly
  says `/dev` may not settle on its own:
  - *Wall abuse (soft-hide vs accept).* If BUILD is chosen: needs a host-only RPC to hide a row
    from the projected/Present view without deleting the underlying record, and a test asserting
    a hidden row is absent from `room-roster` in Present mode but still present via admin/history
    read. If ACCEPT: no code, no test — already logged as an accepted risk.
  - *Roster flooding (accept vs mitigate).* If MITIGATE: needs a test asserting `join_event_room`
    refuses or soft-caps joins past some per-event N. If ACCEPT: no code, no test.
- **Profanity/abuse filtering on display names** — the spec's own Security Review states no
  reliable automated filter exists; not testable, and not attempted.
- **Concurrent `set_room_opt_in` race on `cascade_count`** — unlike `claim_joiner_seat`'s
  dedicated `FOR UPDATE` concurrency canary (P1053), no race test was written here. The spec
  does not name row-locking as a requirement for the cascade counter (a soft research
  measurement, not a security boundary the way seat occupancy is), so two simultaneous opt-ins
  could in principle read the same "already opted in" count. Flagged as an **untested gap**, not
  silently assumed safe — `/dev` should confirm whether `set_room_opt_in` needs `SELECT … FOR
  UPDATE` on the same idiom as `claim_joiner_seat`, and this file's absence of that test is not
  evidence either way.
- **UI Contract copy strings** — deliberately unasserted; all `[FOUNDER DECISION]` placeholders.
- **Capacity messaging in the UI** — Non-Goal forbids a room capacity check entirely, so there is
  nothing to test beyond the RPC-level proof that `max_attendees` is ignored.
