/**
 * @file host-learns-in-room.spec.ts
 * @description Founder 2026-11-02: a hike's host sees "Learn the principle" so they can show people where to click.
 * A host has no RSVP: the walk must save for real, in the room and on /events/:slug/prepare.
 * Per-run cost (metered-services rule 6): 1 user and 1 event created and deleted; 2 browser sessions; 1 poll read loop.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let host: TestUser;
let hike: TestEvent;

test.beforeAll(async () => {
  host = await createTestUser({ name: 'Host Learns' });
  hike = await createTestEvent(host.user.id, new Date(Date.now() + 48 * 3600 * 1000), { title: 'Social Hike: Host Learns', location: 'Test trail, Chiang Mai' });
  await supabaseAdmin.from('events').update({ series_slug: 'social-hike' }).eq('id', hike.id);
});
test.afterAll(async () => {
  await deleteTestEvent(hike.id);
  await deleteTestUser(host.user.id);
});

test('the host, with no RSVP, walks the learning in the room and it saves', async ({ page }) => {
  await setTestSession(page, host.email);
  await page.goto(`/events/${hike.slug}/meet`);
  await expect(page.getByTestId('room-step-learn')).toHaveText('Learn the principle', { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/host-learn-tab.png' });
  await page.getByTestId('room-step-learn').click();
  await expect(page.getByTestId('room-learn')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Start now' }).click();
  await expect(page.getByText('Could not save your progress')).toHaveCount(0);
  await expect.poll(async () => {
    const { data } = await supabaseAdmin.from('event_preparations').select('started_at, rsvp_id')
      .eq('event_id', hike.id).eq('profile_id', host.user.id).maybeSingle();
    return data?.started_at ? 'saved' : 'none';
  }, { timeout: 15_000 }).toBe('saved');
  await page.screenshot({ path: 'test-results/host-learn-walk.png' });
});

test('the host is not bounced off /events/:slug/prepare', async ({ page }) => {
  await setTestSession(page, host.email);
  await page.goto(`/events/${hike.slug}/prepare`);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(new RegExp(`/events/${hike.slug}/prepare`));
  // The walk itself, not some other page.
  await expect(page.getByTestId('p1336-prep')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('We could not load your preparation')).toHaveCount(0);
});
