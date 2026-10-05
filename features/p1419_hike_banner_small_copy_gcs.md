---
status: backlog
type: bug
rank: 315
severity: medium
workstream: events
date_reported: 2026-10-05
created_date: 2026-10-05
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [events, banner, performance, mobile]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1419: Hike banners hosted on GCS still load full-size originals on phones

## Summary

P1417 gave event banners in Supabase Storage a small 800px WebP copy that phones load instead
of the original. Hike banners published since P1403 live on Google Cloud Storage
(`storage.googleapis.com/claritypledge-story-images/hikes/...`), which `bannerSmallUrl` does not
derive for, so phones still download the original — measured 2026-10-05: `banner-cac446-std.jpg`,
2880x512, 345 KB, rendered at 287x161 on a 375px phone.

## Root Cause

`src/lib/banner-small.ts` derives small copies only for the `event-banners` bucket and
`banners/event/`. GCS banners are uploaded by hand during `/slava:events:publish-run` (hike
checklist), and nothing produces a small copy there.

## Reproduction Steps

1. Phone viewport (375px, 3x), home page with an upcoming social hike.
2. Observe the hike card's `<img>`: `currentSrc` is the GCS original (2880x512).

**Reproduction rate:** 100%

## Expected Behavior

Phones load an ~800px copy of hike banners too, with the same fallback to the original.

## Actual Behavior

Phones load the 345 KB original.

## Affected Files

- `src/lib/banner-small.ts` — derivation scope (Supabase Storage only)
- `scripts/event-banner-small.ts` — backfill writes Supabase Storage only
- `.claude/commands/slava/events/publish-run.md` — hike banner upload step (skill edit needs approval)

## Severity

**Medium** — same symptom as P1417 for every hike card.

## Fix Approach

Extend the derivation to the GCS hikes prefix (`publicMediaUrl()` host, P1385) and teach the
backfill to write the copy to GCS (gcloud credentials, different from Supabase), or produce the
copy in publish-run when the banner is cropped. Keep the derive-don't-store rule (P1417).

## Acceptance Criteria

- [ ] At 375px the home page's hike card requests an ~800px copy, not the GCS original
- [ ] A hike banner with no copy still shows (falls back to the original)
- [ ] Backfill covers existing GCS hike banners
