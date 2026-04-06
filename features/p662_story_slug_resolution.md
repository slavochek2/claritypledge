---
status: in-progress
type: task
rank: 1000064.0
created_date: '2026-04-06'
tags: [stories, slugs, shortcuts, parity]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P662: Add /story/stN slug resolution

## Problem

`/point/st1`, `/point/st5-a` etc. resolve slugs to UUIDs via `resolvePointSlug()` — enabling shareable short URLs for blog embeds and outreach. Stories have the same `stN` tags in `system_tags` but `/story/st1` returns 404. The story detail page only handles UUIDs.

## Appetite

Low blast radius (one new function + ~15 lines in story-detail-page). Fully reversible (remove the resolver call). Zero decision density — exact pattern exists in points, just needs parity.

## Solution

1. Add `resolveStorySlug()` in `stories-service-real.ts` — same pattern as `resolvePointSlug()` but simpler: no `-a` anti-point concept. Match `stN` tag in `system_tags`, resolve highest `vN` version.
2. Add slug resolution to `story-detail-page.tsx` — same pattern as `point-detail-page.tsx:103-117`: detect UUID vs slug, resolve, redirect to canonical UUID URL.

## Risks / Non-Goals

### Risks
- Stories may not have `vN` version tags yet (points got them in the P630 migration). Mitigation: default to version 0 if no `vN` tag found (same as `resolvePointSlug` already does).

### Non-Goals
- Do NOT add `-a` suffix support for stories (stories don't have the understanding/misunderstanding concept)
- Do NOT refactor `resolvePointSlug` into a shared utility (two simple functions > one generic abstraction)
- Do NOT change the OG/embed rewrites in `vercel.json` (already handle `/story/:id` for bots)

## Done-When

- [x] `/story/st1` resolves to the correct story and redirects to `/story/{uuid}`
- [x] `/story/st7` resolves to the correct story
- [x] Non-existent slug (e.g. `/story/st99`) shows 404
- [x] Direct UUID URLs (`/story/{uuid}`) continue working unchanged
- [x] Unit test for `resolveStorySlug` covers: valid slug, highest version wins, no match returns null
