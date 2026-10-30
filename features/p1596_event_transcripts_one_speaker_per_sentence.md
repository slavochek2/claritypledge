---
status: week
type: story
rank: 85
workstream: events
created_date: '2026-10-30'
tags: [transcription, events, attribution, chat]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
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
3. **"Open" goes to the conversation.** The event's transcription entry opens the viewer's current
   round-table thread, or the event channel when not seated. The global recording bar keeps recording,
   so nothing is lost by leaving the room page.

A copy already posted when the louder one arrives: whether to retract it live or let it stand until the
end-of-room cleanup is the implementing agent's call, argued in the build; it must never leave both.

Research before building (time-boxed, cite sources): how multi-mic bleed is removed in auto-mixers,
podcast tools and meeting transcription, and what Gemini's audio docs say about isolating the near
speaker.

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

- [ ] With two people at one table, each on their own mic, a sentence one of them says appears once,
      under that person, in the table's thread.
- [ ] With three mics at one table, the same holds.
- [ ] A short echo ("yes, exactly") said by both people is kept under both.
- [ ] "Open" for an event's transcription lands on my current table's thread, or the event channel
      when I'm not seated, and my recording keeps going.

## Done-When

- [ ] Research notes with sources recorded in this spec.
- [ ] Duplicate count from a real two-person lavalier test recorded here, before and after.

## Related

- P1592 (event transcripts land in round threads): this overrides its duplicate ACCEPT.
- P1252 (merged multi-phone audio is never time-aligned): alignment and the crosstalk scan.
- decisions.md 2026-09-16 [product]: pair consent and neighbour bleed.
