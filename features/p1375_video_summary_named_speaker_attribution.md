---
status: week
type: task
rank: 14
workstream: disagreement-pipeline
created_date: '2026-09-30'
tags: [video, summary, attribution, disagreement-pipeline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
intent: cold-start
---

# P1375: A video summary names a speaker only from a confirmed speaker turn (P1358 R2a)

## Problem

*No founder words about attribution in the filing session: this is split out of the P1358 R2a rule
recorded in P1357, unchanged.*

P1357 shipped with its P1358 R2a requirement unticked, and P1373 split it out here. Today the writer
only refuses to guess a speaker (captions carry no speaker labels) and the Codex checker catches
misattribution after the fact. On a two-person interview a claim can still be credited to the wrong
person in a way the checker, reading the same unlabelled captions, cannot settle.

## Appetite

Blast radius: one tool (`scripts/video-summary.mjs`). Reversibility: high. Decision density: low —
the rule is already written in [P1357](done/2026-06-10/p1357_video_summary_generator_pipeline.md) Constraints.

## Solution

On a pipeline video, give the writer and the checker the speaker-labelled turns
(`$DIARIZE_STORE/<id>/…`) from windows that passed Step 2c. A claim credited to a person must trace to
one of those turns; otherwise it reads "the host" / "a speaker", or is dropped. On a video with no
such turns, every claim is unattributed by default.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Unattributed prose reads vaguer on non-pipeline videos | ACCEPT | Wrong attribution is worse than none |

- Do NOT diarize non-pipeline videos here.

## Done-When

- [ ] On a pipeline video on test, every person-attributed claim traces to a confirmed turn — verified by reading the row against the turns
- [ ] A claim with no such turn reads "the host" / "a speaker" or is absent
- [ ] Adversarial review by Opus and Codex; `<received> of 2` reported

## Related

- [P1357](done/2026-06-10/p1357_video_summary_generator_pipeline.md) · [P1373](p1373_video_summaries_promote_autoheal_entry.md)
