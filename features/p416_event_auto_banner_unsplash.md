---
status: today
type: story
rank: 125468.0
workstream: C1
created_date: 2026-02-23
tags: []
uat_file: features/uat/p416.md
test_files:
  - src/tests/extractBannerKeywords.test.ts
  - e2e/integration/p416-event-banner-migration.spec.ts
  - e2e/p416-event-auto-banner.spec.ts
  - e2e/p416-smoke.spec.ts
---

# P416: Event Auto-Banner via Unsplash

## Problem

Events look bare without images. Coaches shouldn't need to find or upload photos manually — the platform should handle it automatically when an event is created.

## Solution

When an event is created, extract keywords from the title, fetch a relevant landscape photo from Unsplash, and store the URL as `banner_url`. Display the banner on the event detail page (already wired up) and on event cards in the list view. Host-only Regenerate and Remove controls allow replacing or clearing the auto-picked image.

## Technical Notes

- `banner_url TEXT` column already exists on `events` table (added in migration `20260223140000_p416_event_banner_url.sql`)
- `EventDetail.tsx` already displays banner when `bannerUrl` is set (manual patch deployed to prod)
- `UNSPLASH_ACCESS_KEY` already configured in `.env.local` — client-side usage is fine (read-only key)
- Unsplash API: `GET /search/photos?query={keyword}&orientation=landscape&per_page=5` → use first result
- Keyword extraction: strip common words (Clarity, Lab, Session, Workshop, Event, #1, numbers) → use remaining meaningful words
- Fallback: if Unsplash fails or returns no results → leave `banner_url` null (gradient shows)
- Regenerate: calls Unsplash again with same keyword, picks result at random index (not always first) to get variety
- Remove: sets `banner_url = null` via `updateEvent()`
- Both Regenerate/Remove use existing `updateEvent()` service method

## UI Spec

### Event cards (list view)
```
┌─────────────────────────────────┐
│ [Banner image - 16:9, top]      │
├─────────────────────────────────┤
│ Event Name                      │
│ 📅 Date · 📍 Location           │
└─────────────────────────────────┘
```
No banner → no image slot (gradient header on detail page only).

### Regenerate/Remove buttons (detail page, host only)
```
┌─────────────────────────────────┐
│                                 │
│  [Banner image]        [🔄] [✕] │ ← bottom-right, over image
└─────────────────────────────────┘
```
- `bg-black/50 backdrop-blur-sm text-white rounded-full px-2 py-1`
- Visible only when `isHost === true`
- 🔄 = RefreshCw icon + "New banner" label | ✕ = X icon + "Remove banner" label
- After remove: image disappears, gradient shows, Regenerate still works

## Acceptance Criteria

- [ ] Creating an event auto-fetches an Unsplash photo and stores URL
- [ ] Banner displays on event detail page (already done — verify still works)
- [ ] Banner displays on event cards in events list
- [ ] Gradient fallback shows when no banner
- [ ] Host sees Regenerate button on detail page → fetches new photo
- [ ] Host sees Remove button on detail page → clears banner, gradient shows
- [ ] After Remove, Regenerate still works (fetches new photo)
- [ ] Non-host users do not see Regenerate/Remove buttons
- [ ] Unsplash failure is silent (no error toast, gradient fallback)

## Testing

- Create an event → check `banner_url` is set in DB
- View event page → banner image appears
- View events list → banner thumbnail appears on card
- As host: click Regenerate → new image loads
- As host: click Remove → image gone, gradient shows
- As non-host: Regenerate/Remove buttons not visible

---

## Test Coverage Strategy

**What's Tested:**
- ✅ Keyword extraction logic (unit) — Pure function with edge cases; wrong stripping = wrong Unsplash query
- ✅ `banner_url` column schema + RLS (integration, MANDATORY P270) — Two-client pattern; host can write own event, non-host blocked
- ✅ Banner display on detail page (E2E) — Seeded via `supabaseAdmin`, no Unsplash dependency
- ✅ Gradient fallback when no banner (E2E) — Verify no `<img>` with unsplash src
- ✅ Banner on event cards in list (E2E) — Critical visual feature; regression risk
- ✅ Host sees "New banner" + "Remove banner" buttons (E2E) — Auth-gated UI; easy to accidentally remove the guard
- ✅ Non-host / anonymous: no controls visible (E2E) — Security: host-only controls
- ✅ Remove clears banner + gradient shows (E2E) — Mocked Unsplash via `page.route()`
- ✅ "New banner" works after Remove (E2E) — Mocked Unsplash; validates the "no banner → Regenerate" path
- ✅ Smoke: pages load without console errors (smoke)

**What's NOT Tested (rationale):**
- ❌ Real Unsplash API call on event creation — External API; flaky in CI. Covered in UAT-1.1 manually
- ❌ Unsplash network failure fallback — Hard to reproduce reliably in E2E. Covered in UAT-1.2 manually
- ❌ Auto-banner triggered in create form flow — Would require Unsplash mock in create form; covered by integration test (column writable) + UAT-1.1
- ❌ Loading state during Regenerate — Visual-only; covered in UAT-4.2

**Test Pyramid:**
```
       /\
      /  \   8 E2E tests
     /    \
    /______\
   / 4 INT  \
  /__________\
 / 11 UNIT   \
```

**Files Generated:**
- `src/tests/extractBannerKeywords.test.ts` — 11 unit tests
- `e2e/integration/p416-event-banner-migration.spec.ts` — 4 integration tests
- `e2e/p416-event-auto-banner.spec.ts` — 8 E2E tests
- `e2e/p416-smoke.spec.ts` — 3 smoke tests
- `features/uat/p416.md` — 12 UAT scenarios

**Estimated run time:** ~20 seconds (unit: <1s, integration: ~5s, E2E: ~15s)

**Next step:** Run `/dev features/p416_event_auto_banner_unsplash.md`
