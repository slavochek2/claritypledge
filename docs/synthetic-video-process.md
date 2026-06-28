# Synthetic Video Process — script → generated video

How a video gets made when **no one is on camera**: a script/transcript becomes a
narrated video of the real product (and, later, articles turned into screen videos).

This is the **generated CREATE lane**. It is the sibling of
[video-process.md](video-process.md), which covers the *recorded-talk* lane. Both feed
the **same publish lane** — this doc does not re-document upload/thumbnail; see
video-process.md for those.

Spec: [features/p973_synthetic_video_pipeline.md](../features/p973_synthetic_video_pipeline.md).

---

## How it relates to the recorded-talk pipeline

| | Recorded-talk lane (`video-process.md`) | Synthetic lane (this doc) |
|---|---|---|
| Input | A raw human talk recording | A script / transcript (no recording) |
| CREATE/EDIT | trim → brand | **generate:** capture real UI + narrate + HTML segments + composite |
| Output of CREATE | `final.mp4` | `final.mp4` |
| PUBLISH | ingest → slide-overlay → thumbnail → upload | **same — reused unchanged** |

Both lanes converge at the **ingest boundary** and share
`ingest → /gen-thumbnail → /youtube-upload`. The synthetic lane is only a different way
to *produce* the `final.mp4`.

---

## The generated CREATE lane

```
SCRIPT/TRANSCRIPT
   │
   ├─ 1. CAPTURE    Playwright drives the real SPA through a scripted flow,
   │                records the real UI → screen.mp4   (reuse e2e selectors)
   │
   ├─ 2. NARRATE    script text → voice.mp3
   │                F5-TTS (free, local) first; ElevenLabs cloned voice on signal
   │
   ├─ 3. SEGMENTS   on-brand intro / lower-third / transition cards
   │                via video-brand-pass/assets/record.mjs (headless Chrome → video)
   │
   └─ 4. COMPOSITE  FFmpeg: mux voice over capture, zoompan cinematic punch-ins,
                    burn captions, concat segments → final.mp4
                         │
                    ── INGEST ──►  existing PUBLISH lane (video-process.md)
```

**Modular:** each beat is a standalone clip, so one effort feeds in-product tutorials, a
support-page library, and the full `/program` video.

---

## KISS test (build this first)

A ~15s clip that proves the whole assembly before building more:

1. Playwright captures ~10s of `/program` → `screen.mp4`
2. F5-TTS (or an ElevenLabs free preset voice) says one script line → `voice.mp3`
3. FFmpeg muxes audio + video + one zoom cut → `final.mp4`

If it plays in voice over the real UI, the rest is more of the same.

---

## Recommended free-first stack

| Layer | Pick | Notes |
|-------|------|-------|
| Real-UI capture | **Playwright** video recording | cleanest scriptable capture of the React SPA |
| Pacing/cuts | **Auto-Editor** | one-command silence/pace trim |
| Cinematic zoom + captions | **FFmpeg** `zoompan` + `subtitles` | scriptable Ken-Burns punch-ins |
| Intro/outro cards | **`record.mjs`** (in-repo) | single-card stamper, on-brand via design-system tokens |
| Animated HTML segments | **HyperFrames** | for transcript-generated motion graphics (auto-gen phase) |
| Voice | **F5-TTS** free → **ElevenLabs** ~$5/mo | upgrade signal-gated |
| Orchestration | the new CREATE skill + FFmpeg/Playwright glue | — |

**Voice upgrade reasoning:** treat this as a *pipeline* investment, not a per-video cost.
Build free; pay for cloned voice only once videos demonstrably drive traffic to the
program / experiments. The ElevenLabs cloned voice is locked behind the paid tier, but
audio generated while subscribed is yours to keep — subscribe → generate → downgrade.

---

## Considered but NOT used / deferred (and why)

Full registry of evaluated tools so we don't re-research. Verdicts as of 2026-06 — re-verify
prices/quality before relying (see currency flag below).

**Capture**
- **Puppeteer** — leaner but no built-in video recording (bolt-on needed). Playwright won.
- **OBS + CLI** — works but needs a running instance + scene config; heavier orchestration.
- **Screen Studio / BetterCapture / OpenScreen / Recordly** — GUI/manual; not scriptable.
  Conflicts with the terminal-only, regenerable goal.

**Cinematic / compositing**
- **Auto-Editor** — *used* (pacing/silence trim), not rejected.
- **Remotion** (React→video) — free only for individuals / for-profit teams ≤3; license is
  a cost gate. Use `record.mjs` / HyperFrames / Revideo instead.
- **Revideo** (MIT, MCP-native, Motion-Canvas fork) — viable free alternative to Remotion;
  parked behind HyperFrames for now.
- **Motion Canvas** — animation-authoring-first (manual timeline); poor fit for
  transcript-driven auto-assembly.

**HTML → video**
- **HyperFrames** (Apache-2.0, +19 agent skills) — **kept/deferred** as the engine for
  generated *animated* segments. `record.mjs` (single-card stamper) covers only intro/outro,
  so it does NOT replace HyperFrames. Not needed for the first demo.

**Voice clone**
- **ElevenLabs** — paid (~$5/mo) but best long-form quality; the signal-gated upgrade.
- **F5-TTS** — *chosen* free/local default.
- **XTTS v2** — comparable quality but restricts commercial use without a license. Avoid.
- **Fish Speech / Kokoro-82M / Piper / Coqui** — viable OSS fallbacks; Piper lowest quality.
  Not chosen over F5-TTS.

**Avatar (all rejected for the demo)**
- **OSS talking-head (SadTalker / Wav2Lip / MuseTalk / EchoMimic / Hallo / LivePortrait)** —
  uncanny on a product demo; MuseTalk best but needs real footage + GPU. Avatar omitted.
- **HeyGen / Synthesia** (~$24–30/mo) — optional later experiment, judged on screen first.

**Generative video (off-limits for product steps)**
- **Veo / Sora / Kling / Runway / Pika** — hallucinate fake UI; cannot show the real product.
  Ambient B-roll only, if ever.

---

## Honest ceilings

- Playwright capture is *functional*, not Apple-keynote smooth — polish is the FFmpeg
  layer, scripted by hand.
- OSS voice clone is ~85–90% of ElevenLabs for short clips; it can drift over multi-minute
  narration. A/B your own voice on the real script before deciding.
- The program-demo verification/response beats depend on **P904 + P948** (both unbuilt) —
  capture those after they ship; stable beats (letter filing, /live, CPA) are capturable
  now.

---

## Knowledge-currency flag

Tool versions, prices, and OSS-quality claims here move monthly (HyperFrames is v0.x,
ElevenLabs tiers shift). Re-verify before committing money. This is a snapshot, not a
live source.
