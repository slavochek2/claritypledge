---
status: week
type: task
rank: 81
workstream: infrastructure
created_date: '2026-08-28'
tags: [skills, namespaces, refactor]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1184: Move the align-detect chain into an `understanding/` namespace

## Problem

`/align` is a human↔AI protocol. `align-detect → align-decompose → align-create-letter` is a
different thing entirely: it scans a corpus for one person's high-stakes items, reconstructs their
why, and files it as a letter they score. The shared `align-` prefix makes the two look like one
family, and the distinction had to be re-derived from scratch repeatedly in one session.

The naming also hides cp's own central distinction. `disagreement/` is named for **what it
extracts**. Its counterpart extracts *an understanding* — one person's why, offered back to be
scored — and says so nowhere.

## Appetite

**Blast radius: medium** — no runtime code, but references live in five-plus files and nothing
tests that a `/skill-name` in prose resolves. **Reversibility: high.** **Decision density: zero**
— the target name is decided (`docs/decisions.md` 2026-08-28 [process]).

## Solution

Move the three chain skills to `understanding/` (`understanding:detect · decompose ·
create-letter`), parallel to `disagreement/`. **`/align` stays in `think/`** — it is a
different job, and it is cited as *"the `/align` contract"* in the €1,000 milestone
(`decisions.md` 2026-08-14 [product]), so renaming it rots a priced artifact.

Add each skill's four identifying fields — subject · source · counterparty · produces — to its own
frontmatter, plus the discriminator that tells the two families apart: **does the subject rate
whether it captured their meaning?**

## Invariants

- **A skill describes itself, not its neighbour.** Cross-skill references rot silently
  (`decisions.md` 2026-08-05 [process]); self-description stays true.
- `/align` is not renamed.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A missed reference leaves a dead `/skill-name` that no gate catches | MITIGATE | Grep every referrer and verify each resolves; this exact failure produced four dead references to a command that never existed under its cited name |
| `decisions.md` is append-only, so its references cannot be corrected in place | ACCEPT | Add one forward pointer entry naming old → new; do not edit past entries |
| A subagent doing the move cannot commit, and a half-done rename is invisible | MITIGATE | Mechanical edits may be delegated; the reference-resolution check and the commit stay in the main session |

**Non-Goals**
- Do NOT rename `/align`.
- Do NOT change any skill's behaviour — this is naming and self-description only.
- Do NOT edit past `decisions.md` entries.

## Done-When

- [ ] The three skills resolve under `understanding/` and are invocable
- [ ] Every referrer updated: `skills.md`, `story-point-model-consumers.md`, `definitions.md`, and any others a fresh grep finds
- [ ] **Every `/skill-name` mentioned in prose across the repo resolves** — proven by a grep whose output is pasted, not asserted
- [ ] Each of the three carries its four fields plus the rating discriminator in frontmatter
- [ ] One `decisions.md` entry records old → new for the append-only references

## Related

- `docs/decisions.md` 2026-08-28 [process] — the classification and the rename decision
- `docs/decisions.md` 2026-08-05 [process] — cross-skill references rot silently
