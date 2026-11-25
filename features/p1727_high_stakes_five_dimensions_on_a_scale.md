---
status: backlog
type: task
rank: 330
workstream: strategy
created_date: '2026-11-25'
tags: [high-stakes, definitions, arbiter-failure, clarify]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1727: High stakes becomes five dimensions on a scale

## Problem

**Situation:** "High stakes" is defined in `docs/definitions.md` §High Stakes and modelled in
`docs/arbiter-failure-model.md` (2026-11-18 [product]): an entry condition (success depends on shared
understanding) plus failure modes, each a yes/no filter: fuzzy intent, delayed feedback, concentrated
consequences, irreversible, explanatory divergence. The same terms are printed by two skills (and their
`.agents/skills/` copies), compiled into the live Clarify prompt, and used in three draft articles, the lean
canvas and hypotheses.

**Complication:** on 2026-11-24, building demo film 4.7, the founder changed the model:

> "it's a scale, it's dimension … when the threshold is met … it's high stake"
> "just delete concentrated consequences … No cheap trial is the same as delayed feedback."

The film already shows the new model (a card with five bars: Fuzzy intent, Delayed feedback, Serious damage,
Irreversible, Explanatory divergence). The repo still says the old one, so the film and the docs disagree.

**Question:** rewrite the live definition and every live consumer to the new model, in one pass, without
rewriting the historical record.

## Appetite

Blast radius: medium. Docs and skills are text, but the Clarify prompt is generated from `prepare.md` and runs in
prod once `clarify-draft` is deployed. Reversibility: high (git revert, one function redeploy). Decision density:
a few founder calls (below).

## Solution

1. **The model** (`arbiter-failure-model.md`, `definitions.md` §High Stakes, and the sections that couple to it:
   §When the Protocol Applies, §Verification Threshold): keep the entry condition as the heading ("success depends
   on shared understanding"; the founder-approved film card puts it under the title). Replace the modes with **five dimensions, each on a scale**:
   fuzzy intent, delayed feedback, serious damage, irreversible, explanatory divergence. An item is high-stakes when
   the scores together meet a threshold.
   - **Delete `concentrated consequences`.** Its "too costly to try" sense folds into delayed feedback (founder:
     no cheap trial is the same as delayed feedback). Say so where the mode used to be, so an old tag reads
     correctly.
   - **Add `serious damage`:** how much harm a misunderstanding can do.
   - **Replace the "UNTESTED" label on explanatory divergence and irreversible.**
     [FOUNDER DECISION: what label replaces "UNTESTED" on these two dimensions: a different evidence label, or none.]
   - [FOUNDER DECISION: the threshold: a number and how the five scores combine, or left unquantified for now.
     2026-11-24 [product] notes it has neither yet.]
   - [FOUNDER DECISION: what "high-stakes" now names. Today an item that passes the entry condition is
     high-stakes even when no mode fires (`NONE`: the natural outcome will show the misunderstanding); the modes
     only say whether it is worth the instrument. With a threshold, is "high-stakes" the entry condition alone,
     or the entry condition plus scores over the threshold? This decides what `NONE` and "stakes is the gate"
     mean.]
   - [FOUNDER DECISION: what `serious damage` breaks about arbitration (each mode answers that question in the
     model's table), and the falsifiers that replace the two tied to `concentrated consequences`, including
     2026-11-18's `irreversible` falsifier, which folds `irreversible` back into the deleted mode. The
     implementer drafts both; the founder approves.]
   - [FOUNDER DECISION: who judges the scores in a meeting: anyone present, or only the decision owner.
     2026-11-24 [product] asks this spec to answer it.]
2. **Consumers:** the three skills that read the model, `.claude/commands/slava/understanding/detect.md`,
   `.claude/commands/slava/disagreement/prepare.md` and `.claude/commands/slava/problem/submit.md`, use the new
   names; their `.agents/skills/` copies (detect, prepare, submit) are regenerated with
   `scripts/sync-agent-skills.sh`, not hand-edited. No skill prints `concentrated stakes` or `concentrated
   consequences`.
   [FOUNDER DECISION: do the skills keep emitting one tag per item (the dimensions that fire, or `NONE`), or
   score each dimension on the scale? Tags need only the vocabulary change; scores need scale anchors per
   dimension and a new output format, which is a larger spec.]
3. **The Clarify prompt:** rebuild `supabase/functions/clarify-draft/clarify-prompt.generated.ts` with
   `scripts/build-clarify-prompt.mjs` from the edited `prepare.md`, then deploy `clarify-draft`. The Clarify
   Mirror still does not score stakes (2026-11-24 [product]); only the vocabulary it inherits changes.
4. **Other live docs:** `docs/high-stakes-examples.md`, `docs/hypotheses.md`, `docs/lean-canvas.md` (through
   `/slava:maintain:docs-strategy-update`, which owns lean-canvas, hypotheses and definitions).
5. **Draft articles** `content/articles/a29_min-principle.md`, `a54_sanitation-not-eradication.md`,
   `a57_a-pledge-is-not-a-norm.md` (all `status: idea`): use the new names.
6. **A new `docs/decisions.md` entry** recording the change, citing 2026-11-18 and 2026-11-24.

## Invariants

- **The historical record is not rewritten.** Earlier `docs/decisions.md` entries, `features/done/` specs
  (p1026, p1180, p1185) and `features/done/INDEX.md` keep "concentrated stakes/consequences": they record what was
  decided then. The change is recorded by a new entry, not by editing old ones.
- **The Clarify Mirror does not score stakes** (2026-11-24 [product]). This spec changes words, not that ruling.
- **Classification is joint work with the person whose meeting or decision it is, never our verdict on their
  stakes** (2026-07-29 [product], quoted in `definitions.md`).
- **The P1009 fixtures are not edited.** `scripts/fixtures/p1009/*.md.txt` are a pinned snapshot of the docs as of
  2026-10-13, kept so a later doc edit cannot fail the canary ("Bump only with the anchors",
  `scripts/test-p1009-single-value-canary.sh`).
- A rubric names shapes, never findings: examples stay in `high-stakes-examples.md`, out of the model file
  (2026-11-18 [product] item 6).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The prompt is rebuilt but `clarify-draft` is not deployed, so prod keeps the old words | MITIGATE | Pre-deploy Checklist below |
| A missed consumer keeps printing the deleted term | MITIGATE | Done-When grep over live files |
| Scales without a threshold read as a verdict nobody can compute | ACCEPT | Founder decision above; the docs say the threshold is open until decided |

**Non-Goals**
- Do NOT make the Clarify Mirror score or flag stakes (separate founder session; 2026-11-24 [product] option B is
  held for later).
- Do NOT edit earlier decisions.md entries or done specs (Invariants).
- Do NOT change the demo film; it already shows the new model.

## Done-When

- [ ] `git grep -in "concentrated consequences\|concentrated stakes"` (line-level) returns only lines in
      `docs/decisions.md`, `features/done/`, `scripts/fixtures/p1009/`, this spec, and exactly one line in
      `arbiter-failure-model.md`: the note on how to read the old tag.
- [ ] `definitions.md` §High Stakes and `arbiter-failure-model.md` name the five dimensions, the scale and the
      threshold, and record each founder decision above as decided (or, for the threshold, explicitly open).
- [ ] The three skills use the five names; `scripts/sync-agent-skills.sh` reports the `.agents/skills/` copies in
      sync.
- [ ] `clarify-prompt.generated.ts` is rebuilt by `scripts/build-clarify-prompt.mjs`: its header carries the
      new `prepare.md` hash and the prompt text contains no deleted term. `[post-deploy]` the function deploy
      reports success and a Clarify press on prod still returns a draft.
- [ ] `scripts/test-p1009-single-value-canary.sh` and `./scripts/pre-commit-checks.sh` pass.
- [ ] A new decisions.md entry records the change.

## Pre-deploy Checklist

- [ ] Deploy `clarify-draft` to prod after the prompt rebuild (`/ship-prod` or the function deploy the repo uses).

## Related

- [p1190](p1190_arbiter_filter_into_disagreement_pipeline.md) (open, backlog): the arbiter filter in the
  disagreement pipeline; it uses the modes this spec changes, so whichever lands second updates its wording.
- `docs/decisions.md` 2026-11-18 [product] (the definition this replaces), 2026-11-24 [product] (the Clarify Mirror
  does not score stakes; asks who judges), 2026-07-29 [product] (joint classification).
- Demo film 4.7 (private): the five-bar card is the founder-approved picture of this model.
