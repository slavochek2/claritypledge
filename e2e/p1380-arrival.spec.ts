/**
 * @file p1380-arrival.spec.ts
 * @description P1380 — the arrival check-in in a real browser, real test DB, real session.
 *
 * Covers: the room's "Have you arrived at {venue}?" for an event starting soon; I'm here →
 * recorded, then the P1336 preparation gate; ?arrived=1 (the email's I'm here) → recorded with
 * no question; Not yet → "See you soon" (venue, address, map, on-time line), I'm here now →
 * the room; I can't make it → asks once, then releases the place; an event two days out is never
 * asked; the host sees who arrived.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { createHash, randomBytes } from 'crypto';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const VENUE = 'Zuzalu library';
const LOCATION = `${VENUE}, 4Seas Nimman, Chiang Mai`;
const SHOTS = 'test-results/p1380';

async function prepEvent(host: TestUser, start: Date): Promise<TestEvent> {
  const ev = await createTestEvent(host.user.id, start, { title: 'Clarity Night #97: P1380 test', location: LOCATION });
  const { error } = await supabaseAdmin.from('events').update({ preparation_enabled: true }).eq('id', ev.id);
  if (error) throw error;
  return ev;
}

async function arrivedAt(eventId: string, profileId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('event_arrivals').select('arrived_at').eq('event_id', eventId).eq('profile_id', profileId).maybeSingle();
  return (data?.arrived_at as string | undefined) ?? null;
}

async function shoot(page: Page, name: string) {
  for (const [w, h] of [[1280, 800], [768, 1024], [390, 844], [320, 700]] as const) {
    await page.setViewportSize({ width: w, height: h });
    expect(await page.evaluate(() => window.innerWidth)).toBe(w);
    await page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: true });
  }
}

test.describe('P1380 arrival check-in', () => {
  let host: TestUser;
  let soon: TestEvent;
  let later: TestEvent;
  const users: TestUser[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1380 E2E Host' });
    soon = await prepEvent(host, new Date(Date.now() + 20 * 60 * 1000));
    later = await prepEvent(host, new Date(Date.now() + 2 * 24 * 3600 * 1000));
  });

  test.afterAll(async () => {
    for (const e of [soon, later]) if (e) await deleteTestEvent(e.id);
    for (const u of [host, ...users]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  async function registrant(name: string, ev: TestEvent): Promise<TestUser> {
    const u = await createTestUser({ name });
    users.push(u);
    await rsvpToEvent(ev.id, u.user.id);
    return u;
  }

  test("smoke + I'm here: the room asks, records the arrival, then the preparation gate", async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const u = await registrant('P1380 Here', soon);
    await setTestSession(page, u.email);
    await page.goto(`/events/${soon.slug}/room`);
    await expect(page.getByTestId('arrival-question')).toBeVisible();
    await expect(page.getByRole('heading', { name: `Have you arrived at ${VENUE}?` })).toBeVisible();
    await shoot(page, 'arrival-question');
    await page.getByRole('button', { name: "I'm here" }).click();
    await expect(page.getByTestId('prep-room-gate')).toBeVisible();
    expect(await arrivedAt(soon.id, u.user.id)).not.toBeNull();
    expect(errors.filter((e) => !/favicon|Download the React DevTools/.test(e))).toEqual([]);
  });

  test('?arrived=1 from the email: recorded without a question, flag removed', async ({ page }) => {
    const u = await registrant('P1380 Email', soon);
    await setTestSession(page, u.email);
    await page.goto(`/events/${soon.slug}/room?arrived=1`);
    await expect(page.getByTestId('prep-room-gate')).toBeVisible();
    await expect(page.getByTestId('arrival-question')).toHaveCount(0);
    await expect.poll(() => arrivedAt(soon.id, u.user.id)).not.toBeNull();
    expect(new URL(page.url()).search).not.toContain('arrived');
  });

  test("Not yet → See you soon; I'm here now → the room", async ({ page }) => {
    const u = await registrant('P1380 Not Yet', soon);
    await setTestSession(page, u.email);
    await page.goto(`/events/${soon.slug}/room`);
    await page.getByRole('button', { name: 'Not yet' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${soon.slug}/arriving`));
    await expect(page.getByTestId('arriving-venue')).toHaveText(VENUE);
    await expect(page.getByTestId('arriving-address')).toHaveText(LOCATION);
    await expect(page.getByTestId('arriving-map')).toHaveAttribute('href', /google\.com\/maps\/search/);
    await expect(page.getByTestId('arriving-on-time')).toContainText(/^We start at \d\d:\d\d sharp\.$/);
    expect(await arrivedAt(soon.id, u.user.id)).toBeNull();
    await shoot(page, 'arriving');
    await page.getByRole('button', { name: "I'm here now" }).click();
    await expect(page.getByTestId('prep-room-gate')).toBeVisible();
    expect(await arrivedAt(soon.id, u.user.id)).not.toBeNull();
  });

  test("I can't make it asks once, then releases the place", async ({ page }) => {
    const u = await registrant('P1380 Cancel', soon);
    await setTestSession(page, u.email);
    await page.goto(`/events/${soon.slug}/arriving`);
    await page.getByRole('button', { name: "I can't make it" }).click();
    await expect(page.getByTestId('arriving-cancel-confirm')).toBeVisible();
    await shoot(page, 'arriving-confirm');
    await page.getByRole('button', { name: 'Keep my place' }).click();
    await expect(page.getByTestId('arriving-cancel-confirm')).toHaveCount(0);
    await page.getByRole('button', { name: "I can't make it" }).click();
    await page.getByRole('button', { name: 'Yes, release my place' }).click();
    await expect(page.getByTestId('arriving-cancelled')).toBeVisible();
    const { data } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', soon.id).eq('profile_id', u.user.id);
    expect(data).toEqual([]);
  });

  test('an event two days out never asks', async ({ page }) => {
    const u = await registrant('P1380 Later', later);
    await setTestSession(page, u.email);
    await page.goto(`/events/${later.slug}/room`);
    await expect(page.getByTestId('prep-room-gate')).toBeVisible();
    await expect(page.getByTestId('arrival-question')).toHaveCount(0);
  });

  test('the preparation end screen states the start (on-time line)', async ({ page }) => {
    const u = await registrant('P1380 End', later);
    const at = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin.from('person_prep_parts').upsert(
      ['intro_video', 'cognitive_video', 'principle_intro', 'cmp7'].map((part) => ({ profile_id: u.user.id, part, content_version: 1, completed_at: at })),
      { onConflict: 'profile_id,part' },
    );
    await setTestSession(page, u.email);
    await page.goto(`/events/${later.slug}/prepare`);
    await page.getByRole('button', { name: 'Start now' }).click();
    await page.getByRole('button', { name: 'Opt out' }).click();
    await page.getByRole('button', { name: 'No, continue' }).click();
    // No statement tag on this event → no positions step.
    await page.getByRole('button', { name: 'No, thanks' }).click();
    await expect(page.getByTestId('end-on-time')).toContainText(/^We start at \d\d:\d\d sharp\.$/);
    await shoot(page, 'prep-end');
  });

  test('email button: Continue signs in and opens the room; a second press goes to normal sign-in', async ({ page }) => {
    const u = await registrant('P1380 Link', soon);
    const { data: rsvp } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', soon.id).eq('profile_id', u.user.id).single();
    const ticket = randomBytes(32).toString('base64url');
    const { error } = await supabaseAdmin.from('event_email_links').insert({
      token_hash: createHash('sha256').update(ticket).digest('hex'),
      rsvp_id: rsvp!.id,
      purpose: 'arrived',
      expires_at: new Date(Date.now() + 3 * 3600e3).toISOString(),
    });
    expect(error).toBeNull();

    // Opening the page alone spends nothing (what a link scanner does).
    await page.goto(`/auth/event-link?ticket=${ticket}`);
    await expect(page.getByRole('button', { name: /^Continue as / })).toBeVisible();
    await expect(page.getByTestId('event-link-event')).toHaveText(soon.title);
    const { data: unspent } = await supabaseAdmin.from('event_email_links').select('last_used_at').eq('rsvp_id', rsvp!.id).single();
    expect(unspent!.last_used_at).toBeNull();
    await shoot(page, 'continue');

    await page.getByRole('button', { name: /^Continue as / }).click();
    // Signed in, arrival recorded from ?arrived=1, then the preparation gate.
    await expect(page.getByTestId('prep-room-gate')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => arrivedAt(soon.id, u.user.id)).not.toBeNull();

    // Second press of the same button, in a fresh browser: normal sign-in, same destination.
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/auth/event-link?ticket=${ticket}`);
    await expect(page.getByTestId('event-link-reason')).toHaveText('This button has already been used. Sign in to continue.');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(decodeURIComponent(page.url())).toContain(`/events/${soon.slug}/room?arrived=1`);
  });

  test('the host sees who arrived (P1386 marks: an arrived pin after the name)', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${soon.slug}`);
    // Here, Email, Not Yet (then I'm here now) and Link arrived; Cancel released the place.
    await expect(page.getByTestId('prep-mark-arrived')).toHaveCount(4);
    await expect(page.getByTestId('prep-mark-arrived').first()).toHaveAttribute('aria-label', /^Arrived \d\d:\d\d$/);
    await shoot(page, 'host-list');
  });

});
