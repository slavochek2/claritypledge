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

**Cause (measured 2026-11-04, replay on the audio of the two P1608 runs, rooms LQVVB9 and ZEN5KK; 3 mics each, 7 chunks of 30.0 s per mic).** The browser-gain hypothesis was not needed. Chunks are contiguous audio, but consecutive upload gaps wander (27.9 to 31.3 s). Placing each chunk by its own upload time leaves chunks 1 to 2 s off against the other mics, and one per-mic offset (`refine_offsets`) cannot fix a displacement that differs chunk by chunk; the loudest-mic rule then hands some seconds to the wrong mic. The worker at HEAD already used a median anchor per stretch, but clamped every chunk to its own object time, which reintroduced the jitter for every chunk uploaded earlier than the median (the clamp is the remaining cause).

**Evidence** (replay of the real loudness masks against the corpus's human phrase timing, 24 phrases per room):

| Placement | Room LQVVB9 | Room ZEN5KK |
|---|---|---|
| Raw upload time per chunk (what the worker did before P1596's median anchor) | 80.4% of phrase seconds on the right mic, 7 of 24 phrases with a wrong inner second | 88.2%, 4 of 24 |
| Chunks end to end from a median anchor (orchestrator's simple replay) | 100%, 0 of 24 | 100%, 0 of 24 |
| `audio.chunk_pieces` at HEAD (median anchor, clamped to own upload time) | 96.1%, 2 of 24 | 94.1%, 2 of 24 |
| `audio.chunk_pieces` after this fix | 100%, 0 of 24 | 100%, 0 of 24 |

**Fix.** In `audio.chunk_end_times`, a chunk whose duration was measured sits at `base + cumulative measured duration`, where `base` is the median of (object time minus cumulative duration) over its stretch. It is no longer clamped to its own upload time. A chunk of unknown duration is still held to its upload time. Stretch breaking (pause, missing number, restart, flush) is the existing logic, untouched, so a real gap starts a new stretch with its own anchor. `refine_offsets` is kept.

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
- [ ] Across repeated P1608 runs, no expected phrase appears under a second person, or the founder sets an accepted rate on the measured evidence.

## Not proven

- The replay uses fake mics started together with chunks uploaded over a wired link. Real-phone upload gaps (mobile networks, backgrounded tabs, pauses) are not proven by it; the pause, restart, missing-number and flush paths are covered by unit tests with jittered uploads only.
- The live worker has not been redeployed with this change; the second criterion (repeated P1608 runs show no doubled phrase) stays open until it is and the runs are repeated.
- A chunk uploaded much earlier than the median (a faster-than-typical upload) now ends after its object time by that difference, a few seconds at most inside a stretch (larger gaps break the stretch). Accepted: the median anchor trades that for no per-chunk jitter.

## Related

- P1596 (the rule and benchmark), P1608 (the test and both runs' evidence)
