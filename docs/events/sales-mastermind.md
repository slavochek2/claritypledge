# Sales Mastermind — description and run-of-show

> **`UNTESTED`: not run yet.** All timings are estimates until the first evening measures them.
> **This file holds the description and the run-of-show. Nothing else.** The goal and its signal
> are in [goals.md](../goals.md) 3a; the prediction it tests is ledger row L5 in
> [research-programme.md](../research-programme.md) (decisions.md 2026-10-21 [product]). People,
> venue and working notes are in the private event brief.

## Who it is for

People who own what they sell: founders (including pre-revenue), freelancers, agency owners,
coaches, consultants. They come with selling pain, which is usually clarity pain: who it is for,
what the value is, why them. Not for someone selling an employer's product, or for people who want a
talk to listen to.

## Conditions of attendance

Stated at registration and on the event page, before anyone comes. Not opt-in at the door.

1. **Every conversation is recorded**: everyone wears a lavalier and switches transcription on in the
   event room. The words land in that round's thread in the event channel
   ([P1592](../../features/p1592_event_transcripts_land_in_round_threads.md)), and the owner's mirror
   uses them to draft the next version of their canvas.
2. **The meeting principle:** explain back what the other person means, to their score, before you
   disagree.
3. **Arrive with a canvas shared with this event.** In the event room's preparation, the mirror
   drafts it from your own material (site, deck, posts)
   ([P1536](../../features/p1536_canvas_first_draft_from_owner_material.md)), you publish it, and you
   share it with the event as its own visible step. You can change which canvas you bring until the
   event starts; from round 1 it is fixed. No hand-drafted fallback (founder, 2026-10-30).

## Format

Two sessions, same group: session 1 in person, session 2 online two weeks later. Both run the same
loop, and both make a new canvas version between rounds (founder, 2026-10-30).

**One canvas per round, a new partner every round** (founder, 2026-10-30). Each table has one owner
and one reader. Each person alternates: owner in one round, reader of someone else's canvas in the
next. Over four rounds everyone owns twice and reads twice, with four different people, so one weak
match touches a quarter of the evening, and every version is read by someone who has not seen it.
Needs at least five people so nobody repeats a partner. With an odd number, one table seats a third
person (see *The third person*).

### The loop — one canvas (owner A, reader B), about 24 minutes

The round is split by the score, not by the clock (founder, 2026-10-30). The host's clock ends the
round either way; a pair that never reaches the challenge has learned that the canvas does not read
yet, which is the next version's best input.

| Step | What happens | Min |
|---|---|---|
| 1 | B reads A's canvas silently and marks **every box B would bet against** (one or more). The pair picks which disagreement to discuss: B can propose, A has the final say (*founder, 2026-10-30*). | 4 |
| 2 | **Understand.** B explains back what B understood. A corrects; B paraphrases again. A scores B's understanding 0-10 each time. | until A's score is above 8 |
| 3 | **Challenge**, unlocked by A's score above 8. B says why B bets against the chosen box. A explains back B's reason until **B** scores it above 8. | the rest of the round |

Each person scores only the message that was theirs: A scores the understanding of the canvas, B the
understanding of the challenge. Scores are entered in the room on a slider (reusing `/live`'s), so
they are recorded, not only spoken (P1529).

Reading comes first on purpose: the first score shows whether the **written** canvas works without
its owner, and every gap is a place to fix in the next version.

### The new version (between rounds)

While the round runs, the words land in the round's thread. A's mirror drafts the next version from
that thread. At the break, A reads the new version, marks their own stance on every box that
changed, and publishes it. A's next reader opens that version. A stance on each changed box is A's
signature on what the mirror wrote: nobody reads, and scores, a claim the owner never stood behind.

### The third person (odd number only)

One table seats a third person, who writes down the words where the reader's paraphrase drifted from
what the owner meant and hands the note to the owner. The host rotates this seat so nobody holds it
twice.

## Run-of-show — session 1, about 2h25

| | Min |
|---|---|
| Opener: the meeting principle, recording check, one 90-second explain-back demo with a volunteer | 12 |
| Seating | 2 |
| Round 1 (half the room owns) | 24 |
| Seating (new partner) | 2 |
| Round 2 (the other half owns) | 24 |
| Break: read your new version, mark your stance on each changed box, publish | 12 |
| Seating (new partner) | 2 |
| Round 3 (round 1's owners, on their new version) | 24 |
| Seating (new partner) | 2 |
| Round 4 (round 2's owners, on their new version) | 24 |
| Close: **everyone**, 30-40 seconds: one canvas change and one real-customer test before session 2 | 10 |
| Exit card (private, paper) | 5 |
| Next session date, said while everyone is in the room | 2 |
| **Total** | **145** |

Round 2's owners get their new version drafted from round 2 and review it at the same break, so
every owner's second reader (rounds 3 and 4) reads the new version.

**Exit card**, three lines: my first impression of one person here · what changed it · will I come
back. [FOUNDER DECISION: exact wording.]

## Host and event room

The mastermind gets its own event-room and host flow, chosen by the series, with a per-event switch
before the event starts; Clarity Night's flow stays as it is
([P1529](../../features/p1529_canvas_event_host_coordination.md), building on P1542's per-series
steps; founder, 2026-10-30). It covers: the preparation item (draft, publish, share with the event,
change canvas until the start), rounds that alternate owner and reader with a new partner each time,
whose canvas each round is about, the score sliders that unlock the challenge, and the break step
above.

Today's host screen, for reference: "Disagreement gap" has no data (the room reads only public points
carrying the event tag, `src/app/data/compare-service.ts`, not canvas positions); "Haven't met yet"
remembers only rounds of the same event, so session 2 needs partners swapped on the preview ("Tap two
names to swap them") unless P1529 covers it.

## Between sessions

Homework, not the main path: an owner can open their canvas, bring in a round thread from the event
channel, and make another version before session 2
([P1500](../../features/p1500_clarity_chat_canvas_from_event_threads.md): pick the thread from the
canvas chat). No hand-made fallback.

**Host, between sessions** (by hand, `UNTESTED`, founder 2026-10-30): read the round threads, the
scores and each new version, and find 2-3 boxes that changed after a reader's reason was explained
back and scored above 8 by that reader. **Session 2 opener:** name those reasons and the readers who
gave them. Watch whether those readers are pleased and the room leans in. This tests whether
recognising reasons that changed a canvas is worth building (supersede reason in
[P1574](../../features/p1574_canvas_partner_story_requests.md), recognition in
[P1559](../../features/p1559_follow_through_record.md)); if the room does not care, neither is urgent.

## Not decided

Name, date, venue, the opener's framing of progress, and the exit card wording: founder decisions,
in the private brief.
