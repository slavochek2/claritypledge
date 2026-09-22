---
name: video-motion-cards
description: Add restrained on-screen cards to a finished ClarityPledge talk clip — quote cards that land a story beat, a build-up list for named concepts, an end card — timed to the spoken words, placed off the speaker and off the projected slide, rendered from the design system via headless Chrome and composited with ffmpeg.
when_to_use: A short talk clip (onboarding, explainer, social cut) that is already trimmed, synced and loudness-normalized (/video-edit-talk) and where the founder wants key words or concepts to stick on a phone screen. NOT for branding intro/outro + logo bug (/video-brand-pass), NOT for interview question cards (/video-question-beats), NOT for slide overlays (/video-slide-overlay). End-card ownership: if this skill adds an end card, do NOT also run /video-brand-pass's outro on the same clip (its outro carries a CTA; this one must not) — pick one with the founder.
version: 1.0.0
---

# /video-motion-cards

Built 2026-09-22 on the Clarity Night onboarding clip (ST1 story + three meanings of "understand").
The rules in §2 are corrections the founder made in that session; treat them as defaults for this
kind of clip, not laws for every video.

## 0. Inputs + versioning
- The trimmed clip, its transcript with segment times, the slides/images the talk uses.
- Work on a **copy** named `vN-animated-wip.mp4`. The approved un-animated version stays untouched;
  the upload file changes only when the founder picks a version.

## 1. Plan before rendering
Write a brief (context, the §2 rules, the transcript with times) and attach: the slide(s), 2 full
frames (one per scene), a contact sheet (`fps=1/3,tile=6x5`). **Only frames from the final, already
cropped framing** — if §5c of /video-edit-talk found a non-consenting person, nothing showing them
leaves the machine.
Default: one planner (an Opus agent), then verify its cue times against the transcript yourself.
Add Codex as a second, independent planner when the founder asks for it (2026-09-22 he did):
`codex exec -m <CODEX_MODEL from ~/.agents/model-defaults.env> -s read-only -i a.png,b.png - < prompt.txt`.
(`-i` takes multiple values — a positional prompt after it is swallowed as an image; pass the
prompt on stdin with `-`.) Report `<received> of <spawned>`. Show the founder where the plans
agree and differ, recommend, and get the **on-screen wording** approved — wording is a founder
decision.

## 2. Rules (founder corrections, 2026-09-22)
- **A quote or concept card appears after its line is spoken**, not before (cue start = end of the
  phrase). A card that anticipates the speaker read as a spoiler.
- **Never over the projected screen**, never over face or hands. Find the free zone per scene from
  the contact sheet (a wall beside the screen, a curtain strip) — it differs per scene.
- Few moments (≈6–8), at most ~4 elements on screen. A list of named concepts **builds up** and
  stays; when the key item arrives, the others dim to 50% and it gets the blue tint.
- Don't show a slide overlay that repeats what the speaker is saying at that moment.
- **End card:** no call to action, no instructions — the clip is reused in many settings. A
  founder-approved line, icons in the **same order as the source slide**, small `claritypledge.com`.
  Hold ~3 s after the last word; fade in 0.6 s. A hard stop after the last word felt abrupt.

## 3. Design — from the real tokens
Sources: `src/index.css` (site UI; `--radius` 0.5rem = 8px) and `public/presi3/index.html` (deck;
its `.card` uses a 16px radius, which these cards follow because they are presentation cards).
Font: Inter from `public/fonts/inter-latin.woff2` (same as /video-brand-pass). Colors: fg `#09090b`,
muted `#71717a`, border `#e4e4e7`, blue `#3b82f6` / `#2563eb`, card white, 1px border; active card
= pale blue fill `#eef4fe` + blue border. Over video, a soft shadow (`0 2px 12px rgba(0,0,0,.18)`)
is needed for legibility — a deliberate deviation from the deck's flatter shadow. No left accent
bars, no yellow, no purple. Motion = the deck's `power2.out`, ~0.4 s: fade + 12 px rise.
Icons: crop them from the ST1 story image or the slide; `mix-blend-mode:multiply` removes the white
box on tinted cards. `assets/cards-example.html` is the worked example — replace `__CP_ROOT__` with
the repo path and put the icon PNGs next to the HTML. Size the end card to the clip's width/height.

## 4. Render + composite
- Cards: `node assets/render.mjs cards.html outdir/` → one transparent PNG per top-level `id`. It
  exits 1 if the font or an image failed to load. (This ffmpeg has no `drawtext`.)
- Composite in one pass. Every card input spans the **whole clip**, because fade/overlay times are
  absolute: `-loop 1 -t <CLIP_DURATION + hold> -i card.png` (a shorter `-t` ends the card stream
  before its cue and it never appears).
  - fade: `format=rgba,fade=t=in:st=T:d=0.4:alpha=1,fade=t=out:st=T2:d=0.3:alpha=1`
  - rise: `overlay=x=X:y='Y+12*pow(max(0\,1-(t-T)/0.4)\,2)':eval=frame:enable='between(t,T,T2)'`
  - dimmed state = a separately rendered PNG swapped in at the cue, not an alpha expression.
  - end card: `tpad=stop_mode=clone:stop_duration=HOLD` on video and `apad=pad_dur=HOLD` on audio
    (never bare `apad` — it pads forever), `-t CLIP_DURATION+HOLD`; assert the output duration.
  - Colour: end the chain with `scale=out_color_matrix=bt709:out_range=tv,format=yuv420p` and tag
    `-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv`. The end card was
    reported as yellow before this.

## 5. Verify before showing
- Transcribe the result; confirm each card time against the phrase it follows.
- A frame every 1 s across each card window, cropped to the card zone: no card over face, hands or
  the projected slide. Say what you did not check.
- End-card background reads `ffffff`:
  `ffmpeg -ss <t> -i v.mp4 -frames:v 1 -vf crop=4:4:40:40,scale=1:1 -f rawvideo -pix_fmt rgb24 - | xxd -p`
- `open` the file automatically.
