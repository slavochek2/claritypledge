---
name: video-question-beats
description: Overlay interview question lower-thirds onto a finished interview cut. Each question card slides in as a lower-third at its beat, holds, fades out — the video keeps playing underneath and the audio ducks (never hard-cuts). Fully local; headless Chrome renders the design-system card to an alpha PNG, ffmpeg animates + composites. Reads the segment manifest's out_start/out_end/question_text — never source timestamps.
when_to_use: A trimmed + reordered interview cut where you want the question a guest is answering shown as a sliding lower-third at each answer's start. Called by /video-edit-interview Stage 4, or standalone to iterate the beat design on one clip. NOT for full-frame question cards (that hard-cuts the video), NOT for the intro/outro brand cards (that's /video-brand-pass), NOT for the trim (/video-edit-talk).
version: 1.0.0
---

# /video-question-beats

Add sliding question lower-thirds to a finished interview cut. The card is rendered from the **real design system** (`src/index.css` tokens, `public/fonts`) as transparent HTML/CSS, captured as an **alpha PNG** headless, then **animated and composited by ffmpeg** — slide-in, alpha fade-out, and an N-window audio duck. The video never stops; the audio never cuts to silence.

**Why a lower-third, not a full-screen card:** a full-frame question card hard-cuts the footage and the audio (the failure in session `29932534`). A lower-third keeps the guest on screen and only ducks the audio while the question is readable — the produced-interview feel.

**Honest ceiling:** this places and animates a question you supply. Deciding *which* question labels a segment (or that a spontaneous segment gets **no** card) is a `[FOUNDER DECISION]` made in the `/video-edit-interview` Stage 2 selection sheet — the manifest's `question_text` may be null (`beat: none`), and this skill simply renders no card for those. It does not invent questions.

---

## Prerequisites (all already present — verify, don't install)

- **Google Chrome** at `/Applications/Google Chrome.app` — headless render engine (`channel:'chrome'`).
- **playwright-core** at `tools/kanban/node_modules/playwright-core` — repo dep; the script auto-locates it via `git rev-parse --show-toplevel`.
- **ffmpeg** (brew) — animation + compositing (uses the `overlay` x-expression for motion and `volume ... enable=` for the duck; no `drawtext` needed).
- **node** (v18+).

If Chrome or playwright is missing: ask before installing (global install rule). Don't silently fall back to another browser.

---

## How it differs from /video-brand-pass (do NOT assume reuse)

Brand-pass renders a **full-frame opaque** card (`card.css` `#0a0a0b` body) captured as an **opaque webm**, overlaid at `0:0`, with a **single** hardcoded duck window. This skill shares **only the design tokens** (blue-500 brand, Inter/Playfair, the muted-foreground palette) — everything else is different and lives in this skill's `assets/`:

- **Transparent card** (`beat.css` has `background:transparent` on html/body) captured with Playwright `screenshot({ omitBackground:true, type:'png' })` → a **real alpha PNG**. Never reuse `card.css`'s opaque body.
- **Lower-third geometry** — overlaid at `y≈H*0.72`, `x` slides from off-left to a left margin. Not `0:0`.
- **Motion is ffmpeg, not CSS** — a static PNG runs no keyframes. The slide is an ffmpeg animated-`x` expression; the fade is an ffmpeg alpha `fade`. `beat.css` deliberately has **no** `@keyframes`.
- **N-window duck** — one `volume` filter ducked (`0.28`) across every beat window OR'd together (`enable='between(t,a1,b1)+between(t,a2,b2)+…'`), a rewrite of brand-pass's single window. `0.28`, never `0` — never hard-cut.

---

## Inputs — auto-detect what you can, ask for the rest (skills take no flags)

1. **Input video** — the reordered interview cut from `/video-edit-interview` Stage 3 (`out_start/out_end` already baked into the timeline). Standalone: the clip to iterate on. Must have an audio track.
2. **Beats** — a TSV, one beat per line: `<start_seconds>\t<question text>`. In orchestrated mode this is **generated from the segment manifest**: one row per kept segment whose `question_text` is non-null, `start = out_start + XFADE` (fire the card *after* the incoming cross-dissolve settles, so it doesn't slide in over a dissolve). Segments with `beat: none` produce no row. `#`-prefixed lines are comments; wrap a word in `*asterisks*` for Playfair italic emphasis.

**Manifest contract (orchestrated mode):** read `out_start`/`out_end`/`question_text` from `interview.manifest.json` — **never** source timestamps. `XFADE` is the named cross-fade constant from Stage 3; the same value must be used to offset the beat start.

---

## Run

```bash
bash assets/beats.sh --in <cut.mp4> --out <cut_beats.mp4> --beats <beats.tsv>
# --keep  keeps the mktemp work dir (rendered PNGs + staged assets) for inspection
```

The script (`assets/beats.sh`):
1. Stages assets + fonts into a per-run `mktemp -d` work dir (isolation, same primitive as brand-pass).
2. Probes the video; computes `MARGIN` (≈4.2% width, doubles as the bottom inset).
3. Renders **one alpha PNG per beat** via `render-beat.mjs` (element screenshot, `omitBackground`); captures each card's pixel `WxH` for positioning. Each card's y-position is then **bottom-anchored from its own height** (`y = H - MARGIN - cardHeight`, computed per beat) rather than a fixed offset — this is what keeps a tall 2-line question card from overflowing the frame regardless of resolution (2026-07-16 fix).
4. Builds the filtergraph: per beat a looped-PNG input with alpha fade in/out and a sliding `overlay x` expression; one final `volume` duck across all beat windows. Validates each beat start is numeric and `start + card-duration < video-duration` (a beat past the end aborts).

**Motion constants** (named at the top of `beats.sh`, tune in one place): `SL=0.4` slide, `HOLD=3.6` hold, `FADE=0.5` fade-out, `DUCK=0.28` ducked level.

---

## Verification (what "ready" requires — evidence, not assertion)

Proven on a 20s test clip (steady 220 Hz tone so the duck is measurable):

- **Audio ducks, never silent** — `volumedetect` per window: full **-24.1 dB**, inside a beat **-35.2 dB** (an 11.1 dB drop = exactly `20·log₁₀(0.28)`), and **not -∞**. Re-run this measurement on any real cut: sample audio inside vs outside a beat window; the delta must be ≈11 dB and the ducked level must not be silent.
- **Card slides in as a lower-third** — extract frames across a beat entrance (`ffmpeg -ss <t> -frames:v 1`): before the beat no card; ~0.15s in the card's right edge is on screen (sliding from off-left); by `start+SL` it rests at the left margin; it holds, then fades. The top two-thirds stay clear and the video plays underneath the whole time.

Then run the visual-QA checklist (`.claude/rules/visual-qa.md`) on a resting-card frame: readability over the busiest background region, no clipping at the frame edge, lower-third leaves the speaker clear.

---

## Anti-scope-creep

This skill does one thing: sliding question lower-thirds with a duck. It is NOT the trim (`/video-edit-talk`), NOT the intro/outro branding (`/video-brand-pass`), NOT captions, NOT the selection/reorder judgment (that's the `/video-edit-interview` orchestrator and its Opus selection pass). Keep the card a single question; multi-line lower-thirds and animated builds are out of scope.
