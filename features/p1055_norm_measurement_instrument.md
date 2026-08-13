---
status: week
type: task
rank: 1000973.0
created_date: '2026-08-12'
tags: [measurement, norms, events, instrument]
delivery_stage: create-spec
pipeline_ran: [create-spec, create-spec.2]
driver: heuristic
---

# P1055: CMP Position Instrument for Events

> **Rewritten 2026-08-13.** The original spec asked whether gap-admission is a *descriptive* or a *social* norm, via a 4-item binary battery adapted from the UNICEF toolkit, plus a staged dense passage and an in-room tally. **That question is retired** and the method with it — see "What changed" below. Reasoning trail: `docs/decisions.md` 2026-08-13.

## Problem

**Situation:** The event's job is to make a room want the Clarity Meeting Principle. Nothing currently shows that the principle changes anything, and nothing produces evidence a buyer or a reader can see.

**Complication:** The original instrument aimed at a research question — is this norm descriptive or social — whose answer arrives after 6–10 events, needs 40–60 respondents, and does not change what gets built. Meanwhile the product already contains the right mechanism and it was not being used.

**Question:** Does operating under the Clarity Meeting Principle change what people expect about how they are seen — and can that be shown, publicly, from one event?

### What changed, and why (do not re-litigate)

| | |
|---|---|
| **The reveal's job** | It **sells**; the protocol changes behaviour. Once separated, the descriptive-vs-social question stopped being load-bearing. Founder observation: granting permission 1:1 does not change behaviour, and the literature supports *misperception exists*, not *correcting it changes conduct* |
| **Status vs social norm** | The distinction that survives is **"ought" vs "inference"**. A competence inference is not a normative expectation, and it implies a different intervention: change the inference, not the approval |
| **The dense passage** | **Cut.** Staging confusion signals "you are being tested," which contaminates the behaviour more than the denominator problem it solved. A real 90-minute argument supplies its own confusion |
| **Survey → Points** | A Point is by our own model *"something you take a position on."* These items are Points. `point_position_history` already records movement, so before/after is free |

## Appetite

**Blast radius: low.** Three rows in `points`, staked by attendees. No new tables, no new UI required for the minimum.
**Reversibility: high.** Points can be retired; positions are the attendees' own.
**Decision density: low.** Wording below is settled; the tag scheme is the only open mechanical choice.

## Approach

Three Points, created before event #1, tagged, staked by every attendee **before** the session and **again** after. The aggregate is revealed in the room. `point_position_history` supplies the delta.

### The three Points (−3 … +3, strongly disagree … strongly agree)

| | Statement | Reads as |
|---|---|---|
| **P1** | "If I opt into the Clarity Meeting Principle, the people I work with will trust my judgment **less**." | The personal cost I expect |
| **P2** | "In an important conversation, I'd rather have someone who opts into the Clarity Meeting Principle across the table." | What I actually value in others |
| **P3** | "Someone who opts **out** of the Clarity Meeting Principle loses nothing in my eyes." | Whether opting out is free |

**The finding is the gap between P1 and P2** — I expect a penalty for myself, and I prefer it in everyone else. That is the reveal, and it is about the principle rather than about a generic act.

**P3 is the norm-formation test.** If opting out is free, no norm can form regardless of what P1 and P2 say.

**Valence is deliberately mixed** — P1 and P3 agree in the direction *against* the principle, P2 *for* it. Someone who simply agrees with everything shows up as incoherent rather than as the finding.

### Tags

- **Topic tag** — groups the CMP set, shared with [p1062](p1062_cmp_position_battery.md) so both render in one filtered feed
- **System tag** for ordering (`system_tags`, P630) — the reveal depends on presentation order, and default sort does not guarantee it

### Sequence in the room

1. Everyone stakes P1–P3. **Nobody sees the aggregate yet** — publicity is the cure, so it cannot also be the instrument.
2. Session runs.
3. Everyone re-stakes.
4. Reveal the aggregate and the movement.

## Risks / Non-Goals

### Risks

- **MITIGATE — Demand characteristics.** Attendees who just spent 90 minutes with you report what you want. No control arm exists and nothing removes this. Mitigation: report it as an in-room demonstration, never as evidence of durable change. The mixed valence and the P1/P2 gap are harder to fake than a level.
- **MITIGATE — Positions visible while people are still staking.** Destroys the reveal and anchors late responders. Mitigation: the sequence above is an acceptance criterion, not a suggestion.
- **ACCEPT — n≈6–8.** Every number from event #1 is illustrative. Say so when showing it.
- **MITIGATE — Attendees cannot stake without an account.** `event_rsvps` already requires auth (*"Authenticated users can RSVP"*), so registrants have accounts. Mitigation: verify the stake flow end-to-end **before** event #1 — an auth stall live in front of the room is the failure that matters, not the schema.

### Non-Goals

- **Do NOT compare opt-ins to opt-outs as groups.** Self-selection. Within-person before/after only.
- **Do NOT run the 9-dimension battery at the event.** It has no variance after a demo and no asymmetry to reveal — see [p1062](p1062_cmp_position_battery.md).
- **Do NOT revive the descriptive-vs-social question**, the 4 binary items, or the dense passage.
- **Do NOT claim durable behaviour change** from before/after with no control.
- **Do NOT build the position-movement visualisation here** — [p1061](p1061_point_position_movement_analytics.md).

### Deferred by founder decision 2026-08-13

The pre-registered prediction at `hypotheses.md` H-LegibilityVsCost (*"correcting a belief about others' behavior moves adoption more than showing them their own gap — reads off event #1"*) needed a prediction item plus an in-room admission count. **Deferred: out of proportion to available resources.** Recorded rather than dropped silently — the commercial-relevance filter this implies is noted on [p1029](p1029_hypothesis_inventory_audit_trim.md).

## Done-When

- [ ] Three Points exist with the statements above, verbatim, carrying the topic tag and an ordering system tag
- [ ] A filtered feed shows the three in the intended order
- [ ] Every attendee has a pre-session position on all three, staked before any aggregate is visible
- [ ] Post-session positions exist for the same attendees, and `point_position_history` shows the moves
- [ ] The room saw the P1/P2 gap and the movement
- [ ] The stake flow was walked end-to-end by a non-founder account before event #1

## Deliverable

Three tagged Points, one filtered feed view, and one before/after aggregate per event. No app work, no dashboard, no form tool.

## References

**Split:** [p1056](p1056_install_norm_battery_and_safety_scale.md) — the install tier, backlogged. Must share wording with whatever survives here or neither dataset pools.
**Spin-offs:** [p1060](p1060_link_events_to_organizations.md) · [p1061](p1061_point_position_movement_analytics.md) · [p1062](p1062_cmp_position_battery.md).
**Model:** [story-point-model.md](../docs/story-point-model.md) — a Point is something you take a position on.
**Adjacent:** [p851](p851_minimum_clarity_letter_field_experiment.md).
**Still open, deliberately unresolved:** `docs/facilitator-guide.md` §Workshop Metrics carries three 0–10 items at OPEN and CLOSE, written for the superseded workshop format. Left in place 2026-08-13 (founder) as outdated-but-harmless. Do not run both.
