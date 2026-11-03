---
status: week
type: story
rank: 85
workstream: transcription
created_date: '2026-11-03'
tags: [transcription, speakers, attribution]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1601: One phone, several speakers

## Problem

**Situation:** Transcription assumes one mic is one person: the speaker's name comes from the device that recorded. That holds when everyone has their own phone.

**Complication:** A person will often record a conversation on one phone, with partners who are not logged in. All the words then land under that one person's name, which is wrong rather than merely incomplete.

**Question:** How should a shared recording appear, and can speakers be told apart reliably enough to show that?

> Founder, 2026-11-03: "I can imagine sometimes transcribing somebody with two people or one person one another person but only from my phone in which case they're not logged in."

## Appetite

Blast radius: one flow, the text a shared recording produces. Reversibility: high while labels are only display. Decision density: a few, below.

## Solution

Two steps, in this order.

1. **Say what is true.** Text from a recording that may hold several voices reads as "recorded by {name}", not as that person's own words. [FOUNDER DECISION: the exact wording, and whether the person says "others are with me" when starting or the label always applies to a one-mic session.]
2. **Then try splitting speakers,** as "Speaker 2" and so on, never as a guessed real name, and only if the benchmark below passes. [FOUNDER DECISION: whether the person can rename a speaker afterwards.]

## Benchmark before step 2

Prior measurements are against an easy assumption here. P1237 measured Gemini deciding who spoke at 73.7% overall and 0 of 10 on the minority speaker, the same as always answering "the dominant speaker" (decisions.md, the entry splitting live and batch engines). P1358 found a diarized window that merged two speakers onto one label. Those runs used earlier models or other audio, so they do not settle this, and they do not permit assuming it works.

## Decision Criteria

1. **Ship speaker splitting?** Yes only if, on one-phone recordings of 2 and 3 real people in a room and a cafe, hand-labelled from the raw audio, the minority speaker's sentences are credited correctly at least 80% of the time and no recording merges two people onto one label for a whole stretch. [FOUNDER DECISION: confirm the 80% bar.] Below that, step 1 stays the product.
2. **Which tool?** Compare Gemini's current transcribe model with a dedicated speaker tool on the same recordings. Prefer the one that needs no always-on GPU if both pass.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A confident wrong speaker misquotes someone | MITIGATE | Anonymous labels only, and the benchmark bar |
| People not logged in are recorded without having tapped consent | MITIGATE | Founder and legal wording before step 2; the person recording states they asked. [FOUNDER DECISION: what the starter must confirm] |
| Long audio is silently cut short when diarization is off (recorded in decisions.md) | ACCEPT | The cleaning path already sends short pieces |

**Non-Goals**
- Do NOT cover the mixed case, where some share a phone and others have their own mics.
- Do NOT create accounts or chat members for anonymous speakers.
- Do NOT identify speakers by voice profile.

## Cost Budget

Step 1 adds no service calls. Step 2 adds a speaker pass per recording. The numbers depend on the tool the benchmark picks and are filled in before step 2 starts; unknown today.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | unknown until the tool is picked | unknown | 0 (no e2e calls a paid model) |

## Acceptance Criteria

- [ ] A one-mic session in a chat reads as "recorded by {name}" in the agreed wording, not as that person's own words.
- [ ] The benchmark result, with its recordings' labels checked against raw audio, is recorded in this spec, and it decides whether step 2 is built.
- [ ] If step 2 is built: speakers appear as anonymous labels, and a session with one voice shows no extra speaker.

## Open Questions

1. Does this depend on transcription belonging to a chat (the channel work under discussion)? Step 1 is simplest after that; it can also apply to today's event rooms.

## Related

- [P1596](done/2026-06-10/p1596_event_transcripts_one_speaker_per_sentence.md) and [P1592](done/2026-06-10/p1592_event_transcripts_land_in_round_threads.md): one mic per person, cleaned and posted to chat.
- [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md): the attribution measurement.
- [P1375](p1375_video_summary_named_speaker_attribution.md): named speakers in video summaries.
