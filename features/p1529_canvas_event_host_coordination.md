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
(`host_start_round`, `20261004183000_p1337_round_minutes.sql`).

**Complication:** The sales mastermind (`docs/goals.md` 3a; session 1 around 2026-11-10, session 2
online two weeks later) runs a different loop on each attendee's Clarity Canvas
(`docs/events/sales-mastermind.md`, rewritten 2026-10-30). Run on today's room, attendees do not know
whose canvas a table is about, the half-time swap moves to the other canvas instead of to the
challenge, people without a canvas have no place, and the owner has no in-event way to turn the
conversation into a new version. The founder ruled that this is built **before** session 1, not after
it (2026-10-30, replacing decisions.md 2026-10-29 "built only if session 1 shows the need"):

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
owner leaves every conversation with a better canvas they stand behind, the next partner reads that
better version, and nobody needs the founder to guide them by hand, while the app stays out of the
conversation itself?

**The value, in one sentence:** an owner leaves each conversation with a better canvas, without
paperwork; the next person reads the better version, so the owner can watch their canvas get easier
to understand.

## Appetite

**Blast radius: high.** The event room and host screen serve every event. Clarity Night and Social
Hike must behave exactly as today.

**Reversibility: medium.** Additive migrations (a flow per event, the event's canvas per attendee, an
observer flag, the version a round's partner opened) plus a new flow behind the series. Turning the
flow off returns an event to Clarity Night's flow.

**Decision density: low.** The product model was settled 2026-10-30 (Decisions below). Copy remains
(marked `[FOUNDER DECISION]`), plus one open question on session 2 being online.

## Decisions (founder, 2026-10-30)

| # | Ruling |
|---|---|
| D1 | **One canvas per round.** Each table has one Clarity Canvas owner and one partner, plus zero, one or two observers. A round's thread is about one canvas. |
| D2 | **A new partner every round, alternating owner and partner** (the chain). Each person with a canvas owns in one round and partners on someone else's canvas in the next. Over four rounds everyone with a canvas owns twice and partners twice, with four different people. Chosen over "one partner, both canvases" because one weak match then touches a quarter of the evening, and every version is read by someone who has not seen it. |
| D3 | **The rules are spoken, not in the app.** One speaker and one listener at a time; the partner may challenge after the owner says above 8 out of 10; the owner can take the speaker role back at any time; in a challenge the owner explains back until the partner says above 8. Lanyard speaker / listener cards from Clarity Night show the roles; the observer keeps the rules. **No sliders, no scores, no "allow challenge", no phase in the app.** ("We are not changing the subject, we're just changing the rules of what people are allowed to do.") |
| D4 | **Say your number out loud.** The transcript keeps the scores, so the evening is measured later from the round threads (P1390), not in the app. |
| D5 | **Observers.** Anyone without a canvas shared with the event joins as an observer (the curious, mentors, the unprepared), and canvas holders sit out a round as observers when numbers are odd. The observer keeps the pair to the rules and gives critical feedback on content and communication at the end of the round (the round's existing observer time). The host can override who is an observer, per person. A table may have none, one or two. |
| D6 | **A new version between rounds, in both sessions.** When their round ends the owner taps "Make my next version"; their round thread (P1592) feeds their mirror (P1536 engine). At the update step the owner **publishes the draft as it is**, then may mark their own stance on changed boxes; marking is optional and never blocks Publish ("He can just publish without putting the stance on boxes"). Owners do not refine with the mirror at the event; refining comes after it. The next partner opens the published version. |
| D7 | **Stances are optional, before or after Publish.** The owner may mark a stance on a draft (P1536 D20, being built) or on the published version; a box the mirror rewords loses its stance and shows as changed, with no notification (engine-written new and reworded points start with no stance). Publish never waits for stances. Owned by P1536. |
| D8 | **A third flow, not a changed Clarity Night.** The series chooses the event-room and host flow by default (Clarity Night, Social Hike, Sales Mastermind). The host can switch it per event on the host screen **until round 1 starts**, never after. Builds on P1542's per-series recipes. |
| D9 | **Preparation in the event room, every step visible.** Draft your canvas with your mirror, publish it, then share it with this event as its own tap. "Your canvas for this event" can be changed, or replaced by a new one, until the event starts; it is fixed from round 1. Nothing is shared in the background. ("we shouldn't do things in the background or hidden … every step should be clear and visible.") |
| D10 | **Round threads say whose canvas they are about**: "Round 1 · {owner}'s canvas, with {partner}". Amends P1592 D3 ("Round 2 · Anna & Ben"); P1592 owns the code. |
| D11 | **No hand-made fallback** for canvas drafting or new versions. |
| D12 | **Words:** Clarity Canvas owner, partner, observer. Not "reader". |

## Invariants

- **Clarity Night and Social Hike are unchanged.** An event whose flow is not Sales Mastermind
  renders, seats and records exactly as today; their existing tests pass unchanged. An event with no
  series and no flow set gets Clarity Night's flow, as P1542 rules for recipes.
- **The app never stands between two people talking.** During a round, the attendee's screen shows
  who they are with, their role and a link to the canvas. It asks for no input until the round ends.
- **The flow is fixed once round 1 starts.** A switch after that is refused by the server.
- **"Your canvas for this event" is one canvas per attendee per event**, fixed once round 1 starts.
  Changing it before then is visible to the owner and stops that canvas being shared with the event.
- **Every round records which canvas version its partner opened**, when the partner opens it, and
  never recomputes it. Seating has no history (`host_set_round_seats` deletes and re-inserts, P1592).
  This, with the spoken numbers in the thread, is what makes "did v2 read better than v1?" countable.
- **Sharing never widens.** Partners and observers reach a canvas only through its existing event
  share (P1515: host plus people registered by 12 h after the start, decisions.md 2026-10-21). This
  spec adds no reader and no read policy.
- **Nothing is drafted, published or shared without the owner's tap.**
- **Other people's words never appear in a canvas under their name** (P1536 invariant, carried).
- **Any new surface that names a round uses `roundLabel` / `nextRoundLabel`** (decisions.md P1430
  ruling), never `Round ${roundNo}`.
- **The host is not an attendee in any count** (decisions.md 2026-09-22 ruling on room data).

## Solution

### 1. The flow belongs to the event, defaulted from its series (D8)

- Each event has a flow: Clarity Night, Social Hike or Sales Mastermind. The default comes from
  `events.series_slug`.
- **The host's switch** is one row at the top of the host screen's existing settings (where group
  size lives): "Event flow: {flow} ▾". Choosing another flow applies at once and shows a toast with
  Undo; there is no Apply button (a disabled Apply would be a dead control, P955). The row is shown
  until round 1 starts and is gone afterwards; the server refuses a switch after that.
- A `sales-mastermind` series key exists. **The test event `sales-mastermind-test` has no series
  today** (`series_slug` is null, read on TEST 2026-10-30), so it would fall back to Clarity Night;
  setting it is part of this work.
- The mastermind's preparation and close steps are its P1542 recipe. Where the flow is stored and
  how it selects the room and host screens is `/dev`'s call; prefer the option with fewer moving
  parts, as P1542 does.

`[FOUNDER DECISION: the row's label and the three flow names as the host sees them.]`

### 2. Before the event: "Your canvas for this event" (D9, D5)

The mastermind's preparation (the event room's preparation item, P1402 pages via the P1542 recipe):

1. The evening's communication norm (existing step).
2. **Your canvas.** Three visible steps, each its own tap:
   - **Draft it with your mirror.** Opens P1536's canvas workspace, which asks for material.
   - **Publish** (P1536's Publish).
   - **Share with this event's attendees** (P1515's event share, one tap here instead of the
     canvas's share panel).
3. Once done, the item reads "Your canvas for this event: {canvas name} · Change". **Change** lets
   the owner pick another of their canvases or start a new one; the previous canvas visibly stops
   being shared with this event. Available until round 1 starts.
4. **Without a canvas, the item says you will join as an observer**, and what an observer does. Nobody
   is turned away for not preparing.

`[FOUNDER DECISION: the item's labels, the observer line, and the Change confirmation text.]`

### 3. Who is an observer (D5)

- **Default:** an attendee with no canvas shared with this event is an observer.
- **Host override:** on the host screen, each person has an Observer switch the host can flip either
  way (someone who prepared but prefers to watch; someone whose canvas arrived late). The override is
  per event and is shown in the seating preview.
- Canvas holders become observers for one round only when the numbers force it (§4).

### 4. Seating: one owner, one partner, a new partner each round (D1, D2, D5)

- The host's preview seats the next round so that each table holds one owner and one partner, owners
  alternate (a person who owned last round partners this round), and nobody repeats a partner.
  Observers are spread across tables, at most two per table; a table with none is fine. The existing
  preview, Shuffle and "Tap two names to swap them" stay.
- **Odd number of canvas holders:** one canvas holder observes that round. The host rotates this so
  nobody sits out twice in a session.
- **Arithmetic the seating must honour:** four rounds with no repeated partner needs at least five
  canvas holders; observers do not count. When the present group cannot meet every rule (too few
  people, someone left), the preview names who misses an owning turn or repeats a partner, so the
  host decides; it never silently breaks a rule.
- **Session 2 avoids session 1's partners.** "Haven't met yet" today remembers only rounds of the same
  event (run-of-show § Host and event room). The mastermind's partner history spans the previous
  session of the same series for the same people. How sessions are linked is `/dev`'s call.
- Pairing by canvas content is **not** in this spec; the chain does the work disagreement pairing did
  for Clarity Night. The host's Clarity Night controls with no meaning here (topic per round,
  disagreement gap, recorders together) are hidden in this flow. Group size is 2 plus observers.

`/dev` builds the seating as a pure, unit-tested function, with fixtures for 5 to 12 canvas holders,
odd and even, 0 to 6 observers, someone leaving mid-session, and session 2 against session 1's history.

### 5. A round, as people see it (D1, D3)

Each seated person sees, and nothing more during the round:

- **Their role and whose canvas it is**: "You're the owner: {partner} is your partner", "You're
  {owner}'s partner", or "You're observing {owner}'s canvas with {partner}".
- **For the partner and observers, a link** that opens the owner's newest published version (P1515
  phase 5: no version chosen opens the newest). The version opened is recorded (Invariants).
- **A one-line reminder of the rules** for their role, as on the lanyard cards.

The half-time speaker swap does not apply in this flow: the owner and partner swap speaker and listener
themselves, as often as the rules need. The round's observer time is the observer's feedback (about two
minutes). The round ends on the host's clock. Reusing the `first`/`second`/`observer` roles for owner,
partner and observer is `/dev`'s call.

`[FOUNDER DECISION: the three role lines and the rule reminders.]`

### 6. After the owner's round: the next version (D6, D7)

- When a round ends, its owner sees **Make my next version** (one tap, visible; nothing starts by
  itself). It hands the owner's mirror the round's thread (P1592) as material and drafts from the
  owner's newest version, using P1536's fast path ("make your own decisions", ending with "What I
  decided on my own"; P1536 v6 names this "the event's between-rounds path").
- The owner then partners on someone else's canvas in the next round; the draft is ready by the update
  step.
- **At the update step** (between rounds 2 and 3), the owner's screen shows one task: **publish your
  new version**. Publish is P1536's Publish, and nothing else is required first. After publishing, the
  changed boxes (P1536's per-box Changed mark) invite an optional stance; new and reworded boxes start
  with no stance (P1536 D20). The next partner opens the published version. Owners are told not to
  refine with the mirror at the event (founder, 2026-10-30, relayed by the priorities session).
- An owner who does not publish keeps their current version; their next partner reads that. Nothing
  publishes on its own.
- Round 2's owners tap as round 2 ends; the fast path is meant for that window (P1536: "2.5-hour event:
  no time for a slow pass").

### 7. The host's screen (D8, D5)

- Settings before round 1: the flow row (§1), observer overrides (§3).
- Per table during a round: owner, partner, observers.
- Controls kept from today: seating preview, Start round, Extend, End rounds, mark someone left.
- The update step between rounds 2 and 3: how many owners have published; the host starts round 3
  when ready.

### 8. Round thread names (D10)

The round's thread title carries the owner: "Round 1 · {owner}'s canvas, with {partner}". P1592 builds
round threads and is in `/dev` (worktree w5); this spec does not change P1592's code. The amendment is
recorded in P1592's spec by whichever lands second. Observers are thread members, as P1592 already
rules for everyone seated.

### Measurement

What the evening produces, read by a founder-only script (same pattern as
`scripts/event-close-results.sh`):

- Per owner: which version each partner opened, per round.
- Per owner: how many changed boxes carry the owner's own stance by the end of the session (optional,
  so this counts how many owners chose to stand behind the mirror's changes, not a completion rate).
- **Not here:** the spoken numbers. They stay in the round threads and are counted later through P1390
  (D4), against the versions recorded above.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Session 1 is ~11 days away and this sits on P1536 (in `/dev`, w1) and P1592 (in `/dev`, w5) | MITIGATE | Build order: flow switch, observers and seating first (no dependency), then the round screen, then the next-version tap and update step. P1542's per-series recipes shipped on 2026-10-30 (`features/done/2026-06-10/p1542_series_prepare_close_recipes_social_hike.md`), so the mastermind's preparation is its third recipe. |
| Owners mark stances on a draft and the build does not support it | MITIGATE | DB level already admits the owner's draft points (`_canvas_point_in_canvas`, w1 `20261029100000`); UI and the reword rule asked of P1536 on 2026-10-30. UNVERIFIED until its answer. |
| P1536's engine cannot take a round thread as material directly (v6 says "either speed can take, as material, a thread elsewhere that the owner can read") | MITIGATE | `/dev` verifies the call in w1. If missing, it is added to P1536's engine, not rebuilt here. UNVERIFIED. |
| People do not say their number out loud, so the evening cannot be measured later | MITIGATE | The host's opener and the observer remind them; the lanyard cards carry the line. |
| A pair breaks the rules (two speakers, challenging too early) | ACCEPT | The observer's job; tables without an observer rely on the pair. The founder chose spoken rules over app enforcement. |
| A draft is not ready by the update step | MITIGATE | The tap is offered the moment the owner's round ends; the update step shows "still drafting" and the owner can publish at the next seating. |
| Odd numbers, many observers and leavers break the chain's rules | MITIGATE | The preview names every rule it cannot meet; the host decides. |
| Session 2 is online, and the room assumes people at physical tables | DEFER | Open Questions 1. Session 1 does not depend on it. |
| Partners see a canvas mid-edit | ACCEPT | They open the published version; drafts are private to the owner (P1536). |

**Non-Goals**
- Do NOT add sliders, scores, an "allow challenge" control or any phase tracking to the round (D3).
- Do NOT change Clarity Night's or Social Hike's room, host screen, seating or close.
- Do NOT pair by canvas content or add a disagreement score on canvas points.
- Do NOT score automatically from the transcript (P1390).
- Do NOT build the homework path outside the event (P1500), the drafting engine, Publish or stances on
  drafts (P1536), or round threads (P1592).
- Do NOT publish, share or start a draft without the owner's tap.
- Do NOT allow switching the flow, or the event's canvas, after round 1 starts.

## Cost Budget

Drafting runs are Gemini calls through P1536's canvas key. Per run, this uses P1536 v6's estimate from
the public price list, ≈ $0.10 (UNVERIFIED; P1536's `/dev` owns the real reading, kept with P1536).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Drafting runs | 2 owned rounds x (1 draft + up to 2 corrections) = up to 6 runs per session | 12 owners x 6 runs / 2.4 h ≈ 30 runs | 0 (model stubbed in e2e) |
| Gemini cost | 6 runs x $0.10 = $0.60 per session | 30 runs x $0.10 = $3.00 | $0 |
| Database writes | flow, observer flag, event canvas, 4 version-opened rows ≈ 7 | 16 people x 7 / 2.4 h ≈ 47 | ≈ 7 per seeded attendee |

1. **Fits the plan limit today?** Gemini lists a price and no cap: a session of 12 owners is
   12 x $0.60 = $7.20, two sessions $14.40, against the canvas key's spend cap proposed in P1536 (kept
   with P1536). Fits. Supabase: a few dozen writes an hour, no new Realtime traffic beyond what the
   room already sends.
2. **Fits at 10x?** 120 owners x $0.60 = $72 per session: fits under P1536's proposed cap for one
   session; two sessions at 10x approach it, and the cap's existing "capped" reply pauses drafting.
3. **Failure cost:** a failed run is charged as P1536 rules; retries are new runs, counted above as
   corrections.

## Acceptance Criteria

Checked on TEST with a Sales Mastermind event, the host account, at least five attendee accounts with
canvases and two without.

- [ ] An event in the `sales-mastermind` series opens the mastermind flow; a Clarity Night event and a
      Social Hike event open exactly as before (screenshots of each, and existing tests green).
- [ ] The host changes an event's flow from the host screen before round 1, with Undo; after round 1
      starts, the row is gone and a direct call is refused.
- [ ] An attendee drafts a canvas from preparation, publishes it, and shares it with the event, each as
      its own tap; the item then reads "Your canvas for this event: {name} · Change".
- [ ] Changing the canvas before the start stops the old one being shared with the event; after round 1
      starts, Change is gone.
- [ ] An attendee without a canvas sees that they will join as an observer; the host flips one observer
      to participant and one participant to observer, and the preview follows.
- [ ] Six canvas holders and two observers, four rounds: every table has one owner and one partner,
      owners alternate, nobody repeats a partner, observers are spread at most two per table. Five
      canvas holders: one sits out as observer each round, rotated.
- [ ] During a round each person sees only their role, whose canvas it is, the rule reminder, and (for
      partners and observers) a link that opens the owner's newest published version. Nothing asks for
      input.
- [ ] After their round, an owner taps "Make my next version"; at the update step they publish the
      draft as it is, with no stance required; the changed boxes then accept an optional stance; the
      next partner opens the published version.
- [ ] The round thread is titled "Round 1 · {owner}'s canvas, with {partner}".
- [ ] The host sees owner, partner and observers per table, and at the update step how many owners have
      published.
- [ ] Session 2 (a second event of the series with the same attendees) seats nobody with a session-1
      partner when the group allows it.

## Done-When

- [ ] All Acceptance Criteria ticked with evidence (screenshots at 375px, 320px and desktop, plus query
      output).
- [ ] The seating function's fixtures pass: 5-12 canvas holders, odd and even, 0-6 observers, a leaver,
      session-2 history.
- [ ] The results script prints, per owner, the version each partner opened and the stance count at
      publish, on a seeded TEST session.
- [ ] The two P1536 dependencies (stances on a draft with the reword rule; a round thread as material)
      are resolved and the outcome recorded here.
- [ ] `sales-mastermind-test` carries the `sales-mastermind` series on TEST. `[post-deploy]` the prod
      event is created in the series.
- [ ] The P1592 thread-title amendment (D10) is recorded in P1592's spec.
- [ ] P1390 carries a note that the mastermind's spoken scores are its first real input (D4).

## Open Questions

1. **Session 2 is online.** How do pairs talk, and do they use the event room on their phones next to a
   video call? Changes whether the round screen needs a "join the call" link and whether lavalier
   transcription works at home. `[FOUNDER DECISION]` Not needed for session 1.
2. **Do observers wear a lavalier?** Recommended yes: their feedback minutes then reach the owner's
   round thread and the next version. Costs one lavalier per observer. `[FOUNDER DECISION]`
3. **Which goal 3a signal to keep.** "Their canvas changed between the sessions" now moves almost by
   itself, because the mirror drafts the change during the session. Candidate replacements: owners mark
   their stance on most changed boxes, and the first spoken number on v2 is higher than on v1 in the
   same evening. `[FOUNDER DECISION]` (raised 2026-10-30; goals.md signal unchanged until ruled).

## Related

- Run-of-show: `docs/events/sales-mastermind.md` (rewritten 2026-10-30). Goal: `docs/goals.md` 3a.
- P1536 canvas drafting, versions, Publish, stances on drafts (design v6 on branch
  `feature/p1536-canvas-draft-versions`).
- P1592 transcripts land in round threads (D10 amends its D3).
- P1542 per-series prepare and close recipes, shipped 2026-10-30 (the mastermind as the third recipe):
  `features/done/2026-06-10/p1542_series_prepare_close_recipes_social_hike.md`.
- P1500 the homework path outside the event (narrowed 2026-10-30).
- P1390 scores and turns from the transcript (later; D4).
- P1515 sharing a canvas with an event · P1508 Clarity Canvas · P1337 event rounds · P1430 round labels
  and preview · P1574 partner story requests.
