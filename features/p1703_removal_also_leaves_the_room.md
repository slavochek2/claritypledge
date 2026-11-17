---
status: in-progress
type: story
rank: 346
workstream: events
created_date: '2026-11-17'
tags: [events, host, rounds, removal]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
spec_review_hash: 8a45bb03b4a6acc77ba416b1f81f58c53189367d903db3bb8897092574337263
spec_review_vendors: [codex, gemini, openrouter]
---

# P1703: A person the host removes from an event also leaves the room

## Problem

Removing a person (`remove_event_attendee`, P1515/P1700) deletes their registration and records the removal, but their entry in the event room stays. The host still sees them under "People" on the host page, can seat them, and must press "Mark out" by hand.

> Founder framing, verbatim: *"zekade by the way is the removed user i believe so our deletion process didn't work properly for deleting him from event i guess"*

(On prod that case was an account deletion, not a host removal; the gap above is the real one it pointed at. The founder accepted "Remove also takes the person out of the room", 2026-11-17.)

## Appetite

Blast radius: one host action. Reversibility: git revert plus a migration that restores the old function body; presence rows already written by removals stay (the host can press "Back in"), and so do the transcription seat-move rows the presence trigger wrote. Decision density: low (the review-raised choices are settled under Risks / Non-Goals).

## Solution

`remove_event_attendee` also marks the person out of the room from now on: it sets `event_round_presence.left_at`, the column the host's "Mark out" (`host_set_round_presence`) writes, on the room member row whose `profile_id` is the removed person. It writes through an `INSERT ... SELECT` from `event_room_members`, so a person with no room row gets no presence row (calling `host_set_round_presence` would raise and roll the whole removal back). An existing `left_at` is kept and an already-out row is not touched; `sits_out_round` is left as it is (a person who has left is out of every pool whatever it says). If they are seated in a running round, the result is the state a mark-out of a seated person produces today: the seat stays in the round's record, the tile shows as out, and the presence trigger (`_transcribe_log_presence_change`) logs the move off their table. The room entry itself is kept (P1114: the record of who was there is never deleted).

A one-off backfill marks out people removed before this ships, for events whose room is still open (`now() < datetime + event_grace_interval()`, the join's own test). It skips a member whose presence row was written after the removal (the host's own later "Back in" or mark-out), since the Remove list shows registered people only and those earlier removals can never be redone.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A removed person seated mid-round leaves a table short | ACCEPT | Same as a host's mark-out today |
| Removal commits after the host page's Start re-read (or that re-read times out and the last 4-second poll is used) | ACCEPT | The same window a host's mark-out has today; no server-side seat check is added |
| The host presses "Back in" for a removed person | ACCEPT | The host's own explicit choice, exactly as after a mark-out; the removal record still governs registration |
| A removal mid-round does to that round's transcription whatever a mark-out does | ACCEPT | Same trigger, same mechanism; nothing transcription-specific is added |
| A person removed before ever entering the room joins it later (`join_event_room` does not read `event_removals`) | DEFER | Admission gap, not presence: filed as a follow-up |

**Non-Goals**
- Do NOT delete room member rows or presence history.
- Do NOT change what removal deletes beyond the mark-out.
- Not walk-ins or deleted accounts: both have no `profile_id`, and removal takes a profile. The prod case in the Problem (an account deletion) is out of scope; the host's mark-out still covers it.
- No change to `host_set_round_presence`, `join_event_room` or any client code.
- Mic, chat and other room state are not touched by removal; only presence changes.

## Invariants

- From P1114: room membership records are never deleted.
- From P1515: the removal record is authoritative for the admission checks that read it (registration and the waitlist; the room join does not read it yet, see the DEFER row).

## Acceptance Criteria

- [x] After the host removes a person who is in the room, their presence row has `left_at` set, and the host page shows them as out (the people list's out group, or an out tile if seated) on its next presence read, without the host pressing "Mark out".
- [x] A person removed while in the room is not in the pool the next "Start round" seats from, once the host page has read presence after the removal.
- [x] Removing a person seated in an open round (60 s or more in) records their move off that table (`transcribe_round_seat_moves`, `to_table` NULL), as a mark-out does.
- [x] Removing a person who never entered the room changes no presence data.
- [x] The backfill marks out an earlier-removed member of an open room, leaves a closed room's member and a member the host brought back after the removal untouched, and writes nothing on a second run.

## Related

- P1515 (host removal), P1700 (removal notice), P1337 (room presence and mark-out).
