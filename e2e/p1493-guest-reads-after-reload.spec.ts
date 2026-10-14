/**
 * @file p1493-guest-reads-after-reload.spec.ts
 * @description P1493, in real browsers: the room lookup returns the full session to its
 * participants only. The database half is pinned by
 * e2e/integration/20261014180000_p1493_session_reads_need_a_participant.spec.ts; this file proves
 * the client half the integration test cannot reach:
 *
 *  1. a signed-out guest who RELOADS stays in the room — the reload's first lookup cannot present
 *     the seat credential (the room id is not known yet), so the client must ask again with it.
 *     Without that, the restore sees a pre-join row, clears the stored session and drops the guest
 *     back on the join form.
 *  2. a visitor who opens the same link still gets the join screen with the host's name, and the
 *     lookup it makes carries none of the session's state.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession, type TestUser } from './helpers/test-user';
import { mockMicPermission, waitForDBPresence } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';
import { dismissTermsDialog } from './helpers/test-session';

const GUEST = 'Gwen';

const contexts: BrowserContext[] = [];
const users: TestUser[] = [];

async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await mockMicPermission(page);
  return page;
}

test.afterEach(async () => {
  for (const c of contexts.splice(0)) await c.close().catch(() => {});
  const ids = users.map((u) => u.user.id);
  if (ids.length) {
    const { data: rooms } = await supabaseAdmin.from('clarity_sessions').select('code').in('creator_profile_id', ids);
    for (const room of rooms ?? []) await deleteClaritySession(room.code as string);
  }
  for (const u of users.splice(0)) await deleteTestUser(u.user.id);
});

/** Creator opens a room in the UI; a signed-out guest takes the seat through the link. */
async function roomWithGuest(browser: Browser) {
  const creatorPage = await openPage(browser);
  const guestPage = await openPage(browser);
  const creator = await createTestUser({ name: 'P1493Creator' });
  users.push(creator);
  await setTestSession(creatorPage, creator.email);
  await creatorPage.goto('/live');
  await creatorPage.waitForLoadState('networkidle');
  await dismissTermsDialog(creatorPage);
  await creatorPage.getByRole('button', { name: 'New session' }).click();
  await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 15000 });
  const code = (await creatorPage.getByTestId('share-link').textContent())!.split('/').pop()!.trim();
  const { data: roomRow } = await supabaseAdmin.from('clarity_sessions').select('id').eq('code', code).single();
  await guestPage.goto(`/live/${code}`);
  expect(await completeLiveJoinIfPrompted(guestPage, { name: GUEST })).toBe('guest-form');
  await dismissTermsDialog(guestPage);
  await waitForDBPresence('clarity_sessions', 'joiner_name', GUEST, 'code', code);
  return { code, roomId: roomRow!.id as string, guestPage };
}

test.describe('P1493: session reads after a reload and from a visitor', () => {
  test.describe.configure({ timeout: 150000 });

  test('a signed-out guest reloads and stays in the room — no join form', async ({ browser }) => {
    const { roomId, guestPage } = await roomWithGuest(browser);
    await expect(guestPage.getByTestId('start-check').filter({ visible: true }).first()).toBeVisible({ timeout: 20000 });
    const { data: before } = await supabaseAdmin.from('clarity_sessions').select('joiner_seat_secret').eq('id', roomId).single();

    await guestPage.reload();
    await guestPage.waitForLoadState('networkidle');

    // The discriminator: a restore that only received the pre-join row clears the stored session
    // and puts the join form in front of the guest.
    expect(await completeLiveJoinIfPrompted(guestPage, { name: GUEST, timeout: 8000 }),
      'the reload dropped the guest back on the join form').toBe('no-join-ui');
    await dismissTermsDialog(guestPage);
    await expect(guestPage.getByTestId('start-check').filter({ visible: true }).first()).toBeVisible({ timeout: 20000 });
    const { data: after } = await supabaseAdmin.from('clarity_sessions').select('joiner_seat_secret').eq('id', roomId).single();
    expect(after?.joiner_seat_secret, 'the guest kept the same seat').toBe(before?.joiner_seat_secret);
  });

  test('a visitor opening the link sees the join screen with the host name, and receives no session state', async ({ browser }) => {
    const { code } = await roomWithGuest(browser);
    const visitorPage = await openPage(browser);
    const lookups: Record<string, unknown>[] = [];
    visitorPage.on('response', async (res) => {
      if (!res.url().includes('/rest/v1/rpc/get_session_by_code')) return;
      try {
        const body = await res.json();
        if (Array.isArray(body)) lookups.push(...(body as Record<string, unknown>[]));
      } catch { /* navigated away */ }
    });

    await visitorPage.goto(`/live/${code}`);
    await visitorPage.waitForLoadState('networkidle');
    await dismissTermsDialog(visitorPage);

    await expect(visitorPage.getByText(/Join .+'s Session/)).toBeVisible({ timeout: 15000 });
    expect(lookups.length, 'the join screen resolves the room through the lookup').toBeGreaterThan(0);
    for (const row of lookups) {
      expect(row.live_state, 'a visitor received the session state').toBeNull();
      expect(row.joiner_name, 'a visitor received the seated guest\'s name').toBeNull();
    }
  });
});
