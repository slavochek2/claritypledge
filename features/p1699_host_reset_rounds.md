---
status: week
type: story
rank: 346
workstream: events
created_date: '2026-11-17'
tags: [events, rounds, host, mastermind]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 8f032b1446fe8c94cda53f6b853a95e14f4b054a99dc648b48097317f3ab7a92
spec_review_vendors: [codex, gemini, openrouter]
---

# P1699: The host can reset an event's rounds and start again from round 1

## Problem

**Situation:** A host starts rounds from the host page (`host_start_round`), and ends them with "End round N" (`host_end_round`) or ends the evening (`host_end_rounds`, which writes `event_evening_ends`). Nothing in the app deletes a round. Attendees reach the Table step only once a round exists.

**Complication:** On 2026-11-17 the founder tested the live Sales Mastermind event on prod and wanted to try rounds before the real evening. Any test round stays on the real event for good: the seating, the round chat threads, and "Round 2" as the next number.

> Founder, verbatim: "if the host fucks it up, let's say test, and then I want to start, reset the event and have no rounds, like delete the data and start rounds from the beginning."

**Question:** Give the host one action that returns an event's round state to "no round has started", and keep everything that is not round state.

## Appetite

Blast radius: medium. It's one host action on one event, but it deletes data other people produced (round chat replies, transcripts). Reversibility: none. A reset cannot be undone, so the confirm step carries the safety. Decision density: one founder call (below).

## Solution

A host-only server function `host_reset_rounds(p_event_id uuid) RETURNS void`. It uses the same host check as `host_end_rounds` (the caller must be `events.host_id`, otherwise 42501), and **first takes the same `p1337_round:<event>` advisory lock** that `host_start_round`, `host_end_round` and `host_end_rounds` take (`20261110090000_p1529_end_round.sql:51,81`), so a start on another device cannot interleave. In that one transaction, in this order:

1. **Round chat.** Deletes the replies in every round thread (`chat_messages` whose `thread_root_id` is a `chat_round_threads.root_message_id` of the event's rounds), then the root messages themselves. Order matters: `chat_messages.thread_root_id` is `ON DELETE SET NULL` (`20261019203000_p1512_clarity_chat.sql:112`), so deleting a root first would turn its replies into loose top-level messages in the event chat. Deleting `event_rounds` alone deletes only the `chat_round_threads` link rows, not the messages. The `/dev` agent checks every other table that references `chat_messages` (reactions, forwards, drafts) and states in the migration header what each does when a message goes. [FOUNDER DECISION: delete round chat on reset. Default taken: **yes**, because a reset that leaves "Round 1 · Table 2" threads in the chat contradicts "start rounds from the beginning".]
2. **Round transcript lines and room-level transcript jobs.** Deletes `transcribe_messages` rows whose `dest_round_id` is one of the event's rounds; otherwise they'd survive with the round link nulled. Also deletes the event's room-level clean-transcript jobs (`transcribe_round_clean_jobs` with `kind = 'room'`, `place` in `before`/`end`). Starting round 1 creates the `before` job with no round link, and only one per room and place may exist (`20261102133000_p1596_threads_in_time_order.sql:41-43`). Left in place, it would stop the real evening making its own and would post test-round speech to the whole event chat. It also deletes the matching "Before/After rounds" threads (`chat_outside_round_threads` roots, replies first, as in step 1). Deleting the jobs cascades to `transcribe_round_clean_posts` and `transcribe_clean_texts` (people's session transcript history from the test), which is intended. The function locks these job rows before deleting, to avoid a deadlock with a transcript post running at the same moment.
3. **Rounds.** Deletes `event_rounds` for the event. Cascades (`grep "REFERENCES public.event_rounds"`, 2026-11-17): `event_round_seats`, `event_round_tables`, `chat_round_threads` (→ `chat_round_thread_members`), `transcribe_round_seat_moves`, `transcribe_round_seat_state`, `transcribe_round_seat_adjust`, `transcribe_round_clean_jobs` (→ posts), `event_next_version_taps`, `event_canvas_opens`.
4. **Evening and post-round canvas state.** Deletes the event's `event_evening_ends` row (an ended evening opens again) and its `event_canvas_update_steps` row (the after-round "next version" step). **Keeps** `event_canvas_setups`, because the canvas setup happens before rounds and is not round state.
5. Clears `event_round_presence.sits_out_round` for the event. Keeps `left_at`, because who is in the room is not round state.

The `/dev` agent re-runs the FK enumeration, plus a search for any table holding a round number or round flag without an FK, before writing the migration, and lists the final set in the migration header.

**Host UI:** a secondary "Reset rounds" control on the host page, shown only once at least one round exists or the evening has ended. Tapping it opens a confirm dialog that names what is deleted and what is kept. On success the host board shows the pre-round state ("Start round 1" / the Demo choice).

**Attendees:** with no rounds left, their room goes back to the pre-rounds step (Canvas for the mastermind with the canvas made at the event, otherwise Principle or Table waiting) on the next poll, without a reload. A step the attendee had tapped back to (`viewingBack`) is cleared when the round they were in disappears, so no one stays on a dead Table or Compare view.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Host taps it by mistake during a real evening | MITIGATE | Confirm dialog with an explicit destructive button; secondary placement, never the primary slot |
| An attendee's device holds a seated state for the old round | MITIGATE | Room state derives from the poll; test that an attendee seated in round 1 drops back after the reset |
| A transcript line in flight posts into a deleted round thread | MITIGATE | The advisory lock plus step 2 delete the round's lines; a line written after the reset has no round to target. `/dev` confirms the poster drops a line whose round is gone rather than posting it to the event channel |
| Reset after the event's grace close (`isFrozen` in `EventRoomMeet.tsx:409-412`) | ACCEPT | Attendees then see Feedback, not the pre-rounds step. Reset is meant before or during the evening |
| Real people's round chat replies are deleted | ACCEPT | Intended (see founder decision); the dialog says so |
| A test round that reached "Create next version" leaves an open canvas draft, so the real evening's "Create next version" is refused with `draft_already_open` (`20261111200000_p1529_next_version_event_lock.sql:124-126`) | ACCEPT | Drafts and versions are the attendee's own canvas (Non-Goal). The person can finish or discard that draft. [FOUNDER DECISION: should reset also discard open drafts the event created? Default: no] |
| Feedback given after a test "End the evening" stays | ACCEPT | Feedback is not round state. [FOUNDER DECISION: default keep] |
| Raw lines in the transcription room page and forwarded copies of round messages stay | ACCEPT | Only round-scoped data is removed; the dialog says "round chats", not all transcript text |

**Non-Goals**
- Do NOT delete registrations, the waiting list, room membership, the event's main chat (non-round threads), canvases, canvas shares, principle or registration answers.
- Do NOT add undo or soft-delete.
- Do NOT change how rounds start, end or are numbered.

## Invariants

- Only the event's host can reset. Every other caller gets 42501, checked in the server function, not only by hiding the button.
- The reset is atomic: either all of the round state is gone, or none of it.
- Chat messages outside round threads are never deleted by this function.

## UI Contract

[FOUNDER DECISION: copy. Drafts, to approve or change:]
- Control: `Reset rounds`
- Dialog title: `Reset all rounds?`
- Dialog body: `This deletes every round of this event: the seating, the round chats and the round transcripts. Registrations, the waiting list, feedback, the rest of the event chat and everyone's canvases stay. People go back to the start, and you can start round 1 again. This cannot be undone.`
- Buttons: `Reset rounds` (destructive) · `Cancel`

## Acceptance Criteria

- [ ] The host of an event with rounds sees "Reset rounds"; after confirming, the host page shows the pre-round state and the next start is round 1 (or the Demo).
- [ ] An attendee seated in a round is back on the pre-rounds step within one poll after the reset, without reloading.
- [ ] After the reset, once the chat is reopened or reloaded (live updates carry inserts and edits, not deletes: `chat-service.ts:388-393`), the event chat shows no round threads and no Before/After rounds threads; a message posted in the event channel before the reset is still there.
- [ ] After a reset, the real round 1 gets its own Before-round-1 transcript job (no unique-index conflict).
- [ ] On TEST, the ids of the event's registrations, waiting list, room members, canvases, canvas shares, principle answers, registration answers and non-round chat messages are identical before and after the reset, and a second event's rounds are untouched.
- [ ] No reply from a round thread survives as a top-level message in the event chat.
- [ ] An ended evening is open again after the reset.
- [ ] A non-host (signed in) calling `host_reset_rounds` gets SQLSTATE 42501 and nothing is deleted; an anonymous call is refused.
- [ ] An event with no rounds and no ended evening does not show the control; one with an ended evening and no rounds does.
- [ ] An attendee who had tapped back to an earlier step while seated also lands on the pre-rounds step after the reset.

## Related

- P1337 (event rounds), P1430 (host start path, decisions.md 2026-10-07), P1529 (mastermind host flow, end round, canvas setup), P1592 (round threads in the event chat), P1700 (sibling spec: host removal notice).
