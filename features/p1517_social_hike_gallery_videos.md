---
status: in-progress
type: story
rank: 46
workstream: events
created_date: '2026-10-20'
tags: [events, hike, video, gallery]
disclosure: public
intent: cold-start
delivery_stage: dev
pipeline_ran: [create-spec, spec-review, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1517: Social Hike series gallery shows short videos as well as photos

## Problem

**Situation:** The Social Hike page's "From past hikes" strip (`PastHikePhotos` in
`src/app/prototypes/events/hike/HikeSections.tsx`) renders rows of `public.series_photos`
(P1403): `id, series_slug, storage_url, alt, credit, sort_order`. It holds images only and has no
media type.
**Complication:** The founder has short clips from past hikes (15–28 s WhatsApp videos) and no way
to put them in the gallery.
**Question:** Can a series gallery tile be a click-to-play video, served from the same GCS bucket
as the photos, without slowing the page or tripping prod CSP?

Founder, 2026-10-20: "Can we support also videos and hikes?" and "vidoes make small feature ...
videos in bucket (not supabase)" and "we already use storiyng of videos somwhere so we can support it".

**Founder decisions, PROPOSED defaults accepted by the orchestrator pending founder veto
(2026-10-20):** size cap ≤ 8 MB / ≤ 30 s / ≤ 720p; sound on after the tap (native controls, not
muted); portrait clips in the 4:3 tile: poster `object-cover` at rest, letterboxed
(`object-contain` on black) while playing.

## Appetite

Blast radius: one component on the hike page plus additive columns. Reversibility: high (additive
migration with a default, then a code revert). Decision density: low, two founder calls below.

## Invariants

- Video and poster files live on GCS under `hikes/social-hike/` in the public-media bucket, with
  URLs built only through `publicMediaUrl()` (P1385, decisions.md). Never Supabase Storage. P1336
  showed that prod `media-src` blocks it.
- Only the poster loads until the visitor taps play. No autoplay and no mp4 preload.
- Existing photo rows render exactly as they do today.

## Solution

1. **Schema:** additive columns on `series_photos`. One marks the row as photo or video and
   defaults to photo. The other is a poster URL, required for video rows by a DB check
   constraint. Video URLs are constrained to the public-media bucket path, mirroring the
   P1402 story-video CHECK (`^https://storage\.googleapis\.com/claritypledge-story-images/[A-Za-z0-9_./-]+\.mp4$`,
   no `..`) and `isPublicMediaVideo()` in `src/lib/public-media.ts`. The client checks both with
   `isPublicMediaVideo()` (video) and the existing `isAllowedPhotoUrl()` (poster). The table keeps
   its name.
2. **Data/types:** `getSeriesContent` (`src/app/data/events-service-real.ts`) selects the new
   fields, and `SeriesPhoto` (`src/app/types/index.ts`) gains a media kind and an optional poster.
3. **UI:** a video row renders as a gallery tile through the existing `Mp4VideoFacade`
   (`src/app/components/shared/mp4-video-facade.tsx`), with `posterAlt` = the row's `alt` and
   `playLabel` = `Play video: {alt}` (mirrors the photo tile's `View photo: {alt}`). It shows the
   poster at rest and plays inline on tap. **Extend, not reuse as-is:** the facade's frames are
   fixed `aspect-video` (16:9), while photo tiles are `aspect-[4/3]` in a `w-[62%] sm:w-56` slot,
   and two of the three first clips are portrait (478×850). The facade needs a tile look (or a
   frame-class prop) that fills the photo tile's 4:3 box.
   (Decided, proposed default: poster `object-cover` at rest,
   video `object-contain` (letterboxed on black) while playing.) Video tiles do not open the image
   lightbox. A tile whose video or poster URL fails the public-media check is dropped, as photos
   are today.
4. **Media storage and upload: reuse the existing public-media video path, nothing new.**
   The repo already serves video this way, and this spec follows it exactly:
   - Bucket `gs://claritypledge-story-images`, the single public-media bucket per
     `docs/technical/infrastructure.md:12`. URLs come only from `publicMediaUrl()`
     (`src/lib/public-media.ts`).
   - Precedent 1, the landing founder clip: `founder/founder-credibility-clip-v1.mp4` +
     `founder-credibility-poster-v1.jpg`, played by `Mp4VideoFacade`
     (`src/app/components/landing/founder-credibility.tsx:31-33`).
   - Precedent 2, the P1336 event-prep clips: `event-prep/<name>-v1.mp4` + `<name>-v1-poster.jpg`,
     built by `clipUrl()` (`src/app/prototypes/events/prep/prep-content.tsx:44-46`). Upload
     convention (`features/done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md:217,307`): faststart (`ffmpeg -movflags +faststart`), versioned `-vN`
     filenames, one-year `cache-control: public, max-age=31536000`, and each object confirmed
     served (HTTP 206 on a range request).
   - Hike media already lives in the same bucket under `hikes/` (seed
     `scripts/archive/migrations/20261004-p1403-seed-oct11-hike.sql:51`; route map per
     `scripts/hike-route-map.mjs:8`). Hike clips go to `hikes/social-hike/<name>-vN.mp4` +
     `<name>-vN-poster.jpg`.
   - No upload *script* exists for this bucket. P1336 and the founder clip were uploaded by hand
     with `gcloud storage cp`, and this spec keeps it that way (see Non-Goals).
     `scripts/event-photo-prep.sh` is NOT a precedent: it writes event banners to Supabase Storage.
   Per clip, before upload: strip metadata (`ffmpeg -map_metadata -1`), make sure it is H.264/AAC,
   apply faststart, and extract a first-frame jpg poster (also stripped).
   (Decided, proposed default: ≤ 8 MB, ≤ 30 s, ≤ 720p.)
5. **Docs:** extend the "Series content" paragraph of `docs/events/series/social-hike.md` with the
   step-4 recipe (pointing at the P1336 convention rather than restating it), the poster requirement and the existing face/consent rules.

(Decided, proposed default: native controls with sound on after the tap, since the tap is
the visitor's consent. The alternative is to start muted.)

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Prod CSP blocks the video | MITIGATE | Verified 2026-10-20: the `vercel.json` CSP has `media-src 'self' https://storage.googleapis.com`, and `img-src` includes the same host for posters. `src/tests/p1385-public-media.test.ts` already asserts that the helper origin stays in both. |
| Heavy clips cost mobile data | MITIGATE | The facade fetches nothing until the tap; size cap above. |
| WhatsApp clips use codecs or profiles some browsers will not play | MITIGATE | Transcode to H.264 in step 4. |
| Faces of people who have not agreed | ACCEPT | The founder decides, per the existing doc rule. The agent never does. |

**Non-Goals**
- Do NOT rename `series_photos` or add a new table.
- Do NOT add autoplay, looping background video or a video lightbox.
- Do NOT add an upload UI, a new bucket or an upload script. Content goes in by hand (`gcloud storage cp` plus an SQL row), as P1336 did.
- Do NOT upload the WhatsApp clips as part of this spec.

## Acceptance Criteria

- [ ] On a series with one video row, the "From past hikes" strip shows a tile with the poster
      and a play button, and the network panel shows no request for the mp4 before the tap.
- [ ] Tapping the tile opens the clip enlarged in a full-viewport overlay (same pattern as the photo lightbox) and plays it there with sound, native controls and `playsInline` (iOS Safari included). The overlay closes on the X, Escape or a backdrop tap, and the `<video>` unmounts on close. The clip never plays inside the small tile. (Founder 2026-10-20: "by clicking on play it should enlarge and play on full screen and not in small window there - it makes no sense to play it there".)
- [x] Photo tiles and the route-map tile look and behave as before, and the lightbox still opens.
- [x] The DB rejects a video row without a poster and one whose URL is outside the bucket.
- [ ] The strip is verified at 320px, 375px and desktop with photos and a video mixed.
- [x] The "Series content" paragraph in `docs/events/series/social-hike.md` describes the video
      recipe.
- [x] A hike video URL built with `publicMediaUrl('hikes/social-hike/…mp4')` passes
      `isPublicMediaVideo()`, and the existing `src/tests/p1385-public-media.test.ts` (origin in
      `media-src`/`img-src`) stays green. `[post-deploy]` re-check that one clip plays on
      claritypledge.com.
- [ ] A portrait clip and a landscape clip both show their poster in the tile without layout shift next to
      photo tiles, and both play without cropping in the overlay (`object-contain`).

## Follow-up data (not in scope)

Once this ships, add three clips through the step-4 recipe after the founder clears faces:
`~/Downloads/WhatsApp Video 2026-10-11 at 17.18.08.mp4`, `… at 19.25.16.mp4` and
`… at 19.25.19.mp4` (1.9 to 7.1 MB). Probed 2026-10-20: all already H.264; the first is
1024×576 (15.5 s), the other two are portrait 478×850 (28.2 s, 23.1 s).

## Related

- P1403 (series content), P1402 (story mp4 constraint), P1385 (public media helper), P1336 (CSP lesson), P1005 (video facade).

## Next Steps

Pipeline layers not written yet: `/ux` (tile states, portrait handling), `/architect` (migration,
facade extension), `/generate-tests`. Re-run `/spec-review` after them.

## Amendment 2026-10-20 (founder, after seeing it locally)

1. **Playback is full-screen, not in the tile.** The tile is poster + play button only. A new
   `VideoLightbox` (`src/app/components/shared/video-lightbox.tsx`, Radix Dialog like `ImageLightbox`)
   plays the clip. This supersedes the `Mp4VideoFacade` tile look in Solution step 3: the facade is
   unchanged from main.
2. **Series reviews as a swipe strip.** Founder: "should references be swipe to the right instead of
   being one after another ... over time you might have more references". `SeriesReviews`
   (P1403) already renders a scroll-snap row (`overflow-x-auto snap-x`, cards `w-[85%] sm:w-80`, avatar +
   profile link per card); a single review is full width, which is what the test DB shows today (one
   review), so it reads as stacked. Test added for 3 reviews. No layout change needed.
3. **Order: photos first.** Founder: "better start with photos and mix videos after". A video never
   takes the first slot: content sets `sort_order` so videos come after the first photos, and
   `PastHikePhotos` moves the first photo ahead of any leading video as a backstop (route-map tile
   position unchanged). Covered by `p1517-hike-gallery-videos.test.tsx`.
