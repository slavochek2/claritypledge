---
status: backlog
type: task
rank: 1000982.0
created_date: '2026-08-13'
tags: [points, feed, ordering, tech-debt]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1069: Points have no explicit display order — creation timestamp is the only control

**Filed as a known constraint, not as work to do now.** [p1055](p1055_norm_measurement_instrument.md) ships around it deliberately.

## Problem

A curated set of Points — one meant to be read in a specific sequence — has no way to declare that sequence. `points` has no ordering column. Display order comes entirely from `created_at`, and the only control is the order rows were inserted plus the feed's `?sort=oldest` toggle (`feed-page.tsx:39` → `points-service-real.ts:788`).

**What works today:** append. Create in the intended order, share with `&sort=oldest`, and the set reads correctly.

**What does not:**

- **Insertion.** A new item cannot go between two existing ones. It lands at whichever end the sort favours.
- **Reordering.** Changing the sequence means rewriting `created_at` on live rows — mutating a timestamp that also serves as an audit fact.
- **Silent reversal.** Omit `sort=oldest` and the set renders backwards with no error. Any share of the URL that drops the param shows the sequence inverted.

**Why this surfaces now:** P1055 creates ten Points whose order is load-bearing — seven dimensions staked before an argument, then a three-item triad whose reveal depends on being encountered last. The wording of a Point also cannot change after anyone stakes a position on it, so **the set and its order are frozen together at creation.**

## Appetite

**Blast radius: medium.** Touches the points schema and every read path that renders a set.
**Reversibility: high for the column; low for any backfill** that rewrites timestamps.
**Decision density: one real question** — explicit sort column, or make the documented lexicographic tag ordering actually work.

## Approach

Not designed. Two candidate directions, both unexplored:

1. **An explicit nullable ordering column** on `points`, honoured when present and falling back to `created_at`. Additive, no backfill required.
2. **Make lexicographic system-tag ordering real.** `.claude/commands/slava/maintain/mutate-stories/SKILL.md` L340 states *"display ordering is derived from `points.system_tags` lexicographically (`st1` < `st2` < …)."* **No code implementing this was found** — every sort in `points-service-real.ts` and `stories-service-real.ts` is by date or version. **Resolve that discrepancy first:** either the doc is stale and should be corrected, or the sort lives somewhere not yet located, in which case this is a much smaller job than (1).

## Risks / Non-Goals

### Risks

- **MITIGATE — Rewriting `created_at` to reorder destroys an audit fact.** It is a creation timestamp, not a sort key, and other reads treat it as chronology. Mitigation: whichever direction is chosen, do not solve this by mutating timestamps on live rows.
- **ACCEPT — the discrepancy above may mean the constraint is smaller than described.** Cheap to check, and checking is step one.

### Non-Goals

- **Do NOT do this now.** P1055 ships around it; nothing is blocked.
- **Do NOT reorder or re-time any existing Point** to fix a rendering order. Positions are staked against rows; timestamps are not a free variable.
- **Do NOT add a `cmp\d`-style system-tag family expecting it to sort** — that is exactly the unverified behaviour above. Also note `feed-page.tsx:98` hides only `/^st\d+$/i` and `/^v\d+$/i` from the tag cloud.

## Done-When

- [ ] The `mutate-stories` L340 lexicographic-ordering claim is confirmed or corrected against code, and the doc updated either way
- [ ] A direction is chosen and written down, with the reason
- [ ] A curated set can declare its own order without depending on insertion sequence or on a URL parameter surviving a copy-paste

## References

Origin: [p1055](p1055_norm_measurement_instrument.md), session 2026-08-13 — a ten-Point set whose order is load-bearing. Mechanism verified there: `feed-page.tsx:39`, `points-service-real.ts:788`.
