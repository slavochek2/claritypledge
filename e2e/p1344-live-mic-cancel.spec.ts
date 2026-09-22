/**
 * P1344 — cancelling the mic dialog must not strand a live session.
 *
 * handleMicCancel used to reset only the view, so anyone who already HELD a session and
 * denied the microphone sat on the lobby inside a live server session. Two paths reach
 * the dialog with a session held, and each must now leave through its sanctioned exit:
 *
 *   A. waiting host (proactive mic request in the waiting room) — exits like the
 *      waiting-room Cancel: no session is kept, so a reload does NOT restore it.
 *   B. creator whose waiting-room mic request was denied, still showing the dialog when
 *      the partner joins — the view is still 'waiting' (the mic gate is what moves it to
 *      'live'), so the exit must key on the PARTNER, not the view: confirmExitMeeting,
 *      and the partner is told the session ended.
 *
 * Not covered, because it is not reachable today: a participant re-gated on reload. On
 * restore gateMicAndGoLive returns early on isPrivate, which is local state that resets
 * to true on reload, so a reloaded participant is never mic-gated (measured while writing
 * this file; filed separately).
 *
 * Both drive the real UI (.claude/rules/live.md). Recording is switched ON because
 * private sessions skip the mic check entirely (P160 Gate D) and never show the dialog.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { completeLiveJoinIfPrompted } from './helpers/live-join';
import { supabaseAdmin } from './helpers/supabase-admin';

const DENY_FLAG = 'p1344-deny-mic';

/** getUserMedia that succeeds (real fake-UI stream, else a stub) until DENY_FLAG is set. */
async function installSwitchableMic(page: Page): Promise<void> {
  await page.addInitScript((flag) => {
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    const stubTrack = { kind: 'audio', enabled: true, stop: () => {} };
    const stub = { getTracks: () => [stubTrack], getAudioTracks: () => [stubTrack] };
    md.getUserMedia = async (constraints) => {
      if (window.localStorage.getItem(flag) === '1') {
        throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      }
      try {
        return await original(constraints);
      } catch {
        return stub as unknown as MediaStream;
      }
    };
  }, DENY_FLAG);
}

async function dismissTermsIfShown(page: Page): Promise<void> {
  try {
    // exact: a substring match also hits "Continue with Google" and leaves for OAuth.
    const cont = page.getByRole('button', { name: 'Continue', exact: true });
    await cont.waitFor({ state: 'visible', timeout: 3000 });
    await cont.click();
  } catch {
    // no terms dialog
  }
}

/** Creator: /live, recording ON, New session. Returns the room code. */
async function createRecordedSession(page: Page): Promise<string> {
  await page.goto('/live');
  await page.waitForLoadState('networkidle');
  const recordSwitch = page.getByRole('switch', { name: 'Private session — recording disabled' });
  await recordSwitch.click();
  await expect(page.getByRole('switch', { name: 'Transcribe for AI insights' })).toBeVisible();
  await page.getByRole('button', { name: 'New session' }).click();
  await dismissTermsIfShown(page);
  await expect(page.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });
  const shareLink = await page.getByTestId('share-link').textContent();
  const code = shareLink!.split('/').pop()!;
  expect(code).toHaveLength(6);
  return code;
}

/** Wait until the DB records a joiner (any name — the display name comes from the profile). */
async function waitForJoiner(code: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin.from('clarity_sessions').select('joiner_name').eq('code', code).maybeSingle();
    if (data?.joiner_name) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[p1344] no joiner recorded for ${code} within ${timeoutMs}ms`);
}

async function cancelMicDialog(page: Page): Promise<void> {
  const cancel = page.getByRole('dialog').getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeVisible({ timeout: 10000 });
  await cancel.click();
}

test.describe('P1344: mic-dialog Cancel with a session held', () => {
  test.describe.configure({ timeout: 90000 });

  test('A. waiting host who cancels the mic dialog keeps no session (reload stays on the lobby)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await installSwitchableMic(page);
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let code: string | null = null;
    try {
      host = await createTestUser({ name: 'Hana' });
      await setTestSession(page, host.email);
      await page.evaluate((flag) => window.localStorage.setItem(flag, '1'), DENY_FLAG);

      code = await createRecordedSession(page);
      await cancelMicDialog(page);

      await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 10000 });
      const stored = await page.evaluate(() => window.sessionStorage.getItem('clarity_live_session_code'));
      expect(stored, 'no stored session after cancelling the mic dialog').toBeNull();

      // The session is ended server-side too, so a joiner who raced in is told (sessionEnded).
      await expect.poll(async () => {
        const { data } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('code', code!).maybeSingle();
        return (data?.live_state as Record<string, unknown> | null)?.sessionEnded === true;
      }, { timeout: 10000 }).toBe(true);

      // The decisive check: before the fix the session survived in state and storage, so a
      // reload put the host straight back into the waiting room.
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Invite Your Partner')).toHaveCount(0);
    } finally {
      if (code) await deleteClaritySession(code).catch(() => {});
      if (host) await deleteTestUser(host.user.id);
      await ctx.close();
    }
  });

  test('B. creator who denied the mic cancels AFTER the partner joined: the partner is told the session ended', async ({ browser }) => {
    const creatorCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const creatorPage = await creatorCtx.newPage();
    const joinerPage = await joinerCtx.newPage();
    await installSwitchableMic(creatorPage);
    await installSwitchableMic(joinerPage);
    let creator: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joiner: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let code: string | null = null;
    try {
      creator = await createTestUser({ name: 'Alice' });
      joiner = await createTestUser({ name: 'Bob' });
      await setTestSession(creatorPage, creator.email);
      await setTestSession(joinerPage, joiner.email);
      await creatorPage.evaluate((flag) => window.localStorage.setItem(flag, '1'), DENY_FLAG);

      code = await createRecordedSession(creatorPage);
      // The proactive waiting-room request was denied: the dialog is up. Leave it open.
      const cancel = creatorPage.getByRole('dialog').getByRole('button', { name: 'Cancel' });
      await expect(cancel).toBeVisible({ timeout: 10000 });

      // The partner joins meanwhile (their mic works).
      await joinerPage.goto(`/live/${code}`);
      await completeLiveJoinIfPrompted(joinerPage);
      await dismissTermsIfShown(joinerPage);
      await waitForJoiner(code);
      await expect(joinerPage.getByText(/understand you\?/)).toBeVisible({ timeout: 20000 });

      // Now the creator gives up on the microphone.
      await cancel.click();

      // Before the fix the creator dropped to the lobby and the partner stayed in a
      // session that still looked live. The partner must be told it ended.
      await expect(joinerPage.getByText('Session ended')).toBeVisible({ timeout: 20000 });
    } finally {
      if (code) await deleteClaritySession(code).catch(() => {});
      if (creator) await deleteTestUser(creator.user.id);
      if (joiner) await deleteTestUser(joiner.user.id);
      await creatorCtx.close();
      await joinerCtx.close();
    }
  });
});
