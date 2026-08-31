---
status: in-progress
type: task
rank: 0.063
workstream: infrastructure
created_date: '2026-08-28'
tags:
  - skills
  - letters
  - problem-board
  - matching
blocks:
  - p1181
  - p1182
related:
  - p1185
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
locked_at: '2026-08-28T10:08:55.323Z'
---

# P1180: `/problem-submit` — draft a problem as one story plus three contestable claims, and file it as a private letter

## Problem

**Situation:** People building things need their thinking broken by someone who understands it. The working solution exists and is well documented: a practitioner interviewed on a public channel (2026-08-29, *"friction maxing"*) runs a deliberate disagreement loop across three models and roughly ten trusted people, and reports his judgment compounding because of it. `docs/definitions.md` §Problem-Statement Clarity names the scarcity for everyone who lacks that circle — *"most have only themselves and an agreeable AI, no competent disagreers."*

**Complication:** That solution does not transfer, for three reasons, and only one of them is about time.

1. **It runs on a favour.** The ten give and get nothing back, so it cannot be asked often and cannot be asked of a stranger.
2. **It runs on trust that cannot be inspected.** *"People I trust"* operationally means *people who understand my work well enough that their disagreement is about the thing and not about a misreading.* The only way to establish that today is years of shared history.
3. **It is routed by hand.** He decides who to send what to, every time, from memory of what each person currently understands.

A group where **everyone** is building dissolves (1) by construction — it becomes an exchange, not a favour. It makes (2) and (3) **worse**: more people, less history with each.

**Question:** Can a member's problem, written so that each part can be separately agreed or contested, establish enough understanding in a reader — fast, and without a conversation — that the reader's disagreement is worth having?

> Founder framing, verbatim: *"People are always asking what are you working on, but it takes too much time to discuss. I don't want to discuss. I want to be matched, and I want to know before, and I want my questions answered before."*

> Founder framing on what "trusted" actually means, verbatim: *"Nate says people whom he trusts, but practically it's cognitive understanding — my interpretation is people who cognitively understand him well and then they disagree, that's perfect."*

**Comprehension is necessary and not sufficient — the control case is already on the record.** A collaborator was pitched this project verbally and wrote it back as a PRD. He understood it correctly (founder: *"he got me right, which is great… I don't see much creativity in what he did"*) and produced **zero disagreement** — a competent mirror. That is the rubber stamp the practitioner above drops models for. The target is understanding **and** friction; this spec builds the instrument that measures the first and creates the occasion for the second.

**This also fixes the mechanism this spec's non-goals already reject.** On a vote-ranked board the mirror wins: it is the most agreeable version of the idea in the room. Ruling 1 of 2026-08-28 [product] argued that from first principles; the case above is it happening.

## Appetite

**Blast radius: medium.** A new skill, plus three corrections to the existing letter-writing path (claim count, sender identity, reading question — see Stage 6). It changes no user-facing screen. **Reversibility: high** — a skill file and a letter row. **Decision density: one** founder call left open, marked below.

## Solution

A skill that runs over the member's own corpus and produces one submission per approved problem.

**Stage 0 — scope, proposed rather than asked blind.** The first run **proposes a window** instead of leaving the member to guess how far back to read: **last month by default**, with last week, last three months, or a number they type. It then offers a **narrowing pass** — restrict to certain projects or topics, or exclude some — before any heavy reading. Both are proposals with a default already selected, not open questions: an empty prompt asking "how far back?" is the ambiguity this stage exists to remove.

**Chat history lives in more than one place, and the scan is built for that from the start.** Sessions from different harnesses and different machines — local runs, other tools, cloud runs — are separate stores in separate formats. The scan enumerates the stores it can reach, **names which ones it read and which it could not**, and never reports an absence found in one store as an absence overall. A scan that silently covered one store looks identical to a scan that covered all of them.

**Stage 1 — detect.** Scan the corpus for the member's high-stakes items: a `WHOSE STAKES` declaration, ranked by potential loss in its own currency, third person for the subject.

**This skill INLINES those steps. It is not an orchestrator and it does not call `/slava:understanding:detect`.** `decisions.md` 2026-08-06 [process] rules it directly: *"Composite skills do not call sub-skills… **Elicitation procedure is not** [shareable], and each skill inlines its own."* The reason names this exact case — eliciting from a chat archive (*can grep, cannot ask*) is a different procedure from eliciting from a live human, and forcing one shared procedure makes each worse. What **is** shareable per the same ruling: the **definitions** and the **acceptance contract** (declarative output properties). Borrow those; inline the procedure.

**Consequence:** this spec does **not** modify `/slava:understanding:detect`. If the provenance field (first-seen, reformulation count, related work) belongs in `/slava:understanding:detect` for its own sake, that is a separate change to that skill — not a side effect of this one.

**Stage 2 — filter.** A candidate qualifies only when it carries a real stake **and** trips at least one arbiter-failure mode (fuzzy intent · delayed feedback · concentrated stakes · explanatory divergence) **and** does not trip the interface disqualifier. Duration-still-open is a tiebreaker, never the gate — a two-day-old problem you just bet the year on is the most valuable thing here.

**Read the model from [`docs/arbiter-failure-model.md`](../docs/arbiter-failure-model.md)** — the four modes, their per-consumer firing conditions, the interface disqualifier and the falsifiers all live there since P1190 (2026-08-28), and `lean-canvas.md` explicitly refuses to restate them. *(An earlier draft cited `lean-canvas.md` 2026-08-24 — the model had left that home three days before this spec was written, so an implementing agent following the pointer would have found go-to-market prose and no firing conditions. Corrected 2026-08-31, both review arms.)*

**Stage 3 — draft ONE STORY plus THREE CLAIMS. Settled 2026-08-31 by the reader test run in writing on all five candidates, by two agents that did not propose the shape — see `decisions.md` 2026-08-31 [product] "The reader test run on all five candidates". The count is what the earlier draft proposed; the membership is not.**

**The governing test is the arbiter, and there are exactly two of them.** A stranger reading this board can adjudicate from **(i) the world** — their own experience — or from **(ii) the submitted story**, and from nothing else. So:

> **Every claim slot must be adjudicable from (i) or (ii) alone, and must name its own antecedent rather than pointing at another slot. A slot adjudicable only from the author's own mind is story.**

This is `docs/story-point-model.md` §"Operational model" (Point-ness ≈ shared-arbiter availability) applied at write time, corroborated independently by `docs/definitions.md` §"referent locus" — a point has a **public referent** and "the original speaker is *dispensable* as arbiter"; a story has a **private referent** and "the speaker is the *irreducible* ground truth."

| Part | Kind | Reader's job |
|---|---|---|
| Where they are · where they want to get to · what actually happened · **whether this is the one to work on now** | **one story**, third person | *Did I understand this?* — scored, never voted on |
| **Claim 1 — the frame:** what is actually blocking him is X, not Y | point + anti-point (**local**) | take a position |
| **Claim 2 — the obstacle:** the general mechanism X names | point + anti-point (**portable**) | take a position |
| **Claim 3 — the hypothesis:** knowing Y stands in for it | point + anti-point (**portable**) | take a position |

**"This is the right problem to be working on" is dissolved, not kept — it was two claims.** *"This is a real problem"* is the same claim as `story-point-model.md` §"Worked examples" (3)'s *"he actually has it"*, and becomes claim 1. *"This is the one he should work on now"* is arbitrated by his goals, runway and opportunity cost — none in the shared record, which is **the exact property used to remove the other two slots**. It is a filing filter, not something a reader positions on, and it goes into the story.

**Where the member is now, and where they want to get to, are story — but the earlier draft's reason was too strong.** The founder's test (*"my friend is at point A. Who am I to say disagree?"*) is right about *where he is*: its referent is private. It is **not** right about whether the account supports the diagnosis drawn from it — that referent is the written account, public the moment it is written, which is why claim 1 exists and why `story-point-model.md` §"Worked examples" (3) was correct to list *"he actually has it"* as extractable. The two records never conflicted; the earlier draft collided them and dropped the point instead of distinguishing it.

**Portable vs local is a real asymmetry and P1182 must expect it.** Claims 2 and 3 are contestable by any member from their own corpus, across submissions. Claim 1 is contestable only by someone who read that story. Match supply differs per slot by construction.

**Two submit-time rules.**
1. **No slot may pronominalize another slot.** "…would get past *it*" has no referent once claim 2 is rejected; state the antecedent inline and claim 3 survives rejection of claim 2. Claims 1→2 and 1→3 are benign.
2. **A slot the record cannot fill is blank, never generalized.** Generalizing claim 1 into a situation-type claim yields a *different* claim a reader can hold while still granting this author's case — the matcher would then route on something nobody contested. (Stage 3c already bans invention; this bans the subtler escape.)

**The story leads.** A reader cannot take a position on *"the obstacle is X"* before knowing the situation. `/slava:understanding:create-letter` already orders a story-first letter for the same reason, and its note explains why: the points exist to be judged against the story.

**Every anti-point is a complete rival position, never a negation.** *"The real barrier is Z"* — not *"the barrier is not X"*. A bare negation is a weak thing to take a side against, and the construction rule already in the repo (`/problemify` Phase 3, the canonical treatment in `docs/definitions.md` §"Position Flip vs Interpretation Flip") says the same: the closest position a thoughtful person would hold instead, stated flatly, no hedge words.

**The invariant this preserves.** Splitting claims 2 and 3 keeps *"you named the right barrier, your remedy is wrong"* expressible, and claim 1 against claim 3 keeps *"the problem matters, the method is wrong"* expressible. Both are the cases this whole spec exists for.

**Stage 3b — the structure is FIXED, and this skill does not reuse `/slava:understanding:reconstruct`.**

> **CORRECTED 2026-08-31, both review arms, independently.** An earlier draft justified this by saying reconstruct *"decomposes a candidate into whatever shape the material suggests"*. **That is false.** Its shape is fixed — three competing anti-point → reverse-story → point triples, each aimed at −3 / 10 / +3, built in a mandated order. Nothing varies but which variants survive. The non-goal stands; the reason given for it did not, and it was the reason a reader would have checked last.

**The real reasons not to reuse it:** its unit is **one point per triple** aimed at a graded reaction, not **three slots** a reader positions on separately; and its −3/10/+3 targets serve a comprehension measurement this letter does not take.

**Why the shape is fixed anyway:** **P1182 matches on the slot, not on the whole problem** (2026-08-28 [product] ruling 3). A shape that varied per letter would give the matcher nothing to match on, and a fixed one is what makes a hundred submissions comparable and routable.

**Stage 3c — a slot the record cannot fill is reported BLANK, never invented.** Both upstream tools already carry this rule and this spec must not lose it: `/problemify` — *"If you can't name it, ask — don't fill the slot. An invented obstacle is worse than a blank one"*; `/slava:understanding:reconstruct` — an explicit STOP against manufacturing a phantom story atom. **Done-When must not be read as mandatory slot-filling.** A member whose corpus carries no hypothesis gets a *blank claim 3 with the reason stated*, not a fluent invented one that passes every criterion in this file. A submission with a blank slot is valid and files; a submission with a fabricated slot is the failure this spec exists to prevent, wearing a passing grade.

**A part that resists the shape is a signal, not a failure** — it gets routed to the slot where a reader can act on it, or left blank per 3c. It is never bent to fit.

**Stage 4 — confirm in third person, and attach any links the member chooses.** Present each claim beside its anti-point and make the member choose between them. Do not ask "does this match?" The member may attach **their own** links for a reader who wants to go deeper — a public repo, an article, a published doc. **The skill never generates links automatically**, and never links into the corpus: the one promise this spec makes is that nothing leaves the machine except the body the member approved, and an auto-generated pointer into a private session breaks it. A reader's agent pulling deeper context on its own is a good idea and belongs to P1182.

**Stage 5 — file into TEST first, and review it as a received letter. This is a network write of unapproved content, and the privacy promise is scoped accordingly (see Risks).** The draft goes into the hosted test database and the member opens it in the product, in the reading flow, as the recipient will see it. Terminal preview is not the review surface. Founder's reason, verbatim: *"I get my experience as if I'm receiving the letter, so I can be better in my feedback rather than reading it in terminal."* A second benefit is structural: the letter-writing path runs twice, so the production write is never its first execution.

**Stage 6 — on approval, publish to PROD as a private letter from the member.** Not from the agent. This needs three corrections to the path `/slava:understanding:create-letter` implements, and none of them are optional:

1. **Claim count** — it writes exactly two points; this needs six (three claims, three anti-points).
2. **Sender identity — this is NOT a correction, and calling it one was the spec's own worst move.** *(Both review arms, independently, 2026-08-31.)* The existing path authenticates as a provisioned agent, and the seal's ownership guard compares the sender against **the sender's own authenticated session** (`v_sender_id != auth.uid()`, over REST with a real JWT — the file documents in detail why a superuser path silently no-ops that check instead of raising). Filing "from the member" therefore requires **the member's production session in the agent's hands**: a credential-handling design that does not exist, that the existing file's constraints exist specifically to stop being improvised, and that also moves who the recorded positions belong to. **This is the largest unbuilt piece in the spec** — the same phrase ("three corrections") was used to wave it through *and* to reject building a proper filing tool. For participant 2 the paste fallback absorbs it entirely. **For the founder's own run it must be designed before Stage 6 is attempted, or the run uses the paste fallback too.**
3. **Reading question** — it unconditionally stamps the reverse-story marker, which asks the reader *"did this capture YOUR meaning?"*. This letter needs the **default** question, *"how well did you understand the sender?"* — that is the number the whole spec is built to read. Left unchanged, every gate in that skill still passes and the run returns a valid-looking number measuring the opposite thing.

**Fallback for anyone without database access:** the skill prints the finished letter and a link to the compose screen, and the member pastes it there. Same command, same output, one manual step. This is what lets a second participant run the identical skill in round one without being given any credentials — and it is a fallback, not the primary path.

> Founder framing on voice, verbatim: *"in third person they have to force themselves into the mindset of the readers of this problem statement… they confirm not for themselves or not only for themselves but for others and I think the formulation will be much better."*

> Founder framing on scope, verbatim: *"I think it can be a private letter first. So it's a private letter from me to him and from him to me. That's it. And only then we do the rest."*

**No submission limit.** Reading is done by an agent, so there is no attention to ration — the same reasoning that killed voting in ruling 1 (*"at 30–45 items there is no attention scarcity to allocate"*) kills the cap. Founder: *"if I want to submit all the 100 points which I worked on over the last year, why not? It's not like somebody has to read them."* A large ceiling stays, to stop a runaway loop rather than to ration. **The real brake is the confirmation step** — every submission costs the member one choice against an anti-point, and that limits volume better than a rule.

> **The brake and the quality gate are the same mechanism, which is a known tension, not a solved one.** The Risks table relies on anti-point confirmation to catch wrong drafts and asks whether members edit or rubber-stamp. Making that same step the volume limiter puts it under forced-choice fatigue at exactly the volume it is meant to police — 100 submissions is 300 forced choices. Nothing here measures whether confirmation quality degrades as volume rises. **Instrument it in round one** (edit rate per confirmation, by position in the run) rather than assuming it holds. *(Review arm B, 2026-08-31.)*

[FOUNDER DECISION: the name of the wider project. Explicitly deprioritised — *"i honestly dont care i guess at this point until its validated"* — recorded so it is not silently invented.]

## Where the problem-statement shape lives — centrally, not in this spec

**The shape is a concept, not a feature detail, and it does not belong here.** Verified: `docs/definitions.md` currently has **zero** hits for the construct. Future consumers already exist on paper — P1182's matcher operates on the slots, and any later reader or profile does too — so a definition that lives only in this spec will be restated and will drift, which is the failure `CHARTER.md`'s one-fact-one-home rule exists to prevent.

Per the 2026-08-06 ruling, **definitions are exactly the reusable kind**. **Home: `docs/story-point-model.md`.** The shape is not a new primitive — it is a **composition of the existing model**: one story and three points. Founder's own read, and it is the deciding one: *"the problem is a very specific kind of content that lives within story and point."* That model doc exists precisely because the model outgrew a glossary entry, it already holds the operational patterns with their edge cases, and it is read by five consumers. `definitions.md` gets a short pointer entry, not the model — the same shape as the Stories-vs-Points entry already there.

**Not its own file, for now.** The construct is roughly ten lines; a dedicated doc is what you extract once a model grows edge cases of its own — which is exactly why `story-point-model.md` was split out of `definitions.md` in the first place. Revisit if the slots accumulate their own boundary cases.

It remains a **new construct**, so it is a strategy change: it goes through `/slava:maintain:docs-strategy-update` and its nine gates, not written directly and not by this spec. **Until that lands, this spec is the temporary home and says so.**

### The five-way reconciliation the migration must carry

**Five** records describe this construct, not three — the two added on 2026-08-31 are the ones that decide it, and neither was in the earlier table. The migration resolves them; this spec records the resolution so nobody silently picks one.

| Record | What it says | Standing |
|---|---|---|
| `docs/story-point-model.md` §"Worked examples" (3, "Deliberately kept fused") | The A→B→obstacle bundle **is the story**; the extractable points are *"this is the right problem to solve"*, *"he actually has it"*, *"it is solvable"* | **Largely vindicated** — see below |
| `decisions.md` 2026-08-28 [product] ruling 2 | **Four slots**, each a separately-contestable claim with its anti-point, over one story | **Superseded in part**, 2026-08-31 |
| This spec, Stage 3 | **One story + three claims**; A and B are story material | **Current** |
| `decisions.md` 2026-08-06 [process] | `/problemify`'s Point A/B are **story material**; the extractable points are *"this is the right problem to solve"*, *"he has it"*, *"it is solvable"* | **Upheld** — and it was never cited by ruling 2, which contradicted it three weeks later |
| `features/p1182_problem_read_matcher.md` §Solution | The reader agent names *"which **slot** it contests"*; Point-B divergence routes to verified comprehension | **Needs amending** — see below |

**Ruling 2 asserted four contestable claims without checking whether a reader could take a position on each**, and the founder's reader-seat test (*"my friend is at point A. Who am I to say disagree?"*) is what reopened it. But the replacement is **not** settled, and three review findings say so — see the blocking decision below.

**Overlap with the model doc is ONE of three, not a reinstatement.** *(Both review arms, 2026-08-31.)* The doc's extractable points are *"this is the right problem to solve"*, *"he actually has it"*, *"it is solvable"*. Stage 3 keeps the first, **drops the other two**, and adds *"the obstacle is X"* and *"knowing Y would get past it"*. An earlier draft of this section called the doc *"largely vindicated"* and the resolution *"the model doc's handling plus the hypothesis"* — that described a one-of-three overlap as a reinstatement, and it did so in the direction that flattered the judgment being checked. What ruling 2 genuinely contributes and keeps: **the hypothesis claim is new**, and none of the doc's three contain it.

### ✅ RESOLVED 2026-08-31 — the reader test was run on all five candidates

Two independent reviewers led with the same charge and it held: **the reader test was run hard on the two slots the agent wanted to remove, and never on the slot it wanted to keep.** The test has now been run in writing on all five candidates — *where they are · where they want to be · the obstacle · the hypothesis · "this is the right problem to be working on"* — by two agents, neither of which proposed the shape, and cross-verified by command. Outcome recorded in `decisions.md` 2026-08-31 [product] "The reader test run on all five candidates"; Stage 3 above is rewritten to match.

**What the test changed.**

1. **Claim 1 was never tested, and it does not survive as written.** It split exactly as suspected. *"This is a real problem"* survives as the frame claim; *"this is the one he should work on now"* is goal-arbitrated and fails on the same test used to remove slots A and B, so it could not be kept while they were removed. It moves into the story as a filing filter.
2. **"He actually has it" and "where they are" are different sentences with different referents** — private for where he is, the written account for whether it supports the diagnosis. `story-point-model.md` and the reader test never conflicted; the earlier draft collided them. The point is restored as claim 1; **"where they are" does not return as a slot.**
3. **The claims 2/3 coupling is a wording defect, not structural.** Naming the antecedent inline fixes it; the Invariants line that recorded it as inherent is corrected below.

**One item was retracted under challenge and is recorded because the retraction is the instructive part.** One arm opened by deriving the sort from point type — third person ⟹ Mechanism ⟹ every claim impersonal. Applied strictly it deletes all three survivors, since each is about one named person. It was withdrawn: `story-point-model.md` §"The two axes" defines impersonality as speaker-**independence**, while §"Point types"'s "how something works for anyone" is subject-**generality**, and only the first is criterial. It read as decisive because it agreed with a shape already reached by other means — this spec's own defect, one layer up, caught before it reached a doc.

### ✅ The supersession reached the log, 2026-08-31

*(Both review arms flagged this.)* Ruling 2 stood **unamended**, and the reversal existed only inside this spec, declared by the agent that proposed it. Both are now fixed: `decisions.md` 2026-08-28 [product] ruling 2 carries an inline **SUPERSEDED IN PART** stamp, and the outcome is recorded as its own entry — `decisions.md` 2026-08-31 [product] "The reader test run on all five candidates". A spec may not silently overturn a ruling; this one no longer does.

**Cite `decisions.md` by date-and-heading anchor, never by line.** The log is newest-first, so every append pushes earlier entries down. Ruling 2 moved from line 1434 to 1580 *during the session that resolved it*, when a co-tenant landed `cf7d701b` — both agents cited a number that was correct when read and stale when sent.

## Invariants

- **The agent drafts; the human approves.** No submission is filed without explicit per-problem approval. Founder framing, verbatim: *"Agents propose, people improve and approve. And then similar on voting. Agents read and propose... and people approve."* Corroborated by `/problemify`'s own two-stage gate, which blocks diagnosis until the frame is confirmed, and by `/slava:understanding:create-letter`'s approval precondition. *(An earlier draft of this line cited `decisions.md` 2026-08-16 for a claim that appears nowhere in `docs/` — the citation was lifted from a chat transcript. Removed 2026-08-28.)*
- **Whose problem it is is a declared field, never inferred silently.** The member's own, or their customer's seen through them. **When the protagonist is not the member, the story carries that person's description** — seen through the member, which is honest, because the member's observation of them *is* the member's lived experience. No separate container is needed and none may be invented. A reader who has their own experience of that kind of person does not contradict the story; their experience becomes the **reason behind a position on a claim**, which is the interaction this spec is built to produce.
- **The three claims stay separately addressable, and the coupling that broke this was a wording defect.** Bundling forecloses the two cases this exists for: *agree the problem matters, contest the method* (claim 1 against claim 3), and *right barrier, wrong remedy* (claim 2 against claim 3). An earlier draft recorded claim 3 as permanently conditional on claim 2 — *"a reader who rejects the obstacle has no coherent position on the hypothesis"* — and treated that as inherent to the shape. **It is not.** It followed from the pronoun in "knowing Y would get past *it*". Stage 3's submit-time rule — **no slot may pronominalize another slot** — removes it: with its antecedent stated inline, claim 3 is evaluable by a reader who thinks claim 2 is false. Pairs 1→2 and 1→3 were always benign. *(Corrected 2026-08-31 by the reader test; the earlier "in one direction, not both" wording overstated the coupling in the opposite direction from the review finding it was answering.)*
- **The shape is fixed across every submission.** Not a style preference — P1182 matches on the slot, and a shape that varies per letter has no slot to match on.
- **Confirmation happens against the anti-point, not against a yes/no.** Third person reads like a report and gets nodded at; the anti-point is what forces a choice.
- **The exchange is bidirectional, and this is a mechanism rather than a scoping convenience.** Each participant both sends and receives in the same round. Reciprocity is the one part of the practitioner loop this design structurally improves on — it is what stops a read being a favour, and a favour is what caps that loop at ten people and zero strangers. A round in which one party only sends has not tested the thing. *(Recorded in the founder's scoping quote below as "from me to him and from him to me"; promoted here from incidental to required, 2026-08-31.)*

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The corpus is uneven — a member who does not run agents daily has little to scan | ACCEPT | Round one is two heavy AI users. Degrades to "type it in", which is still a valid path. |
| The corpus is the most privacy-sensitive surface in the system | MITIGATE | **Scoped promise, corrected 2026-08-31 (both review arms):** no *corpus content* leaves the machine, and no corpus content is stored. What does leave: the **drafted letter body** — to the hosted test database at Stage 5 **before approval**, and to prod after it. The earlier wording ("nothing leaves the machine except the approved letter body") was false as written, because Stage 5 is an off-machine write of an unapproved draft. Members must be told this holds for the test environment too. |
| A drafted problem reads plausible and is wrong about the member | MITIGATE | The anti-point confirmation exists for exactly this; measure whether members edit or rubber-stamp. |
| Third person makes rubber-stamping easier than first person did | ACCEPT | Named trade-off, taken deliberately; the anti-point is the compensating mechanism. |
| The hypothesis claim invites solution-mode and swamps the diagnosis | DEFER | Watch it in round one; if it dominates, constrain its length. |
| The corpus scan silently covers one session store and reads as complete | MITIGATE | Stage 0 requires naming the stores read AND the stores skipped. An absence found in one store is never reported as an absence overall (`.claude/rules/epistemic.md` gate 1). |
| The three corrections to the letter-writing path are made, and the run still returns a valid-looking number measuring the wrong question | MITIGATE | The reading question is asserted by read-back after the write, not self-reported. This is the exact failure that path's own history records. |
| A fixed shape flattens a problem that genuinely does not fit it | ACCEPT | Named trade-off. The escape valve is routing, not bending the shape — and Stage 3 now names where each part routes: adjudicable from the world or the story ⟹ claim, adjudicable only from the author's mind ⟹ story. |

**Non-Goals**
- Do NOT build any voting, upvoting, ranking or leaderboard. Killed on the merits — 2026-08-28 [product].
- Do NOT add community-scoped visibility. That is P1181; round one is a private letter to one named person.
- Do NOT build the reader/matcher here. That is P1182.
- Do NOT reimplement corpus scanning — inline the existing detection procedure per Stage 1.
- Do NOT use `/slava:understanding:reconstruct` or any free decomposition. See Stage 3b — its variable output shape defeats P1182.
- Do NOT build a CLI, REST API or MCP surface for filing letters. The paste-into-compose fallback covers everyone without database access, and what the automated version should do is answerable only after a round has run.
- Do NOT auto-generate links out of the letter. Author-attached only (Stage 4).
- Do NOT cap submissions per member per round. See Stage 6.
- Do NOT invent a name for the project.

## Alternatives Considered

- **A shared private git repo instead of a letter.** Proposed and superseded by the founder: a private letter uses shipped infrastructure and tests the real artifact rather than a proxy. *"why would we not do that? … we need to find out if it's good enough."*
- **Three slots (no hypothesis).** Falsified by the founder's own example: engaged by the problem, disengaged by the proposed method — a reaction the three-slot model cannot address. The hypothesis survives that test and is retained as claim 3.
- **First person, as `/problemify` uses.** Rejected for the public rendering; see the voice quote above. The anti-point takes over the confirmability job first person was doing.
- **Four claims — where they are · where they want to be · obstacle · hypothesis, each contestable.** Held from 2026-08-28 to 2026-08-31, then rejected on the reader test run on all five candidates: where someone is and what they want have **private referents**, so only they can arbitrate, and both become story. **The reason must be stated at that precision** — an earlier version of this line said "nobody can take a position on where someone else is", which is false as written and is what buried the *"he actually has it"* claim for three days. A reader can absolutely take a position on whether the account supports the diagnosis; that is claim 1. See §"The five-way reconciliation".
- **Welding the obstacle and the hypothesis into one claim, against one combined anti-point.** Founder's own proposal, and the instinct behind it is right — an anti-point should read as a complete position a person would hold, not a fragment. Rejected because welding costs *"you named the right barrier, your remedy is wrong"*, a precise and common reaction. The coherence problem is solved instead by **writing every anti-point as a full rival position** (Stage 3), which is what the repo's existing construction rule already requires.
- **The skill files letters through a new CLI or API so every participant can send end-to-end.** Rejected for round one: it is the largest unbuilt piece here, and the paste-into-compose fallback lets a credential-less participant run the identical skill today. Revisit once a round has run and the friction is measured rather than assumed.
- **Reviewing the draft in the terminal before filing.** Rejected by the founder: reading it in the product, in the recipient's own flow, produces better feedback than reading text in a terminal — and it makes the production write the second execution of that path rather than the first.

## Rollback Strategy

Delete the skill file. Letters already filed are ordinary private letters and need no cleanup.

## Done-When

**Four boxes, and the other eleven are somewhere else on purpose.** Per `decisions.md` 2026-08-31
[process] *"A Done-When box that only the world can tick is a hypothesis falsifier"*, the eleven
criteria below that require a real round — a letter sent, a score returned, a second participant
running the skill, a disagreement judged worth having — are **not acceptance criteria**. They are
registered as **`hypotheses.md` H-AbsentCounterparty** with the falsifier, and are reproduced verbatim
under §"Round-one criteria" so nothing is lost. The fourth box below is the guard that ruling requires:
the relocation leaves a mechanical box behind, so `ship-gates.sh` gate 2.5 still has something to check
and the move leaves a trace rather than a hole.

- [x] The skill **proposes** a window (last month by default) and a narrowing pass, rather than asking an open question — `problem/submit.md` Stage 0a/0b
- [x] The skill **names the session stores it read and the ones it skipped**; a store it could not reach is reported, never silently omitted — Stage 0c, with a hard stop when every store is skipped
- [x] The confirmation step presents each claim beside its anti-point and requires a choice; a bare "looks good" does not advance it — Stage 4
- [x] The round-one criteria are registered in `hypotheses.md` as **H-AbsentCounterparty**, with a falsifier and a novel prediction recorded before the test

### Round-one criteria — moved to `hypotheses.md` H-AbsentCounterparty, kept here as the record

Unticked by construction: none of these can be ticked by an agent at a keyboard. They are what the
round-one protocol below produces, and their verdict belongs to the hypothesis, not to this spec's
completion.

- Running the skill on the founder's own corpus produces at least one candidate that passes the stake + arbiter-failure filter, with the failing candidates and their reasons shown
- Each drafted submission carries **one story, three claims, three anti-points**, and a declared whose-problem — verified by reading the output
- **Every anti-point reads as a complete rival position, not a negation** — spot-checked against the drafted set, not asserted
- The draft is reviewed **in the product's reading flow, as the recipient will see it**, before it is sent — **founder's direction only; participant 2 is explicitly exempt** and reviews in the terminal before pasting, because the fallback path has no test-database access. The asymmetry is accepted, not hidden. *(Amended 2026-08-31: the spec said "filed into test first"; on the paste path there is no programmatic write, so the reading-flow requirement is preserved and the environment hop is the member's choice — see §"Implementation notes".)*
- **A slot the corpus cannot fill is reported blank with its reason, and the submission still files** — verified by running against a corpus with no hypothesis present. No criterion in this spec may be met by inventing one.
- On approval it is published to **prod as a private letter from the member**, not from the agent — sender identity confirmed by read-back
- **The reading question on the filed letter is the default one**, confirmed by reading the stored value back after the write, not by self-report
- The recipient answers it, and the sender receives their comprehension score
- **Both directions run in the same round** — each participant sends one and receives one (see the reciprocity invariant)
- **The second participant runs the identical skill without being given any credentials**, using the paste-into-compose fallback
- **The round-one question is answered in writing:** did the reader produce a disagreement the sender judged worth having, and could the sender say which of the three claims it landed on?

> **A nod is a failure, not a pass.** The previous version of the last criterion asked whether the letter contained what the sender would otherwise have explained — a completeness test, which a mirror passes. Replaced 2026-08-31; the target is understanding **and** friction, and only the second half is in doubt.

### Round-one protocol — the founder's own sequence, recorded so it is not improvised

1. Founder runs the skill on his own corpus, reviews the draft in test, approves, publishes to prod.
2. He sends it to one person and shows him what receiving a problem this way is like. They discuss.

> **This step contradicts the confound rule below, and the contradiction is real.** The rule says pick a recipient who does not already know the project, or report the score as uninterpretable. Step 2's recipient is a collaborator who does. **Pick one:** either send round one to someone outside the project and keep the headline score interpretable, or keep the collaborator and **write "uninterpretable" on the score** rather than reading it as a pass. Do not leave this to be decided in the moment. *(Both review arms, 2026-08-31.)*
3. That person runs the identical skill — fallback path, no credentials — and sends one back.
4. Founder receives it, **answers the letter in the product**, and both scores exist.
5. Only then does anything expand into P1181 (sharing with a group) and P1182 (the reader that routes).

Steps 1–4 need nothing from P1181 or P1182: answering a letter is a shipped flow, and one named recipient needs no visibility model.

**Round one cannot separate two explanations, and the spec says so rather than pretending otherwise.** A high comprehension score from a reader who already knows the project is equally consistent with *the problem statement worked* and *he already had the context*. The confound is in the recipient, not the design: **pick a round-one recipient who does not already know the project**, and it mostly dissolves. Where that is not possible, report the score as uninterpretable rather than as a pass. Fully separating them needs the matcher (P1182) and is not in scope here.

## Open Questions

1. ~~Does the corpus scan need to read across all conversation stores, or is one enough for round one?~~ **Answered 2026-08-31:** across stores, with the read/skipped list printed. Chat history lives in several places and a single-store scan is indistinguishable from a complete one. See Stage 0.
2. Whether the member's profile (a derived, approved summary of what they work on) is needed at submission time or only at matching time. Raised twice in design, still unresolved — **deferred to P1182**, which is where a profile would first have a consumer.
3. Whether claim 1 (*"this is the right problem to be working on"*) should split into two — *is it a real problem* and *is it the one worth working on now*. Not assessed; watch whether round one's disagreements land on both halves at once.

## Implementation notes — 2026-08-31, `/dev`

**Shipped:** `.claude/commands/slava/problem/submit.md` — invoked as `/slava:problem:submit` (this
spec's `/problem-submit` is the shorthand). Namespace `problem/` is new and is registered in both
namespace lists (`CLAUDE.md`, `.claude/rules/skills.md`); `understanding/` was registered at the
same time, having existed on disk undocumented — the same drift that would have made a future agent
conclude no namespace fitted.

**Founder direction, 2026-08-31: the paste fallback is the round-one path, and the credential path
is NOT built.** The skill signs in as nobody, reads no `.env` file, and issues no programmatic
write. Sender identity is the member's own browser session.

**Consequence the spec did not anticipate: all three of Stage 6's "corrections" are satisfied by the
paste path at zero cost, and `/slava:understanding:create-letter` is not touched.** (1) The compose
UI takes as many points as the member adds, so the two-point limit was a property of that skill's
write sequence, not of the product. (2) Sender identity is the member's session by construction.
(3) The reverse-story marker is written by step 6b of that skill and by nothing else in the product,
so a letter composed in the UI carries the **default** reading question by construction — verified
by read-back at the skill's step 6f rather than assumed, because construction is not evidence.

**One deviation from Stage 5, stated rather than absorbed.** Stage 5 required filing into TEST
first, for two reasons: to read the letter in the product's reading flow, and so the programmatic
prod write would not be its own first execution. With no programmatic write, the second reason is
gone. The first is preserved in full and is non-negotiable — the skill routes it through
`/letter/‹docId›/preview`, which composes *the same reading components as the reading page*
(`src/app/pages/letter-preview-page.tsx:4`), so it is the recipient's flow rather than a summary of
it. The skill offers both routes (prod private draft → preview → send, or the test-environment hop
as written) and the member picks. **The Risks table's "off-machine write of unapproved content" does
not arise on either route**: on the paste path the member only pastes content already approved at
Stage 4, so the scoped promise reverts to the stronger form the earlier draft claimed.

**One trap found in the product while writing the paste steps.** `point_config.lead_count` defaults
to **1** when unset, so the first point renders *before* the story — the reader would take a
position on claim 1 before reading the experience that explains it, and the anti-point's
contradiction would never get staged. The member must explicitly **unmark the lead point** in the
draft and then confirm story-first **in the preview**, not from the toggle's appearance. This is the
easiest step in the run to get silently wrong and it is called out as such in the skill.

**Done-When is a round-one protocol, not a build checklist.** Eleven of the fourteen criteria are
observations of a real round (a corpus scanned, a letter sent, a score returned, a second
participant running credential-free). Three are properties of the skill file and are readable in it
now: the proposed window and narrowing pass, the read/skipped store list, and the
confirm-against-the-anti-point step. **No box is ticked**, because ticking a criterion written as an
observation on the strength of having implemented it is the failure mode this file spends four
pages warning about. `status` stays `in-progress`; the founder's first run is what advances it.

**Instrument verified, not assumed.** Stage 0's preferred scanner (`~/.agents/bin/hist`) was
exercised this session: `--stores` reports four stores with per-store status, and
`--files --since <date> --here "."` returned transcripts across two of them in ~12s. The fallback
path (direct globbing, compressed stores treated as *unreachable* rather than *empty*) is written
for members without that tool and has **not** been exercised.

## Related

- `docs/decisions.md` 2026-08-28 [product] — the five rulings this spec implements; **ruling 2 is superseded in part**, see §"The five-way reconciliation" and `decisions.md` 2026-08-31 [product] "The reader test run on all five candidates"
- `docs/decisions.md` 2026-08-12 [product] — the counterparty-absence hypothesis this tests
- `docs/decisions.md` 2026-08-24 [product] — the arbiter-failure criteria used as the filter
- `docs/decisions.md` 2026-08-06 [process] — what is shareable between skills; why this inlines rather than orchestrates
- `docs/story-point-model.md` §"The agreement test", §"Deliberately kept fused", §"Anti-point" — the model this composes, and the section the reconciliation must update
- `docs/definitions.md` §Problem-Statement Clarity, §Stories vs Points, §"Position Flip vs Interpretation Flip" (anti-point construction)
- `.claude/rules/epistemic.md` gate 1 — the absence-reporting rule Stage 0's store list implements
