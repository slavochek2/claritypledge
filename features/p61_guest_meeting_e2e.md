# P61: Guest Meeting E2E Test Coverage

## Problem Statement

The P50 "non-pledger experience" implementation had a critical bug that wasn't caught by unit tests: the `has_pledged` column migration wasn't applied to the database. Unit tests passed because they mock Supabase calls, but real users saw "Failed to create user record" errors.

**Root cause:** Schema drift between `schema.sql` and the live database.

## Solution

Add E2E tests that exercise the actual guest meeting flow against the real database, catching:
- Missing columns/migrations
- RLS policy issues
- Anonymous auth configuration problems
- Consent mechanism failures

## Acceptance Criteria

- [ ] E2E test: Guest can create a new meeting without logging in
- [ ] E2E test: Guest can join an existing meeting via code
- [ ] E2E test: Verified user is prompted to log in (not allowed as guest)
- [ ] E2E test: Consent checkbox is required before creating/joining
- [ ] Tests run in CI pipeline before merge

## E2E Test Specifications

### Test 1: Guest Creates New Meeting

```typescript
test('guest can create a new meeting', async ({ page }) => {
  await page.goto('/live');

  // Fill guest registration form
  await page.fill('[placeholder*="call you"]', 'Test Guest');
  await page.fill('[placeholder*="email"]', `test-${Date.now()}@example.com`);

  // Must check consent before button enables
  const newMeetingBtn = page.getByRole('button', { name: /new meeting/i });
  await expect(newMeetingBtn).toBeDisabled();

  await page.check('input[type="checkbox"]');
  await expect(newMeetingBtn).toBeEnabled();

  // Create meeting
  await newMeetingBtn.click();

  // Should NOT see error message
  await expect(page.locator('text=Failed')).not.toBeVisible({ timeout: 10000 });

  // Should navigate to session with code in URL
  await expect(page).toHaveURL(/\/live\/[A-Z0-9-]+/, { timeout: 15000 });
});
```

### Test 2: Guest Joins Existing Meeting

```typescript
test('guest can join an existing meeting via code', async ({ page, context }) => {
  // First create a meeting to get a valid code
  const creatorPage = await context.newPage();
  await creatorPage.goto('/live');
  await creatorPage.fill('[placeholder*="call you"]', 'Creator');
  await creatorPage.fill('[placeholder*="email"]', `creator-${Date.now()}@example.com`);
  await creatorPage.check('input[type="checkbox"]');
  await creatorPage.click('button:has-text("New meeting")');
  await creatorPage.waitForURL(/\/live\/[A-Z0-9-]+/);

  // Extract session code from URL
  const sessionCode = creatorPage.url().split('/live/')[1];

  // Now join as guest
  await page.goto('/live');
  await page.fill('[placeholder*="call you"]', 'Joiner');
  await page.fill('[placeholder*="email"]', `joiner-${Date.now()}@example.com`);
  await page.check('input[type="checkbox"]');
  await page.fill('[placeholder*="code or link"]', sessionCode);
  await page.click('button:has-text("Join")');

  // Should join the session
  await expect(page).toHaveURL(new RegExp(`/live/${sessionCode}`), { timeout: 15000 });
});
```

### Test 3: Verified User Must Log In

```typescript
test('verified user is prompted to log in', async ({ page }) => {
  // Use a known verified user's email (from test fixtures)
  await page.goto('/live');
  await page.fill('[placeholder*="call you"]', 'Existing User');
  await page.fill('[placeholder*="email"]', 'verified-user@example.com'); // Must exist in DB
  await page.check('input[type="checkbox"]');
  await page.click('button:has-text("New meeting")');

  // Should show login prompt, not create meeting
  await expect(page.locator('text=/log in|account exists/i')).toBeVisible({ timeout: 10000 });
});
```

### Test 4: Consent Required

```typescript
test('consent checkbox is required before creating meeting', async ({ page }) => {
  await page.goto('/live');
  await page.fill('[placeholder*="call you"]', 'Test User');
  await page.fill('[placeholder*="email"]', 'test@example.com');

  // Button should be disabled without consent
  const newMeetingBtn = page.getByRole('button', { name: /new meeting/i });
  await expect(newMeetingBtn).toBeDisabled();

  // Check consent
  await page.check('input[type="checkbox"]');
  await expect(newMeetingBtn).toBeEnabled();

  // Uncheck consent
  await page.uncheck('input[type="checkbox"]');
  await expect(newMeetingBtn).toBeDisabled();
});
```

## Implementation Notes

1. **Test isolation:** Use unique emails with timestamps to avoid conflicts
2. **Cleanup:** Consider adding test user cleanup in `globalTeardown`
3. **CI configuration:** Ensure Supabase test project has:
   - Anonymous auth enabled
   - All migrations applied
   - Test service role key in `.env.test.local`

## Related Issues

- P50: Non-pledger experience (Phase 1)
- P37.2a: Recording consent mechanism
- B50: Guest user handling fixes

## Dependencies

- Playwright configured with test Supabase instance
- Anonymous auth enabled in Supabase dashboard
- `has_pledged` and `accepted_terms_version` columns in profiles table
