/**
 * @file p582-rejoin-prompt-stale.spec.ts
 * @description Regression test for P582: Rejoin prompt should clear when session ends remotely.
 *
 * Bug: When a user has /live open showing "Your session is still running",
 * and the session ends remotely (other participant ends it), the prompt
 * persists indefinitely because no realtime subscription exists in the
 * rejoin-prompt state.
 *
 * Fix: Added a realtime subscription that watches the session while the
 * rejoin prompt is visible and clears it when sessionEnded/joinerEnded is set.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestSessionInDB, type TestSessionInDB } from './helpers/test-session';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P582: Rejoin prompt clears when session ends remotely', () => {
  let testUser: TestUser;
  let dbSession: TestSessionInDB;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P582RejoinUser' });
  });

  test.afterEach(async () => {
    if (dbSession) {
      try { await dbSession.cleanup(); } catch { /* noop */ }
    }
    if (testUser?.user?.id) {
      try { await deleteTestUser(testUser.user.id); } catch { /* noop */ }
    }
  });

  test('joiner sees prompt clear when creator ends session remotely', async ({ page }) => {
    // Primary bug scenario from P582: joiner returns to /live, sees rejoin prompt,
    // creator ends session in another window — prompt should clear.
    dbSession = await createTestSessionInDB(
      testUser.user.id, // hostProfileId — but test user will act as joiner via localStorage role
      'P582 Creator',
      { hostName: 'P582 Creator' },
    );

    await setTestSession(page, testUser.email);

    const activeSessionData = {
      code: dbSession.sessionCode,
      partnerName: 'P582 Creator',
      guestDisplayName: null,
      role: 'joiner' as const,
      timestamp: new Date().toISOString(),
    };
    await page.evaluate(
      (data) => localStorage.setItem('cp_active_session', JSON.stringify(data)),
      activeSessionData,
    );

    await page.goto('/live');
    await expect(page.getByText('Your session is still running')).toBeVisible({ timeout: 10000 });

    // Creator ends the session remotely
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .update({
        live_state: {
          checksCount: 0,
          sessionEnded: true,
          sessionEndedAt: new Date().toISOString(),
        },
      })
      .eq('id', dbSession.sessionId);

    if (error) throw new Error(`Failed to end session remotely: ${error.message}`);

    await expect(page.getByText('Your session is still running')).not.toBeVisible({ timeout: 15000 });
  });

  test('creator sees prompt clear when joiner ends session remotely', async ({ page }) => {
    // Creator returns to /live, sees rejoin prompt, joiner ends session remotely.
    dbSession = await createTestSessionInDB(
      testUser.user.id,
      'Remote Joiner',
      { hostName: testUser.name ?? 'P582 Creator' },
    );

    // Step 2: Auth the user, then set localStorage to simulate active session
    await setTestSession(page, testUser.email);

    const activeSessionData = {
      code: dbSession.sessionCode,
      partnerName: 'Remote Joiner',
      guestDisplayName: null,
      role: 'creator',
      timestamp: new Date().toISOString(),
    };
    await page.evaluate(
      (data) => localStorage.setItem('cp_active_session', JSON.stringify(data)),
      activeSessionData,
    );

    // Step 3: Navigate to /live — should see rejoin prompt
    await page.goto('/live');
    await expect(page.getByText('Your session is still running')).toBeVisible({ timeout: 10000 });

    // Step 4: Simulate joiner ending the session remotely
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .update({
        live_state: {
          checksCount: 0,
          joinerEnded: true,
          joinerEndedAt: new Date().toISOString(),
        },
      })
      .eq('id', dbSession.sessionId);

    if (error) throw new Error(`Failed to end session remotely: ${error.message}`);

    // Step 5: Rejoin prompt should disappear
    await expect(page.getByText('Your session is still running')).not.toBeVisible({ timeout: 15000 });
  });
});
