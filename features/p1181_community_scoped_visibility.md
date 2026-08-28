---
status: backlog
type: task
rank: 90
workstream: infrastructure
created_date: '2026-08-28'
tags: [visibility, privacy, rls, problem-board]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1181: Community-scoped visibility for stories, points and letters

## Problem

**Situation:** Story visibility is **Private or Public only**. A `shared` level existed and was **deliberately cut on 2026-03-24** as imprecise, and visibility is immutable after creation (`docs/definitions.md` §Story Visibility Model).

**Complication:** A closed community whose members submit real problems needs exactly the level that was removed — visible to the group, not to the world. Candour is the entire reason the group is closed. P1180 sidesteps this by filing a private letter to one named person, which works for a two-person round and not beyond it.

**Question:** What does "shared with this group" mean, precisely enough to implement — and does re-adding it reintroduce the imprecision that got it cut?

## Appetite

**Blast radius: high** — touches who can see what, across stories, points and letters. **Reversibility: low** — a visibility level, once used, has rows depending on it. **Decision density: several**, and none of them are answerable before P1180 runs.

## Solution

**Not yet specified, deliberately.** The requirements are what round one produces. Writing them now would be deciding something only the test can answer — the founder's own parking-lot trigger 2.

What is known: the **Clarity Organization** container already exists with a join gate and a `community` type, and community feeds were already contemplated for it. That is the likely anchor, not a new concept.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Re-adds the imprecision that got `shared` cut in 2026-03-24 | MITIGATE | Read that decision first and state explicitly what is different this time |
| Visibility is immutable after creation — a wrong default is unfixable per row | MITIGATE | Decide the default before any row is written |
| Touches RLS, the repo's most incident-prone area | MITIGATE | Architecture review and tests before implementation |

**Non-Goals**
- Do NOT design this before P1180 has run. The requirements are its output.
- Do NOT reuse the name `shared` without saying what it now means.

## Done-When

- [ ] The 2026-03-24 cut is read, and this spec states what is different now
- [ ] The default visibility for a submission is decided and recorded
- [ ] Group members can read each other's submissions; non-members cannot, proven by a failing-path test

## Related

- `docs/decisions.md` 2026-08-28 [product] — spec (ii) of three
- `docs/definitions.md` §Story Visibility Model, §Clarity Organization
- Blocked by P1180
