---
status: all-done
type: change-request
rank: 250008.75
changes: p504
tags:
  - redesign
  - p504
  - banners
created_date: 2026-03-14T00:00:00.000Z
flow: dev
delivery_stage: done
completed_at: 2026-03-15
---

# P519: Remove On-Page Banners from Stories & Points

> **Redesign of:** [P504: Auto-Generated Banners](features/done/22_mar_26/../../../features/p504_auto_generated_banners_stories_points_profiles.md)
> **What was wrong:** Banners on story and point detail pages are disconnected decorative blocks above the content card — they consume 29% of mobile viewport, provide no information, and have no visual integration with the card below. Unlike profiles (where avatar overlap creates structural connection), stories/points lack any compositional relationship between banner and content.

## Problem Statement

P504 added AI-generated banners to stories, points, profiles, and events. On profiles, P510 redesigned the banner into an integrated header with avatar overlap — this works well. On stories and points, the banner sits as a disconnected rectangular block above the card, providing visual noise without informational value. The banner's primary utility for stories is OG social sharing (link previews on LinkedIn, Twitter, etc.), which does not require on-page display.

## Jobs To Be Done

- **Preserved from P504:** OG image for story social sharing (bannerUrl in og:image meta tag)
- **Preserved from P504:** Auto-generation of story banners on creation (for OG value)
- **Corrected:** On-page banner display on stories/points adds no user value and should be removed
- **Corrected:** Point banner generation wastes API calls — points have no sharing surface

## Current State

**Story detail page** (`story-detail-page.tsx:1206-1222`):
- `<BannerDisplay>` renders above the story card with `fallbackColor={story.authorAvatarColor}`
- `<BannerControls>` (pills variant) allows author to regenerate/remove/search
- Banner is visually disconnected — no overlap, no integration with the card below

**Point detail page** (`point-detail-page.tsx:425-429`):
- `<BannerDisplay>` renders above the point card with `fallbackColor="#94a3b8"`
- No controls for anyone (not even the author)
- Banner is visually disconnected from point card

**Point creation** (`points-service-real.ts:231`):
- `generateAIBanner('point', point.id, token)` fire-and-forget on every point creation
- Points are not shared externally — no OG value from banner

## Root Cause

P504 applied banners uniformly across all entity types without evaluating whether each surface had a compositional relationship between banner and content. Profiles received integration via P510 (avatar overlap). Stories and points never received equivalent treatment, and analysis of 30 layout variants (via /ascii-flows) showed that no practical integration pattern exists for card-based detail pages — the card IS the content, and a banner above it is decorative.

## Redesign

**Stories:** Remove `<BannerDisplay>` and `<BannerControls>` from story-detail-page.tsx. Keep `bannerUrl` in SEO/OG meta tags (preserves social sharing). Keep fire-and-forget banner generation in `createStory()`. Add subtle `border-t-[3px]` with `authorAvatarColor` to story card top for visual identity.

**Points:** Remove `<BannerDisplay>` from point-detail-page.tsx. Remove fire-and-forget `generateAIBanner()` from `createPoint()` in points-service-real.ts. Points have no sharing surface — banner generation is pure waste.

**Profiles/Events:** No change — profiles have P510 integration, events have their own pattern.

## Predecessor Sections Superseded

| Section | P504 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Story banner display | "Banner image above the content" (story-detail-page.tsx:1205) | Superseded | Remove on-page display, keep OG only |
| Story BannerControls | Pills variant for author regenerate/remove/search | Superseded | Remove — no on-page banner to control |
| Point banner display | "Banner image above the content" (point-detail-page.tsx:424) | Superseded | Remove entirely |
| Point banner generation | Fire-and-forget generateAIBanner on createPoint | Superseded | Remove — no value |

## Requirements

1. Remove `<BannerDisplay>` and `<BannerControls>` from story-detail-page.tsx
2. Remove `<BannerDisplay>` from point-detail-page.tsx
3. Remove `generateAIBanner()` call from `createPoint()` in points-service-real.ts
4. Keep `generateAIBanner()` in `createStory()` (OG value preserved)
5. Keep `bannerUrl` in story SEO/OG meta tags
6. Add `border-t-[3px]` with `authorAvatarColor` to story card for visual identity
7. Existing bannerUrl data in DB is not deleted (historical OG images remain valid)

## What Stays the Same

- Profile banner (P510 design) — unchanged
- Event banner — unchanged
- Story creation flow — still generates banner for OG
- Story OG meta tags — still use bannerUrl
- Database schema — no changes, bannerUrl column stays
- `useBanner` hook — unchanged (still used by profiles/events)
- `BannerDisplay` component — unchanged (still used by profiles/events)
- `BannerControls` component — unchanged (still used by events, pills variant preserved)

## Surfaces in Scope

**In scope:**
- `src/app/pages/story-detail-page.tsx` — remove BannerDisplay + BannerControls render
- `src/app/pages/point-detail-page.tsx` — remove BannerDisplay render
- `src/app/data/points-service-real.ts` — remove generateAIBanner import + call

**Out of scope:**
- `src/app/pages/profile-page-v2.tsx` — P510 design stays
- `src/app/components/shared/banner/*` — components stay for other consumers
- `src/app/data/stories-service-real.ts` — keep generateAIBanner for OG
- Database/migrations — no schema changes
- SEO/OG components — keep bannerUrl in meta tags

## Acceptance Criteria

- [x] Story detail page shows NO banner above the story card
- [x] Story detail page shows NO banner controls (pills, search input)
- [x] Point detail page shows NO banner above the point card
- [x] New points do NOT trigger generateAIBanner API call
- [x] New stories still generate banners (OG value preserved)
- [x] Story social sharing still uses bannerUrl in og:image
- [x] Story card has a subtle 3px colored top border using authorAvatarColor
- [x] Profile banner (P510) is visually unchanged
- [x] Event banner is visually unchanged
- [x] All existing P504 tests for profiles/events still pass
- [x] No console errors on story or point detail pages

## Next Steps

Run `/dev features/p519_remove_story_point_on_page_banners.md` — scope is clear, changes are targeted (3 files, removal-only + 1 accent addition).
