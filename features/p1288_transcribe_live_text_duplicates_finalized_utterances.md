---
status: week
type: bug
severity: high
rank: 1000090
workstream: transcription
created_date: '2026-09-09'
tags: [transcribe, transcription, mobile, data-quality]
feature_type: frontend
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
disclosure: public
---

# P1288: `/transcribe` writes each finalized utterance several times

## Problem

**Situation:** P1275 restored room creation on prod on 2026-09-09. The founder immediately
ran the first real session on a physical phone against the live site — room `RG7YQF`, the
first `/transcribe` room anyone has been able to create since 2026-09-01.

**Complication:** The room recorded **134 rows in 53 seconds** — 2.5 writes per second,
averaging 13.9 words each, roughly 1,800 words written for under a minute of speech. They
are not 134 utterances:

| measure | value |
|---|---|
| rows | 134 |
| distinct texts | 66 |
| most-repeated single text | **11 times** |
| span | 53 s |

So slightly over half of every row on that screen is a repeat. The founder's report was
*"its not trasnibing proepelry and it flashing the 'reconnecting' as before"* — the repeats
are what "not properly" looks like from the room.

**This was not reachable before today.** Room creation had been broken since 2026-09-01, so
no one could get into a room to see it. P1275 did not cause it; P1275 made it observable.

**Question:** Why is a finalized utterance appended more than once, and is the fix here or
in P1236's replacement of this path?

## Root Cause

**Hypothesis (UNVERIFIED — needs the disproof below run before any fix).** `onresult` in
`src/hooks/useSpeechToText.ts:173-199` accumulates from `event.resultIndex` forward and
appends every `isFinal` result to a growing string:

```ts
for (let i = event.resultIndex; i < event.results.length; i++) { … }
if (finalTranscript) setTranscript(prev => prev + finalTranscript);
```

`event.results` is cumulative for the life of a recognition session. This is correct **only
if `resultIndex` always advances past results already consumed.** Android Chrome is
documented to re-fire `onresult` with a `resultIndex` at or before a result that was already
final, which re-appends it. The page then diffs the accumulated string
(`transcribe-room-page.tsx:123-129`, `transcript.slice(sentLengthRef.current)`) and writes
the delta — so a re-append becomes a new row, not a corrected one.

The constant restarting the founder sees as the flashing "Reconnecting microphone…" gives
this many chances to happen: each new session resets `results` while the page's accumulated
string and `sentLengthRef` carry across.

**Cheapest disproof:** log `event.resultIndex` and `event.results.length` per `onresult` on
the physical phone over the adb console for one 30-second session, and check whether
`resultIndex` ever fails to advance. If it always advances, this hypothesis is dead and the
duplication is in the page's diffing, not the hook — check whether the effect at
`transcribe-room-page.tsx:123` can run twice against one transcript value with a
`sentLengthRef` that did not persist.

**Not yet ruled out:** two mounted copies of the page, or `sentLengthRef` resetting on a
re-mount while `transcript` survives.

## A second finding this run produced, and it is about P1236, not this bug

**P1236's recorded root cause does not explain what prod is doing.** That spec concludes
*"H1 is confirmed; H2 is not implicated"* — that the recogniser dies because `MediaRecorder`
holds the microphone. On prod, `RECORD_AUDIO_WHILE_LIVE = false`
(`transcribe-room-page.tsx:54`) and **both `getUserMedia` and `MediaRecorder` sit inside that
flag** (`:133-166`), so no recorder runs and nothing contends for the microphone — and the
founder still saw the restart churn that H1 was supposed to explain.

That does not make P1236's remedy wrong: it deletes browser speech recognition entirely and
moves transcription server-side, which fixes the symptom whichever hypothesis is true. It
does mean **H2 (Android ending `continuous` sessions on its own) is back on the table and
P1236's Problem section overstates what the A/B established** — that A/B was one 25-second
sample on a dev server, not prod.

Recorded here rather than edited into P1236 because P1236 is mid-flight in a worktree and
this evidence came from a different code path on a different environment.

## Acceptance Criteria

- [ ] The disproof above is run on the physical phone and the result recorded here, before
      any fix is written
- [ ] A 60-second session on a physical phone produces a row count consistent with what was
      actually said — no text appearing more than once
- [ ] A regression test drives the duplication shape directly: feed `onresult` a second event
      whose `resultIndex` does not advance, and assert the accumulated transcript grows by
      zero. This must fail before the fix
- [ ] The founder can read the room back and recognise it as what they said

## Notes

- Room `RG7YQF` is live on prod with `ended_at` NULL and holds real founder speech. **Its
  content is deliberately not quoted here** (public repo) — every measurement above is a
  count, a length or a timestamp. Deleting it is the founder's call.
- If P1236 ships first, this path is deleted and the bug goes with it. That is not a reason
  to close this: P1236 needs two physical devices, a prod deploy and a spend cap before it
  can ship, and this is writing duplicate rows into prod today.
