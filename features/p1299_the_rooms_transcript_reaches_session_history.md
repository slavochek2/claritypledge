---
status: week
type: story
rank: 94
severity: medium
workstream: transcription
date_reported: '2026-09-10'
created_date: '2026-09-10'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [transcribe, sessions, transcript]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1299: the room's transcript reaches session history

## Problem

A `/transcribe` room already creates a real session and links every participant to it —
verified 2026-09-10: every `transcribe_room_members` row carries a `session_id` pointing at a
live `clarity_sessions` row. The founder's read of this was correct:

> "I think we already produced an entry in Clarity Sessions page, but it just doesn't show the
> transcript. Is that so?"

Yes. The session exists, the audio is saved, the live transcript rows exist — and **nothing
connects them**. The session page shows an entry with no transcript.

Worse, until 2026-09-10 the room *told people it would*. The consent screen read *"A corrected
transcript is produced afterward and added to your session history."* Nothing produced it:
`transcription_jobs` rows are created only for `/live` sessions, and no path enqueues a job for
a room's recording. That sentence was removed in P1236 rather than left standing on a **consent**
screen — people agree to be recorded partly on the strength of what they are told they get back.
**This spec is what earns the sentence back.**

## Approach

Two independent halves. Ship the first alone if the second needs more thought — the first is
most of the value and needs no new pipeline.

**1. Show what already exists.** The live rows in `transcribe_messages` are a complete, ordered,
speaker-attributed transcript of the room. Render them on the session page. This is a read and a
view; no job, no queue, no new infrastructure.

**2. Produce the accurate version from the whole recording.** The full audio is already uploaded
in 30-second chunks to the same storage `/live` uses. P1298 measured that whole-audio
transcription is materially better than the live per-slice text — coherent where the live text
is fragmented and occasionally invents words at cut boundaries. So the ideal end state is: the
live text is the preview, and a pass over the reassembled recording is the record.

Before building a new pipeline for (2), **check whether the existing one already fits**:
`enqueue-transcription` and the batch job machinery exist for `/live` sessions and already write
`transcription_jobs`. A room's audio lands under a different prefix but through the same
plumbing. Reusing it is very likely cheaper than a second pipeline — verify, do not assume.

`[FOUNDER DECISION: copy]` — if (2) ships, the consent screen can promise a corrected transcript
again. Restore the wording only once something actually keeps the promise, and let the founder
write it.

## Invariants

- **Never promise on the consent screen what the system does not do.** This is the specific
  failure this spec exists to repair; re-introducing it would be worse than the original,
  because it would be knowing.
- Attribution survives into the transcript: who said what, from the server's record, never
  re-derived on the client.
- Whatever is shown must be readable by exactly the people entitled to the room's contents —
  reuse the room's existing membership rules rather than inventing new ones.

## Acceptance Criteria

- [ ] After a room ends, its session entry shows the transcript, attributed by speaker, in
      spoken order.
- [ ] A person who was not in the room cannot read it.
- [ ] A room with no speech shows an empty state, not an error or a blank panel.
- [ ] If half (2) ships: the transcript shown is the whole-audio version, and it is visibly
      better than the live text on the same recording — compared on one real recording and the
      comparison written into this spec.
- [ ] If half (2) ships: the consent-screen wording is restored, written by the founder.

## Key Files

- `src/app/data/sessions-service.ts` — how a session and its jobs are read today.
- `supabase/functions/enqueue-transcription/` — the existing batch path for `/live`; check
  reuse before building anything new.
- `src/app/data/api.ts` — `uploadRoomAudioChunk` and the room audio path layout.
- `src/app/pages/transcribe-room-page.tsx` — the consent and ended screens carrying the
  `[FOUNDER DECISION: copy]` markers this spec resolves.

## Related

- P1236 — server-side transcription; removed the false promise and left the marker.
- P1298 — segmentation, which decides how good the live text can get on its own.
