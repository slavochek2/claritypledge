---
status: all-done
type: story
rank: 346
workstream: events
created_date: '2026-11-17'
tags: [events, host, rounds, removal]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
spec_review_hash: 8a45bb03b4a6acc77ba416b1f81f58c53189367d903db3bb8897092574337263
spec_review_vendors: [codex, gemini, openrouter]
completed_at: 2026-11-17
---

# P1703: A person the host removes from an event also leaves the room

## Problem

Removing a person (`remove_event_attendee`, P1515/P1700) deletes their registration and records the removal, but their entry in the event room stays. The host still sees them under "People" on the host page, can seat them, and must press "Mark out" by hand.

> Founder framing, verbatim: *"zekade by the way is the removed user i believe so our deletion process didn't work properly for deleting him from event i guess"*

(On prod that case was an account deletion, not a host removal; the gap above is the real one it pointed at. The founder accepted "Remove also takes the person out of the room", 2026-11-17.)

## Appetite

Blast radius: one host action. Reversibility: git revert plus a migration that restores the old function body; presence rows already written by removals stay (the host can press "Back in"), and so do the transcription seat-move rows the presence trigger wrote. Decision density: low (the review-raised choices are settled under Risks / Non-Goals).

## Solution

`remove_event_attendee` also marks the person out of the room from now on: it sets `event_round_presence.left_at`, the column the host's "Mark out" (`host_set_round_presence`) writes, on the room member row whose `profile_id` is the removed person, while that event's room is open (`now() < datetime + event_grace_interval()`, the join's own test; a host can also remove people from a past event, and that must not rewrite who was in a closed room; the presence trigger also treats any unended round as open whatever its age, so a write past the window would log a seat move into a finished event's transcript). It writes through an `INSERT ... SELECT` from `event_room_members`, so a person with no room row gets no presence row (calling `host_set_round_presence` would raise and roll the whole removal back). An existing `left_at` is kept and an already-out row is not touched; `sits_out_round` is left as it is (a person who has left is out of every pool whatever it says). If they are seated in a running round, the result is the state a mark-out of a seated person produces today: the seat stays in the round's record, the tile shows as out, and the presence trigger (`_transcribe_log_presence_change`) logs the move off their table. The room entry itself is kept (P1114: the record of who was there is never deleted).

A one-off backfill marks out people removed before this ships, for events whose room is still open (`now() < datetime + event_grace_interval()`, the join's own test). It skips a member whose presence row was written after the removal (the host's own later "Back in" or mark-out), re-checked inside its `DO UPDATE` so a "Back in" racing the backfill still wins, since the Remove list shows registered people only and those earlier removals can never be redone.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A removed person seated mid-round leaves a table short | ACCEPT | Same as a host's mark-out today |
| Removal commits after the host page's Start re-read (or that re-read times out and the last 4-second poll is used) | ACCEPT | The same window a host's mark-out has today; no server-side seat check is added |
| The host presses "Back in" for a removed person | ACCEPT | The host's own explicit choice, exactly as after a mark-out; the removal record still governs registration |
| A removal mid-round does to that round's transcription whatever a mark-out does | ACCEPT | Same trigger, same mechanism; nothing transcription-specific is added |
| A person removed before ever entering the room joins it later, or joins while the removal runs (`join_event_room` does not read `event_removals`) | DEFER | Admission gap, not presence: filed as INBOX-376 |
| The backfill runs while an earlier-removed person is still seated in an open round | ACCEPT | They are logged as leaving that table at deploy time, the same as if the host pressed Out then, which is what a removal means; the backfill's header says so |
| `host_reset_rounds` bumps `updated_at` on rows with a `sits_out_round`, which the backfill would read as a later host choice | ACCEPT | No client path sets `sits_out_round` (the host page passes null), so no such row exists today |

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
- [x] Removing a person from an event whose room has closed records the removal and writes no presence data.
- [x] A person who already has a presence row (sitting out a round) is marked out by the removal and keeps `sits_out_round`.
- [x] The backfill marks out an earlier-removed member of an open room (with or without an older presence row, keeping `sits_out_round`), leaves a closed room's member and a member the host brought back after the removal untouched, and writes nothing on a second run.

## Cost Budget

Applies: a function called per request changes, and a backfill runs (`docs/technical/metered-services.md`, "When this applies").

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 0 new: removal stays 1 RPC per removal (1 x 1 = 1, as before); the host page's presence read is its existing poll | 0 new | Users: 10 x (up to 2 create + up to 4 delete) = up to 60. Host sign-in: 1. Events: 4. Tests: 8 + 5 + 4 + 4 + 6 + 17 = 44. Cleanup: 4 events x 8 = 32. API total: 60 + 1 + 4 + 44 + 32 = 141. Raw SQL over SSH to the TEST VM (not the API): 1 + 4 + 4 = 9. Unit tests: 0 |
| Egress (bytes) | 0 new (the RPC returns void) | 0 | 141 responses x about 1 KB = about 141 KB |
| Log lines | 0 on success; 1 WARNING per removal only if the presence trigger fails | 0 | 0 expected |
| Service unit | Database rows per removal in an open room: at most 1 presence row + 2 transcription rows x about 100 B = at most 300 B | 0 | Every fixture row deleted in `afterAll` |

The backfill is one statement, run once at deploy: (removed people in still-open rooms) x at most 300 B, and no requests.

1. **Fits the plan limit today?** Fits. Prod's plan and current disk are read where the registry rows "Supabase, Free plan" and "Supabase, Pro plan" say usage is read; this spec records only the verdict. The worst case needs no reading: growth is (removals per month + backfill rows) x 300 B. Removal is a manual host action; at 1,000 removals a month that is 1,000 x 300 B = 300 KB, which is 0.06% of the Free row's 500 MB, and on a disk already at its included size it costs 0.0003 GB x $0.125 per GB-month (Supabase's published disk price on the usage page) = under $0.0001. Requests and egress are unchanged. Log lines are 0 on success, so log ingestion is unchanged. Tests run on self-hosted TEST (registry row "Compute Engine"), billed per VM-hour, not per request: runs per month x 141 requests adds no billed unit.
2. **Fits at 10x?** Yes: 10,000 x 300 B = 3 MB, 0.6% of 500 MB, or under $0.001 a month of disk overage; VM cost does not scale with requests.
3. Not applicable.

## Related

- P1515 (host removal), P1700 (removal notice), P1337 (room presence and mark-out).
