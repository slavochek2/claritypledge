---
status: week
type: change-request
disclosure: public
workstream: problem-board
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 103
changes: p1180
tags:
  - redesign
  - p1180
  - problem-board
created_date: '2026-09-15'
delivery_stage: change-request
pipeline_ran: [change-request]
blocked_by: []
blocks: [p1320, p1182]
---

# P1319: Problem-submit proposes one current problem a week, under a standing profile

> **Redesign of:** [P1180: `/problem-submit`](done/2026-06-10/p1180_problem_submit_skill.md)
> **What was wrong:** P1180 rationed nothing, on the premise that *"Reading is done by an agent, so
> there is no attention to ration"* (§Solution, "No submission limit"). That counted the **reader's**
> attention and forgot the **author's**. A mining run produced 209 problems for the founder to choose
> from; after 15 days **0 of 209 were ticked**. The author can read about five and review about three.
> A list that size cannot be reviewed, so nothing reaches a reader at all — and an unreviewed problem is
> not worth a stranger's time either.

## Operating Mode

> This spec is an **incremental correction** to P1180, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1180 are not up for re-examination — in particular the one-story-plus-three-claims
> shape, the anti-point confirmation, and the paste filing path.

## Problem Statement

P1180's problem statement stands unchanged: a member's problem, written so each part can be separately
agreed or contested, should establish enough understanding in a reader — fast and without a conversation —
that the reader's disagreement is worth having.

What changes is the **unit of submission**. Founder, verbatim (2026-09-15):

> "I can read maybe five and review only three … that's my capacity. I don't want to review so many
> problems either … maybe one per week per person, then everything gets easier."

> "It's not necessarily coming from the week. It's a problem I'm working on or worked on that I want to
> discuss."

> "First I want to submit what I work on, the high-level thing, and then each week there will be like
> sub-problems … I have the community, I have the Forgejo things, I have many things."

Three things fail under the current design and all trace to volume: **review** (nobody reviews 209),
**privacy** (sending many automatically means sending things the author never chose), and **quality**
(*"if the person who submitted it didn't read it, why would the reader read it"*).

## Jobs To Be Done

- **Preserved from P1180:** get a problem I am actually working on broken by someone who understands it;
  be read without owing a favour; approve every claim before anything leaves.
- **Corrected:** "file every approved problem" → **pick the one problem worth discussing now**, from a
  short proposal, in minutes.
- **New:** keep problems I did not pick this week so they can come back later; state once what I am
  working on so each weekly problem has context — which is also what the community recorded wanting,
  *"who is building what"* (pp decisions 2026-08-13).

## Current State

P1180 shipped `.claude/commands/slava/problem/submit.md`:

- Stage 0a proposes a window defaulting to *"the LAST MONTH"*.
- Stages 1–2 detect candidates and filter them (real stake · trips an arbiter-failure mode · no
  interface disqualifier), then **print every passing and failing candidate, unranked**, and the member
  picks which to draft.
- Stage 3 drafts one story + three claims with anti-points **per picked problem**; frontmatter says it
  *"produces: one private Clarity Letter per approved problem"*.
- §Instrumentation: *"There is no submission cap … The real brake is the confirmation step."*
- The privacy promise: *"No corpus content leaves this machine and none is stored."*
- Nothing persists between runs except a ledger line; a candidate not drafted today is gone.

```
Before:  window (1 month) → detect → filter → ALL candidates printed → member picks N
         → N drafts → N confirmations → N pastes
```

## Root Cause

The volume premise in P1180 §Solution ("No submission limit", line 132): the design located the scarce
resource at the reading end, where an agent removes it, and treated the author's confirmation step as a
brake that would limit volume on its own. P1180 itself recorded the tension and left it open
(§Solution: *"The brake and the quality gate are the same mechanism, which is a known tension, not a solved one."*). The 209/0 result
is that tension resolving: the brake did not throttle, it stopped everything.

Separately, the privacy promise is incomplete rather than wrong: it is true about storage and about what
the skill sends, and silent on the drafting model itself reading the history through a cloud provider.

## Redesign

```
After:
  profile (once; update when it changes)
     "what I'm working on": 1..n projects, one line each

  weekly run
     1. window: member picks — this week, or any period back          [FOUNDER DECISION: default window]
     2. detect + filter exactly as today, then RANK by stake and
        "worth discussing now"; keep only still-open problems
     3. propose TOP 3, each tagged to a profile project
     4. member marks each:  submit this week · maybe later · reject
     5. at most one drafted per run by default                        [FOUNDER DECISION: weekly max, founder said "up to three"]
     6. draft → confirm against anti-points → review → paste  (unchanged P1180 stages 3–6)

  candidate list (private, on the member's machine)
     every proposed problem + its state; "maybe later" items are offered again next run
```

**Profile.** One or more projects, a line each, written once and updated when it changes. Each weekly
problem is tagged to one project, and the approved project line may appear as context inside the story.
Publishing the profile as a community page is **out of scope** here.

**Candidate list.** A private file on the member's own machine, outside any repository, holding each
proposed problem's title, the date first proposed, its project tag, and its state. Re-running the skill
reads it first: rejected items are never re-proposed, maybe-later items are re-offered, submitted items
are recorded so a problem is never filed twice (P1180's resume rule, made durable).

**Privacy disclosure.** The announce line and §"Nothing leaves the machine" must additionally state that
the drafting model reads the chat history through its provider.
`[FOUNDER DECISION: exact wording of the disclosure sentence the member sees]`

## Predecessor Sections Superseded

| Section | P1180 said | Status | Replaced by |
|---|---|---|---|
| §Solution volume | "**No submission limit.** Reading is done by an agent, so there is no attention to ration … The real brake is the confirmation step" | Superseded | Redesign step 5 — weekly cap |
| Skill §Instrumentation | "There is no submission cap … The real brake is the confirmation step." | Superseded | Redesign step 5 |
| Skill frontmatter `produces:` | "one private Clarity Letter per approved problem" | Superseded | one letter per run by default, from a ranked top 3 |
| Skill Stage 0a | "I'll read your chat history from the LAST MONTH" | Superseded in part | member-picked window, still-open only |
| Skill Stage 2 output | prints all passing and failing candidates for the member to pick from | Extended | ranked top 3 plus the printed exclusions |
| Open Question 2 | "Whether the member's profile … is needed at submission time or only at matching time … deferred to P1182" | Superseded | profile is captured at submission time (this spec) |
| Privacy promise | "No corpus content leaves this machine and none is stored." | Superseded in part | same promise plus model-provider disclosure |
| Done-When box 1 | "proposes a window (last month by default)" | Superseded in part | AC 1 below |

## Requirements

1. Stage 0 offers a window choice; "this week" and "a period back" are both one keystroke.
2. After the existing filter, candidates are ranked and **only the top 3 still-open** problems are
   proposed; the printed exclusion list from Stage 2 stays.
3. Each proposal carries a project tag from the profile, or "no project" when none fits.
4. The member marks each proposal submit-this-week, maybe-later, or reject; nothing is drafted without a mark.
5. The candidate list persists between runs and is read before proposing.
6. The profile is created on first run and offered for update on later runs.
7. The disclosure sentence appears before any history is read.
8. Everything from P1180 Stage 3 onward is unchanged.

## Invariants

Carried forward verbatim from P1180 — additive-only; removing one requires explicit founder approval.

- **The agent drafts; the human approves.** No submission is filed without explicit per-problem approval. Founder framing, verbatim: *"Agents propose, people improve and approve. And then similar on voting. Agents read and propose... and people approve."* Corroborated by `/problemify`'s own two-stage gate, which blocks diagnosis until the frame is confirmed, and by `/slava:understanding:create-letter`'s approval precondition. *(An earlier draft of this line cited `decisions.md` 2026-08-16 for a claim that appears nowhere in `docs/` — the citation was lifted from a chat transcript. Removed 2026-08-28.)*
- **Whose problem it is is a declared field, never inferred silently.** The member's own, or their customer's seen through them. **When the protagonist is not the member, the story carries that person's description** — seen through the member, which is honest, because the member's observation of them *is* the member's lived experience. No separate container is needed and none may be invented. A reader who has their own experience of that kind of person does not contradict the story; their experience becomes the **reason behind a position on a claim**, which is the interaction this spec is built to produce.
- **The three claims stay separately addressable, and the coupling that broke this was a wording defect.** Bundling forecloses the two cases this exists for: *agree the problem matters, contest the method* (claim 1 against claim 3), and *right barrier, wrong remedy* (claim 2 against claim 3). An earlier draft recorded claim 3 as permanently conditional on claim 2 — *"a reader who rejects the obstacle has no coherent position on the hypothesis"* — and treated that as inherent to the shape. **It is not.** It followed from the pronoun in "knowing Y would get past *it*". Stage 3's submit-time rule — **no slot may pronominalize another slot** — removes it: with its antecedent stated inline, claim 3 is evaluable by a reader who thinks claim 2 is false. Pairs 1→2 and 1→3 were always benign. *(Corrected 2026-08-31 by the reader test; the earlier "in one direction, not both" wording overstated the coupling in the opposite direction from the review finding it was answering.)*
- **The shape is fixed across every submission.** Not a style preference — P1182 matches on the slot, and a shape that varies per letter has no slot to match on.
- **Confirmation happens against the anti-point, not against a yes/no.** Third person reads like a report and gets nodded at; the anti-point is what forces a choice.
- **The exchange is bidirectional, and this is a mechanism rather than a scoping convenience.** Each participant both sends and receives in the same round. Reciprocity is the one part of the practitioner loop this design structurally improves on — it is what stops a read being a favour, and a favour is what caps that loop at ten people and zero strangers. A round in which one party only sends has not tested the thing. *(Recorded in the founder's scoping quote below as "from me to him and from him to me"; promoted here from incidental to required, 2026-08-31.)*

Added by this spec:

- **Nothing is proposed for filing that the member did not mark.** A ranked list is a proposal, never a
  default selection.
- **The candidate list never leaves the member's machine.** It holds titles of problems the member chose
  not to share.

## What Stays the Same

- The one-story-plus-three-claims shape, `local`/`portable` labels, and every Stage 3 drafting rule.
- Stage 4 confirmation against anti-points; Stage 5 review in the product preview; Stage 6 paste filing.
- The arbiter-failure filter and its printed exclusions (`docs/arbiter-failure-model.md`).
- No credentials, no agent identity, no programmatic filing (agent drafting is P1215's upgrade path, not this spec).

## Surfaces in Scope

**In scope:**
- `.claude/commands/slava/problem/submit.md`

**Out of scope:**
- Any product page or database change (the review page is P1320; group visibility is P1181)
- A public profile page
- The matcher / reader (P1182)
- `/slava:understanding:detect` and every other consumer of the arbiter-failure model

## Acceptance Criteria

- [ ] A run offers a window choice and proposes at most 3 still-open problems, ranked, each with a project tag
- [ ] Marking a problem "maybe later" makes it reappear on the next run; "reject" makes it never reappear
- [ ] A problem already submitted is never proposed or filed again
- [ ] First run creates the profile; a later run offers to update it
- [ ] The model-provider disclosure is shown before any history is read
- [ ] Stages 3–6 produce the same letter shape as before — one story, three claims, three anti-points, story first
- [ ] The candidate list file is outside any git repository and is not created inside the claritypledge checkout
- [ ] A dry run on the founder's own history completes with the founder reviewing 3 proposals, recorded in the ledger with minutes taken

## Open Questions

1. How the bidirectional-exchange invariant maps onto the weekly event: "each participant posts one
   problem and answers one" is the proposed reading. Founder to confirm.
2. Whether the approved project line should appear inside the story text or only as a tag.
3. Candidate-list location on a member's machine (proposed in session 2026-09-15, not yet explicitly
   confirmed).

## Next Steps

- Scope is one skill file and the delta is explicit → `/dev` directly after the founder decisions above.
