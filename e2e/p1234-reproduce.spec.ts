/**
 * @file p1234-reproduce.spec.ts
 * @description P1234 canary — an authenticated creator clicking "New session" on /live must
 * reach the "Invite Your Partner" waiting room with a usable 6-character share link.
 *
 * This is the single step that every two-party spec performs first, and the one that was
 * failing 16/16 across four sampled files. It is isolated here with NO joiner, NO story and
 * NO rating, so a failure names the creator flow and nothing downstream of it.
 *
 * The test also reports what the page said when it failed: handleCreate
 * (clarity-live-page.tsx:3083) swallows every throw into setError(), so the rendered error
 * text is the only place the underlying cause surfaces to a black-box test.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { mockMicPermission } from './helpers/test-realtime';

test.describe('P1234 — creator reaches the waiting room', () => {
  test.describe.configure({ timeout: 90000 });

  test('Clicking "New session" renders "Invite Your Partner" with a 6-char share link', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockMicPermission(page);

    // Diagnostics: handleCreate turns any throw into UI text, so capture both channels.
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const failedRequests: string[] = [];
    page.on('response', async res => {
      if (res.status() >= 400) {
        let body = '';
        try { body = (await res.text()).slice(0, 400); } catch { /* body already consumed */ }
        failedRequests.push(`${res.status()} ${res.url()} ${body}`);
      }
    });

    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let roomCode: string | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P1234Creator' });
      await setTestSession(page, creatorUser.email);

      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      const newSession = page.getByRole('button', { name: 'New session' });
      await expect(newSession).toBeVisible({ timeout: 10000 });
      await newSession.click();

      // The symptom. If this fails, dump what the page and network actually said.
      try {
        await expect(page.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });
      } catch (assertionError) {
        const visibleText = await page.locator('body').innerText().catch(() => '<unreadable>');
        console.log('[p1234] URL after click:', page.url());
        console.log('[p1234] console errors:\n' + (consoleErrors.join('\n') || '<none>'));
        console.log('[p1234] failed responses:\n' + (failedRequests.join('\n') || '<none>'));
        console.log('[p1234] page text:\n' + visibleText.slice(0, 1200));
        throw assertionError;
      }

      // A waiting room without a usable code is not a waiting room.
      const shareLink = await page.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;
      expect(roomCode).toHaveLength(6);

      // And the row must actually exist under that code.
      const { data: row } = await supabaseAdmin
        .from('clarity_sessions')
        .select('code,creator_profile_id')
        .eq('code', roomCode)
        .single();
      expect(row?.creator_profile_id).toBe(creatorUser.user.id);
    } finally {
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      await context.close();
    }
  });
});
