---
status: backlog
type: task
rank: 302
workstream: problem-board
created_date: '2026-09-17'
tags: [lean-canvas, letters, problem-board, skill]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1332: Canvas to letter — let strangers understand and take positions on what a member builds and why

## Problem

**Situation:** `/slava:problem:submit` (P1180, redesigned in P1319) turns one problem a member is stuck on into a story plus three point/anti-point claims, so a stranger can understand it and disagree.

**Complication:** On 2026-09-17 the founder ran it on his own history. Nothing was submitted. Across three scans (6 months ranked by stake, this week only, and 3 months filtered to "others could benefit / I want feedback"), 9 of 9 proposals were rejected, each for one of three reasons: already resolved for myself; only something I'd discuss with someone close; or not something discussion solves. The one draft that reached confirmation was refused. A draft of what he builds and why, by contrast, landed: *"This one is cool."* It showed where the misfit is. What the founder wants strangers to understand and agree or disagree with is not a problem he's stuck on. It's his **bets about other people's problems**, which is his lean canvas.

> Founder, verbatim: *"What I want to verify with others is my lean canvas. And I want that they read it and they kind of agree and disagree. And this is a validation thing."*

> *"if we do A then its hard to find out if peopel misunderstand some boxes or just disagree? someitmes people might have specific experience and resoning behind specific formualiton of a givne box"*

**Question:** What should a skill do to turn a member's canvas into one letter where a stranger's reaction to each box can be read as either *misunderstood* or *understood and disagrees*?

Status of the finding: **UNTESTED, n=1**, and the founder is the least typical member. It is a strong signal, not a refutation of the problem board. `H-AbsentCounterparty` is untested because nothing was sent.

## Appetite

- **Blast radius:** low. It's a new skill file and a new letter shape, with no schema or code change expected (see Solution).
- **Reversibility:** high. Delete the skill, and any filed letter is an ordinary private letter.
- **Decision density:** medium. Several founder calls are listed below.

## Solution

A new skill, separate from `/slava:problem:submit`, which stays as it is for members who really are stuck. It produces **one letter, with the boxes in canvas order, at mixed depth**:

- **Deep boxes** get a story (the reasoning and experience behind *this* wording of the box) plus a point and a complete rival position. These are the boxes carrying the member's **riskiest bets**, ranked from their hypotheses (for the founder, `docs/hypotheses.md`). Understanding is scored against stories and agreement is a position on points, so only a box with its own story can tell misunderstanding apart from disagreement. Verified 2026-09-17: a letter holds several ordered stories (`doc_stories.position`), and the author's prediction is made **per story** (`letter-prediction-walk.tsx`). Whether the *reader's* comprehension score is also per story is **UNVERIFIED**.
- **Light boxes** get a point plus a rival position only. They can be deepened later, at a reader's request or by the author.
- **Only boxes a stranger can judge from their own experience are included:** Problem, Customer, Value proposition, Solution, Current alternatives. Channels, Revenue and Costs are left out because readers can't judge them without inside knowledge.

These pieces from problem-submit are reused as **definitions, not procedure** (the skill inlines them and does not call problem-submit):
- private drafts outside every repository
- complete rival positions, never negations
- per-claim A/B confirmation that a bare "looks good" does not pass
- paste-into-compose filing from the member's own logged-in session

[FOUNDER DECISION: how many boxes are deep by default, a fixed number (e.g. 2–3) or every box above a risk threshold?]
[FOUNDER DECISION: for members without a canvas, is building the canvas part of this skill, or a separate step before it? The founder noted "most people might not have canvas in which case canvas is the outcome" and reserved it for separate reasoning.]
[FOUNDER DECISION: how the reader asks to deepen a light box, and whether that's in scope for round one.]

## Invariants

- **The story leads within every deep box.** `point_config.lead_count` defaults to 1, so a hand-composed letter renders the first point before its story unless the lead is unmarked. Confirm story-first **in the preview**, never from the toggle's appearance (decisions.md 2026-08-31 [product]).
- **No credential path.** The member files from their own browser session. No agent sign-in, no service-role key, no programmatic write (decisions.md 2026-08-31 [product]).
- **Nothing is filed that the member did not confirm box by box.**

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A long letter (5 boxes, 2–3 of them with stories) spends a stranger's read before it lands | MITIGATE | Only the riskiest boxes go deep; the rest are one point each |
| The reader's comprehension may be scored per letter, not per story, which would lose the per-box separation | MITIGATE | Verify the reader-side score shape before `/architect`; if it's per letter, surface that as a product decision, don't work around it |
| n=1: the misfit may be founder-specific | ACCEPT | The spec's first round is the founder's own canvas; widening waits on a second member |
| Canvas wording is copied into the letter and drifts from `lean-canvas.md` | ACCEPT | A sealed letter is a snapshot by design |

**Non-Goals**
- Do NOT modify `/slava:problem:submit` or `/slava:understanding:create-letter`.
- Do NOT build the canvas view (P611). A letter in canvas order is enough for round one.
- Do NOT add tables, columns or a canvas tag schema.
- Do NOT draft the founder's canvas letter while filing or reviewing this spec.

## Done-When

- [ ] The founder's own canvas is turned into one letter: deep boxes chosen from the riskiest hypotheses, each box confirmed A/B/reworded by the founder.
- [ ] The filed letter, read back in the product, shows each deep box's story before its points, and the default reading question.
- [ ] The letter is sent to one reader, and for each deep box the record shows whether the reader misunderstood it or understood and took a position.
- [ ] The founder states in writing whether the reader's reaction was one he judged worth having, and on which box it landed.

## Alternatives Considered

- **One letter per box.** Rejected: readers need five letters to see how the boxes connect, and each spends another read.
- **One letter with a point per box only.** Rejected as the default: it can't tell misunderstanding from disagreement. The founder's objection above is the reason.
- **Keep problem-submit's 3-slot shape pointed at the canvas.** Rejected: it covers only part of the canvas, and it blurs whose problem each slot describes (the founder's story, the customers' problem, the founder's bets about how the world works).
- **Rework problem-submit into this.** Rejected: "help me with a problem" and "understand and judge my bet" measure different things.

## Open Questions

1. Does this change the problem board's premise or P1319's scope? That's for the P1319 session to decide, not this spec.
2. Process lesson for that session: the 2026-09-15 decision read "209 candidates, 0 ticked" as too much volume. "None was something he wanted to post" fits the same zero and was never considered.

## Related

- P1319 — weekly problem-board redesign; P1180 — the original `/slava:problem:submit`; P611 (archived) — canvas renderer; P1084 — crux letter, a different letter type.
- decisions.md 2026-05-19 [product] "Clarity Canvas parked pending demand" (recovery signal #2: the founder needs to share his own lean canvas) and "Clarity Canvas is a schema-driven tag-grouped letter view".
- decisions.md 2026-08-31 [product] — paste-into-compose filing, story-leads trap. 2026-08-06 [process] — composite skills don't call sub-skills.
- `docs/hypotheses.md` `H-AbsentCounterparty`; `docs/lean-canvas.md`.
