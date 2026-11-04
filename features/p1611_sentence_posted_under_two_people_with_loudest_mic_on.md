---
status: week
type: bug
rank: 90
severity: medium
workstream: events
date_reported: '2026-11-04'
created_date: '2026-11-04'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [transcription, events, attribution]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1611: A sentence can post under two people with the loudest-mic rule on

## Summary

In an event round thread, one person's sentence also appeared under a tablemate, with the P1596 loudest-mic rule on; found by the P1608 live test.

## Root Cause

**Confirmed on two runs' saved audio.** Each mic's 30 s chunks were placed from upload times, and clamping every chunk to its own upload let upload jitter (up to about 3 s) move it against the other mics. With true spacing the right mic is loudest in every phrase second, so browser gain is not the main cause; that first hypothesis is withdrawn.

**Fix:** a chunk ended no later than its own upload, nor any later upload minus the audio between. Chunks sit end to end on that bound; only a lasting rise above 2.5 s opens a gap.

| Placement, replay of both runs | Phrase seconds to the right mic | Phrases with a wrong second, of 24 |
|---|---|---|
| Raw upload time | 80.4%, 88.2% | 7, 4 |
| Main before this fix | 96.1%, 94.1% | 2, 2 |
| This rule | 100%, 100% | 0, 0 |

## Reproduction Steps

1. On self-hosted TEST, with posting switched on, run `P1608_LIVE=1` through `npm run test:e2e:p1608` from the P1608 branch.
2. Three fake mics play turn-taking meeting speech, each with the others mixed in at about -12 dB.
3. Read the report in `test-results-p1608/`, or the round 1 thread.

**Reproduction rate:** intermittent. 1 stray phrase across 2 runs and 36 round 1 phrases. The first run had none. Both runs used P1604's unmerged worker and schema, so main is not confirmed affected.

## Expected Behavior

Each sentence appears once, under the person who said it.

## Actual Behavior

The sentence "shapes for the for remote control that we then use", said by C, was posted under both C and B. In the same few seconds B's words "they're all pretty" and "power buttons are mostly" appeared under C.

## Affected Files

Suspected area, not confirmed: `services/transcribe-room-batch/round_clean.py` (`loudest_masks`, `refine_offsets`).

## Severity

**Medium** — a wrong name in a small share of sentences; with the rule off, 17 of 18 phrases doubled, so the rule works in the main. It matters because transcripts feed canvases and who-said-what.

## Fix Approach

Run the disproof above first. P1596's benchmark measured 1.9% wrong or doubled and the founder accepted the loss of overlapping short replies; this stray was a non-overlapping phrase chosen with no other speaker within 2 s on the clip timeline. If the cause is browser processing, weigh it against real-device behaviour before changing capture settings.

## Acceptance Criteria

- [x] The cause is recorded here, with the measurement that shows it. (Root Cause above; replay on both rooms' audio.)
- [x] Across repeated P1608 runs, no expected phrase appears under a second person, or the founder sets an accepted rate on the measured evidence. 3 of 3 completed runs, 54 phrases; `[post-deploy]` real phones in the friends test.

## Not proven

- The replay uses fake mics started together with chunks uploaded over a wired link. Real-phone upload gaps (mobile networks, backgrounded tabs, pauses) are not proven by it; the pause, restart, missing-number and flush paths are covered by unit tests with jittered uploads only.
- The live worker has not been redeployed with this change; the second criterion (repeated P1608 runs show no doubled phrase) stays open until it is and the runs are repeated.
- A chunk uploaded much earlier than the median (a faster-than-typical upload) now ends after its object time by that difference, a few seconds at most inside a stretch (larger gaps break the stretch). Accepted: the median anchor trades that for no per-chunk jitter.

## Related

- P1596 (the rule and benchmark), P1608 (the test and both runs' evidence)

## Review correction, 2026-11-04

The first fix (run median, no clamp) was rejected: Argon and Codex independently showed a pause under 5 s moved earlier chunks to after their own uploads. Replaced by a causal bound: a chunk ended no later than its own upload, nor any later upload minus the audio between. Chunks stay end to end on that bound; only a lasting rise above 2.5 s opens a gap (`UPLOAD_JITTER_MS`, from the about 2 s seen on a wired link, not measured on phones). A pause under 2.5 s is merged, so the audio after it can sit up to 2.5 s early. Replay of both rooms through the real `chunk_pieces`: 100% of phrase seconds, 0 of 24 wrong.

Second review (Argon, Codex), each example run against old and new code: a lasting upload slowdown over 5 s and an outage flush at the end of a recording are placed the same as before, so they are older limits and stay open. A dropped partial chunk was made worse by this fix and is now corrected, with a test. **Accepted:** a 2.5 to 5 s pause before the very last chunk is merged (4 s early where the old code was 2 s early), because one slow final upload looks identical and nothing later can tell them apart.

## Live result, 2026-11-05 (fix on the test worker, P1604 shipped)

3 of 3 completed P1608 runs passed with no stray: 54 round 1 phrases, each only under its speaker. A fourth run stopped on a network error reaching the server (`EHOSTUNREACH`, VPN interface active), so it says nothing about the fix. Jobs were posted to the worker directly; normal dispatch is still not exercised. Three clean runs fall short of a rate: the earlier stray was 1 in 36.

## Known limits of this rule (final reviews: Opus, Codex, Argon)

- A 2.5 to 5 s lasting upload rise at the end of a stretch looks like a pause and opens a false gap of that size. Upload times alone cannot separate them. Opus simulation with assumed uniform delays: at 0 to 3.4 s, mean spread 0.07 s against main's 1.28 s; at 0 to 6 s, 0.84 s against 2.26 s, but 12% of runs worse than main.
- Between missing chunks each run takes its own anchor, so a lossy phone falls back towards per-upload placement.
- One overestimated chunk duration pulls earlier chunks back, because the bound is a minimum. Unmeasured on iOS chunks.
- A pause under 2.5 s is merged, so later audio sits early by up to its length.

The 2.5 s value and all of these need real phone upload traces, which is the friends test.
