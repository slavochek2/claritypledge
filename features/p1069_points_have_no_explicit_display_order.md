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

**Updated 2026-08-14.** The open question in Approach (2) — *does tag-driven ordering exist in code?* — is now answered, in both directions, and a third failure mode (versioning) was found. Evidence inline below; nothing about the "do this later" posture changes.

## Problem

A curated set of Points — one meant to be read in a specific sequence — has no way to declare that sequence. `points` has no ordering column. Display order comes entirely from `created_at`, and the only control is the order rows were inserted plus the feed's `?sort=oldest` toggle (`feed-page.tsx:39` → `points-service-real.ts:788`).

**What works today:** append. Create in the intended order, share with `&sort=oldest`, and the set reads correctly.

**What does not:**

- **Insertion.** A new item cannot go between two existing ones. It lands at whichever end the sort favours.
- **Reordering.** Changing the sequence means rewriting `created_at` on live rows — mutating a timestamp that also serves as an audit fact.
- **Silent reversal.** Omit `sort=oldest` and the set renders backwards with no error. Any share of the URL that drops the param shows the sequence inverted.
- **Versioning (found 2026-08-14).** A reworded Point renders *alongside* its predecessor rather than replacing it. `collapseToLatest` (`feed-utils.ts:64-84`) buckets by st-group and keeps the highest `v` tag; a Point with **no** st-tag falls into the `noStTag` passthrough and is never collapsed. So the machinery that hides superseded drafts is unavailable to exactly the sets this spec is about.

**Why this surfaces now:** P1055 creates ten Points whose order is load-bearing — seven dimensions staked before an argument, then a three-item triad whose reveal depends on being encountered last. The wording of a Point also cannot change after anyone stakes a position on it, so **the set and its order are frozen together at creation.**

## Appetite

**Blast radius: medium.** Touches the points schema and every read path that renders a set.
**Reversibility: high for the column; low for any backfill** that rewrites timestamps.
**Decision density: one real question** — an explicit sort column, or extend the st-group mechanism that Approach (2) has now located.

## Approach

Not designed. Two candidate directions:

1. **An explicit nullable ordering column** on `points`, honoured when present and falling back to `created_at`. Additive, no backfill required.
2. **Extend the st-group mechanism.** *(Rewritten 2026-08-14 — the original text said "no code implementing this was found." That was half right.)*

### What Approach (2) actually found

**The doc claim it was chasing is wrong.** `.claude/commands/slava/maintain/mutate-stories/SKILL.md` L340 states *"display ordering is derived from `points.system_tags` lexicographically (`st1` < `st2` < …)"* in the `story_points` context. The story→points read path does not do this: `stories-service-real.ts:419-424` sorts by the point's `created_at`, **descending**. The doc needs correcting — see Done-When. *(Skill files require founder approval to edit; not touched.)*

**But st-group ordering does exist — elsewhere.** `collapseToLatest` (`feed-utils.ts:80-82`) sorts by st-group **numerically** (`parseInt`, not lexicographically), and only when the URL carries `?version=latest`. It is a display-layer regroup, not a query sort.

**It overrides `created_at` completely, and prod proves it.** The `understanding` Points are stored with scrambled timestamps — `st1` 02-25, then **`st5` 03-01**, `st2` 03-02, `st4` 03-03, `st3` 03-03 — and `/feed/understanding` still renders st1→st9 in sequence. `st8` further carries `v2` at 03-06 and `v1` at 03-07: the **older** row wins, because version comes from the tag, not the clock. This is why P701 reordered that sequence by swapping st-tags in a migration rather than re-timing rows.

**Why the mechanism cannot simply be borrowed.** `stGroups` is a `Map<number, T>` keyed on the **bare number, globally across the fetched set** (`feed-utils.ts:65,74-77`). A Point tagged `st1` for a new family collides with the `understanding` `st1`; collapse keeps one and the other silently disappears from any view containing both. So direction (2) is not "mint `cm1…cm10`" — it is **re-key the group to (family, number)** and widen `ST_TAG_PATTERN`, plus the cloud-hiding regex at `feed-page.tsx:98`. That is a real change to a shared render path, which narrows the gap between (1) and (2) considerably.

## Risks / Non-Goals

### Risks

- **MITIGATE — Rewriting `created_at` to reorder destroys an audit fact.** It is a creation timestamp, not a sort key, and other reads treat it as chronology. Mitigation: whichever direction is chosen, do not solve this by mutating timestamps on live rows.
- **MITIGATE — st-group keys are global, so any new family collides.** Adding an `st`-numbered family without re-keying the map makes Points vanish from mixed views, with no error. Mitigation: re-key to (family, number) *before* any second family exists; there is currently only one, so the window is now.
- **~~ACCEPT — the discrepancy above may mean the constraint is smaller than described.~~** Resolved 2026-08-14: it is not smaller. The doc claim was wrong, the real mechanism sits behind a URL param, and it needs re-keying before reuse.

### Non-Goals

- **Do NOT do this now.** P1055 ships around it; nothing is blocked.
- **Do NOT reorder or re-time any existing Point** to fix a rendering order. Positions are staked against rows; timestamps are not a free variable.
- **Do NOT add a `cmp\d`-style system-tag family expecting it to sort.** Updated 2026-08-14: sorting by tag *does* exist, but it is hardcoded to the `st` prefix and keyed globally — a new family orders nothing and collides with `st`. Also `feed-page.tsx:98` hides only `/^st\d+$/i` and `/^v\d+$/i` from the tag cloud.
- **Do NOT conflate this with the feed's fetch-window bug.** `/feed?tag=X` fetching a fixed window and filtering client-side was [p1075](done/2026-06-10/p1075_feed_tag_filter_client_side_only.md), closed and pushed 2026-08-14 — a separate defect on a separate line, and nothing here depends on it or is fixed by it.

## Done-When

- [x] The `mutate-stories` L340 lexicographic-ordering claim is confirmed or corrected against code — **corrected**: the story→points path sorts by `created_at DESC` (`stories-service-real.ts:419-424`); real st-group ordering lives in `collapseToLatest` (`feed-utils.ts:80-82`), numeric and gated on `?version=latest`
- [ ] The `mutate-stories` L340 text is updated to match (**needs founder approval — skill file**)
- [ ] A direction is chosen and written down, with the reason
- [ ] A curated set can declare its own order without depending on insertion sequence or on a URL parameter surviving a copy-paste
- [ ] A reworded Point in a curated set supersedes its predecessor in the feed instead of rendering beside it

## References

Origin: [p1055](p1055_norm_measurement_instrument.md), session 2026-08-13 — a ten-Point set whose order is load-bearing. Mechanism verified there: `feed-page.tsx:39`, `points-service-real.ts:788`.

Session 2026-08-14 — Approach (2) resolved against code and against prod rows (`understanding` timestamps read live). Related but distinct: [p1075](done/2026-06-10/p1075_feed_tag_filter_client_side_only.md).
