---
status: backlog
type: task
rank: 91
workstream: infrastructure
created_date: '2026-08-28'
tags: [matching, letters, problem-board, agents]
blocked_by: [p1180, p1181]
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

**Match on the slot, not the problem** (2026-08-28 [product]). Divergence on the obstacle and on the hypothesis are the high-value cases.

> **AMENDED 2026-08-31 — the slots this spec was written against no longer exist as written.** `decisions.md`
> 2026-08-31 [product] *"The reader test run on all five candidates"* superseded ruling 2 in part, and P1180
> shipped the replacement shape. Three consequences land here and none of them are cosmetic:
>
> 1. **The slots are now three, not four:** claim 1 (the frame — *what is actually blocking him is X, not Y*),
>    claim 2 (the obstacle), claim 3 (the hypothesis). *Where they are* and *where they want to get to* are
>    **story material**, not contestable slots.
> 2. **"Divergence on Point B routes to verified comprehension" no longer has a Point B to route from.**
>    Once B is story, there is no per-slot comprehension object: the min-gate scores **one whole story**
>    (`story-point-model.md` §What "verify" means here). B-divergence must surface as a **comprehension flag
>    on the story**, and for there to be anything to flag, **the submit side must state the want as an explicit
>    sentence** inside the story. That is a requirement on P1180's output, and it is not in P1180's Done-When —
>    surface it before this spec is worked.
> 3. **Match supply is asymmetric across slots by construction, and this spec assumes it is not.** Claims 2 and 3
>    are **portable** — contestable by any member from their own corpus, across submissions. Claim 1 is **local** —
>    contestable only by someone who has read *that* story. A matcher that ranks candidates without carrying the
>    `local` / `portable` label will systematically under-supply claim 1 and read that as low interest rather than
>    as a property of the slot. P1180's output carries the label; use it.

Full requirements depend on P1180's output and P1181's visibility model.

> **Unspecified: how the agent reads the board.** This spec says the agent reads the corpus and never says through what. A likely requirement is an **agent-readable read surface** — a per-submission machine-readable representation an agent fetches with the member's own credential, rather than each agent being handed raw corpus access. Noted 2026-08-29 after reading the Tikkun PRD (kubi-dev/tikkun, PRD-only, no implementation), which specs exactly this: read-only markdown endpoints per problem plus a per-user bearer token. It is a candidate answer to the DEFER'd scaling/privacy risk below, not a decision — cost it before adopting.

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
