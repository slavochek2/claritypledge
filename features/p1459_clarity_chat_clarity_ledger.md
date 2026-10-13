---
status: backlog
type: story
disclosure: public
rank: 1000100
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - clarity-ledger
  - history
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1459: Clarity ledger — one record of what was revealed and what was bridged

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.

> Founder framing, verbatim (2026-10-12): *"It's kind of a view of Clarity Sessions plus Clarity Letters plus many other things or whatever, I don't know."*

## Intention

A ledger is a view, not a new flow: every gap revealed and every gap closed, across clarity
sessions (/live), letters, chat threads and more. Entries are frozen events (ratings,
explain-backs, scores are never overwritten; revisions are new events). It answers "between
Alice and me, what did we find out we misunderstood, and what is still open?"

## How the idea was born

The concept is older: designed in conversation 2026-07-21 ("Illusion of shared understanding")
and **deferred** in the P1010 Clarity Organizations spec and in decisions.md. On 2026-10-12 it
came back while scoping P1437: the founder described a *"success log... clarity ledger...
which records all the revelations, potential gaps, and all the bridging or outstanding things"*
and later: *"Clarity Ledger is a separate thing. It's kind of a view of Clarity Sessions plus
Clarity Letters plus many other things."* Also decided 2026-07-24: ledger entries are frozen
events.

## How it relates

- **P1010** (Clarity Organizations): deferred the ledger; documented catches were the business
  case for champions (hypotheses.md).
- **P1437**: produces ledger-worthy events (numbers on a story, per version).
- **Placeholder P1455 (reply threads)**: produces "closed" events. Blocked by P1455.
- **P949**: calibration scores are ledger entries.
- **Placeholder P1458**: calibration of agents on people is read from the ledger.

## Why it matters

Chain: spans **show the gap** and **close the gap**. Without a record each check is a one-off;
with it, a pair (or an organisation) can see progress and a champion can make the case.

## Deliberately out / trade-offs considered

- Scoring people or ranking pairs: the ledger records, it does not grade.
- Group-wide visibility by default: pair-only first.
- A new data store before there are events to show: wait for P1455.

## Open questions

- Pair view only, or also a personal view across all my pairs?
- What counts as "closed": both ≥ 8, the speaker's score, or an explicit close?
- Which existing records (sessions, letters) are backfilled?

## Done-when for promoting out of placeholder

- Placeholder P1455 produces closed exchanges, and someone asks to see their history.

## Update 2026-10-13 (from the v5 walk-through, see P1469)

- **The entry reuses the live session's "Journey to Understanding" card**: the sender's sealed numbers against the recipient's ratings, and how they move over later rounds.
- **It records checked assumptions, confirmed as well as gaps.** Celebrating only gaps would reward bad guesses. No confetti for these letters.
- **It lives with the person**, on the sender's private card ("History with <name>", P1458). Session History may later list all entries by date.
