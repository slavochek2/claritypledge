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

1. **Every table is recorded** (one phone per table, `/transcribe`). The transcripts are what the
   owner's agent uses to propose the next version of their canvas.
2. **The meeting principle:** explain back what the other person means, to their score, before you
   disagree.
3. **Arrive with a drafted canvas.** The agent drafts it from your own material (site, deck, posts):
   [P1536](../../features/p1536_canvas_first_draft_from_owner_material.md). Until that ships, the
   host drafts it by hand. Latecomers without one draft it at the door.

## Format

Two sessions, same group: session 1 in person, session 2 online two weeks later. Both run the same
loop with new partners. Pairs; with an odd number, one table of three (see *The third person*).

### The loop — one canvas (owner A, reader B), about 21 minutes

| Step | What happens | Min |
|---|---|---|
| 1 | B reads A's canvas silently and marks the **one box B would bet against**. Both partners read at the same time, at the start of the round. | (4, shared) |
| 2 | B explains back what B understood. A scores 0-10. | 3 |
| 3 | A corrects; B paraphrases again; A scores again. Repeat until the score is high. | 5 |
| 4 | B says why B bets against the marked box. A explains back B's reason until **B** scores it high. | 10 |
| 5 | A notes the one change A will make to the canvas. | 2 |

Then the same for B's canvas. One round: 4 + 21 + 21 = about 46 minutes.

Reading comes first on purpose: the first score shows whether the **written** canvas works without
its owner, and every gap is a place to fix in the next version.

### The third person (odd number only)

Three segments of about 14 minutes instead of two of 21. The person not in the segment writes down
the words where the reader's paraphrase drifted from what the owner meant, and hands the note to the
owner. Nobody only watches.

## Run-of-show — session 1, about 2h20

| | Min |
|---|---|
| Opener: the meeting principle, recording check, one 90-second explain-back demo with a volunteer | 12 |
| Seating | 3 |
| Round 1 | 46 |
| Break | 10 |
| Seating | 2 |
| Round 2 (new partner) | 46 |
| Close: **everyone**, 30-40 seconds: one canvas change and one real-customer test before session 2 | 10 |
| Exit card (private, paper) | 5 |
| Next session date, said while everyone is in the room | 2 |
| **Total** | **136** |

**Exit card**, three lines: my first impression of one person here · what changed it · will I come
back. [FOUNDER DECISION: exact wording.]

## Host settings (`/events/:slug/host`)

- Group size 2. "Haven't met yet" on. "Recorders together" has no effect (everyone records).
- "Disagreement gap" has no data: the room reads only public points carrying the event tag
  (`src/app/data/compare-service.ts`), not canvas positions.
- Swap speakers at half time on: one half per canvas.
- "Haven't met yet" remembers only rounds of the same event. For session 2, swap people by hand on
  the preview ("Tap two names to swap them") so nobody repeats a session-1 partner.

## Between sessions

Each owner's table transcripts go to their agent, which proposes canvas v2; the owner accepts. By
hand until [P1500](../../features/p1500_clarity_chat_canvas_from_event_threads.md) exists.

## Not decided

Name, date, venue, the opener's framing of progress, and the exit card wording: founder decisions,
in the private brief.
