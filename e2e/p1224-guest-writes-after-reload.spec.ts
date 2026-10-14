/**
 * @file p1224-guest-writes-after-reload.spec.ts
 * @description P1224, in two real browsers: a signed-out guest who RELOADS the page can still act
 * in the room — its writes are authorized by the seat secret, which must survive the reload.
 *
 * The database half (who may write) is pinned by
 * e2e/integration/20261014093000_p1224_guest_writes_require_seat_secret.spec.ts. This file proves
 * the client half that the integration test cannot reach: the secret is restored from storage
 * after a reload and presented on the guest's writes, through the real join flow and the real
 * rating UI. P1058 shipped a seat capability that did not survive a reload; this is that canary.
 *
 * Discriminating: with the client's seat-secret header suppressed, the guest's first write after
 * the reload is refused (42501) and the round never records the guest's rating.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession, type TestUser } from './helpers/test-user';
import { mockMicPermission, waitForDBPresence, waitForLiveStateKey } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';
import { dismissTermsDialog } from './helpers/test-session';

const GUEST = 'Gwen';

const contexts: BrowserContext[] = [];
const users: TestUser[] = [];
const refusedGuestWrites: string[] = [];

async function openPage(browser: Browser, label: string): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await mockMicPermission(page);
  page.on('response', async (res) => {
    if (!res.url().includes('/rest/v1/') || res.status() < 400) return;
    let body = '';
    try { body = (await res.text()).slice(0, 200); } catch { /* page navigated */ }
    refusedGuestWrites.push(`${label}: ${res.request().method()} ${res.url().replace(/^https?:\/\/[^/]+/, '')} -> ${res.status()} ${body}`);
  });
  return page;
}

async function seatSecretOf(roomId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('clarity_sessions').select('joiner_seat_secret').eq('id', roomId).single();
  return (data?.joiner_seat_secret as string | null) ?? null;
}

test.afterEach(async () => {
  for (const c of contexts.splice(0)) await c.close().catch(() => {});
  const ids = users.map((u) => u.user.id);
  if (ids.length) {
    const { data: rooms } = await supabaseAdmin.from('clarity_sessions').select('id, code').in('creator_profile_id', ids);
    for (const room of rooms ?? []) {
      await supabaseAdmin.from('story_verifications').delete().eq('session_id', room.id);
      await deleteClaritySession(room.code as string);
    }
  }
  for (const u of users.splice(0)) await deleteTestUser(u.user.id);
  refusedGuestWrites.length = 0;
});

/** Creator opens a room in the UI; a signed-out guest takes the seat. Returns code, id, pages. */
async function roomWithGuest(browser: Browser) {
  const creatorPage = await openPage(browser, 'creator');
  const guestPage = await openPage(browser, 'guest');
  const creator = await createTestUser({ name: 'P1224Creator' });
  users.push(creator);
  await setTestSession(creatorPage, creator.email);
  await creatorPage.goto('/live');
  await creatorPage.waitForLoadState('networkidle');
  await dismissTermsDialog(creatorPage);
  await creatorPage.getByRole('button', { name: 'New session' }).click();
  await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 15000 });
  const code = (await creatorPage.getByTestId('share-link').textContent())!.split('/').pop()!.trim();
  const { data: roomRow } = await supabaseAdmin.from('clarity_sessions').select('id').eq('code', code).single();
  const roomId = roomRow!.id as string;
  await guestPage.goto(`/live/${code}`);
  expect(await completeLiveJoinIfPrompted(guestPage, { name: GUEST })).toBe('guest-form');
  await dismissTermsDialog(guestPage);
  await waitForDBPresence('clarity_sessions', 'joiner_name', GUEST, 'code', code);
  return { code, roomId, creatorPage, guestPage };
}

async function speakAndRate(page: Page, rating: number) {
  const speak = page.getByTestId('start-check').filter({ visible: true }).first();
  await expect(speak).toBeEnabled({ timeout: 20000 });
  await speak.click();
  await expect(page.getByText(/How well do you believe/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: `Rate ${rating}`, exact: true }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
}

test.describe('P1224: a guest whose seat credential is gone', () => {
  test.describe.configure({ timeout: 150000 });

  test('an open tab with no credential (a seat from before credentials) re-joins and its write lands', async ({ browser }) => {
    const { code, roomId, guestPage } = await roomWithGuest(browser);
    // Turn the seat into one claimed before seat credentials existed: no credential, claimed long ago.
    await supabaseAdmin.from('clarity_sessions').update({
      joiner_seat_secret: null,
      joiner_seat_claimed_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      joiner_last_seen_at: null,
    }).eq('id', roomId);
    // ...and a tab that holds none: drop it from storage, then reload so nothing is held in memory.
    await guestPage.evaluate((id) => window.localStorage.removeItem(`cp.seatSecret.${id}`), roomId);
    await guestPage.reload();
    await guestPage.waitForLoadState('networkidle');
    await completeLiveJoinIfPrompted(guestPage, { name: GUEST, timeout: 8000 });
    await dismissTermsDialog(guestPage);

    await speakAndRate(guestPage, 6);
    try {
      await waitForLiveStateKey(code, 'checkerSubmitted', true, 20000);
    } catch (e) {
      throw new Error(`${(e as Error).message}\nFailed REST calls:\n${refusedGuestWrites.join('\n') || '(none)'}`);
    }
    expect(await seatSecretOf(roomId), 're-joining issued a credential').not.toBeNull();
    const { data } = await supabaseAdmin.from('clarity_sessions').select('joiner_name').eq('id', roomId).single();
    expect(data?.joiner_name).toBe(GUEST);
  });

  test('a tab whose seat someone else now holds is sent to the join form, never told to retry', async ({ browser }) => {
    const { code, roomId, guestPage } = await roomWithGuest(browser);
    // Someone else now holds the seat: a fresh credential this tab does not have, and recent
    // presence, so the seat is not free to re-claim. The display name is left unchanged — names
    // authorize nothing (P1269), and changing it would only make the page re-render mid-click.
    const takenOver = crypto.randomUUID();
    const now = new Date().toISOString();
    await supabaseAdmin.from('clarity_sessions').update({
      joiner_seat_secret: takenOver, joiner_seat_claimed_at: now, joiner_last_seen_at: now,
    }).eq('id', roomId);

    // Pressing Speak is the guest's first write (the room records who asked).
    const speak = guestPage.getByTestId('start-check').filter({ visible: true }).first();
    await expect(speak).toBeEnabled({ timeout: 20000 });
    await speak.click();
    await expect(guestPage.getByText('You are no longer in this session. Open the session link again to rejoin.'))
      .toBeVisible({ timeout: 20000 });
    await expect(guestPage.getByText(/Failed to sync with partner/)).toHaveCount(0);
    const { data } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', roomId).single();
    expect(await seatSecretOf(roomId), 'the other holder keeps the seat').toBe(takenOver);
    expect((data?.live_state as Record<string, unknown>)?.ratingInitiatedBy, 'the refused write did not land').toBeUndefined();
    // The guest is on the join form for the same link — the re-join action.
    await expect(guestPage).toHaveURL(new RegExp(`/live/${code}`));
    await expect(guestPage.getByPlaceholder('Enter your name')).toBeVisible();
  });
});

test.describe('P1224: a guest keeps acting in its room after a reload', () => {
  test.describe.configure({ timeout: 150000 });

  test('a signed-out guest joins, reloads, then speaks and rates — the write lands', async ({ browser }) => {
    const creatorPage = await openPage(browser, 'creator');
    const guestPage = await openPage(browser, 'guest');
    const creator = await createTestUser({ name: 'P1224Creator' });
    users.push(creator);
    await setTestSession(creatorPage, creator.email);

    // The creator opens a room through the real UI.
    await creatorPage.goto('/live');
    await creatorPage.waitForLoadState('networkidle');
    await dismissTermsDialog(creatorPage);
    await creatorPage.getByRole('button', { name: 'New session' }).click();
    await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 15000 });
    const code = (await creatorPage.getByTestId('share-link').textContent())!.split('/').pop()!.trim();
    const { data: roomRow } = await supabaseAdmin.from('clarity_sessions').select('id').eq('code', code).single();
    const roomId = roomRow!.id as string;

    // The guest follows the link and takes the seat with no account.
    await guestPage.goto(`/live/${code}`);
    const outcome = await completeLiveJoinIfPrompted(guestPage, { name: GUEST });
    expect(outcome, 'the guest must reach the signed-out join form, or this is not a guest').toBe('guest-form');
    await dismissTermsDialog(guestPage);
    await waitForDBPresence('clarity_sessions', 'joiner_name', GUEST, 'code', code);
    const secretBefore = await seatSecretOf(roomId);
    expect(secretBefore, 'claiming a guest seat mints a secret').not.toBeNull();

    // The behaviour under test is the reload itself — not a sync mechanism.
    await guestPage.reload();
    await guestPage.waitForLoadState('networkidle');
    await completeLiveJoinIfPrompted(guestPage, { name: GUEST, timeout: 8000 });
    await dismissTermsDialog(guestPage);

    expect(await seatSecretOf(roomId), 'a reload must keep the guest in the SAME seat').toBe(secretBefore);

    // The guest speaks and rates: its first writes after the reload.
    const speak = guestPage.getByTestId('start-check').filter({ visible: true }).first();
    await expect(speak).toBeEnabled({ timeout: 20000 });
    await speak.click();
    await expect(guestPage.getByText(/How well do you believe/i)).toBeVisible({ timeout: 15000 });
    await guestPage.getByRole('button', { name: 'Rate 6', exact: true }).click();
    await guestPage.getByRole('button', { name: 'Submit', exact: true }).click();

    try {
      await waitForLiveStateKey(code, 'checkerSubmitted', true);
    } catch (e) {
      throw new Error(`${(e as Error).message}\nFailed REST calls:\n${refusedGuestWrites.join('\n') || '(none)'}`);
    }
    const { data } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', roomId).single();
    expect((data?.live_state as Record<string, unknown>)?.checkerRating, 'the guest\'s rating landed').toBe(6);
    expect(refusedGuestWrites.filter((l) => l.startsWith('guest:') && / 401 | 403 |42501/.test(l)),
      'the guest hit a permission refusal').toEqual([]);
  });
});
