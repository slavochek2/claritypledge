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
 Learn and prepare · Ready · Principle · Canvas* · Table · Feedback      (mastermind)
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
| Skipped, later taps Ready in the step bar and answers | their value | n/a | straight to `/meet` |
| Skipped on one phone, opens the room on another | nothing | nothing there | Ready once more; acceptable |

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
  value was already stored. An untouched Continue behaves exactly like Skip.
- **R4. A skip is remembered for the evening.** Skip, or an untouched Continue, remembers "skipped Ready for
  event X" in browser storage, keyed by event id. `EventRoomGate` treats that as a return visit and sends
  the person to `/meet`. Reads and writes are wrapped in try/catch. With no storage the page still works
  and the person may see Ready again.
- **R5. Step bar on phones.** The mastermind's bar holds up to six steps: Learn and prepare · Ready ·
  Principle · Canvas · Table · Feedback. It must render without overflow or clipping at 320px, 375px and
  desktop, with and without the Canvas step. If "Learn and prepare" breaks the row at 375–430px, a shorter
  label is a `[FOUNDER DECISION: copy — shorter label for "Learn and prepare"]`. Do not pick one.
- **R6. Clarity Night keeps its order and copy.** It also gets Skip and save-only-if-moved: **founder decision 2026-11-23, yes**. The fabricated 5 exists on Clarity Night too, and one
  shared screen with two behaviours is a second state to keep in step. This amends P1529's invariant
  "Clarity Night and Social Hike are unchanged ... their existing tests pass unchanged" for this one
  screen; the Ready-screen tests that pin Clarity Night's Continue would change. The
  founder accepted this amendment.

## Invariants

- **Readiness is a note, never a gate.** No path may leave a person unable to reach `/meet` from Ready:
  not a failed save, not missing storage, not offline-with-a-stored-state.
- **No fabricated answers.** A stored readiness value always comes from a slider the person moved. That
  includes a value set on an earlier visit.
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
  unchanged. An event with no series and no flow gets Clarity Night's flow.
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
- **Non-Goal:** no host-side view of readiness, no skip count, no change to the distribution RPC.

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
- `src/app/prototypes/events/components/EventRoomReady.tsx` (Skip, save-only-if-touched, remember skip)
- `src/app/prototypes/events/components/EventRoomGate.tsx` (a remembered skip counts as a return visit)
- Tests that pin the mastermind's hidden steps:
  - `src/tests/p1529-round-screen.test.tsx:953` expects `['compare', 'ready']`; this becomes `['compare']`
  - Ready screen tests: `src/tests/p1307-ready-screen.test.tsx`, `src/tests/p1562-ready.test.tsx`

**Out of scope:**
- The standalone `/ready` page (`src/app/pages/ready-page.tsx`)
- Hike recipe and hike room
- Host panel, projector, seating
- `RoomSteps.tsx` layout, unless R5's screenshots show a break. Then only the label, by founder decision.
- `e2e/p1529-mastermind.spec.ts` enters the room by `/meet` directly, so it is not expected to change. Verify by running it.

## Acceptance Criteria

- [ ] A first-time mastermind attendee who taps "I'm here" (and has prepared, or joins without preparing)
      lands on `/events/:slug/ready`, with Ready before Principle in the step bar.
- [ ] Moving the slider and tapping Continue stores that value and lands in `/meet`. Re-entering the room
      goes straight to `/meet`.
- [ ] Tapping Skip stores no readiness value (`readiness_value` stays null; check the row) and lands in
      `/meet`. Re-entering the room on the same device goes straight to `/meet`.
- [ ] Tapping Continue without moving the slider stores no value. This is the regression check for the
      fabricated 5.
- [ ] With browser storage throwing, Skip still lands in `/meet`.
- [ ] After skipping, tapping Ready in the step bar opens it, and answering stores the value.
- [ ] The others' dots include no value for a person who skipped.
- [ ] Clarity Night: same order and copy as before, plus Skip.
- [ ] Hike: still no Ready (`/ready` forwards to `/meet`).
- [ ] Screenshots of `/ready` and `/meet` for the mastermind at 320px, 375px and desktop, with and without
      the Canvas step: no overflow, clipping or overlapping labels (visual QA checklist, separate reviewer).
- [ ] Surfaces not in scope are visually unchanged.
- [ ] All existing P1529, P1307, P1562 and P1542 tests pass, with the hidden-steps assertion updated as
      listed above.

## Next Steps

- Founder decisions answered 2026-11-23: R6 yes, Skip label "Skip". A shorter "Learn and prepare" is
  still a `[FOUNDER DECISION: copy]`, needed only if the screenshots show a break.
- Then `/dev` in a worktree. The changes are targeted, and the main checkout has another session's
  uncommitted edits in `series-recipes.ts` (P1675).
