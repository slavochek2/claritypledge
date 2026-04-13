---
status: all-done
type: feature
rank: 125468
workstream: foundation
created_date: 2026-02-24T00:00:00.000Z
tags: []
uat_file: features/uat/p418.md
test_files:
  - e2e/p418-banner-search-fallback.spec.ts
  - e2e/a11y/p418-accessibility.spec.ts
locked_at: '2026-02-26T04:17:22.327Z'
---

# P418: Banner Search Fallback

## Problem

When "New banner" is clicked and Unsplash returns no results (e.g. niche/gibberish event title), the user sees a toast error with no recourse. They're stuck with whatever banner was auto-assigned at creation.

## Solution

When `regenerateUnsplashBanner` returns null, reveal an inline text input directly below the banner action buttons. The user types custom keywords and retries the Unsplash search. On success the banner updates; on failure the input stays visible with a new error message.

**UI (inline, no dialog):**
```
[New banner] [Remove banner]
[trail running_____________] [Search]
```

The input appears only on failure — zero friction on the happy path.

## UX Design

**Default state** (page load — no interaction):
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              [banner image]              [New] [Remove]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**After "New banner" fails** (Unsplash returns 0 results):
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              [banner image]              [New] [Remove]    │
│                                [trail running_______] [🔍] │
└─────────────────────────────────────────────────────────────┘
```

**After custom search also fails:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              [banner image]              [New] [Remove]    │
│                                [xyzxyz_______________] [🔍] │
│             No photos found — try different keywords        │
└─────────────────────────────────────────────────────────────┘
```

**After custom search succeeds:** input disappears, new banner shown. Back to default state.

## Technical Notes

- `handleRegenerateBanner` in `EventDetail.tsx` — add state for `showBannerSearch: boolean`
- On null result from `regenerateUnsplashBanner`, set `showBannerSearch = true` instead of (or in addition to) showing toast
- New `handleBannerSearch(keywords)` handler: calls `regenerateUnsplashBanner`, updates banner or shows inline error
- `banner-utils.ts` — no changes needed, `regenerateUnsplashBanner` already accepts arbitrary keywords
- Input should clear on success and hide; persist on failure so user can refine

## Acceptance Criteria

- [ ] Clicking "New banner" on an event with a valid title still works as before (no regression)
- [ ] When auto-search returns no results, a text input appears below the banner buttons
- [ ] Typing keywords and submitting fetches from Unsplash and updates the banner
- [ ] On search success: input hides, banner updates
- [ ] On search failure: input stays, shows inline error (e.g. "No photos found — try different keywords")
- [ ] Input is not shown on initial page load — only appears after a failed auto-search

## Testing

Run `npm run test` for unit tests. E2E via `npx playwright test p418` or `/verify` on an event with a gibberish title.

## Test Coverage Strategy

**What's Tested:**
- ✅ Regression — happy path (E2E): "New banner" with valid keywords still works, no search input shown
- ✅ Failure state (E2E): Unsplash returns empty → inline input appears
- ✅ Custom search success (E2E): input hides, banner + DB updated
- ✅ Custom search failure (E2E): input stays, inline error shown
- ✅ Load state (E2E + smoke): input absent on page load
- ✅ Keyboard accessibility (a11y): input focusable, Enter submits, accessible label

**What's NOT Tested:**
- ❌ Unit tests — `banner-utils.ts` unchanged; no new utility logic added
- ❌ Integration tests — no DB schema changes

**Test Pyramid:**
```
     /\
    /  \   4 E2E tests (+ 2 smoke)
   /____\
  /  —   \  no integration
 /________\
/  —       \  no unit
```

**Files Generated:**
- `e2e/p418-banner-search-fallback.spec.ts` — 5 E2E tests
- `e2e/p418-smoke.spec.ts` — 2 smoke tests
- `e2e/a11y/p418-accessibility.spec.ts` — 3 accessibility tests
- `features/uat/p418.md` — 6 UAT scenarios

**Total:** 10 automated tests + 6 UAT scenarios
