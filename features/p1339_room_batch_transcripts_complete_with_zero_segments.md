---
status: week
type: bug
rank: 11
workstream: transcription
created_date: '2026-09-21'
tags: [transcription, batch, events, silent-failure]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related: [p1307, p1152]
---

# P1339: Every room's after-event transcript comes out empty while its job reports "completed"

## Problem

`/transcribe` works live: people see their speech appear on the phone, and prod holds the raw
per-message capture (`transcribe_messages`). After a room ends, the P1307 batch job reassembles each
member's archived audio into a second, cleaner transcript (`transcribe_room_transcripts.segments`).

**Measured on prod 2026-09-21, read-only:** every room transcript written since the batch pipeline went
live on 2026-09-14 has **0 segments**: 6 of 6 rooms, including the three from Clarity Night #1
(2026-09-18), whose raw captures hold 66, 0 and 572 messages. Every batch job for those rooms has
`status = completed`, `attempts = 1`, `error = NULL`. The main event-1 room lists all three recording
members in `incomplete_member_ids`.

So the job fails silently: nothing reports a problem, and the one artifact meant for reading after the
event is empty.

> Founder, 2026-09-21: *"I think recording kind of works? /transcribe works, I was checking on the
> phone. Not sure what is missing?"* What is missing is the after-event transcript; the live one works.

## Appetite

Blast radius: every recorded room, including every weekly event's R&D recording. Reversibility: high.
Diagnosis must not re-run the batch against the event-1 rooms before their state is read and kept
(epistemic gate 2b), since a re-run can overwrite the evidence.

## Root Cause

Unknown. **Hypothesis:** the archived audio chunks the job reassembles are missing, so every member ends
up "incomplete" and nothing is transcribed, while the job still marks itself completed (the pipeline
counts `missing` chunks in its stats, `services/transcribe-room-batch/pipeline.py`). **Cheapest
disproof:** list the event-1 rooms' archived chunk objects in storage, read-only, and compare them with
the slice counts on the member rows.

## Invariants

- A batch job that produces no segments for a member with captured audio must not report `completed`
  without saying why.
- The live transcript (`transcribe_messages`) is never modified by this fix.

## Acceptance Criteria

- [ ] The cause is named, with the read-only evidence that shows it
- [ ] A new recorded room produces a non-empty after-event transcript on prod
- [ ] A job that cannot transcribe a member says so (failed, or completed with a reason), and a test watches that path fail
- [ ] Event #1's rooms: either their after-event transcript is recovered, or it is recorded plainly why it cannot be

## Related

- P1307 (the batch pipeline), P1152 (real-device verification; still open)
