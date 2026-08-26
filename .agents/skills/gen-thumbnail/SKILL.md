---
name: gen-thumbnail
description: Render a 1280x720 YouTube thumbnail for a ClarityPledge talk from the brand design system (same Playfair/Inter, tokens, logo, blue as the intro/outro cards). Fully local, headless Chrome → PNG. No external image model. Closes the always-dangling "thumbnail concept saved, nothing wired up" gap.
when_to_use: After a talk is edited/branded and lives in ~/video-library/{slug}/, or right after /youtube-upload (which saves a thumbnail_prompt). "make a thumbnail", "thumbnail for this video".
version: 1.0.0
---

# /gen-thumbnail

Produce a scroll-stopping, on-brand YouTube thumbnail as a single PNG. The card is rendered from the **real design system** (`public/fonts`, `src/index.css` tokens, the logo) as HTML/CSS and screenshotted headless — the same machinery and visual language as `/video-brand-pass`, so the thumbnail, intro, and outro read as one set. No image-gen model, no external dependency, deterministic output.

**Autonomous by default** (founder instruction 2026-06-25: "I don't want to review anything manually"). The agent derives the headline + motif from the talk and renders without a gate. The only stop is a hard failure (missing fonts/logo, Playwright missing, render produced no file).

---

## Prerequisites (already present — verify, don't install)

- **Google Chrome** at `/Applications/Google Chrome.app` (headless via `channel:'chrome'`).
- **playwright-core** at `tools/kanban/node_modules/playwright-core` (repo dep; script auto-locates via `git rev-parse --show-toplevel`).
- **ffmpeg** (brew) — only used to verify the output dimensions.

If Chrome is missing: ask before installing (global install rule).

---

## Step 1: Derive the thumbnail content (agent decides)

A thumbnail is NOT the video title — it's the *hook*, readable at 320px wide. Before writing it, name two things explicitly (one sentence each, not shown to the user unless asked):
- **Who's scrolling past this** — co-founder pairs and founders sizing up a hire/partnership decision, not a general audience. Write the headline to their stake (a bad hire, a misaligned partner, wasted months), not a generic "interesting talk" framing.
- **Which curiosity lever it pulls** — an open loop (states a claim, withholds the resolution), a pattern interrupt (contradicts what the viewer assumes, e.g. "coding is solved" → but), or a specificity spike (a number/quote that couldn't be guessed). Pick one; a headline that tries to do all three usually reads as noise.

Generate:

- **`--headline`** — 3 to 6 words, the emotional core or the surprising claim. Bigger and punchier than the YouTube title. Wrap exactly ONE word in `*stars*` to render it blue-italic (the clarity-flip accent) — pick the word that carries the tension. Examples: `You think you *agree*. You don't.` · `The gap that *splits* co-founders`.
- **`--vleft` / `--vright`** (optional) — the two short labels for the overlapping-circles Venn motif (the house metaphor: two understandings that barely overlap). Use when the talk is about a gap between two parties. Typical: `What I said` / `What you heard`. **Omit both** to drop the motif and let a headline-only layout breathe (use that for talks where a Venn doesn't fit).
- **`--kicker`** — defaults to `ClarityPledge`; override only for a sub-brand.

**Source order:** if `~/video-library/{slug}/metadata.json` exists, read its `thumbnail_prompt` + `title` for intent. Otherwise read `transcript-readable.md`. Translate the *concept* into the headline + labels above — don't paste the prompt verbatim.

---

## Step 2: Render

**For talking-head / interview content, prefer photo mode over the text-only card** (2026-07-16): a real still frame of the actual people, with the headline overlaid on a bottom gradient scrim, reads better for CTR than flat-black typography — faces + expression are the strongest attention lever on YouTube for this content type. Pull 3-4 candidate frames from the edited footage at moments with visible engagement/expression (`ffmpeg -ss <t> -i <video> -frames:v 1 candidate.png`), show them to the founder to pick one, then pass it via `--photo`.

**Never use an image-gen model to depict a real, identifiable person.** Generative models are unreliable at reproducing a specific person's actual likeness — the risk isn't just quality, it's misrepresenting how someone actually looks in a video attached to their name. Use their real footage instead; it's already sitting in the edit and carries no fidelity risk.

```bash
SLUG="{slug}"
~/Projects/public/claritypledge/.claude/commands/slava/util/gen-thumbnail/assets/thumb.sh \
  --slug "$SLUG" \
  --headline "You think you *agree*. You don't." \
  --photo "/path/to/chosen_frame.png"    # omit for the text-only card (non-interview talks)
# → ~/video-library/{slug}/thumbnail.png  (1280x720, written; prints DONE + dims)

# Text-only variant (no photo) still supports the Venn motif:
~/Projects/public/claritypledge/.claude/commands/slava/util/gen-thumbnail/assets/thumb.sh \
  --slug "$SLUG" \
  --headline "You think you *agree*. You don't." \
  --vleft "What I said" \
  --vright "What you heard"
# → ~/video-library/{slug}/thumbnail.png  (1280x720, written; prints DONE + dims)
```

The script stages fonts/logo from the repo, renders headless, and asserts a real PNG of the right size landed (hard-fails otherwise).

---

## Step 3: Self-verify with vision (no user ask), then iterate if weak

`Read` the produced `~/video-library/{slug}/thumbnail.png` and check against this bar:

- **Legible at small size** — the headline must read when mentally shrunk to a sidebar. Too many words → cut.
- **Contrast** — light type on the dark card; the blue accent word pops.
- **No clipping** — headline fits its column, Venn labels sit inside their circles, nothing overflows the frame.
- **Hook, not summary** — does it create curiosity or state the obvious?
- **On-brand** — matches the intro/outro card (it shares their CSS, so this is mostly automatic).

If any check fails, adjust `--headline` length / accent word / labels and re-render. Iterate up to ~3 times on your own judgment. Only surface to the user if you cannot get a clean render after that (state what's wrong).

---

## Step 4: Report

```
✓ Thumbnail: ~/video-library/{slug}/thumbnail.png (1280x720)
  Headline: "{headline}"
  Motif:    Venn ({vleft} / {vright})   |   or: headline-only

Upload note: YouTube thumbnails are set in YouTube Studio (the Data API thumbnails.set
needs a verified channel + extra scope). The PNG is ready to drag into Studio, or wire
thumbnails.set into youtube-upload.py later.
```

---

## Layout contract (assets/)

- `thumb.html` — ids: `kicker`, `headline`, `vleft`, `vright`; `#venn` motif hidden when both labels empty.
- `thumb.css` — STATIC (no entrance animations; this is one screenshot). Tokens/fonts copied from `video-brand-pass/assets/card.css`; keep in sync if brand tokens move.
- `render-thumb.mjs` — injects text by id (HTML-escaped, `*word*`→blue `<em>`), screenshots at deviceScaleFactor 2.
- `thumb.sh` — stages assets + fonts/logo, runs the render, verifies dimensions.

**Honest ceiling:** this renders a strong *typographic* thumbnail in the brand system. It does not generate photographic/illustrative imagery — that would need an image model (a separate, external-dependency decision). For a talking-head talk, a bold headline + the Venn motif is the deterministic, on-brand option.
