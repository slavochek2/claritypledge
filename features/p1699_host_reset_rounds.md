---
status: qa
type: story
rank: 346
workstream: events
created_date: '2026-11-17'
tags: [events, rounds, host, mastermind]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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

A host-only server function `host_reset_rounds(p_event_id uuid) RETURNS integer` (the number of rounds deleted). It uses the same host check as `host_end_rounds` (the caller must be `events.host_id`, otherwise 42501), and **first takes the same `p1337_round:<event>` advisory lock** that `host_start_round`, `host_end_round` and `host_end_rounds` take (`20261110090000_p1529_end_round.sql:51,81`), so a start on another device cannot interleave. In that one transaction, in this order:

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

- [x] The host of an event with rounds sees "Reset rounds"; after confirming, the host page shows the pre-round state and the next start is round 1 (or the Demo). Evidence 2026-11-17: `e2e/p1699-reset-rounds.spec.ts` (1 passed, TEST) steps (a) and (d); unit `p1699-host-reset-rounds.test.tsx`.
- [x] An attendee seated in a round is back on the pre-rounds step within one poll after the reset, without reloading. Evidence: `e2e/p1699-reset-rounds.spec.ts` step (b), two browsers, no reload.
- [x] After the reset, once the chat is reopened or reloaded (live updates carry inserts and edits, not deletes: `chat-service.ts:388-393`), the event chat shows no round threads and no Before/After rounds threads; a message posted in the event channel before the reset is still there. Evidence (database the chat reads, rolled-back probe on a TEST event with 4 rounds): 5 thread roots and 80 replies before, 0 left after; the 8 other event-channel messages identical by id. Not checked in a browser.
- [x] After a reset, the real round 1 gets its own Before-round-1 transcript job (no unique-index conflict). Evidence: same probe, the event's room-level `before` job count went to 0, so the unique (room_id, place) slot is free.
- [x] On TEST, the ids of the event's registrations, waiting list, room members, canvases, canvas shares, principle answers, registration answers and non-round chat messages are identical before and after the reset, and a second event's rounds are untouched. Evidence: probe compares md5 of each id set (rsvps, waiting list, room members, canvas shares, registration answers, non-round messages, every other event's rounds): all equal. Canvases are not touched by any statement in the function. Integration `p1699-reset-rounds-db.spec.ts` 5/5.
- [x] No reply from a round thread survives as a top-level message in the event chat. Evidence: probe, replies_left=0.
- [x] An ended evening is open again after the reset. Evidence: first dry run, `event_evening_ends` row count 0 after reset.
- [x] A non-host (signed in) calling `host_reset_rounds` gets SQLSTATE 42501 and nothing is deleted; an anonymous call is refused. Evidence: `p1699-reset-rounds-db.spec.ts` 5/5 and the dry run.
- [x] An event with no rounds does not show the control; one whose evening has ended still does. (Amended 2026-11-17: an ended evening with zero rounds cannot occur on the host page, `eveningEndedAfter` needs a round.) Evidence: unit `p1699-host-reset-rounds.test.tsx`.
- [x] An attendee who had tapped back to an earlier step while seated also lands on the pre-rounds step after the reset. Evidence: `e2e/p1699-reset-rounds.spec.ts` step (c). Limit: in that test the step tapped back to (Principle) is also the pre-rounds step; the clearing itself is the existing effect at `EventRoomMeet.tsx:400` (seated change clears `viewingBack`).

## Known limitations (from the /finish review, 2026-11-17)

- A reset that commits after the page's 10-second write deadline still shows "That didn't save"; the next 4-second poll shows the rounds gone, and the host can press Reset again harmlessly.
- "Sits out" marks on the host board can show for up to one poll after the reset.
- The reset deletes the event's room-level transcript jobs, including a `before` or `end` job from an earlier room of the same event that ended before the test rounds; that is the personal transcript history of a part that, by the reset's meaning, is being started over.
- A room that ends while the reset is running can build its end job from the old rounds before the reset commits; the reset cannot see that job, so it can later post test-round speech. The window is the reset's own duration (milliseconds). DEFER: if it is ever seen, skip room-job lines spoken before `reset_at` in `_post_clean_round_item`.
- Two rare lock-order deadlocks (an account erasure, and the clean tick closing rounds) can abort one side; Postgres picks the victim and the host can press Reset again. No data is corrupted.
- The confirm text reads the same whether a round is running or not (resetting mid-round sends every seated phone back to the start). [FOUNDER DECISION: add a line such as "A round is running right now" to the confirm when one is.]
- The control is a muted text button with an inline confirm, the same pattern as the sibling "End the evening" on this page (reviewers suggested the shared ConfirmDialog and a red trigger; kept consistent with the sibling, founder's call).

## Cost Budget

Applies because the new tests create and delete test users (metered-services.md, "When this applies"). Added after the /finish review, 2026-11-17.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | A reset is a host action, not per user: 1 RPC + 2 existing refresh reads = 3 requests per reset | 0 standing traffic: no poll, timer or retry added (the existing 4-second host poll is unchanged) | Integration spec: 3 users created + 3 deleted = 6 auth admin calls, 3 password sign-ins, 10 RPCs (3 joins + 2 starts + 2 refused resets + 2 host resets + 1 restart), about 30 service-role seed and assertion reads and writes (chat, transcript, evening and canvas rows), 2 event inserts and 2 deletes. Total about 6 + 3 + 10 + 30 + 4 = 53 requests. Browser spec: 3 users created + 3 deleted = 6, 2 events, and for about 40 s two attendee pages and one host page polling every 4 s = 3 pages x 10 polls x about 3 reads = about 90 reads; about 100 requests in all |
| Egress (bytes) | One RPC returning an integer: under 1 KB per reset | 0 added | Integration: 53 responses x under 2 KB = under 106 KB. Browser: 3 page loads x about 1.5 MB of app bundle and data = about 4.5 MB, plus 100 small JSON responses x under 4 KB = under 0.4 MB; about 5 MB per run |
| Log lines | 1 per refused (non-host) call | 0 | 2 provoked refusals (non-host, anon) per integration run |
| Service unit | None (no Gemini, no transcription call; deleting transcript rows costs no tokens) | 0 | 0 |

1. **Fits the plan limit today?** Fits. Registry row: Supabase Free plan, which TEST spends since P1538 (5 GB egress, 50,000 MAU, 500,000 edge function invocations). Monthly TEST egress = (0.1 MB + 5 MB) x runs per month; neither spec calls an edge function; 6 test users exist only for the run's length. Prod: 3 requests x resets per month, a manual host action.
2. **Fits at 10x?** 10 x runs per month x 5.1 MB stays within 5 GB while runs per month x 51 MB is under 5 GB, that is under about 100 full runs of both specs a month; the run rate is read from the registry's usage reader.
3. If the browser spec ever runs more often than that, it is the share to cut first; the upgrade is Supabase Pro, from $25/month (registry).

## Related

- P1337 (event rounds), P1430 (host start path, decisions.md 2026-10-07), P1529 (mastermind host flow, end round, canvas setup), P1592 (round threads in the event chat), P1700 (sibling spec: host removal notice).
