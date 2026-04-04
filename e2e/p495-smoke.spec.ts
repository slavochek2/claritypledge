/**
 * @file p495-smoke.spec.ts
 * @description Smoke tests for P495: Transcription feature pages load without crashes.
 *
 * Pattern: create DB fixture → authenticate → navigate → check no console errors.
 * These are lightweight — verify page stability, not business logic.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';

let creator: TestUser;
let joiner: TestUser;
let sessionId: string;
let sessionCode: string;
let transcriptId: string;
let jobId: string;

test.beforeAll(async () => {
  creator = await createTestUser({ name: 'P495SmokeCreator' });
  joiner = await createTestUser({ name: 'P495SmokeJoiner' });

  const { data: session } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: `P495-SMOKE-${Date.now()}`,
      creator_profile_id: creator.user.id,
      joiner_profile_id: joiner.user.id,
      creator_name: 'P495SmokeCreator',
      joiner_name: 'P495SmokeJoiner',
      is_private: false,
    })
    .select('id, code')
    .single();

  if (!session) throw new Error('Failed to create smoke test session');
  sessionId = session.id;
  sessionCode = session.code;

  const { data: transcript } = await supabaseAdmin
    .from('session_transcripts')
    .insert({
      session_id: sessionId,
      segments: [{ speaker: 'SmokeCreator', start: 10, end: 15, text: 'Smoke test content.' }],
      language: 'en',
    })
    .select('id')
    .single();
  if (!transcript) throw new Error('Failed to create smoke transcript');
  transcriptId = transcript.id;

  const { data: job } = await supabaseAdmin
    .from('transcription_jobs')
    .insert({ session_id: sessionId, session_code: sessionCode, status: 'completed' })
    .select('id')
    .single();
  if (!job) throw new Error('Failed to create smoke job');
  jobId = job.id;
});

test.afterAll(async () => {
  if (transcriptId) await supabaseAdmin.from('session_transcripts').delete().eq('id', transcriptId);
  if (jobId) await supabaseAdmin.from('transcription_jobs').delete().eq('id', jobId);
  if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  if (creator?.user?.id) await deleteTestUser(creator.user.id);
  if (joiner?.user?.id) await deleteTestUser(joiner.user.id);
});

// Helper: collect console errors excluding known noise
function setupErrorCollector(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
      errors.push(msg.text());
    }
  });
  return errors;
}

test.describe('P495 Smoke Tests', () => {
  test.describe.configure({ timeout: 60000 });

  test('session detail page loads without errors (authenticated participant)', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await setTestSession(page, creator.email);
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Click into session detail
    const sessionCard = page.getByText('P495SmokeJoiner').first();
    await expect(sessionCard).toBeVisible({ timeout: 10000 });
    await sessionCard.click();
    await page.waitForLoadState('networkidle');

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('sessions list page loads without errors', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await setTestSession(page, creator.email);
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Page should render without crashing
    await expect(page.getByText('P495SmokeJoiner')).toBeVisible({ timeout: 10000 });

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('transcript view renders without crashing', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await setTestSession(page, creator.email);
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    const sessionCard = page.getByText('P495SmokeJoiner').first();
    await sessionCard.click();

    const openBtn = page.getByRole('button', { name: /open/i });
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Transcript view should render
    await expect(page.getByText(/smoke test content/i)).toBeVisible({ timeout: 10000 });

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
