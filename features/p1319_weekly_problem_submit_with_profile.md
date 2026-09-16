---
status: in-progress
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
delivery_stage: dev
pipeline_ran: [change-request, dev]
blocked_by: []
blocks: [p1320, p1182]
---

# P1319: Problem-submit proposes one current problem a week, under a standing profile, and hands the draft to the review page

> **Redesign of:** [P1180: `/problem-submit`](done/2026-06-10/p1180_problem_submit_skill.md)
> **What was wrong:** P1180 rationed nothing, on the premise that *"Reading is done by an agent, so
> there is no attention to ration"* (§Solution, "No submission limit"). That counted the **reader's**
> attention and forgot the **author's**. A mining run produced 209 problems for the founder to choose
> from; after 15 days **0 of 209 were ticked**. The author can read about five and review about three.
> A list that size cannot be reviewed, so nothing reaches a reader — and an unreviewed problem is not worth
> a stranger's time either. Separately, review and filing happen in a terminal and a hand-composed letter,
> which nobody but the founder will use.

## Operating Mode

> This spec is an **incremental correction** to P1180, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1180 are not up for re-examination — in particular the one-story-plus-three-claims
> shape, the drafting rules, and confirmation against the anti-point.

## Problem Statement

P1180's problem statement stands unchanged: a member's problem, written so each part can be separately
agreed or contested, should establish enough understanding in a reader — fast and without a conversation —
that the reader's disagreement is worth having.

What changes is the **unit of submission** and **where review happens**. Founder, verbatim (2026-09-15):

> "I can read maybe five and review only three … that's my capacity. I don't want to review so many
> problems either … maybe one per week per person, then everything gets easier."

> "It's not necessarily coming from the week. It's a problem I'm working on or worked on that I want to
> discuss."

> "First I want to submit what I work on, the high-level thing, and then each week there will be like
> sub-problems … I have the community, I have the Forgejo things, I have many things."

> "Nobody will ever use terminal but me for testing or maybe one more person who I teach."

Three things fail under the current design and all trace to volume: **review** (nobody reviews 209),
**privacy** (sending many means sending things the author never chose), and **quality** (*"if the person who
submitted it didn't read it, why would the reader read it"*).

## Jobs To Be Done

- **Preserved from P1180:** get a problem I am actually working on broken by someone who understands it; be
  read without owing a favour; approve every claim before anything leaves.
- **Corrected:** "file every approved problem" → **pick the one problem worth discussing now**, from a short
  proposal, in minutes; review it on a page, not in a terminal.
- **New:** keep problems I did not pick so they can come back later; state once what I am working on.

## Current State

P1180 shipped `.claude/commands/slava/problem/submit.md`:

- Stage 0a proposes a window defaulting to *"the LAST MONTH"*.
- Stages 1–2 detect and filter candidates, then **print every passing and failing candidate, unranked**.
- Stage 3 drafts one story + three claims with anti-points **per picked problem**.
- Stage 4 confirms each claim against its anti-point **in the terminal**; Stages 5–6 review in the product
  preview and **hand-compose** the letter (about fifteen minutes, one silently failing step).
- §Instrumentation: *"There is no submission cap … The real brake is the confirmation step."*
- Nothing persists between runs except a ledger line.

```
Before:  window (1 month) → detect → filter → ALL candidates printed → member picks N
         → N drafts → N terminal confirmations → N hand-composed letters
```

## Root Cause

The volume premise in P1180 §Solution ("No submission limit"): the design located the scarce resource at the
reading end, where an agent removes it, and treated the author's confirmation step as a brake that would limit
volume on its own. P1180 recorded the tension and left it open (*"The brake and the quality gate are the same
mechanism, which is a known tension, not a solved one."*). The 209/0 result is that tension resolving: the brake
did not throttle, it stopped everything.

Separately, the privacy promise is true about storage and about what the skill sends, and silent on the drafting
model itself reading the history through a cloud provider.

## Redesign

```
profile (once; offered for update on later runs)
   "what I'm working on": 1..n projects, one line each

weekly run
   1. window: member picks — this week (default, Enter), or any period back    [decided 2026-09-16]
   2. detect + filter exactly as today; keep only still-open problems; RANK by stake and "worth discussing now"
   3. propose TOP 3, each tagged to a profile project (or "no project")
   4. member marks each:  submit this week · maybe later · reject
   5. draft the marked problem(s)                                    [decided 2026-09-16: ONE per run by default;
                                                                      the member may ask for more. Weekly cap is the
                                                                      MEMBER'S OWN number, 3 unless they change it]
   6. EMIT a problem block (format below) → the member opens the review page (P1320),
      where confirmation against the anti-point, review and send happen

candidate list (private, on the member's machine): every proposed problem + its state
```

**Where confirmation lives.** Once P1320 ships, per-claim confirmation happens **on the review page only**;
the terminal Stage 4 and the hand-compose Stages 5–6 are no longer run. **Until P1320 ships, the skill keeps
P1180's Stages 4–6 as the fallback path**, so nothing that works today stops working. A member never confirms
the same claim twice.

**Profile.** One or more projects, a line each. Stored locally with the candidate list. The member's **own**
profile is context for their own agent when it reads other people's problems (P1182). The **author's** approved
project line travels **inside the problem block**, so a reader sees it; the profile file itself never leaves the
machine.

**The want is an explicit sentence in the story.** P1182 requires it (*"the submit side must state the want as an
explicit sentence inside the story"*): a reader's divergence on where the author wants to get to can only surface
as a comprehension flag if the story states it.

**Candidate list.** A private file on the member's machine, outside any repository: title, date first proposed,
project tag, state. Re-running reads it first — rejected items are never re-proposed, maybe-later items are
re-offered, submitted items are recorded so a problem is never filed twice.

**Privacy disclosure.** The member is told that the drafting model reads their history through its provider.
**Founder decision 2026-09-16: this is skill documentation, not a runtime prompt.** It lives in the skill's
`description` frontmatter and its "what leaves" section — read once when the skill is installed or read, not
printed on every run. Founder, verbatim: *"Clearly, they run a skill, and then it runs the chat history. Why
would they not want it? … I don't think that we should run it all the time when they run the skill. I think
this would be considered spam … It has to be as minimum text as possible to complete the job."* A per-run
banner costs context on every run and tells the member something they chose by invoking the skill.

## Problem Block Format

**This spec owns the format; P1320 parses it; nothing else defines it.** The contract is:

| Field | Required | Notes |
|---|---|---|
| `format_version` | yes | integer `1`; P1320 rejects an unknown version |
| `draft_id` | yes | unique per drafted problem, 8–64 of `[A-Za-z0-9_-]`; P1320 uses it as the idempotency key |
| `whose_problem` | yes | `member` or `customer_seen_through_member` (P1180 invariant) |
| `project` | no | the approved profile line (one line, ≤200 chars), or absent |
| `story` | yes | third person; contains one explicit sentence stating the want |
| `want_sentence` | yes | that sentence, copied verbatim; must appear inside `story` *(added at /dev so Requirement 8 is checked by machine, not by eye)* |
| `claims[1..3]` | yes, exactly 3 | in slot order: `slot` (frame / obstacle / hypothesis), `label` (`local` for frame, `portable` for obstacle and hypothesis), `point`, `anti_point` (not identical to `point`); a slot the corpus cannot fill carries `blank_reason` and no text. **At least one slot must be filled** — all three blank is a run to report, not a block to emit |
| `links` | no | author-attached only (P1180 Stage 4); public http(s) URLs — loopback, LAN and `.local`/`.internal` hosts are refused, because a link no reader can open is either useless or a pointer into the author's own machine |

No other fields are allowed, top-level or per claim.

**Encoding (chosen at /dev, 2026-09-15 — `/architect` did not run):** one JSON object inside a fenced code block
whose info string is `problem-block`. Exactly one such fence per paste. Executable form:
`scripts/problem-board/problem_block.py`; shared malformed cases for P1320's parser:
`scripts/fixtures/problem-block/invalid-cases.json`.

A block that does not validate against this table is a defect in the skill, not a case for the page to repair.

## Predecessor Sections Superseded

| Section | P1180 said | Status | Replaced by |
|---|---|---|---|
| §Solution volume | "**No submission limit.** Reading is done by an agent, so there is no attention to ration … The real brake is the confirmation step" | Superseded | Redesign step 5 |
| Skill §Instrumentation | "There is no submission cap … The real brake is the confirmation step." | Superseded | Redesign step 5 |
| Skill frontmatter `produces:` | "one private Clarity Letter per approved problem" | Superseded | one problem block per marked problem |
| Skill Stage 0a | "I'll read your chat history from the LAST MONTH" | Superseded in part | member-picked window, still-open only |
| Skill Stage 2 output | prints all passing and failing candidates | Extended | ranked top 3 plus the printed exclusions |
| Skill Stage 4 | terminal confirmation against the anti-point | Moved, once P1320 ships | P1320 per-claim choice |
| Skill Stages 5–6 | product preview review, then hand-composed letter | Replaced, once P1320 ships | P1320 |
| Open Question 2 | "Whether the member's profile … is needed at submission time or only at matching time … deferred to P1182" | Superseded | profile captured here; see Redesign |
| Privacy promise | "No corpus content leaves this machine and none is stored." | Superseded in part | same promise plus provider disclosure |
| Done-When box 1 | "proposes a window (last month by default)" | Superseded in part | AC 1 |

## Requirements

1. Stage 0 offers the window choice; "this week" and "a period back" are both one keystroke.
2. After the existing filter, only the **top 3 still-open** problems are proposed, ranked; the printed exclusion
   list stays.
3. Each proposal carries a project tag or "no project".
4. Nothing is drafted without a mark from the member.
5. The candidate list persists between runs and is read before proposing.
6. The profile is created on first run and offered for update later.
7. The provider disclosure is part of the skill's documentation — its `description` frontmatter and its
   "what leaves" section — read when the skill is installed or read, **not printed on every run**
   (founder decision 2026-09-16, superseding this requirement's original "before any history is read").
8. Every drafted story contains an explicit want sentence.
9. The skill emits a problem block that validates against §Problem Block Format.
10. Until P1320 ships, P1180 Stages 4–6 remain available as the fallback; after it ships they are not run.

## Invariants

Carried forward verbatim from P1180 — additive-only; removing one requires explicit founder approval.

- **The agent drafts; the human approves.** No submission is filed without explicit per-problem approval. Founder framing, verbatim: *"Agents propose, people improve and approve. And then similar on voting. Agents read and propose... and people approve."* Corroborated by `/problemify`'s own two-stage gate, which blocks diagnosis until the frame is confirmed, and by `/slava:understanding:create-letter`'s approval precondition. *(An earlier draft of this line cited `decisions.md` 2026-08-16 for a claim that appears nowhere in `docs/` — the citation was lifted from a chat transcript. Removed 2026-08-28.)*
- **Whose problem it is is a declared field, never inferred silently.** The member's own, or their customer's seen through them. **When the protagonist is not the member, the story carries that person's description** — seen through the member, which is honest, because the member's observation of them *is* the member's lived experience. No separate container is needed and none may be invented. A reader who has their own experience of that kind of person does not contradict the story; their experience becomes the **reason behind a position on a claim**, which is the interaction this spec is built to produce.
- **The three claims stay separately addressable, and the coupling that broke this was a wording defect.** Bundling forecloses the two cases this exists for: *agree the problem matters, contest the method* (claim 1 against claim 3), and *right barrier, wrong remedy* (claim 2 against claim 3). An earlier draft recorded claim 3 as permanently conditional on claim 2 — *"a reader who rejects the obstacle has no coherent position on the hypothesis"* — and treated that as inherent to the shape. **It is not.** It followed from the pronoun in "knowing Y would get past *it*". Stage 3's submit-time rule — **no slot may pronominalize another slot** — removes it: with its antecedent stated inline, claim 3 is evaluable by a reader who thinks claim 2 is false. Pairs 1→2 and 1→3 were always benign. *(Corrected 2026-08-31 by the reader test; the earlier "in one direction, not both" wording overstated the coupling in the opposite direction from the review finding it was answering.)*
- **The shape is fixed across every submission.** Not a style preference — P1182 matches on the slot, and a shape that varies per letter has no slot to match on.
- **Confirmation happens against the anti-point, not against a yes/no.** Third person reads like a report and gets nodded at; the anti-point is what forces a choice.
- **The exchange is bidirectional, and this is a mechanism rather than a scoping convenience.** Each participant both sends and receives in the same round. Reciprocity is the one part of the practitioner loop this design structurally improves on — it is what stops a read being a favour, and a favour is what caps that loop at ten people and zero strangers. A round in which one party only sends has not tested the thing. *(Recorded in the founder's scoping quote below as "from me to him and from him to me"; promoted here from incidental to required, 2026-08-31.)*

*Note on the last line: "the founder's scoping quote below" refers to P1180's own §Solution, not to this spec;
it is kept byte-identical because invariants carry forward verbatim.*

Added by this spec:

- **Nothing is proposed for filing that the member did not mark.** A ranked list is a proposal, never a default
  selection.
- **The candidate list and profile file never leave the member's machine.** Only the approved project line, inside
  an approved problem block, does.
- **A member never confirms the same claim twice.**

## What Stays the Same

- The one-story-plus-three-claims shape, `local`/`portable` labels, and every Stage 3 drafting rule.
- The arbiter-failure filter and its printed exclusions (`docs/arbiter-failure-model.md`).
- No credentials, no agent identity, no programmatic filing. Agent drafting is P1215's upgrade path.

## Surfaces in Scope

**In scope:**
- `.claude/commands/slava/problem/submit.md`

**Out of scope:**
- Any product page or database change (the review page is P1320; community visibility is P1181)
- A public profile page
- The reader (P1182)
- `/slava:understanding:detect` and every other consumer of the arbiter-failure model

## Acceptance Criteria

- [ ] A run offers a window choice and proposes at most 3 still-open problems, ranked, each with a project tag
- [x] Marking a problem "maybe later" makes it reappear on the next run; "reject" makes it never reappear
- [x] A problem already submitted is never proposed or drafted again
- [x] First run creates the profile; a later run offers to update it
- [x] The provider disclosure is carried in the skill's documentation, not printed per run (decided 2026-09-16)
- [x] Every drafted story contains an explicit want sentence
- [x] The emitted block validates against §Problem Block Format, with a test that rejects a malformed block
- [ ] Until P1320 ships, the P1180 fallback path still produces a story-first letter with three claims and three anti-points
- [x] The candidate list file is outside any git repository
- [ ] A dry run on the founder's own history: three proposals reviewed, minutes taken recorded in the ledger

**Evidence (2026-09-16):** `scripts/test-p1319-problem-board.sh` — 92 checks, 0 failures, covering the ticked
criteria above. The gate was proven to fail: eleven mutated copies each failed the exact check that covers
them (claim count relaxed · terminal states disabled · repository check disabled · lock never acquired ·
bare-repo detection removed · profile-shape guard disabled · draft-location guard disabled · all-blank
check removed · draft_id anchored with `$` instead of `\Z` · unclosed-fence guard removed · missing
timestamp not counted). The eleventh mutation initially PASSED, which exposed a test defect rather than a
code one: the unclosed-fence case was being caught by the "more than one fence" guard instead, so the check
now asserts the reason and not just the exit code.
Three independent hostile reviews (Opus, Codex Sol, Gemini 3.8) ran on the first implementation and reported
6 HIGH and 14 MEDIUM between them; every converged finding is fixed and covered above — the profile being
silently overwritten, bare repositories passing the location guard, the lock being defeated by replacing its
file, timezone-dependent week accounting, candidates ranked below 3 never reaching the list, drafts not
location-guarded, and a deleted quote-anchor rule restored to the skill.
Three criteria remain open by design — the window/top-3 proposal and the fallback letter are only observable
in a real run, which the founder's dry run below produces.

## Open Questions

1. The bidirectional-exchange invariant ("each participant both sends and receives in the same round") sits
   uneasily with the event's designed "problems with zero readers" measure. Proposed reading: each participant
   posts one problem and answers one. Founder to confirm, or to approve changing the invariant.
2. Whether the project line appears inside the story text or only as the block's `project` field.
3. Candidate-list location on a member's machine (proposed 2026-09-15, not yet confirmed).

## Next Steps

- One skill file, explicit delta → `/architect` for the block encoding, then `/dev`, after the founder decisions above.
