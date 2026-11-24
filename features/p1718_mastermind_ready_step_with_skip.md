---
status: in-progress
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: medium
rank: 1000108.0
changes: p1529
tags:
  - redesign
  - p1529
  - events
  - sales-mastermind
created_date: 2026-11-23
disclosure: public
delivery_stage: dev
pipeline_ran: [change-request, dev]
spec_review_hash: fc266a3f2ef7220d108eb13107d2ed9562bfe1d73990fccd7953326df5564d79
spec_review_vendors: [gemini, openrouter]
---

# P1718: Ready comes back to the Sales Mastermind's room, with a Skip that records nothing

> **Redesign of:** [P1529: The sales mastermind's own registration, event room and host flow](done/2026-06-10/p1529_canvas_event_host_coordination.md)
> **What was wrong:** P1529 removed the Ready step ("How up for thinking are you right now?") from the
> mastermind's room. The spec line says only "no Ready", with no reason recorded, and no founder decision asking for it
> was found. So a mastermind attendee never sees their own state or where the room is before they start
> explaining back. Separately, the shared Ready screen saves the midpoint 5 when someone taps Continue
> without moving the slider. That records an answer nobody gave.

## Operating Mode

> This spec is an **incremental correction** to P1529, not a greenfield design.
> The predecessor spec is **read-only shipped history**. Do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1529 are not up for re-examination. In particular, statement Compare stays out of
> the mastermind's room.

## Problem Statement

The founder's reason for Ready, in their words (2026-11-23):

> "It was originally the reason, and that is making people aware of where they are on their need for
> cognitive closure or need for cognition and seeing where the room is. Because sometimes it fails, but
> just because people have no energy or whatever. It also prepares them for more cognition. It's just
> like expectation setting and maybe reflection."

The mastermind asks for the most effortful thinking of any event: a partner explains a canvas back until
both say a number above 8. When a pair stalls, the evening cannot tell "they had no energy" from "the method
did not work". The mastermind is the session that decides whether the features are ready to sell
(decisions.md 2026-11-06, 2026-11-10), so that difference matters. Ready gives each person a moment to notice their own state. It
shows them the room's state (the anonymous dots). It also stores a per-person value that can be read
next to how their rounds went.

The founder also asked that nobody be forced through it or stuck on it:

> "we don't want to force them ... maybe if we put a skip button then it definitely it will work"

Today nobody can get stuck: Continue is never disabled, and a failed save still lets the person in
(`EventRoomReady.tsx:99`, "Readiness is a note, not a gate"). But Continue on an untouched slider saves
**5**, so "I didn't answer" and "I'm neutral" become the same row. That fake 5 enters everyone's dots and
the post-event read. A Skip that saves nothing fixes this.

## Jobs To Be Done

- **Preserved from P1529:** register with the mastermind's questions; arrive ("Have you arrived?"); prepare
  optionally, never blocked without a canvas; decide on the principle; share a canvas; be seated at a table;
  give feedback at any time.
- **Corrected:** *before thinking hard, notice how up for thinking I am and see where the room is.* P1529
  dropped this job for the mastermind with no recorded reason.
- **New:** *pass on that question without leaving a false answer behind* (Skip). This applies to every
  series that has Ready, Clarity Night included.

## Current State

**Mastermind first visit (current):** Event page → Event Room tab → `/events/:slug/room`

```
Have you arrived?  ──I'm here──▶  [preparation offer, only if not prepared]  ──▶  /meet
                                                                                   │
  Learn and prepare · Principle · Canvas* · Table · Feedback      (* canvas made at the event)
```

Opening `/events/:slug/ready` directly forwards to `/meet` (`EventRoomReady.tsx:123`).

**Ready screen (current, Clarity Night only):**

```
 ← Back to the event
 Ready · Principle · Table · Compare · Feedback
 ───────────────────────────────────────────────

        How up for thinking are you right now?

   Stay on the surface ───────●─────── Go deep
                           Neutral
            (faint dots: others in this room)

        [            Continue            ]      ← always enabled; untouched = saves 5
```

## Root Cause

Two separate mechanisms.

1. **Ready is switched off for the mastermind.** The P1529 spec line "The room's step bar is Principle ·
   Table (no Ready, no statement Compare)" became `readiness: false` in `SALES_MASTERMIND_RECIPE.room`
   (`src/app/prototypes/events/series-recipes.ts:242` in the working tree, `:240` at HEAD). Three readers act on it:
   - `EventRoomGate.tsx:111` sends the first visit to `meet` instead of `ready`.
   - `EventRoomReady.tsx:123` redirects a direct `/ready` to `/meet`.
   - `hidden-room-steps.ts:8` (and `EventPrepPage.tsx:693`) hide the Ready step in the bar.

   The line was written on 2026-10-30 (commit `15ad5ea3f`) while a three-model review was folded into the spec. No founder message asking for it was found in the session history. The
   same day, the founder said "no sliders" about the `/live` understanding scores, and the hike room was
   built without Ready (P1542). The likeliest cause is that one of these was carried over. That is a hypothesis; the session history does not settle it.

2. **An unanswered Ready is saved as 5.** `value` starts at `MIDPOINT_VALUE = 5`, and `handleContinue`
   (`EventRoomReady.tsx:99`) calls `setRoomReadiness(self.id, value)` whether or not `touched` is true.

A third fact shapes the fix: the gate treats "has a value" as "has been here before"
(`EventRoomGate.tsx:109`, `returning = self?.readinessValue != null`). A Skip that saves nothing would
otherwise send the person back to Ready on every re-entry that evening.

## Redesign

**Mastermind first visit (after):**

```
Have you arrived? ──I'm here──▶ [preparation offer, only if not prepared] ──▶ /ready ──Continue/Skip──▶ /meet
```

**Ready screen (after, every series that has Ready):**

```
 ← Back to the event
 Learn and prepare · Ready · Principle · Canvas* · Table · Review        (mastermind)
 Ready · Principle · Table · Compare · Feedback                          (Clarity Night, unchanged)
 ──────────────────────────────────────────────────────────────────

        How up for thinking are you right now?

   Stay on the surface ───────●─────── Go deep
                           Neutral
            (faint dots: others in this room)

        [            Continue            ]      ← primary, filled blue
        [              Skip              ]      ← secondary, blue-bordered   (label "Skip", founder 2026-11-23)
```

States:

| What the person does | Saved | Remembered on this device | Next entry to the room |
|---|---|---|---|
| Moves the slider, taps Continue | their value | nothing extra | straight to `/meet` (has a value) |
| Taps Skip | nothing | "skipped Ready for this event" | straight to `/meet` |
| Taps Continue without moving the slider | nothing (same as Skip) | "skipped Ready for this event" | straight to `/meet` |
| Moves the slider, taps Continue, the save fails | nothing | "skipped Ready for this event" | straight to `/meet` (spec review: otherwise Ready returns on every re-entry) |
| Skipped, later taps Ready in the step bar and answers | their value | the marker stays; harmless, the value already routes to `/meet` | straight to `/meet` |
| Skipped on one phone, opens the room on another | nothing | nothing there | Ready once more, unless seated at a running round (R8); acceptable |
| Another person signs in on the same browser | nothing | the first person's marker does not apply (keyed per person) | Ready, as a first visit |
| The host of a mastermind opens the room | nothing | nothing | straight to `/meet` (R9) |

A skipped person can still answer later: Ready stays tappable in the step bar, as it is today for
any step behind the current one (`RoomSteps.tsx` `canOpenStep`).

## Predecessor Sections Superseded

| Section | P1529 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Solution, "The mastermind recipe" (line 228) | "The room's step bar is Principle · Table (no Ready, no statement Compare)." | Partially superseded: "no Ready" only | R1, R5. "No statement Compare" stays. |
| `SALES_MASTERMIND_RECIPE` doc comment (code, not spec) | "The room is Principle · Table · Feedback; no statement Compare, no Ready." | Superseded: "no Ready" | R1 |
| Invariants, first line (L105-107) | "Clarity Night and Social Hike are unchanged. ... their existing tests pass unchanged." | **Amended for the Ready screen only** (founder 2026-11-23): Clarity Night's Ready gains Skip and R3/R4. | R6 |

Nothing else is superseded. All 39 P1529 criteria stay valid, none of them is about Ready, the step bar
or the arrival question. The landing rule (L746, `beforeRoundsStep`) is extended: Ready comes before it, and
it is unchanged after Ready. D3 and the Non-Goal at L382 ("Do NOT add sliders ... to the round") are about
the round; Ready is before the round, so they stay valid by their letter (see Risks).

## Requirements

- **R1. Ready is on for the mastermind.** `SALES_MASTERMIND_RECIPE.room.readiness` becomes `true`. A first
  visit goes: arrival question → preparation offer (only if not prepared) → `/ready` → `/meet`. Ready sits
  before Principle, as in every series that has it.
- **R2. Skip.** The shared Ready screen (`EventRoomReady.tsx`) shows a secondary Skip control under
  Continue. Skip saves nothing and goes to `/meet` with the same route state Continue passes.
- **R3. Continue saves only an answer.** Continue saves the value only when the slider was moved, or a
  value was already stored. An untouched Continue behaves exactly like Skip. A second tap on Continue or Skip
  while a save is in flight does nothing.
- **R4. A skip is remembered for the evening.** Skip, an untouched Continue, or a Continue whose save failed
  remembers "skipped Ready for event X" in `localStorage`, keyed by **the viewer's profile id and the event
  id** (spec review: an event-only key leaks one person's skip to the next person on a shared phone; the
  repo's own per-viewer keys, `use-group-chat-opened.ts:69`, do the same). `EventRoomGate` treats that as a
  return visit and sends the person to `/meet`. Reads and writes are wrapped in try/catch. With no storage
  the page still works and the person sees Ready again on re-entry.
- **R5. Step bar on phones.** The mastermind's bar holds up to six steps: Learn and prepare · Ready ·
  Principle · Canvas · Table · Feedback. It must render without overflow or clipping at 320px, 375px and
  desktop, with and without the Canvas step. If "Learn and prepare" breaks the row at 375–430px, a shorter
  label is a `[FOUNDER DECISION: copy — shorter label for "Learn and prepare"]`. Do not pick one.
  **Founder decision 2026-11-24: the mastermind's last step is "Review".** Measured by glyph at 11px, "Feedback"
  ran about 5px past the bar's right edge at 375 and 320 with the Canvas step; "Review" ends 1.5px inside it.
  "Learn and prepare" wraps onto lines of its own cell and needs no change. Clarity Night keeps "Feedback".
  **Founder decision 2026-11-24: on a phone the mastermind's bar drops its done ticks.** Review round 2 and the
  visual QA found the tick crowding the row: with Ready answered, "✓ Ready" ran into "Principle" (-1.6px at 375,
  -0.5px at 320), and at 430 every tick together overlapped by up to 8px. The founder chose "drop checks on
  phones", as Clarity Night's five-step bar already does below 430px. The mastermind's bar shows ticks from 768px;
  measured, every tick fits from about 500px. The six-step row (with Canvas) also takes the five-step bar's small
  face (10px, tighter) below 430px, because "Principle" and "Canvas" stood 2.3px apart and read as one label; they
  are now 8.0px apart at 375 and 5.8px at 320. The hike's short bar keeps its ticks at every width.
- **R6. Clarity Night keeps its order and copy.** It also gets Skip and save-only-if-moved: **founder decision 2026-11-23, yes**. The fabricated 5 exists on Clarity Night too, and one
  shared screen with two behaviours is a second state to keep in step. This amends P1529's invariant
  "Clarity Night and Social Hike are unchanged ... their existing tests pass unchanged" for this one
  screen; the Ready-screen tests that pin Clarity Night's Continue would change. The
  founder accepted this amendment.
- **R7. The Ready screen's step bar is the room's.** (Spec review, all three reviewers: `EventRoomReady.tsx:157`
  renders `RoomSteps` with no `hidden`, `labels`, `learn` or `withCanvas`, so a mastermind's `/ready` would
  show statement Compare and no Learn or Canvas.) `/ready` passes the same recipe-driven bar `/meet` passes:
  hidden steps (`hiddenRoomSteps`), the series' labels, `closeOpen`, `tableOpen`, the Canvas step when the
  canvas is made at the event, and the Learn entry. A tap on a step `/ready` cannot show opens it in `/meet`
  (Learn, Feedback). The bar is built in a component of its own; `EventRoomMeet.tsx` is over the size limit.
- **R8. Ready never stands at a running table.** `/ready` reads the evening's rounds; when a round is running
  and the person is seated in it, `/ready` forwards to `/meet`. This covers both the gate's redirect and a tap
  on Ready in the step bar. A failed read shows Ready (a note, not a gate).
- **R9. The mastermind's host goes straight to `/meet`.** The distribution RPC excludes only the caller, so a
  host who moved the slider would enter every attendee's dots, against P1529's "the host is not an attendee in
  any count". Clarity Night's host routing is unchanged (it already goes through Ready; out of scope).
- **R10. A skipped Ready shows no done tick.** `/meet` passes `done.ready = readinessValue != null` to the step
  bar, so the bar does not say "Ready, done" to someone who skipped.

## Invariants

- **Readiness is a note, never a gate.** No path may leave a person unable to reach `/meet` from Ready:
  not a failed save, not missing storage, not offline-with-a-stored-state.
- **No fabricated answers.** From this change's deploy on, a stored readiness value always comes from a
  slider the person moved. Values stored before it may be untouched-Continue 5s and cannot be told apart;
  any later analysis of readiness uses values written after the deploy.
- **The distribution stays anonymous at the boundary.** Others' values arrive only through
  `get_room_readiness_distribution`, which carries no identifiers (2026-08-21 [product]). Skip must not add
  any per-person signal to that read, such as a "skipped" count.
- **Copy obligation (2026-08-21):** readiness is stored against the person. Never describe it as anonymous
  in user-facing copy.
- **One primary per view (P955).** Continue is the only filled primary. Skip is blue-bordered (no white or
  grey action buttons, P1529 G1 visual rule).
- **Hikes are untouched.** `SOCIAL_HIKE_RECIPE.room.readiness` stays `false`.
- **Statement Compare stays out of the mastermind's room** (`hidden-room-steps.ts`, `mastermind` branch).
- **Ready is before the round only.** It never appears while the person is seated at a running round
  (P1529: "The event room never stands between two people talking").

### Carried forward from P1529 (verbatim, additive only)

- **Clarity Night and Social Hike are unchanged.** An event whose flow is not Sales Mastermind
  renders, seats, titles its round threads and records exactly as today; their existing tests pass
  unchanged. An event with no series and no flow gets Clarity Night's flow. **Amended 2026-11-23 (R6, founder):**
  Clarity Night's Ready screen gains Skip, save-only-if-moved and R8; the tests that drove an untouched
  Continue as a save change with it.
- **No seat without the answers (D16).** For a flow with registration questions, the server refuses a
  registration without the required answers and the recording acceptance, on every path that creates
  one: the page, sign-up with `action=rsvp`, the hidden-event link and any direct insert. Flows without
  questions register exactly as today.
- **One flow resolver.** Every surface that today calls `recipeFor(seriesSlug)` reads the event's
  effective flow through one function; a test fails if `recipeFor(` is called anywhere else. The flow
  selects the whole recipe: prepare, room and close.
- **The event room never stands between two people talking.** During a round, the event room screen
  shows who they are with, their role, the rule reminder and a link to the canvas, and asks for nothing. **Amended 2026-11-11, see UAT round 2026-11-11** (the room now also shows the reading part, a positions list, the observer line and the next-version card).
  The canvas page itself (positions, Compare) is the partner's and owner's to use at any time (D14).
- **The flow, and any canvas already chosen for this event, are fixed once round 1 starts.** The server
  refuses a change after that. A person with no canvas yet may add a first one at any time (D17). "Round 1" means the first counted round everywhere, client and server (a host's
  Demo round is not counted, `round-numbering.ts`).
- **One canvas per attendee per event.** Replacing it before round 1 is one server transaction
  (unshare the old, share the new, set the selection), serialised against round 1 starting.
- ~~**Nobody is seated as Clarity Canvas owner without a published canvas shared with this event.**~~ **Amended 2026-11-11, decision (b):** the host can always seat and start a round; an owner may have no canvas (`20261111170000`, `20261111180000`). The registration guard stays. Do not restore the canvas guard as a regression fix.
- **Version opens are evidence, never overwritten.** Each time a partner opens the owner's canvas from
  the round screen, the open is recorded (event, round, owner, partner, version, time) outside the seat
  rows, which `host_set_round_seats` deletes and re-inserts.
- **Sharing never widens.** Partners and observers reach a canvas only through its existing event share
  (P1515: host plus people registered by 12 h after the start, decisions.md 2026-10-21).
- **Nothing is drafted, published or shared without the Clarity Canvas owner's tap.**
- **Round material is only what the owner can read**, copied under the owner's name with the original
  authors' references carried (so erasure still reaches it), and never quoted or named in the canvas.
- **Any new surface that names a round uses `roundLabel` / `nextRoundLabel`** (decisions.md P1430
  ruling), never `Round ${roundNo}`.
- **The host is not an attendee in any count** (decisions.md 2026-09-22 ruling on room data).

## Risks / Non-Goals

- **Two meanings of "ready" in one room.** MITIGATE. P1529's canvas step says "You're ready. The host can add
  you to a coming round." and the host screen has a "ready mark". The Ready step is a different thing.
  `/dev` checks the mastermind's screens side by side and reports if the two read as one; any rename is a
  `[FOUNDER DECISION: copy]`.
- **The spirit of "no sliders".** ACCEPT. P1529 D3 kept sliders out of the round because the `/live` sliders
  were hard to follow. Ready is one slider before the round, skippable, and asks nothing during it.
- **A skip on one device is not known on another.** ACCEPT. The person sees Ready once more there.
- **An untouched Continue under the "Neutral" label records nothing.** ACCEPT. A pointer tap at the midpoint
  does record 5 (`slider-track.tsx:263-267` emits on pointer down at any value). A keyboard user reaches 5
  only by moving away and back (`slider-track.tsx:297`, emits on a change only); the shared slider is out of
  scope.
- **Fewer dots in a small room.** ACCEPT. The roster is public by name, so roster size minus dot count now
  shows how many skipped or have not answered. No individual's value is exposed, and the RPC is unchanged
  (Non-Goal below).
- **Non-Goal:** no host-side view of readiness, no skip count, no change to the distribution RPC.

**Known limitations (code review rounds 2 to 7; accepted, none strands anyone):**
- **A look back at Ready from the room greys the steps after it.** `/ready`'s bar has `current="ready"`, so Principle,
  Canvas and Table cannot be tapped there for someone already past them (checked against `canOpenStep`, review
  round 5). Continue, Skip, Review and Learn still lead out. Clarity Night's `/ready` has always worked this way; R7 lists the props the bar shares, and the room's
  moment is not one of them.
- **A round that starts while someone sits on `/ready` does not forward them.** The seated check runs once, on
  arrival (R8). Their Continue or Skip takes them to `/meet`, which shows the running round.
- **A save that lands after the 5s budget** clears the skip remembered at the timeout, but `/meet` draws the Ready
  tick only from its next read of the room.
- **The Ready tab while seated at a running round** is still tappable in `/meet`; `/ready` then forwards back
  (R8), with a brief loader.
- **A remembered skip can sit beside a stored answer** when a save landed but the re-read after it did not, and the
  person then leaves `/ready` by the bar. The gate reads the stored answer first, so where anyone lands never changes.
- **No member row while online** (the join read failed): Continue saves nothing and remembers nothing, since there is
  no row to save to and no profile to key the memory by. The next entry asks again.
- **The buttons show the save only by dimming**, for up to 5s on stalled wifi, with no "Saving…" label. Adding copy
  is a founder decision.
- **A timed-out save can land after a newer one** (review round 6): an answer whose save outran the 5s budget,
  then a second answer from a later visit, can reach the database in reverse order, so the earlier value wins. It
  needs two answers inside one stall, and the cost is a mood dot one step off; a server-side version on the write
  would be a migration for that.
- **The step bar's open tabs look tappable while a save runs** (up to 5s); a tap then does nothing, as the screen
  is already leaving (round 6).
- **One mounted `/ready` keeps its leaving state if the URL moves to another event's `/ready`** without leaving the
  page (round 6). No link in the app goes from one event's `/ready` to another's; typing the URL reloads the page.
- **The mastermind's host on `/ready` with no room row** (the join failed) sees the question, since the host check
  reads the room row's profile; Skip or Continue still lead to `/meet` (round 6).
- **R8 is proven on the direct `/ready` URL.** The gate's redirect and `/meet`'s Ready tab both end on the same
  `/ready` code, which forwards with `replace`, so Back from the forwarded `/meet` goes to the entry below it.
  They have no seated test of their own (round 6).

## What Stays the Same

- The arrival question and the preparation gate, and their order before Ready.
- The readiness data model: `event_room_members.readiness_value`, `set_room_readiness`,
  `get_room_readiness_distribution`. No migration.
- The landing after Ready: Principle if not finished; otherwise Canvas or Table (`room-landing.ts`).
- The host panel, projector, seating and rounds. None of them read readiness.
- The standalone `/ready` (outside events). It has its own page and is not in scope.
- Clarity Night's step order and copy.

## Surfaces in Scope

**In scope:**
- `src/app/prototypes/events/series-recipes.ts` (mastermind `readiness: true`, and the recipe's doc comment)
- `src/app/prototypes/events/components/EventRoomReady.tsx` (Skip, save-only-if-touched, remember skip, R7 bar, R8)
- `src/app/prototypes/events/components/EventRoomGate.tsx` (a remembered skip counts as a return visit; R9)
- `src/app/prototypes/events/components/EventRoomMeet.tsx` (R10, one prop)
- A new small module for the skip marker and a new component for the Ready step bar
- `e2e/p1114-event-room.spec.ts` (drives an untouched Continue as a save; moves the slider instead)
- `src/tests/p1433-event-night-navigation.test.tsx` (the gate's routing; clear storage between cases)
- Tests that pin the mastermind's hidden steps:
  - `src/tests/p1529-round-screen.test.tsx:953` expects `['compare', 'ready']`; this becomes `['compare']`
  - Ready screen tests: `src/tests/p1307-ready-screen.test.tsx`, `src/tests/p1562-ready.test.tsx`

**Out of scope:**
- The standalone `/ready` page (`src/app/pages/ready-page.tsx`)
- Hike recipe and hike room
- Host panel, projector, seating
- `RoomSteps.tsx` layout, unless R5's screenshots show a break. Then only by founder decision: the label
  ("Review") and the phone ticks and six-step face (both 2026-11-24, R5) are the only changes made.
- `e2e/p1529-mastermind.spec.ts` enters the room by `/meet` directly, so it is not expected to change. Verify by running it.

## Cost Budget

Added in code review round 6 (Codex): the change reads Supabase per user (the reads on each `/ready` visit) and
its e2e creates and deletes test users, so `docs/technical/metered-services.md` applies. No timer, poll, retry or
subscription is added: every read below is one-shot on arrival.

Requests on one `/ready` visit, by its parts (the event and access reads were already made by every room page;
review round 7 counted every read the screen makes, not only the ones this change wrote):

- the room row 1;
- the seat read (R8) 1: one query, `isSeatedInRunningRound` (review round 7; it was 1 to 3 through
  `getEventRoundsState`);
- the readiness marks 1 (`getRoomReadinessDistribution`, the RPC Clarity Night's `/ready` already made);
- the Canvas-shared read 1 when the Canvas is made at the event (`getMyEventCanvas`);
- the step bar's Learn entry 5 when the event offers preparation (`usePrepState`: the preparation, the parts, the two
  points feeds, the social proof), the same reads `/meet`'s bar makes for the mastermind (`EventRoomMeet.tsx:273`).
  Once per device, parts done signed out are written to the account the first time any page reads them: up to 5
  writes and 1 re-read;
- Continue with a moved slider 2 (the save RPC and the room-row re-read; no re-read from a hidden tab); Skip or an
  untouched Continue 0.

None of these reads is made for the host (sent on to `/meet` first), while offline, on a past evening or before the
room row is known, and each waits for a visible tab (rule 3, `whenVisible`; review rounds 6 and 7). The mastermind
no longer mounts the preparation banner on `/ready` (its Learn entry is that tap), so its reads are not doubled.

Inputs: 16 people; at most 2 `/ready` visits each per evening (the arrival, plus one tap on Ready; re-entry goes
to `/meet`, R4); each points feed at most 50 points (`TAG_POINTS_LIMIT`). Row sizes (UNVERIFIED, read from the
selected columns, not measured): a point with its position about 1.5 KB, the Canvas row about 2 KB, every other
answer under 1 KB.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | worst: 2 visits x (1 room row + 1 seat + 1 marks + 1 canvas + 5 learn) + 6 sync once + 2 save = 26; typical (one visit, answered): 9 + 2 = 11 | 16 people x 26 = 416 at most, all in the arrival window | users 9 x (2 create + 1 release) = 27; events 3 x (1 create + 2 updates + 1 delete) = 12; registrations 8; sessions 9; seated fixture 4 (member read, round insert, seat insert, round delete); readiness row checks 4; cleanup deletes 6; app traffic about 10 page loads x 10 = 100 (UNVERIFIED): 27 + 12 + 8 + 9 + 4 + 4 + 6 + 100 = 170 |
| Egress (bytes) | worst: 2 visits x (2 feeds x 50 x 1.5 KB + 2 KB canvas + 5 x 1 KB) = 2 x 157 KB = about 314 KB; with no preparation offered about 4 KB a visit | 16 x 314 KB = about 5 MB | 170 requests x about 2 KB = about 340 KB (the e2e events offer no preparation) |
| Log lines | 0: a failed read or save shows Ready or lets the person in and logs nothing (no console call in `EventRoomReady.tsx`, `ReadyStepBar.tsx` or `use-seated-at-running-round.ts`) | 0 | 0 expected |

Against main: the mastermind had no `/ready`, so its visit is new traffic (9 to 26 requests per attendee per
evening), of which the Learn and Canvas reads repeat what its `/meet` makes on every load. Clarity Night already made
the room-row read, the marks and, on every Continue, the save and re-read; it now adds the seat read (1) and drops the
save and re-read on Skip or an untouched Continue (0 instead of 2).

The e2e runs against the self-hosted TEST server only (`assertSelfHostedTest`), which has no per-request billing
(as P1529's seed room); it is run at ship, by hand, never on a schedule.

1. **Fits the plan limit today?** Supabase Free plan row: egress 5 GB a month. Monthly = (evenings a month) x
   16 x 314 KB; at 4 evenings a month that is 4 x 5 MB = about 20 MB, which fits. Requests are not a billed unit on
   the row. Fits.
2. **Fits at 10x?** 160 people x 314 KB x 4 evenings = about 200 MB a month: fits.
3. Neither answer is no, so no upgrade is named.

## Acceptance Criteria

- [ ] A first-time mastermind attendee who taps "I'm here" (and has prepared, or joins without preparing)
      lands on `/events/:slug/ready`, with Ready before Principle in the step bar.
- [ ] Moving the slider and tapping Continue stores that value and lands in `/meet`. Re-entering the room
      goes straight to `/meet`.
- [ ] Tapping Skip stores no readiness value (`readiness_value` stays null; check the row) and lands in
      `/meet`. Re-entering the room on the same device goes straight to `/meet`.
- [ ] Tapping Continue without moving the slider stores no value, on the mastermind and on Clarity Night.
      This is the regression check for the fabricated 5.
- [ ] With browser storage throwing, Skip still lands in `/meet`.
- [ ] After skipping, tapping Ready in the step bar opens it, and answering stores the value.
- [ ] The skip marker is per person: a second profile on the same browser is sent to Ready.
- [ ] A touched Continue whose save fails lands in `/meet` and re-entry goes to `/meet`.
- [ ] A person seated at a running round who opens `/ready` (by the gate or a tap) is forwarded to `/meet`.
- [ ] The mastermind's `/ready` step bar shows Learn and prepare, Ready, Principle, Canvas (when made at the
      event), Table and Review (founder 2026-11-24), and no Compare.
- [ ] The mastermind's host entering the room goes to `/meet`, not `/ready`.
- [ ] After a skip, `/meet`'s step bar shows no done tick on Ready.
- [ ] Clarity Night: same order and copy as before, plus Skip.
- [ ] Hike: still no Ready (`/ready` forwards to `/meet`).
- [ ] Screenshots of `/ready` and `/meet` for the mastermind at 320px, 375px and desktop, with and without
      the Canvas step: no overflow, clipping or overlapping labels (visual QA checklist, separate reviewer).
- [ ] Clarity Night's `/ready` and `/meet` at 375px look as before apart from the Skip button (screenshot pair).
- [ ] All existing P1529, P1307, P1562, P1542, P1433 and P1114 tests pass, with the changes listed in
      Surfaces in Scope.

## Spec Review (2026-11-23)

Gemini, GLM and Opus reported; Codex did not (usage limit). Folded after checking each claim against the
code: the Ready screen's bare step bar (R7), the per-person skip key (R4), the failed-save row (R4), the
seated-at-a-running-round case (R8), the host in the dots (R9), the false done tick (R10), double taps
(R3), the invariant scoped to new values, and the amended carried invariant. Dropped after checking: the
`series-recipes.ts` line numbers (correct at HEAD; the reviewers' excerpt was renumbered), the hidden-steps
assertion order (the test sorts), "a midpoint tap records nothing" (pointer down always emits), and
`EventPrepPage.tsx:693` as a mastermind surface (it never renders there, `prepare.words` is null).

A shorter "Learn and prepare" is still a `[FOUNDER DECISION: copy]`, needed only if the screenshots show a break.
