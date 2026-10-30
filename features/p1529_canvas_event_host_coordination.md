---
status: week
type: story
rank: 84
workstream: clarity-canvas
created_date: '2026-10-21'
tags: [events, host, canvas, sales-mastermind]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, create-spec.2]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
blocked_by: [p1536, p1592]
---

# P1529: The sales mastermind's own event room and host flow

## Problem

**Situation:** The event room and host screen were built for Clarity Night (P1337, P1430). The host
seats people into tables of 2-4 by their largest disagreement on public points carrying the event
tag (`src/app/data/compare-service.ts:27`), gives each seat a role (`first`, `second`, `observer`:
`supabase/migrations/20261002183700_p1337_event_rounds.sql:55`), and can swap the two speakers at
half time. A round has an observer phase (`observer_s`). Starting a round needs no points
(`host_start_round`, `20261004183000_p1337_round_minutes.sql`). A round ends only when the host starts
the next one or ends the rounds (P1592, citing P1337). Prepare, room and close steps come from a
per-series recipe (P1542, shipped), chosen by `recipeFor(seriesSlug)` at 28 call sites outside tests.

**Complication:** The sales mastermind (`docs/goals.md` 3a; session 1 around 2026-11-10, session 2
online two weeks later) runs a different loop on each attendee's Clarity Canvas
(`docs/events/sales-mastermind.md`, rewritten 2026-10-30). Run on today's room, attendees do not know
whose canvas a table is about, the half-time swap moves to the other canvas instead of to the
challenge, people without a canvas have no place, and the Clarity Canvas owner has no in-event way to
turn the conversation into a new version. The founder ruled that this is built **before** session 1
(2026-10-30, replacing decisions.md 2026-10-29 "built only if session 1 shows the need"):

> Founder, 2026-10-30: "We know that the room needs it because we need to assign the rounds,
> otherwise they don't get created, people don't know who speaks to whom and so on. There is
> confusion so we need it."

> Founder, 2026-10-30: "the question is not what it can or can not do but instead what value the
> user expects and how we deliver it."

> Founder, 2026-10-30: "instead of explaining to everybody that they should go find the right thread
> and then within the event chat channel and then forward to mirror and blah, blah, blah, this is all
> part of it, needs to be simpler and easier, streamlined, no? For the event."

> Founder, 2026-10-30, on keeping the app out of the conversation: "/live with the sliders and so on
> proved to be a pretty complex interface and people were struggling to comply … they want to talk to
> each other. They don't want to look at the app."

**Question:** What do an attendee and the host see, from preparation to the last round, so that each
Clarity Canvas owner leaves every conversation with a better canvas, the next partner reads that
better version, and nobody needs the founder to guide them by hand, while the app stays out of the
conversation itself?

**The value, in one sentence:** a Clarity Canvas owner leaves each conversation with a better canvas,
without paperwork; the next person reads the better version, so the owner can watch their canvas get
easier to understand.

## Appetite

**Blast radius: high.** The event room, host screen and recipe selection serve every event. Clarity
Night and Social Hike must behave exactly as today.

**Reversibility: medium.** Additive migrations (a flow per event, the event's canvas per attendee, an
observer flag, version-open records, an update-step state) plus a new flow behind the series. Turning
the flow off returns an event to Clarity Night's flow.

**Decision density: low.** The product model was settled 2026-10-30 (Decisions below). Copy remains
(marked `[FOUNDER DECISION]`), plus one open question on session 2 being online.

## Decisions (founder, 2026-10-30)

| # | Ruling |
|---|---|
| D1 | **One canvas per round.** Each table has one Clarity Canvas owner and their partner, plus zero, one or two observers. A round's thread is about one canvas. |
| D2 | **A new partner every round; everyone with a canvas is the Clarity Canvas owner once before the canvas update and once after.** Rounds 1-2: each owns in one and partners in the other. Rounds 3-4: the same, on the new version. Nobody repeats a partner within a session. Who owns in round 3 may differ from round 1 (strict round-by-round alternation splits the room into two fixed halves, and at 6 people makes a fourth new partner impossible; verified by exhaustive search 2026-10-30). Chosen over "one partner, both canvases" because one weak match then touches a quarter of the evening, and every version is read by someone who has not seen it. |
| D3 | **The rules are spoken, not in the app.** The lanyard card shows whose meaning the pair is focusing on (the Clarity Canvas owner's, or their partner's challenge), not who talks. Their partner explains back; the Clarity Canvas owner says a number out loud; above 8 their partner may challenge; the owner can switch the focus back at any time; in a challenge the owner explains it back until their partner says above 8. The observer keeps the rules. **No sliders, no scores, no "allow challenge", no phase in the app.** |
| D4 | **Say your number out loud.** The transcript keeps the scores, so the evening is measured later from the round threads (P1390), not in the app. |
| D5 | **Observers.** Anyone without a canvas shared with the event joins as an observer (the curious, mentors, the unprepared), and canvas holders observe a round when numbers are odd. The observer keeps the pair to the rules and gives critical feedback on content and communication at the end of the round (the round's existing observer time). The host can override who is an observer, per person. A table may have none, one or two. |
| D6 | **A new version between rounds, in both sessions.** When their round ends the Clarity Canvas owner taps "Make my next version"; their round's words feed their mirror (P1536 engine). At the canvas-update step the owner **publishes the draft as it is**; marking a stance on changed boxes is optional and never blocks Publish ("He can just publish without putting the stance on boxes"). Owners do not refine with the mirror at the event; refining comes after it. The next partner opens the published version. |
| D7 | **Stances are optional, before or after Publish.** On a draft (P1536 D20, being built) or on the published version. Engine-written new and reworded points start with no stance; a reworded box shows as changed, with no notification. Owned by P1536. |
| D8 | **A third flow, not a changed Clarity Night.** The series chooses the flow by default (Clarity Night, Social Hike, Sales Mastermind); the host can switch it per event on the host screen **until round 1 starts**, never after. This deliberately overrides P1542's Non-Goal "no per-event overrides". |
| D9 | **Preparation in the event room, every step visible.** Draft your canvas with your mirror (or pick one you already have), publish it, then share it with this event as its own tap. "Your canvas for this event" can be changed until round 1 starts; it is fixed from then. Nothing is shared in the background. |
| D10 | **Round threads say whose canvas they are about**: "{round label} · {owner}'s canvas, with {partner}". Amends P1592 D3 for this flow only. |
| D11 | **No hand-made fallback** for canvas drafting or new versions. |
| D12 | **Words:** Clarity Canvas owner, their partner, observer. Never bare "owner" in attendee copy; never "reader". |
| D13 | **Partners' and observers' words feed the Clarity Canvas owner's next draft.** This overrides P1536's invariant clause "A partner's reasons reach a canvas only through the partner-approved story request (P1574)" for the in-event update only. The canvas still never quotes or names another person. The terms and the recording consent gain, before session 1: "In a discussion round, what you say can be used by that round's Clarity Canvas owner's AI mirror to draft their next version." |
| D14 | **The partner marks the boxes they'd bet against on the canvas itself**, with the canvas's existing position controls, during the silent reading; the canvas's existing Compare view then shows where they differ. The canvas page is theirs to use throughout the round; nothing new is built for marking. ("the Clarity Canvas has the compare feature already … if I look at the canvas I can click on anything and set my position.") |

## Invariants

- **Clarity Night and Social Hike are unchanged.** An event whose flow is not Sales Mastermind
  renders, seats, titles its round threads and records exactly as today; their existing tests pass
  unchanged. An event with no series and no flow gets Clarity Night's flow.
- **One flow resolver.** Every surface that today calls `recipeFor(seriesSlug)` reads the event's
  effective flow through one function; a test fails if `recipeFor(` is called anywhere else. The flow
  selects the whole recipe: prepare, room and close.
- **The event room never stands between two people talking.** During a round, the event room screen
  shows who they are with, their role, the rule reminder and a link to the canvas, and asks for nothing.
  The canvas page itself (positions, Compare) is the partner's and owner's to use at any time (D14).
- **The flow and "your canvas for this event" are fixed once round 1 starts.** The server refuses a
  change after that. "Round 1" means the first counted round everywhere, client and server (a host's
  Demo round is not counted, `round-numbering.ts`).
- **One canvas per attendee per event.** Replacing it before round 1 is one server transaction
  (unshare the old, share the new, set the selection), serialised against round 1 starting.
- **Nobody is seated as Clarity Canvas owner without a published canvas shared with this event.**
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

## Solution

### 1. The flow belongs to the event, defaulted from its series (D8)

- Each event has a flow: Clarity Night, Social Hike or Sales Mastermind. The default comes from
  `events.series_slug` (set by the service role only, P1403). A `sales-mastermind` series key and the
  mastermind recipe are added. **The test event `sales-mastermind-test` has no series today**
  (`series_slug` null, read on TEST 2026-10-30); setting it is part of this work.
- **One resolver** replaces `recipeFor(seriesSlug)` at all 28 call sites (Invariants).
- **The host's switch** is one row at the top of the host screen's settings: "Event flow: {flow} ▾".
  Choosing another flow applies at once with an Undo toast; no Apply button (a disabled Apply is a dead
  control, P955). The row disappears once round 1 starts; the server refuses later switches.
- **Switching keeps data.** Per-attendee canvas selections and observer overrides stay stored when the
  host switches away, and apply again if the host switches back or undoes.
- **The mastermind recipe:** preparation is optional for observers, so the preparation gate never
  blocks someone without a canvas (`gatesRoomOnPreparation`, `series-recipes.ts:252`). The room's step
  bar is Principle · Table (no Ready, no statement Compare). No close in the app for session 1: the exit
  card is on paper (run-of-show).

`[FOUNDER DECISION: the row's label and the three flow names as the host sees them.]`

### 2. Before the event: "Your canvas for this event" (D9, D5)

The mastermind's preparation (P1402 pages via the recipe):

1. The evening's communication norm (existing step).
2. **Your canvas**, each step its own tap:
   - **Pick one you already have**, if you have a published canvas, or **draft it with your mirror**
     (opens P1536's canvas workspace; Back returns to this step).
   - **Publish** in the workspace (P1536's Publish).
   - **Share with this event's attendees** (P1515's event share, one tap here).
3. Once done: "Your canvas for this event: {canvas name} · Change". **Change** picks another canvas or
   starts a new one, as one transaction (Invariants); the previous canvas visibly stops being shared with
   this event. Gone once round 1 starts.
4. **Without a canvas**, the step says you will join as an observer and what an observer does. Nobody is
   turned away for not preparing.

`[FOUNDER DECISION: the step's labels, the observer line, and the Change confirmation text.]`

### 3. Who is an observer (D5)

- **Default:** an attendee with no canvas shared with this event.
- **Host override:** an Observer switch per person on the host screen. Flipping someone to participant
  is allowed only if they have a published canvas shared with this event; otherwise the switch says
  what is missing. A person whose canvas arrives before round 1 starts becomes a participant on their
  own.
- Canvas holders observe for one round when the numbers force it (§4). They get a real seat with role
  `observer` at a table, never "sitting out" (P1592 posts a sitting-out person's words to the event
  channel, not to the round thread).

### 4. Seating (D1, D2, D5)

The host's preview seats each round under these rules, **in this priority order**, and names every
rule it could not meet so the host decides:

1. Each table: one Clarity Canvas owner and their partner, plus up to two observers. Observers are
   spread; a table with none is fine. More observers than seats is shown as unseated people.
2. No repeated partner within this session.
3. Everyone with a canvas owns once in rounds 1-2 and once in rounds 3-4. With an odd number, one
   canvas holder observes each round, rotated so nobody observes twice; then at most all but one own
   on both sides (at 5 canvas holders, at most 4).
4. Avoid partners from the previous session of the same series (session 2). A preference, not a
   promise: across two sessions a person needs 8 different partners, so with fewer than 9 canvas
   holders some repeats are unavoidable; the preview names them. Sessions are linked explicitly (a
   session-2 event points to its session 1), never inferred from "the previous event of the series".

The existing preview, Shuffle and "Tap two names to swap them" stay. Pairing by canvas content is not
in this spec. Clarity Night controls with no meaning here (topic per round, disagreement gap, recorders
together) are hidden in this flow.

`/dev` builds the seating as a pure, unit-tested function. Fixtures: 5 to 12 canvas holders, odd and
even, 0 to 6 observers, someone leaving mid-session, session 2 against session 1's history; for every
infeasible fixture, the expected output names the broken rule.

### 5. A round, as people see it (D1, D3, D14)

The event room screen shows each seated person, and asks nothing:

- **Their role and whose canvas it is**: "You're the Clarity Canvas owner: {partner} is your partner",
  "You're {owner}'s partner", or "You're observing {owner}'s Clarity Canvas with {partner}".
- **For their partner and observers, a link** to the owner's newest published version (P1515 phase 5).
  Opens are recorded (Invariants).
- **A one-line rule reminder** for their role, as on the lanyard card.

On the canvas page, their partner marks the boxes they would bet against with the existing position
controls during the silent reading, and the pair can use Compare to see where they differ (D14).

The half-time speaker swap does not apply in this flow. The round's observer time is the observer's
feedback (about two minutes). Reusing the `first`/`second`/`observer` roles is `/dev`'s call.

`[FOUNDER DECISION: the three role lines and the rule reminders.]`

### 6. The next version (D6, D7, D13)

- **When it can be tapped.** "Make my next version" appears for a Clarity Canvas owner once their
  round's clock is over or the next round has started, and stays until their next owning round starts.
  The event room's no-input rule applies to round time, not to this.
- **What the tap does** (no new P1536 input path; confirmed by the P1536 session 2026-10-30 against its
  selector, `_canvas_draft_effective_input`, w1 `20261030080000`):
  1. opens a draft from the owner's newest version (`canvas_workspace_send`);
  2. copies the round thread's messages into that draft's thread as **owner-authored forward copies**,
     carrying the original authors' `derived_refs` the way `forward_chat_message` does (the selector reads
     only copies authored by the owner in the draft's own thread);
  3. sends one short owner message that triggers the run. `[FOUNDER DECISION: its wording, e.g. "Update
     from round 2".]`
- **Only readable material.** Lines the owner cannot read (a late RSVP's lines posted to the event
  channel instead of the thread, P1592) are not copied. Long rounds may be cut to fit the run's
  context; the mirror's reply says so (P1536).
- **No recording at the table.** If the round has no thread or no transcribed line, the button is not
  shown; the owner sees "No recording from this round", and keeps their current version.
- **At the canvas-update step**, the owner's screen shows one task: **publish your new version**,
  with its state: drafting · ready · failed ([Try again], P1536's retry) · published. Stances are
  optional afterwards (D7). An owner who does not publish keeps their current version, and their next
  partner reads that.
- **No P1536 fast-path wording.** P1536 v6 D13 removed "What I decided on my own".

### 7. The host's screen (D8, D5)

- Before round 1: the flow row (§1) and the observer overrides (§3).
- Per table during a round: owner, partner, observers.
- **A canvas-update step**, started by the host after round 2, stored as its own state so talk during it
  is not mistaken for round 2. It shows each owner's update state (not tapped · drafting · ready ·
  failed · published). The host starts round 3 when ready, and may start it with some owners still on
  their old version.
- Controls kept from today: seating preview, Start round, Extend, End rounds, mark someone left.

### 8. Round thread names (D10)

P1529 owns a change to P1592's round-title function (worktree w5, `20261029180000_p1592_...sql`), scoped
to the Sales Mastermind flow: "{round label} · {owner}'s canvas, with {partner}", using the counted round
label. Observers stay thread members (as P1592 rules) and are not in the title. Clarity Night titles stay
"Round n · A & B", guarded by a regression test. P1592's erasure rule on copies of a round title
("Copies of a round title carry only 'Round {n}'") is kept.

### Measurement

A founder-only results script (same pattern as `scripts/event-close-results.sh`) prints:

- Per Clarity Canvas owner: each version opened by each partner, per round.
- Per owner: how many changed boxes carry the owner's own stance by the end of the session (optional,
  so this counts how many chose to stand behind the mirror's changes, not a completion rate).
- **Not here:** the spoken numbers. They stay in the round threads, counted later through P1390.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Session 1 is ~11 days away and this sits on P1536 (in `/dev`, w1) and P1592 (in `/dev`, w5) | MITIGATE | Build order: flow resolver, observers and seating first (no dependency), then the round screen, then the next-version tap and update step. P1542's recipes shipped (`features/done/2026-06-10/p1542_series_prepare_close_recipes_social_hike.md`). |
| P1592's channel posting ships off (`transcribe_channel_posting.enabled = false`) | MITIGATE | Done-When: posting enabled on prod before session 1, with P1592's own pre-deploy checks. |
| Round 2's owners must draft and publish inside the 12-minute update step; ~12 runs at once; P1536 latency UNVERIFIED (its v6: "~30-60 s", runs over 5 minutes fail) | MITIGATE | Done-When measures end-to-end latency on TEST with a 24-minute thread and 12 parallel runs. The host sees per-owner states and may start round 3 without everyone. |
| Stances on drafts need P1536 S3 (D20, not started) | ACCEPT | Stances are optional (D6); publishing does not depend on them. |
| The terms change (D13) is not live by session 1 | MITIGATE | Done-When; without it, the in-event update stays off for that event. |
| People do not say their number out loud | MITIGATE | The opener, the observer and the lanyard card carry the line. |
| A pair breaks the rules | ACCEPT | The observer's job; tables without one rely on the pair (D3). |
| An owner unshares their canvas via P1515 after round 1 | MITIGATE | Their partner's link shows "This Clarity Canvas is no longer shared"; the host can re-seat. The owner's right to stop sharing is not overridden. |
| Session 2 is online, and the room assumes physical tables | DEFER | Open Questions 1. |
| 10x the group size exceeds P1536's shared canvas bucket (P1536 D18) | ACCEPT | See Cost Budget; raise D18 before a larger event. |

**Non-Goals**
- Do NOT add sliders, scores, an "allow challenge" control or any phase tracking to the round (D3).
- Do NOT build anything new for marking boxes; the canvas's position controls and Compare serve (D14).
- Do NOT change Clarity Night's or Social Hike's room, host screen, seating, titles or close.
- Do NOT pair by canvas content.
- Do NOT score automatically from the transcript (P1390).
- Do NOT build the homework path outside the event (P1500), the drafting engine, Publish or stances on
  drafts (P1536), or round threads (P1592), beyond the title change in §8.
- Do NOT publish, share or start a draft without the owner's tap.
- Do NOT allow switching the flow, or the event's canvas, after round 1 starts.

## Cost Budget

Drafting runs are Gemini calls through P1536's canvas key. Per run, this uses P1536 v6's estimate from
the public price list, ≈ $0.10 (UNVERIFIED; P1536's `/dev` owns the real reading, kept with P1536).
The binding limit is P1536 D18's shared canvas bucket.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Drafting runs | 2 owned rounds x 1 run (no refining at the event, D6) = 2 per session, plus 1-3 for the first draft on the preparation day | 12 owners x 2 runs / 2.4 h = 10 runs | 0 (model stubbed in e2e) |
| Gemini cost | 2 runs x $0.10 = $0.20 per session; first draft 3 x $0.10 = $0.30 | 10 x $0.10 = $1.00 | $0 |
| Database writes | flow, observer flag, event canvas, ~8 version opens, ~4 update states ≈ 15 | 16 people x 15 / 2.4 h = 100 | ≈ 15 per seeded attendee |

1. **Fits the plan limit today?** Event day: 12 owners x ($0.20 + $0.30 if they draft that day) 
   against the daily bucket. Fits. Supabase: about 100 writes an hour, no new Realtime traffic beyond the room's.
2. **Fits at 10x?** 120 owners x $0.50 on one day: over the bucket. Does not fit without raising D18.
3. **Failure cost:** a failed run is charged as P1536 rules; [Try again] is a new run.

## Acceptance Criteria

Checked on TEST with a Sales Mastermind event, the host, six attendees with canvases and two without,
then repeated with five with canvases.

- [ ] An event in the `sales-mastermind` series opens the mastermind flow; a Clarity Night event and a
      Social Hike event open exactly as before, including their round thread titles (screenshots and
      existing tests).
- [ ] The host switches an event's flow before round 1 with Undo; prepare, room and close all follow;
      switching back restores selections and overrides; after round 1 starts, the row is gone and a
      direct call is refused.
- [ ] An attendee picks an existing canvas or drafts one, publishes it, and shares it with the event,
      each as its own tap; the step then reads "Your canvas for this event: {name} · Change".
- [ ] Change before round 1 replaces the shared canvas in one step; after round 1, Change is gone.
- [ ] An attendee without a canvas is told they will observe and is not blocked by preparation; the host
      flips an observer with a shared canvas to participant; flipping one without a canvas is refused
      with a reason.
- [ ] Six with canvases, two observers, four rounds: one owner and one partner per table, nobody repeats
      a partner, everyone owns once in rounds 1-2 and once in rounds 3-4. Five with canvases: one
      observes each round, rotated, and the preview names who owns only once.
- [ ] During a round the event room screen shows only role, whose canvas it is, the rule reminder and
      the canvas link, and asks for nothing; on the canvas page their partner sets positions and opens
      Compare.
- [ ] An owner taps "Make my next version" after their round's clock is over; at the canvas-update
      step they publish the draft as it is; their next partner opens the published version.
- [ ] A table with no recording shows "No recording from this round" and no button.
- [ ] The host starts the canvas-update step, sees each owner's state, and can start round 3 with an
      owner still drafting.
- [ ] The mastermind round thread is titled "{round label} · {owner}'s canvas, with {partner}".
- [ ] Session 2, linked to session 1, avoids session-1 partners where the group allows, and the preview
      names each repeat.

## Done-When

- [ ] All Acceptance Criteria ticked with evidence (screenshots at 375px, 320px and desktop, plus query
      output).
- [ ] The seating function's fixtures pass, including the expected output for infeasible ones.
- [ ] The grep test fails if `recipeFor(` is called outside the resolver.
- [ ] Drafting latency measured on TEST: a 24-minute round thread, 12 runs at once, tap to ready. Result
      recorded here.
- [ ] The terms, privacy policy and recording consent carry the D13 sentence on TEST. `[post-deploy]`
      live on prod before session 1.
- [ ] P1592 channel posting enabled on TEST with this flow. `[post-deploy]` enabled on prod before
      session 1.
- [ ] `sales-mastermind-test` carries the `sales-mastermind` series on TEST. `[post-deploy]` the prod
      event is created in the series.
- [ ] The results script prints, per owner, the versions opened and the stance count, on a seeded TEST
      session.
- [ ] P1390 carries a note that the mastermind's spoken scores are its first real input (D4).

## Open Questions

1. **Session 2 is online.** How do pairs talk, and do they use the event room next to a video call?
   Changes whether the round screen needs a "join the call" link and whether lavalier transcription
   works at home. `[FOUNDER DECISION]` Not needed for session 1.
2. **Do observers wear a lavalier?** Recommended yes: their feedback then reaches the owner's round
   thread and the next version. `[FOUNDER DECISION]`
3. **Which goal 3a signal to keep.** "Their canvas changed between the sessions" now moves almost by
   itself. Candidate replacements: owners mark their stance on most changed boxes; the first spoken
   number on v2 is higher than on v1 in the same evening. `[FOUNDER DECISION]` (goals.md unchanged
   until ruled).

## Fallback

- **Transcript not ready after a round (2026-10-30, from P1596).** If a table's clean transcript is
   late or fails, nothing blocks: the owner does not get a new version that round and the next
   partner reads the canvas as it is. The host's "next round" confirmation is what cuts a round's
   transcript; the hands-up ritual precedes it (`docs/events/facilitator-checklist.md`). Transcription
   is one tap for the whole event.

## Related

- Run-of-show: `docs/events/sales-mastermind.md`. Goal: `docs/goals.md` 3a.
- P1536 canvas drafting, versions, Publish, stances on drafts (D20), on branch
  `feature/p1536-canvas-draft-versions`.
- P1592 transcripts land in round threads (D10 amends its D3 for this flow).
- P1542 per-series recipes, shipped: `features/done/2026-06-10/p1542_series_prepare_close_recipes_social_hike.md`.
- P1500 the homework path outside the event. P1390 scores from the transcript (later; D4).
- P1515 sharing a canvas with an event · P1508 Clarity Canvas · P1337 event rounds · P1430 round labels
  and preview · P1574 partner story requests (D13 overrides its gate for the in-event update).
- Reviews 2026-10-30: Gemini 4 Argon (14 findings), Codex (19), Opus (17); every finding folded in
  here was checked against the files, and Codex's P1536 finding was set aside because its sandbox read a
  stale copy.
