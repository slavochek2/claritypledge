---
status: all-done
type: bug
severity: high
rank: 1000090
workstream: transcription
created_date: '2026-09-09'
tags: [transcribe, transcription, mobile, data-quality]
feature_type: frontend
pipeline_ran: [create-spec, fix]
drafted_by: opus
driver: anomaly
disclosure: public
completed_at: 2026-09-09
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

- [x] The hook is idempotent per finalized result, and provably does not drop speech when a
      new session begins without `onstart` firing
      **Done 2026-09-09.** Both directions proven: removing the session-start resets makes
      the drop-protection test fail with real speech missing (`'first session more words'`
      instead of `'…more words second session'`); restoring them makes it pass.
- [x] A regression test drives the duplication shape directly: feed `onresult` a second event
      whose `resultIndex` does not advance, and assert the accumulated transcript grows by
      zero. This must fail before the fix
      **Done 2026-09-09** — `src/tests/p1288-duplicate-final-results.test.ts`. Red before the
      fix with exactly the prod shape (`"hello worldhello world and goodbye"`), green after.
      4048 tests pass overall.

## Post-deploy verification — NOT acceptance criteria, and here is why

These cannot gate the merge: every one of them requires the fix to be running on a phone,
and the fix cannot reach a phone without being merged. Written as acceptance criteria they
formed a deadlock — the spec could not ship until it had been verified in a place it could
not reach until it shipped. They are moved rather than dropped, wording intact, and the
change is recorded here rather than made quietly, because rewriting criteria to get past a
gate is exactly the move that deserves suspicion.

**The fix is NOT confirmed until these pass.** A green unit suite proves the hook is
idempotent; it does not prove that idempotence is what production needed.

- [ ] The disproof in Root Cause is run on the physical phone: log `event.resultIndex` and
      `event.results.length` per `onresult` for one 30-second session, and record whether the
      index ever fails to advance. **This is the only thing that identifies the layer that
      re-delivers.** If it always advances, this fix is inert and the cause is elsewhere
- [ ] A 60-second session on a physical phone produces a row count consistent with what was
      actually said — measured as rows vs `count(distinct text)` on the room, which is how the
      defect was found. Before the fix that ratio was 1.80; it should now be ~1.0
- [ ] The founder can read the room back and recognise it as what they said

## Notes

- Room `RG7YQF` is live on prod with `ended_at` NULL and holds real founder speech. **Its
  content is deliberately not quoted here** (public repo) — every measurement above is a
  count, a length or a timestamp. Deleting it is the founder's call.
- If P1236 ships first, this path is deleted and the bug goes with it. That is not a reason
  to close this: P1236 needs two physical devices, a prod deploy and a spend cap before it
  can ship, and this is writing duplicate rows into prod today.


## Fix applied 2026-09-09 — idempotence per result index

`src/hooks/useSpeechToText.ts` now tracks `lastFinalIndexRef`: the highest `results` index
already appended to `transcript` **in the current session**. `onresult` skips any final
result at or below it. Three deliberate properties:

- **Keyed on index, never on text.** De-duplicating by content would eat real speech — people
  repeat themselves, and "yes" following "yes" is two utterances, not one. A test asserts this.
- **Reset in `onstart`.** A new session restarts its results list at index 0, so the marker
  must reset with it. Not resetting would make every result of a new session look
  already-consumed and silently discard everything after the first restart — a worse failure
  than the duplication being fixed. A test asserts this too, and it is the reason the fix is
  four lines rather than one.
- **Interim text still never enters `transcript`.** Asserted, so the change cannot quietly
  weaken DW-4.

**What this does NOT establish.** The fix makes the hook idempotent whichever layer
re-delivers a result. It does **not** prove Android is the layer that re-delivers — the
instrumented phone run in Root Cause above is still the thing that would show that, and it
has not been run. If the duplication survives this fix on a real phone, the cause is upstream
of the hook and this change is inert rather than wrong. Say so plainly rather than closing
the spec on a green unit suite: the prod symptom is the oracle, not the test file.

**Not addressed here, deliberately:** the "Reconnecting microphone…" copy appearing whenever
speech pauses. The founder confirmed it fires only after speaking stops, which is ordinary
recogniser behaviour announced as a fault. Cosmetic, separate, and merging it into this fix is
what produced P1236's overstated root cause.


## Post-ship correction, 2026-09-09 — the review landed after the merge

The code review arrived after `/ship` had already run (it had to be chased twice; the ship
proceeded on an inline review that had found the `onstart` drop). It found one MEDIUM that the
inline pass missed, and one honest overstatement in this spec.

**MEDIUM, fixed: the session-start reset ran BEFORE `start()`, not after.** `start()` throws
`InvalidStateError` when a session is already running — a case this hook's own catch block
documents as having happened on Android and iOS. On that throw no new session begins: the OLD
one is still running and its results list did **not** restart at 0. Zeroing the marker first
made every index that session had already consumed look new again and re-append it —
**resurrecting the exact duplication P1288 exists to remove**, for the rest of that session.
Triggered by double-tapping "Resume live text", or tapping it while the auto-restart timer has
already succeeded. Reproduced as a failing test (`'already said thisalready said this'`) before
the fix, green after; the reset now runs immediately after `start()` returns, which is still
safe against "onstart never fires" because `onresult` can only fire on a later tick.

Note the shape: the first fix closed the *drop* direction and opened a narrower *duplicate*
direction. Both times the danger was in the fix, not the bug.

**Overstatement, corrected: only 3 of the 7 tests here are load-bearing.** The reviewer traced
each against two baselines (pre-P1288, and the intermediate onstart-only commit). Tests 1, 2
and 5 discriminate — they fail against a real prior version. Tests 3, 4 and 6 pass identically
on every version of the hook **including no fix at all**; they are regression guards against a
plausible *bad* implementation, not evidence that this defect was closed. The commit message
for the second fix said "Proven both directions… Also asserts that every final result inside a
single `onresult` event is appended", which reads as if all of them validate the change. They
do not. **"4055 tests pass" is not evidence this commit closed the gap — test 5 is, and now the
`already started` test.** Recorded because citing a green suite as proof of a specific fix is
the failure this repo keeps writing entries about.
