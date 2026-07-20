---
status: all-done
type: story
rank: 1000952.0
created_date: '2026-07-20'
tags: [founder, video, credibility, coach, landing]
pipeline_ran: [create-spec, dev]
completed_at: 2026-07-20
---

# P1005: Founder Talk Video in the Credibility Section (/founder + /coach)

## Problem

**Situation:** `/founder`'s credibility section ("Built by someone who paid for the lesson", the €398k two-column block) uses a static square headshot (`founder-photo.jpg`). The Zuzalu talk is now rendered and is the strongest trust artifact we have (founder on stage, publicly staking the thesis). The same credibility block is copy-pasted on `/program`; `/coach` has none.
**Complication:** A talk video is a higher-trust signal than a headshot, but it must not leak conversion (no autoplay, no off-site YouTube rabbit hole, no competing CTA) and must not bloat the git repo with a binary.
**Question:** Embed a short talk clip as the credibility anchor on `/founder` (and add the credibility block to `/coach`) without hurting the funnel or the repo.

## Appetite

Medium blast radius (new shared component; re-renders the credibility block on `/founder`; adds a section to `/coach`; `/program` left untouched). Reversible (component swap; remove section). Low decision density — design decided in this session (see below); remaining choices are cosmetic.

## Solution / Approach

Extract a shared `<FounderCredibility>` component (with an optional `video` slot) from the currently-duplicated inline block. Use it on `/founder` (with the video) and `/coach` (text only). Leave `/program`'s inline copy untouched.

**The clip (locked):** `~/video-library/cofounder-clarity-talk-june-2026/derived-clips/founder-credibility-clip-v1.mp4` — 76.6s, starts on "I tell you quickly the story…", carries the personal-conflict story → the question → the answer ("the word understand has three meanings: cognitive, emotional, agreement"). Poster: `founder-credibility-poster-v1.jpg` (founder on stage). Fade in/out + one internal dissolve already baked in.

**Hosting (decided): all-inkl via FTP.** Upload the mp4 + poster to all-inkl; the component references them by URL. Do NOT commit the binaries to the repo (history bloat). No third-party tracker, no competitor leak, uses existing infra. (Upgrade path if traffic/analytics demand: Bunny/Cloudflare Stream — one-component URL swap.)

**Player:** facade — poster image + centered play button on render; the `<video>` (or inline player) loads/plays only on click. No autoplay. Fire a Mixpanel play event on first play.

**Layout:** the video replaces the square headshot. It is 16:9 and notably larger than the old photo (watchable, not a thumbnail). Desktop: video left / €398k text + CRED_POINTS right. Mobile (375/320): stacks, video on top. A quiet always-there text link "See full presentation ↗" sits under the video → the unlisted full talk (https://www.youtube.com/watch?v=goFs8tuw1qc).

## Risks / Non-Goals

### Risks
- **Layout restructure**: swapping a square photo for a larger 16:9 player rebalances the two-column section — needs QA at 375px and 320px (stacking, no overflow) and a play-button tap target ≥40px.
- **Autoplay leak**: must be click-to-play facade; autoplay would compete with the page and hurt performance.
- **Repo bloat**: committing the mp4 would bloat git history permanently — reference the all-inkl URL instead.

### Non-Goals
- Do NOT commit the mp4/poster into the repo — they live on all-inkl, referenced by URL.
- Do NOT touch `/program` (its inline credibility copy stays).
- Do NOT add a CTA, end-slide, or lower-third inside the section — the page carries the single CTA. (Lower-third decided against for v1.)
- Do NOT change the page's primary CTA or the funnel — that is P1003.
- Do NOT embed the raw YouTube iframe for the clip (leak); YouTube is only the full-talk link-out target.

## Done-When

- [x] `/founder` credibility section shows the video facade (poster + play) instead of the square headshot; clicking plays the clip inline (no autoplay)
- [x] The homepage (`/` → ProgramPage), `/coach`, and `/founder` all render the SAME full self-contained `<FounderCredibility>` section — byte-identical chrome + clip (change request: pages had diverged because each hand-rolled the surrounding section; the component now owns its own `<section>`, container, reveal, and clip constant). The video shows on all three (founder decision, this session).
- [x] "Watch the full talk on YouTube" (YouTube glyph) is an always-visible link → the full talk, on **both** /founder (under the video) and /coach (under the text)
- [x] A Mixpanel play event fires on first play (`founder_clip_play`; prod-only per analytics wrapper — unit-tested via mocked `analytics.track`)
- [x] Renders cleanly at desktop, 375px, and 320px; play button ≥40px tap target (64px, verified)
- [ ] mp4 + poster served from a public URL; neither binary committed to the repo — **binaries not committed (✓); public host URL is the open pre-deploy decision (see Pre-deploy Checklist). Code references root-relative placeholder for local render.**

## UX Notes

- States: poster (default), playing (inline). No loading spinner needed for a facade.
- Mobile: video on top, text below. Desktop: two-column, video left.

## UI Contract

| Element | Value |
|---------|-------|
| Play affordance | Centered play button over the poster, ≥40px tap target |
| Full-talk link | "Watch the full talk on YouTube" (YouTube glyph), always visible — under the video on /founder, under the text on /coach |
| Autoplay | Off (click-to-play facade) |
| Video aspect | 16:9 |
| Clip source | Public URL (uploaded from `derived-clips/founder-credibility-clip-v1.mp4`) — host TBD, see Pre-deploy Checklist |

## Pre-deploy Checklist

**Hosting premise corrected during /dev:** The spec's "all-inkl via FTP → referenced by URL" is not viable as written. Both `claritypledge.com` and `ladischenski.com` resolve DNS→Vercel; the all-inkl docroot for these domains is **not web-served**, so a file FTP'd there returns no public URL (verified against `pp/docs/infra/all-inkl.md`). The `claude-temp-upload` FTP user reaches `/ladischenski/temp/`, which is likewise not served. A public URL requires one of the options below — this is a **[FOUNDER DECISION]**.

### Decide the host (blocks ship)
- [ ] Choose one:
  - **(A) ladischenski.com/temp via Vercel** (`/upload-to-ladischenski-temp`) — commits the 9.6 MB mp4 into the *ladischenski-com* repo (bloats that repo's history, not cp's) + Vercel deploy. "temp" path semantics for a permanent asset.
  - **(B) Video CDN** (Bunny Stream / Cloudflare Stream / Cloudflare R2) — purpose-built media host, no repo bloat, proper caching; requires account setup. The spec's own named upgrade path.
  - **(C) An all-inkl-*web-served* domain** (not the Vercel ones) — keeps "existing infra", but needs a domain whose docroot all-inkl actually serves; not yet identified.

### Provision + wire
- [ ] Generate a WebVTT captions file (`founder-credibility-clip-v1.en.vtt`) from the clip transcript (mlx_whisper) — a11y `<track>` added during /dev per the media-has-caption gate
- [ ] Upload the mp4 + poster + `.en.vtt` to the chosen host
- [ ] Swap the three URLs in `FOUNDER_CLIP` (`src/app/pages/old-landing-2.tsx`) from the root-relative placeholders to the absolute host URLs
- [ ] Redeploy (Vite bakes the constant at build time)

### Post-deploy verification
- [ ] `curl -I` both asset URLs → HTTP 200 with correct content-type
- [ ] Load `/founder` on prod, click play, confirm inline playback + `founder_clip_play` in Mixpanel
- [ ] Confirm neither binary is tracked in the cp repo (`git ls-files | grep founder-credibility` → empty)