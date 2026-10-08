/**
 * P1441 UAT: the five visitor-facing states of the session guard, in a real browser against the
 * local dev server + TEST database. Screenshots at 1280, 375 and 320 wide go to
 * $P1441_SHOTS (default: test-results/p1441-uat).
 *
 * "Lost session" is simulated the way prod showed it: the supabase client's stored session is
 * removed while the app still shows the person signed in. The page clock is then moved ~59.5 min
 * forward so the app's own copy is too close to expiry to be used for a quiet re-sync — which
 * forces the "Please sign in again" path instead of the silent recovery.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent as seedRsvp, type TestEvent } from './helpers/test-event';

test.use({ video: 'off' });
test.describe.configure({ mode: 'serial' });

const SHOTS = process.env.P1441_SHOTS || 'test-results/p1441-uat';
const WIDTHS: Array<[number, number]> = [[1280, 900], [375, 812], [320, 700]];

async function shots(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  // The confirmation page redirects to the event page on a timer, by design. A capture that
  // straddles that redirect photographs the wrong state, so every shot asserts the URL held.
  const at = page.url();
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.innerWidth)).toBe(w);
    // Narrow widths are full-page: the state (booked / not booked) sits below the fold there.
    await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`), fullPage: w < 1280 });
    expect(page.url(), `${name}-${w} was captured after the page navigated away`).toBe(at);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

function callbackUrl(baseURL: string, params: Record<string, string>) {
  return `${baseURL}/auth/callback?${new URLSearchParams(params).toString()}`;
}

/** Open the email link exactly as the app's own templates shape it (P1325): /auth/verify. */
async function openEmailLink(page: Page, tokenHash: string, type: string, callback: string) {
  await page.goto(`/auth/verify?token_hash=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(callback)}`);
}

async function signInViaLink(page: Page, baseURL: string, email: string, params: Record<string, string>) {
  const cb = callbackUrl(baseURL, params);
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: cb } });
  expect(error).toBeNull();
  await openEmailLink(page, data!.properties!.hashed_token, 'magiclink', cb);
}

/** The prod failure: the client's stored session disappears; the app keeps showing the person. */
async function loseClientSession(page: Page) {
  const removed = await page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith('-auth-token')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return keys.length;
  });
  expect(removed).toBe(1);
  // Make the app's copy unusable for a quiet re-sync (it requires >= 60 s of validity).
  await page.clock.fastForward('59:30');
}

async function rsvpRows(eventId: string, profileId: string) {
  const { data } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', eventId).eq('profile_id', profileId);
  return data?.length ?? 0;
}

async function newPage(browser: Browser, withClock: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (withClock) await ctx.clock.install();
  return ctx.newPage();
}

test.describe('P1441 UAT', () => {
  let host: TestUser;
  let event: TestEvent;
  const users: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'UAT Host' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 3 * 24 * 3600 * 1000), { title: 'P1441 UAT Walk' });
  });

  test.afterAll(async () => {
    // RSVP confirmation emails log rows that reference the profiles and the event; remove them
    // first, as p1389-event-close.spec.ts and p1380-live-send.spec.ts do (test DB only).
    for (const id of [...users, host?.user.id].filter(Boolean)) {
      await supabaseAdmin.from('email_send_log').delete().eq('profile_id', id as string);
    }
    if (event) await supabaseAdmin.from('email_send_log').delete().eq('event_id', event.id);
    if (event) await deleteTestEvent(event.id);
    for (const id of users) await deleteTestUser(id).catch(() => {});
    if (host) await deleteTestUser(host.user.id).catch(() => {});
  });

  test('(a) signup → verify → auto-RSVP lands on the confirmation page', async ({ page, baseURL }) => {
    const email = generateTestEmail();
    const cb = callbackUrl(baseURL!, { source: 'signup', redirect: `/events/${event.slug}`, action: 'rsvp' });
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup', email, password: `Uat-${Date.now()}-x!`, options: { redirectTo: cb, data: { name: 'UAT Joiner' } },
    });
    expect(error).toBeNull();
    users.push(data!.user!.id);
    const consoleErrors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 300)));
    await openEmailLink(page, data!.properties!.hashed_token, 'email', cb);
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/confirm`), { timeout: 30000 });
    await expect(page.getByText("You're Registered!")).toBeVisible({ timeout: 15000 });
    expect(await rsvpRows(event.id, data!.user!.id)).toBe(1);
    // AC: no console errors during the normal signup → RSVP flow.
    expect(consoleErrors).toEqual([]);
    await shots(page, 'a-signup-auto-rsvp-confirm');
  });

  test('(b) lost session on Reserve → sign in again → RSVP completes', async ({ browser, baseURL }) => {
    const person = await createTestUser({ name: 'UAT Reserver' });
    users.push(person.user.id);
    const page = await newPage(browser, true);
    await signInViaLink(page, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}` });
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`), { timeout: 30000 });
    const reserve = page.getByTestId('rsvp-button').first();
    await expect(reserve).toBeVisible({ timeout: 15000 });

    await loseClientSession(page);
    await reserve.click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Fevents%2F.+&action=rsvp/, { timeout: 15000 });
    await expect(page.getByText('Please sign in again to reserve your seat.')).toBeVisible();
    await expect(page.getByText(/may be full/i)).toHaveCount(0);
    expect(await rsvpRows(event.id, person.user.id)).toBe(0);
    await shots(page, 'b1-lost-session-reserve-login-notice');

    // The email link from the login form carries the same redirect + action (signInWithEmail).
    const done = await newPage(browser, false);
    await signInViaLink(done, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}`, action: 'rsvp' });
    await expect(done).toHaveURL(new RegExp(`/events/${event.slug}/confirm`), { timeout: 30000 });
    await expect(done.getByText("You're Registered!")).toBeVisible({ timeout: 15000 });
    expect(await rsvpRows(event.id, person.user.id)).toBe(1);
    await shots(done, 'b2-after-sign-in-rsvp-confirmed');
    // b2 is the generic confirmation page (identical for everyone), so also show the event page
    // AS this person: their own name under Participants and "You're going!".
    await done.goto(`/events/${event.slug}`);
    await expect(done.getByText("You're going!").first()).toBeVisible({ timeout: 15000 });
    await expect(done.getByText('UAT Reserver').first()).toBeVisible();
    await shots(done, 'b3-after-sign-in-event-page-as-reserver');
    await page.context().close();
    await done.context().close();
  });

  test('(b0) lost session on Reserve, app copy still fresh → quiet re-sync, RSVP goes through', async ({ browser, baseURL }) => {
    const person = await createTestUser({ name: 'UAT Quiet Resync' });
    users.push(person.user.id);
    const page = await newPage(browser, false);
    await signInViaLink(page, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}` });
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`), { timeout: 30000 });
    const reserve = page.getByTestId('rsvp-button').first();
    await expect(reserve).toBeVisible({ timeout: 15000 });
    // Same loss as prod, but no clock jump: the app's copy is fresh enough to hand back.
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.endsWith('-auth-token')) localStorage.removeItem(k);
      }
    });
    await reserve.click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/confirm`), { timeout: 20000 });
    await expect(page.getByText("You're Registered!")).toBeVisible({ timeout: 15000 });
    expect(await rsvpRows(event.id, person.user.id)).toBe(1);
    await shots(page, 'b0-quiet-resync-rsvp-confirmed');
    await page.context().close();
  });

  test('(c) cancel success', async ({ browser, baseURL }) => {
    const person = await createTestUser({ name: 'UAT Canceller' });
    users.push(person.user.id);
    await seedRsvp(event.id, person.user.id);
    const page = await newPage(browser, false);
    await signInViaLink(page, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}` });
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`), { timeout: 30000 });
    await page.getByRole('button', { name: "Can't make it" }).click();
    await page.getByRole('button', { name: "I can't go" }).click();
    await expect(page.getByTestId('rsvp-button').first()).toBeVisible({ timeout: 15000 });
    expect(await rsvpRows(event.id, person.user.id)).toBe(0);
    // UAT finding: the canceller must also leave the Participants list without a reload.
    await expect(page.getByText('UAT Canceller')).toHaveCount(0);
    await shots(page, 'c-cancel-success');
    await page.context().close();
  });

  test('(d) cancel with lost session → sign in again, never re-booked', async ({ browser, baseURL }) => {
    const person = await createTestUser({ name: 'UAT Lost Canceller' });
    users.push(person.user.id);
    await seedRsvp(event.id, person.user.id);
    const page = await newPage(browser, true);
    await signInViaLink(page, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}` });
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`), { timeout: 30000 });
    await expect(page.getByRole('button', { name: "Can't make it" })).toBeVisible({ timeout: 15000 });

    await loseClientSession(page);
    await page.getByRole('button', { name: "Can't make it" }).click();
    await page.getByRole('button', { name: "I can't go" }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Fevents%2F[^&]+$/, { timeout: 15000 });
    await expect(page.getByText('Please sign in again to cancel your seat.')).toBeVisible();
    expect(await rsvpRows(event.id, person.user.id)).toBe(1); // nothing was deleted
    await shots(page, 'd1-lost-session-cancel-login-notice');

    // Signing back in with that link (no action) lands on the event page and books nothing new.
    const done = await newPage(browser, false);
    await signInViaLink(done, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}` });
    await expect(done).toHaveURL(new RegExp(`/events/${event.slug}$`), { timeout: 30000 });
    await expect(done.getByRole('button', { name: "Can't make it" })).toBeVisible({ timeout: 15000 });
    expect(await rsvpRows(event.id, person.user.id)).toBe(1);
    await shots(done, 'd2-after-sign-in-still-one-booking');
    await page.context().close();
    await done.context().close();
  });

  test('(e) a cancel that removes nothing while the seat is still held shows the failure toast', async ({ browser, baseURL }) => {
    const person = await createTestUser({ name: 'UAT Failed Canceller' });
    users.push(person.user.id);
    await seedRsvp(event.id, person.user.id);
    const page = await newPage(browser, false);
    await signInViaLink(page, baseURL!, person.email, { source: 'login', redirect: `/events/${event.slug}` });
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}$`), { timeout: 30000 });
    // The server answers the DELETE with zero rows although the booking is still there.
    await page.route('**/rest/v1/event_rsvps**', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        : route.continue(),
    );
    await page.getByRole('button', { name: "Can't make it" }).click();
    await page.getByRole('button', { name: "I can't go" }).click();
    await expect(page.getByText("Couldn't cancel your seat. Please try again.")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: "Can't make it" })).toBeVisible();
    expect(await rsvpRows(event.id, person.user.id)).toBe(1);
    await shots(page, 'e-cancel-failure-toast');
    // Census of the whole (shared) event: one row per person, and the count the page shows.
    const { data: all } = await supabaseAdmin.from('event_rsvps').select('profile_id').eq('event_id', event.id);
    const ids = (all ?? []).map((r) => r.profile_id);
    expect(new Set(ids).size).toBe(ids.length);
    console.log(`P1441 census after (e): ${ids.length} rows, ${new Set(ids).size} distinct people`);
    await expect(page.getByText(`Participants (${ids.length}`)).toBeVisible();
    await page.context().close();
  });
});
