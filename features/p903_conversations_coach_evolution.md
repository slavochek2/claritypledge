---
status: backlog
type: task
rank: 66
created_date: '2026-06-05'
tags: [skills, coaching, conversations-to, accountability]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P903: Coach Evolution for the conversations-to-* Skill Family

> Names the deferral recorded in P900 (routine reviews became pure monitor→actions; the coaching/accountability layer was removed there with the founder decision that it "returns properly designed in the conversations-to-* coach evolution").

## Problem

**Situation:** P900 stripped all interrogation from the routine review skills (`/day`, `/weekly`, `/monthly`) — they are now monitor→actions with zero founder input. The accountability function the old `/weekly` retro carried (avoidance check, commitments, hypothesis integrity) no longer exists anywhere.

**Complication:** The reason the retro failed wasn't that accountability is worthless — it's that being re-interrogated from zero by an agent that hadn't "read" the week produced nothing (P896). The transcript-mining skills (`/claude-conversations-to-pp`, `/slava:maintain:claude-conversations-to-cp`) already surface patterns from what the founder actually said across sessions — they are the natural home for a coaching layer, but today they only report patterns; they don't hold anything accountable.

**Question:** How should the conversations-to-* family evolve to carry the coaching/accountability function — grounded in transcript evidence the founder already articulated, not re-interrogation?

## Appetite

Low blast radius (two skill files; no product code, no DB). Fully reversible (`git revert`). **High decision density — deliberately unresolved.** This is a backlog skeleton: the design (what mechanic, what persistence, what cadence, how it avoids rebuilding P896's rejected patterns) is open until picked up.

## Approach

To be designed when picked up. Constraints already settled by P896/P900 history:

- Evidence-first: any coaching prompt must be grounded in something the founder already said in transcripts — never open-ended interrogation from zero.
- The routine skills (`/day`, `/weekly`, `/monthly`) stay pure monitor — this layer lives in the conversations-to-* family only.

## Risks / Non-Goals

### Risks
- **Rebuilding what P896 rejected** (answer-first drafting was still interrogation). MITIGATE: read P896's rejection rationale (`features/archive/p896_*.md`) and P900's Alternatives Considered before designing.

### Non-Goals
- Do NOT add any coaching or question mechanics back into `/day`, `/weekly`, or `/monthly` (P900 Non-Goal — permanent).
- Do NOT design the mechanic in this spec — it stays open until the work is picked up.

## Done-When

- [ ] Design decided and recorded in this spec (mechanic, persistence, cadence) before any implementation
- [ ] The conversations-to-* skills carry an accountability function grounded in transcript evidence
- [ ] Routine review skills remain untouched (pure monitor)
