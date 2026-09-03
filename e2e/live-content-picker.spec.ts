/**
 * E2E tests for P128: Live Beginning Screen - Content Picker
 *
 * Tests the content selection flow for /live sessions:
 * - Story selection
 * - Point selection
 * - returnTo navigation (event back navigation)
 * - Security: returnTo validation against open redirects
 *
 * Two-party sync: Supabase postgres_changes DO propagate between Playwright
 * contexts. State delivery works via Realtime + 1s drift polling without
 * page.reload(). See e2e/helpers/test-realtime.ts and docs/technical/e2e-testing-guide.md.
 * page.reload() is BANNED for two-party state sync (P637/P644).
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { mockMicPermission, waitForDBPresence } from './helpers/test-realtime';
import { supabaseAdmin } from './helpers/supabase-admin';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

test.describe('Live Content Picker - P128', () => {
  test('Happy path: Select story for verification', async ({ browser }) => {
    // Create test user who will create a story
    const testUser = await createTestUser({
      name: 'Story Creator',
      email: `story-creator-${Date.now()}@gmail.com`,
    });

    // Create a test story via Supabase Admin
    const { data: story, error: storyError } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content: 'Test Story: Remote work has changed how teams collaborate',
        tags: ['remote-work', 'collaboration'],
        visibility: 'public',
      })
      .select('*')
      .single();

    if (storyError || !story) {
      throw new Error(`Failed to create test story: ${storyError?.message}`);
    }

    console.log(`[Test] Created story: ${story.id}`);

    // Create two browser contexts
    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const joinerContext = await browser.newContext({ permissions: ['microphone'] });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Mock getUserMedia for both pages (must be called before any navigation)
    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;

    try {
      // Set authenticated session for creator
      await setTestSession(creatorPage, testUser.email);

      // Creator starts a meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');

      // Authenticated users skip the form and go straight to "New meeting"
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      // Get room code
      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;
      console.log(`[Test] Room code: ${roomCode}`);

      // Joiner joins the meeting
      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.waitForLoadState('networkidle');
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      // Button text is "Join as Guest" for unauthenticated users (P396 guest-only join)
      await joinerPage.getByRole('button', { name: 'Join as Guest' }).click();

      // Wait for joiner_name to appear in DB (sync point), then wait for UI delivery
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Test Joiner', 'code', roomCode, 20000);

      // P644: No page.reload() — let Realtime + drift polling deliver the state
      await expect(creatorPage.getByRole('button', { name: /understand you\?/i })).toBeVisible({ timeout: 20000 });

      // Joiner page transitions to idle after join — allow up to 20s for Realtime/polling to kick in
      await expect(joinerPage.getByRole('button', { name: /understand you\?/i })).toBeVisible({ timeout: 20000 });

      // Creator should see story search picker (StorySearchPicker renders when user has stories)
      await expect(creatorPage.getByPlaceholder('Search your stories…')).toBeVisible({ timeout: 10000 });

      console.log('[Test] Creator + joiner connected, both at idle screen');

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
      // Clean up story
      await supabaseAdmin.from('stories').delete().eq('id', story.id);
      await deleteTestUser(testUser.user.id);
    }
  });

  // TODO(p460): Needs DB poll + reload pattern applied — individual skip until fixed
  test.skip('Happy path: Select point for verification', async ({ browser }) => {
    // Create test user who will create a point
    const testUser = await createTestUser({
      name: 'Point Creator',
      email: `point-creator-${Date.now()}@gmail.com`,
    });

    // Create a test point via Supabase Admin
    const { data: point, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Remote work is more productive than office work',
        first_validator_id: testUser.user.id,
        tags: ['remote-work', 'productivity'],
      })
      .select('*')
      .single();

    if (pointError || !point) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }

    console.log(`[Test] Created point: ${point.id}`);

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const joinerContext = await browser.newContext({ permissions: ['microphone'] });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;

    try {
      // Set authenticated session for creator
      await setTestSession(creatorPage, testUser.email);

      // Creator starts meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Joiner joins
      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.waitForLoadState('networkidle');
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');
      await joinerPage.getByRole('button', { name: 'Join as Guest' }).click();

      // P644: Wait for DB sync, then let Realtime + drift polling deliver to UI (no reload)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Test Joiner', 'code', roomCode, 20000);

      // Both in live view — delivered via app's own mechanisms
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 20000 });
      await expect(joinerPage.getByText('Point Creator')).toBeVisible({ timeout: 20000 });

      // Wait for the "Did you get me?" button to appear (indicates live mode is active)
      await expect(creatorPage.getByRole('button', { name: /Did you get me?|Do you understand/i })).toBeVisible({ timeout: 20000 });

      // Creator should see content picker with the point
      await expect(creatorPage.getByTestId('content-picker')).toBeVisible({ timeout: 10000 });

      // Point card should be visible
      const pointCard = creatorPage.getByTestId(`live-point-card-${point.id}`);
      await expect(pointCard).toBeVisible();
      await expect(pointCard).toContainText('Remote work is more productive');

      // Click on point card to select it
      await pointCard.click();

      // After selection, should see position buttons or rating interface
      await expect(creatorPage.getByText(/agree|disagree|position/i)).toBeVisible({ timeout: 5000 });

      console.log('[Test] Point selection successful');

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
      // Clean up point
      await supabaseAdmin.from('points').delete().eq('id', point.id);
      await deleteTestUser(testUser.user.id);
    }
  });

  // TODO(p460): Needs DB poll + reload pattern applied — individual skip until fixed
  test.skip('Edge case: returnTo navigation', async ({ browser }) => {
    // Test that returnTo param enables "Back to event" navigation
    const testUser = await createTestUser({
      name: 'Event Host',
      email: `event-host-${Date.now()}@gmail.com`,
    });

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const creatorPage = await creatorContext.newPage();

    await mockMicPermission(creatorPage);

    let roomCode: string | null = null;

    try {
      // Set authenticated session
      await setTestSession(creatorPage, testUser.email);

      // Navigate with returnTo param
      await creatorPage.goto('/live?returnTo=/events/test-event-123');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Create a joiner to get to live view
      const joinerContext = await browser.newContext({ permissions: ['microphone'] });
      const joinerPage = await joinerContext.newPage();
      await mockMicPermission(joinerPage);

      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.waitForLoadState('networkidle');
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');
      await joinerPage.getByRole('button', { name: 'Join as Guest' }).click();

      // P644: Wait for DB sync, then let Realtime + drift polling deliver (no reload)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Test Joiner', 'code', roomCode, 20000);
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 20000 });

      // Open menu and check for "Back to event" button
      await creatorPage.getByRole('button', { name: /menu|settings/i }).click();
      const backToEventButton = creatorPage.getByText('Back to event');
      await expect(backToEventButton).toBeVisible();

      // Click "Back to event" - should navigate to returnTo URL
      await backToEventButton.click();

      // Should navigate to the returnTo URL
      await expect(creatorPage).toHaveURL('/events/test-event-123', { timeout: 5000 });

      console.log('[Test] returnTo navigation successful');

      await joinerContext.close();

    } finally {
      await creatorContext.close();
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
      await deleteTestUser(testUser.user.id);
    }
  });

  // TODO(p460): Needs DB poll + reload pattern applied — individual skip until fixed
  test.skip('Security: Invalid returnTo rejected', async ({ browser }) => {
    // Test that external URLs in returnTo are rejected (security)
    const testUser = await createTestUser({
      name: 'Security Tester',
      email: `security-test-${Date.now()}@gmail.com`,
    });

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const creatorPage = await creatorContext.newPage();

    await mockMicPermission(creatorPage);

    let roomCode: string | null = null;

    try {
      // Set authenticated session
      await setTestSession(creatorPage, testUser.email);

      // Navigate with MALICIOUS returnTo param (external URL)
      await creatorPage.goto('/live?returnTo=https://evil.com/phishing');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Create joiner to get to live view
      const joinerContext = await browser.newContext({ permissions: ['microphone'] });
      const joinerPage = await joinerContext.newPage();
      await mockMicPermission(joinerPage);

      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      // P1232: P396 removed the guest email input and the consent checkbox.
      // "Join Session" now renders only on the auto-join ERROR path, so an
      // unconditional click hangs; a guard keyed on the removed email input
      // is always false and skips the join entirely. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);

      // P644: Wait for DB sync, then let Realtime + drift polling deliver (no reload)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Test Joiner', 'code', roomCode, 20000);
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 20000 });

      // Open menu - should show "Leave Session" NOT "Back to event"
      await creatorPage.getByRole('button', { name: /menu|settings/i }).click();
      const leaveSessionButton = creatorPage.getByText('Leave Session');
      await expect(leaveSessionButton).toBeVisible();

      // Verify "Back to event" does NOT appear (malicious URL rejected)
      const backToEventButton = creatorPage.getByText('Back to event');
      await expect(backToEventButton).not.toBeVisible();

      // Click "Leave Session" - should NOT navigate to evil.com
      await leaveSessionButton.click();

      // Should navigate back to /live or stay on current domain
      // Should NOT navigate to https://evil.com
      await creatorPage.waitForTimeout(1000);
      const currentUrl = creatorPage.url();
      expect(currentUrl).not.toContain('evil.com');
      expect(currentUrl).toContain('claritypledge'); // or localhost in dev

      console.log('[Test] Security check passed - external URL rejected');

      await joinerContext.close();

    } finally {
      await creatorContext.close();
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
      await deleteTestUser(testUser.user.id);
    }
  });

  // TODO(p460): Needs DB poll + reload pattern applied — individual skip until fixed
  test.skip('Security: Protocol-relative URLs rejected', async ({ browser }) => {
    // Test that protocol-relative URLs (//evil.com) are also rejected
    const testUser = await createTestUser({
      name: 'Protocol Test',
      email: `protocol-test-${Date.now()}@gmail.com`,
    });

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const creatorPage = await creatorContext.newPage();

    await mockMicPermission(creatorPage);

    let roomCode: string | null = null;

    try {
      await setTestSession(creatorPage, testUser.email);

      // Navigate with protocol-relative URL (another attack vector)
      await creatorPage.goto('/live?returnTo=//evil.com/phishing');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Create joiner
      const joinerContext = await browser.newContext({ permissions: ['microphone'] });
      const joinerPage = await joinerContext.newPage();
      await mockMicPermission(joinerPage);

      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      // P1232: P396 removed the guest email input and the consent checkbox.
      // "Join Session" now renders only on the auto-join ERROR path, so an
      // unconditional click hangs; a guard keyed on the removed email input
      // is always false and skips the join entirely. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);

      // P644: Wait for DB sync, then let Realtime + drift polling deliver (no reload)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Test Joiner', 'code', roomCode, 20000);
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 20000 });

      // Open menu - should show "Leave Session" NOT "Back to event"
      await creatorPage.getByRole('button', { name: /menu|settings/i }).click();

      // Protocol-relative URL should be rejected
      const backToEventButton = creatorPage.getByText('Back to event');
      await expect(backToEventButton).not.toBeVisible();

      const leaveSessionButton = creatorPage.getByText('Leave Session');
      await expect(leaveSessionButton).toBeVisible();

      console.log('[Test] Protocol-relative URL correctly rejected');

      await joinerContext.close();

    } finally {
      await creatorContext.close();
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
      await deleteTestUser(testUser.user.id);
    }
  });
});
