---
status: all-done
type: bug
rank: 15
workstream: letters
created_date: '2026-09-28'
tags: [letters, video]
disclosure: public
pipeline_ran: [fix]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: founder
completed_at: 2026-09-28
---

# P1368: Letter story video plays in place, with a sharp poster

## Problem

A sealed letter's story card rendered its video as a thumbnail that linked to `/story/:id`, so
pressing play took the reader out of the letter. The thumbnail was YouTube's 480x360 `hqdefault`,
which the founder reported as a blurry picture.

The thumbnail-only rule came from P1296 ("Do NOT give the thumbnail-only surfaces
(`StoryCardWithLinks`, `LiveStoryCardExpanded`) a player"), whose reason is avoiding N simultaneous
embeds in a scrolling feed or live session. A letter shows one story at a time, so the reason does
not reach it.

## Fix

`LiveStoryCardExpanded` takes an opt-in `videoMode` (default `'thumbnail'`, so feeds and live
sessions are unchanged). The three letter surfaces that render one story at a time pass
`'player'`: `letter-flow-content.tsx` (reading), `story-walk.tsx` (results),
`letter-prediction-walk.tsx` (prediction). In player mode the poster is the story's own image
(`imageProps.src`) rather than YouTube's thumbnail.

Related data fix, done directly on prod in the same session: the 8 sealed snapshots of the st1
story (`883d89f5`) predated its video and carried no `videoUrl`; `point_config.videoUrl` /
`videoQuotes` were backfilled from the live story. P1141 deliberately did not backfill.

## Acceptance Criteria

- [x] On `/letter/st1`, pressing play starts the video inside the letter; the URL stays on the letter.
  Evidence: local build against prod data, anonymous — after the click the page held a
  `youtube-nocookie.com/embed/k4zpMYIKK5A` iframe playing (0:01 / 1:24), `location.pathname` still
  `/letter/7bd0d109-…`.
- [x] The poster before play is the story's own image (1200x896), not the 480x360 YouTube thumbnail.
  Evidence: screenshot before play shows the story's diagram image under the play button.
- [x] The poster shows the whole story image (object-contain on white), never cropped to 16:9.
  Evidence: facade img class `object-contain`, natural 1200x896, screenshot shows the full diagram.
- [x] Quote timecodes in a letter seek the in-letter player (`onSeek` wired in player mode only);
  thumbnail mode keeps open-at-timestamp links. st1 has 0 quotes, so not exercised in a browser.
- [x] Feeds and live sessions keep the thumbnail (default `videoMode='thumbnail'`; no other caller changed).

## Not verified

- 320px not checked; 375px verified (play stays in the letter, iframe mounts).
- Results and prediction walks were not clicked through in a browser; same prop, same component.
