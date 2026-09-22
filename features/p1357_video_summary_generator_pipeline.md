---
status: qa
type: task
rank: 10
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [video, summary, pipeline, disagreement-pipeline]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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
- **A summary attributes a claim to a named person ONLY from speaker-labelled turns that passed their
  window's Step 2c oracle** (amended by [P1358](p1358_disagreement_pipeline_attribution_summaries_story_models.md) R2a).
  Otherwise it says "the host" or "a speaker", or drops the claim. On a pipeline video those turns
  already exist; on a video with none, every claim is unattributed by default.

## Solution

An operator command-line tool in `scripts/` with three steps, one row per video:

### Inputs from the pipeline (amended by P1358 R2a — before any code exists)

When the video came through the disagreement pipeline, the tool accepts what that pipeline already
stored and the founder confirmed on 2026-09-28 that the pipeline drives `draft` + `check` for every
approved video:

- **The speaker-labelled turns** (`$DIARIZE_STORE/<id>/<start>s+<dur>s.json`), restricted to windows
  that passed their own Step 2c oracle (P1358 R1b). These retire this spec's unmitigated risk —
  *"auto-captions have no speaker labels, so multi-speaker attribution is unverifiable"* — on pipeline
  videos, and only on those.
- **The clean transcript** from the `yt` store, which both writer and checker read (same bytes,
  P1349's invariant).
- **Where it runs:** after `positions`, one row per **video** — never per story (P1349: *N stories from
  one video → one URL*). `confirm` stays the operator's, inside publish's dry-run gate, per video id.
- **Models:** writer **Gemini 3.8** via `~/.agents/bin/delegate-gemini`; checker **Sonnet** — a
  different vendor and a different family, which is what this spec's "different vendor" invariant
  already requires. Every `moments` entry carries its timestamp from the confirmed turns, so a claim
  and the second it was said at travel together.

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
   Founder decision 2026-09-22: at the disagreement-pipeline gate the agent shows the full summary
   in chat and, on the founder's explicit yes, runs `confirm --approved-in-chat`; outside that gate
   confirm needs a terminal (no pipe or script).

Plus **list** (rows and their status) and **demote `<video>`** (back to `draft`, for corrections and
takedown requests; P1349's rule: "Corrected or removed promptly when the creator or a named person asks").

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Model invents a claim or misattributes a speaker | MITIGATE | Independent checker against the transcript; operator confirm; demote for corrections |
| Auto-captions have no speaker labels, so multi-speaker attribution is unverifiable from captions | MITIGATE | **On a pipeline video this is retired (P1358 R2a):** attribution comes from speaker-labelled turns whose window passed Step 2c. Off-pipeline it stands — the checker fails a summary that attributes to a person the transcript cannot place, and the operator sees it |
| Captions unavailable or walled | ACCEPT | `yt` handles walls; exit 7 is surfaced to the founder, never retried or paid for |
| Long videos exceed a prompt budget | ACCEPT | Current Gemini context windows fit multi-hour captions; revisit if a real video fails |
| Copyright on long summaries | MITIGATE | P1349 rule in the prompt + legal pages already shipped; lawyer check still recommended (P1349) |

**Non-Goals**
- Do NOT change the P1349 page, link, table or RLS.
- **AMENDED by P1358 R2a (founder, 2026-09-28):** the pipeline DOES run `draft` + `check` for every
  approved video of a run, right after `positions`. What stays the operator's is **`confirm`**, per
  video id, inside publish's dry-run gate. The original Non-Goal read *"do NOT generate summaries
  automatically for every story video; the operator runs the tool per video"* — that is withdrawn for
  pipeline videos and still holds for any video handed to the tool by hand.
- Do NOT add an in-app admin UI.
- Do NOT depend on the private read-first repo at runtime; port the logic, nothing private.

## Done-When

- [x] `draft` on a real story video writes a `draft` row with exactly 3 key points and in-range moments — 2026-09-22 on test, video `rf2KFVcKQdQ` (94-min two-person interview): row read back — 3 key points, 8 moments inside 1:33:55, `written_by: gemini:gemini-3.8-flash` (served model verified)
- [x] `check` passes a faithful summary to `checked` (checker named, different vendor from the writer) — 2026-09-22 on test, video `rf2KFVcKQdQ` (94-min two-person interview): `checked_by: codex:gpt-5.6-sol`, 15/15 items; same verdict on a repeat run. It took two `--revise` rounds: the first drafts said Leahy *founded* EleutherAI (transcript: *led*) and invented a bioweapons example — both caught
- [x] `check` refuses a deliberately corrupted summary (a moment moved to the wrong minute, one invented claim) and it stays `draft` with the failures printed — 2026-09-22 on test, video `rf2KFVcKQdQ` (94-min two-person interview): moved moment → `moment-3` fail; invented White House claim → `para-4` fail ("The transcript never says Leahy advised the White House…"); row stayed `draft`
- [x] `confirm` sets `confirmed` only after an explicit yes for that id, and the "Read video summary" link then appears under that video in the browser — 2026-09-22 on test, video `rf2KFVcKQdQ` (94-min two-person interview): answering `yes` → "not confirmed — nothing changed"; typing the id → `confirmed`; feed then showed `/video/rf2KFVcKQdQ` and the page rendered at 375px
- [x] `demote` returns a row to `draft` and the link disappears — 2026-09-22 on test, video `rf2KFVcKQdQ` (94-min two-person interview): after demote the feed showed the video's player and 0 summary links
- [x] Prod target refused unless named explicitly; no prod write happens in this spec's verification — default target printed `[test]`; `--env staging` / bare `--env` exit 2; a test config pointing at the prod project is refused. `--env prod` itself was not run (it would raise the keychain dialog and write prod)
- [ ] **A pipeline video's summary attributes nothing outside confirmed turns** (P1358 R2a): every
      person-attributed claim traces to a speaker-labelled turn from a window that passed Step 2c, and a
      claim with no such turn reads "the host" / "a speaker" or is absent — verified on test by reading
      the row against the turns
- [x] Adversarial review by Opus and Codex (Sol) on the diff: every finding verified, real ones fixed; `<received> of 2` reported — **2 of 2 received** (Opus: 3 HIGH / 5 MEDIUM; Codex Sol at high effort: 7 HIGH / 3 MEDIUM, verdict REJECT). Overlapping HIGHs (checker-output fallback to an object planted in the captions, duplicate ids erasing a fail, store not bound to env/row, `checked` not bound to content) and Codex-only ones (VTT `NOTE`/cue-id text read as speech, checker inheriting a service key, ignored subprocess failure, stale draft overwriting a confirmed row, loose args) were each re-run against the code before fixing; fixes in `63de5d3f6` and the following commit, each with a test that fails on the old code where one could be built. Residual, accepted: the read-only Codex sandbox can still *read* local files — with a scrubbed env, no network and output kept local, an injected read cannot leave the machine; `checked_by` is the requested model (`ask-model` reports Codex as `accepted-only`). Post-fix live run: first draft again said Leahy *founded* EleutherAI plus two unsupported claims → caught → one `--revise` → 17/17 `checked`

## Related

- [P1349](done/2026-06-10/p1349_full_video_summary_page.md) — the table, page and link this feeds
- [P1140](done/2026-06-10/p1140_transcript_retention_for_quote_reverification.md) · [P1187](done/2026-06-10/p1187_transcript_reuse_is_unenforced.md) — the caption store the checker relies on
