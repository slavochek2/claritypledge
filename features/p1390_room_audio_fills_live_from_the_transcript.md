---
status: backlog
type: story
rank: 310
workstream: events
created_date: '2026-10-02'
tags:
  - transcribe
  - live
  - research
  - stories
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: heuristic
related:
  - p1337
  - p1388
  - p1061
---

# P1390: What the room says out loud fills in /live — numbers and turns during the evening, stories and positions after it

## Problem

> Founder framing, verbatim: *"the numbers indeed exist out loud but we have transcribed and so later
> we can build the processing that kind of files the numbers if they were clearly spoken, files the
> stories and as graphs, and you know to approve … well, that is part of our research program, right?
> Once we have the data we can do that."*

> And on the live half, verbatim: *"if there were numbers, we can show, for example, a screen similar
> to what we have in /live. How far they went … they just talk, talk, talk, and once they give a
> number, then it gets updated, and it's pretty cool … this is very close to being in /live, because
> /live, so far, we light on the slider, and this thing, and round turns, and so on — all of that can
> be now automated."*

**Situation:** `/live` already models the thing a Clarity Night does by hand: per-person understanding
sliders, `liveState.currentRound`, `sessionHistory`, an idempotent round write behind a DB unique
constraint, and realtime two-party sync (`clarity-live-page.tsx`). At an event, the same protocol runs
**out loud** — someone says "I'd say a six" — and nothing records it. The transcript holds it; nothing
reads it.

**Complication:** This is the research programme's evidence, not a convenience. Whether understanding
moves, and whether positions move with it, is the thing the events exist to find out, and it currently
survives only as audio nobody has processed.

**Question:** What can be derived from a room's transcript, and which half of it is safe to do while
fifteen people are in the room?

## Appetite

Blast radius: the live half is in front of a room with no retry; the post-processing half has
unlimited retries. Reversibility: high for post-processing, low for anything that renders live.
Decision density: low for stage 1, high for stage 2.

## Approach — two stages, deliberately separated

### Stage 1 — post-processing (build first)

Runs after the evening, over a finished transcript. Unlimited retries, no room watching.

- **Spoken numbers → understanding ratings.** "I'd say a six" against a known speaker, round and table.
- **Turn and role detection.** Who was speaking, who was listening — the S/L badge is the physical
  twin of this, and the transcript usually makes it explicit.
- **Draft stories, filed for approval.** Never published automatically.
- **Predicted position changes**, offered back to the person: *"is it right that your position moved
  on this? here is your round, here is what you said."*

Everything is a **draft with a human confirmation**, in line with how the disagreement pipeline
already treats generated text.

### Stage 2 — live (only after stage 1 works)

The same derivations, rendered during the evening into a `/live`-shaped screen: the sliders fill as
numbers are spoken, the round turns as roles change. The appeal is real — the room sees its own
protocol working — and so is the failure mode: a wrong number on a screen in front of the people who
said it, with no way to retry the evening.

**The ordering is the spec's main claim.** Stage 1 is the oracle stage 2 would otherwise lack: without
a measured accuracy rate on finished transcripts, a live render is a confident guess in front of an
audience.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Attribution is wrong — the number is credited to the wrong person | MITIGATE | Grouping metadata from P1337 (round, table, members, roles) is the join key; never infer membership from the audio alone |
| Transcript quality is too low for any of this | DEFER | Blocked on the level meter and lavalier capture actually producing clean audio (P1388) |
| Drafted stories are published without a human reading them | MITIGATE | Draft-plus-confirmation, as the disagreement pipeline already enforces |
| Live rendering shows a wrong number to the room | DEFER | Stage 2 is gated on a measured accuracy rate from stage 1 |
| People perform for the screen once they know it is listening | ACCEPT | Worth watching; it is also the thing that makes the protocol visible |

**Non-Goals**
- Do NOT build stage 2 before stage 1 has a measured accuracy rate.
- Do NOT publish any derived story without the person confirming it.
- Do NOT treat a transcript as evidence about an individual claim where speaker attribution is
  uncertain — it is evidence about a table (P1337's data contract).
- Do NOT change `/live`'s own two-party flow; this reuses its shape, it does not replace it.

## Decision Criteria

1. **Is spoken-number extraction good enough to use?** → Usable if, over one event's transcripts,
   numbers are extracted with the correct speaker and round at a rate the founder accepts after seeing
   the errors. Below that, the numbers stay a manual read.
2. **Does stage 2 go live?** → Only once stage 1's rate is measured on at least two events and the
   failure modes are ones that degrade quietly rather than displaying something false.

## Done-When

- [ ] A finished event transcript yields spoken numbers attributed to person, round and table, with an error list a human can read
- [ ] Draft stories are produced and sit awaiting confirmation; none is published automatically
- [ ] Predicted position changes are offered back to the person with the round and the quote that prompted them
- [ ] An accuracy rate is measured and recorded, with the errors enumerated rather than summarised
- [ ] Stage 2 remains unbuilt until that rate exists

## Open Questions

1. Is diarization needed at all, or does per-person capture (one `clarity_sessions` row per participant) already give attribution for free? UNVERIFIED for a table where only some people record.
2. What happens to a table where nobody recorded — is partial coverage worse than none for the research claim?
3. Does the room need to know this processing happens, beyond the recording consent already given?

## Related

- [p1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md) — supplies round, table, role and membership, which is the join key for everything here
- [p1388](p1388_transcribe_consent_controls.md) — the capture quality this depends on
- [p1061](p1061_point_position_movement_analytics.md) — position movement, measured rather than derived
