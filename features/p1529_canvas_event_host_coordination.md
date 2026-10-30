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
---

# P1529: The sales mastermind's own event room and host flow

## Problem

**Situation:** The event room and host screen were built for Clarity Night (P1337, P1430). The host
seats people into tables of 2-4 by their largest disagreement on public points carrying the event
tag (`src/app/data/compare-service.ts:27`), gives each seat a role (`first`, `second`, `observer`:
`supabase/migrations/20261002183700_p1337_event_rounds.sql:55`), and can swap the two speakers at
half time. Starting a round needs no points (`host_start_round`,
`20261004183000_p1337_round_minutes.sql`). The room records no scores: nothing in the rounds stores
a 0-10 (searched the rounds code and the P1337 migrations, 2026-10-30).

**Complication:** The sales mastermind (`docs/goals.md` 3a; session 1 around 2026-11-10, session 2
online two weeks later) runs a different loop on each attendee's Clarity Canvas
(`docs/events/sales-mastermind.md`, rewritten 2026-10-30). Run on today's room, attendees do not know
whose canvas a table is about, the canvas points are invisible to pairing, the half-time swap moves
to the other canvas instead of to the challenge, nothing tells the reader when they may challenge,
and the owner has no in-event way to turn the conversation into a new version. The founder ruled
that this must be built **before** session 1, not after it (2026-10-30, replacing decisions.md
2026-10-29 "built only if session 1 shows the need"):

> Founder, 2026-10-30: "We know that the room needs it because we need to assign the rounds,
> otherwise they don't get created, people don't know who speaks to whom and so on. There is
> confusion so we need it."

> Founder, 2026-10-30: "the question is not what it can or can not do but instead what value the
> user expects and how we deliver it."

> Founder, 2026-10-30: "instead of explaining to everybody that they should go find the right thread
> and then within the event chat channel and then forward to mirror and blah, blah, blah, this is all
> part of it, needs to be simpler and easier, streamlined, no? For the event."

**Question:** What do an attendee and the host see, from preparation to the last round, so that each
owner leaves every conversation with a better canvas they stand behind, the next reader reads that
better version, and nobody needs the founder to guide them by hand?

**The value, in one sentence:** an owner leaves each conversation with a better canvas, without
paperwork; the next person reads the better version, so the owner can watch their canvas get easier
to understand.

## Appetite

**Blast radius: high.** The event room and host screen serve every event. Clarity Night and Social
Hike must behave exactly as today.

**Reversibility: medium.** Additive migrations (a flow setting per event, a score record, the
event's canvas per attendee) plus a new flow behind the series. Turning the flow off returns an
event to Clarity Night's flow; recorded scores stay.

**Decision density: low.** The product model was settled 2026-10-30 (Decisions below). Copy remains
(marked `[FOUNDER DECISION]`), plus one open question on session 2 being online.

## Decisions (founder, 2026-10-30)

| # | Ruling |
|---|---|
| D1 | **One canvas per round.** Each table has one owner and one reader. A round's thread is about one canvas. |
| D2 | **A new partner every round, alternating owner and reader** (the chain). Each person owns in one round and reads someone else's canvas in the next. Over four rounds everyone owns twice and reads twice, with four different people. Chosen over "one partner, both canvases" because one weak match then touches a quarter of the evening, and every version is read by someone who has not seen it. |
| D3 | **Split by the score, not the clock.** Understand first. The owner's score above 8 unlocks the challenge. In the challenge, the owner explains back the reader's reason until the reader scores it above 8. Each person scores only the message that was theirs. The host's clock still ends the round; a pair that never reaches the challenge is a result, not a failure. ("We are not changing the subject, we're just changing the rules of what people are allowed to do.") |
| D4 | **Scores are entered on sliders, reusing `/live`'s two-sided slider**, so they are recorded and both people see them. Automatic scoring from spoken numbers is P1390, not this spec. |
| D5 | **A new version between rounds, in both sessions.** The owner's round thread (P1592) feeds the owner's mirror (P1536 engine). At the break the owner reads the new version, marks their own stance on every changed box, and publishes it. The next reader opens it. ("version 2 of the canvas is made in the session 1 … session 1 or session 2, all of them.") |
| D6 | **The owner marks their stance on every changed box before the next reader.** The mirror wrote the change; the stance is the owner's signature, so nobody reads and scores a claim the owner never stood behind. |
| D7 | **A third flow, not a changed Clarity Night.** The series chooses the event-room and host flow by default (Clarity Night, Social Hike, Sales Mastermind); the host can switch it per event **before the event starts**, never mid-event. Builds on P1542's per-series recipes. |
| D8 | **Preparation in the event room, every step visible.** Draft your canvas with your mirror, publish it, then share it with this event as its own tap. "Your canvas for this event" can be changed, or replaced by a new one, until the event starts; it is fixed from round 1. Nothing is shared in the background. ("we shouldn't do things in the background or hidden … every step should be clear and visible, it's just that within event room we can simplify the journey.") |
| D9 | **Round threads say whose canvas they are about**: "Round 1 · {owner}'s canvas, with {reader}". Amends P1592 D3 ("Round 2 · Anna & Ben"); P1592 owns the code. |
| D10 | **No hand-made fallback** for canvas drafting or new versions. |

## Invariants

- **Clarity Night and Social Hike are unchanged.** An event whose flow is not Sales Mastermind
  renders, seats and records exactly as today; their existing tests pass unchanged. An event with no
  series and no flow set gets Clarity Night's flow, as P1542 rules for recipes.
- **A person scores only their own message.** In the understand phase only the owner's score counts;
  in the challenge phase only the reader's. Enforced on the server, never by hiding a control.
- **The challenge unlocks on the server's record of the owner's score**, never on the client's
  slider position alone, so two phones never disagree on the phase.
- **The flow is fixed once round 1 starts.** A switch after that is refused by the server.
- **"Your canvas for this event" is one canvas per attendee per event**, fixed once round 1 starts.
  Changing it before then is visible to the owner and stops that canvas being shared with the event.
- **Every round records which canvas version its reader opened.** Seating has no history
  (`host_set_round_seats` deletes and re-inserts, P1592), so this is stored when the round starts and
  never recomputed. It is what makes "did v2 read better than v1?" countable.
- **Sharing never widens.** Readers reach a canvas only through its existing event share (P1515:
  host plus people registered by 12 h after the start, decisions.md 2026-10-21). This spec adds no
  reader and no read policy.
- **Other people's words never appear in a canvas under their name** (P1536 invariant, carried).
- **Any new surface that names a round uses `roundLabel` / `nextRoundLabel`** (decisions.md P1430
  ruling), never `Round ${roundNo}`.
- **The host is not an attendee in any count** (decisions.md 2026-09-22 ruling on room data).

## Solution

### 1. The flow belongs to the event, defaulted from its series (D7)

- Each event has a flow: Clarity Night, Social Hike or Sales Mastermind. The default comes from
  `events.series_slug`; the host can change it in the event's settings until round 1 starts.
- A `sales-mastermind` series key exists. **The test event `sales-mastermind-test` has no series
  today** (`series_slug` is null, read on TEST 2026-10-30), so it would fall back to Clarity Night;
  setting it is part of this work.
- The mastermind's preparation and close steps are its P1542 recipe. Where the flow is stored and
  how it selects the room and host screens is `/dev`'s call; prefer the option with fewer moving
  parts, as P1542 does.

### 2. Before the event: "Your canvas for this event" (D8)

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

`[FOUNDER DECISION: the item's labels and the Change confirmation text.]`

### 3. Seating: one owner, one reader, a new partner each round (D1, D2)

- The host's preview seats the next round so that each table holds one owner and one reader, owners
  alternate (a person who owned last round reads this round), and nobody repeats a partner. The
  existing preview, Shuffle and "Tap two names to swap them" stay.
- **Odd number:** one table seats a third person, who notes where the reader's paraphrase drifted
  and hands the note to the owner. The host rotates this seat so nobody holds it twice in a session.
- **Arithmetic the seating must honour:** four rounds with no repeated partner needs at least five
  people. When the present group cannot meet every rule (too few people, someone left), the preview
  names who misses an owning turn or repeats a partner, so the host decides; it never silently breaks
  a rule.
- **Session 2 avoids session 1's partners.** "Haven't met yet" today remembers only rounds of the same
  event (run-of-show § Host and event room). The mastermind's partner history spans the previous
  session of the same series for the same people. How sessions are linked is `/dev`'s call.
- Pairing by canvas content (largest disagreement on canvas points) is **not** in this spec. With a
  new partner every round and every owner read twice, the chain does the work disagreement pairing
  did for Clarity Night. The "disagreement gap" toggle is hidden in this flow.
- Group size is 2 (3 for the odd table). The host's Clarity Night controls that have no meaning here
  (topic per round, disagreement gap, recorders together) are hidden in this flow.

`/dev` builds the seating as a pure, unit-tested function, with fixtures for 5 to 12 people, odd and
even, someone leaving mid-session, and session 2 against session 1's history.

### 4. A round, as the attendees see it (D1, D3, D4)

Each seated person sees their table's round:

- **Whose canvas this round is about**, and their role: "You're reading {owner}'s canvas" or
  "{reader} is reading your canvas". The reader gets a link that opens the owner's newest published
  version (P1515 phase 5: no version chosen opens the newest). The version opened is recorded
  (Invariants).
- **Understand.** Both see two sliders, as in `/live`. The owner moves theirs: "How well does
  {reader} understand your canvas?" The reader may move theirs to say how well they think they
  understand; it never unlocks anything (calibration data only).
- **Allow challenge.** When the owner's recorded score is above 8, the owner gets **Allow challenge**.
  Tapping it moves the table to the challenge, for both phones. The owner may also allow it later
  than the first 9; it never unlocks by itself.
- **Challenge.** The reader names the box they bet against and why. The sliders flip: the reader
  scores how well the owner understood the challenge. Above 8 closes the challenge ("Understood").
- **The round ends on the host's clock**, in either phase. A table that never reached the challenge
  shows "Round over" like any other; nothing reads as failure.
- Scores are written when a slider is released, not while it moves.

This replaces the half-time speaker swap in this flow. Reusing the `first`/`second` roles for owner
and reader, or adding roles, is `/dev`'s call.

`[FOUNDER DECISION: the slider questions, "Allow challenge", "Understood" and the round-over line.]`

### 5. After the owner's round: the next version (D5, D6)

- When a round ends, its owner sees **Make my next version** (one tap, visible; nothing starts by
  itself). It hands the owner's mirror the round's thread (P1592) as material and drafts from the
  owner's newest version, using P1536's fast path ("make your own decisions", ending with "What I
  decided on my own"; P1536 v6 names this "the event's between-rounds path").
- The owner then goes to read someone else's canvas in the next round; the draft is ready by the
  break.
- **At the break**, the owner's screen shows one task: **read your new version, mark your stance on
  each box that changed, publish**. "Changed" uses P1536's per-box Changed mark. Publish is P1536's
  Publish. The next reader opens the published version.
- An owner who does not publish keeps their current version; their next reader reads that. Nothing
  publishes on its own.
- Round 2's owners tap after round 2, as the break starts; the fast path is meant for that window
  (P1536: "2.5-hour event: no time for a slow pass").

### 6. The host's screen (D7)

- Per table: owner, reader, phase (understanding / challenge / understood), the latest score.
- Controls kept from today: seating preview, Start round, Extend, End rounds, mark someone left.
- A break state between rounds 2 and 3 that tells owners to publish, and shows the host how many
  owners have published.
- After the session, the host's results list per owner: first understand-score per round with the
  version read. This is the evening's measurement (§ Measurement).

### 7. Round thread names (D9)

The round's thread title carries the owner: "Round 1 · {owner}'s canvas, with {reader}". P1592 builds
round threads and is in `/dev` (worktree w5); this spec does not change P1592's code. The amendment is
recorded in P1592's spec by whichever lands second.

### Measurement

What the evening produces, read by a founder-only script (same pattern as
`scripts/event-close-results.sh`):

- Per owner: the first understand-score on v1 (their first owned round) and on v2 (their second),
  with the version each reader opened. Goal 3a's "fewer explain-back tries" becomes countable inside
  one session.
- Per owner: how many changed boxes carry the owner's own stance at publish.
- Per table: whether the challenge was reached.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Session 1 is ~11 days away and this sits on P1536 (in `/dev`, w1), P1592 (in `/dev`, w5) and P1542 (spec) | MITIGATE | Build order: flow switch + seating + round screen first, then the break step. If P1542 has not shipped, the "Your canvas" item lives in the mastermind's event room directly and moves into the recipe later. |
| The owner cannot set a stance on a draft before Publish (P1536 v6 does not say) | MITIGATE | `/dev` verifies against w1's build first. If drafts cannot hold stances, the break order becomes Publish, then mark stances, before the next round starts. UNVERIFIED. |
| P1536's engine cannot take a round thread as material directly (v6 says "either speed can take, as material, a thread elsewhere that the owner can read") | MITIGATE | `/dev` verifies the call in w1. If missing, it is added to P1536's engine, not rebuilt here. UNVERIFIED. |
| An owner unlocks the challenge at 9 to be polite | ACCEPT | No build can tell politeness from understanding. The reader's own slider shows the gap. |
| A draft is not ready by the break | MITIGATE | The tap is offered the moment the owner's round ends; the break shows "still drafting" and the owner can publish at the next seating. |
| Odd numbers and leavers break the chain's rules | MITIGATE | The preview names every rule it cannot meet; the host decides. |
| Session 2 is online, and the room assumes people at physical tables | DEFER | Open Questions 1. Session 1 does not depend on it. |
| Readers see a canvas mid-edit | ACCEPT | Readers open the published version; drafts are private to the owner (P1536). |
| Scores invite gaming the measurement | ACCEPT | The evening tests whether the features work, not willingness to pay (goals.md 3a, 2026-10-27). |

**Non-Goals**
- Do NOT change Clarity Night's or Social Hike's room, host screen, seating or close.
- Do NOT pair by canvas content or add a disagreement score on canvas points.
- Do NOT score automatically from the transcript (P1390).
- Do NOT build the homework path outside the event (P1500), the drafting engine or Publish (P1536),
  or round threads (P1592).
- Do NOT publish, share or start a draft without the owner's tap.
- Do NOT allow switching the flow, or the event's canvas, after round 1 starts.

## Cost Budget

Drafting runs are Gemini calls through P1536's canvas key; scores are database writes over Realtime.
Per run, this uses P1536 v6's estimate from the public price list, ≈ $0.10 (UNVERIFIED; P1536's
`/dev` owns the real reading, kept with P1536).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Drafting runs | 2 owned rounds x (1 draft + up to 2 corrections) = up to 6 runs per session | 12 owners x 6 runs / 2.4 h ≈ 30 runs | 0 (model stubbed in e2e) |
| Gemini cost | 6 runs x $0.10 = $0.60 per session | 30 runs x $0.10 = $3.00 | $0 |
| Score writes | 4 rounds x ~10 slider releases = ~40 | 12 people x 40 / 2.4 h = 200 | ~40 per seeded table |
| Realtime messages | ~40 writes x 2 phones at the table = ~80 | 200 x 2 = 400 | ~80 |

1. **Fits the plan limit today?** Gemini lists a price and no cap: a session of 12 owners is
   12 x $0.60 = $7.20, two sessions $14.40, against the canvas key's spend cap proposed in P1536 (kept
   with P1536). Fits. Supabase: 400 realtime messages an hour against the 2 million a month limit
   (400 x hours per month of events) fits; the organisation's current reading is in the registry's
   "Where usage is read".
2. **Fits at 10x?** 120 owners x $0.60 = $72 per session: fits under P1536's proposed cap for one
   session; two sessions at 10x approach it, and the cap's existing "capped" reply pauses drafting.
   Realtime at 10x is 4,000 an hour: fits.
3. **Failure cost:** a failed run is charged as P1536 rules; retries are new runs, counted above as
   corrections.

## Acceptance Criteria

Checked on TEST with a Sales Mastermind event, the host account and at least five attendee accounts.

- [ ] An event in the `sales-mastermind` series opens the mastermind flow; a Clarity Night event and a
      Social Hike event open exactly as before (screenshots of each, and existing tests green).
- [ ] The host switches an event's flow before round 1; after round 1 starts, the switch is refused.
- [ ] An attendee drafts a canvas from preparation, publishes it, and shares it with the event, each as
      its own tap; the item then reads "Your canvas for this event: {name} · Change".
- [ ] Changing the canvas before the start stops the old one being shared with the event; after round 1
      starts, Change is gone.
- [ ] Six attendees, four rounds: every table has one owner and one reader, owners alternate, nobody
      repeats a partner. Five attendees: the odd table seats a third person, rotated.
- [ ] Each seated person sees whose canvas the round is about and their role; the reader's link opens
      the owner's newest published version.
- [ ] The challenge is unavailable until the owner's recorded score is above 8; "Allow challenge" moves
      both phones to the challenge; the reader's slider then closes it.
- [ ] A reader's slider cannot unlock the challenge, and an owner's slider does not count in the
      challenge (server-side, checked by direct call).
- [ ] The round ends on the host's clock in either phase, with no failure wording.
- [ ] After their round, an owner taps "Make my next version"; at the break they see the draft, the
      changed boxes, mark a stance on each, and publish; the next reader opens that version.
- [ ] The round thread is titled "Round 1 · {owner}'s canvas, with {reader}".
- [ ] The host sees per table owner, reader, phase and latest score, and at the break how many owners
      have published.
- [ ] Session 2 (a second event of the series with the same attendees) seats nobody with a session-1
      partner when the group allows it.

## Done-When

- [ ] All Acceptance Criteria ticked with evidence (screenshots at 375px, 320px and desktop, plus query
      output).
- [ ] The seating function's fixtures pass: 5-12 people, odd and even, a leaver, session-2 history.
- [ ] The results script prints, per owner, the first understand-score on each version read and the
      stance count at publish, on a seeded TEST session.
- [ ] The two UNVERIFIED P1536 dependencies (stances on a draft; a round thread as material) are
      resolved and the outcome recorded here.
- [ ] `sales-mastermind-test` carries the `sales-mastermind` series on TEST. `[post-deploy]` the prod
      event is created in the series.
- [ ] The P1592 thread-title amendment (D9) is recorded in P1592's spec.

## Open Questions

1. **Session 2 is online.** How do pairs talk, and do they use the event room on their phones next to a
   video call? Changes whether the round screen needs a "join the call" link and whether lavalier
   transcription works at home. `[FOUNDER DECISION]` Not needed for session 1.
2. **Which goal 3a signal to keep.** "Their canvas changed between the sessions" now moves almost by
   itself, because the mirror drafts the change during the session. Candidate replacements this spec
   makes countable: owners mark their stance on most changed boxes, and the first score on v2 is
   higher than on v1 in the same evening. `[FOUNDER DECISION]` (raised 2026-10-30; goals.md unchanged
   until ruled).

## Related

- Run-of-show: `docs/events/sales-mastermind.md` (rewritten 2026-10-30). Goal: `docs/goals.md` 3a.
- P1536 canvas drafting, versions, Publish (design v6 on branch `feature/p1536-canvas-draft-versions`).
- P1592 transcripts land in round threads (D9 amends its D3).
- P1542 per-series prepare and close recipes (the mastermind as the third recipe).
- P1500 the homework path outside the event (narrowed 2026-10-30).
- P1515 sharing a canvas with an event · P1508 Clarity Canvas · P1337 event rounds · P1430 round labels
  and preview · P1390 scores from the transcript (later) · P1574 partner story requests.
