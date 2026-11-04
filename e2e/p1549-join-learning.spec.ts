/**
 * P1549: Join as member on a group page goes through the learning unless the person has learned.
 * The gate is advisory, not a security boundary (spec Invariants): these prove the supported UI only.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestOrganization, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { seedLearned, seedLearnedInBrowser } from './helpers/prep-learned';

const WHY = 'This community practises them together and shares them with others.';
const users: TestUser[] = [];
let org: TestOrganization;
let owner: TestUser;

async function user(name: string) {
  const u = await createTestUser({ name });
  users.push(u);
  return u;
}
const joinUrl = () => `/groups/${org.slug}/join`;

async function openJoinFromGroup(page: Page) {
  await page.goto(`/groups/${org.slug}`);
  await page.getByRole('button', { name: /Join/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`${joinUrl()}`));
}


test.describe('P1549 join learning', () => {
  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P1549 Owner' });
    org = await createTestOrganization({ name: 'P1549 Practice · Test' });
  });
  test.afterAll(async () => {
    await deleteTestOrganization(org.id);
    for (const u of [owner, ...users]) {
      await supabaseAdmin.from('point_positions').delete().eq('user_id', u.user.id);
      await deleteTestUser(u.user.id);
    }
  });

  test('never learned: Part 1 with the why and three computed steps, no terms', async ({ page }) => {
    const u = await user('P1549 New');
    await setTestSession(page, u.email);
    await openJoinFromGroup(page);
    await expect(page.getByTestId('join-part-1')).toBeVisible();
    await expect(page.getByTestId('join-step')).toHaveText('Part 1 of 2 · Short introduction');
    await expect(page.getByTestId('prepare-why')).toContainText(WHY);
    await expect(page.getByTestId('join-steps').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('join-part-1-title')).toHaveText(/^Before you join: about \d+ minutes$/);
    await expect(page.getByRole('button', { name: 'Accept and join' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start learning' })).toBeVisible();
    // Back returns to the group and the browser's own Back never lands on /join afterwards.
    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`));
  });

  test('join mode offers no skip; leaving after step 1 resumes ticked', async ({ page }) => {
    const u = await user('P1549 Resume');
    await setTestSession(page, u.email);
    await page.goto(joinUrl());
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page).toHaveURL(/\/prepare\?.*then=join/);
    await expect(page.getByTestId('learn-join-step')).toHaveText('Part 1 of 2 · Short introduction');
    await expect(page.getByRole('button', { name: 'Continue without video' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play the video' })).toBeVisible();
    await supabaseAdmin.from('person_prep_parts').upsert({ profile_id: u.user.id, part: 'cognitive_video', content_version: 1, completed_at: new Date().toISOString() }, { onConflict: 'profile_id,part' });
    await page.goto(joinUrl());
    await expect(page.getByTestId('join-part-1-title')).toHaveText(/^Welcome back: about \d+ minutes left$/);
    await expect(page.getByTestId('join-step-story')).toHaveAttribute('data-done', 'true');
    await expect(page.getByTestId('join-step-principle')).toHaveAttribute('data-done', 'false');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Introducing the Clarity Meeting Principle')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue without video' })).toHaveCount(0);
  });

  test('learned elsewhere: straight to the terms, with Review it returning to the terms', async ({ page }) => {
    const u = await user('P1549 Learned');
    await seedLearned(u.user.id);
    await setTestSession(page, u.email);
    await openJoinFromGroup(page);
    await expect(page.getByTestId('join-terms-step')).toHaveText('Group terms');
    await expect(page.getByTestId('already-learned')).toContainText("You've already done the learning.");
    await page.getByRole('link', { name: 'Review it' }).click();
    await expect(page).toHaveURL(/\/prepare\?review=/);
    await expect(page.getByTestId('agenda').locator('li')).toHaveCount(3);
    await page.getByTestId('header-back').click();
    await expect(page).toHaveURL(new RegExp(`${joinUrl()}$`));
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`), { timeout: 10000 });
    const { data } = await supabaseAdmin.from('membership').select('user_id').eq('org_id', org.id).eq('user_id', u.user.id);
    expect(data).toHaveLength(1);
    // Now a member: the review link on the About tab and on their terms.
    await page.goto(joinUrl());
    await expect(page.getByTestId('review-how-we-talk')).toBeVisible();
    await expect(page.getByTestId('already-learned')).toHaveCount(0);
    await page.getByTestId('review-how-we-talk').click();
    await page.getByTestId('header-back').click();
    await expect(page).toHaveURL(new RegExp(`${joinUrl()}$`));
  });

  test('any completed event preparation counts as learned', async ({ page }) => {
    const u = await user('P1549 Event Prep');
    // Exercised through the same read; a row needs an event, so the read itself is what is asserted.
    await setTestSession(page, u.email);
    await page.route('**/rest/v1/event_preparations*', (r) => r.fulfill({ json: [{ completed_at: new Date().toISOString() }] }));
    await page.goto(joinUrl());
    await expect(page.getByRole('button', { name: 'Accept and join' })).toBeVisible();
  });

  test('read-only terms for a non-member, then Join leads to Part 1', async ({ page }) => {
    await page.goto(`${joinUrl()}?view=terms`);
    await expect(page.getByText('Clarity Group Terms')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept and join' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Join P1549 Practice' }).click();
    await expect(page.getByTestId('join-part-1')).toBeVisible();
  });

  test('a failed parts read shows retry, never Part 1 or the terms; retry recovers', async ({ page }) => {
    const u = await user('P1549 Fail');
    await setTestSession(page, u.email);
    let fail = true;
    await page.route('**/rest/v1/person_prep_parts*', (r) => (fail ? r.fulfill({ status: 500, json: { message: 'nope' } }) : r.fallback()));
    await page.goto(joinUrl());
    await expect(page.getByTestId('join-read-error')).toBeVisible();
    await expect(page.getByTestId('join-part-1')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept and join' })).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('join-part-1')).toBeVisible();
  });

  test('signed out: a learner goes to sign-up with action=join-org', async ({ page }) => {
    await seedLearnedInBrowser(page);
    await page.goto(joinUrl());
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(/\/signup\?redirect=.*action=join-org/);
  });

  test('an outside ?review= is ignored: the plain page with its four steps', async ({ page }) => {
    await page.goto('/prepare?review=' + encodeURIComponent('//evil.example'));
    await expect(page.getByTestId('agenda').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('prepare-why')).toContainText('This short introduction shows you');
    await expect(page.getByTestId('prepare-why')).not.toContainText(WHY);
    await expect(page.getByRole('button', { name: 'Start here' })).toBeVisible();
    await page.getByRole('button', { name: 'Start here' }).click();
    await expect(page.getByRole('button', { name: 'Continue without video' })).toBeVisible();
  });

  const callbackUrl = () => `/auth/callback?action=join-org&redirect=${encodeURIComponent(joinUrl())}`;
  const partsOf = async (id: string) => ((await supabaseAdmin.from('person_prep_parts').select('part').eq('profile_id', id)).data ?? []).map((r) => r.part).sort();

  test('the whole walk: Part 1, the learning, Part 2, Accept; browser Back never returns to the flow', async ({ page }) => {
    const u = await user('P1549 Walk');
    await supabaseAdmin.from('person_prep_parts').upsert({ profile_id: u.user.id, part: 'cognitive_video', content_version: 1, completed_at: new Date().toISOString() }, { onConflict: 'profile_id,part' });
    const { data: pts } = await supabaseAdmin.from('points').select('id').contains('tags', ['cmp7']);
    await supabaseAdmin.from('point_positions').insert((pts ?? []).map((p) => ({ point_id: p.id, user_id: u.user.id, position: 'agree' })));
    await setTestSession(page, u.email);
    await openJoinFromGroup(page);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    // The video element reports a play; headless media cannot be relied on to start by itself.
    await page.getByRole('button', { name: 'Play the video' }).click();
    await page.locator('video').first().evaluate((v) => v.dispatchEvent(new Event('play')));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Opt in' }).click();
    await page.getByRole('button', { name: 'Try it now' }).click();
    await page.getByRole('button', { name: 'Rate 8' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByTestId('answered-count')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip and proceed' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByTestId('join-terms-step')).toHaveText('Part 2 of 2 · Group terms');
    await expect(page.getByTestId('already-learned')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${joinUrl()}$`));
    // Reload keeps the entry's Part 2 label.
    await page.reload();
    await expect(page.getByTestId('join-terms-step')).toHaveText('Part 2 of 2 · Group terms');
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`), { timeout: 10000 });
    await expect.poll(async () => (await supabaseAdmin.from('person_prep_parts').select('part').eq('profile_id', u.user.id).eq('part', 'cmp7')).data?.length).toBe(1);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/prepare|\/join/);
  });

  test('navigation: step Back to Part 1, browser Back to the group, reload on a step restarts at the first undone', async ({ page }) => {
    const u = await user('P1549 Nav');
    await setTestSession(page, u.email);
    await openJoinFromGroup(page);
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page).toHaveURL(/then=join/);
    await page.reload();
    await expect(page.getByText('What is cognitive understanding?')).toBeVisible();
    await page.getByTestId('header-back').click();
    await expect(page.getByTestId('join-part-1')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('join-part-1')).toBeVisible();
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page).toHaveURL(/then=join/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`));
  });

  test('the principle intro alone does not tick step 2', async ({ page }) => {
    const u = await user('P1549 Intro');
    const at = new Date().toISOString();
    await supabaseAdmin.from('person_prep_parts').upsert(['cognitive_video', 'principle_intro'].map((part) => ({ profile_id: u.user.id, part, content_version: 1, completed_at: at })), { onConflict: 'profile_id,part' });
    await setTestSession(page, u.email);
    await page.goto(joinUrl());
    await expect(page.getByTestId('join-step-principle')).toHaveAttribute('data-done', 'false');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Introducing the Clarity Meeting Principle')).toBeVisible();
  });

  test('pending: only the loader shows until the parts read answers', async ({ page }) => {
    const u = await user('P1549 Pending');
    await setTestSession(page, u.email);
    await page.route('**/rest/v1/person_prep_parts*', async (r) => { await new Promise((d) => setTimeout(d, 2500)); await r.fallback(); });
    await page.goto(joinUrl());
    await expect(page.getByTestId('join-part-1')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept and join' })).toHaveCount(0);
    await expect(page.getByTestId('join-part-1')).toBeVisible({ timeout: 15000 });
  });

  test('sign-up callback moves this browser\'s parts to the account, then joins', async ({ page }) => {
    const u = await user('P1549 Transfer');
    await setTestSession(page, u.email);
    await seedLearnedInBrowser(page);
    await page.goto(callbackUrl());
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`), { timeout: 20000 });
    expect(await partsOf(u.user.id)).toEqual(['cmp7', 'cognitive_video']);
    const { data } = await supabaseAdmin.from('membership').select('user_id').eq('org_id', org.id).eq('user_id', u.user.id);
    expect(data).toHaveLength(1);
  });

  test('a failed transfer still joins, and the parts stay in this browser', async ({ page }) => {
    const u = await user('P1549 Transfer Fail');
    await setTestSession(page, u.email);
    await seedLearnedInBrowser(page);
    await page.route('**/rest/v1/person_prep_parts*', (r) => (r.request().method() === 'GET' ? r.fallback() : r.fulfill({ status: 500, json: { message: 'nope' } })));
    await page.goto(callbackUrl());
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`), { timeout: 20000 });
    const { data } = await supabaseAdmin.from('membership').select('user_id').eq('org_id', org.id).eq('user_id', u.user.id);
    expect(data).toHaveLength(1);
    expect(await page.evaluate(() => localStorage.getItem('cp-prep-parts'))).toContain('cognitive_video');
  });

  test('a member sees Review how we talk on About; a non-member does not', async ({ page }) => {
    await page.goto(`/groups/${org.slug}?tab=about`);
    await expect(page.getByTestId('review-how-we-talk')).toHaveCount(0);
    const u = await user('P1549 Member');
    await supabaseAdmin.from('membership').insert({ org_id: org.id, user_id: u.user.id });
    await setTestSession(page, u.email);
    await page.goto(`/groups/${org.slug}?from=${u.user.id}`);
    await expect(page.getByTestId('review-how-we-talk')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('review-how-we-talk').click();
    await expect(page.getByTestId('agenda').locator('li')).toHaveCount(3);
    await page.getByTestId('header-back').click();
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}`));
  });

  for (const width of [1440, 375, 320]) {
    test(`layout at ${width}: no overflow, primaries centred`, async ({ page }) => {
      const shot = process.env.P1549_SHOTS;
      await page.setViewportSize({ width, height: 800 });
      const check = async (name: string, button: string) => {
        const b = page.getByRole('button', { name: button, exact: true });
        await expect(b).toBeVisible({ timeout: 15000 });
        const m = await b.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const c = el.parentElement!.parentElement!.getBoundingClientRect();
          return { centre: r.left + r.width / 2, container: c.left + c.width / 2, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, h: r.height };
        });
        console.log(`[p1549-layout] ${width} ${name}: centre ${m.centre} container ${m.container} viewport ${m.vw}, scrollWidth ${m.sw}, height ${m.h}`);
        expect(Math.abs(m.centre - m.container)).toBeLessThanOrEqual(2);
        expect(m.sw).toBeLessThanOrEqual(m.vw);
        expect(m.h).toBeGreaterThanOrEqual(40);
        if (shot) await page.screenshot({ path: `${shot}/${name}-${width}.png`, fullPage: true });
      };
      await page.goto(joinUrl());
      await check('part1', 'Start learning');
      await page.goto(`${joinUrl()}?view=terms`);
      await check('view-terms', 'Join P1549 Practice');
      await seedLearnedInBrowser(page);
      await page.goto(joinUrl());
      await check('terms', 'Accept and join');
      await page.goto('/prepare');
      await check('prepare', 'Start here');
    });
  }
});
