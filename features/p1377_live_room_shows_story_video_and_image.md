---
status: backlog
type: story
rank: 309
workstream: live
created_date: '2026-09-30'
tags: [live, story, video, media]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: heuristic
---

# P1377: /live room shows the selected story's video and image

## Problem

**Situation:** Stories can carry a video (`videoUrl`, `videoQuotes`, P1141) and an image (`imageUrl`, P591). The feed and story pages render them through `StoryMedia` (`src/app/components/shared/story-media.tsx`).
**Complication:** When a story is selected in a /live session, it is copied into the synced `live_state.selectedStoryData` through `toLiveStoryData` (`src/app/pages/live/letter-preload.ts:33`), typed as `LiveStoryData` (`src/app/types/index.ts:571`). Neither carries `videoUrl`, `videoQuotes` or `imageUrl`, so the room has nothing to render. A story discussed live shows its text and points, but not the video or image it is about.
**Question:** Carry the media fields into the live story and render them in the room.

> Founder framing, verbatim (2026-09-30): "in /live can we make sure it includes video/story if a given story has them?"

## Appetite

Blast radius: one flow (/live story round), but it touches the synced `live_state` JSON both participants read. Reversibility: git revert; no migration (JSON column, optional fields). Decision density: one founder call (placement and size in the room).

## Invariants

- `selectedStoryData` is written atomically with the other story fields. A stale full-blob write once erased the partner's story mid-round (decisions.md, `updateLiveState` read-modify-write entry).
- The new fields are optional. Old `live_state` rows lack them and must render exactly as today.
- `live_state` content is never attached to Sentry `extra` (decisions.md, P525 PII entry). That rule is unchanged, and the new fields must not be the exception.

## Solution

Extend `LiveStoryData` with optional `videoUrl`, `videoQuotes`, `imageUrl` (and whatever `StoryMedia` needs, such as duration). Populate them in `toLiveStoryData` and in every other path that sets `selectedStoryData`: the picker, the letter-sourced bootstrap, and the DB rehydrate. Render the media in the /live story card with the existing `StoryMedia` component, not a new player.

[FOUNDER DECISION: in the room, does the video show as a thumbnail that expands on tap, or inline and playable? Is it shown to both participants or only the host?]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A path that sets `selectedStoryData` is missed, so media shows only sometimes | MITIGATE | Enumerate every writer by grep; test each |
| Video autoplay or audio clashes with the live mic recording | MITIGATE | No autoplay; confirm the recorder does not capture page audio |
| Larger `live_state` payload on every realtime update | ACCEPT | A URL plus a quotes array. Measure if quotes are long. |

**Non-Goals**
- Do NOT backfill or change sealed letter snapshots.
- Do NOT add synced playback (both participants seeing the same timestamp).
- Do NOT change the point picker (P1376 owns that).

## Acceptance Criteria

- [ ] Selecting a story with a video in /live shows that video in the room, for both participants
- [ ] Selecting a story with an image shows the image
- [ ] A story with neither renders exactly as today
- [ ] Rejoining or reloading mid-round still shows the media
- [ ] A session whose `live_state` predates this change renders without error
- [ ] Verified at 320px, 375px and desktop

## Related

- P1141: stories carry a video with jumpable quotes
- P1376: /live picker offers current point versions only
