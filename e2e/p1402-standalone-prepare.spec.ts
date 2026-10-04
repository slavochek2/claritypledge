/**
 * @file p1402-standalone-prepare.spec.ts
 * @description P1402 — /prepare without an event. Real browser, real test DB.
 *
 * Covers: a signed-out visitor opens it with no sign-in wall (320px, no console errors) and walks
 * story → principle → cmp7 → end; a part done signed out is written to the account at sign-in and
 * is NOT asked again in an event's preparation; a person who has done everything still sees every
 * step on /prepare, checked and replayable (it hides nothing).
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 3600 * 1000);
const STORY_LABEL = 'Learn the definition of cognitive understanding';

test.describe('P1402 standalone /prepare', () => {
  let host: TestUser;
  const users: TestUser[] = [];
  const events: TestEvent[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1402 E2E Host' });
  });

  test.afterAll(async () => {
    for (const e of events) await deleteTestEvent(e.id);
    for (const u of [host, ...users]) if (u?.user?.id) {
      await supabaseAdmin.from('point_positions').delete().eq('user_id', u.user.id);
      await deleteTestUser(u.user.id);
    }
  });

  test('smoke: signed out at 320px, no wall, walks to the end; no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/prepare');

    await expect(page).toHaveURL(/\/prepare$/);
    await expect(page.getByTestId('prepare-why')).toBeVisible();
    await expect(page.getByTestId('agenda').locator('li')).toHaveCount(4);
    // Founder UAT 2026-10-04: no sign-in prompt on the first screen.
    await expect(page.getByText(/sign in/i)).toHaveCount(0);
    // A focus route while the steps run: no BottomNav, no site nav.
    await expect(page.getByRole('navigation')).toHaveCount(0);

    await page.getByRole('button', { name: 'Start here' }).click();
    await expect(page.getByText('Step 1 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Continue without video' }).click();
    await page.getByRole('button', { name: 'Continue without video' }).click();
    await expect(page.getByTestId('principle-decision-question')).toHaveText('Would you follow this principle in your important conversations?');
    // Opt out → "can I ask you one question?" → Back → change to opt in → Try it now → 0-10.
    await page.getByRole('button', { name: 'Opt out' }).click();
    await expect(page.getByTestId('opt-out-ask')).toBeVisible();
    await page.getByTestId('header-back').click();
    await page.getByRole('button', { name: 'Opt in' }).click();
    await expect(page.getByTestId('try-it-now')).toBeVisible();
    await page.getByRole('button', { name: 'Try it now' }).click();
    await expect(page.getByTestId('rating-asker')).toBeVisible();
    await page.getByRole('button', { name: 'Rate 8' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Step 3 of 4')).toBeVisible();
    await expect(page.locator('[data-point-id]').first()).toBeVisible();
    await expect(page.getByTestId('answered-count')).toContainText('0 of 7 answered');
    await page.getByRole('button', { name: 'Skip and proceed' }).click();
    await expect(page.getByText('Step 4 of 4')).toBeVisible();
    await expect(page.locator('[data-point-id]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Skip and proceed' }).click();
    await expect(page.getByTestId('prepare-end')).toBeVisible();
    // The end is a destination: the menus are back (?done=1) and it points on like the home page.
    await expect(page).toHaveURL(/\/prepare\?done=1$/);
    await expect(page.getByTestId('next-events-compact')).toBeVisible();
    await expect(page.getByText('Groups')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'All events' })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    // Skipping the videos completed nothing.
    expect(await page.evaluate(() => localStorage.getItem('cp-prep-parts'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a part done signed out joins the account at sign-in and is not asked again in an event', async ({ page }) => {
    const ev = await createTestEvent(host.user.id, inTwoDays(), {
      title: 'Clarity Night #97: P1402 test',
      location: 'Test venue, Chiang Mai',
    });
    events.push(ev);
    await supabaseAdmin.from('events').update({ preparation_enabled: true, statement_tag: null }).eq('id', ev.id);
    const u = await createTestUser({ name: 'P1402 Carry' });
    users.push(u);
    await rsvpToEvent(ev.id, u.user.id);

    // Signed out: watch the story on /prepare.
    await page.goto('/prepare');
    await page.getByRole('button', { name: 'Start here' }).click();
    await page.getByRole('button', { name: 'Play the video' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Step 2 of 4')).toBeVisible();
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('cp-prep-parts') ?? '{}'));
    expect(Object.keys(local)).toEqual(['cognitive_video']);

    // Signs in, opens the event's preparation: the story step is not in the plan.
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/prepare`);
    await expect(page.getByTestId('agenda')).toBeVisible();
    await expect(page.getByTestId('agenda')).not.toContainText(STORY_LABEL);
    await expect(page.getByTestId('agenda')).toContainText('See how this event is different');

    await expect.poll(async () => {
      const { data } = await supabaseAdmin
        .from('person_prep_parts').select('part, completed_at').eq('profile_id', u.user.id);
      return data ?? [];
    }).toEqual([{ part: 'cognitive_video', completed_at: expect.any(String) }]);
    const { data: row } = await supabaseAdmin
      .from('person_prep_parts').select('completed_at').eq('profile_id', u.user.id).eq('part', 'cognitive_video').single();
    // The account keeps the time it was done on /prepare, not the time of the sync.
    expect(new Date(row!.completed_at as string).getTime()).toBe(new Date(local.cognitive_video.completedAt).getTime());
    expect(await page.evaluate(() => localStorage.getItem('cp-prep-parts'))).toBeNull();
  });

  test('/prepare hides nothing: everything done still lists every step, checked and replayable', async ({ page }) => {
    const u = await createTestUser({ name: 'P1402 Done' });
    users.push(u);
    const at = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin.from('person_prep_parts').upsert(
      ['intro_video', 'cognitive_video', 'principle_intro', 'cmp7'].map((part) => ({
        profile_id: u.user.id, part, content_version: 1, completed_at: at,
      })),
      { onConflict: 'profile_id,part' },
    );
    await setTestSession(page, u.email);
    await page.goto('/prepare');

    await expect(page.getByTestId('agenda').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('agenda-step-story')).toHaveAttribute('data-done', 'true');
    await expect(page.getByTestId('agenda-step-principle')).toHaveAttribute('data-done', 'true');
    await page.getByTestId('agenda-step-story').getByRole('button').click();
    await expect(page.getByTestId('clip-story')).toBeVisible();
  });
});
