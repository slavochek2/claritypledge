---
status: week
type: bug
rank: 5
workstream: transcription
created_date: '2026-09-21'
tags:
  - transcription
  - batch
  - events
  - silent-failure
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, adversarial-review, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1307
  - p1152
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

**Confirmed 2026-09-22, read-only.** The job looks for audio where the app *asks* for it to be stored,
not where it *is* stored. The app requests the upload folder `rooms/{code}/{name}-{member_id}/`; the
out-of-repo signed-URL Cloud Function stores it as `sessions/rooms{code}{name}-{member_id}/` (adds
`sessions/`, strips the slashes). Evidence:

- Cloud Run logs: all 8 completed jobs since 2026-09-16 logged `chunks: 0, runs: 0, segments: 0`.
- Bucket: `rooms/` holds no objects; `sessions/rooms*` holds 24 member folders, ~325 chunks.
- The fixed selector run over the real listings of SY8KAP / MWZDVT / 24LSKP picks 142/142, 40/40 and
  5/5 chunks with no gaps (the old one picked 0).

The first hypothesis (chunks missing) is disproved: the audio is intact, so event #1 is recoverable.

## Fix

- `audio.py`: list and match both layouts (`room_listing_prefixes`); the member-id suffix still binds.
- `pipeline.py`: zero chunks never completes. It goes back to pending for the sweep (an upload can still
  be in flight), and on the last attempt the member is written into the transcript as incomplete and
  the job fails with `no_audio_chunks`. Members who only listened get jobs too (the sweep creates one
  per member with `last_seen_at`), so they end as `failed: no_audio_chunks`, listed as incomplete.
- `api.ts fetchRoomTranscript`: an after-event transcript with zero segments no longer hides the live
  transcript. Until this ships, every recorded room's page shows an empty transcript to readers.

## Recovery runbook (after deploy, founder approval, prod write)

Old jobs are `completed`, and nothing re-claims a completed job. After the service is redeployed:

```sql
UPDATE public.transcribe_room_transcription_jobs
   SET status = 'pending', attempts = 0, error = NULL, updated_at = now()
 WHERE status = 'completed' AND created_at >= '2026-09-14';
```

Then trigger `/sweep` (or wait for Cloud Scheduler). Each job re-merges only its own member's entries,
so re-running is safe for the transcript rows. This spends Gemini batch quota for every recording.

## Known gap (not fixed here, pre-existing)

A final chunk still uploading when the job lists the bucket is not detected: numbering has no known end,
so 0..4 visible out of 0..5 reads as complete. Reviewer finding (Codex); candidate follow-up.

Also open (Opus reviewer): once any member's after-event transcript is non-empty, it replaces the live
one for the whole room, so a member whose audio is missing loses their live lines on that page (they
are shown as incomplete only after the last retry). And `no_audio_chunks` will also fire for members
who only listened, which adds noise to the failure signal. Both are candidate follow-ups.

## Review log (2026-09-22)

3 of 3 reviewers reported: Codex (REJECT: old jobs stranded, no-audio race permanent, late final chunk),
Gemini 3.8 Flash, served-verified (REJECT: listeners vanish from the transcript, no-audio race),
Opus (listener noise, partial-room hiding, test gaps). Fixed: retry on no audio, keep the member
listed on the last try, empty-transcript fallback, recovery runbook. Deferred: see the two sections above.

## Invariants

- A batch job that produces no segments for a member with captured audio must not report `completed`
  without saying why.
- The live transcript (`transcribe_messages`) is never modified by this fix.

## Acceptance Criteria

- [x] The cause is named, with the read-only evidence that shows it
- [x] A job that cannot transcribe a member says so (failed, or completed with a reason), and a test watches that path fail

## Post-deploy verification

Both need the deploy and the recovery runbook above; neither can be proven from the branch.

- [ ] A new recorded room produces a non-empty after-event transcript on prod
- [ ] Event #1's rooms: either their after-event transcript is recovered, or it is recorded plainly why it cannot be
- [ ] Check the job table after the sweep: rooms transcribe, listeners end as `failed: no_audio_chunks`

## Related

- P1307 (the batch pipeline), P1152 (real-device verification; still open)
