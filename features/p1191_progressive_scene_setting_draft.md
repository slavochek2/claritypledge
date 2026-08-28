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

**Blast radius: low** — additive appends to a new file; no stage's existing output changes.
**Reversibility: high** — delete the file, remove the append block. **Decision density: two** —
whether the assembling skill is new or an extension of an existing blog skill, and whether facts
from non-arguer sources may appear.

## Solution

**1. A per-run draft file, append-only, one section per stage.** Each disagreement stage appends
what it alone knows, in prose a reader could use, at the moment it has it. Nothing is rewritten by
a later stage — appends only, so a stage re-run never destroys an earlier stage's material.

**2. What each stage contributes.** `select` — the fork, why it is contested, who occupies each
position and why they were chosen. `prepare` — the points, why each is load-bearing, and the sealed
prediction. `positions` — the quotes with timecodes and source links. `story-draft` — the narrative
per arguer. `publish` — the live embed URLs and the public feed link.

**3. Assembly is a separate, later step** that reads the accumulated draft plus the published
points and stories and produces the article. It rewrites freely; the accumulated file is raw
material, not a draft article. Route through the existing blog pipeline rather than inventing a
publishing path.

**4. Facts from sources that are not arguers.** The scene-setting half wants material an approved
arguer never said — what a report contained, what a number was. [FOUNDER DECISION: may the draft
carry facts from non-arguer sources, and under what attribution?] The pipeline's standing rule is
that no unapproved person gets an agent, a story, or an imputed position; quoting a *document* is a
different act from imputing a *position*, and the boundary needs stating before anything is written.

## Alternatives Considered

- **Write the article after publishing, from the run file.** The status quo. Rejected by the
  founder as re-deriving context five stages already had.
- **Have the assembling skill read the run file directly, no accumulated draft.** Weaker: the run
  file is a machine contract with sealed blocks, and the reader-facing *reasoning* — why this fork,
  why this point matters — is in the terminal output, not the run file.
- **One stage writes the whole draft at the end.** That is the status quo with extra steps.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Appends bloat every run whether or not an article is wanted | ACCEPT | One text file per run in `.private/`; cost is disk, not attention |
| A stage's append leaks sealed prediction content before it should be public | MITIGATE | The prediction seal is public *after* the event, not before; the assembling step gates on that, not the append |
| Private or unapproved material reaches a public article | MITIGATE | Assembly routes through the existing privacy gate; the accumulated draft lives in `.private/` |
| The article becomes a fifth writer of run-file state | MITIGATE | Separate file, never the run file — the single-writer-per-section rule stays intact |
| Non-arguer facts blur into imputed positions | DEFER | Blocked on the founder decision above |

**Non-Goals**
- Do NOT write to the run file; this is a separate artifact.
- Do NOT publish anything; assembly ends at a draft.
- Do NOT change any stage's existing output, gates, or seals.
- Do NOT give a non-arguer source an agent, a story, or a position.

## Done-When

- [ ] Each of the five disagreement stages appends its section to a per-run draft file
- [ ] Re-running a stage appends without destroying an earlier stage's section
- [ ] Founder decision recorded on non-arguer facts and their attribution
- [ ] One full pipeline run produces a draft containing all five sections
- [ ] The assembling step produces an article draft from that file plus the published embeds, and it passes the privacy gate

## Open Questions

1. Is assembly a new skill or an argument to an existing blog skill? Not resolved — depends on how
   much of the existing blog pipeline applies.
2. Does the article publish before the event (scene-setting) or after (record)? The founder
   describes before; the sealed prediction argues for a second, after-the-fact piece. Both may be
   right, and that is two artifacts, not one.

## Related

- **P1190** — amends `prepare`, whose reasoning output is the richest input to this draft. Land
  P1190 first so this appends the load-bearing justification rather than only the points.
- **P1161** — the Chiang Mai event this article would front.
