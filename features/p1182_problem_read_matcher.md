---
status: backlog
type: task
disclosure: public
rank: 91
workstream: problem-board
created_date: '2026-08-28'
tags: [matching, letters, problem-board, agents]
blocked_by: [p1319]
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
>    surface it before this spec is worked. *(Carried into P1319, 2026-09-15.)*
> 3. **Match supply is asymmetric across slots by construction, and this spec assumes it is not.** Claims 2 and 3
>    are **portable** — contestable by any member from their own corpus, across submissions. Claim 1 is **local** —
>    contestable only by someone who has read *that* story. A matcher that ranks candidates without carrying the
>    `local` / `portable` label will systematically under-supply claim 1 and read that as low interest rather than
>    as a property of the slot. P1180's output carries the label; use it.

~~Full requirements depend on P1180's output and P1181's visibility model.~~ *Superseded 2026-09-15 — see below.*

> **AMENDED 2026-09-15 — what the reader reads, how it picks, and through what.** Each member posts **one
> current problem a week** (P1319). The reader's agent reads **this week's posted problems** with its own
> member's context and returns, per problem worth it, *which claim you can challenge, the position, and the
> basis* — so a member never reads every problem. Founder, verbatim: *"I don't want to read all problems. I want
> to find out which one should I look into."*
>
> **Context.** The reader's **own** profile (P1319, local) is input to their own agent. The **author's** approved
> project line arrives inside each problem. *(Open Question 1 below is answered by this.)*
>
> **Two read modes, with different security, never mixed:**
> 1. **Public links** — letters the author chose to make readable by anyone. No membership, no answer counts.
> 2. **Member-only export** — a signed-in member downloads the organisation's problem letters (P1181 item 6),
>    including each problem's answer count at export time, and hands the file to their own agent. The file is the
>    member's responsibility once exported; the agent never uploads it anywhere.
>
> **Coverage, not only fit.** Pure interest leaves some problems unread, and an author left unread stops posting.
> In **mode 2** the agent shows the member's top fits and prefers, among them, problems with the fewest answers.
> **Mode 1 has no counts, so it ranks on fit only**, and at an event the host covers any problem still unanswered.
> Founder framing: *"You can help them, nobody matches them … you can be of service to them."* Host-assigned readers
> as a system, and agent feedback to unpicked authors, are parked.
>
> **Later:** direct agent reads replace the export when P1215 phase 1 exists. The Build Day builds the mode-1 v1
> (docs/problem-board-process.md).

> **Unspecified: how the agent reads the board.** This spec says the agent reads the corpus and never says through what. A likely requirement is an **agent-readable read surface** — a per-submission machine-readable representation an agent fetches with the member's own credential, rather than each agent being handed raw corpus access. Noted 2026-08-29 after reading the Tikkun PRD (kubi-dev/tikkun, PRD-only, no implementation), which specs exactly this: read-only markdown endpoints per problem plus a per-user bearer token. It is a candidate answer to the DEFER'd scaling/privacy risk below, not a decision — cost it before adopting. *(2026-09-15: the member-only export is the interim answer; this remains the P1215-era answer.)*

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Matches come back generic ("you both work on agents") | MITIGATE | This is the falsifier, not a bug — measure it explicitly rather than tuning past it |
| Agent-proposed positions get rubber-stamped, making the signal cheap | MITIGATE | The basis field, and comprehension verification before a contest counts |
| Every agent reading every member's raw corpus does not scale and is privacy-hostile | DEFER | The derived member profile is the candidate answer; unresolved |
| An exported file outlives the member's membership | ACCEPT | Stated to the member at export; revocation applies to future exports only |

**Non-Goals**
- Do NOT add voting or ranking. Ranking is emergent — what got answered.
- ~~Do NOT build this before P1180 and P1181.~~ *Superseded 2026-09-15:* mode 1 needs neither; mode 2 needs P1181.
- Do NOT mix the two read modes in one run.

## Done-When

- [ ] On at least two members' real posted problems, the agent names a contested slot with a basis, not a topic overlap — judged by the member against a written "topic overlap = miss" rule
- [ ] Mode 1 reads public letter links and ranks on fit, stating that it has no answer counts
- [ ] Mode 2 reads a member-only export and, among the member's top fits, puts the problem with the fewest answers first
- [ ] ~~**The bet is settled either way:** two members with agents either do or do not complete a letter to each other, and the result is recorded against the 2026-08-12 falsifier~~ *Moved 2026-09-15:* the bet is settled at the first event, recorded per `docs/problem-board-process.md` §What the first event measures

## Open Questions

1. ~~Is a derived member profile required as a matching input, or is the submission corpus enough?~~ *Answered 2026-09-15 — see the amendment: the reader's own profile plus the author's project line.*

## Related

- `docs/decisions.md` 2026-08-12 [product] — the hypothesis this tests, and its falsifier
- `docs/decisions.md` 2026-08-28 [product] — spec (iii) of three
- **Blocked by P1319** (the problem format it reads). Mode 2 additionally needs P1181; direct agent reads need
  P1215 phase 1. Track A in [docs/problem-board-process.md](../docs/problem-board-process.md), rewritten 2026-09-15.
