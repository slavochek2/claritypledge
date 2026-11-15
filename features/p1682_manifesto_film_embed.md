---
status: week
type: story
rank: 338
workstream: content
created_date: '2026-11-14'
tags: [manifesto, video, youtube]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1682: Manifesto film "The Clarity Tax" on /manifesto + YouTube

## Problem

A 1:54 narrated film of the manifesto exists (local `the-clarity-tax-v5.mp4`, 1080p, 100 MB) and is on no surface.

> Founder, verbatim: "I like this video. I wonder where we should include it. I'm thinking to include it maybe in manifesto page and embed it and maybe somewhere else."

## Appetite

Blast radius: one page (/manifesto). Reversibility: git revert. Decision density: low — placement decided in session 2026-11-14 (embed on /manifesto only; other surfaces keep their existing link).

## Invariants

- Media URL built only through `publicMediaUrl()` (P1385, decisions.md) — prod CSP blocks any other host.
- No YouTube player on our own pages; self-hosted `Mp4VideoFacade` (decisions.md: a YouTube embed at rest "takes away people from our website").

## Solution

1. Compress to a web mp4 (~15–20 MB), extract a poster, build WebVTT captions from the film's own on-screen lines; upload under `manifesto/` in the media bucket.
2. Click-to-play `Mp4VideoFacade` at the top of /manifesto (above the article), with duration badge.
3. YouTube: draft title/description/tags; upload via `/slava:util:youtube-upload` only after founder approves the draft text.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Video weight on mobile | MITIGATE | Facade loads nothing but the poster until click; compressed file |
| Film placement pushes article below the fold | ACCEPT | Film is the 2-minute version of the same text |

**Non-Goals**
- Do NOT embed on /prepare end, event-prep end, community join or landing pages; their existing "Read the manifesto" links stay unchanged.
- Do NOT change any CTA text. [FOUNDER DECISION: optionally rename /prepare end CTA to "Watch the manifesto (2 min)" — not in scope unless asked.]

## Acceptance Criteria

- [x] /manifesto shows the film poster above the article; click plays inline at desktop, 375px and 320px (no caption track: narration is burned into the picture). Verified in Chrome, playback t≈4.5s at all three widths, no horizontal scroll
- [x] Media served from the public bucket (passes p1385 test)
- [x] Gemini visual critique of the page in context run and its verified findings addressed: poster moved off centred text (1:18 frame), width capped max-w-2xl so the first paragraph shows above the fold at 1440px
- [ ] YouTube upload done only after founder approved title + description
