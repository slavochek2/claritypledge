/**
 * P1542 Done-When gaps (round 6 ACs that had no test): the partial learner on the registration thank-you and on the
 * feedback thank-you, and the learning invitation's title while the community name is loading.
 *
 * Needs the P1542 migrations (cloud TEST). Each test seeds its own person; the hikes are organised by the 'cm' group.
 */
import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

const HOURS = 3600 * 1000;
const PHONE = { width: 375, height: 812 };

test.describe('P1542 AC gaps', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let futureHike: TestEvent; // registration thank-you
  let endedHike: TestEvent; // feedback thank-you
  let COMMUNITY = '';
  const users: TestUser[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1542 Gaps Host' });
    const loc = { location: 'Test trailhead, Chiang Mai' };
    futureHike = await createTestEvent(host.user.id, new Date(Date.now() + 7 * 24 * HOURS), { title: 'Social Hike: P1542 gaps future', ...loc });
    endedHike = await createTestEvent(host.user.id, new Date(Date.now() - HOURS), { title: 'Social Hike: P1542 gaps ended', durationMinutes: 60, ...loc });
    const { data: cm, error: cmError } = await supabaseAdmin.from('organization').select('id, name').eq('slug', 'cm').single();
    if (cmError) throw cmError;
    COMMUNITY = (cm!.name as string).split(' · ')[0].trim();
    const m = await supabaseAdmin.from('membership').insert({ org_id: cm!.id, user_id: host.user.id, role: 'organizer' });
    if (m.error) throw m.error;
    for (const e of [futureHike, endedHike]) {
      const { error } = await supabaseAdmin.from('events').update({ series_slug: 'social-hike', org_id: cm!.id }).eq('id', e.id);
      if (error) throw error;
    }
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    for (const e of [futureHike, endedHike]) if (e) await deleteTestEvent(e.id);
    for (const u of [host, ...users]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  /** A registered person who started this event's learning and finished one step of it (partial: not learned). */
  async function partialLearner(name: string, ev: TestEvent): Promise<TestUser> {
    const u = await createTestUser({ email: generateTestEmail(), name });
    users.push(u);
    await rsvpToEvent(ev.id, u.user.id);
    const { error } = await supabaseAdmin.from('event_preparations').upsert(
      { event_id: ev.id, profile_id: u.user.id, started_at: new Date().toISOString(), steps_done: ['principle'] },
      { onConflict: 'event_id,profile_id' },
    );
    if (error) throw error;
    return u;
  }

  test('registration thank-you, partial learner: "Continue learning about <community>", "N min left", "Continue"', async ({ page }) => {
    const u = await partialLearner('P1542 Gaps Partial Reg', futureHike);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${futureHike.slug}/confirm`);
    const card = page.getByTestId('learn-card');
    await expect(card.getByTestId('learn-card-title')).toHaveText(`Continue learning about ${COMMUNITY}`, { timeout: 30_000 });
    await expect(card.getByTestId('learn-card-minutes')).toHaveText(/^\d+ min left$/);
    await expect(card.getByTestId('learn-card-cta')).toHaveText('Continue');
  });

  test('feedback thank-you, partial learner non-member: the line under Join reads "About N minutes left of the introduction."', async ({ page }) => {
    const u = await partialLearner('P1542 Gaps Partial Close', endedHike);
    // The three feedback answers are in: the close resumes after them.
    const fb = await supabaseAdmin.from('event_feedback').insert({ event_id: endedHike.id, user_id: u.user.id, score: 8, improve: 'Gaps improve.', liked: 'Gaps liked.', quote_ok: false });
    if (fb.error) throw fb.error;
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${endedHike.slug}/close`);
    await passAsks(page);
    const join = page.getByTestId('end-join');
    await expect(join.getByRole('button', { name: `Join ${COMMUNITY}` })).toBeVisible({ timeout: 20_000 });
    await expect(join.getByTestId('end-join-learn-first')).toHaveText(/^About \d+ minutes? left of the introduction\.$/);
  });

  test('learning finished in the room: its title never shows a fallback community name, even while the name is loading', async ({ page }) => {
    // Founder round 9: the title is "You've learned the clarity principle" — it names no community, so a slow group read
    // cannot put a fallback name into it. Proven with the group reads held.
    const u = await createTestUser({ email: generateTestEmail(), name: 'P1542 Gaps Room End' });
    users.push(u);
    await rsvpToEvent(futureHike.id, u.user.id);
    const at = new Date().toISOString();
    const pr = await supabaseAdmin.from('event_preparations').upsert(
      { event_id: futureHike.id, profile_id: u.user.id, started_at: at, completed_at: at },
      { onConflict: 'event_id,profile_id' },
    );
    if (pr.error) throw pr.error;
    await page.setViewportSize(PHONE);
    await page.route(/\/rest\/v1\/organization/, async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue(); });
    await setTestSession(page, u.email);
    // Sample the title for as long as the held group read is outstanding, then once more after it lands.
    const orgRead = page.waitForResponse(/\/rest\/v1\/organization/, { timeout: 30_000 });
    await page.goto(`/events/${futureHike.slug}/prepare?from=room`);
    const heading = page.getByTestId('learn-room-end').getByRole('heading');
    const seen = new Set<string>();
    const sample = async () => {
      const text = await heading.textContent({ timeout: 200 }).catch(() => null);
      if (text) seen.add(text.trim());
    };
    let landed = false;
    void orgRead.then(() => { landed = true; }, () => { landed = true; });
    while (!landed) { await sample(); await page.waitForTimeout(50); }
    await orgRead;
    await expect(heading).toBeVisible();
    await sample();
    console.log(`[gaps] room-end titles: ${JSON.stringify([...seen])}`);
    expect([...seen]).toEqual(["You've learned the clarity principle"]);
  });

  test('event page after the event: nothing for a person who opened the group chat; the link stays for one who never did', async ({ page, browser }) => {
    test.setTimeout(90_000);
    // Box 274 gap. The open is recorded under group_chat_key(url): sha256 of the trimmed link without query or trailing
    // slash — this URL has neither, so the hash of the URL itself is that key. The never-tapped person is the control
    // that the page shows the chat at all after the event; if the key were wrong, the tapped person would see it too.
    const url = 'https://chat.whatsapp.com/P1542GapsEndedHike';
    const pi = await supabaseAdmin.from('event_private_info').upsert({ event_id: endedHike.id, group_chat_url: url }, { onConflict: 'event_id' });
    if (pi.error) throw pi.error;
    const tapped = await createTestUser({ email: generateTestEmail(), name: 'P1542 Gaps Tapped' });
    const never = await createTestUser({ email: generateTestEmail(), name: 'P1542 Gaps Never' });
    users.push(tapped, never);
    for (const u of [tapped, never]) await rsvpToEvent(endedHike.id, u.user.id);
    const key = createHash('sha256').update(url, 'utf8').digest('hex');
    const o = await supabaseAdmin.from('group_chat_opens').insert({ profile_id: tapped.user.id, chat_key: key });
    if (o.error) throw o.error;
    await page.setViewportSize(PHONE);

    await setTestSession(page, never.email);
    await page.goto(`/events/${endedHike.slug}`);
    await expect(page.getByTestId('group-chat-link').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('P1542 gaps ended').first()).toBeVisible(); // the anchor the tapped page waits on

    const ctx = await browser.newContext({ viewport: PHONE, baseURL: test.info().project.use.baseURL });
    try {
      const p2 = await ctx.newPage();
      await setTestSession(p2, tapped.email);
      // The block decides from the server's answer to "has this person opened it?" — wait for that answer, not a timer.
      const opened = p2.waitForResponse(/\/rest\/v1\/rpc\/group_chat_opened/, { timeout: 30_000 });
      await p2.goto(`/events/${endedHike.slug}`);
      await expect(p2.getByText('P1542 gaps ended').first()).toBeVisible({ timeout: 20_000 });
      expect(await (await opened).json()).toBe(true);
      await expect(p2.getByTestId('group-chat-link')).toHaveCount(0);
      await expect(p2.getByTestId('group-chat-block')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

async function passAsks(page: Page) {
  const end = page.getByTestId('step-end');
  await expect(page.getByTestId('ask-connect').or(end)).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 4 && !(await end.isVisible()); i++) {
    await page.locator('[data-testid="ask-connect"], [data-testid="ask-community"], [data-testid="community-terms"]')
      .getByRole('button', { name: 'Not now' }).click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await expect(end).toBeVisible({ timeout: 15_000 });
}
