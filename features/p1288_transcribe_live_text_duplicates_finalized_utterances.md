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

## Second measurement, 2026-09-09 — the duplication is STEADY, which kills one hypothesis

The founder ran a second live session on the phone against prod while it was watched
(room `9XU2YJ`, 87 seconds). Broken into 10-second buckets:

| bucket | rows | distinct | ratio |
|---|---|---|---|
| 0 | 20 | 14 | 1.43 |
| 1 | 26 | 15 | 1.73 |
| 2 | 46 | 23 | 2.00 |
| 3 | 21 | 12 | 1.75 |
| 4 | 6 | 4 | 1.50 |
| 5 | 48 | 26 | 1.85 |
| 6 | 12 | 7 | 1.71 |
| 7 | 14 | 7 | 2.00 |
| 8 | 3 | 2 | 1.50 |
| **total** | **196** | **109** | **1.80** |

**The ratio does not climb with session length.** It sits around 1.8 from the first bucket
to the last, and the worst single repeat fell from 11 (room `RG7YQF`) to 5 here.

**This rules out a runaway accumulator.** If the page were re-sending an ever-growing
history — `sentLengthRef` resetting while `transcript` survived, or the whole transcript
being re-diffed — the ratio would rise as the session lengthened, because each replay would
carry more text than the last. A flat ~1.8 means each finalized utterance is written
approximately **twice, once**, and then never again.

That is the signature of a single duplicate emission per result, not a replay. It promotes
the `onresult` hypothesis above (a re-fire whose `resultIndex` points back one result,
re-appending exactly one already-final result) and demotes the page-diffing alternative.
`sentLengthRef` is set synchronously before the `await`, so two effect runs against one
`transcript` value cannot both send — consistent with what the ratio shows.

**It does not yet CONFIRM the hypothesis.** The disproof in the previous section is still the
thing to run: log `event.resultIndex` and `event.results.length` per `onresult` on the phone.
A steady 1.8 is consistent with a duplicate emission but does not identify which layer emits
it. **Do not write the fix off this table alone.**

**Founder observation on that same run, and it matters more than the table.** Asked to watch
the indicator: *"reconencitng microhone was not flashing but now i saw it flashing"* /
*"so it does flsh now"*. So during the 87 seconds of continuous speech the recogniser was
**not** cycling — the reconnect state appeared only afterwards, once speaking stopped.

**That decouples the two symptoms, which had been assumed to be one.** The duplication
happened while the recogniser was running steadily, so session restarts cannot be causing it.
A restart-driven duplication would have to coincide with the flashes, and it did not. This is
consistent with the flat 1.8 ratio above and with the `onresult` hypothesis; it is evidence
against anything involving `onend`/restart.

It also reframes the flashing itself as **probably benign** — the recogniser ending when
speech stops is ordinary behaviour, and the UI showing "Reconnecting microphone…" in the gap
is a copy problem (it reads as a fault to the user), not a mic fault. Two separate issues that
looked like one:

1. duplicated utterances while recognition runs — this spec;
2. a resting state that announces itself as a failure — cosmetic, and NOT the 2026-09-01
   churn, which fired *during* speech with `heard=false`.

**Do not merge these.** Conflating them is what produced P1236's overstated root cause.

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
