---
status: backlog
type: comment
rank: 303
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [disagreement-pipeline, evidence, sources, agents]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1350: Evidence for an arguer from more than one source, and arguers with no video at all

## Problem

**Situation:** The Disagreement Pipeline takes **one video per arguer per event** (reconfirmed by
the founder 2026-09-22). Every quote carries a timecode into that video, every story embeds that
video's player, and each position on a point is labelled `close | derived | stretch` from that
video's verified quotes alone (`positions.md` Step 4).

**Complication:** The topic structure agreed on 2026-09-22 for Clarity Nights is *a current AI voice
plus an older, unresolved tension* (e.g. meaning: Crawford vs Watts, Storr vs Mogi, Frankl). That
brings in thinkers who never spoke about AI, so most of their positions on AI statements land as
`derived` or `stretch` from one video, when their books would support a firmer reading. It also
brings in thinkers with **no own-voice English video at all** — Socrates, Epicurus, Nietzsche,
Schopenhauer, Confucius; Camus and Sartre exist only in French — who cannot enter the pipeline as
built.

**Question:** Should an arguer's positions (and possibly quotes) draw on several sources — books,
articles, more than one video — and can a thinker with no video be an arguer? If so, what does a
story look like without a single player?

> Founder, verbatim: *"When we predict their positions, maybe we should consider multiple sources,
> not just one video… if we are thinking Socrates, there is no video of him, but we still can
> predict something. How do we go about that?… what happens to our disagreement pipeline, which was
> built so far on YouTube and linking YouTube specifically? What can it look like, link like multiple
> sources, but not only YouTube?"*

> And on timing: *"not for this run — record as spec nevertheless in backlog for future to not lose
> the idea."*

## Appetite

Blast radius: high — it changes the evidence model every downstream stage and the story page rest
on. Reversibility: medium — a new source type can be kept behind the existing video path. Decision
density: several founder calls (below).

## Invariants

- Every claim shown to a reader must trace to something the named person actually said or wrote,
  checkable by the reader — the promise the one-video design exists to keep.
- A verbatim quote stays in its original language; any translation is marked as a translation,
  never presented as the speaker's words (founder decision 2026-08-25, `select.md` "Do NOT mix
  languages").

## Approach

Investigate, then decide, before building anything:

1. Separate the two uses of a second source: **(a)** sharpening the *position* (inference only,
   nothing new shown) vs **(b)** adding *quotes* from a non-video source (a book page, an article).
   (a) changes only how positions are labelled; (b) changes the story page.
2. For (b), what is the citation unit instead of a timecode (edition + page, URL + anchor), and how
   is a quote re-verified mechanically the way `grep -F` against a transcript does today?
3. How a story renders when its arguer has no player (text-only card, a "no recording exists"
   state), and whether the stake/event pages tolerate it.
4. Whether one arguer may carry several videos across events while each event still shows one.

[FOUNDER DECISION: may a position be firmed up by sources the reader cannot see on the page?]
[FOUNDER DECISION: may a thinker with no recording be an arguer, and if so, how is that shown?]

## Research Questions

1. Which positions from the event #2 run (2026-09-29) ended up `stretch` only because the single
   video did not cover the ground? That count is the size of the problem.
2. Can a book quote be verified with the same determinism as a transcript quote (public-domain
   texts: Gutenberg; in-copyright: short quotes with page citation)?
3. What does the story page need to change to show a non-video source?

## Decision Criteria

1. **Build (a) only** if the event #2 run shows ≥ 1 in 3 positions per classic thinker labelled
   `stretch` for lack of coverage, and a room feedback signal says the positions felt unfair.
2. **Build (b)** only if a thinker the founder wants for a planned topic has no own-voice video, and
   a book quote can be re-verified mechanically (RQ2 answered yes).
3. Otherwise keep one video per arguer and close this spec as `not now`, citing the count.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Positions sourced from books the reader can't see become uncheckable claims about real people | MITIGATE | Invariant 1; decision criterion 1 requires a founder call first |
| No-video arguers make stories feel like invented speeches | DEFER | Needs the second founder decision and a render design |

**Non-Goals**
- Do NOT change the one-video-per-arguer rule for event #2 (2026-09-29).
- Do NOT add non-English sources here — that is the separate language question (English only for
  now, founder 2026-09-22).

## Done-When

- [ ] Research questions 1–3 answered with evidence, in this spec
- [ ] Both founder decisions recorded in this spec
- [ ] A verdict against the decision criteria: build (a), build (b), or close as `not now`

## Related

- [p1096](done/2026-06-10/p1096_public_multisource_point_pipeline.md) — the pipeline's origin ("multisource" there means public material, not several sources per arguer)
- [p1349](p1349_full_video_summary_page.md) — per-video summary page; a non-video source would need an equivalent
- [p1166](p1166_topic_sourcing_from_interest_corpora.md) — topic sourcing that produces the "AI + older thinkers" topics
