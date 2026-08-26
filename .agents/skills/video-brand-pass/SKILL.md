---
name: video-brand-pass
description: Add a branded intro card, persistent corner logo bug, and branded outro card to a finished ClarityPledge talk video. Fully local, fully automated — headless Chrome renders the design-system cards (Playfair + Inter, real tokens, the blur→clarity reveal), ffmpeg composites. The follow-on branding lane after /video-edit-talk does the trim.
when_to_use: A finished talk/interview video (already trimmed + loudness-normalized, e.g. the output of /video-edit-talk) that is going to PUBLIC YouTube/social and needs ClarityPledge branding — intro title card, corner logo throughout, outro CTA card. NOT for the trim itself (that's /video-edit-talk), NOT for captions, music, or multi-clip assembly.
version: 1.0.0
---

# /video-brand-pass

Wrap a finished talk in ClarityPledge branding. The cards are rendered from the **real design system** (`src/index.css` tokens, `public/fonts`, the logo) as HTML/CSS, captured headless, and composited with ffmpeg. Nothing is hand-ported into ffmpeg `drawtext` — the card *is* the brand, so it stays in sync and renders web-quality type + motion. (This ffmpeg build has no `drawtext`/freetype anyway — the HTML path is the reason text works at all.)

**Design boundary (why this is separate from the trim skill):** `/video-edit-talk` is the generic, global CLI-trim lane and is deliberately brand-free. Branding is ClarityPledge-specific, so it lives here, in the cp repo. Run the trim first, this second.

**Honest ceiling:** branding makes a clip recognizably yours and gives it a produced feel. It does **not** create a *hook* — the first 5 seconds that stop the scroll. That needs a human picking the grabby sentence and is out of scope. Burned-in captions (for feed-native social where sidecar SRT doesn't render) are also out of scope for v1 — see "Future knobs."

---

## Prerequisites (all already present — verify, don't install)

- **Google Chrome** at `/Applications/Google Chrome.app` — headless render engine (used via `channel:'chrome'`).
- **playwright-core** at `tools/kanban/node_modules/playwright-core` — already a repo dep. The script auto-locates it via `git rev-parse --show-toplevel`.
- **ffmpeg** (brew) — compositing. Note: no `drawtext` filter in this build; the pipeline doesn't need it.
- **node** (v18+).

If Chrome is missing: ask before installing (global install rule). Don't fall back to a different browser silently.

---

## Brand copy lives in the templates (not asked each run)

The tagline, the co-founder hook, the stat, and the CTA are **brand constants**, baked into `assets/intro.html` and `assets/outro.html`. They're founder decisions already made — to change brand voice, edit those two files, not the CLI. **After editing any template or `card.css`, re-run `brand.sh` and run the visual-QA pass on the new output; prior renders are not evidence.** Current copy:

- **Intro:** kicker `ClarityPledge` · per-talk title (dynamic) · tagline `Protecting co-founder relationships`
- **Outro (mission-layer, 2026-07-13):** pain `Misalignment costs you: rework, mistrust, turnover.` · hook `Alignment isn't agreement. It's verified understanding between people.` · stakes `No AI can be aligned without it.` · CTA button `Get your free alignment audit` · understated link `claritypledge.com`. (Replaced the stale co-founder hook — see `docs/decisions.md` 2026-07-13.)

## Gather inputs — auto-detect what you can, ask for the rest

Skills don't take flags from the user; the agent resolves inputs from context and asks once for what it can't.

1. **Input video** — auto-detect: the just-produced trim output, or the most recent `*.mp4` in `~/video-edits/` (excluding `*_branded.mp4`). Must be longer than the cold-open offset and must have an audio track (the trim output always does). Confirm the path before running; never copy it.
2. **Title** — `[FOUNDER DECISION]`. Ask. Wrap one word in `*asterisks*` to italicise it in Playfair (e.g. `Calibrated *Communication*`).
3. **Cold-open offset** — how many seconds of footage play before the bumper drops in. Default `6`. Judge per video: enough to let a hook land, before attention drifts. Ask or pick from the talk's opening.

Then call the bundled script (flags are the script's interface, not the user's):

```bash
.claude/commands/slava/util/video-brand-pass/assets/brand.sh \
  --in ~/video-edits/final.mp4 \
  --title "Calibrated *Communication*" \
  --offset 6 \
  --out ~/video-edits/final_branded.mp4
```

Then `open` the output and run the visual-QA pass (`.claude/rules/visual-qa.md`) on a pre-intro frame / the intro card / a post-intro frame (confirm the bug + that the card cleared) / the outro before calling it ready. Listen for the audio duck + sting at the offset.

---

## What it does (7 steps, all in `brand.sh`)

1. **Stage** logo + fonts + templates into a temp dir (never touches the source).
2. **Probe** the talk's W×H + duration so cards match geometry and the offset is validated (non-16:9 gets letterboxed — flag if so).
3. **Render intro** card headless, raw (no baked fade — the overlay alpha-fades it). Title resolves from blur; green line draws in; tagline fades up.
4. **Render outro** card → fade from/to black (it's appended).
5. **Synthesize sting** — a soft filtered-pink-noise swell for the bumper entry (no audio asset needed).
6. **Composite the cold open**: corner bug over the whole talk; intro card alpha-overlaid at the offset (talk video hidden during the card, then clears); talk audio **ducks to 28%** during the card window; sting mixed in at the offset.
7. **Append outro** via concat, re-encoded once for a bulletproof join (h264 / yuv420p / 30fps / aac 48k stereo).

---

## Gotchas

- **Cards are 1920×1080 internally, then scaled to the talk's resolution.** A sub-1080p talk means the cards are downscaled — type stays crisp. An above-1080p talk upscales the cards slightly; bump the internal viewport in `record.mjs` if you shoot 4K.
- **`channel:'chrome'`** uses the *system* Chrome, sidestepping playwright browser-version matching. If Chrome auto-updates and breaks, switch to the bundled chromium in `~/Library/Caches/ms-playwright`.
- **Re-encode on concat is intentional** (correctness over a copy that can stutter on mismatched timestamps). It's one extra encode of a short file.
- **`innerHTML` in `record.mjs`** is XSS-safe here: input is the founder's own CLI args, HTML-escaped before the `*word*`→`<em>` transform; the only surviving markup is `<em>`.
- **`--offset` must be < talk duration** (the script errors if within 1s of the end). The talk must have an audio track for the duck/mix; the trim output always does.
- **Intro is an overlay, not a splice** — it adds zero runtime to the talk; only the outro extends total length.
- **No `drawtext`/freetype** in this ffmpeg build — irrelevant, all text comes from the HTML cards.

## Future knobs (only if asked — don't bundle)

- **Light theme** — `card.css` tokens are the `.dark` block; swap for `:root` for a light card.
- **Burned captions** — the trim skill already produces an SRT; a `subtitles=` filter on the body step would burn them for feed-native social (LinkedIn/IG/TikTok).
- **Lower-third intro** — instead of a full-screen bumper, a partial overlay that keeps the talk video visible underneath while the brand strip animates in.
