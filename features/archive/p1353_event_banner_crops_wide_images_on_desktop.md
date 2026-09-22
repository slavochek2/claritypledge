---
status: rejected
type: bug
rank: 11
severity: medium
date_reported: 2026-09-22
created_date: 2026-09-22
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [events, banner, layout]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1353: Event page banner crops wide images on desktop

## Summary

On a wide desktop screen the event page banner shows only the middle band of the image. The Clarity Night #2 banner (2400×1143) loses its "IKIGAI" title at the top and the bottom of the names. Founder, on a screenshot of the event page: "iigai still cut?"

## Root Cause

`BannerDisplay` renders a fixed-height box (`h-48 md:h-64`, 256px on desktop) at full page width, with `object-cover`. On a ~2000px-wide window the box is about 8:1 while the image is about 2.1:1, so `object-cover` keeps only the central ~27% of the image's height.

## Reproduction Steps

1. Desktop window ~2000px wide, any auth state.
2. Open `/events/clarity-night-ai-and-your-ikigai-2026-09-29` (test DB).
3. Observe: the "IKIGAI" title is cut at the top of the banner, and the name text touches the bottom edge.

**Reproduction rate:** 100% at wide widths.

## Expected Behavior

The whole banner composition (title, portraits, names) is visible on the event page at every width, without the banner becoming taller than the viewport can afford.

## Actual Behavior

Only a 256px-tall horizontal slice of the image is shown at any desktop width, so the wider the window, the more is cut.

## Affected Files

- `src/app/components/shared/banner/BannerDisplay.tsx` — default height classes.
- `src/app/prototypes/events/components/EventDetail.tsx` — the event page's banner call, which uses the default.
- `src/app/pages/profile-page-v2.tsx` — the other `BannerDisplay` user; out of scope unless it uses the default height.

## Severity

**Medium** — the event's lead image is visibly broken on desktop for the upcoming Clarity Night, but the page still works.

## Fix Approach

Give the event page banner a height that scales with width (an image-like aspect ratio, capped at a maximum height) instead of the fixed 256px, via `BannerDisplay`'s existing `heightClassName` prop, so phones keep the full image and wide screens show far more of it.

## Acceptance Criteria

- [ ] At 1280 and 2000px wide, the Ikigai banner shows the "IKIGAI" title and the full names.
- [ ] At 375 and 320px wide, the banner still shows the whole image and does not dominate the screen.
- [ ] Profile page banners are unchanged.
- [ ] Regression test passes: `e2e/p1353-*.spec.ts` asserts the banner's height/width ratio stays within the image-like range at a wide width.

## Rejected 2026-09-22

Founder, on seeing the height-follows-width banner: *"also the banner he put is too height! i dont thik
we should paly with hight"*, *"otherwise the evnet description not visible"*. The banner height stays
fixed (192px / 256px). The cropping it targeted is solved by drawing banners for the fixed slot (the
Clarity Night #2 banner, redrawn 2026-09-22, verified at 320 to 1920px), and phones get their own image
in [P1354](../p1354_event_phone_banner.md). The implementation commit stays on branch
`feature/p1353-event-banner-crop` (1f1ab212a), unmerged.
