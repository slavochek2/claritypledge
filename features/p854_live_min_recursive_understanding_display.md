---
status: backlog
type: story
rank: 241
created_date: '2026-05-27'
tags:
  - live
  - rating
  - min-principle
  - instrumentation
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P854: Surface min(both ratings) in /live — observation display

> **Founder direction, 2026-08-07 (board review).** The Chiang Mai live-demo driver (Beat 6)
> **still stands but is no longer the important half.** Two changes to this spec's scope
> before it is built:
>
> 1. **The letter is the first surface, not /live.** Surface `min(both ratings)` in the
>    letter results view first; /live follows. The letter is where a reader sits with the
>    number, so it is where the Min Principle actually lands.
> 2. **More prominent than currently specced.** The spec frames the min as "purely a
>    display… without canonizing it as the product's core metric." Keep the no-commitment-
>    wiring boundary, but give it real visual weight — it is the one number that says what
>    the session produced, and a de-emphasised version of it teaches nobody.
>
> **Not urgent.** Ranked accordingly. The scope change above must be reflected in the
> Solution before this is picked up — do not build the /live-only version as written.



## Problem

**Situation:** /live already captures both parties' comprehension ratings (`checkerRating`, `responderRating` in `clarity-live-page.tsx`). It computes no minimum and shows no combined value.

**Complication:** The Min Principle (a9/a27) says the recursive-understanding ceiling between two parties is `min(paired estimates)`. Two needs converge: (1) the Chiang Mai event's live-verification demo (Beat 6) wants "everyone sees the min on screen"; (2) P853's falsify needs the min observable to study whether a low min triggers a paraphrase or complacency.

**Question:** Can we surface `min(checkerRating, responderRating)` as a visible value in /live — purely as a display on data already collected — without canonizing it as the product's core metric or wiring it to any commitment?

## Appetite

Low blast radius — display-only on two values already in `liveState`. Fully reversible (remove the element). Low decision density — the *computation* is trivial; the contested decisions (naming, pledge-wiring) are explicitly deferred to P853.

## Solution

Compute `min(checkerRating, responderRating)` and display it during the rating/reveal phase, alongside the two individual ratings. Neutral label (e.g. "lower of the two" or "shared ceiling") — **not** a canonical product term yet. Visible enough to read on a projected screen for the event demo.

## Risks / Non-Goals

### Risks
- **Premature canonization.** Shipping a labeled "recursive understanding number" would pre-judge P853. Mitigation: neutral label only; naming decision waits for P853's falsify.
- **Pre-event build risk.** Any pre-event change can regress /live. Mitigation: display-only, behind the existing reveal phase; fallback for the demo is the facilitator stating the min verbally (no build needed).

### Non-Goals
- Do NOT rename or canonize the value as "the recursive understanding metric" in product copy — that is P853's decision.
- Do NOT wire the min to the pledge, the Clarity Partner Agreement, or any commitment behavior.
- Do NOT change how ratings are collected, or add a new rating input.
- Do NOT block the event on this — verbal fallback exists.

## Done-When

- [ ] During a /live session with both ratings submitted, the min of the two is visibly displayed alongside the individual ratings
- [ ] Label is neutral (no canonical product term)
- [ ] Value is legible on a projected/mirrored screen (event demo)
- [ ] No change to rating collection or any commitment behavior
- [ ] Removable in a single-element revert

## Related

- P853 (number+min pledge — falsify; this is the observation instrument for it)
- a9 / a27 — recursive floor / Min Principle
- Context: `pp/docs/business/chiang-mai-clarity-workshop/EVENT-STRATEGY.md` (Beat 6 live demo)
