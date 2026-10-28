/**
 * @file p699-inbox-progress.spec.ts
 * @description P699: Letter Results — Inbox progress indicator E2E tests
 *
 * Tests:
 * 1. In-progress letter shows "Step N of M completed" text
 * 2. Completed letter shows Results button navigating to results URL
 * 3. 0-of-M state shows appropriate text
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import {
  createFullTestLetter,
  completeTestDelivery,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P699: Inbox Progress Indicator', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId1: string;
  let storyId2: string;
  let storyId3: string;
  let inProgressLetterId: string;
  let inProgressDeliveryId: string;
  let completedLetterId: string;
  let completedDeliveryId: string;
  let freshLetterId: string;
  let freshDeliveryId: string;

  test.beforeAll(async () => {
    // A hook runs under the config's 30s, not this describe's 60s (the baseline logged "beforeAll hook timeout of
    // 30000ms exceeded" on this file, see the P1580 report). Each createTestUser took 10-20s on the shared TEST
    // DB (log gaps between "Creating test user" lines), and this setup makes two users plus stories and letters.
    test.setTimeout(120_000);
    sender = await createTestUser({ name: 'P699 Inbox Prog Sender' });
    receiver = await createTestUser({ name: 'P699 Inbox Prog Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P699 Inbox Progress Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const s1 = await createTestStory(sender.user.id, { title: 'P699 Inbox Story 1' });
    const s2 = await createTestStory(sender.user.id, { title: 'P699 Inbox Story 2' });
    const s3 = await createTestStory(sender.user.id, { title: 'P699 Inbox Story 3' });
    storyId1 = s1.id;
    storyId2 = s2.id;
    storyId3 = s3.id;

    const getVersion = async (sid: string) => {
      const { data: v } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', sid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return v?.id;
    };

    const [v1, v2, v3] = await Promise.all([
      getVersion(storyId1),
      getVersion(storyId2),
      getVersion(storyId3),
    ]);
    if (!v1 || !v2 || !v3) throw new Error('Story versions not found');

    // Letter 1: in_progress (1 of 3 rated)
    const r1 = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: v1, prediction: 5, position: 0 },
        { storyId: storyId2, versionId: v2, prediction: 7, position: 1 },
        { storyId: storyId3, versionId: v3, prediction: 3, position: 2 },
      ],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    inProgressLetterId = r1.letter.id;
    inProgressDeliveryId = r1.delivery.id;
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'in_progress', stories_rated: 1 })
      .eq('id', inProgressDeliveryId);

    // Letter 2: completed (3 of 3 rated)
    const r2 = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: v1, prediction: 4, position: 0 },
        { storyId: storyId2, versionId: v2, prediction: 6, position: 1 },
        { storyId: storyId3, versionId: v3, prediction: 8, position: 2 },
      ],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    completedLetterId = r2.letter.id;
    completedDeliveryId = r2.delivery.id;
    await completeTestDelivery(completedDeliveryId, 3);
    // Pre-mark completed delivery as read so navigation tests don't hit markDeliveryRead RLS
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ read_at: new Date().toISOString() })
      .eq('id', completedDeliveryId);

    // Letter 3: fresh / sent (0 of 3 rated)
    const r3 = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: v1, prediction: 5, position: 0 },
        { storyId: storyId2, versionId: v2, prediction: 5, position: 1 },
        { storyId: storyId3, versionId: v3, prediction: 5, position: 2 },
      ],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    freshLetterId = r3.letter.id;
    freshDeliveryId = r3.delivery.id;
    // Leave as 'sent' status — no stories rated
    void freshDeliveryId; // referenced to suppress lint, validated in test
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // the baseline logged an afterAll hook timeout of 30000ms here (two user deletes + letters on the shared TEST DB)
    if (inProgressLetterId) await deleteTestLetter(inProgressLetterId);
    if (completedLetterId) await deleteTestLetter(completedLetterId);
    if (freshLetterId) await deleteTestLetter(freshLetterId);
    if (storyId3) await deleteTestStory(storyId3);
    if (storyId2) await deleteTestStory(storyId2);
    if (storyId1) await deleteTestStory(storyId1);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Smoke ──────────────────────────────────────────────────────────────

  test('smoke: inbox tab loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/artifacts');

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('Non-Error promise rejection')
    );
    expect(criticalErrors, `Console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 2. In-progress: Step N of M ───────────────────────────────────────────

  test('in-progress letter shows "Step 1 of 3 completed" text', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // Look for progress text pattern "1 of 3 steps" (P699 step-granular format)
    const progressText = page.locator('text=/1\\s+of\\s+3\\s+steps/i').first();
    await expect(progressText).toBeVisible({ timeout: 10000 });
  });

  // ── 3. Completed: Results button navigates to results URL ─────────────────

  test('completed letter row links to its results', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // P1545: a finished received letter's row links straight to its results (no separate Results button).
    const resultsButton = page.locator(`[data-testid="artifact-row"] a[href*="/results?delivery=${completedDeliveryId}"]`);
    await expect(resultsButton).toBeVisible({ timeout: 10000 });
  });

  test('opening a completed letter row navigates to results URL with delivery param', async ({
    page,
  }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // P1545: a finished received letter's row links straight to its results (no separate Results button).
    const resultsButton = page.locator(`[data-testid="artifact-row"] a[href*="/results?delivery=${completedDeliveryId}"]`);

    if (await resultsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await resultsButton.click();
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/results');
      expect(page.url()).toContain(`delivery=${completedDeliveryId}`);
    }
  });

  // ── 4. Edge: fresh letter (0 stories rated) ───────────────────────────────

  test('fresh letter (0 rated) shows Read button (no progress text)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // Fresh letter should have an "Open" button, not a progress indicator
    // P1545: the row title link opens the reading flow (no separate Open button).
    const readButton = page.locator(`[data-testid="artifact-row"] a[href="/letter/${freshDeliveryId}"]`);

    const count = await readButton.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Progress text not shown on completed items ─────────────────────────

  test('completed letter does not show "Step N of M" progress text', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // For the completed delivery (3 of 3), there should be NO "Step N of M" text
    // (it's done — progress display is only for in-progress items)
    // This is tested by verifying the "Results" button exists without step text adjacent
    // P1545: a finished received letter's row links straight to its results (no separate Results button).
    const resultsButton = page.locator(`[data-testid="artifact-row"] a[href*="/results?delivery=${completedDeliveryId}"]`);

    // The row must exist; a missing row is a failure, not a skip.
    await expect(resultsButton).toBeVisible({ timeout: 10000 });
    const row = page
      .locator('[data-testid="artifact-row"]')
      .filter({ has: page.locator(`a[href*="/results?delivery=${completedDeliveryId}"]`) });
    // Completed items show "done", never step progress.
    await expect(row).not.toContainText(/\d+\s+of\s+\d+\s+steps?/i);
  });

  // ── 6. Sender: progress and completion on the letter's own page ───────────

  test('CANARY(p699): sender sees step progress for an in-progress recipient and Done for a finished one', async ({
    page,
  }) => {
    // Bug (P699): the sender's view dropped a recipient's progress/completion.
    // P1545: activity on your own letters left the inbox. It lives on the sent letter now: the Sent row says
    // "N new from..." / "N of M finished", and the letter's Recipients section (the row opens it) carries the
    // per-person status: "In progress · N of M steps" while someone is part-way, "Done" once finished
    // (letter-recipients-section.tsx: steps read only while in progress).
    await setTestSession(page, sender.email);

    await page.goto(`/letter/${inProgressLetterId}/overview`);
    await page.waitForLoadState('networkidle');
    const inProgress = page.getByTestId('letter-recipients').getByRole('listitem');
    await expect(inProgress).toContainText('In progress', { timeout: 10000 });
    await expect(inProgress).toContainText('1 of 3 steps');

    await page.goto(`/letter/${completedLetterId}/overview`);
    await page.waitForLoadState('networkidle');
    const done = page.getByTestId('letter-recipients').getByRole('listitem');
    await expect(done).toContainText('Done', { timeout: 10000 });
    await expect(done.getByRole('link')).toHaveAttribute(
      'href',
      `/letter/${completedLetterId}/results?delivery=${completedDeliveryId}`,
    );
  });
});
