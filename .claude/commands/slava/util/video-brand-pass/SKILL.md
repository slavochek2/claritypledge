---
name: video-brand-pass
description: Add a branded intro card, persistent corner logo bug, and branded outro card to a finished ClarityPledge talk video. Fully local, fully automated — headless Chrome renders the design-system cards (Playfair + Inter, real tokens, the blur→clarity reveal), ffmpeg composites. The follow-on branding lane after /video-edit-simple does the trim.
when_to_use: A finished talk/interview video (already trimmed + loudness-normalized, e.g. the output of /video-edit-simple) that is going to PUBLIC YouTube/social and needs ClarityPledge branding — intro title card, corner logo throughout, outro CTA card. NOT for the trim itself (that's /video-edit-simple), NOT for captions, music, or multi-clip assembly.
version: 1.0.0
---

# /video-brand-pass

Wrap a finished talk in ClarityPledge branding. The cards are rendered from the **real design system** (`src/index.css` tokens, `public/fonts`, the logo) as HTML/CSS, captured headless, and composited with ffmpeg. Nothing is hand-ported into ffmpeg `drawtext` — the card *is* the brand, so it stays in sync and renders web-quality type + motion. (This ffmpeg build has no `drawtext`/freetype anyway — the HTML path is the reason text works at all.)

**Design boundary (why this is separate from the trim skill):** `/video-edit-simple` is the generic, global CLI-trim lane and is deliberately brand-free. Branding is ClarityPledge-specific, so it lives here, in the cp repo. Run the trim first, this second.

**Honest ceiling:** branding makes a clip recognizably yours and gives it a produced feel. It does **not** create a *hook* — the first 5 seconds that stop the scroll. That needs a human picking the grabby sentence and is out of scope. Burned-in captions (for feed-native social where sidecar SRT doesn't render) are also out of scope for v1 — see "Future knobs."

---

## Prerequisites (all already present — verify, don't install)

- **Google Chrome** at `/Applications/Google Chrome.app` — headless render engine (used via `channel:'chrome'`).
- **playwright-core** at `tools/kanban/node_modules/playwright-core` — already a repo dep. The script auto-locates it via `git rev-parse --show-toplevel`.
- **ffmpeg** (brew) — compositing. Note: no `drawtext` filter in this build; the pipeline doesn't need it.
- **node** (v18+).

If Chrome is missing: ask before installing (global install rule). Don't fall back to a different browser silently.

---

## Gather inputs — auto-detect what you can, ask for the rest

Skills don't take flags from the user; the agent resolves inputs from context and asks once for what it can't.

1. **Input video** — auto-detect: the just-produced trim output, or the most recent `*.mp4` in `~/video-edits/` (excluding `*_branded.mp4`). Confirm the path with the user before running. Never copy it.
2. **Title** — `[FOUNDER DECISION]`. Ask. Wrap one word in `*asterisks*` to italicise it in Playfair (e.g. `Calibrated *Communication*`).
3. **CTA** — `[FOUNDER DECISION]`. The outro pill text (e.g. `claritypledge.com`). Ask; present 2-3 options, never default.
4. **Subtitle** — optional attribution line (e.g. `A talk by …`). Offer a sensible default, confirm.

Then call the bundled script (flags are the script's interface, not the user's):

```bash
.claude/commands/slava/util/video-brand-pass/assets/brand.sh \
  --in ~/video-edits/final.mp4 \
  --title "Calibrated *Communication*" \
  --subtitle "A talk by …" \
  --cta "claritypledge.com" \
  --out ~/video-edits/final_branded.mp4
```

Then `open` the output and run the visual-QA pass (`.claude/rules/visual-qa.md`) on intro / a body frame (confirm the corner bug) / outro before calling it ready.

---

## What it does (6 steps, all in `brand.sh`)

1. **Stage** logo + fonts + templates into a temp dir (never touches the source).
2. **Probe** the talk's W×H so the cards match its geometry (works for 720p, 1080p, etc.; non-16:9 gets letterboxed — flag if so).
3. **Render intro** card headless → fade in from black. Title resolves from blur (the "clarity flip"); green calibration line draws in.
4. **Render outro** card → fade to black. Same title bookend + green CTA pill.
5. **Corner bug**: logo overlaid bottom-right, ~7.2% of width, 55% opacity, throughout the talk.
6. **Concat** intro | body | outro, re-encoded once for bulletproof joins (h264 / yuv420p / 30fps / aac 48k stereo). Cards carry silent audio so the join is clean.

---

## Gotchas

- **Cards are 1920×1080 internally, then scaled to the talk's resolution.** A sub-1080p talk means the cards are downscaled — type stays crisp. An above-1080p talk upscales the cards slightly; bump the internal viewport in `record.mjs` if you shoot 4K.
- **`channel:'chrome'`** uses the *system* Chrome, sidestepping playwright browser-version matching. If Chrome auto-updates and breaks, switch to the bundled chromium in `~/Library/Caches/ms-playwright`.
- **Re-encode on concat is intentional** (correctness over a copy that can stutter on mismatched timestamps). It's one extra encode of a short file.
- **`innerHTML` in `record.mjs`** is XSS-safe here: input is the founder's own CLI args, HTML-escaped before the `*word*`→`<em>` transform; the only surviving markup is `<em>`.

---

## Future knobs (only if asked — don't bundle)

- **Light theme** — `card.css` tokens are the `.dark` block; swap for the `:root` block for a light card. Add a `--theme` flag.
- **Distinct outro line** — currently the outro repeats `--title` as a bookend. Add `--outro-title "Thanks for watching"` if the repeat reads odd.
- **Burned captions** — the trim skill already produces an SRT; a `subtitles=` filter on the body step would burn them for feed-native social (LinkedIn/IG/TikTok). One filter add.
- **Crossfade joins** — v1 uses fade-to/from-black hard cuts (fewest failure modes). `xfade`+`acrossfade` would smooth the transitions at the cost of offset-math fragility.
