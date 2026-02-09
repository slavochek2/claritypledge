/**
 * E2E tests for P128: Live Beginning Screen - Content Picker
 *
 * Tests the content selection flow for /live sessions:
 * - Story selection
 * - Point selection
 * - returnTo navigation (event back navigation)
 * - Security: returnTo validation against open redirects
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

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

    // Mock getUserMedia for both pages
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);
    await joinerPage.addInitScript(mockMicScript);

    let roomCode: string | null = null;

    try {
      // Set authenticated session for creator
      await setTestSession(creatorPage, testUser.email);

      // Creator starts a meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');

      // Authenticated users skip the form and go straight to "New meeting"
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      // Get room code
      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Joiner joins the meeting
      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      const joinerEmailInput = joinerPage.getByPlaceholder('your@email.com');
      if (await joinerEmailInput.isVisible()) {
        await joinerEmailInput.fill('joiner@test.com');
      }

      const joinerCheckbox = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox.isVisible()) {
        await joinerCheckbox.check();
      }

      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // Both users should transition to live view
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByText('Story Creator')).toBeVisible({ timeout: 15000 });

      // Creator should see content picker with the story
      await expect(creatorPage.getByTestId('content-picker')).toBeVisible({ timeout: 5000 });

      // Story card should be visible with preview text
      const storyCard = creatorPage.getByTestId(`live-story-card-${story.id}`);
      await expect(storyCard).toBeVisible();
      await expect(storyCard).toContainText('Remote work has changed');

      // Click on story card to select it
      await storyCard.click();

      // After selection, should see rating interface or content display
      // (Exact flow depends on P128 implementation - adjust as needed)
      await expect(creatorPage.getByText(/understand|rating/i)).toBeVisible({ timeout: 5000 });

      console.log('[Test] Story selection successful');

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

  test('Happy path: Select point for verification', async ({ browser }) => {
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
        context: 'Based on personal experience and team feedback',
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

    // Mock getUserMedia
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);
    await joinerPage.addInitScript(mockMicScript);

    let roomCode: string | null = null;

    try {
      // Set authenticated session for creator
      await setTestSession(creatorPage, testUser.email);

      // Creator starts meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Joiner joins
      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      const joinerEmailInput = joinerPage.getByPlaceholder('your@email.com');
      if (await joinerEmailInput.isVisible()) {
        await joinerEmailInput.fill('joiner@test.com');
      }

      const joinerCheckbox = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox.isVisible()) {
        await joinerCheckbox.check();
      }

      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // Both in live view
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByText('Point Creator')).toBeVisible({ timeout: 15000 });

      // Creator should see content picker with the point
      await expect(creatorPage.getByTestId('content-picker')).toBeVisible({ timeout: 5000 });

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

  test('Edge case: returnTo navigation', async ({ browser }) => {
    // Test that returnTo param enables "Back to event" navigation
    const testUser = await createTestUser({
      name: 'Event Host',
      email: `event-host-${Date.now()}@gmail.com`,
    });

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const creatorPage = await creatorContext.newPage();

    // Mock getUserMedia
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);

    let roomCode: string | null = null;

    try {
      // Set authenticated session
      await setTestSession(creatorPage, testUser.email);

      // Navigate with returnTo param
      await creatorPage.goto('/live?returnTo=/events/test-event-123');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Create a joiner to get to live view
      const joinerContext = await browser.newContext({ permissions: ['microphone'] });
      const joinerPage = await joinerContext.newPage();
      await joinerPage.addInitScript(mockMicScript);

      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      const joinerEmailInput = joinerPage.getByPlaceholder('your@email.com');
      if (await joinerEmailInput.isVisible()) {
        await joinerEmailInput.fill('joiner@test.com');
      }

      const joinerCheckbox = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox.isVisible()) {
        await joinerCheckbox.check();
      }

      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // Wait for live view
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 15000 });

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

  test('Security: Invalid returnTo rejected', async ({ browser }) => {
    // Test that external URLs in returnTo are rejected (security)
    const testUser = await createTestUser({
      name: 'Security Tester',
      email: `security-test-${Date.now()}@gmail.com`,
    });

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const creatorPage = await creatorContext.newPage();

    // Mock getUserMedia
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);

    let roomCode: string | null = null;

    try {
      // Set authenticated session
      await setTestSession(creatorPage, testUser.email);

      // Navigate with MALICIOUS returnTo param (external URL)
      await creatorPage.goto('/live?returnTo=https://evil.com/phishing');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Create joiner to get to live view
      const joinerContext = await browser.newContext({ permissions: ['microphone'] });
      const joinerPage = await joinerContext.newPage();
      await joinerPage.addInitScript(mockMicScript);

      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      const joinerEmailInput = joinerPage.getByPlaceholder('your@email.com');
      if (await joinerEmailInput.isVisible()) {
        await joinerEmailInput.fill('joiner@test.com');
      }

      const joinerCheckbox = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox.isVisible()) {
        await joinerCheckbox.check();
      }

      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // Wait for live view
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 15000 });

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

  test('Security: Protocol-relative URLs rejected', async ({ browser }) => {
    // Test that protocol-relative URLs (//evil.com) are also rejected
    const testUser = await createTestUser({
      name: 'Protocol Test',
      email: `protocol-test-${Date.now()}@gmail.com`,
    });

    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const creatorPage = await creatorContext.newPage();

    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);

    let roomCode: string | null = null;

    try {
      await setTestSession(creatorPage, testUser.email);

      // Navigate with protocol-relative URL (another attack vector)
      await creatorPage.goto('/live?returnTo=//evil.com/phishing');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Create joiner
      const joinerContext = await browser.newContext({ permissions: ['microphone'] });
      const joinerPage = await joinerContext.newPage();
      await joinerPage.addInitScript(mockMicScript);

      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Test Joiner');

      const joinerEmailInput = joinerPage.getByPlaceholder('your@email.com');
      if (await joinerEmailInput.isVisible()) {
        await joinerEmailInput.fill('joiner@test.com');
      }

      const joinerCheckbox = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox.isVisible()) {
        await joinerCheckbox.check();
      }

      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // Wait for live view
      await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 15000 });

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
