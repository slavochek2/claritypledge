# B50: Missing Banners on Live Meeting Screens

## Summary

Several screens in the Live Meeting flow (`/live`) are missing the `LiveSessionBanner` header, creating visual inconsistency. When a user creates or joins a meeting, some intermediate screens show no navigation/branding at all.

## Affected Screens

| Screen | File:Line | Current State | Expected State |
|--------|-----------|---------------|----------------|
| Start (main - create/join) | clarity-live-page.tsx:1545 | No banner | Has `LiveSessionBanner` |
| Start (auth loading) | clarity-live-page.tsx:1536 | No banner | Has `LiveSessionBanner` |
| Restoring session | clarity-live-page.tsx:1459 | No banner | Has `LiveSessionBanner` |

## Screens That Correctly Have Banners

- Partner left / Session ended (line 1443) ✅
- Start (join via link) (line 1473) ✅
- Waiting for partner (line 1718) ✅
- All Live view sub-screens via `LiveHeader` ✅

## Reproduction Steps

1. Navigate to `localhost:5100/live` (or production `/live`)
2. Observe: No header banner, just centered form
3. Enter name and click "New meeting"
4. Observe: Waiting screen now HAS banner "Waiting for Partner"
5. **Inconsistency**: Start screen has no branding, Waiting screen does

### Secondary reproduction (loading states):

1. Navigate to `/live` on slow network
2. During auth check, see plain "Loading..." with no banner
3. After loading, see centered form with no banner

## Root Cause

The start view (line 1545) uses a different layout pattern than other views:

```tsx
// Missing banner - just centered content
return (
  <div className="container mx-auto px-4 max-w-md min-h-screen flex flex-col justify-center">
    {/* No LiveSessionBanner */}
    <div className="space-y-6">...form...</div>
  </div>
);
```

vs. other views that use:

```tsx
// Has banner - proper structure
return (
  <div className="flex flex-col h-screen">
    <LiveSessionBanner title="..." isLiveMeeting={false} />
    <div className="flex-1 ...">...content...</div>
  </div>
);
```

## Fix Approach

Add `LiveSessionBanner` to all 3 missing screens with appropriate titles:

1. **Start (main)**: `title="Clarity Meeting"` with `isLiveMeeting={false}`
2. **Auth loading**: Same as start
3. **Restoring session**: `title="Clarity Meeting"` or "Reconnecting..."

## Prevention

Add Playwright E2E tests that verify `LiveSessionBanner` is present on ALL `/live` screens:

```typescript
// e2e/live-meeting-banners.spec.ts
test('start screen has banner', async ({ page }) => {
  await page.goto('/live');
  await expect(page.getByRole('banner')).toBeVisible();
  // Or check for logo/navigation element
});
```

## Acceptance Criteria

- [x] `/live` start screen shows `LiveSessionBanner` with "Clarity Meeting"
- [x] Loading states show `LiveSessionBanner`
- [x] Visual consistency across all `/live` screens
- [x] E2E test ensures banner presence (prevents regression)
- [x] Mobile and desktop verified via Playwright

## Testing

- Unit: N/A (visual/layout concern)
- E2E: New `e2e/live-meeting-banners.spec.ts`
- Visual: Playwright screenshot comparison

## Priority

Medium - UX polish, brand consistency

## Related

- P23: Live Clarity Meetings (parent feature)
- B48: Microphone permission flow (recent changes to this area)
