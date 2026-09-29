---
status: week
type: task
rank: 13
workstream: disagreement-pipeline
created_date: '2026-09-29'
tags: [video, summary, pipeline, day]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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
4. **P1358 R2a** named-speaker attribution — moved to [P1375](p1375_video_summary_named_speaker_attribution.md).

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

- [x] `promote` puts the six Ikigai 1 summaries on prod with one keychain dialog per run; prod rows read back byte-identical to test — 2026-09-30: 5 on the first run, Watts after the stale-connection retry fix; an anon read of prod returns all six `confirmed`. `[post-deploy]` founder confirms the "Read video summary" link in the browser (the page reads exactly those confirmed rows)
- [x] `promote` refuses a non-confirmed test row — `promote rf2KFVcKQdQ` (checked on test) exit 1 before any keychain dialog; `promote --env prod …` exit 2; unit tests cover no-fingerprint, own-vendor checker, missing checker
- [x] `/day` lists story videos without a summary and auto-drafts + checks them, then asks for a yes — `heal 5` on real data: 11 public story videos, 6 covered, 5 missing → all 5 checked on test, listed READY; a forced failure (checker store unreachable) exits 1, records a 7-day cooldown, and the next run skips it with exit 0; `day-step.sh check-sync` OK, and fails with `cp.vsum` removed
- [x] The disagreement pipeline runs draft → check → yes before publish, and promotes summaries before the stories reach prod — publish.md Stage 6c, promote-to-prod.md Stage 4b (listed at the gate; non-zero exit stops before Stage 5). Written, not yet exercised by a real run
- [x] R2a named-speaker attribution — moved to its own spec, [P1375](p1375_video_summary_named_speaker_attribution.md)
- [x] Adversarial review by Opus and Codex — three rounds, **2 of 2 received** each time: promote (4 Codex + 2 Opus findings, fixed), heal + wiring (8 Codex + 3 Opus warnings, fixed: summaries before stories and at the gate, verified takedown, batch starvation, cooldown, failed revision, exit code, pagination); Codex's whitespace-only key point finding is in the P1349 migration, not this change, and is recorded, not fixed

## Related

- [P1357](done/2026-06-10/p1357_video_summary_generator_pipeline.md) · [P1349](done/2026-06-10/p1349_full_video_summary_page.md)
