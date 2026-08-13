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
**Decision density: low as of 2026-08-13** — all ten statements are written below and the tag scheme is settled. What remains is one cold read of the wording, and a founder call if a `cm\d` system-tag family is ever wanted.

## Approach

### The flow (this is the spec; everything else supports it)

1. **See the Clarity Meeting Principle, opt in or out.**
2. **Stake the seven dimensions.** This is where they build the model.
3. **Argue.** They convince each other. This is the event's substance.
4. **Re-stake any dimension whose position changed.**
5. **Stake the triad** — scoped to the people they actually work with, not the room.
6. **Reveal:** the P1/P2 gap, and the movement on the dimensions.
7. **The offer:** a 1:1 about integrating this in their organization.

### Why the dimensions come first — load-bearing, do not reorder

**The triad is the selling instrument, so it sits next to the offer.** Putting the reveal 60 minutes before the ask wastes it. And the dimensions are what the room argues about in step 3 — they have to be staked before the argument or there is nothing to argue from.

**The priming objection, and why it does not bind here.** An earlier version of this spec ordered the triad first, on the grounds that seven dimensions establishing the principle's value would prime P1 upward and close the gap the reveal depends on. **That holds only if the triad is about the room.** It is not — P1 and P2 ask about *the people they actually work with*, who are absent. The room's expressed views tell an attendee what these strangers think; they say nothing about what an absent colleague thinks. The perspective-taking failure the reveal exploits — *I can introspect my own preference, I must infer yours* — survives intact, because the person being inferred about was never in the room.

**This is why the scoping in the triad below is not cosmetic.** Rescope P1/P2 to the room and the ordering argument reverses.

### The triad — scoped to their real counterpart

| | Statement |
|---|---|
| **P1** | "In an important conversation, I expect the other person to prefer that **I** opt into the Clarity Meeting Principle." |
| **P2** | "In an important conversation, I prefer that **the other person** opts into the Clarity Meeting Principle." |
| **P3** | "In an important conversation, someone who opts out of the Clarity Meeting Principle loses nothing in my eyes." |

**P1 and P2 share one predicate** — *"prefer that … opts into"* — from two sides. Predicate matching is what makes the gap between them meaningful rather than an artifact of different wording.

**The reveal:** P2 high, P1 low ⟹ everyone wants it from their partner, and nobody thinks their partner wants it from them.

**P3 is the norm-formation test.** If opting out is consistently free, no norm can form regardless of P1 and P2.

### The seven dimensions

All seven share the triad's sentence shape and its unscoped stem. **Every one is about the CMP's effect** — none measures the respondent's workplace. An earlier draft rewrote them as *"in my team, X is like this"*; that produces a survey of their environment, which is a different instrument and not this one's job.

| # | | Statement |
|---|---|---|
| **D1** | Trust | "In an important conversation, someone who opts into the Clarity Meeting Principle becomes more trustworthy in my eyes." |
| **D2** | Errors / rework | "Working with someone who opts into the Clarity Meeting Principle, I would expect less rework and fewer mistakes." |
| **D3** | Honesty | "Opting into the Clarity Meeting Principle makes it easier to voice a difference in values, opinions or interests honestly." |
| **D4** | Relationship | "Opting into the Clarity Meeting Principle strengthens the relationship between the people in the conversation." |
| **D5** | Conflict | "Over time, opting into the Clarity Meeting Principle reduces the conflicts that get emotionally stuck and go nowhere." |
| **D6** | Learning | "Opting into the Clarity Meeting Principle makes it easier to learn from each other despite differences in opinions, interests and values." |
| **D7** | Shared reality | "Opting into the Clarity Meeting Principle makes it less likely that two people leave a conversation with different versions of what was agreed." |

**Cut, and why — so they do not get re-added:**

- **Status** — it is P3 wearing a dimension's clothes. The sanction question is asked once, in the triad.
- **Collective problem-solving** — the most slogan-like of the set, and D6 covers adjacent ground.
- **Ideological polarization** — two clauses, unreadable in one pass on a phone, and the only item about humanity in general rather than the respondent's own conversations. D5 covers the axis.
- **Cost** (*"the time it costs is more than it saves"*) — cut 2026-08-13. It was added as the one item that invites disagreement, but the other seven carry natural variance (*"it's performative"*, *"it feels clinical"*, *"misunderstanding isn't our bottleneck"*), and it breaks the set's object: every other item asks what opting in *produces*, this one asks whether the practice is *worth it*. **That question is already answered by the opt-in/opt-out choice in step 1** — someone who thinks it costs more than it saves opts out.

**D3 is not a psychological-safety measurement.** Psychological safety is the outcome variable in `hypotheses.md` H-NormRaisesSafety and has a validated instrument (Edmondson) scoped in [p1056](p1056_install_norm_battery_and_safety_scale.md). D3 is a positioning statement about voicing disagreement, and **must never be reported as a measure of psychological safety.**

**D7 is the only item aimed at the detection problem** — the failure the product exists to fix, and the one thing self-report items are otherwise blind to (someone inside the illusion believes they understood). Sourced from this repo's own framing: [theory-of-change.md](../docs/theory-of-change.md) — *"fractured private realities → common shared reality, not by forcing agreement but by making disagreement informed."*

### Tags and ordering — decided, against verified capability

**The filtered feed already exists.** `src/app/pages/feed-page.tsx` carries a URL-driven tag filter accepting `?tag=X,Y` or repeated `?tag=`. **No build is required for the shareable artifact** — a URL is the deliverable.

**Two tags, because the dimensions and the triad are two views shown at different moments** (steps 2 and 5, with the argument between them). The sequencing is load-bearing, so this is not cosmetic.

- A **parent CMP tag** on all ten — one filtered URL shows the whole map, and that is the artifact you share
- A **phase tag** separating dimensions from triad — so each is presentable alone, at its own moment

**Ordering: creation order is the only control, and it runs backwards.** Every read in `points-service-real.ts` sorts `created_at DESC` (L327, 355, 464, 524, 679) and `feed-page.tsx` fetches all then filters client-side. So **the last Point created appears first.** To display D1…D7 in order, create them **D7 first, D1 last** — and the same for the triad. This is silent when wrong: the set renders reversed and nothing errors.

**Do not mint a `cm1…cm7` system-tag family.** Two reasons, both verified: tag-driven *sorting* is not implemented, so the tags would order nothing without new code; and `feed-page.tsx` L98 hides only `/^st\d+$/i` and `/^v\d+$/i` from the tag cloud, so a `cm\d` family would appear as clutter in every user's cloud unless that regex is changed too. P630 exists because agents created system tags without approval — this stays a **founder decision**.

## Risks / Non-Goals

### Risks

- **MITIGATE — The numbers get published as evidence.** They record a primed room. Mitigation: the Intention section states this, and any page showing them repeats it in the same paragraph, not a footnote.
- **MITIGATE — Wording is unfixable after staking.** Mitigation: all ten statements read together, once, cold, before **any** Point is created.
- **MITIGATE — Positions visible while people are still staking.** Publicity is the cure for pluralistic ignorance, so it cannot also be the instrument — the display would correct the misperception before it can be revealed, and anchor late responders. Mitigation: reveal only after everyone has staked.
- **MITIGATE — The stake flow stalls live.** `event_rsvps` requires auth so registrants have accounts, but the path from "logged in" to "position staked" has never been walked by a non-founder. Mitigation: walk it end-to-end before event #1. This is the failure that costs the room, not the schema.
- **ACCEPT — n≈6–8.** Every number from event #1 is illustrative. Say so when showing it.

### Non-Goals

- **Do NOT reorder the flow.** Dimensions first, triad last, argument between. Reversed 2026-08-13 — an earlier version of this spec said the opposite, so an agent working from memory or from a stale summary will get this backwards.
- **Do NOT rescope the triad to "this room."** The whole ordering rests on P1/P2 being about absent colleagues. Rescoping silently breaks the reveal without breaking anything visible.
- **Do NOT reword the seven as "in my team, X is like this."** That was tried and rejected — it measures their workplace instead of the principle.
- **Do NOT compare opt-ins to opt-outs as groups.** Self-selection. Within-person before/after only.
- **Do NOT report the psychological-safety Point as a psychological-safety measurement.**
- **Do NOT revive** the descriptive-vs-social question, the 4 binary items, or the dense passage.
- **Do NOT create a new system-tag family** without founder approval (P630).
- **Do NOT build the movement visualisation here** — [p1061](p1061_point_position_movement_analytics.md). Event #1 reads the aggregate aloud.
- **Do NOT add app/UI work** beyond creating Points and filtering by tag.

## Open Items

- **One cold read of all ten, by the founder, before any Point is created.** All ten statements are written above and have been through two review passes inside the conversation that produced them — which is not the same as being read cold by someone who did not write them. This is the last gate, and it exists because **the wording is the one irreversible decision in the spec.**
- **The layered reference group, deferred.** The self-anchoring stem — *"the people whose thoughts and opinions matter to you"* — supports a second layer: what I think, then what I think my own network thinks, with the gap between them as a further finding. Interesting, and it costs three more items for something more interesting than commercial. Not now.

## Done-When

- [ ] All ten statements read **cold** by the founder, together, before any Point is created
- [ ] Ten Points exist carrying the parent CMP tag and the correct phase tag
- [ ] **Created in reverse display order** (D7 first, D1 last; P3 first, P1 last) — verified by loading the filtered URL and reading the order back, not by assuming
- [ ] Two filtered URLs render: the seven dimensions alone, and the triad alone
- [ ] Every attendee has a position on all seven dimensions, staked before the argument begins
- [ ] Every attendee has a position on the triad, staked after the argument, before the reveal
- [ ] Movement on the dimensions is captured — attendees updated any position that changed
- [ ] The room saw the P1/P2 gap and the movement
- [ ] The offer was made after the reveal, not before
- [ ] The stake flow was walked end-to-end by a non-founder account before event #1

## References

**Absorbed:** P1062 (dimension battery) — archived 2026-08-13, merged here.
**Separate:** [p1056](p1056_install_norm_battery_and_safety_scale.md) (installs, Edmondson) · [p1061](p1061_point_position_movement_analytics.md) (movement display — productises step 6) · [p1060](p1060_link_events_to_organizations.md) (`events.org_id`).
**Model:** [story-point-model.md](../docs/story-point-model.md) — a Point is something you take a position on.
**Decisions:** [decisions.md](../docs/decisions.md) 2026-08-13 (both entries).
**Left alone deliberately:** `docs/facilitator-guide.md` §Workshop Metrics — three 0–10 items from the superseded workshop format. Outdated but harmless. Do not run both.
