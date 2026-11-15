---
status: week
type: task
rank: 338
workstream: events
created_date: '2026-11-15'
tags: [transcription, events, audio-upload]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 47b5f58d476730c6a5e984144d2ab82806f0eba67a8b133e18e57726105352c8
spec_review_vendors: [gemini, openrouter]
---

# P1684: Room audio chunks carry their recording time, so a delayed upload never moves audio in time

## Problem

**Situation:** A room's recorder sends its audio to the archive in 30 s WAV chunks named only by number (`chunk_000.wav`, ...). Chunk numbers come from the server and keep counting across a pause, a resume, a reconnect and a reload. The worker (`services/transcribe-room-batch`) times chunks from their numbers and the archive's object creation time (the upload time), in two places:

- **Round clean text** (`audio.chunk_end_times`, used by `round_clean.py`): inside a stretch, chunk n ends at `base` plus the summed durations of chunks 0..n (a pause flushes a short chunk), and `base` is bounded by the smallest upload delay from that chunk onward (the P1611 causal bound, decisions.md 2026-11-05). The round job's readiness check (`pipeline.py`, "waiting") also reads upload time as recording time: it waits until some chunk was uploaded after the window's end.
- **The saved room transcript** (`pipeline.transcribe_member`): `audio.split_into_runs` decides from upload-time gaps (`_time_gap_before`) where one run ends and the next begins, and each run starts at its **first** chunk's upload time minus 30 s (`audio.run_start_ms`).

**Complication:** Since P1529 INBOX-338 (2026-11-14), a chunk whose upload fails for a reason that can clear is kept and retried rather than dropped after about 6 s. A chunk is still dropped, leaving its number as a hole, when the queue of 10 is full (an outage of more than about 5 minutes) or when it has failed for 10 minutes. A run of the real `chunk_end_times` on simulated upload times (2026-11-15, spec review) shows when recovered audio is now misplaced:

- **A late group with nothing on time after it** (the outage ended by a pause, End, a reconnect, or a round job that read the archive early) is anchored on its own last upload. It lands as late as that last chunk was: 30-61 s late for a one-minute outage.
- **A late group followed by an on-time chunk** lands within about 15 s.
- **A chunk just before a hole** (audio dropped because the queue was full, after an outage of more than about 5 minutes) is placed at its upload time: 310 s late in the simulated case.
- **In the saved room transcript**, a run whose first chunk arrived late is shifted by that whole delay. That applies to the full recording, as in the 2026-11-13 test, where the recorder's first chunks arrived minutes late.

Inside a round this confuses which mic was loudest. Near a round's end, words can land in the next round's thread. Before INBOX-338, the late chunks of the first three shapes were lost outright, and the fourth already happened whenever a run's first delivered chunk was late. The founder accepted shipping P1529 with this and fixing it here:

> Founder framing, verbatim, 2026-11-15: *"hard to test why do i need to test them you tested them right i mean we can just ship it"*. Then, to "Ship now, fix it as a separate task" (with three other recommendations): *"yes to all"*.

**Question:** How does the worker learn when each chunk was **recorded**, robustly enough that no upload delay moves audio, in both placement paths?

## Appetite

- **Blast radius:** medium-high. Every event room's timing: which round and which person a sentence goes under, and the saved transcript's order. It touches the recorder, the `gcs-signed-url` file-name gate and the worker, which deploy separately.
- **Reversibility:** low to medium. The worker matches names strictly (`audio._CHUNK_FILE_RE`, a `fullmatch`), so a worker without the new format silently **ignores** new-format chunks: rolling the worker back hides every chunk already written that way. The rollout order is part of the design.
- **Decision density:** low for the founder. The design questions below are technical.

## Solution

Carry each chunk's recording position with the chunk, and place chunks by it in both placement paths. Upload times remain the anchor to server time and the outer bound. This spec fixes the requirements and the open design questions. The implementer settles the design in `/dev`, writes it into this spec, and gets it reviewed before building.

**Requirements**
- **Fixed when the chunk is cut:** the position is set once, when the chunk is made, so every retry of that chunk uploads under the same name with the same position. (Several objects per chunk number are already possible, `.webm` and `.wav`, `_dev_` or not, and the worker keeps the newest. This must not add a new way to create them.)
- **Time between chunks, audio within them:** the position must place a chunk's start in elapsed time on the recorder, pauses included: a counter of recorded samples alone would erase every pause (a pause keeps one recorder and produces no audio). The chunk's own length comes from its samples, as now. Whether a monotonic clock (`performance.now`) diverges from recorded samples during an audio stall must be measured, and the design says how it is handled.
- **Boundaries the worker can see:** chunk numbers continue across a pause, a resume, a reconnect and a reload, and a reload restarts the recorder's clock. The worker must tell a new recording segment from a continuing one without guessing, so the boundary travels with the chunk (for example a segment id with the position measured from that segment's start). Today's upload-gap inference (`_time_gap_before`) remains the fallback for chunks without it.
- **An anchor to server time that a late upload cannot move:** when every upload of a segment was late (recording started during the outage, as on 2026-11-13), upload times give no anchor near the recording's start. The design names one that is stamped at recording time, for example the live caption slices, which reach the server every few seconds while recording (each stamps the member's `last_seen_at`), or the capture-start write.
- **Both paths:** the round clean text and the saved room transcript place by the position, `split_into_runs` splits by segment rather than upload gaps where the position is known, and the round readiness check stops treating upload time as recording time.
- **Checked, else today's timing:** within a segment, positions must increase, match the chunks' durations and order, and never put a chunk's end after its own upload (the causal bound). A segment that fails any check is placed exactly as today, as a whole.

**Open design questions** (answer in the spec before building)
1. How the position and segment travel: in the file name (`ROOM_FILE_NAME_RE` in `gcs-signed-url` and `audio._CHUNK_FILE_RE` in the worker both change, and the out-of-repo Cloud Function that signs the name must accept it), or as object metadata (the edge function forwards only `sessionCode`, `fileName` and `contentType`, so both it and the out-of-repo signer would have to sign the metadata header, and the worker's object listing must read it).
2. The server-time anchor (Requirements, above).
3. How mixed archives place: old-format chunks, a segment with some chunks in each format, legacy `.webm` chunks, and the legacy `sessions/rooms<code>` prefix the worker still lists.
4. The rollout order across four separately deployed parts (worker, out-of-repo Cloud Function signer, `gcs-signed-url`, client), and what a rollback of each does to chunks already written.

## Invariants

- **Causal bound (decisions.md 2026-11-05, P1611):** a chunk ends no later than its own upload, nor any later upload minus the audio in between. The recorded position tightens placement inside that bound and never moves audio past it.
- **Old chunks still place:** archives written before this change are timed exactly as today.
- **Holes stay holes:** a chunk number reserved and left unused (INBOX-338's dropped chunks) still means audio is missing there.
- **Who may write where is unchanged:** the room prefix and membership checks in `gcs-signed-url` decide it, and the name check keeps refusing slashes and `..`. A position field in a name is bounded in length and digits only.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A new-format chunk reaches a worker that ignores it | MITIGATE | The worker that reads both formats deploys before any client writes the new one. The rollout order is design question 4. |
| The out-of-repo Cloud Function signer refuses the new name or metadata, so every room upload fails | MITIGATE | Change and verify the signer (a real signed PUT against the bucket) before the edge function or client changes. `gcs-signed-url`'s tests mock it, so they cannot catch this. |
| The position drifts from server time over a 3-hour recording | MITIGATE | Measure the drift on a long TEST recording, and state the result in the design before relying on the position alone. |
| A buggy or tampered position | MITIGATE | Bounded trust (Requirements). Fall back to today's timing on disagreement. |
| A late round's audio still misses its round's clean text (the worker waits at most 3 min after a round ends, `READY_DEADLINE_S`) | DEFER | A separate design (re-clean a round when late audio arrives), recorded in P1529's Known Limitations. Out of scope here. |

**Non-Goals**
- Do NOT change the cross-correlation aligner or the loudest-mic rule.
- Do NOT add a request per chunk, or a separate timing upload.
- Do NOT change `/live` session uploads (`sessions/` prefix). Rooms only.

## Done-When

- [ ] The design (design questions 1-4) is written into this spec and reviewed before code.
- [ ] Worker tests over the real placement functions, with simulated true recording times as ground truth, each first seen failing on today's code: (a) a late group with nothing after it (outage then End), (b) a chunk just before a hole, (c) a segment whose uploads were all late, in the saved room transcript, (d) a pause inside a segment. Each places every chunk within 3 s of its true time.
- [ ] A worker test: a recorded copy of today's placement for a set of old-format archives is unchanged by the new code.
- [ ] Worker tests: positions that run backwards, that disagree with the chunks' durations, or that put a chunk's end after its upload, and a mixed old/new segment, each place that segment exactly as today.
- [ ] If the position travels in the name: `gcs-signed-url` tests accept the new name for the member's own prefix and still refuse another member's prefix, another room and a `/live` path, plus one real signed PUT through the Cloud Function signer on TEST.
- [ ] One TEST run: a recording whose archive is blocked for about a minute, recorded on purpose to start with the block on, then ended with Stop. The test notes the block's start and end times, and the worker's placement output for that member puts the held chunks within 5 s of when they were recorded. `[post-deploy]` re-check on the first real event after the worker deploy.

## Cost Budget

Touches the Cloud Run worker, the `gcs-signed-url` edge function and the archive bucket (metered-services "When this applies").

| Measure | Today | After |
|---|---|---|
| Edge function calls per chunk try | 1 | 1 (the position rides on the existing name or object; no request added) |
| Bucket PUTs per chunk try | 1 | 1 |
| Objects per chunk number | 1 per format (newest kept) | The same (a retry rewrites the same object) |
| Worker work per job | Chunks ordered by number, placed in one pass | The same pass, reading one more field per chunk |

Fits wherever today's room uploads fit, and at 10x recorders, since no request or object is added per chunk. If the anchor uses a time the server already writes while recording (a slice's `last_seen_at` stamp, the capture-start write), no request is added; if it needs a new stored value, the design counts that write. Tests (rule 6): the TEST run is one recording of about 3 minutes (one user, one event, about 8 signed-URL calls and PUTs, one reservation per chunk) plus one worker job for that room, which pays for the transcription of about 3 minutes of audio (Gemini, a few cents at the registry rates).

## Related

- P1529 (`features/p1529_canvas_event_host_coordination.md`), Known Limitations: "Recovered audio after a short outage can be placed late" (the source) and "Recovered audio can miss its round's transcript" (out of scope).
- P1611 (`features/done/2026-06-10/p1611_sentence_posted_under_two_people_with_loudest_mic_on.md`): the causal bound this keeps.
- P1608: the live test with real recordings, a candidate harness for checking placement with speech.
