---
status: backlog
type: story
rank: 1000978.0
created_date: '2026-08-13'
tags: [points, positions, analytics, placeholder]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1061: Show position movement on a point or story

**Placeholder spec.** The shape is agreed; the design is not started.

> **Whose intention this serves:** [p1055](p1055_norm_measurement_instrument.md) §Intention owns it — read it there, it is not restated here. In short, this spec **productises step 6 of that flow** (the reflection on movement, currently read aloud from an aggregate). Anything built here that does not make that step land better is out of scope.

## Problem

`point_position_history` has existed since the original points migration and is written to by `points-service-real.ts`. **Nothing displays it.** Every position change any user has ever made is recorded and invisible.

That matters in three places at once:

1. **Events** — [p1055](p1055_norm_measurement_instrument.md) reveals before/after movement on three Points in a live room. Today that reveal has to be assembled by hand from the table.
2. **Story / point fitness** — the model treats a story's power as its ability to produce a **predictable flip**. Whether a flip actually happens is exactly what the history table records, and it has never been looked at.
3. **Verified understanding** — the product's claim is that comprehension changes what people do with a position. Movement *after* a verified exchange, versus movement without one, is the observable form of that claim.

## Appetite

**Blast radius: low.** Read-only view over an existing table.
**Reversibility: high.** A view can be removed.
**Decision density: medium** — what the default view is, whether movement is per-person or aggregate, and whether it is author-only or public.

## Approach

Minimum analytics on the point page and the story page: how positions moved over time, and — where the data exists — whether a verified exchange sat between the before and the after.

Deliberately unscoped further. The three consumers above want different cuts and the right first cut is not obvious.

## Risks / Non-Goals

### Risks

- **MITIGATE — Showing who changed their mind, publicly, is a status event.** Displaying individual movement by name may punish exactly the behaviour the product wants to make safe. Mitigation: settle aggregate-vs-individual and the visibility rule **before** any UI, not during.
- **ACCEPT — history density is low.** Few points have enough movement to visualise yet.

### Non-Goals

- **Do NOT build the event-reveal UI here.** [p1055](p1055_norm_measurement_instrument.md)'s reveal is spoken from an aggregate; it does not need a page.
- **Do NOT infer causation from movement.** No control arm exists in any current setting.
- **Do NOT expand into the letter overview.** [p700](done/2026-04-22/p700_letter_results_aggregate_overview.md) is letter-and-story scoped and author-only; the relationship between the two views is an open question, not an assumption.

## Done-When

- [ ] Aggregate-vs-individual and the visibility rule are decided and written down **before** design starts
- [ ] A point page shows how positions on it moved over time
- [ ] Where a verified exchange exists between two positions, the view distinguishes movement with it from movement without it
- [ ] The event case ([p1055](p1055_norm_measurement_instrument.md)) can be read off the view instead of assembled by hand

## References

Origin: session 2026-08-13. Table: `point_position_history` (`supabase/migrations/20260204_stories_points_calibration.sql`). Model: [story-point-model.md](../docs/story-point-model.md).
