/**
 * P1603: hidden events, visible only with the link — the browser path.
 *
 * Signed out opens the link; sign-in then RSVP through the link; a stranger's events list does not show it (public
 * event as control in the same list); the checkbox flow creates a hidden event with a long link and the host sees the
 * Hidden mark; the host's own events list does not show it either (global lists never do).
 *
 * The sign-UP then auto-RSVP leg needs a real email round trip and is not driven here: this spec asserts the sign-up
 * redirect carries the exact link, and the registration itself is exercised signed in. The database half (ids are not
 * access) is e2e/integration/20261103030000_p1603_hidden_events.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P1603 — hidden events', () => {
  let host: TestUser;
  let stranger: TestUser;
  let hidden: TestEvent;
  let visible: TestEvent;
  const createdSlugs: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    host = await createTestUser({ name: 'P1603 Host' });
    stranger = await createTestUser({ name: 'P1603 Stranger' });
    const inAWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    hidden = await createTestEvent(host.user.id, inAWeek, { title: 'P1603 Friends Test Run', isHidden: true });
    visible = await createTestEvent(host.user.id, inAWeek, { title: 'P1603 Public Gathering' });
  });

  test.afterAll(async () => {
    for (const slug of createdSlugs) await supabaseAdmin.from('events').delete().eq('slug', slug);
    if (hidden) await deleteTestEvent(hidden.id);
    if (visible) await deleteTestEvent(visible.id);
    if (host) await deleteTestUser(host.user.id);
    if (stranger) await deleteTestUser(stranger.user.id);
  });

  test('smoke: signed out, the full link opens a hidden event, with no console errors and no Hidden mark', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(`/events/${hidden.slug}`);
    await expect(page.getByRole('heading', { name: hidden.title })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('hidden-event-mark')).toHaveCount(0); // only the host sees the mark on the page
    // The page tells crawlers not to index it.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // 4xx noise from the public key's own refused table read is the design, not an error the page raises.
    expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('signed out, reserving a seat sends the visitor to sign up with the exact link to come back to', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/events/${hidden.slug}`);
    await page.getByTestId('rsvp-button').filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/signup\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('redirect')).toBe(`/events/${hidden.slug}`);
    expect(url.searchParams.get('action')).toBe('rsvp');
  });

  test('a signed-in stranger: the events list shows the public event and not the hidden one', async ({ page }) => {
    await setTestSession(page, stranger.email);
    await page.goto('/events/list');
    await expect(page.getByText(visible.title).first()).toBeVisible({ timeout: 20000 }); // control: the list loaded and lists public events
    await expect(page.getByText(hidden.title)).toHaveCount(0);
  });

  test('the same stranger opens the link, reserves a seat, and lands on the confirmation', async ({ page }) => {
    await setTestSession(page, stranger.email);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/events/${hidden.slug}`);
    await expect(page.getByRole('heading', { name: hidden.title })).toBeVisible({ timeout: 15000 });
    await page.getByTestId('rsvp-button').filter({ visible: true }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${hidden.slug}/confirm`), { timeout: 20000 });

    // The seat is real and was made by the by-link door, stamped by the server.
    const { data } = await supabaseAdmin.from('event_rsvps').select('rsvped_at').eq('event_id', hidden.id).eq('profile_id', stranger.user.id);
    expect(data).toHaveLength(1);

    // Back on the page the person is going; the registered can still reach the event room's gate.
    await page.goto(`/events/${hidden.slug}`);
    await expect(page.getByText("You're going!").first()).toBeVisible({ timeout: 15000 });
    await page.goto(`/events/${hidden.slug}/room`);
    await expect(page).not.toHaveURL(/not-found|\/events$/);
  });

  test('the host sees the Hidden mark on the page, and the global list does not show the event', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${hidden.slug}`);
    await expect(page.getByRole('heading', { name: hidden.title })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('hidden-event-mark')).toBeVisible();

    await page.goto('/events/list');
    await expect(page.getByText(visible.title).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(hidden.title)).toHaveCount(0);
  });

  test('checkbox flow: the host ticks Hidden event, publishes, and gets a long link and the mark', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto('/events/new');
    await expect(page.getByTestId('create-event-form')).toBeVisible({ timeout: 15000 });

    // Label and helper are the proposed wording; unticked by default.
    await expect(page.getByLabel('Hidden event')).toBeVisible();
    await expect(page.getByText("Only people with the link can see it. It won't appear in event lists.")).toBeVisible();
    await expect(page.getByTestId('hidden-event-checkbox')).toHaveAttribute('aria-checked', 'false');

    const tomorrow = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await page.locator('#title').fill('P1603 Created Hidden Event');
    await page.locator('#date').fill(tomorrow);
    await page.locator('#location').fill('Somewhere nice');
    await page.locator('#description').fill('A hidden event created through the form, for the friends test.');
    await page.getByTestId('hidden-event-checkbox').click();
    await expect(page.getByTestId('hidden-event-checkbox')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /Publish Event/ }).click();

    await expect(page).toHaveURL(/\/events\/[^/?]+\?created=true/, { timeout: 20000 });
    const slug = new URL(page.url()).pathname.split('/')[2];
    createdSlugs.push(slug);
    // …-YYYY-MM-DD-<16 random characters>
    expect(slug).toMatch(/-\d{4}-\d{2}-\d{2}-[a-z2-7]{16}$/);
    await expect(page.getByTestId('hidden-event-mark')).toBeVisible({ timeout: 15000 });

    const row = await supabaseAdmin.from('events').select('is_hidden').eq('slug', slug).single();
    expect(row.data?.is_hidden).toBe(true);
  });

  test('checkbox flow: left unticked, the event is public with the short ending', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto('/events/new');
    await expect(page.getByTestId('create-event-form')).toBeVisible({ timeout: 15000 });
    const tomorrow = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await page.locator('#title').fill('P1603 Created Public Event');
    await page.locator('#date').fill(tomorrow);
    await page.locator('#location').fill('Somewhere nice');
    await page.locator('#description').fill('A public event created through the form, as a control.');
    await page.getByRole('button', { name: /Publish Event/ }).click();

    await expect(page).toHaveURL(/\/events\/[^/?]+\?created=true/, { timeout: 20000 });
    const slug = new URL(page.url()).pathname.split('/')[2];
    createdSlugs.push(slug);
    expect(slug).toMatch(/-\d{4}-\d{2}-\d{2}-[a-z0-9]{1,4}$/);
    await expect(page.getByTestId('hidden-event-mark')).toHaveCount(0);
    const row = await supabaseAdmin.from('events').select('is_hidden').eq('slug', slug).single();
    expect(row.data?.is_hidden).toBe(false);
  });

  test('editing: the host can switch an existing event to hidden; its link does not change', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${visible.slug}/edit`);
    const box = page.getByTestId('hidden-event-checkbox');
    await expect(box).toBeVisible({ timeout: 15000 });
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await box.click();
    await page.getByRole('button', { name: /Save|Update/ }).first().click();
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('events').select('is_hidden, slug').eq('id', visible.id).single();
      return data?.is_hidden === true && data.slug === visible.slug;
    }, { timeout: 20000 }).toBe(true);
    await supabaseAdmin.from('events').update({ is_hidden: false }).eq('id', visible.id);
  });
});
