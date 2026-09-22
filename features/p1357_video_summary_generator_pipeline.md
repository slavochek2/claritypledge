---
status: week
type: task
rank: 10
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [video, summary, pipeline, disagreement-pipeline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1357: Generate, check and confirm video summaries (the writer for P1349)

## Problem

**Situation:** [P1349](done/2026-06-10/p1349_full_video_summary_page.md) shipped the `video_summaries`
table, the `/video/:id` page and the "Read video summary" link. The link appears only for a row with
`status = 'confirmed'`, and only the service role can write rows.

**Complication:** Nothing writes rows. Until something does, P1349 delivers nothing to any reader. The
founder already has a working generator in a private project (read-first): captions → Gemini → `tldr`,
`summary`, `key_points`, `moments`. On 2026-09-22 one of its summaries was hand-checked against its
transcript and every timestamp and claim held, so the source logic is usable. But it emits 6 key points
(P1349 decided 3), a `worth_reading` opinion P1349 dropped, and it has no checker and no confirm step.

> Founder, verbatim (P1349): "for each embedded video have such a page similar like read first" ·
> "i need it myself if i would be participant, i cant watch so many videos."
> Founder, 2026-09-22: "but you can resue stuff from readfirst?"

**Question:** What operator tool turns a YouTube video id into a confirmed `video_summaries` row, with
the writer, an independent checker and the operator each doing their own step?

## Appetite

- **Blast radius:** medium. It writes the most-trusted, least-read text on the site, about named real
  people. The P1349 table rules (RLS confirmed-only, writer ≠ checker, 11-char ids, non-blank text)
  already bound what it can publish.
- **Reversibility:** high. The tool is additive; a bad row is demoted to `draft` by UPDATE.
- **Decision density:** low. Shape, key-point count and the copyright rule are decided in P1349.

## Invariants

- **Nothing reaches `confirmed` without all three steps**, in order: a writer produced it, a checker
  that is not the writer passed it against the retained transcript, and the operator confirmed it.
  The tool never sets `confirmed` on its own. (P1349 invariant; DB CHECKs enforce writer ≠ checker.)
- **The checker reads the same caption bytes the writer read.** Captions come from the `yt` store
  (P1140), never a second fresh fetch, which was measured to return different text for the same video.
- **Test is the default target; prod only when named explicitly** with the prod service key via the
  per-access lock (never a plaintext copy).
- **P1349's copyright rule binds the writer prompt:** own words, never a transcript; quotes at most one
  line, credited and timestamped; no claims the speaker did not make.

## Solution

An operator command-line tool in `scripts/` with three steps, one row per video:

1. **draft `<video>`** — fetch metadata and captions through `yt` (store-backed), write a neutral
   whole-video summary with Gemini in P1349's shape: `tldr`, `summary` prose, **exactly 3 key points**
   (≤ ~12 words each), `moments` as `{t: seconds, note}`. Prompt adapted from read-first, minus
   `worth_reading`, plus the copyright rule. Validate the output (moments inside the duration, 3 points,
   non-blank) before writing. Upsert as `draft`; refuse to overwrite a `checked` or `confirmed` row
   unless told to.
2. **check `<video>`** — a model from a different vendor than the writer verifies every moment against
   the caption text at that time, and every claim and named person in the summary against the
   transcript. Mechanical checks too: each `t` is within the duration and falls near a caption cue.
   All pass → `checked`, with the checker named. Any fail → stays `draft`, with the failures printed.
3. **confirm `<video>`** — for the operator. Shows the summary and the checker's report, and sets
   `confirmed` only on an explicit yes for that video id.

Plus **list** (rows and their status) and **demote `<video>`** (back to `draft`, for corrections and
takedown requests; P1349's rule: "Corrected or removed promptly when the creator or a named person asks").

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Model invents a claim or misattributes a speaker | MITIGATE | Independent checker against the transcript; operator confirm; demote for corrections |
| Auto-captions have no speaker labels, so multi-speaker attribution is unverifiable from captions | MITIGATE | Checker fails a summary that attributes to a person the transcript cannot place; the operator sees it |
| Captions unavailable or walled | ACCEPT | `yt` handles walls; exit 7 is surfaced to the founder, never retried or paid for |
| Long videos exceed a prompt budget | ACCEPT | Current Gemini context windows fit multi-hour captions; revisit if a real video fails |
| Copyright on long summaries | MITIGATE | P1349 rule in the prompt + legal pages already shipped; lawyer check still recommended (P1349) |

**Non-Goals**
- Do NOT change the P1349 page, link, table or RLS.
- Do NOT generate summaries automatically for every story video; the operator runs the tool per video.
- Do NOT add an in-app admin UI.
- Do NOT depend on the private read-first repo at runtime; port the logic, nothing private.

## Done-When

- [ ] `draft` on a real story video writes a `draft` row with exactly 3 key points and in-range moments — verified on test by reading the row
- [ ] `check` passes a faithful summary to `checked` (checker named, different vendor from the writer) — verified on test
- [ ] `check` refuses a deliberately corrupted summary (a moment moved to the wrong minute, one invented claim) and it stays `draft` with the failures printed — verified on test
- [ ] `confirm` sets `confirmed` only after an explicit yes for that id, and the "Read video summary" link then appears under that video in the browser — verified on test
- [ ] `demote` returns a row to `draft` and the link disappears — verified on test
- [ ] Prod target refused unless named explicitly; no prod write happens in this spec's verification
- [ ] Adversarial review by Opus and Codex (Sol) on the diff: every finding verified, real ones fixed; `<received> of 2` reported

## Related

- [P1349](done/2026-06-10/p1349_full_video_summary_page.md) — the table, page and link this feeds
- [P1140](done/2026-06-10/p1140_transcript_retention_for_quote_reverification.md) · [P1187](done/2026-06-10/p1187_transcript_reuse_is_unenforced.md) — the caption store the checker relies on
