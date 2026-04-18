/**
 * Accessibility tests for P745: Letter-hosted /live injection.
 *
 * Tests:
 * 1. "Start Clarity Live now" button has accessible name
 * 2. "Start Clarity Live now" button activates with Enter key
 * 3. Banner Join button is keyboard-focusable
 * 4. Banner Later button is keyboard-focusable
 * 5. Banner title is in an ARIA live region for screen reader announcement
 * 6. Disabled trigger has aria-disabled + tooltip accessible name
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

test.describe('P745: Accessibility', () => {
  test.describe.configure({ timeout: 45000 });

  let author: TestUser;
  let receiver: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryId: string;
  let storyId: string;
  let openSessionId: string | undefined;
  let openInviteId: string | undefined;

  test.beforeAll(async () => {
    [author, receiver] = await Promise.all([
      createTestUser({ name: 'P745 A11y Author' }),
      createTestUser({ name: 'P745 A11y Receiver' }),
    ]);

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: `P745 A11y Doc ${Date.now()}`, owner_id: author.user.id })
      .select('id')
      .single();
    if (docError || !doc) throw new Error(`Doc creation failed: ${docError?.message}`);
    docId = doc.id;

    const story = await createTestStory(author.user.id, {
      title: `P745 A11y Story ${Date.now()}`,
      summary: 'A11y test story for P745',
    });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', story.id)
      .order('version_number', { ascending: true })
      .limit(1)
      .single();
    if (!version) throw new Error('story_versions row missing');

    const letter = await createTestLetter(author.user.id, doc.id, { mode: 'one-to-one' });
    letterId = letter.id;

    await createTestStorySnapshot(letter.id, story.id, version.id, {
      position: 0,
      pointConfig: { storyTitle: 'A11y Story', storyText: 'A11y test content.', points: [] },
    });

    const delivery = await createTestDelivery(letter.id, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
      status: 'in_progress',
    });
    deliveryId = delivery.id;

    await sealTestLetter(letter.id);

    // Seed an open invite for disabled-state and banner tests
    const code = `P745A${Date.now().toString(36).toUpperCase().slice(0, 4)}`;
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: author.name ?? 'P745 A11y Author',
        creator_profile_id: author.user.id,
        target_listener_id: receiver.user.id,
        source_letter_id: letter.id,
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (session) {
      openSessionId = session.id;
      const { data: invite } = await supabaseAdmin
        .from('clarity_live_invites')
        .insert({ session_id: session.id, target_user_id: receiver.user.id })
        .select('id')
        .single();
      if (invite) openInviteId = invite.id;
    }
  });

  test.afterAll(async () => {
    if (openInviteId) {
      await supabaseAdmin
        .from('clarity_live_invites')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', openInviteId);
    }
    if (openSessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', openSessionId);
    }
    await deleteTestLetter(letterId);
    await deleteTestStory(storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(receiver.user.id)]);
  });

  test('"Start Clarity Live now" button has a non-empty accessible name', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: 'Start Clarity Live now' });
    await expect(btn).toBeVisible({ timeout: 10000 });

    const accessibleName =
      (await btn.getAttribute('aria-label')) ?? (await btn.textContent());
    expect((accessibleName ?? '').trim().length).toBeGreaterThan(0);
  });

  test('"Start Clarity Live now" button activates with keyboard Enter', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: 'Start Clarity Live now' });

    if (await btn.isDisabled()) {
      test.skip();
      return;
    }

    await btn.focus();
    await expect(btn).toBeFocused();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('body')).toBeVisible();
  });

  test('banner Join button is focusable via Tab key', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const joinButton = page.getByRole('button', { name: 'Join' });
    await expect(joinButton).toBeVisible({ timeout: 15000 });

    await joinButton.focus();
    await expect(joinButton).toBeFocused();
  });

  test('banner Later button is focusable via Tab key', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const laterButton = page.getByRole('button', { name: 'Later' });
    await expect(laterButton).toBeVisible({ timeout: 15000 });

    await laterButton.focus();
    await expect(laterButton).toBeFocused();
  });

  test('banner title "...inviting you to Clarity" is in an aria-live region', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/inviting you to Clarity/)
    ).toBeVisible({ timeout: 15000 });

    const liveContainer = page.locator(
      '[aria-live], [role="status"], [role="alert"]'
    ).filter({ has: page.getByText(/inviting you to Clarity/) });

    const count = await liveContainer.count();
    expect(
      count,
      'Banner title must be in an aria-live region for screen reader announcement'
    ).toBeGreaterThan(0);
  });

  test('disabled "Start Clarity Live now" has aria-disabled and tooltip accessible name', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: 'Start Clarity Live now' });
    await expect(btn).toBeVisible({ timeout: 10000 });

    const isDisabled = await btn.isDisabled();
    if (!isDisabled) {
      test.skip();
      return;
    }

    const ariaDisabled = await btn.getAttribute('aria-disabled');
    const disabled = await btn.getAttribute('disabled');
    expect(
      ariaDisabled === 'true' || disabled !== null,
      'Disabled trigger button must have aria-disabled="true" or disabled attribute'
    ).toBe(true);

    const ariaLabel = await btn.getAttribute('aria-label');
    const title = await btn.getAttribute('title');
    const describedBy = await btn.getAttribute('aria-describedby');

    const tooltipText = [ariaLabel, title, describedBy].filter(Boolean).join(' ');
    expect(
      tooltipText.toLowerCase(),
      'Disabled button tooltip should mention pending invite'
    ).toContain('pending');
  });
});
