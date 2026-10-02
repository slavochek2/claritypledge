/**
 * P1347: /topics in a real browser.
 *   - smoke: loads, no console errors, signed out sees one sign-in prompt and no stars;
 *   - signed in: a star tap saves (survives a reload), and the result shows on that topic only.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe('P1347 /topics', () => {
  let voter: TestUser;

  test.beforeAll(async () => {
    voter = await createTestUser({ name: 'P1347 E2E Voter' });
    // Pledger, so the ring is checkable.
    const { supabaseAdmin } = await import('./helpers/supabase-admin');
    await supabaseAdmin.from('profiles').update({ has_pledged: true, is_verified: true }).eq('id', voter.user.id);
  });
  test.afterAll(async () => {
    await deleteTestUser(voter.user.id);
  });

  test('smoke: page loads and has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/topics');
    await expect(page.getByRole('heading', { name: 'Help pick the next Clarity Night topic' })).toBeVisible();
    await expect(page.getByTestId('topic-row').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: '5 stars' }).first()).toBeVisible();
    // Signed out: stars work; saving needs sign-up or log-in.
    await page.getByTestId('topic-row').first().getByRole('radio', { name: '4 stars' }).click();
    await expect(page.getByTestId('guest-save')).toBeVisible();
    expect(errors.filter((e) => !/404|favicon/i.test(e))).toEqual([]);
  });

  test('a signed-in vote saves and shows the result on that topic only', async ({ page }) => {
    await setTestSession(page, voter.email);
    await page.goto('/topics');
    const rows = page.getByTestId('topic-row');
    await expect(rows.first().getByRole('radio', { name: '4 stars' })).toBeVisible();
    const target = rows.nth(1);
    const title = (await target.getByTestId('topic-title').innerText()).replace(/\s*Online$/, '');

    await target.getByRole('radio', { name: '4 stars' }).click();
    await expect(target.getByTestId('topic-average')).toBeVisible();
    await expect(page.getByTestId('topic-average')).toHaveCount(1);

    await page.reload();
    const again = page.getByTestId('topic-row').filter({ hasText: title });
    await expect(again.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
    await again.getByRole('button', { expanded: false }).first().click();
    await expect(again.getByTestId('topic-voters')).toBeVisible();

    // Faces: round with the pledger ring for a pledger, and the name on hover.
    const face = again.getByTestId('topic-voters').getByTestId('gravatar-avatar').first();
    await expect(face).toHaveAttribute('data-pledger', 'true');
    await face.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: 'P1347 E2E Voter' }).first()).toBeVisible();
    await again.screenshot({ path: 'test-results/p1347-voter-face.png' });

    // Read more: tapping a topic expands its short line.
    const first = page.getByTestId('topic-row').filter({ hasText: "How do you know what's true?" });
    await first.getByRole('button', { expanded: false }).first().click();
    await expect(first.getByTestId('topic-why')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/p1347-expanded-390.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.screenshot({ path: 'test-results/p1347-320.png', fullPage: true });
    await again.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: 'test-results/p1347-320-voted.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/p1347-desktop.png', fullPage: true });

    // Real TEST votes from seeded test accounts: rate the top four, then look.
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [title, stars] of [['Should every vote count the same?', 5], ["How do you know what's true?", 4], ['AI, thinking and understanding', 3], ['AI and psychology / AI therapists', 4]] as const) {
      const r = page.getByTestId('topic-row').filter({ hasText: title });
      if (await r.count()) {
        const star = r.getByRole('radio', { name: `${stars} stars` });
        if ((await star.getAttribute('aria-checked')) !== 'true') await star.click();
        await expect(r.getByTestId('topic-result')).toBeVisible();
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/p1347-seeded-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: 'test-results/p1347-seeded-375.png' });
    // Faces in a pile sit on one line (a photo face once sat higher than initials faces).
    const pile = page.getByTestId('topic-row').filter({ hasText: 'Should every vote count the same?' }).getByTestId('topic-voters');
    await pile.screenshot({ path: 'test-results/p1347-faces-375.png' });
    const tops = await pile.getByTestId('gravatar-avatar').evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(tops.length).toBeGreaterThan(1);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.screenshot({ path: 'test-results/p1347-seeded-320.png' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: 'test-results/p1347-seeded-375-bottom.png' });

    // Add a topic opens a dialog.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: /add a topic/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(400); // let the open animation finish before the screenshot
    await page.screenshot({ path: 'test-results/p1347-add-375.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: 'test-results/p1347-add-desktop.png' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Made-up crowd (served to the browser only; the database is untouched): how 2, 3, 7, 37 voters look.
    const fake = (n: number) =>
      Array.from({ length: n }, (_, k) => ({ name: `Test Voter ${k + 1}`, slug: null, avatarUrl: null, avatarColor: null, hasPledged: k % 3 === 0 }));
    const row = (i: number, title: string, mine: number | null, avg: number | null, count: number | null, faces: number) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`, title, why: 'A short line about the topic.', track: 'room', source: 'host',
      my_rating: mine, my_is_public: mine ? true : null, rating_avg: avg, rating_count: count, voters: mine ? fake(faces) : null,
    });
    await page.route('**/rest/v1/rpc/get_open_topics*', (route) =>
      route.fulfill({ json: [
        row(1, 'How do you know what\'s true?', 5, 4.6, 37, 31), row(2, 'AI and meaning / work', 4, 3.9, 7, 5),
        row(3, 'AI and thinking', 3, 3.3, 3, 3), row(4, 'AI and truth', 2, 2.5, 2, 1), row(5, 'AI and education', null, null, null, 0),
        row(6, 'AI and consciousness', null, null, null, 0),
      ] }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await page.getByTestId('topic-row').first().getByRole('button', { expanded: false }).first().click();
    await expect(page.getByText('+34')).toBeVisible(); // 37 votes: 3 faces + 34 (anonymous included)
    await page.screenshot({ path: 'test-results/p1347-crowd-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: 'test-results/p1347-crowd-375.png' });
    await page.getByTestId('topic-row').nth(1).getByRole('button', { expanded: false }).first().click();
    await page.screenshot({ path: 'test-results/p1347-crowd-375-open.png' });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.screenshot({ path: 'test-results/p1347-crowd-320.png' });
  });
});
