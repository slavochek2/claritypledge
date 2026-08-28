---
status: backlog
type: task
rank: 251
workstream: infrastructure
created_date: '2026-08-28'
tags: [disagreement, content, blog, events]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1191: The scene-setting article is rebuilt from scratch after the pipeline has already thrown its material away

## Problem

**Situation:** The disagreement pipeline runs five stages and each one produces material a reader
would want: the fork and why it is contested, who argues what and the quotes that show it, the
predicted split, the reasoning behind each point. Today all of it lands in a run file written for
machines and downstream skills, and the terminal output is discarded when the session ends.

**Complication:** The founder intends to publish a scene-setting article on Ghost before announcing
the event, using the existing point and story embeds, so attendees arrive having read the frame and
seen the positions. Written today, that article is a from-scratch job at the end — re-deriving
context that five stages already produced and then dropped.

**Question:** Should each pipeline stage append its own material to a growing draft, so the article
is nearly assembled by the time the points are published?

> Founder framing, verbatim: *"at every stage, at the end of this stage, when I say approved and we
> move on, approved and move on, and then maybe it enhances the article, right? ... The draft is
> always enhanced, enhanced, enhanced. And so I don't need to say at the end, oh, go back and do
> it."*

> On what the article is for, verbatim: *"a blog article to set the scene ... And then we say in the
> event description we will discuss this blog article ... people read it and then they know what
> they come about and what they discuss."*

## Appetite

**Blast radius: low for stage 1** (one stage writes two extra lines). **Medium for stage 2** — five skill files, each carrying pipeline STOPs, is not low.
**Reversibility: high** — delete the file, remove the append block. **Decision density: two** —
whether the assembling skill is new or an extension of an existing blog skill, and whether facts
from non-arguer sources may appear.

## Solution

**Corrected premise first — the original rejection reasoning was false.** This spec rejected the
cheap option ("assembly reads the run file directly") on the grounds that the reader-facing
reasoning lives in terminal output, not the run file. That is wrong.
`grep -c "agree_commits_to\|disagree_commits_to\|phase_0_note\|judge_dissent\|position_statement"`
on the live run file returns **18**. Every category this spec claimed was missing is present, in
prose: `phase_0_note` (why this fork), `position_statement` and `claim` (who argues what),
`judge_dissent` (why this set), `inference_chains`, `agree_commits_to` / `disagree_commits_to`
(why the point matters). Four of the five stages' proposed contributions already exist there.

**So the scope collapses. Ship stage 1; stage 2 only if stage 1 proves insufficient.**

### Stage 1 — the minimum that closes the real gap

1. **`publish` writes the live embed URLs and the public feed link back to the run file.** This is
   the one contribution genuinely absent from it, and it is one stage touched, not five.
2. **Assembly is `/prepare-blog`, not a new skill.** Open Question 1 is answerable by reading the
   file: `prepare-blog` shapes rough material into a post and already reads raw-material
   directories, with a mode for shaping an external long document. Entry is `/quick-blog` for the
   A-number and the `content/articles/` path that `privacy-watched-paths.sh` depends on. The real
   pipeline is `quick-blog → prepare-blog → story-gate → draft-blog → ship-blog → promote-blog` —
   **six blog skills, verified by `ls`** (this spec previously said four; the review said eight;
   both were wrong).

### Stage 2 — the accumulating draft, only if stage 1 is not enough

If the run file plus the feed turns out to under-serve the article, add the per-run draft — with
the discipline the run file already has and this spec originally lacked:

3. **Named, replaceable blocks, one owner per stage** — the same single-writer rule as the run
   file, with literal end-markers. **"Append-only" was not a safety property**: `prepare.md` treats
   re-runs as a designed path, so an append-only draft accumulates a *second* prepare section
   carrying superseded points and a superseded predicted split, with nothing saying which wins. A
   re-run replaces its own block and leaves every other block byte-identical.
4. **Append only at founder-gated stages.** `positions` and `story-draft` have mechanical asserts
   and no human gate, so for 2 of 5 stages the "when I say approved" trigger this spec is built on
   does not exist. Either those two do not append, or the assembling step carries their review
   explicitly — per quote, not per article.
5. **A failed append is a warning, never a STOP.** Pipeline integrity must never depend on a
   cosmetic artifact existing.

## The prediction never enters. Any stage, any paraphrase.

`run-pipeline.md:51` states the prediction "is written, **never shown to a later pass**." The
assembling step is a later pass, and so is the founder reading a draft.

Worse, the article's whole purpose is to be read by the room *before* they take positions.
[decisions.md](../docs/decisions.md) 2026-08-13 [product] "The sealed-bid guarantee is load-bearing" is a standing founder ruling on exactly that: *"an anon-readable prediction is
a defect, not a nicety … A reader who sees the prediction first is anchored by it, so their rating
stops being an independent measurement … A falsified prediction is a result; a prediction the
reader already saw is not a measurement at all."*

Publishing the predicted split to the room does not weaken the calibration signal — **it removes
it**, while every seal still verifies green. The original spec listed "the sealed prediction" as
`prepare`'s contribution. Struck.

## Alternatives Considered

- **Write the article after publishing, from the run file.** The status quo. Rejected by the
  founder as re-deriving context five stages already had.
- **Have the assembling skill read the run file directly, no accumulated draft.** **Now the
  recommended path** — the rejection above was based on a false claim about the run file's contents,
  corrected in the Solution. Its sealed blocks are read-only to a reader; nothing stops assembly
  reading the rest.
- **One stage writes the whole draft at the end.** That is the status quo with extra steps.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Appends bloat every run whether or not an article is wanted | ACCEPT | One text file per run in `.private/`; cost is disk, not attention |
| The predicted split reaches the room before they answer | MITIGATE | Prediction content never leaves `.private/points-runs/<slug>.md`, in any paraphrase. The *hash* being public is the design (it is committed before the points are shown); the **content** is the risk. `grep -rn "after the event"` returns no matches — the original mitigation named a policy that does not exist |
| Private or critical material about named living people reaches a public article | MITIGATE | **Not the automated gate** — `audit-privacy.sh` matches only founder identifiers, a path and a canary, and `.claude/rules/pii.md` says outright that a green gate is not evidence. Worse, **no blog skill invokes it at all** (verified: only `create-letter-from-transcript` and `sifter-story` mention privacy), and `/ship-blog` publishes via the Ghost API without the repo being pushed. The control is a **named human gate**: founder reads and approves every named person and every quote before Ghost. `judge_dissent` and `positions_set_aside` go on an explicit never-append list — they hold critical characterizations of named living people and a record of who was rejected and why, written for internal QA |
| A second progressive artifact with five writers and no owner | MITIGATE | The run file's own rule is untouched, but that is not evidence the new file is safe — it needs its own equivalent. Stage 2 item 3 supplies it |
| Non-arguer facts blur into imputed positions | MITIGATE | The boundary is already settled law — `prepare.md:200`: *"You may quote what someone wrote or said and reason about what it commits them to, with the chain shown. You may not state what they believe, would answer, or would vote."* Two ways it still breaks: **placement is imputation** in a position-indexed artifact (filing a document under a position assigns its author a stance), and **a document has no Gate 0 and no transcript seal**, so it sits in the same typographic register as `grep -F`-verified quotes at strictly weaker provenance |

**Non-Goals**
- Do NOT write to the run file; this is a separate artifact.
- Do NOT publish anything; assembly ends at a draft.
- Do NOT change any stage's existing output, gates, or seals.
- Do NOT give a non-arguer source an agent, a story, or a position.

## Done-When

**Stage 1**
- [ ] `publish` writes the live embed URLs and the public feed link back to the run file
- [ ] `/prepare-blog`, entered via `/quick-blog`, produces an article draft from the run file plus the published embeds — no new skill written
- [ ] The draft contains **no prediction content**, verified by grep against the prediction block's own terms
- [ ] Founder read-and-approved every named person and every quote before Ghost, recorded — not delegated to `audit-privacy.sh`
- [ ] Founder decision recorded on what provenance record a non-arguer fact must carry

**Stage 2 — only if stage 1 proves insufficient, and that insufficiency is written down first**
- [ ] Each appending stage owns one named block with a literal end-marker; a re-run replaces its own block and leaves every other block byte-identical
- [ ] `positions` and `story-draft` either do not append, or the assembling step carries their per-quote review
- [ ] A failed append emits a warning and never halts the pipeline

## Open Questions

1. ~~Is assembly a new skill?~~ **Resolved by reading the files: no.** It is `/prepare-blog`,
   entered via `/quick-blog`. Six blog skills already exist.
2. **Promoted into the Solution, because the prediction rule depends on it.** Before-the-event and
   after-the-event are **two artifacts**: the scene-setter carries the fork, the people and the
   points and *no prediction*; a second, after-the-fact piece may carry the prediction against what
   the room actually did, which is the only context in which publishing it is a result rather than
   an anchor.
3. Does stage 1 actually under-serve the article? Unknown until one is written. Stage 2 is not
   built until this is answered from a real attempt.

## Related

- **P1190** — amends `prepare`, whose reasoning output is the richest input to this draft. Land
  P1190 first so this appends the load-bearing justification rather than only the points.
- **P1161** — the Chiang Mai event this article would front.
