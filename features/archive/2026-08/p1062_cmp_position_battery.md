---
status: rejected
type: story
rank: 1000979.0
created_date: '2026-08-13'
tags: [points, cmp, positioning, content]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1062: CMP Position Battery — where practitioners stand, across dimensions

> **MERGED INTO [p1055](../../p1055_norm_measurement_instrument.md) on 2026-08-13, the day it was filed.** Not rejected on its merits — the nine dimensions survive in full. The split was mine and it was wrong: I separated them from P1055's triad on a measurement-vs-positioning distinction that the actual event flow dissolves, because in that flow the dimensions **are** what the room argues about *and* what shows movement. The founder's pedagogical argument settled it — the dimensions are the scaffolding that makes the triad answerable, so they belong in the same sitting and the same spec. `status: rejected` here means "not implemented under this P-number", per the P-number-ownership convention. Content lives in P1055.

## Problem

**Situation:** The Clarity Meeting Principle is asserted to do a lot of things — reduce rework, raise psychological safety, improve collective problem-solving, lower conflict. All of it is currently the founder's claim, in the founder's voice, on the founder's site.

**Complication:** There is no artifact showing that anyone *else* holds those positions. And the mechanism to build one already exists: Points carry statements, positions are `−3 … +3`, points carry tags, and a tag-filtered feed groups them.

**Question:** What does a public, accumulating page look like that shows where practitioners actually stand on what the Clarity Meeting Principle does — across dimensions rather than in one lump?

## Appetite

**Blast radius: low.** Rows in `points` plus a filtered view.
**Reversibility: high.**
**Decision density: high on wording** — every dimension is a `[FOUNDER DECISION]` statement, and a badly worded Point cannot be fixed after people have staked on it.

## Approach

One Point per dimension, all sharing a topic tag with [p1055](../../p1055_norm_measurement_instrument.md)'s three, plus ordering system tags. Staked continuously by anyone, not at an event.

**Candidate dimensions** (founder, 2026-08-13 — wording not yet written):

| | Dimension |
|---|---|
| 1 | Status — gain or loss |
| 2 | Trust in judgment |
| 3 | Errors and rework — prevented or created |
| 4 | **Psychological safety** — flagged: this is not just another row, see below |
| 5 | Learning capacity and knowledge exchange |
| 6 | Collective problem-solving capacity |
| 7 | Relationship quality |
| 8 | Interpersonal / intergroup conflict |
| 9 | Ideological polarization |

**Psychological safety is different from the other eight.** It is the outcome variable in `hypotheses.md` H-NormRaisesSafety, and it has a validated instrument (Edmondson) already scoped in [p1056](../../p1056_install_norm_battery_and_safety_scale.md). A one-line Point about it is a positioning statement, **not** a measurement of it, and must never be reported as one.

### Why this is a positioning artifact and not the event instrument

Founder decision 2026-08-13, after the battery was proposed for event #1:

- The nine will **correlate near-perfectly** — they are all *"is this good?"* A battery of aligned positive items measures general favourability, not nine dimensions.
- Asked after a demo, they **hit the ceiling**. No variance, no information.
- They carry **no asymmetry**, which is the entire mechanism of [p1055](../../p1055_norm_measurement_instrument.md)'s reveal.
- Several are **empirical claims nobody in the room can know** ("CMP reduces rework"). Collected as belief, that is legitimate and interesting; presented as measurement, it is not.

**None of that damages the positioning use.** Consensus across many people over time is exactly what a positioning artifact should show, and correlation and ceiling are not defects there.

## Risks / Non-Goals

### Risks

- **MITIGATE — Belief presented as evidence.** The page shows what practitioners *believe* the principle does. Mitigation: the framing on the page says so, in the page, not in a footnote.
- **MITIGATE — Wording is unfixable after staking.** A Point whose statement changes invalidates every position already taken on it. Mitigation: all nine statements reviewed together, once, before any is created.
- **ACCEPT — early n is small and self-selected.** Everyone staking early is already sympathetic.

### Non-Goals

- **Do NOT run this battery at an event** — see above and [p1055](../../p1055_norm_measurement_instrument.md)'s non-goals.
- **Do NOT report the psychological-safety Point as a psychological-safety measurement.**
- **Do NOT treat aggregate agreement as evidence the principle works.** It is evidence people believe it does.
- **Do NOT build the org-scoped view here** — needs [p1060](../../p1060_link_events_to_organizations.md).

## Done-When

- [ ] All dimension statements written and reviewed **together**, before any Point is created
- [ ] Each is a statement someone can genuinely disagree with, not a slogan
- [ ] Points exist with the shared topic tag and ordering system tags
- [ ] A tag-filtered feed renders them in the intended order and is shareable
- [ ] The page states plainly that it shows belief, not evidence

## References

Origin: session 2026-08-13, scoping [p1055](../../p1055_norm_measurement_instrument.md). Model: [story-point-model.md](../../../docs/story-point-model.md). Related: [p1055](../../p1055_norm_measurement_instrument.md) (event instrument, shares the topic tag) · [p1056](../../p1056_install_norm_battery_and_safety_scale.md) (Edmondson, installs) · [p1060](../../p1060_link_events_to_organizations.md) (org-scoped view).
