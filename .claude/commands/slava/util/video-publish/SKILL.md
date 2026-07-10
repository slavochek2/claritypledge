---
name: video-publish
description: One-command orchestrator that takes a raw talk recording all the way to a published YouTube video — chains /video-edit-simple → /video-brand-pass → ingest → /video-slide-overlay → /gen-thumbnail → /youtube-upload. Runs autonomously between two human gates: (1) what-to-cut, (2) final-watch before upload. Does NOT reimplement the stages; it invokes each one as-is.
when_to_use: A raw single-take talk/interview recording that should become a fully-branded, public ClarityPledge YouTube video in one pass. "publish this talk", "take this recording all the way to YouTube". Use the individual skills instead when you only want one stage (just trim, just a thumbnail, re-upload).
version: 1.0.0
---

# /video-publish

The end-to-end conductor for the video pipeline. It does not contain pipeline logic — it **runs the existing skills in order** and carries their files across the ingest boundary. Each stage's own SKILL.md is the source of truth for that stage; this skill only sequences them and enforces where the human is asked.

**Canonical pipeline:** [docs/video-process.md](../../../../../docs/video-process.md). Read it if any stage's I/O is unclear — this orchestrator assumes that doc's two-lane model (EDIT `~/video-edits/` → ingest → PUBLISH `~/video-library/{slug}/`).

**Reuse, don't reimplement.** Every command below is copied from the stage skill it belongs to. If a stage skill changes its interface, fix it there and update the one line here — never fork its logic into this file.

---

## The two human gates (the ONLY stops)

Founder instruction (2026-06-25): "I don't want to review anything manually." This skill honors that by collapsing every unavoidable human decision into exactly two gates and running fully autonomously between and after them.

- **Gate 1 — Kickoff + what-to-cut.** The one place meaning-judgment is unavoidable: which footage to cut (no tool detects a fluent-but-bad take) and the founder-only inputs (talk title). Collected together, once.
- **Gate 2 — Final-watch.** The assembled, branded, slide-overlaid video opens for one watch before it goes public. Approve → it uploads. This is the last reversible moment (an unlisted→public flip is cheap; a bad public upload is not).

Everything else — transcribe, cut, normalize, render cards, composite, ingest, slide-align (vision-verified), thumbnail, draft metadata — happens with no ask.

---

## Inputs gathered at Gate 1 (ask all at once, then go quiet)

Present the decision sheet from `/video-edit-simple` Step 3 **plus** these, in a single message:

1. **Source video path** — the raw recording (auto-detect the most recent large `*.mp4` if obvious; confirm it).
2. **Slug** — `{descriptive-title}-{month-year}`. Propose one from the title; confirm.
3. **Talk title** — `[FOUNDER DECISION]`. Wrap one word in `*asterisks*` for the Playfair italic (brand intro card + seeds the YouTube title). Never invent it.
4. **Slide deck?** — was this presented from `claritypledge.com/presi2`? If yes, slide-overlay runs; if no, it's skipped. (Default: ask; don't assume.)
5. The `/video-edit-simple` decision sheet: **start cut · end cut · glitch zones · silence handling · content cuts.**

Get answers, then run Stages 1→6 without further questions until Gate 2.

---

## Stage 1 — Trim & normalize  (`/video-edit-simple`, EDIT lane)

Run that skill's workflow with the Gate-1 answers. Probe → extract audio → transcribe (`mlx_whisper`) → apply the confirmed cuts → loudness-normalize.

**Output:** `~/video-edits/final.mp4` + `audio.srt` (the whisper SRT, named after its audio input) + the condensed readable transcript. ⚠️ `/video-edit-simple` only *shows* the readable markdown inline — it does not persist it. **You must write it to `~/video-edits/transcript-readable.md`** here, or Stage 3's ingest `cp` and slide-overlay's hard-require both fail. Do not delete intermediates yet.

---

## Stage 2 — Brand  (`/video-brand-pass`, EDIT lane)

Wrap the trim output in ClarityPledge branding using the Gate-1 title. Brand copy (tagline, outro CTA) is baked into the templates — do not ask for it.

```bash
.claude/commands/slava/util/video-brand-pass/assets/brand.sh \
  --in ~/video-edits/final.mp4 \
  --title "{title from Gate 1}" \
  --offset 6 \
  --out ~/video-edits/final_branded.mp4
```

Pick `--offset` from the talk's opening (default 6) — enough for the hook to land before the bumper drops. **Skip this stage only if Gate 1 explicitly said "no branding"** (internal/raw clip).

---

## Stage 3 — Ingest  (EDIT → PUBLISH boundary)

Copy the chosen video into the named library folder as the canonical `final.mp4`, and carry the transcript under the names the publish lane requires. **Use `cp`, not `mv`** — leaving the EDIT-lane originals in place is what makes a re-run after a later-stage failure possible (cleanup happens once, at the very end).

```bash
SLUG="{slug from Gate 1}"
mkdir -p ~/video-library/$SLUG
cp ~/video-edits/final_branded.mp4        ~/video-library/$SLUG/final.mp4   # branded path
# (no-branding path: cp ~/video-edits/final.mp4 ~/video-library/$SLUG/final.mp4)
cp ~/video-edits/audio.srt                ~/video-library/$SLUG/transcript.srt
cp ~/video-edits/transcript-readable.md   ~/video-library/$SLUG/transcript-readable.md
```

Verify all three landed before continuing (slide-overlay hard-fails without `final.mp4` + `transcript-readable.md`).

**If the recording is a 1:1 interview / demonstration-discovery meeting** (not a talk): run `/analyze-demo-meeting <transcript>` here — it critiques how you ran it (mode-aware), writes the per-person dossier, and files a PII-safe copy of the transcript into `.private/docs/business/`. Publishing continues below independently.

---

## Stage 4 — Slide overlay  (`/video-slide-overlay`, PUBLISH lane) — only if a deck exists

If Gate 1 said there's a deck, run `/video-slide-overlay` **autonomously** (it picks a face-free corner, exports `presi2?plain` PNGs, content-aligns to the transcript, and vision-verifies low-confidence placements — no human gate). It reads `~/video-library/$SLUG/final.mp4` and writes `final-with-slides.mp4`.

**Corner collision watch:** the brand logo bug is fixed **top-right** (brand.sh: `overlay=W-w-MARGIN:MARGIN`). Slide-overlay's corner tie-break is bottom-right → **top-right** → bottom-left → top-left, so top-right is its second pick and the real collision risk. Force slide-overlay to a non-top-right corner and eyeball one composited frame.

If no deck: skip — `final.mp4` is the upload source.

---

## Stage 5 — Thumbnail  (`/gen-thumbnail`, PUBLISH lane)

Run `/gen-thumbnail` autonomously: it derives a hook headline + optional Venn labels from the transcript/metadata, renders the brand card, and vision-self-verifies. Writes `~/video-library/$SLUG/thumbnail.png`. (Attaching it stays manual in Studio unless `thumbnails.set` is wired into the uploader.)

---

## Stage 6 + 7 — Upload  (`/youtube-upload`, PUBLISH lane) with GATE 2 in the middle

Run `/youtube-upload`'s own workflow — **do not call its script directly and do not re-draft metadata yourself.** Calling the raw `.py` skips the stage's guards (pre-flight `SCRIPT_OK`/`SECRETS_OK`, the **phone-verification warning** — unverified accounts are silently capped at 15 min/video — the `metadata.json` schema with `created_at`/`channel_id`, and the Step 4 learning-loop append to `approved-examples.json`). The orchestrator's contract is *reuse, don't reimplement*; honor it here.

Map the uploader's steps onto this skill's flow:

- **Step 0 pre-flight + phone-verification + Step 0b/0c** — run as written (the 15-min cap check is mandatory before any upload).
- **Step 2 draft** — consult `docs/events/series/*.md` canonical copy + the CTA ladder, few-shot from `~/.claude/youtube-style/`; write the full-schema `metadata.json` (`created_at`, `channel_id: UCfFSKMdw43OXcYhy8vfPwJQ`, `privacy: public`).
- **GATE 2 — Final-watch IS the uploader's Step 3 approval.** Before asking, open the assembled video so the watch and the metadata approval are one gate:
  ```bash
  open ~/video-library/$SLUG/$( [ -f ~/video-library/$SLUG/final-with-slides.mp4 ] && echo final-with-slides.mp4 || echo final.mp4 )
  ```
  Show in one message: the video opening, the drafted **title / description / tags**, the **thumbnail.png** (Read it inline), privacy **public**. On approval → upload. On edits → apply, re-open Gate 2; never upload on a half-approval.
- **Upload (Step 4)** — runs via `uv run --script` (the uploader documents this; `python3` → `ModuleNotFoundError: google`), then appends the learning-loop entry. The uploader prefers `final-with-slides.mp4` → `final.mp4` (this chain never produces a `talk_FINAL.mp4`, so that top preference is inert here — the fall-through is correct).

**Report the `youtu.be/{id}` from `upload-receipt.json` only after confirming the call succeeded** (epistemic gate 5) — read the receipt, don't infer success.

---

## Final report

```
✓ Published: https://youtu.be/{id}   (public)
  Library:   ~/video-library/{slug}/
  Stages:    trim ✓  brand {✓|skipped}  slides {✓|no-deck}  thumbnail ✓  upload ✓
  Manual leftover: attach thumbnail.png in YouTube Studio (thumbnails.set not wired).
```

Then offer cleanup: delete EDIT-lane intermediates (`~/video-edits/cut.mp4`, `audio.wav`, frames) — ask before touching the source recording.

---

## Honest ceiling

- **Two gates are the floor, not a default that can be removed.** What-to-cut is a meaning judgment no tool makes; final-watch is the last reversible checkpoint before a public post. Removing either trades correctness for autonomy — out of scope.
- **This skill sequences; it does not improve any stage.** A weak hook, a wrong cut, an off-brand thumbnail are fixed in the owning stage skill, not here.
- **A stage failure stops the chain.** On any non-zero exit, report which stage failed with its output and stop — do not limp forward with a half-built video (Transparency principle). Re-run resumes from the failed stage *forward*: ingest uses `cp` (Stage 3), so the EDIT-lane originals (`final_branded.mp4`, `audio.srt`, `transcript-readable.md`) survive a later failure and the library copies are re-derivable. Don't re-run earlier stages — re-transcribing or re-cutting throws away the human Gate-1 decisions.
- **Branding + slides ordering** is the one place the canonical sequence matters: this skill brands *before* ingest, so slides overlay onto an already-branded `final.mp4`. That matches video-process.md's corner-collision note; if you ever need slides-then-brand, that's the manual sequence in that doc, not this skill.
```
