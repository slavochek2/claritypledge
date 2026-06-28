---
status: week
type: task
rank: 1000939.0
workstream: content
created_date: '2026-06-28'
tags: [video, pipeline, demo, automation]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P973: Synthetic Video Pipeline — transcript → generated demo → existing publish lane

## Problem

**Situation:** The existing video pipeline (`docs/video-process.md` + the `/video-*`
skills) takes a **raw human talk recording** all the way to YouTube. There is no path
that *generates* a video from a script when no one is on camera — e.g. a program demo
that shows the real product, or (later) an article turned into a narrated screen video.

**Complication:** The `/program` page currently explains the 3-week co-founder program
in **text**. Prospects who already accept the benefits still hesitate because they
can't picture what ~7 hours of program actually looks like — "is this real, or loose
talk?" Text is the medium they distrust; seeing the real screens is the proof. A demo
must show the *actual* UI (real Clarity Letter, real /live calibration, real CPA), which
rules out AI text-to-video (Veo/Sora/Kling — they hallucinate UI).

**Question:** Can we build a terminal-driven pipeline that assembles a 2–3 min program
demo from a script — real-app capture + cloned-voice narration + on-brand HTML segments
+ cinematic cuts — producing a `final.mp4` that hands off to the **existing** publish
lane, without duplicating that lane?

## Appetite

Medium blast radius (new CREATE lane; reuses, does not modify, the publish lane). Fully
reversible (new skill/scripts; delete to remove — no changes to shipped product or the
existing video skills). Medium decision density — voice/avatar/paid-tier choices are
deferred and signal-gated, not blocking.

## Solution

A new **synthetic CREATE lane** that produces a `final.mp4`, then reuses the existing
`ingest → /gen-thumbnail → /youtube-upload` publish lane unchanged. Stages:

1. **Capture** — Playwright drives the real Vite+React SPA through a scripted flow and
   records the real UI to video (reuses the repo's existing Playwright/`record.mjs`
   pattern and e2e selectors).
2. **Narrate** — generate narration from the script. **F5-TTS (free, local) first** to
   prove the pipeline; swap to an **ElevenLabs cloned voice** (~$5/mo) only once it
   earns it (see Non-Goals — signal-gated).
3. **HTML segments** — intro/outro cards via the existing
   `video-brand-pass/assets/record.mjs` (a single-card stamper). For richer *animated*
   motion-graphic segments generated from the transcript (the auto-generation phase),
   **HyperFrames** is the engine; `record.mjs` covers only intro/outro.
4. **Composite** — FFmpeg muxes narration over capture, applies `zoompan` cinematic
   punch-ins, burns captions, concatenates segments → `final.mp4`.
5. **Publish** — hand off to the existing lane. No new upload/thumbnail code.

**Modular by design:** each beat (file-letter / live-session / sign-CPA) is a standalone
clip, so one recording effort feeds in-product tutorial clips, a support-page library,
**and** the full `/program` video (substituting the current text component).

**Narrative spine:** the 3-week program chronology, each week tagged with its landing
"move" (will / skill / align / friction / pitfalls), closing on the concrete artifacts
the participant walks away holding. Script draft lives with this spec / the sibling doc.

### First deliverable — KISS test (do this before anything else)

A single ~15s clip proving the whole assembly end to end:
Playwright captures ~10s of `/program` → one F5-TTS (or ElevenLabs-free preset) voice
line → FFmpeg muxes audio+video+one zoom cut → one playable `final.mp4`.
If it plays, the rest is more of the same. If not, ~an hour spent, not a week.

## Risks / Non-Goals

### Risks
- **Playwright capture is functional, not cinematic** (hardware cursor, no auto-zoom).
  Mitigation: cinematic polish is the FFmpeg `zoompan` layer in post, scripted.
- **HyperFrames young (v0.x) / OSS voice drift on long narration.** Mitigation: start
  with proven in-repo `record.mjs` + F5-TTS for the KISS test; upgrade only on need.
- **Demo screens depend on P904 + P948** (async letter verification + response letter),
  both unbuilt. Mitigation: KISS test + capture of stable screens (filing, /live, CPA)
  proceed now; record the verification/response beats *after* P904 + P948 ship.

### Non-Goals
- **Do NOT modify the existing publish lane** (`/youtube-upload`, `/gen-thumbnail`,
  `/video-brand-pass`) — reuse as-is; this lane only produces a `final.mp4` for ingest.
- **Do NOT duplicate `docs/video-process.md`** — reference it; new lane goes in the
  sibling doc `docs/synthetic-video-process.md`.
- **Do NOT add a talking-head avatar** — OSS avatars (SadTalker/Wav2Lip) read uncanny
  and cheapen a demo. HeyGen is an optional later experiment, judged on screen first.
- **Do NOT use AI text-to-video (Veo/Sora/Kling)** for product steps — they hallucinate
  UI. (Allowed only for non-product ambient B-roll, if ever.)
- **Do NOT pay for cloned voice / avatar before signal** — upgrade is gated on whether
  the videos demonstrably drive traffic to clarity experiments / the program.
- **Do NOT build the general "article → video → multi-channel" factory yet** — prove ONE
  end-to-end video first; the factory is a deferred future phase, not this spec.

### Alternatives Considered
- **HyperFrames** (HeyGen, Apache-2.0, HTML→MP4 + agent skills) — the **chosen engine for
  generated animated HTML segments** (the auto-generation phase). The in-repo `record.mjs`
  is only a single-card stamper (intro/outro), so it does NOT replace HyperFrames for rich
  motion graphics. Split by phase: `record.mjs` for intro/outro on the first demo;
  HyperFrames once the agent builds animated segments from a transcript.
- **Remotion** (React→video) — license trap (paid for for-profit teams of 4+). Rejected
  in favor of `record.mjs` / HyperFrames / Revideo (MIT).
- **Screen Studio / BetterCapture** (GUI/manual capture) — not scriptable; conflicts
  with the terminal-only, regenerable goal. Playwright chosen instead.
- **ElevenLabs as the only voice** — paid and not needed to prove the pipeline; F5-TTS
  first, ElevenLabs on signal.

### Rollback Strategy
Delete the new CREATE-lane skill/scripts and the sibling doc. Nothing in the shipped
product or the existing video skills changes, so there is no migration to reverse.

## Done-When

- [ ] KISS test produces a playable ~15s `final.mp4` (real `/program` capture + one
      voice line + one FFmpeg zoom cut), evidence: the file plays.
- [ ] Sibling doc `docs/synthetic-video-process.md` exists, references
      `docs/video-process.md` for the shared publish lane, and lists the
      considered/deferred tools (HyperFrames, Remotion, OSS avatars, AI text-to-video).
- [ ] A produced clip reaches the existing publish lane via `ingest` unchanged (no edits
      to `/youtube-upload` or `/gen-thumbnail`).
- [ ] Program-demo capture documented as blocked on P904 + P948 for the
      verification/response beats; stable beats (filing, /live, CPA) capturable now.
- [ ] Voice path documented: F5-TTS default, ElevenLabs cloned voice as a signal-gated
      upgrade; no paid subscription required to run the pipeline.
