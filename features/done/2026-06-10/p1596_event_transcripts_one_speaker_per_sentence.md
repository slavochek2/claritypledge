---
status: all-done
type: story
rank: 85
workstream: events
created_date: '2026-10-30'
tags: [transcription, events, attribution, chat]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-11-02
---

# P1596: Event transcripts credit each sentence to one speaker; "Open" goes to your table's thread

## Problem

**Situation:** P1592 posts each attendee's live transcription into their round table's thread in
the event channel. Every mic is transcribed on its own, with no knowledge of the other mics.
**Complication:** A live solo test on TEST (2026-10-30, two mics on one Mac) showed mic bleed: the
same sentence was posted under both tablemates ("Can you hear me? ... I can hear you very well"
under one tablemate at 10:51:11 and the other at 10:51:14 and 10:51:27). P1592 accepted duplicates
("kept visible, never deleted", measured first). The founder overruled that: transcripts feed
canvases and who-said-what attribution, so a sentence credited to someone who did not say it is
wrong data.
**Question:** How does each sentence end up under exactly one person, the one whose mic it was
loudest on, live, at any number of mics per table?

> Founder, verbatim: "we want to use the transcript for dating on the canvases and other things and
> so if the whole point was to have voices attributed to users so how is it supposed to do that if
> we allow for publicates"

> Founder, verbatim: "The loudest noise is clear. So maybe that's enough"

Second, smaller problem: the event's transcription "Open" entry goes to the transcription room page,
which is only the recorder. The conversation lives in the channel thread.

## Appetite

Blast radius: one flow (event transcription posting) plus one link. Reversibility: medium; the
de-duplication can be switched off. Decision density: decided (founder 2026-10-30: options 1 + 2,
and Open goes to the thread).

## Solution

Decided 2026-10-30 (founder). Two complementary layers, plus the Open change.

1. **Each mic keeps only its own wearer.** The live transcription instruction tells the model to write
   down only the speaker close to this microphone and ignore distant or background voices. Cheap,
   per mic, live.
2. **Across mics, the loudest wins (the broadcast auto-mixer principle).** The recorder sends a
   per-second loudness reading with each 13 s slice. When tablemates' lines in the same room and round
   carry near-identical text within a few seconds of each other, the sentence is kept only under the
   person whose mic was loudest during those seconds; the other copy is not posted (kept stored, not
   shown). Compare moment by moment, never per slice, because both people often talk inside one
   slice. Act only on longer near-identical text so a genuine echo ("yes, exactly") is never dropped.
   Works for N mics at a table.
3. **"Open" goes to the live text (founder, solo test 2026-11-02; supersedes the rest of this item).** The chat stays
   empty until the next round starts, so Open lands on `/transcribe/:code`, which links on to the chat. Earlier text:
   the event's transcription entry opens the viewer's current
   round-table thread, or the event channel when not seated. The global recording bar keeps recording,
   so nothing is lost by leaving the room page.

A copy already posted when the louder one arrives: whether to retract it live or let it stand until the
end-of-room cleanup is the implementing agent's call, argued in the build; it must never leave both.

Research before building (time-boxed, cite sources): how multi-mic bleed is removed in auto-mixers,
podcast tools and meeting transcription, and what Gemini's audio docs say about isolating the near
speaker.

## Redesign (founder, 2026-10-30, after review)

The first build (live text-level dedup, commit b09fea073 on its branch) is withdrawn: reviewers showed
whole 13 s chunks from different phones rarely match word for word (both copies survive), and a chunk
holding two speakers went entirely to the louder mic (real words credited to the wrong person). Kept
from it: per-second loudness capture, the near-voice instruction, and Open going to the thread.

Decided:
- **Live text stays in the transcription room only.** The chat receives only the clean, attributed
  version, after the round (events) or after the room ends (no rounds). P1592's live posting into the
  chat is retired.
- **One tap to transcribe for the whole event.** Recording continues across rounds.
- **The host's "next round" confirmation cuts the round**, after the hands-up ritual
  (`docs/events/facilitator-checklist.md`), with a few seconds of buffer.
- **Attribution is decided on the audio, second by second, comparing all mics** (the auto-mixer
  principle), then each person's kept seconds are transcribed. Unit of processing: at least a table;
  whether to compare across the whole room (catches neighbour-table bleed) is open.
- **Fallback:** if the clean transcript is not ready or fails, nobody waits: no new canvas version that
  round, and the next partner reads the canvas as it is (P1529 must allow this).

## Benchmark Result (2026-11-01)

Public AMI meeting recordings (CC BY 4.0, AMI Consortium), clip-on mics, 4 people per table, scored against
the human who-said-what record. Win rule written before running; scripts ran outside the repo.

| Method (Argon unless noted) | Wrong or doubled | Long sentences lost | Short replies kept |
|---|---|---|---|
| Today (each mic alone), 4 meetings | 55% | 10% | 78% |
| Loudest mic per second, 4 meetings | 1.9% | 17% | 60% |
| Loudest mic per second, Transcribe / Flash | 4.3% / 6.2% | 17% / 16% | 60% / 64% |
| One mixed stream per table, best | 7.6% | 27% | 38% |
| Dedicated diarization tool (pyannote), best | 2.5% | 31% | 43% |
| Held-out 2 meetings: today | 69% | 5% | 77% |
| Held-out: loudest mic | 2.1% | 11% | 44% |
| Held-out: also open mics within 6 dB | 13% | 7% | 63% |
| Held-out: loudest mic, clocks off by up to 1 s | 5.9% | 9.7% | 42% |

No method passed the frozen rule: all lose speech said over someone else (about 90% of lost sentences
overlapped another speaker). **Founder's pick, 2026-11-01: loudest mic per second, Gemini 4 Argon**, accepting
the loss of overlapping short replies. Limits: one room, wired mics, one shared clock; neighbour-table bleed
is not measured here and is left to the live test.

## Build Plan (2026-11-01)

Answers Open Questions 2, 3 (per table), 7. Question 4 is measured in the live test.

- **Runs in the existing batch worker on the saved 30 s archive chunks.** No new phone data, so the loudness
  capture from the withdrawn attempt is not needed: loudness is measured from the audio itself.
- **Alignment:** upload time of each chunk (server clock) as anchor, refined by cross-correlating per-second
  loudness between mics at the table. Measured offline against known offsets before use.
- **The cut:** when the host confirms the next round, the previous round ends; a job per table waits for the
  buffer plus the last chunk, then runs. Seats are captured at the cut because seating has no history.
- **Posting:** clean text goes to the round thread; live posting to chat is retired (live text stays in the
  transcription room). No-round rooms and unseated speech post once after the room ends, in an Outside rounds
  post created then, so anyone with access at that moment can open it (settles Open Question 7).
- **Failure:** a failed or late job posts nothing and blocks nothing; the next partner reads the canvas as is.

## Cost Budget

One 15-minute table of 4 at most: 4 x 15 = 60 Argon calls per attempt, 3 attempts at most, so 180 calls. Measured
about $0.27 per table per round at Argon's introductory price, about $0.50 after it doubles on 2026-11-30. One 20-table-round event: about $5.40 on the first attempt, $16.20 if every job used all three attempts ($10 and $30 after the doubling). Each job reads the member's whole archive to measure chunk lengths, so archive reads grow with event length. Muted minutes are not sent. Added to the live slices and the end-of-room
pass, which stay, so event audio is transcribed three times; dropping the end-of-room pass for events is a later
cost decision. Cron: one job per minute, stops at the kill switch; it reads one indexed table. The kill switch ships off.

### Room archive as WAV (the archive each person saves for the whole event)

Format follows [metered-services.md](../../../docs/technical/metered-services.md). Prices are the GCS registry row's, whose
provenance is a search summary and third-party guides (the official page came back truncated): **unverified, re-read the
vendor page before a decision rests on them.** Event size is an assumption, not a measurement: "today" is one event of 30
people for 2 hours = 60 person-hours; "10x" is 600 person-hours. A round is 15 minutes with changeover, 3 rounds an hour.

| Measure | Per user (one person, 2 h event) | Per hour (one person-hour) | Per test run |
|---|---|---|---|
| Archive bytes uploaded | 2 x 115,205,280 = 230,410,560 B | 16,000 samples/s x 2 B x 3,600 s = 115,200,000 B, plus 120 chunks x 44 B header = 115,205,280 B | none in the unit tests (the upload is mocked); the e2e and integration specs that record are unchanged by this build (not re-measured: unverified) |
| Chunks / GCS writes (Class A) | 2 x 120 = 240 | 3,600 s / 30 s = 120 | none, as above |
| Requests to us per chunk, no failure | 240 x 3 = 720 | 120 x (1 chunk-number RPC + 1 signed-URL edge call + 1 PUT) = 360 (of which 120 Supabase RPCs and 120 edge invocations) | none |
| Requests per chunk, worst case (bounded) | 240 x 19 = 4,560 | 1 RPC + queue attempts 3 x inner retries 3 for the signed URL (9) + the same for the PUT (9) = 19; 120 x 19 = 2,280 | none |
| Worker downloads (Class B reads), round jobs | 6 rounds x 50 = 300 chunks = 288,013,200 B | a round job reads one mic's chunks within the window plus 5 min each side: (15 + 10) min / 30 s = 50 chunks = 48,002,200 B; 3 rounds an hour = 150 chunks = 144,006,600 B | none |
| Worker downloads, before-round-1 and room-end jobs | at most the rest of the archive once: 240 chunks = 230,410,560 B | at most 120 chunks = 115,205,280 B | none |
| Worker header peeks (12-byte ranged reads) | 240 objects x 6 round jobs = 1,440 | 240 objects x 3 jobs = 720 (shrinks for a shorter event; counts the whole archive of the mic) | none |
| Worker retries | a job that fails on Gemini re-runs up to MAX_ATTEMPTS = 3 times: reads and Gemini calls x 3 in the worst case | same | none |
| Service unit x registry price | PUT 240 x $0.05 / 1,000 = $0.012; reads (300 + 240 + 1,440) = 1,980 x $0.004 / 10,000 = $0.0008; storage 0.2304 GB x $0.020 = $0.0046 per month kept | PUT 120 x $0.05 / 1,000 = $0.006; reads (150 + 720) = 870 x $0.004 / 10,000 = $0.00035; storage 0.1152 GB x $0.020 = $0.0023 per month kept | none |
| Worker egress | 0.288 GB (rounds) + 0.230 GB (rest) at most = 0.518 GB; $0 if the worker and the bucket share a region (**unverified**), else at most 0.518 x $0.12 = $0.062 | 0.144 GB x $0.12 = $0.017 at the internet rate (upper bound) | none |
| Live slices uploaded (also uncompressed 16 kHz WAV, base64 in JSON; **not in the rows above**) | 2 x 165.4 MB = 330.8 MB on the wire | a slice every 13 s carrying 1 s of lead-in is 14 s x 32,000 B/s + 44 B = 448,044 B, base64 4/3 = 597,392 B; 3,600 s / 13 s = 276.9 slices = 165.4 MB on the wire (124.1 MB of WAV). Code: `SLICE_INTERVAL_MS`/`LEAD_IN_MS` and `emit` in `slice-recorder.ts`, `bytesToBase64` in `sendAudioSlice` (`transcribe-service.ts`). Sent while capture is not paused; counted, not measured on a device (unverified) | none |
| A person's phone (mobile data), archive + live slices | 230 MB archive + 331 MB slices = 561 MB uploaded | 115 MB archive + 165 MB slices = 281 MB uploaded an hour; the link must carry about 78,000 B/s = 624 kbit/s to keep up | none |

1. **Fits the plan limit today?** GCS has no plan cap in the registry, only prices: today = 60 person-hours x $0.006 = $0.36 of writes,
   60 x $0.00035 = $0.021 of reads, 6.91 GB archived (60 x 115,205,280 B) = $0.14 a month kept, worker egress $0 to $1.04 (60 x
   $0.017) depending on the unverified region. Supabase free plan, edge function invocations (500,000 a month, registry): the
   signed-URL calls are 60 x 120 = 7,200 an event, 1.4% of the cap before anything else. Unchanged by this build: chunks are still 30 s (main `CHUNK_INTERVAL_MS` in `room-capture-context.tsx`, now `ARCHIVE_CHUNK_MS` in `slice-recorder.ts`, both 30,000 ms) and `uploadRoomAudioChunk` still makes one signed-URL call per chunk; only the chunk's size (WAV, about 960 KB) and the PUT's timeout changed. The organisation's other edge-function usage was **not read for this budget: unverified**, so the unread organisation usage is an open input. Verdict: fits on the arithmetic, one input unverified.
2. **Fits at 10x?** 600 person-hours: writes $3.60, reads $0.21, 69.1 GB archived = $1.38 a month kept, worker egress up to $10.37, and 72,000
   edge invocations = 14.4% of the cap per event. Fits on the arithmetic; the same input is unverified, and an event a week would multiply the Supabase figure by about 4.
3. **If either answer is no:** the Supabase Pro plan from $25 a month (registry), or a signed-URL path that does not pass through an edge function.

Retention of the archive bucket is not stated anywhere this build reads: if the objects are kept for ever, the storage line
above is a monthly figure that grows by 0.1152 GB for every person-hour recorded.

## Known Limitations

- Readers see one block per speaker per minute, not sentence-level turns, so within a minute the order is coarse.
- A table where someone seated lacks audio gets what exists, marked in the thread title (founder default, 2026-11-02); some of the missing person's words may appear under a tablemate whose mic picked them up.
- A seat change during a round gives both tables no clean transcript for that round.
- Outside rounds: a non-recording person nearby can be credited to the only recording mic.
- A second transcribe room for one event would replace the first Outside rounds pointer in My rounds.
- A room that ends during an open round: the stretch inside that round stays with the round (the room-end job leaves the round's seated people out, the cut keeps the room), so that round's audio simply ends where the room ended. A round the host never closes is closed automatically 2 h after every room of the event ended, at the last room's end, so a table's text can arrive that late.
- Unread and previews: a thread root is stamped at the time it covers, which can be earlier than a reader's last read. Unread counts only top-level rows created after the last read and the inbox previews the newest top-level row, so someone who already read the chat gets no unread count, no preview and no bump when such a root (or a thread under an older root) arrives. The comment in migration 20261102143000 saying these are unchanged is wrong for that case (corrected in 20261102170000); behaviour is not changed.
- A late-RSVP speaker's words are dropped when a shared root predates their access (founder rule P1592 D1).
- Order can still invert through the RSVP floor: if an RSVP lands between two root posts, a later-posted earlier thread is stamped at that RSVP and sorts below the thread posted before it.
- Lines from two rooms in one shared thread (same place, same event) sort by post time, not by speaking time.
- The archive's recorded duration counts every chunk before the last as a full 30 s, so a capture that paused overstates it (tracking metadata only; no code reads it for behaviour).
- A seat moved while another room of the event is still running makes both tables post nothing, as with any mid-round move.
- The host changes the people list after every room ended, before the round closes: the cut reads the current seats, so a moved person's words go to their new table and a person marked left is not posted.
- A person restarting recording in the same instant the tick closes a round abandoned for 2 h: that round closes at the old room's end, and the new speech goes to the room's own outside-rounds thread.
- Only rounds that started after posting was switched on are auto-closed; an older abandoned round stays uncut, on purpose.
- Audio really spanning more than 3 h in one round (a rejoin in a new room, or one very long round) fails that table's job and posts nothing.
- When every mic at a table dies early and the round closes on time, the thread carries no missing-audio mark, because missing is measured against the table's own last audio. A seated person with no audio still marks it.
- Nothing recorded before posting was switched on gets a clean transcript: no job is created for a window starting before the switch. A room or round running at that moment gets none, so switch on before people start.
- End waits for the upload backlog for at most 90 s (the End button reads "Stopping..." and the bar's controls are disabled while it waits). A queue of 10 chunks at 256 kbit/s needs about 380 s, so on a slower link the tail of the archive is not saved before the server is told the capture ended; the cap was not raised because the wait blocks the person's UI.

## Open Questions (to settle before rebuilding)

1. Does it work? Never tested. Settle with a bench test on real recordings: two or three phones,
   two tables close together, measure misattributed and duplicated sentences.
2. Which tool: per-second loudest-mic gating then Gemini per person; one mixed stream per table with
   Gemini diarization given the speaker list; or a dedicated diarization / crosstalk tool. Research,
   plus the founder's AI-engineer group's experience, plus a Gemini + Codex review of the options.
3. Per table, or the whole room as one comparison with table metadata (neighbour-table bleed)?
4. Processing time after the cut, by group size: measure from past events' cleanup jobs.
5. Benchmark source (founder, 2026-11-01): start offline on public meeting recordings with one mic per
   person and a who-said-what transcript (e.g. the AMI and ICSI meeting corpora; licences not yet
   checked), comparing the methods in question 2 and Gemini 3.5 Transcribe against 3.8 and 4 Argon.
   A real 4-phone, 2-table session confirms the winner afterwards.
6. Ship together with P1592? (recommended 2026-11-01, awaiting the founder's choice). P1592 is complete on its branch but carries the
   terms v1.6 change, so shipping it alone would show every user a terms notice for posting that is
   off, and a second notice once P1596 changes what is posted. One terms update, worded for what
   ships; P1592's live-posting checks are ticked in the same live test.
7. A walk-in whose channel access began after P1592's single "Outside rounds" thread was created
   cannot open it (their unseated lines go to the channel top level). Decide here, alongside when
   and where clean transcripts post.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A genuine echo between two people is dropped as a duplicate | MITIGATE | Act only on longer near-identical text; measure at the next real event |
| The near-voice instruction drops quiet real speech | MITIGATE | Measure against the slice audio on the next test; layer 2 still holds if layer 1 is off |
| Clocks differ between phones, so "same moment" is fuzzy | MITIGATE | Use a window of a few seconds; P1252 covers precise alignment |
| A sentence posts, then a louder copy arrives | MITIGATE | Never both shown; mechanism chosen in /dev |
| One person, two mics in one room (the solo test) still doubles | ACCEPT | Not the event setup; real lavaliers on two people are the target |

**Non-Goals**
- Do NOT build voice profiles or speaker recognition here (heavier; only if 1 + 2 fall short).
- Do NOT change where lines route (rounds, tables, threads: P1592 owns that).
- Do NOT change the end-of-room batch's own "also heard by" labelling in this spec.

## Acceptance Criteria


## Solo test findings (2026-11-02)

- Self-hosted TEST had no `GCS_UPLOAD_SECRET`, so no audio was archived: every clean job found nothing. Added from Secret Manager. Prod has the secret; check it at Pre-deploy.
- The Back moves to the shell bar on desktop and Transcribe is one full-width row (founder; supersedes P1562 section 1a and the P1542 UAT 2026-10-29 placement).
- No "processing" indicator was built: the bar and the live text page say when text comes. Recording rules, host control and a chat indicator moved to P1529.

## Approved after solo test 2 (founder, 2026-11-02), to build

- [ ] Safari keeps saving audio while its window is in the background. Reproduced: minimized, the recorder delivers almost nothing until stop.
- [ ] One transcription bar on screen, whichever event is recording.
- [ ] Back is "← Event" on the tabs row (arrow only on the narrowest phones), the bar under it. "Back to readiness" goes; the Ready tab does that job. Tab names stay visible on phones.
- [ ] The bar stays one line: "Text arrives after the round", the full sentence behind the info icon.
- [ ] Today's event opens the event room for a registered person while the event is on, and stays visible with the menu collapsed.
- [ ] An event's chat has a way back to the event room.
- [ ] "Transcribed" shows once per run of one person's messages.
- [ ] Threads in time order: Before round 1, the rounds, After the last round. An event with no rounds: one thread, "The conversation". Someone sitting out a round goes to After the last round.
- [ ] Gemini 4 Argon checks desktop and phone visually, with and without the bar.

## Done-When


## After deploy: to prove with real people (founder, 2026-11-02)

Real people can only reach this on prod, so the founder moved these here to ship first and test after. They are NOT proven; tick them from the people test.

- [ ] With two people at one table, each on their own mic, a sentence one of them says appears once,
      under that person, in the table's thread.
- [ ] With three mics at one table, the same holds.
- [ ] A short echo ("yes, exactly") said by both people is kept under both.
- [ ] "Open" for an event's transcription lands on the live text page, which says when clean text comes and links to
      the chat, and my recording keeps going. Back returns where I came from, or to the event room.
- [ ] A table where someone's audio is missing still gets what exists, and its thread title says audio is missing
      (founder default, 2026-11-02). A table with no audio at all gets nothing.
- [ ] Research notes with sources recorded in this spec.
- [ ] Duplicate count from a real two-person lavalier test recorded here, before and after.

## Related

- P1592 (event transcripts land in round threads): this overrides its duplicate ACCEPT.
- P1252 (merged multi-phone audio is never time-aligned): alignment and the crosstalk scan.
- decisions.md 2026-09-16 [product]: pair consent and neighbour bleed.
