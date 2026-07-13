# Video Process — End to End

How a talk recording goes from a raw multi-GB file to a published YouTube video.

This is the **recorded-talk** lane. Its sibling is
[synthetic-video-process.md](synthetic-video-process.md) — the *generated* lane that builds a video
from a script (real-UI capture + cloned-voice narration + HTML segments) with no one on camera. Both
lanes converge at the ingest boundary and share the same publish lane below.

This is the video counterpart to [content-process.md](content-process.md) (blog pipeline) and
[software-delivery-process.md](software-delivery-process.md) (feature pipeline). Each stage is a
CLI-only, fully-local skill; the judgment (what to cut, what to title) stays human, the mechanical
work (transcribe, slice, composite, upload) is automated.

---

## The Pipeline

The pivot point is the **ingest boundary** — the move from the editing scratch dir
(`~/video-edits/`) into a named publish folder (`~/video-library/{slug}/`). Two skills run *before*
ingest (trim, brand); two run *after* it (slide overlay, upload). Confusing the two sides is the
most common way to break the pipeline — `/video-slide-overlay` and `/youtube-upload` both hard-fail
if their files aren't already in the library.

```
CREATE                EDIT  (~/video-edits/)            PUBLISH  (~/video-library/{slug}/)
──────                ────────────────────              ─────────────────────────────────

 Record a talk /       /video-edit-talk                /video-slide-overlay   (optional)
 call / interview  →   trim, dead air,        ─INGEST→   overlay slides at the moments
 (manual — no skill)   loudness-normalize,    (move +    they were shown; reads final.mp4
                       transcribe             rename to    ↓  final-with-slides.mp4
   ↓                     ↓ final.mp4          canonical
 Optional slide          ↓ + transcript        library    /youtube-upload
 deck at                /video-brand-pass      names)     draft metadata from transcript →
 claritypledge.com/    (optional)                         approve → upload via YouTube API
 presi2                 intro + corner logo               (prefers final-with-slides.mp4,
                        + outro CTA card                   else final.mp4)
                          ↓ final_branded.mp4                ↓  youtu.be/{id} + receipt
```

**The only required path is trim → ingest → upload.** Branding and slide overlay are independent
opt-ins. They do **not** chain cleanly through each other — see "Combining branding + slides" below.

**One-command path:** `/video-publish` runs all of the above in order, stopping only at two human
gates — what-to-cut (the trim decision sheet + the founder title) and a final-watch before upload.
Use it to take a raw recording all the way to a public video in one pass; use the individual skills
when you only want one stage. See "The orchestrator" below.

---

## Two lanes, split by the ingest boundary

| Dir | Lane | Skills that operate here | Holds |
|-----|------|--------------------------|-------|
| `~/video-edits/` | EDIT (scratch) | `/video-edit-talk`, `/video-brand-pass` | `final.mp4`, `final_branded.mp4`, `audio.wav`, `*.srt`, render frames — intermediates, deleted on approval |
| `~/video-library/{slug}/` | PUBLISH (durable) | `/video-slide-overlay`, `/gen-thumbnail`, `/youtube-upload` | the finished video + transcript + metadata + thumbnail + upload receipt, one folder per talk |

The **ingest step** moves the chosen edit-lane video into a named library folder, renaming to the
canonical names the publish-lane skills require (`final.mp4`, `transcript.srt`,
`transcript-readable.md`). The trim
step's own outputs (`audio.srt`, the readable markdown) may not already carry those exact names —
rename them on the way in.

```bash
# Ingest: scratch → library. Pick ONE source video and land it as final.mp4.
SLUG="my-talk-title-june-2026"          # {descriptive-title}-{month-year}; illustrative
mkdir -p ~/video-library/$SLUG
mv  ~/video-edits/final.mp4              ~/video-library/$SLUG/final.mp4
cp  ~/video-edits/transcript.srt         ~/video-library/$SLUG/transcript.srt
cp  ~/video-edits/transcript-readable.md ~/video-library/$SLUG/transcript-readable.md
```

If you ran `/video-brand-pass`, ingest the **branded** file as `final.mp4` instead — the publish
lane only ever reads `final.mp4` / `final-with-slides.mp4`, never `*_branded.mp4`:

```bash
mv ~/video-edits/final_branded.mp4 ~/video-library/$SLUG/final.mp4
```

---

## Each Step in Plain English

### 1. Record — Capture (manual, no skill)

**What:** Record the talk, call, conference session, or interview. Single-take.

**Optional slide deck:** present from `claritypledge.com/presi2` so it can be overlaid later
(step 4). The `?plain` query param disables GSAP animations for clean slide export.

**Output:** a raw recording (often multi-GB) somewhere on disk. Leave it where it is — the edit
lane reads it in place and never copies the big file.

---

### 2. `/video-edit-talk` — Trim & Normalize (global skill, EDIT lane)

**What:** Cut a long single-take recording down to a clean version. Removes wrong start, junk end,
dead-air silence; loudness-normalizes. CLI only, fully on-device.

**How the human stays in the loop:** transcribes locally first (`mlx_whisper`), condenses the SRT
into readable ~20s blocks, and presents a **decision sheet** — start cut, end cut, glitch zones,
silence handling, content cuts. The user marks cuts from the transcript, not by scrubbing a
timeline.

**Honest ceiling:** no tool detects a "fumble" that isn't silence — cutting bad-but-fluent content
is a human meaning judgment.

**Output:** `~/video-edits/final.mp4` + an SRT + a readable markdown transcript. Rename these to the
canonical library names at ingest (the whisper SRT is named after its audio input, e.g.
`audio.srt`, not `transcript.srt`).

**When to skip:** never — this is the entry point. Everything downstream consumes its `final.mp4`.

---

### 3. `/video-brand-pass` — Brand (ClarityPledge-local skill, EDIT lane, optional)

**What:** Wraps a finished talk in ClarityPledge branding — a blur→clarity intro title card, a
persistent corner logo bug, and an outro CTA card. Cards are rendered from the **real design
system** (`src/index.css` tokens, `public/fonts`, the logo) as HTML/CSS, captured headless via
Chrome, composited with ffmpeg — so the card *is* the brand and stays in sync.

**Why it lives in cp (not global):** branding is ClarityPledge-specific. `/video-edit-talk` is the
generic, brand-free trim lane; this is the cp branding lane that runs after it.

**Inputs:** explicit `--in` / `--out` (auto-detects the most recent `~/video-edits/*.mp4` as a
default `--in`). Asks once for the `[FOUNDER DECISION]`s it can't resolve: title, outro CTA text,
optional subtitle.

**Honest ceiling:** branding makes a clip recognizably yours and gives it a produced feel. It does
**not** create a hook (the first 5 seconds that stop the scroll) — that needs a human picking the
grabby sentence. Burned-in captions are out of scope for v1 (sidecar SRT only).

**Output:** `~/video-edits/final_branded.mp4`. Run the visual-QA pass on intro / a body frame
(confirm the corner bug) / outro before calling it ready. **To reach the publish lane, ingest this
file as `final.mp4`** (it is never picked up under the `_branded` name).

**When to skip:** internal/raw clips, or anything not going to public YouTube/social.

---

### 4. `/video-slide-overlay` — Overlay Slides (global skill, PUBLISH lane, optional)

**What:** Overlays exported presentation slides onto the talk at the timestamps they were shown.
Produces `final-with-slides.mp4`; the original `final.mp4` is untouched.

**Runs after ingest.** It hard-requires `~/video-library/{slug}/final.mp4` **and**
`transcript-readable.md` (Step 0 fails fast if either is missing). It only ever reads `final.mp4` —
it does not know about `final_branded.mp4`, so if you want branding too, see the next subsection.

**When to use:** the recorded slides are illegible (washed out, blocked by the speaker), so the deck
is overlaid in a face-free corner instead.

**Process:** picks a face-free corner from 3 sampled frames → exports slides as PNGs from
`claritypledge.com/presi2?plain` via Playwright → builds a **timestamp map** (human-confirmed table
of which slide shows when) → composites with ffmpeg. The confirmed map persists as
`slides/timestamp-map.tsv`, so `--re-encode` fixes timing without re-exporting.

**Output:** `~/video-library/{slug}/final-with-slides.mp4` (which `/youtube-upload` then prefers).

**When to skip:** slides are legible in the raw recording, or the talk has no deck.

---

### 5. `/youtube-upload` — Distribute (global skill, PUBLISH lane)

**What:** Uploads a video from `~/video-library/{slug}/` to the **@claritypledge** YouTube channel.
Drafts title / description / tags from the transcript, gets approval, then uploads via the official
YouTube Data API. **Prefers `final-with-slides.mp4` over `final.mp4`** when both exist — so a branded
clip must have been ingested *as* `final.mp4` to be picked up.

**Learning loop:** few-shot from `seed-examples.json` + a rolling window of past approved metadata
(`~/.claude/youtube-style/`). Each approval records which fields the user edited, so drafts improve
over time. `review-examples` subcommand lets you mark past metadata as `bad` to exclude it.

**File preference:** prefers `talk_FINAL.mp4` (the fully-branded pipeline output) → `final-with-slides.mp4` → `final.mp4`, first that exists.

**Privacy:** **public by default** (founder standing instruction 2026-06-25 — ClarityPledge talks ship public). Only `unlisted`/`private` on an explicit per-video instruction. The script sets privacy at upload time; an already-uploaded video is flipped with `--make-public` (needs the full `youtube` scope → one-time `--reauth` browser consent). Other guards: phone-verification warning (unverified accounts cap at 15 min/video), idempotency via `upload-intent.json`, resumable upload. **Run with `uv run --script` (PEP 723 inline deps), never plain `python3`.**

**Output:** `https://youtu.be/{id}` + `upload-receipt.json` in the library folder.

**Check what's shipped:** `ls ~/video-library/*/upload-receipt.json`.

---

### 6. `/gen-thumbnail` — Thumbnail (ClarityPledge-local skill, PUBLISH lane, optional)

**What:** Renders a 1280×720 YouTube thumbnail from the brand design system (same Playfair/Inter, tokens, blue, logo as the intro/outro cards) — headless Chrome screenshots an HTML/CSS card. No external image model, deterministic, on-brand with the bumpers.

**Autonomous:** agent derives a short hook headline + optional two-circle Venn labels from the talk's `metadata.json`/transcript, renders, self-verifies with vision, and iterates up to ~3× without a gate.

**Output:** `~/video-library/{slug}/thumbnail.png`. **Attaching it to the video is still manual** in YouTube Studio (`thumbnails.set` needs a verified channel + extra scope) — wire it into `youtube-upload.py` later if fully-hands-off is wanted.

---

## Combining branding + slides (read before doing both)

The two optional passes do **not** chain through a shared filename convention, so "brand it *and*
overlay slides" is a deliberate manual sequence, not a default:

- `/video-slide-overlay` is rigid — it reads only `~/video-library/{slug}/final.mp4` and writes
  `final-with-slides.mp4`. It is blind to `_branded` files.
- `/video-brand-pass` is flexible — explicit `--in`/`--out`, so it can brand *any* file.

So to get both, run slides first, then brand the result, then rename it back to the name the upload
step prefers:

```bash
# 1. ingest final.mp4 → library      2. /video-slide-overlay → final-with-slides.mp4
# 3. brand the slide version:
/video-brand-pass --in ~/video-library/$SLUG/final-with-slides.mp4 \
                  --out ~/video-library/$SLUG/final-with-slides-branded.mp4 ...
# 4. rename so /youtube-upload picks it up:
mv ~/video-library/$SLUG/final-with-slides-branded.mp4 \
   ~/video-library/$SLUG/final-with-slides.mp4
```

**Corner collision:** both passes place an overlay in a corner — the brand logo bug is fixed
**top-right** (brand.sh `overlay=W-w-MARGIN:MARGIN`), and slide-overlay's corner tie-break is
bottom-right → top-right → …, so top-right is its second pick and the real collision risk. Eyeball
the result; if they fight, force the slide into a non-top-right corner (re-run slide-overlay Step 3
with a different `CORNER`).

---

## The orchestrator (`/video-publish`)

`/video-publish` is the one-command path: it **sequences the existing stage skills**, it does not
reimplement them. Order: `/video-edit-talk` → `/video-brand-pass` → ingest → `/video-slide-overlay`
(if a deck) → `/gen-thumbnail` → draft metadata → `/youtube-upload`. It brands *before* ingest, so
slides overlay onto an already-branded `final.mp4` (matches the corner-collision note above).

**Two human gates, and only two:**
1. **Kickoff + what-to-cut** — the `/video-edit-talk` decision sheet plus the founder-only inputs
   (source path, slug, title, "is there a deck?"), all asked once.
2. **Final-watch** — the assembled video opens for one watch alongside the drafted metadata +
   thumbnail before it uploads public.

Everything between and after runs autonomously. A stage's non-zero exit stops the chain and is
reported with its output — completed stages' outputs persist, so re-running resumes from the failure.
Fix a weak result in the owning stage skill, never in the orchestrator.

---

## File Locations

| What | Where |
|------|-------|
| Edit scratch (intermediates) | `~/video-edits/` |
| Published library (one folder per talk) | `~/video-library/{slug}/` |
| Slide deck source | `https://claritypledge.com/presi2?plain` |
| Brand cards (design-system source) | `src/index.css`, `public/fonts`, logo |
| YouTube style memory | `~/.claude/youtube-style/` |
| Shipped-video index | `ls ~/video-library/*/upload-receipt.json` |

**Rots first (verify against the skill files before trusting):** the `presi2` site contract that
slide export depends on (`window.show(k)`, `.slide`, `?plain` — `/video-slide-overlay` asserts these
at runtime and fails loudly if the site changes); the YouTube OAuth token (`invalid_grant` →
re-auth); and the canonical library filenames, if any skill renames its outputs. This is a *snapshot*
doc — when a video skill changes its inputs/outputs, sync it here (it is not auto-generated).

---

## Skills Reference

| Skill | Invoke | Scope | Lane | What |
|-------|--------|-------|------|------|
| Trim & normalize | `/slava:util:video-edit-talk` | global | edit | Raw recording → clean trimmed `final.mp4` + transcript |
| Brand | `/slava:util:video-brand-pass` | cp-local | edit | Finished talk → intro card + corner logo + outro CTA |
| Overlay slides | `/slava:util:video-slide-overlay` | global | publish | Overlay deck PNGs at the moments shown (autonomous: content-match + vision-verify, no human gate) |
| Thumbnail | `/slava:util:gen-thumbnail` | cp-local | publish | Library video → 1280×720 brand thumbnail PNG (headless Chrome, no image model) |
| Upload | `/slava:util:youtube-upload` | global | publish | Library video → drafted metadata → YouTube (public by default) |
| **Orchestrate** | `/slava:util:video-publish` | cp-local | both | Raw recording → published video in one pass; chains all of the above, two human gates |

**Global vs cp-local:** the trim, slide-overlay, and upload lanes are reusable across projects
(global, in `~/.claude/commands/`). Branding and thumbnail are ClarityPledge-specific (design-system
cards) and live in this repo.

---

## Anti-scope-creep

Each skill leads with its honest ceiling and refuses to bundle unrequested work:

- The **cut** is the job. Loudness-normalize is a free win, included. Slides, captions, intro cards,
  music, transitions are optional and separate — never bundled.
- **Branding** ≠ a hook. It produces a recognizable, produced feel, not scroll-stopping first
  seconds (a human judgment).
- No GUI/NLE. This is the CLI lane on purpose — for multi-clip assembly, transitions, or music,
  that's a GUI editor's job, outside this pipeline.
