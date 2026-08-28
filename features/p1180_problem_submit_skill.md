---
status: week
type: task
rank: 80
workstream: infrastructure
created_date: '2026-08-28'
tags: [skills, letters, problem-board, matching]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1180: `/problem-submit` — draft a problem as four contestable claims and file it as a private letter

## Problem

**Situation:** A member of a closed community wants other people to engage with the problem they are actually stuck on. Today the only way is to explain it, one person at a time, in conversation.

**Complication:** Explaining costs ~30 minutes per person, so it does not happen, so nobody challenges the framing. `docs/definitions.md` §Problem-Statement Clarity names the resulting scarcity directly — *"most have only themselves and an agreeable AI, no competent disagreers."* ClarityPledge's early-adopter definition lists *"a social environment committed to clarity"* as one of three things it supplies, and that one has **no shipped surface**.

**Question:** Can an agent read a member's own corpus and produce a problem statement good enough that reading it beats talking to them?

> Founder framing, verbatim: *"People are always asking what are you working on, but it takes too much time to discuss. I don't want to discuss. I want to be matched, and I want to know before, and I want my questions answered before."*

## Appetite

**Blast radius: medium.** A new skill plus one write path that already exists. It does not change any shipped surface, and round one touches no product code. **Reversibility: high** — a skill file and a letter row. **Decision density: two** founder calls, both marked below.

## Solution

A skill that runs over the member's own corpus and produces one submission per approved problem.

**Stage 1 — detect.** Scan the corpus for the member's high-stakes items: a `WHOSE STAKES` declaration, ranked by potential loss in its own currency, third person for the subject.

**This skill INLINES those steps. It is not an orchestrator and it does not call `/slava:understanding:detect`.** `decisions.md` 2026-08-06 [process] rules it directly: *"Composite skills do not call sub-skills… **Elicitation procedure is not** [shareable], and each skill inlines its own."* The reason names this exact case — eliciting from a chat archive (*can grep, cannot ask*) is a different procedure from eliciting from a live human, and forcing one shared procedure makes each worse. What **is** shareable per the same ruling: the **definitions** and the **acceptance contract** (declarative output properties). Borrow those; inline the procedure.

**Consequence:** this spec does **not** modify `/slava:understanding:detect`. If the provenance field (first-seen, reformulation count, related work) belongs in `/slava:understanding:detect` for its own sake, that is a separate change to that skill — not a side effect of this one.

**Stage 2 — filter.** A candidate qualifies only when it carries a real stake **and** trips at least one arbiter-failure mode (fuzzy intent · delayed feedback · concentrated stakes · explanatory divergence, per `lean-canvas.md` 2026-08-24) **and** does not trip the interface disqualifier. Duration-still-open is a tiebreaker, never the gate — a two-day-old problem you just bet the year on is the most valuable thing here.

**Stage 3 — draft four slots over one story.** Point A · Point B · obstacle · **hypothesis** (the knowledge that would get past the obstacle), each with its anti-point, over a single story carrying the lived experience and the reasoning. `/problemify` emits the first three and its anti-points already; the hypothesis slot it deliberately does not produce, so this skill generates it.

**Stage 4 — confirm in third person.** Present each slot beside its anti-point and make the member choose between them. Do not ask "does this match?"

**Stage 5 — file** as a **private Clarity Letter to one named person**, via the path `/slava:understanding:create-letter` already implements.

> Founder framing on voice, verbatim: *"in third person they have to force themselves into the mindset of the readers of this problem statement… they confirm not for themselves or not only for themselves but for others and I think the formulation will be much better."*

> Founder framing on scope, verbatim: *"I think it can be a private letter first. So it's a private letter from me to him and from him to me. That's it. And only then we do the rest."*

[FOUNDER DECISION: how many problems may one member submit per round? Discussed as a limit, never set.]

[FOUNDER DECISION: the name of the wider project. Explicitly deprioritised — *"i honestly dont care i guess at this point until its validated"* — recorded so it is not silently invented.]

## Where the four-slot definition lives — centrally, not in this spec

**The four slots are a concept, not a feature detail, and they do not belong here.** Verified: `docs/definitions.md` currently has **zero** hits for the construct. Future consumers already exist on paper — P1182's matcher operates on slots, and any later reader or profile does too — so a definition that lives only in this spec will be restated and will drift, which is the failure `CHARTER.md`'s one-fact-one-home rule exists to prevent.

Per the 2026-08-06 ruling, **definitions are exactly the reusable kind**. Home is the strategy-doc layer — `docs/definitions.md` or `docs/story-point-model.md`, which is already the dedicated home for the story/point model and is read by five consumers. Either way it is a **new construct**, so it is a strategy change and goes through `/slava:maintain:docs-strategy-update` and its nine gates — not written directly, and not by this spec.

**Until that lands, this spec is the temporary home and says so.** [FOUNDER DECISION: `definitions.md` or `story-point-model.md`?]

## Invariants

- **The agent drafts; the human approves.** No submission is filed without explicit per-problem approval. Founder framing, verbatim: *"Agents propose, people improve and approve. And then similar on voting. Agents read and propose... and people approve."* Corroborated by `/problemify`'s own two-stage gate, which blocks diagnosis until the frame is confirmed, and by `/slava:understanding:create-letter`'s approval precondition. *(An earlier draft of this line cited `decisions.md` 2026-08-16 for a claim that appears nowhere in `docs/` — the citation was lifted from a chat transcript. Removed 2026-08-28.)*
- **Whose problem it is is a declared field, never inferred silently.** The member's own, or their customer's seen through them.
- **The four slots stay separately addressable.** Bundling them forecloses the case this exists for — agreeing a problem matters while contesting the method.
- **Confirmation happens against the anti-point, not against a yes/no.** Third person reads like a report and gets nodded at; the anti-point is what forces a choice.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The corpus is uneven — a member who does not run agents daily has little to scan | ACCEPT | Round one is two heavy AI users. Degrades to "type it in", which is still a valid path. |
| The corpus is the most privacy-sensitive surface in the system | MITIGATE | Nothing leaves the member's machine except the approved letter body. No corpus content is stored. |
| A drafted problem reads plausible and is wrong about the member | MITIGATE | The anti-point confirmation exists for exactly this; measure whether members edit or rubber-stamp. |
| Third person makes rubber-stamping easier than first person did | ACCEPT | Named trade-off, taken deliberately; the anti-point is the compensating mechanism. |
| The hypothesis slot invites solution-mode and swamps the diagnosis | DEFER | Watch it in round one; if it dominates, constrain its length. |

**Non-Goals**
- Do NOT build any voting, upvoting, ranking or leaderboard. Killed on the merits — 2026-08-28 [product].
- Do NOT add community-scoped visibility. That is P-next; round one is a private letter to one named person.
- Do NOT build the reader/matcher here.
- Do NOT reimplement corpus scanning — extend the existing detection skill.
- Do NOT invent a name for the project.

## Alternatives Considered

- **A shared private git repo instead of a letter.** Proposed and superseded by the founder: a private letter uses shipped infrastructure and tests the real artifact rather than a proxy. *"why would we not do that? … we need to find out if it's good enough."*
- **Three slots (no hypothesis).** Falsified by the founder's own example: engaged by the problem, disengaged by the proposed method — a reaction the three-slot model cannot address.
- **First person, as `/problemify` uses.** Rejected for the public rendering; see the voice quote above. The anti-point takes over the confirmability job first person was doing.

## Rollback Strategy

Delete the skill file. Letters already filed are ordinary private letters and need no cleanup.

## Done-When

- [ ] Running the skill on the founder's own corpus produces at least one candidate that passes the stake + arbiter-failure filter, with the failing candidates and their reasons shown
- [ ] Each drafted submission carries four slots, four anti-points, one story, and a declared whose-problem — verified by reading the output
- [ ] The confirmation step presents slot beside anti-point and requires a choice; a bare "looks good" does not advance it
- [ ] One submission is filed as a private Clarity Letter to a named recipient, and the recipient can open it
- [ ] The recipient answers it, and the sender receives their comprehension score
- [ ] **The round-one question is answered in writing:** did the letter contain the thing the sender would otherwise have spent the conversation explaining?

## Open Questions

1. Does the corpus scan need to read across all four conversation stores, or is one enough for round one? Not assessed.
2. Whether the member's profile (a derived, approved summary of what they work on) is needed at submission time or only at matching time. Raised twice in design, unresolved.

## Related

- `docs/decisions.md` 2026-08-28 [product] — the five rulings this spec implements
- `docs/decisions.md` 2026-08-12 [product] — the counterparty-absence hypothesis this tests
- `docs/decisions.md` 2026-08-24 [product] — the arbiter-failure criteria used as the filter
- `docs/definitions.md` §Problem-Statement Clarity, §Stories vs Points
