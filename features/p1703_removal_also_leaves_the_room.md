---
status: week
type: story
rank: 346
workstream: events
created_date: '2026-11-17'
tags: [events, host, rounds, removal]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1703: A person the host removes from an event also leaves the room

## Problem

Removing a person (`remove_event_attendee`, P1515/P1700) deletes their registration and records the removal, but their entry in the event room stays. The host still sees them under "People" on the host page, can seat them, and must press "Mark out" by hand.

> Founder framing, verbatim: *"zekade by the way is the removed user i believe so our deletion process didn't work properly for deleting him from event i guess"*

(On prod that case was an account deletion, not a host removal; the gap above is the real one it pointed at. The founder accepted "Remove also takes the person out of the room", 2026-11-17.)

## Appetite

Blast radius: one host action. Reversibility: git revert plus a migration that restores the old function body. Decision density: none.

## Solution

`remove_event_attendee` also marks the person out of the room from now on, the same state the host's "Mark out" produces (`event_round_presence.left_at`, the write `host_set_round_presence` makes), for the room member row whose `profile_id` is the removed person. If they are seated in a running round, they leave that table exactly as a mark-out does today. The room entry itself is kept (P1337: the record of who was there is never deleted).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A removed person seated mid-round leaves a table short | ACCEPT | Same as a host's mark-out today |

**Non-Goals**
- Do NOT delete room member rows or presence history.
- Do NOT change what removal deletes beyond the mark-out.

## Invariants

- From P1337: room membership records are never deleted.
- From P1515: the removal record is authoritative for admission.

## Acceptance Criteria

- [ ] After the host removes a person who is in the room, the host page shows them as marked out, without the host pressing "Mark out".
- [ ] A removed person is never seated by the next "Start round".
- [ ] Removing a person who never entered the room changes no presence data.

## Related

- P1515 (host removal), P1700 (removal notice), P1337 (room presence and mark-out).
