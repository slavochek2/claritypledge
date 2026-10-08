/**
 * P1441 regression — happy path, not a canary (the prod trigger was not reproduced). A brand-new
 * signup who confirms by email lands on /auth/verify with an action=rsvp intent. The auto-RSVP (and any manual retry) must be inserted AS that user.
 * Prod (Sentry JAVASCRIPT-REACT-3Q): every event_rsvps INSERT went out anonymous (HTTP 401,
 * 42501) while the app still showed the user signed in.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

test.use({ video: 'off' });

test.describe('P1441: signup confirmation auto-RSVP', () => {
  let host: TestUser;
  let event: TestEvent;
  const created: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1441 Host' });
    event = await createTestEvent(host.user.id, new Date(Date.now() + 3 * 24 * 3600 * 1000));
  });

  test.afterAll(async () => {
    if (event) await deleteTestEvent(event.id);
    for (const id of created) await deleteTestUser(id).catch(() => {});
    if (host) await deleteTestUser(host.user.id).catch(() => {});
  });

  test('new signup confirming by email is RSVPd as themselves', async ({ page, baseURL }) => {
    const email = generateTestEmail();
    const callback = `${baseURL}/auth/callback?source=signup&redirect=${encodeURIComponent(`/events/${event.slug}`)}&action=rsvp`;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password: `P1441-${Date.now()}-x!`,
      options: { redirectTo: callback, data: { name: 'P1441 Joiner' } },
    });
    expect(error).toBeNull();
    created.push(data!.user!.id);

    const rsvpWrites: number[] = [];
    page.on('response', (res) => {
      if (res.request().method() === 'POST' && res.url().includes('/rest/v1/event_rsvps')) {
        rsvpWrites.push(res.status());
      }
    });

    // The signup tab stays open, as it does on a phone: the person signed up, switched to
    // their mail app, and the link opened a SECOND tab of the same browser.
    const signupTab = await page.context().newPage();
    await signupTab.goto(`/signup?redirect=${encodeURIComponent(`/events/${event.slug}`)}&action=rsvp`);
    await signupTab.waitForLoadState('networkidle');

    await page.bringToFront();
    await page.goto(
      `/auth/verify?token_hash=${data!.properties!.hashed_token}&type=email&redirect_to=${encodeURIComponent(callback)}`,
    );

    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}(/confirm|\\?|$)`), { timeout: 30000 });
    await page.waitForTimeout(3000);

    const { data: rows } = await supabaseAdmin
      .from('event_rsvps')
      .select('profile_id')
      .eq('event_id', event.id)
      .eq('profile_id', data!.user!.id);

    expect({ rsvpWrites, rsvpRows: rows?.length ?? 0 }).toEqual({ rsvpWrites: [201], rsvpRows: 1 });
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/confirm`));
  });
});
