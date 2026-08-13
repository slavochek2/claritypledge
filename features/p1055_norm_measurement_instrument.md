---
status: week
type: story
rank: 1000973.0
created_date: '2026-08-12'
tags: [cmp, points, events, commercial]
delivery_stage: create-spec
pipeline_ran: [create-spec, create-spec.2, create-spec.3]
driver: heuristic
---

# P1055: The CMP Point Set — the event's opt-in, argument and offer

> **Merged and rewritten 2026-08-13.** Absorbs P1062 (the dimension battery), which was split out earlier the same day and is now archived — they were always one artifact. The original spec (a 4-item norm battery answering "descriptive or social norm", plus a staged dense passage and an in-room tally) is retired. Reasoning: [decisions.md](../docs/decisions.md) 2026-08-13.

## Intention

**Read this first. Every decision below is subordinate to it, and anything that does not serve it is slop.**

> **Make each attendee discover that they value the Clarity Meeting Principle in others more than they believe others value it in them — and have that discovery land across the areas they already care about — so that the closing offer of a 1:1 conversation about integrating it is a small step rather than a leap.**

This is a **demand-creation device, not a survey.** Two consequences that agents get wrong in both directions:

- **We optimise for the intention, not for measurement purity.** Walking people through nine consequences before asking the overall question *primes* the overall answer. That is persuasion, and it is the point. **Founder decision 2026-08-13: this trade is accepted deliberately.**
- **Therefore the numbers are not evidence.** They record what a primed room concluded. Publishing them as a finding about the world is the one thing that turns a legitimate device into a false claim. Say "this is what the room concluded" — never "this is what is true."

## Problem

**Situation:** The event's job is one sale. The room needs to move from "interesting idea" to "I want to talk about putting this in my organization," inside 90 minutes.

**Complication:** Nothing currently carries them across that gap. The principle is asserted in the founder's voice, on the founder's site, and the room has no way to discover for itself that it already holds the position the offer depends on.

**Question:** What does the room *do* — not watch — that produces that discovery, and leaves a public artifact behind?

## Appetite

**Blast radius: low.** Twelve rows in `points`, staked by attendees. No new tables.
**Reversibility: high for the protocol; near-zero for the wording** — a Point whose statement changes invalidates every position already staked on it. This is the one irreversible decision in the spec.
**Decision density: high, and concentrated in one place** — the twelve statements. Everything else is settled below.

## Approach

### The flow (this is the spec; everything else supports it)

1. **Opt in or out** of the Clarity Meeting Principle.
2. **Stake the triad — naive.** Before any discussion of consequences.
3. **Stake the nine dimensions.** This is where they build the model.
4. **Argue.** They convince each other.
5. **Re-stake everything.**
6. **Reveal:** the naive asymmetry, and the movement.
7. **The offer:** a 1:1 about integrating this in their organization.

### Why the triad comes first — load-bearing, do not reorder

The reveal depends on **P1 being low**. If the nine dimensions run first, the room has just concluded the principle is valuable, so P1 is answered **high** and the gap disappears. **Priming closes the very gap the reveal exists to open.**

The pedagogical value of the nine is not lost by putting them second — it lands in the **re-stake**, which is where the better-formed, more strongly-held position gets recorded. First stake = the reveal material. Second stake = the position they carry into the offer.

### The triad

| | Statement |
|---|---|
| **P1** | "In an important conversation, I expect the other person to prefer that **I** opt into the Clarity Meeting Principle." |
| **P2** | "In an important conversation, I prefer that **the other person** opts into the Clarity Meeting Principle." |
| **P3** | "In an important conversation, someone who opts out of the Clarity Meeting Principle loses nothing in my eyes." |

**P1 and P2 share one predicate** — *"prefer that … opts into"* — from two sides. Predicate matching is what makes the gap between them meaningful rather than an artifact of different wording.

**The reveal:** P2 high, P1 low ⟹ everyone wants it from their partner, and nobody thinks their partner wants it from them.

**P3 is the norm-formation test.** If opting out is consistently free, no norm can form regardless of P1 and P2.

### The nine dimensions

Statements **not yet written** — see Open Items. The areas, founder 2026-08-13:

status · trust · errors and rework · **psychological safety** · learning and knowledge exchange · collective problem-solving · relationship quality · interpersonal conflict · ideological polarization

**Psychological safety is not just another row.** It is the outcome variable in `hypotheses.md` H-NormRaisesSafety and has a validated instrument (Edmondson) scoped in [p1056](p1056_install_norm_battery_and_safety_scale.md). A one-line Point about it is a positioning statement and **must never be reported as a measurement of psychological safety.**

### Tags and ordering — decided

**Two tags, because the triad and the dimensions are presented as two separate views.** That is what makes step 2 and step 3 separable, and the sequencing above is load-bearing, so this is not cosmetic.

- A **parent CMP tag** on all twelve — one filtered feed shows the whole map, and it is the shareable artifact
- A **phase tag** distinguishing triad from dimensions — so each can be presented alone, in order

**Within-list ordering: accept `created_at DESC` for now.** Verified: every read in `points-service-real.ts` sorts by `created_at DESC`; **tag-driven ordering is not implemented**, so a `cm1…cm12` system-tag family would order nothing without new code. Two tags already solve the load-bearing sequencing. Order *within* the nine is not load-bearing — if it proves to be, that is a code change plus a **founder-approved** system-tag family (P630 exists because agents created system tags without approval).

## Risks / Non-Goals

### Risks

- **MITIGATE — The numbers get published as evidence.** They record a primed room. Mitigation: the Intention section states this, and any page showing them repeats it in the same paragraph, not a footnote.
- **MITIGATE — Wording is unfixable after staking.** Mitigation: all twelve statements reviewed together, once, cold, before **any** Point is created.
- **MITIGATE — Positions visible while people are still staking.** Publicity is the cure for pluralistic ignorance, so it cannot also be the instrument — the display would correct the misperception before it can be revealed, and anchor late responders. Mitigation: reveal only after everyone has staked.
- **MITIGATE — The stake flow stalls live.** `event_rsvps` requires auth so registrants have accounts, but the path from "logged in" to "position staked" has never been walked by a non-founder. Mitigation: walk it end-to-end before event #1. This is the failure that costs the room, not the schema.
- **ACCEPT — n≈6–8.** Every number from event #1 is illustrative. Say so when showing it.

### Non-Goals

- **Do NOT reorder the flow.** Dimensions before the triad destroys the reveal.
- **Do NOT compare opt-ins to opt-outs as groups.** Self-selection. Within-person before/after only.
- **Do NOT report the psychological-safety Point as a psychological-safety measurement.**
- **Do NOT revive** the descriptive-vs-social question, the 4 binary items, or the dense passage.
- **Do NOT create a new system-tag family** without founder approval (P630).
- **Do NOT build the movement visualisation here** — [p1061](p1061_point_position_movement_analytics.md). Event #1 reads the aggregate aloud.
- **Do NOT add app/UI work** beyond creating Points and filtering by tag.

## Open Items

- **The twelve statements.** `[FOUNDER DECISION]`. The triad is settled above; the nine are not written. Reviewed together, once, before any Point exists.
- **Dimension separability.** Several of the nine may be restatements of one another. Worth one research pass — against this repo's own `decisions.md` and `hypotheses.md` first, so the statements do not contradict positions already taken — before wording is fixed. Driven by the irreversibility above, not by rigour for its own sake.

## Done-When

- [ ] Twelve statements written and reviewed **together**, cold, before any Point is created
- [ ] Each is a statement a reasonable person could genuinely disagree with, not a slogan
- [ ] Twelve Points exist carrying the parent CMP tag and the correct phase tag
- [ ] Two filtered views render: the triad alone, and the dimensions alone
- [ ] Every attendee has a pre-argument position on the triad, staked before any aggregate is visible
- [ ] Every attendee has positions on the dimensions, and a re-stake on all twelve after the argument
- [ ] The room saw the P1/P2 gap and the movement
- [ ] The offer was made after the reveal, not before
- [ ] The stake flow was walked end-to-end by a non-founder account before event #1

## References

**Absorbed:** P1062 (dimension battery) — archived 2026-08-13, merged here.
**Separate:** [p1056](p1056_install_norm_battery_and_safety_scale.md) (installs, Edmondson) · [p1061](p1061_point_position_movement_analytics.md) (movement display — productises step 6) · [p1060](p1060_link_events_to_organizations.md) (`events.org_id`).
**Model:** [story-point-model.md](../docs/story-point-model.md) — a Point is something you take a position on.
**Decisions:** [decisions.md](../docs/decisions.md) 2026-08-13 (both entries).
**Left alone deliberately:** `docs/facilitator-guide.md` §Workshop Metrics — three 0–10 items from the superseded workshop format. Outdated but harmless. Do not run both.
