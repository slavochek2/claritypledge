---
status: in-progress
type: change-request
drafted_by: sonnet
exec_model: sonnet
exec_effort: low
rank: 47
workstream: events
changes: p1517
tags:
  - redesign
  - p1517
  - p1403
  - events
  - hike
created_date: '2026-10-20'
disclosure: public
delivery_stage: dev
pipeline_ran: [change-request, dev]
---

# P1518: Hike organizer line reads only "Organized by <group>"

> **Redesign of:** [P1517: Social Hike series gallery shows short videos as well as photos](done/2026-06-10/p1517_social_hike_gallery_videos.md)
> (amendment 4 there; the line itself was introduced by [P1403](done/2026-06-10/p1403_social_hike_event_layout.md)).
> **What was wrong:** The line under the title read `Moderate · Organized by <group> · Learn more`.
> The difficulty prefix repeated a value the stats strip already carries and read as part of the
> organizer attribution. The "Learn more" link pointed at `/cm` (the Clarity Munich landing page),
> which is a marketing destination on an event page and not wanted there.

## Operating Mode

> Incremental correction to P1517/P1403, not a greenfield design. The predecessors are read-only
> shipped history. Implement the delta below only.

## Problem Statement

Founder, 2026-10-20, verbatim:

> "'Learn more' - leads to claritypledge.com/cm - why? i dont think this needs to be on events at all?"

> "'Moderate · Organized by' - why we say moderate there? just organized by .. cut moderate from there"

The organizer line should attribute the event to its group and nothing else.

## Jobs To Be Done

- **Preserved:** see who organizes the hike and reach the group page (`/groups/<slug>`).
- **Corrected:** the line no longer carries difficulty or a link out to a landing page.
- **New:** none. Difficulty is NOT moved elsewhere (founder may decide later; difficulty still shows in the stats strip as built by P1403).

## Current State

```
Moderate · Organized by Clarity Munich · Learn more
          (name -> /groups/<slug>)       (-> /cm via ORG_LEARN_MORE_PATH)
```

`HikeOrganizerLine` in `src/app/prototypes/events/hike/HikeSections.tsx` takes `difficulty` and
`learnMorePath`. `EventDetail.tsx` computes `hikeDifficulty` and `organizerLearnMore`
(`ORG_LEARN_MORE_PATH[organizer.slug]`). `hike-utils.ts` defines `ORG_LEARN_MORE_PATH` and
`HIKE_LABELS.learnMore`.

## Root Cause

Design error, not a code bug: P1403 composed the line from three facts (difficulty, organizer,
learn-more) without asking whether each belongs in an attribution line. Difficulty duplicates the
stats strip; Learn more sends event-page visitors to a landing page.

## Redesign

```
Organized by Clarity Munich
             (name -> /groups/<slug>; plain text when the org has no slug)
```

- `HikeOrganizerLine` props reduce to `organizer`.
- Remove `difficulty` and `learnMorePath` props and the `hikeDifficulty` / `organizerLearnMore`
  locals in `EventDetail.tsx` if grep shows no other reader.
- Remove `ORG_LEARN_MORE_PATH` and `HIKE_LABELS.learnMore` if grep shows no other caller (the
  only callers found at filing: `EventDetail.tsx`, `HikeSections.tsx`, p1517 test).
- Update `docs/events/series/social-hike.md` "Top to bottom" line to `Organized by <org>`.

## Predecessor Sections Superseded

| Section | P1517 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Amendment 4 | `"Learn more" still goes to ORG_LEARN_MORE_PATH (/cm)` | Superseded | No Learn more link |
| P1403 Solution item "organizer line" | difficulty + organizer + Learn more composition | Superseded | `Organized by <org>` only |

Group-name link to `/groups/<slug>` and the "What hikers say" heading (amendment 4) remain valid.

## Requirements

1. Organizer line renders `Organized by <name>`; name links to `/groups/<slug>` when slug present.
2. No difficulty text and no Learn more link in the line.
3. Dead code (`ORG_LEARN_MORE_PATH`, `learnMore` label, unused props/locals) removed after grep.

## Invariants

Carried forward from P1517 and P1403 (additive-only):

- Video and poster files live on GCS under `hikes/social-hike/`, URLs built only through `publicMediaUrl()`. Never Supabase Storage.
- Only the poster loads until the visitor taps play. No autoplay, no mp4 preload.
- Existing photo rows render exactly as they do today.
- Non-hike events render byte-identically to today.
- The WhatsApp invite stays registration-gated (`event_private_info`, P1194).
- No AllTrails, Mapbox or Maxar imagery or user photos are copied; OSM attribution stays visible.
- Banner credit stays visible when a CC BY-SA photo is used.
- Reviews and photos attach to the series, not one event.
- A photo with an identifiable child never ships.

## What Stays the Same

Stats strip (including its difficulty cell), gallery, reviews, route map, banner, title, all
non-hike events, the `/groups/<slug>` link behavior.

## Surfaces in Scope

**In scope:** `HikeSections.tsx` (`HikeOrganizerLine`), `hike-utils.ts`, `EventDetail.tsx` (call
site), `docs/events/series/social-hike.md`, `src/tests/p1517-hike-gallery-videos.test.tsx`, any
p1403 test asserting difficulty/Learn more on the line.

**Out of scope:** everything else, including adding difficulty anywhere new.

## Acceptance Criteria

- [x] The hike page line reads `Organized by <org name>` with the name linking to `/groups/<slug>`.
- [x] No difficulty text and no "Learn more" link appear in `[data-testid=hike-organizer]`.
- [x] `ORG_LEARN_MORE_PATH` and `HIKE_LABELS.learnMore` are gone (or grep evidence shows another caller).
- [x] Stats strip still shows difficulty; non-hike events unchanged.
- [x] Series doc line updated; P1403 and P1517 tests pass (updated where they asserted the removed text).

## Next Steps

Scope is targeted: run `/dev` directly.
