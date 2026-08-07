---
status: week
type: comment
rank: 10
created_date: '2026-08-06'
tags:
  - hypotheses
  - audit
  - docs
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-08-07T09:16:14.555Z'
---

# P1029: Hypothesis inventory audit and trim

## Problem

**Situation:** `hypotheses.md` carries 38 registered hypotheses, ~20 marked `Active`. Most cannot be run — they are blocked on pairs, installs, or volume that does not exist.

**Complication:** A scoreboard where two thirds of the rows are unplayable stops working as a scoreboard. `Active P1` loses its meaning, and the handful of bets that *can* move get the same visual weight as the twenty that cannot. The concrete proof is **H-WorkshopFormat**: `Active P1`, *"first workshop imminent"*, since **2026-04-02** — with **zero workshops run**. Its transform-if (`<10% conversion after 3 workshops`) has therefore never been reachable, because the denominator is 0. A falsifier that cannot fire is not a falsifier.

**Question:** Which hypotheses are, in the founder's words, *"truly relevant for US"* rather than *"generally interesting to write down"* — and what does the file look like once the rest are demoted, merged, or parked?

## Appetite

**Low blast radius** — the output is a proposal, not an edit; nothing changes until the founder accepts it. **Fully reversible** — append-only history preserves every entry. **Medium decision density** — every demotion is the founder's call, and several will be contested.

## Approach

Sort **every** hypothesis into exactly one reachability bucket:

- **Testable by the first event** — can move on data from event #1
- **Testable after the first install** — needs a paying customer first
- **Not reachable this year** — needs volume, cohorts, or a base that is currently zero

Then, for each entry, check three things and report them per row:

1. **Is the transform-if reachable?** Name the denominator. If it is 0 and has been for months, say how long. (H-WorkshopFormat is the template case.)
2. **Has it moved since it was filed?** An entry with no evidence rows added since creation is a candidate for demotion regardless of how interesting it is.
3. **Does it duplicate a sibling?** Several bets differ only in framing — merge candidates, not separate rows.

Output a proposal grouped by recommended action: **keep active · demote · merge · park**. For each, one line of reasoning and the citation.

## Risks / Non-Goals

### Risks

- **Trimming the record rather than the scoreboard.** The value of this file is partly historical — an entry that cannot be tested this year may still hold a falsifier that stops a future session re-deriving a dead idea. **Mitigation:** demote and park, never delete; every parked entry keeps its bet and falsifier verbatim.
- **The `UNTESTED` erosion pattern.** `decisions.md` 2026-06-30 already flags the failure mode where `UNTESTED` labels accumulate while nothing is promoted or pruned — a trim that only relabels reproduces it. **Mitigation:** the proposal must state, for each demotion, what would promote it back.
- **Recency bias.** The most recently filed hypotheses will look most relevant simply because this session touched them. **Mitigation:** apply the reachability test mechanically to all 38 before ranking anything.

### Non-Goals

- Do NOT delete any hypothesis. Propose-only; the founder confirms every cut (`/slava:maintain:docs-strategy-update` Gate 4 is propose-only by design).
- Do NOT remove a bet, test, or transform-if from a parked entry — that content is load-bearing under Gate 5.
- Do NOT edit `hypotheses.md` directly. Route accepted changes through `/slava:maintain:docs-strategy-update`.
- Do NOT re-litigate whether any individual hypothesis is *true*. This is about reachability and inventory hygiene, not about the merits of the bets.
- Do NOT change any `SINGLE-VALUE` slot or the P0 set as a side effect.

## Research Questions

1. How many of the 38 are testable by event #1, after the first install, and not this year?
2. Which entries have an unreachable transform-if, and how long has each denominator been 0?
3. Which entries have gained no evidence row since they were filed?
4. Which pairs or clusters are the same bet in different words?
5. What does `progress.md`'s bets-and-kills table look like after the trim — does it still agree with `hypotheses.md` status and transform-ifs?

## Time Box

Report the proposal before any edit. If the audit finds fewer than ~5 genuine demotions, say so and stop — the inventory is healthier than it looks and the trim is not worth the churn.

## Deliverable

A proposal grouped by action (keep active / demote / merge / park), one line of reasoning and one citation per row, plus the promotion condition for every demotion — handed to `/slava:maintain:docs-strategy-update` for application.

## Done-When

- [ ] All 38 hypotheses are sorted into exactly one reachability bucket, with none unclassified
- [ ] Every entry with an unreachable transform-if is named, with its denominator and how long it has been 0
- [ ] Merge candidates are identified in pairs or clusters, with the surviving framing named
- [ ] Every proposed demotion carries the condition that would promote it back
- [ ] No entry is proposed for deletion; parked entries retain bet, test and falsifier verbatim
- [ ] `progress.md`'s bets-and-kills rows are checked against the proposed end state
- [ ] The proposal is reviewed by the founder before any change reaches `hypotheses.md`
