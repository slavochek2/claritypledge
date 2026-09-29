---
status: week
type: task
rank: 13
workstream: disagreement-pipeline
created_date: '2026-09-29'
tags: [video, summary, pipeline, day]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1373: Every story video gets a summary: promote to prod, `/day` auto-heal, generate at video entry

## Problem

**Situation:** P1357 shipped the summary tool (Gemini writes, Codex checks, founder confirms), but it
works inside one database at a time, and nothing calls it. The Ikigai 1 run published 21 stories on
6 videos with no summary. The six were then made and reviewed on test (2026-09-29).
**Complication:** Getting them to prod means regenerating on prod: new Gemini text the founder never
reviewed, tokens spent twice, and one keychain dialog per command (6 videos × draft/check/confirm
≥ 18 dialogs).
**Question:** How does every story video get a reviewed summary on prod, with one founder review and
no regeneration?

> Founder, verbatim: "werid to genreate summary again and agian for prod? why? is it normal?" ·
> "not sure how to make sure that all youtu be vidoes get summary from now on" · agreed to "doing it
> the momemnt video enters" · "sure yes wire in /day -btw it shoudl auto heal if psosible" · "i suggest
> for token saving to genreate these summaries with gemini"

## Appetite

Blast radius: medium (writes public rows on prod; one tool + one skill). Reversibility: high
(`demote`). Decision density: low; decisions above.

## Solution

1. **`promote <id…>`** in `scripts/video-summary.mjs`: copy confirmed test rows (content,
   `transcript_sha256`, `written_by`, `checked_by`, `checked_at`) to prod in one process, with one
   keychain read. Nothing is regenerated. A test row that is not `confirmed` is refused.
2. **`/day` auto-heal:** list story videos on prod with no confirmed summary; for each, draft + check on
   test (≤ 3 revise rounds), then show the founder the ready summaries; on a yes, confirm + promote.
   Failures after 3 rounds are listed, never hidden.
3. **At video entry:** the disagreement pipeline runs the same draft → check → yes → promote before
   publishing (the founder's "one of the last steps").
4. **P1358 R2a** named-speaker attribution, left open by P1357: on pipeline videos a claim names a
   person only from speaker-labelled, Step-2c-confirmed turns.

Writer stays Gemini (cheap lane). Checker stays a different vendor (Codex); it caught 4 of 6 first
drafts overstating the transcript on 2026-09-29.

## Invariants

- A reader only ever sees a `confirmed` row, and every confirmed row carries a writer and a different
  checker (decisions.md 2026-09-22, P1349).
- The text on prod is byte-identical to the text the founder approved.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Test row's caption store missing when promoting | MITIGATE | promote copies `transcript_sha256` from the row; the store is only needed to re-check |
| `/day` spends tokens on videos nobody reads | ACCEPT | Gemini flash is the cheap lane; one summary per video, ever |
| R2a needs diarized turns non-pipeline videos lack | ACCEPT | Those videos stay unattributed by default (P1358 R2a text) |

**Non-Goals**
- Do NOT auto-confirm anything; the founder's yes stays the gate.
- Do NOT change the page or its RLS.

## Done-When

- [ ] `promote` puts the six Ikigai 1 summaries on prod with one keychain dialog; prod rows read back byte-identical to test, and "Read video summary" shows under each video on claritypledge.com
- [ ] `promote` refuses a non-confirmed test row (test)
- [ ] `/day` lists story videos without a summary and auto-drafts + checks them, then asks for a yes
- [ ] The disagreement pipeline runs draft → check → yes → promote before publish
- [ ] R2a: on a pipeline video every person-attributed claim traces to a confirmed turn — verified on test
- [ ] Adversarial review by Opus and Codex; `<received> of 2` reported

## Related

- [P1357](done/2026-06-10/p1357_video_summary_generator_pipeline.md) · [P1349](done/2026-06-10/p1349_full_video_summary_page.md)