---
status: in-progress
type: bug
rank: 1000750.0
severity: high
workstream: C1
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [letter-flow, story-images, seal-rpc, snapshot]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P751: Letter story images missing + card width too narrow in letter/results flow

## Summary

Story images are present in authoring/draft view but missing in letter preview, recipient reading, results story-walk, and /live story-rate card. Additionally, story cards in the letter/results flow render at `max-w-sm` (384px) instead of `max-w-2xl` (672px), matching the authoring reference.

## Root Cause

**A — Seal pipeline drops the image URL:** The `seal_and_send_letter` RPC (`supabase/migrations/20260417180000_p701_scrub_title_references.sql:34–158`) builds the `point_config` JSONB with keys `storyText`, `points`, `order`, `hidden` — no `imageUrl` key. `stories.image_url` is the authoritative column (added in `20260326142007_p591_story_image_url.sql:2`); `story_versions.image_url` does not exist. Downstream, `letter-snapshot-mapper.ts` and the preview-side shim `docStoryToSnapshot()` never set `imageUrl` on `StoryWithPoints`. The render gate at `live-story-card-expanded.tsx:121` (`story.imageUrl &&`) is correct — source data is always undefined for letter-flow consumers.

**B — Width at letter-flow wrappers:** Letter/results surfaces wrap story cards at `max-w-md` (448px) and `max-w-sm` (384px). Authoring reference (`doc-detail-page.tsx:454`) uses `max-w-2xl` (672px). The `/compose` prediction walk is already at 672px — so this is letter-flow-only. Eight wrapper sites need updating; `live-mode-view.tsx` is out of scope (50 `max-w-sm` sites are dialogs/buttons, not story cards).

## Reproduction Steps

1. Create a story with an uploaded image in `/compose` (visible in authoring)
2. Compose a letter using that story
3. Navigate to `/letter/:docId/preview` — observe story card
4. Open the recipient URL `/letter/:id` — observe story card
5. Complete the letter and navigate to `/letter/:id/results` — observe story-walk
6. Join `/live/:id` as recipient, reach story-rate phase — observe story-rate card

**Reproduction rate:** 100% for any letter sealed after the story had an image

## Expected Behavior

Story image renders in the card header across all six surfaces at consistent 672px width. Images uploaded in authoring appear identically in preview, recipient view, results, and /live story-rate card.

## Actual Behavior

- Story image is missing (never renders) in: letter preview, recipient reading, results story-walk, /live story-rate card
- Story cards render at 384px (max-w-sm) or 448px (max-w-md) instead of 672px (max-w-2xl)
- /compose prediction walk is already correct (672px) — regression check surface

## Affected Files

### Seal RPC (Root Cause A — server)
- `supabase/migrations/20260417180000_p701_scrub_title_references.sql` — `jsonb_build_object(...)` missing `imageUrl` key

### Snapshot mapper (Root Cause A — client)
- `src/app/utils/letter-snapshot-mapper.ts` — line 22–26: `PointConfig` interface missing `imageUrl?:string`; line 135: output object never sets `imageUrl`; line 138: dead `title: config.storyTitle` (P701 dropped column)
- `src/app/pages/letter-preview-page.tsx` — lines 33–51: `docStoryToSnapshot()` shim missing `imageUrl`, still writes dead `storyTitle` key
- `src/app/types/index.ts:1019` — `StoryWithPoints.imageUrl?: string` already exists (no change needed)

### Width wrappers (Root Cause B)
- `src/app/components/letters/letter-flow-content.tsx` — line 187: `max-w-md`; lines 192, 220, 253, 281, 295, 317, 345: seven `max-w-sm` sites
- `src/app/components/letters/story-walk.tsx` — line 151: `max-w-sm` (do NOT touch lines 128, 185, 208)

### Not touched
- `src/app/components/partners/live-mode-view.tsx` — 50 `max-w-sm` sites are mostly dialogs/buttons; /live story-rate cards render through `letter-flow-content.tsx`
- `src/app/components/partners/live-story-card-expanded.tsx` — render gate `story.imageUrl &&` is already correct

## Severity

**High** — story images are a key trust signal in the letter flow; missing images make letter-based sharing appear unpolished. Affects every sealed letter whose story has an image.

## Fix Approach

### Server
New migration `<ts>_letter_snapshot_image_url.sql`: `CREATE OR REPLACE FUNCTION seal_and_send_letter(...)` based on P701 body, adding `'imageUrl', COALESCE(s.image_url, '')` to the `jsonb_build_object` call. Use `s.image_url` only (`story_versions` has no such column). Rollback: re-apply P701 body (additive change, no data loss).

### Client
1. `letter-snapshot-mapper.ts`: add `imageUrl?: string` to `PointConfig` (line 22–26); add `imageUrl: config.imageUrl || undefined` to output (line 135); remove dead `title: config.storyTitle` (line 138).
2. `letter-preview-page.tsx` `docStoryToSnapshot()`: remove dead `storyTitle` key; add `imageUrl: docStory.story.imageUrl`.
3. Width: replace `max-w-sm` → `max-w-2xl` and `max-w-md` → `max-w-2xl` at the eight wrapper sites above (hardcode full class strings — Tailwind JIT requires complete strings in source).

### Backfill (separate, gated on founder confirmation)
`scripts/archive/migrations/<date>-backfill-letter-snapshot-image.sql` — dry-run count first, then update `letter_story_snapshots.point_config` with current `stories.image_url` for rows where `point_config->>'imageUrl'` IS NULL.

## Acceptance Criteria

- [ ] Story image visible in `/letter/:docId/preview` when story has an image
- [ ] Story image visible in recipient URL `/letter/:id`
- [ ] Story image visible in `/letter/:id/results` story-walk
- [ ] Story image visible in `/live/:id` story-rate phase
- [ ] `/compose` prediction walk still shows image (regression check — already working)
- [ ] Story cards in letter/results flow render at 672px width (`max-w-2xl`) — not 384px
- [ ] Mobile (375px): `w-full max-w-2xl mx-auto` degrades without horizontal scroll
- [ ] Image aspect ratio at 672px does not visually dominate the card (flag if `PointRow` density needs adjustment)
- [x] Unit tests pass: `snapshotToStoryWithPoints` passes through `imageUrl` when present, returns `undefined` when absent (`src/tests/letter-snapshot-mapper.test.ts`)
- [x] Migration applies cleanly on test DB; integration test written (`e2e/integration/20260418120000_p751_letter_snapshot_image_url.spec.ts`)
- [x] `./scripts/pre-commit-checks.sh` passes (all 1902 unit tests green, TS clean, no lint errors)
- [ ] Story image visible in `/letter/:docId/preview` when story has an image — browser verify needed
- [ ] Story image visible in recipient URL `/letter/:id` — browser verify needed
- [ ] Story image visible in `/live/:id` story-rate phase — browser verify needed
- [ ] Story cards in letter/results flow render at 672px width (`max-w-2xl`) — browser verify needed
- [ ] Mobile (375px): `w-full max-w-2xl mx-auto` degrades without horizontal scroll
- [ ] Image aspect ratio at 672px does not visually dominate the card
- [ ] No console errors during letter preview, recipient, results, or /live story-rate flows
