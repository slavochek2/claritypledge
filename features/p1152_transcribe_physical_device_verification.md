---
status: week
type: task
rank: 66
workstream: events
created_date: '2026-08-23'
tags: [transcribe, verification, devices, gate]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
drafted_by: opus
---

# P1152: `/transcribe` — the physical verification a loop cannot do

## Problem

**Situation:** [P1149](p1149_live_room_transcription_chat.md) specifies the `/transcribe` room.
Its `/goalify` triage on 2026-08-23 classified 12 done-when lines and refused to emit a
contract: 4 of 12 (33%) were HUMAN-ONLY, over the 25% ceiling.

**Complication:** Those four are not taste, and no amount of test-writing converts them.
Browser speech recognition cannot be driven by Playwright. A phone radio cannot be toggled by a
script. GPU queue contention needs real concurrent jobs. Each requires a person with hardware.

**Question:** How do the physical checks get run and recorded, without either blocking the
loopable 8/12 or being quietly dropped?

## Appetite

Zero blast radius — this spec builds nothing. Fully reversible. Zero decision density: the
checks are already written, this spec only relocates and schedules them.

## Approach

Hold the four physical checks here so P1149's contract can be machine-decidable, and run them
as a founder session against P1149's committed branch **before it merges to main**.

**This is a relocation, not a downgrade.** P1149 still cannot ship without these passing —
see Sequencing.

## The four checks

### PV-1 — Gate 0: does live text survive on phones?

On one physical Android phone and one physical iPhone, with the `onend` auto-restart in place:
speak for 10 continuous minutes with natural pauses. Record whether live text survives.

Paste the observed output. Record the outcome as **pass / partial / fail** into P1149.

- **Pass** → the room is a phones surface as designed.
- **Partial** (survives, drops words at restart boundaries) → ship, record the loss as a known
  limitation; the corrected transcript is the accurate record regardless.
- **Fail** → **stop and re-decide with the founder.** The room becomes laptops-open, or the
  live half moves server-side. A product decision, not a bug.

### PV-2 — Two devices, two people, one room

Two people on two real devices in one room. Each sees the other's words appear live, attributed
and timestamped. Confirms Realtime delivery under real speech, which no fixture reproduces.

### PV-3 — Recognition drop and recovery

Mid-session, toggle airplane mode. The listening indicator must visibly change to the dropped
state, and recover when the radio returns. Audio upload must continue throughout.

This is the check that proves the fix for the verified `onend` defect actually fires — the one
failure mode most likely to waste a real event.

### PV-4 — Eight simultaneous participants

Eight streams at once. All eight transcription jobs complete. Confirms Cloud Tasks holds jobs
6-8 against the 5-GPU quota rather than dropping them — asserted from the infrastructure doc,
never observed.

Best run at a real event rather than staged, since that is the condition it exists to cover.

## Risks / Non-Goals

### Risks

- **The checks get skipped because the loop went green.** The whole hazard of carving them out.
  Mitigation: P1149's merge is gated on this spec closing — stated in Sequencing, and the
  reason this spec is `type: task` with a rank beside P1149 rather than in backlog.
- **PV-4 waits indefinitely for a real event.** Mitigation: it may be staged with eight browser
  tabs on separate accounts if no event is near; record which was used, because a staged run is
  weaker evidence about real-world concurrency and should say so.

### Non-Goals

- Do NOT build anything. This spec runs checks against P1149's branch.
- Do NOT convert these into automated tests — the attempt is what produces a fixture that
  passes while the real surface is broken.
- Do NOT merge P1149 to main before PV-1 has an outcome recorded.

## Done-When

- [ ] PV-1 run on a physical Android and a physical iPhone, output pasted, outcome (pass /
      partial / fail) written into P1149
- [ ] PV-2 run with two people on two devices, result recorded
- [ ] PV-3 run with a real radio toggle, dropped state and recovery both observed
- [ ] PV-4 run, all eight jobs completed, and whether it was staged or a real event recorded
- [ ] Any failure produces a decision recorded in P1149, not a silent retry

## Sequencing

1. P1149's loop runs and closes its 8 machine-decidable rows on a branch.
2. **This spec runs against that branch.**
3. Only then does P1149 merge.

P1149 is not shippable on a green gate alone. The gate covers what a command can decide; this
spec covers what only a person with hardware can.

## References

- [P1149](p1149_live_room_transcription_chat.md) — the feature these checks verify
- [visual-qa.md](../.claude/rules/visual-qa.md) — the multi-viewport rule these extend to
  physical hardware
