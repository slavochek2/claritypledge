---
status: backlog
type: task
rank: 91
workstream: infrastructure
created_date: '2026-08-28'
tags: [matching, letters, problem-board, agents]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1182: `/problem-read` — read the corpus and say which letter to answer, and why

## Problem

**Situation:** Once members submit problems, the corpus is readable but nobody has time to read all of it, and reading it is not the same as knowing where you are useful.

**Complication:** This is the half that carries the actual bet. `decisions.md` 2026-08-12 [product] recorded, before this design existed: *the letter's value is a function of counterparty **absence*** — present counterparty → no value (observed); **absent counterparty → value (untested)**. A matcher is what produces an absent, self-selected counterparty.

**Question:** Can an agent with its own member's context read other members' submissions and name a disagreement worth a conversation?

## Appetite

**Blast radius: medium.** Read-only over the corpus; it proposes, the human approves. **Reversibility: high.** **Decision density: low** — the mechanism is settled, the open questions are empirical.

## Solution

**Sketched, not specified.** The agent reads the corpus with its own member's context and returns, per candidate: which **slot** it contests, what the contesting position is, and the **basis** — what the member did that entitles them to it. The human approves, and the approved contest becomes a letter answer.

**Match on the slot, not the problem** (2026-08-28 [product]). Divergence on the obstacle and on the hypothesis are the high-value cases; divergence on Point B is a values disagreement and routes to verified comprehension rather than argument.

Full requirements depend on P1180's output and P1181's visibility model.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Matches come back generic ("you both work on agents") | MITIGATE | This is the falsifier, not a bug — measure it explicitly rather than tuning past it |
| Agent-proposed positions get rubber-stamped, making the signal cheap | MITIGATE | The basis field, and comprehension verification before a contest counts |
| Every agent reading every member's raw corpus does not scale and is privacy-hostile | DEFER | The derived member profile is the candidate answer; unresolved |

**Non-Goals**
- Do NOT add voting or ranking. Ranking is emergent — what got answered.
- Do NOT build this before P1180 and P1181.

## Done-When

- [ ] For a corpus of at least two members' submissions, the agent names a contested slot with a basis, not a topic overlap
- [ ] **The bet is settled either way:** two members with agents either do or do not complete a letter to each other, and the result is recorded against the 2026-08-12 falsifier

## Open Questions

1. Is a derived member profile required as a matching input, or is the submission corpus enough? Raised twice in design, unresolved.

## Related

- `docs/decisions.md` 2026-08-12 [product] — the hypothesis this tests, and its falsifier
- `docs/decisions.md` 2026-08-28 [product] — spec (iii) of three
- Blocked by P1180 and P1181
