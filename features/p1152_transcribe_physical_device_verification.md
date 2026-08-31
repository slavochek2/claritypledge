---
status: in-progress
type: task
rank: 66
workstream: events
created_date: '2026-08-23'
tags: [transcribe, verification, devices, gate]
pipeline_ran: [create-spec]
driver: heuristic
drafted_by: opus
---

# P1152: `/transcribe` — the physical verification a loop cannot do

**Reopened 2026-08-31, twice.** `/ship p1196` auto-closed this spec a second time as a
co-located spec on the same branch — the mechanism does not know that a spec holding physical
checks is not finished when the code beside it is. That is the same closure-without-outcome
this spec exists to prevent, arriving this time from a tool rather than a person. Reopened by
hand immediately after the ship; the four physical checks are still unrun and PV-1's recorded
outcome is still **fail**.

**Reopened 2026-08-31.** This spec was closed `all-done` on 2026-08-24 with all five
Done-When boxes unchecked — the physical checks were never run and never recorded. Its own
Risks section named exactly that: *"The checks get skipped because the loop went green. The
whole hazard of carving them out."* PV-1 has now been run and **failed**: no words appear on
mobile. The outcome is recorded in
[P1149](done/2026-06-10/p1149_live_room_transcription_chat.md), and the one confirmed cause is
fixed under [P1196](done/2026-06-10/p1196_transcribe_live_text_dies_on_mobile.md). This spec stays open until
PV-1 is re-run post-fix and PV-2 through PV-4 have recorded outcomes.

**Status note (2026-08-24, founder decision):** P1149 shipped to prod ahead of this spec closing.
The founder will run the physical checks below on real devices directly against prod and record
the outcome here. If PV-1 through PV-4 pass, close this spec normally. If any fail, the founder
decides then whether to fix forward or revert — not a silent retry. Blocked, not rejected: the
checks below still need to happen, just not as a merge gate.

## Problem

**Situation:** [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) specifies the `/transcribe` room.
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
- ~~Do NOT merge P1149 to main before PV-1 has an outcome recorded.~~ Superseded 2026-08-24 —
  see the Status note at the top of this spec: the founder shipped P1149 ahead of this gate
  and will run PV-1 through PV-4 against prod directly instead.

## Done-When

- [x] PV-1 run (2026-08-31) — outcome **fail**, written into P1149. Re-run required after
      the P1196 fix, and PV-1b (mic contention) still to be settled from a phone console.
- [ ] PV-2 run with two people on two devices, result recorded
- [ ] PV-3 run with a real radio toggle, dropped state and recovery both observed
- [ ] PV-4 run, all eight jobs completed, and whether it was staged or a real event recorded
- [ ] Any failure produces a decision recorded in P1149, not a silent retry

## Sequencing

**Superseded 2026-08-24 (see Status note above).** The original plan:

1. P1149's loop runs and closes its 8 machine-decidable rows on a branch.
2. **This spec runs against that branch.**
3. Only then does P1149 merge.

The founder chose to ship P1149 first instead, running PV-1 through PV-4 against prod
directly rather than as a pre-merge gate. The underlying point still holds — P1149 was not
shippable on a green gate alone, the gate covers what a command can decide and this spec
covers what only a person with hardware can — the founder is now that check, post-ship
rather than pre-merge.

## References

- [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) — the feature these checks verify
- [visual-qa.md](../.claude/rules/visual-qa.md) — the multi-viewport rule these extend to
  physical hardware
