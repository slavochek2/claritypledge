/**
 * @file p1542-series-recipes.spec.ts
 * @description P1542 — per-series prepare and close recipes, Social Hike as the second recipe, and the
 * review hand-off. Real browser, real test DB, real signed-in sessions. Each test maps to an
 * acceptance criterion; the Clarity Night close is covered unchanged by p1389-event-close.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

/** Opt-in, passive: P1542_COUNT_REQUESTS=1 logs every Supabase request the BROWSER makes in one full run, by kind
 *  (cost budget, round 7c), plus finish_event_close calls per test. Node-side helper traffic is counted outside. */
const REQUEST_COUNTS: Map<string, number> | null = process.env.P1542_COUNT_REQUESTS ? new Map() : null;
const FINISH_PER_TEST: Map<string, number> | null = process.env.P1542_COUNT_REQUESTS ? new Map() : null;
function supabaseKind(url: string, method: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!u.hostname.endsWith('supabase.co')) return null;
  const p = u.pathname;
  if (p.startsWith('/auth/v1/token')) return 'auth: token (sign-in / refresh)';
  if (p.startsWith('/auth/v1/')) return `auth: ${p.slice(9)} ${method}`;
  if (p.startsWith('/rest/v1/rpc/')) return `rpc: ${p.slice(13)}`;
  if (p.startsWith('/rest/v1/')) return `rest: ${p.slice(9)} ${method}`;
  if (p.startsWith('/storage/v1/')) return `storage ${method}`;
  if (p.startsWith('/functions/v1/')) return `function: ${p.slice(14)}`;
  return `other: ${p} ${method}`;
}

const HOURS = 3600 * 1000;
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const GROUP_CHAT = 'https://chat.whatsapp.com/P1542E2ETestGroup';
/** Founder 2026-10-23: the hikes' organising group, named without what follows " · " (stored "… · Chiang Mai"). */
// Founder decision 20: hikes name their organising group (the 'cm' org). Read from the database in beforeAll, never
// hardcoded: the group's name is data (renamed 2026-09-07), and a hardcoded copy drifted from it (round 8e).
let COMMUNITY = '';
let CM_FULL_NAME = '';
const RECOMMEND_Q = 'Are you open to sharing a recommendation for future hikers?';

/** Round 6 (decision 43): where the group chat is not the screen's one action it is a QUIET link — no border, no fill. */
async function expectQuietLink(link: import('@playwright/test').Locator) {
  await expect(link).not.toHaveClass(/bg-blue-600|(^|\s)border(\s|$)|rounded-full/);
  await expect(link.locator('svg')).toHaveClass(/text-\[#25D366\]/);
}

/** Taps a target=_blank link and closes the tab it opens (the tap is what is recorded). */
async function tapExternal(page: Page, link: import('@playwright/test').Locator) {
  const [popup] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await popup.close();
}

/** Exactly one bottom tab, Events, is lit on an event page — or none, when the shell has picked this event as the
 *  person's event of the day. The phone shows no strip on that event's own page, so the oracle is the desktop
 *  sidebar's "Today's event" row (rendered at every width, CSS-hidden on a phone), which the shell marks current there. */
async function expectEventsTabUnlessToday(page: Page, slug: string) {
  // Both follow a read of today's event, so poll the pair until it settles into one of the two allowed states.
  await expect(page.locator('[data-nav="bottom"]')).toBeVisible();
  await expect.poll(() => page.evaluate((s) => {
    const row = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="tonights-event-cta"]')]
      .find((a) => !a.closest('[data-nav="bottom"]'));
    const active = [...document.querySelectorAll('[data-nav="bottom"] [aria-current="page"]')];
    if (row?.getAttribute('aria-current') === 'page' && row.getAttribute('href')?.includes(`/events/${s}`)) {
      return active.length === 0 ? 'today, no tab' : `today, ${active.length} tabs`;
    }
    return active.length === 1 && active[0].textContent?.includes('Events') ? 'Events' : `${active.length} tabs: ${active.map((a) => a.textContent).join('|')}`;
  }, slug), { timeout: 15_000 }).toMatch(/^(today, no tab|Events)$/);
}

async function cmp7Ids(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('points').select('id').contains('tags', ['cmp7']).order('created_at');
  return (data ?? []).map((r) => r.id as string);
}

async function reviewsFor(eventId: string) {
  const { data } = await supabaseAdmin
    .from('series_reviews')
    .select('id, series_slug, quote, status, author_profile_id, source_event_id')
    .eq('source_event_id', eventId);
  return data ?? [];
}

/** The attendee's own signed-in client: finish_event_close reads auth.uid(), so a service client cannot call it. */
async function asUser(email: string) {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

test.describe('P1542 series recipes', () => {
  let host: TestUser;
  let hike: TestEvent; // ended an hour ago
  let oldHike: TestEvent; // past the room's grace: the room opens on Close
  let futureHike: TestEvent; // the optional preparation is offered from its room
  let startedHike: TestEvent; // started 30 minutes ago, still inside the room's grace
  let night: TestEvent; // Clarity Night: no review hand-off
  const users: TestUser[] = [];
  const events: TestEvent[] = [];
  const seededReviewIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000); // hooks default to 30s; the shared test DB can be slow
    host = await createTestUser({ name: 'P1542 E2E Host' });
    await supabaseAdmin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/in/p1542-test-host', is_verified: true, has_pledged: true }).eq('id', host.user.id);
    const loc = { location: 'Test trailhead, Chiang Mai' };
    // A 1-hour hike that started an hour ago: it has ended (founder 2026-10-23 (2): the room opens on Give feedback).
    hike = await createTestEvent(host.user.id, new Date(Date.now() - HOURS), { title: 'Social Hike: P1542 ended', durationMinutes: 60, ...loc });
    oldHike = await createTestEvent(host.user.id, new Date(Date.now() - 14 * HOURS), { title: 'Social Hike: P1542 old', ...loc });
    futureHike = await createTestEvent(host.user.id, new Date(Date.now() + 7 * 24 * HOURS), { title: 'Social Hike: P1542 future', ...loc });
    startedHike = await createTestEvent(host.user.id, new Date(Date.now() - 0.5 * HOURS), { title: 'Social Hike: P1542 started', ...loc });
    night = await createTestEvent(host.user.id, new Date(Date.now() - HOURS), { title: 'Clarity Night #96: P1542 night', ...loc });
    events.push(hike, oldHike, futureHike, startedHike, night);
    // series_slug is service-role only (P1403 guard); Clarity Nights carry their own key (P1414).
    // Founder 2026-10-23 (7, 9): the hikes are organised by the Chiang Mai group, as real hikes are.
    const { data: cm } = await supabaseAdmin.from('organization').select('id, name').eq('slug', 'cm').single();
    CM_FULL_NAME = cm!.name as string;
    COMMUNITY = CM_FULL_NAME.split(' · ')[0].trim();
    // An event's group must be one its host organises (P1060 trigger), as the seed does for real hikes.
    const m = await supabaseAdmin.from('membership').insert({ org_id: cm!.id, user_id: host.user.id, role: 'organizer' });
    if (m.error) throw m.error;
    for (const e of [hike, oldHike, futureHike, startedHike]) {
      const { error } = await supabaseAdmin.from('events').update({ series_slug: 'social-hike', org_id: cm!.id }).eq('id', e.id);
      if (error) throw error;
    }
    await supabaseAdmin.from('events').update({ series_slug: 'clarity-night' }).eq('id', night.id);
    // Round 3: the coordination link (P1194 side table; the has_group_chat flag follows it).
    for (const e of [hike, futureHike]) await supabaseAdmin.from('event_private_info').upsert({ event_id: e.id, group_chat_url: GROUP_CHAT }, { onConflict: 'event_id' });
    // One approved review (the example) and one pending that must never show.
    const { data } = await supabaseAdmin.from('series_reviews').insert([
      { series_slug: 'social-hike', quote: 'P1542 approved example quote.', author_name: 'P1542 Approved Author', status: 'approved', sort_order: 9000 },
      { series_slug: 'social-hike', quote: 'P1542 pending secret quote.', author_name: 'P1542 Pending Author', status: 'pending', sort_order: 9001 },
    ]).select('id');
    seededReviewIds.push(...(data ?? []).map((r) => r.id as string));
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    if (REQUEST_COUNTS) console.log('[p1542 browser request counts]', JSON.stringify(Object.fromEntries(REQUEST_COUNTS)));
    if (FINISH_PER_TEST) console.log('[p1542 finish_event_close per test]', JSON.stringify(Object.fromEntries(FINISH_PER_TEST)));
    await supabaseAdmin.from('series_reviews').delete().in('source_event_id', events.map((e) => e.id));
    if (seededReviewIds.length) await supabaseAdmin.from('series_reviews').delete().in('id', seededReviewIds);
    for (const u of [host, ...users]) if (u?.user?.id) {
      await supabaseAdmin.from('point_positions').delete().eq('user_id', u.user.id);
      await supabaseAdmin.from('email_send_log').delete().eq('profile_id', u.user.id);
      await deleteTestUser(u.user.id);
    }
    for (const e of events) {
      await supabaseAdmin.from('email_send_log').delete().eq('event_id', e.id);
      await deleteTestEvent(e.id);
    }
  });

  let pageErrors: string[] = [];
  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // Cost budget (round 7b/7c): with P1542_COUNT_REQUESTS=1, count every Supabase request the browser makes.
    if (REQUEST_COUNTS && FINISH_PER_TEST) {
      const title = test.info().title.slice(0, 60);
      page.on('request', (r) => {
        if (r.method() === 'OPTIONS') return; // CORS preflight: not billed as an API request
        const kind = supabaseKind(r.url(), r.method());
        if (!kind) return;
        REQUEST_COUNTS.set(kind, (REQUEST_COUNTS.get(kind) ?? 0) + 1);
        if (kind === 'rpc: finish_event_close') FINISH_PER_TEST.set(title, (FINISH_PER_TEST.get(title) ?? 0) + 1);
      });
      page.on('websocket', (ws) => {
        if (supabaseKind(ws.url().replace(/^wss?:/, 'https:'), 'WS')) REQUEST_COUNTS.set('realtime: websocket connections', (REQUEST_COUNTS.get('realtime: websocket connections') ?? 0) + 1);
      });
    }
  });
  test.afterEach(async () => {
    expect(pageErrors).toEqual([]);
  });

  async function attendee(name: string, ev: TestEvent): Promise<TestUser> {
    const u = await createTestUser({ name });
    users.push(u);
    await rsvpToEvent(ev.id, u.user.id);
    return u;
  }

  async function passAsks(page: Page) {
    // Community then connect: "Not now" on each until the thank-you.
    const end = page.getByTestId('step-end');
    for (let i = 0; i < 4 && !(await end.isVisible()); i++) {
      // Scoped to the asks: the thank-you's Join card has its own "Not now" (round 5b), which must not be hit here.
      await page.locator('[data-testid="ask-connect"], [data-testid="ask-community"], [data-testid="community-terms"]')
        .getByRole('button', { name: 'Not now' }).click({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await expect(end).toBeVisible({ timeout: 15_000 });
  }

  test('smoke + AC2/AC4/AC5: a hike close has no topic vote, hike wording, no examples block, one pending review, and a thank-you with no reservation claim', async ({ page }) => {
    const u = await attendee('P1542 Hiker', hike);
    // UAT 2026-10-23 #7: already registered for the next hike — the thank-you must not say "Your place is reserved".
    // The next event is the same host's next hike after this one (pickNextEvent): startedHike, then futureHike.
    for (const next of [startedHike, futureHike]) await rsvpToEvent(next.id, u.user.id);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${hike.slug}/close`);
    // UAT 2026-10-23 #4: no second "We need your feedback" screen — the close opens on the first question.
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('step-intro')).toHaveCount(0);
    // UAT #2 header: Back from the first question leaves the close (no intro to go back to) — checked in AC8 below.

    // AC2: no topic vote; not prepared, so no CMP re-check either (AC3, negative half).
    await page.getByRole('button', { name: 'Rate 9' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('step-topics')).toHaveCount(0);
    await expect(page.getByTestId('step-question')).toHaveText('How can we improve our next event?');
    await page.getByLabel('How can we improve our next event?').fill('Start earlier.');
    await page.getByRole('button', { name: 'Submit' }).click();

    // AC4 / founder UAT round 5: the openness question, no helper line, the consent ticked by default.
    await expect(page.getByTestId('step-question')).toHaveText(RECOMMEND_Q);
    await expect(page.getByTestId('step-helper')).toHaveCount(0);
    await expect(page.getByText(/next hike, and why|2-3 sentences|What did you enjoy/)).toHaveCount(0);
    await expect(page.getByTestId('quote-ok')).toHaveText('Quote me by name to promote future hikes');
    await expect(page.getByTestId('quote-ok').getByRole('checkbox')).toBeChecked();
    // UAT 2026-10-23 #6 (founder): the past-hiker reviews block under the box is gone — it competed with the input.
    await expect(page.getByTestId('review-examples')).toHaveCount(0);
    await expect(page.getByText('P1542 approved example quote.')).toHaveCount(0);
    await expect(page.getByText('P1542 pending secret quote.')).toHaveCount(0);
    await page.getByLabel(RECOMMEND_Q).fill('P1542 lovely walk, great people.');
    // No horizontal overflow at 375px.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Submit' }).click();

    // Founder 2026-10-23 (7): not learned → no join offer; the thank-you's learning link stands in for it.
    await expect(page.getByTestId('ask-connect').or(page.getByTestId('step-end'))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ask-community')).toHaveCount(0);
    await passAsks(page);
    // Round 8f: no join offer. Founder decision 20: the thank-you names the hike's organising group (the 'cm' group,
    // read from the database), so the group's name may appear; the join controls may not.
    await expect(page.getByText(/Join as member|Review group terms/)).toHaveCount(0);
    await expect(page.getByTestId('ask-community')).toHaveCount(0);
    // UAT 2026-10-23 #7: they just finished the hike — a completion message, never a reservation claim.
    await expect(page.getByTestId('step-question')).toHaveText('Thank you for your feedback');
    await expect(page.getByText('Your place is reserved')).toHaveCount(0);
    await expect(page.getByTestId('end-reserved')).toHaveCount(0);
    // Round 6 (E, decision 42): one centred stack, no boxed cards — the thanks, the ONE join button, then the group
    // chat as a quiet link with its post-hike caption. No "Not now".
    const end = page.getByTestId('step-end');
    await expect(end.getByTestId('end-success')).toBeVisible();
    await expect(page.getByTestId('end-thanks-card')).toHaveCount(0);
    const join = page.getByTestId('end-join');
    const joinBtn = join.getByRole('button', { name: `Join ${COMMUNITY}` });
    await expect(joinBtn).toHaveClass(/bg-blue-600/);
    await expect(join.getByTestId('end-join-learn-first')).toHaveText(/^Starts with a (\d+-minute|short) introduction to how we meet\.$/);
    await expect(end.getByRole('button', { name: 'Not now' })).toHaveCount(0);
    const chatLink = page.getByTestId('end-group-chat').getByTestId('group-chat-link');
    await expect(chatLink).toHaveAttribute('href', GROUP_CHAT);
    await expect(chatLink).toHaveText('WhatsApp group');
    await expectQuietLink(chatLink);
    // Founder 2026-10-23 (6): the post-hike caption, and no next-hike offer at all.
    await expect(page.getByTestId('end-group-chat-caption')).toHaveText('Share photos from this hike\nGet info about the next one');
    await expect(page.getByTestId('end-next')).toHaveCount(0);
    await expect(page.getByText(/Join the next hike|Reserve my place/)).toHaveCount(0);
    await expect(page.getByTestId('prep-room-banner-cta')).toHaveCount(0);
    await expect(page.getByText(/Learn about/)).toHaveCount(0);
    const [titleBox, joinBox, chatBox] = [await page.getByTestId('step-question').boundingBox(), await joinBtn.boundingBox(), await chatLink.boundingBox()];
    expect(titleBox!.y).toBeLessThan(joinBox!.y);
    expect(joinBox!.y).toBeLessThan(chatBox!.y);
    // VQA round 5 (3): after the hike, no "last-minute changes" caption.
    await expect(page.getByText(/last-minute/i)).toHaveCount(0);
    // Top-aligned, not centred with a gap above.
    expect(titleBox!.y).toBeLessThan(200);
    // VQA round 5 (1a): the app's bottom tabs are here, and none of them claims this page (it is an event page).
    await expect(page.locator('[data-nav="bottom"]')).toBeVisible();

    // Round 5 (4+5): not learned → the terms cannot be opened directly; Join starts the learning inside the room frame.
    await page.goto(`/events/${hike.slug}/close?join=1`);
    // A cold reload of the whole close (every step's data) — the shared test DB can take well over 20s here.
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('community-terms')).toHaveCount(0);
    await page.getByTestId('end-join').getByRole('button', { name: `Join ${COMMUNITY}` }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${hike.slug}/prepare\\?from=room&then=join`));
    // Visual review round 5: a join context, not the room's step bar (not a trip back to the start).
    await expect(page.getByTestId('learn-join-title')).toHaveText(`Joining ${COMMUNITY}`, { timeout: 20_000 });
    await expect(page.getByTestId('learn-join-step')).toHaveText('Part 1 of 2 · Short introduction');
    await expect(page.getByTestId('learn-room-steps')).toHaveCount(0);
    await expect(page.locator('[data-nav="bottom"]')).toBeVisible();
    // Once learned (here: recorded as done), the same Join lands on the group terms.
    const at = new Date().toISOString();
    await supabaseAdmin.from('event_preparations').upsert(
      { event_id: hike.id, profile_id: u.user.id, started_at: at, completed_at: at },
      { onConflict: 'event_id,profile_id' },
    );
    await page.goto(`/events/${hike.slug}/close?join=1`);
    await expect(page.getByTestId('community-terms')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Accept and join' })).toBeVisible();
    // Round 5c (C): opened directly (not through this flow's learning), so no step count.
    await expect(page.getByTestId('join-context')).toHaveCount(0);
    // Founder round 9: no "Group terms" eyebrow above "Join …".
    await expect(page.getByText('Group terms', { exact: true })).toHaveCount(0);
    // The terms keep the screen: no "Today's event" strip. Round 6b: the actions are PINNED and never move between the
    // top and the end of the terms; the page's Back is the shell's standard "Back" (to the thank-you).
    await expect(page.locator('[data-nav="bottom"] [data-testid="tonights-event-cta"]')).toHaveCount(0);
    await expect(page.getByTestId('terms-actions')).toHaveCount(1);
    const acceptTop = (await page.getByRole('button', { name: 'Accept and join' }).boundingBox())!.y;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    expect(Math.abs((await page.getByRole('button', { name: 'Accept and join' }).boundingBox())!.y - acceptTop)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('header-back')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back', exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Members accept these non[-\u2011]binding terms as a shared intention\.$/)).toBeVisible();

    // AC5: exactly one pending review, linked to the person's profile.
    await expect.poll(async () => (await reviewsFor(hike.id)).length, { timeout: 15_000 }).toBe(1);
    const rows = await reviewsFor(hike.id);
    expect(rows[0]).toMatchObject({ series_slug: 'social-hike', quote: 'P1542 lovely walk, great people.', status: 'pending', author_profile_id: u.user.id });

    // VQA round 4 (founder: "one active menu item on every hike page", commit 37e9c4acf): the event pages belong to
    // Events — unless this event is the person's event of the day, when the "Today's event" strip claims it and no tab
    // is lit (shell-nav.ts). Checked on the event page itself, where the strip can show (the terms screen above hides
    // it); which state applies depends on the clock, so the helper accepts exactly those two.
    await page.goto(`/events/${hike.slug}`);
    await expect(page.getByText(hike.title).first()).toBeVisible({ timeout: 20_000 });
    await expectEventsTabUnlessToday(page, hike.slug);

    // Coming back to the finished close adds nothing.
    await page.goto(`/events/${hike.slug}/close`);
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 20_000 });
    expect(await reviewsFor(hike.id)).toHaveLength(1);

    // Round 6 (decision 43): once the group chat is tapped it is not offered again — at once, and after a reload.
    const link = page.getByTestId('end-group-chat').getByTestId('group-chat-link');
    await tapExternal(page, link);
    await expect(page.getByTestId('end-group-chat')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('end-join')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('end-group-chat')).toHaveCount(0);

    // Round 6 (B, decision 40): the room knows this feedback is finished — no button, and the step is ticked.
    // Opt in was never answered, so it carries no tick (round 6).
    await page.goto(`/events/${hike.slug}/meet`);
    // The room's own close read on the shared test DB can take as long as the close page's (see above).
    await expect(page.getByTestId('room-close-heading')).toHaveText('Thanks, your feedback is in.', { timeout: 45_000 });
    await expect(page.getByTestId('room-close-feedback')).toHaveCount(0);
    await expect(page.getByTestId('room-close-time')).toHaveCount(0);
    await expect(page.getByTestId('room-step-close-check')).toBeVisible();
    await expect(page.getByTestId('room-step-principle-check')).toHaveCount(0);
    // Round 6c (E): not a dead end — this non-member (learned above) is offered the same Join, straight to the terms.
    // Round 6c (H): at 320 the label wraps rather than clipping.
    const roomJoin = page.getByTestId('room-join').getByRole('button', { name: `Join ${COMMUNITY}` });
    await expect(roomJoin).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('room-join').getByTestId('end-join-learn-first')).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await roomJoin.evaluate((b) => { const l = b.querySelector('span')!; return l.scrollWidth <= l.clientWidth + 1 && b.scrollWidth <= b.clientWidth + 1; })).toBe(true);
    await page.setViewportSize(PHONE);
    await roomJoin.click();
    await expect(page.getByTestId('community-terms')).toBeVisible({ timeout: 45_000 });
  });

  test('AC5: finishing twice still leaves exactly one; unticked or empty text creates none', async ({ page }) => {
    // Twice through the RPC (a retry after a lost response).
    const a = await attendee('P1542 Twice', hike);
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: a.user.id, score: 8, liked: 'P1542 twice quote.', quote_ok: true });
    const ca = await asUser(a.email);
    expect((await ca.rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    expect((await ca.rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    expect((await reviewsFor(hike.id)).filter((r) => r.author_profile_id === a.user.id)).toHaveLength(1);

    // Unticked: the words stay private.
    const b = await attendee('P1542 Unticked', hike);
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: b.user.id, score: 8, liked: 'P1542 private words.', quote_ok: false });
    expect((await (await asUser(b.email)).rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    // Empty: nothing to quote.
    const c = await attendee('P1542 Empty', hike);
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: c.user.id, score: 8, quote_ok: true });
    expect((await (await asUser(c.email)).rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    const mine = (await reviewsFor(hike.id)).filter((r) => [b.user.id, c.user.id].includes(r.author_profile_id as string));
    expect(mine).toEqual([]);

    // No backfill: a close finished before the hand-off existed stays finished and adds nothing.
    const d = await attendee('P1542 Earlier', hike);
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: d.user.id, score: 8, liked: 'P1542 earlier quote.', quote_ok: true, finished_at: new Date().toISOString() });
    expect((await (await asUser(d.email)).rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    expect((await reviewsFor(hike.id)).filter((r) => r.author_profile_id === d.user.id)).toEqual([]);
    void page;
  });

  test('approve is refused when the person withdrew consent or changed the words after the close; unchanged approves', async () => {
    const { execFileSync } = await import('node:child_process');
    const run = (...a: string[]) => {
      try { return { code: 0, out: execFileSync('node', ['scripts/series-reviews.mjs', ...a, '--env', 'test'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    async function pendingFor(name: string, text: string) {
      const u = await attendee(name, hike);
      await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: u.user.id, score: 8, liked: text, quote_ok: true });
      expect((await (await asUser(u.email)).rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
      const row = (await reviewsFor(hike.id)).find((r) => r.author_profile_id === u.user.id)!;
      expect(row.status).toBe('pending');
      return { u, row };
    }
    // Consent withdrawn after finishing (save_event_feedback still works for the attendee).
    const a = await pendingFor('P1542 Withdraws', 'P1542 words she later withdrew.');
    expect((await (await asUser(a.u.email)).rpc('save_event_feedback', { p_event_id: hike.id, p_score: 8, p_liked: 'P1542 words she later withdrew.', p_improve: '', p_quote_ok: false })).error).toBeNull();
    expect(run('list').out).toContain(`[consent withdrawn]`);
    const refused = run('approve', a.row.id);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('consent withdrawn');
    expect((await reviewsFor(hike.id)).find((r) => r.id === a.row.id)?.status).toBe('pending');

    // Words rewritten after finishing.
    const b = await pendingFor('P1542 Rewrites', 'P1542 original words.');
    await (await asUser(b.u.email)).rpc('save_event_feedback', { p_event_id: hike.id, p_score: 8, p_liked: 'P1542 rewritten words.', p_improve: '', p_quote_ok: true });
    expect(run('list').out).toContain('[text changed]');
    expect(run('approve', b.row.id).out).toContain('text changed');
    expect((await reviewsFor(hike.id)).find((r) => r.id === b.row.id)?.status).toBe('pending');

    // Unchanged: approves. Then clean up through the afterAll (source_event_id rows).
    const c = await pendingFor('P1542 Unchanged', 'P1542 untouched words.');
    const ok = run('approve', c.row.id);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('pending -> approved');
    expect((await reviewsFor(hike.id)).find((r) => r.id === c.row.id)?.status).toBe('approved');
    // A hand-added review (no source close) still approves as before.
    const hand = await supabaseAdmin.from('series_reviews').insert({ series_slug: 'social-hike', quote: 'P1542 hand added.', author_name: 'P1542 Hand', status: 'pending', sort_order: 9002 }).select('id').single();
    seededReviewIds.push(hand.data!.id);
    expect(run('approve', hand.data!.id).code).toBe(0);
  });

  test('Clarity Night closes create no review rows', async () => {
    const u = await attendee('P1542 Night Guest', night);
    await supabaseAdmin.from('event_feedback').insert({ event_id: night.id, user_id: u.user.id, score: 9, liked: 'P1542 night quote.', quote_ok: true });
    expect((await (await asUser(u.email)).rpc('finish_event_close', { p_event_id: night.id })).error).toBeNull();
    expect(await reviewsFor(night.id)).toEqual([]);
  });

  test('AC3: someone who prepared sees the CMP re-check on a hike close', async ({ page }) => {
    const u = await attendee('P1542 Prepared', hike);
    const cmp = await cmp7Ids();
    test.skip(cmp.length === 0, 'no cmp7 points on the test DB');
    await supabaseAdmin.from('point_positions').insert({ point_id: cmp[0], user_id: u.user.id, position: 'agree' });
    await setTestSession(page, u.email);
    await page.goto(`/events/${hike.slug}/close`);
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Rate 9' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('step-topics')).toHaveCount(0);
    await expect(page.getByTestId('step-positions')).toBeVisible();
    // UAT 2026-10-23 #5: the value-perception statements and the stance are ONE step on a hike.
    const { data: cmp3 } = await supabaseAdmin.from('points').select('id').contains('tags', ['cmp3']);
    if ((cmp3 ?? []).length > 0) {
      await expect(page.getByTestId('step-positions').getByTestId('positions-stance')).toBeVisible();
      await expect(page.getByTestId('step-positions')).toContainText('Did your value perception of CMP change?');
      await expect(page.getByTestId('step-positions')).toContainText('Where do you stand on CMP in your important conversations?');
    }
    await page.getByRole('button', { name: /^(Continue|Save changes)$/ }).click();
    await expect(page.getByTestId('step-stance')).toHaveCount(0);
    await expect(page.getByTestId('step-question')).toHaveText('How can we improve our next event?');
  });

  test('AC6: a pending review is on no hike page; once approved it shows with the author, on every hike', async ({ page }) => {
    const u = await attendee('P1542 Reviewer', hike);
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: u.user.id, score: 9, liked: 'P1542 pending until approved.', quote_ok: true });
    expect((await (await asUser(u.email)).rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    const [row] = (await reviewsFor(hike.id)).filter((r) => r.author_profile_id === u.user.id);
    expect(row?.status).toBe('pending');

    // Signed out and signed in alike: the table itself refuses to show it (RLS), the page never lists it.
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const seen = async (c: typeof anon) => ((await c.from('series_reviews').select('id').eq('id', row!.id)).data ?? []).length;
    expect(await seen(anon)).toBe(0);
    expect(await seen(await asUser(u.email))).toBe(0);
    await page.goto(`/events/${futureHike.slug}`);
    await expect(page.getByTestId('hike-reviews')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('hike-reviews')).toContainText('P1542 approved example quote.');
    await expect(page.getByTestId('hike-reviews')).not.toContainText('P1542 pending until approved.');

    // Founder approval: the script, against the test database.
    const { execFileSync } = await import('node:child_process');
    const run = (...a: string[]) => execFileSync('node', ['scripts/series-reviews.mjs', ...a, '--env', 'test'], { encoding: 'utf8' });
    expect(run('list')).toContain(row!.id);
    expect(run('approve', row!.id)).toContain('pending -> approved');
    expect(await seen(anon)).toBe(1);

    for (const ev of [futureHike, hike]) {
      await page.goto(`/events/${ev.slug}`);
      const reviews = page.getByTestId('hike-reviews');
      await expect(reviews).toContainText('P1542 pending until approved.', { timeout: 20_000 });
      // Avatar and a link to the author's profile.
      const mine = reviews.getByTestId('hike-review').filter({ hasText: 'P1542 pending until approved.' });
      await expect(mine.locator(`a[href="/p/${u.slug}"]`).first()).toBeVisible();
    }

    // Reject keeps the row (so the same close cannot make a second) and hides it again.
    expect(run('reject', row!.id)).toContain('approved -> rejected');
    expect(await seen(anon)).toBe(0);
    expect(run('list', '--status', 'rejected')).toContain(row!.id);
  });

  test('AC8: on a 375px phone, from a hike\'s room: the optional preparation, and after the hike the close', async ({ page }) => {
    const u = await attendee('P1542 Phone', futureHike);
    await rsvpToEvent(oldHike.id, u.user.id);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);

    // Round 6 (G): entered from the event page's room tab, the room's one header is "← Back to the event" (no
    // Transcribe bar on a hike), and Back lands on the event page — also from inside the learning.
    await page.goto(`/events/${futureHike.slug}`);
    await page.locator(`a[href="/events/${futureHike.slug}/room"]`).first().click({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet`), { timeout: 20_000 });
    const backToEvent = page.getByRole('button', { name: 'Back to the event' });
    await expect(backToEvent).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Transcribe$/ })).toHaveCount(0);
    await expect(page.getByText('Not transcribing')).toHaveCount(0);
    await page.getByTestId('room-step-learn').click();
    // Founder 2026-10-26 (item 4): the learning opens inside the room, under the same mounted bar.
    await expect(page.getByTestId('room-learn')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('room-steps')).toBeVisible();
    await expect(backToEvent).toBeVisible();
    await backToEvent.click();
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}$`), { timeout: 20_000 });

    // Before the hike: the room offers the preparation, never stops anyone at a gate.
    await page.goto(`/events/${futureHike.slug}/room`);
    await expect(page.getByTestId('prep-room-gate')).toHaveCount(0);
    // UAT 2026-10-23 #3: for a hike it is learning what this community is — one quiet link, no "Preparation not started".
    // Founder 2026-10-23 (1): the learning is the bar's first step, "Learn"; the separate link is gone.
    await expect(page.getByTestId('room-step-learn')).toHaveText(/^Learn/, { timeout: 20_000 });
    // Founder 2026-10-26: "Learn the principle", no "(optional)"; the bar still fits (checked below).
    await expect(page.getByTestId('room-step-learn')).toHaveText('Learn the principle');
    await expect(page.getByTestId('prep-room-banner')).toHaveCount(0);
    await expect(page.getByTestId('prep-status')).toHaveCount(0);
    await expect(page.getByText('Preparation not started')).toHaveCount(0);
    await expect(page.getByText('Start your preparation')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Founder 2026-10-26 (item 4): Learn opens INSIDE the mounted room page — same URL, the step bar never remounts.
    await page.getByTestId('room-steps').evaluate((el) => { (el as HTMLElement).dataset.mounted = 'kept'; });
    await page.getByTestId('room-step-learn').click();
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet`));
    await expect(page.getByTestId('room-learn').getByTestId('p1336-prep')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-mounted', 'kept');
    await expect(page.getByTestId('agenda')).toContainText('Share your view on the expected benefits'); // cmp7
    // Round 5 (2): the learning stays in the room — its step bar with Learn shown, and the app menu.
    await expect(page.getByTestId('room-steps')).toBeVisible();
    await expect(page.getByTestId('room-step-learn')).toHaveAttribute('data-state', 'current');
    await expect(page.getByTestId('room-step-principle')).toHaveText(/Decide/);
    await expect(page.locator('[data-nav="bottom"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Tapping Decide in that bar goes back to the room's Decide step, still the same mounted bar.
    await page.getByTestId('room-step-principle').click();
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet`), { timeout: 20_000 });
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('data-state', 'current');
    // Round 8b: once opened, the learning stays mounted but hidden (one save queue across tab switches).
    await expect(page.getByTestId('room-learn')).toBeHidden();
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-mounted', 'kept');
    // Round 8b (Gemini MED 5): the phone's Back from inside the learning returns to the room's step, not out of the room.
    await page.getByTestId('room-step-learn').click();
    await expect(page).toHaveURL(/\/meet\?view=learn/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet$`));
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('data-state', 'current');
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-mounted', 'kept');
    // Founder 2026-10-26 (item 1): before the hike, Give feedback opens too and reaches the close.
    await page.getByTestId('room-step-close').click();
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-mounted', 'kept');
    await page.getByTestId('room-close-feedback').click();
    // Founder UAT round: the feedback opens inside the room (?view=feedback), not on /close.
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet\\?view=feedback$`), { timeout: 20_000 });
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 });

    // After the hike: the room's card in hike words, into the close.
    await page.goto(`/events/${oldHike.slug}/meet`);
    // UAT 2026-10-23 #4: ONE entry with ONE time estimate; one click reaches the first question.
    // Founder 2026-10-23 (4): just the button, "Takes 2 minutes" small under it; no "We need your feedback".
    // Round 6 (B): the button says what it does, not the step's name.
    await expect(page.getByTestId('room-close-feedback')).toHaveText('Start now', { timeout: 20_000 });
    await expect(page.getByTestId('room-close')).not.toContainText('Share feedback');
    await expect(page.getByTestId('room-close-time')).toHaveText('Takes 2 minutes');
    await expect(page.getByTestId('room-close-heading')).toHaveText('How was the hike?');
    await expect(page.getByTestId('room-close')).not.toContainText('We need your feedback');
    await expect(page.getByTestId('room-close')).not.toContainText('Two minutes');
    await expect(page.getByTestId('room-step-close')).toHaveText('Share feedback');
    await expect(page.getByTestId('room-step-close')).toBeEnabled();
    // After the hike, the learning link is not on the Feedback view.
    await expect(page.getByTestId('prep-room-banner')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId('room-close-feedback').click();
    await expect(page).toHaveURL(new RegExp(`/events/${oldHike.slug}/meet\\?view=feedback$`));
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 20_000 });
    // Inside the room: its step bar stays, and the close's step header sits in the room's sticky head.
    await expect(page.getByTestId('room-steps')).toBeVisible();
    await expect(page.getByTestId('room-sticky-head').getByTestId('step-header')).toBeVisible();
    await expect(page.getByTestId('step-intro')).toHaveCount(0);
    // The estimate is said once, in the room (whose card stays mounted, hidden, under the in-room feedback).
    await expect(page.getByText(/takes 2 minutes/i).filter({ visible: true })).toHaveCount(0);
    // Founder UAT (2026-10-29): the first question has no inner Back in the room (the room's "Back to the event" is it);
    // the phone's Back returns to the room.
    await expect(page.getByTestId('header-back')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/events/${oldHike.slug}/meet$`), { timeout: 20_000 });
    await expect(page.getByTestId('room-close-feedback')).toBeVisible();
  });

  test('hike room at 375px: straight to the room, no Ready/Table/Compare, hike principle question; Feedback opens at the start', async ({ page }) => {
    const u = await attendee('P1542 Room Shape', futureHike);
    await rsvpToEvent(startedHike.id, u.user.id);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);

    // Not started: /room goes to the room itself (never /ready). Founder 2026-10-26: a hike's Give feedback is open
    // before, during and after the hike — never greyed out.
    await page.goto(`/events/${futureHike.slug}/room`);
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet`), { timeout: 20_000 });
    await expect(page.getByTestId('room-steps')).toBeVisible();
    for (const hidden of ['ready', 'table', 'compare']) await expect(page.getByTestId(`room-step-${hidden}`)).toHaveCount(0);
    await expect(page.getByTestId('room-step-principle')).toBeVisible();
    await expect(page.getByTestId('room-step-close')).toBeEnabled();
    // Founder 2026-10-26: the bar is verbs, learning first.
    await expect(page.getByTestId('room-steps').getByRole('button')).toHaveText(['Learn the principle', 'Decide', 'Share feedback']);
    await expect(page.getByTestId('room-steps')).not.toContainText('Close');
    // (2) before the start the room opens on Opt in.
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('aria-current', 'step');
    // (1) the three labels fit at 320px, each fully visible.
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(320);
    for (const id of ['learn', 'principle', 'close']) {
      const fits = await page.getByTestId(`room-step-${id}`).evaluate((b) => {
        const label = b.querySelector('span')!;
        return label.scrollWidth <= b.clientWidth && getComputedStyle(label).position !== 'absolute';
      });
      expect(fits, `room-step-${id} label fits at 320px`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize(PHONE);
    await expect(page.getByTestId('room-principle-question')).toHaveText('Do you want to try this principle with the people on this hike?');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // A direct visit to /ready is sent on to the room.
    await page.goto(`/events/${futureHike.slug}/ready`);
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet`), { timeout: 20_000 });

    // Started 30 minutes ago (2-hour hike, so >30 min before its end), host never ended anything: the room still
    // opens on Opt in (2); Feedback is open and one tap away.
    await page.goto(`/events/${startedHike.slug}/meet`);
    await expect(page.getByTestId('room-step-close')).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId('room-principle-question')).toBeVisible();
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('aria-current', 'step');
    await page.getByTestId('room-step-close').click();
    await expect(page.getByTestId('room-close-feedback')).toBeVisible();
    await page.getByTestId('room-close-feedback').click();
    await expect(page).toHaveURL(new RegExp(`/events/${startedHike.slug}/meet\\?view=feedback$`));

    // UAT 2026-10-23 #2 (founder saw Feedback disabled on an ended hike): ended an hour ago, inside the room's
    // grace, host never ended anything — Feedback is enabled and opens with one tap.
    await rsvpToEvent(hike.id, u.user.id);
    await page.goto(`/events/${hike.slug}/room`);
    await expect(page.getByTestId('room-step-close')).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-current', 'close');
    // (2) a 1-hour hike that started an hour ago: past (end − 30 min), so the room opens on Give feedback, no tap.
    await expect(page.getByTestId('room-step-close')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('room-close-feedback')).toBeVisible();
    // People can always switch back to Opt in.
    await page.getByTestId('room-step-principle').click();
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('room-close')).toHaveCount(0);
  });

  test('round 6 (A): the hike registration thank-you is one calm stack — quiet links, then the one blue "Learn more"; smart once learned or opened', async ({ page }) => {
    const u = await attendee('P1542 Confirm', futureHike);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${futureHike.slug}/confirm`);
    await expect(page.getByTestId('p1336-confirm')).toBeVisible({ timeout: 20_000 });
    const card = page.getByTestId('registered-card');
    await expect(card).toContainText("You're registered");
    await expect(card).not.toContainText('!');
    await expect(card.getByTestId('registered-when')).toContainText(' · ');
    // The quiet links: the group chat (with its purpose line), Add to calendar, Share.
    const chat = card.getByTestId('group-chat-link');
    await expect(chat).toHaveAttribute('href', GROUP_CHAT, { timeout: 20_000 });
    // Round 6c (F): the flow's one group-chat component — "WhatsApp group" with its caption directly under it.
    await expect(chat).toHaveText('WhatsApp group');
    await expectQuietLink(chat);
    await expect(card.getByTestId('group-chat-line')).toHaveText('Last-minute changes, questions, lifts.');
    await expect(card.getByTestId('add-to-calendar-link')).toHaveText('Add to calendar');
    await expect(card.getByTestId('registered-share')).toHaveText('Share');
    // Round 6b: the caption sits directly under its link; calendar and share share the next row; every link >= 40px.
    const [chatB, lineB, calB, shareB] = await Promise.all([chat, card.getByTestId('group-chat-line'), card.getByTestId('add-to-calendar-link'), card.getByTestId('registered-share')].map(async (l) => (await l.boundingBox())!));
    expect(lineB.y).toBeGreaterThanOrEqual(chatB.y + chatB.height - 1);
    expect(calB.y).toBeGreaterThan(lineB.y);
    expect(Math.abs(calB.y - shareB.y)).toBeLessThanOrEqual(1);
    for (const b of [chatB, calB, shareB]) expect(b.height).toBeGreaterThanOrEqual(40);
    // The learning invitation: named heading, computed pill, one reason, ONE outline button.
    const learnCard = page.getByTestId('learn-card');
    await expect(learnCard.getByTestId('learn-card-title')).toHaveText(`Learn about ${COMMUNITY}`, { timeout: 20_000 });
    await expect(learnCard.getByTestId('learn-card-title')).toHaveClass(/text-2xl/);
    await expect(learnCard.getByTestId('learn-card-minutes')).toHaveText(/^\d+ min$/);
    // Round 6c (J): title → subtitle → pill → button; the subtitle is the founder-decision default (one constant).
    await expect(learnCard.getByTestId('learn-card-reason')).toHaveText('How we talk across differences in opinions, interests and values.');
    const [subB, pillB] = [(await learnCard.getByTestId('learn-card-reason').boundingBox())!, (await learnCard.getByTestId('learn-card-minutes').boundingBox())!];
    expect(subB.y).toBeLessThan(pillB.y);
    const learn = learnCard.getByTestId('learn-card-cta');
    await expect(learn).toHaveText('Learn more');
    await expect(page.getByText(/optional/i)).toHaveCount(0);
    // Round 6c (J): exactly one button-looking control on the page — the blue "Learn more" (the links are text links).
    const main = page.getByTestId('p1336-confirm');
    await expect(main.locator('.bg-blue-600')).toHaveCount(1);
    await expect(learn).toHaveClass(/bg-blue-600/);
    await expect(main.locator('button.border, a.border')).toHaveCount(0);
    // 48px between the success and the invitation.
    const [cardBox, learnBox] = [(await card.boundingBox())!, (await learnCard.boundingBox())!];
    expect(learnBox.y - (cardBox.y + cardBox.height)).toBeGreaterThanOrEqual(47);
    await expect(page.getByTestId('prep-block')).toHaveCount(0);
    await expect(page.locator('[data-nav="bottom"]')).toBeVisible();
    // VQA round 4 (founder: one active menu item on every hike page, commit 37e9c4acf): a hike a week away is never the
    // event of the day, so exactly the Events tab is lit.
    const activeTab = page.locator('[data-nav="bottom"] [aria-current="page"]');
    await expect(activeTab).toHaveCount(1);
    await expect(activeTab).toContainText('Events');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Round 6b (founder: "don't advertise WhatsApp if already clicked"): once tapped the link and its line are gone
    // here, at once and after a reload; the event page keeps only the quiet "Open WhatsApp group" link.
    await tapExternal(page, chat);
    // Round 10 / 10b (commit 3ac98fba7, founder: nothing on the confirm page moves): the tapped link's place is kept,
    // unseen (`registered-chat-pending`, `invisible`), so the copy inside it still exists — it must not be visible.
    await expect(card.getByTestId('group-chat-link')).toBeHidden();
    await expect(card.getByTestId('group-chat-line')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('registered-when')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('registered-card').getByTestId('group-chat-link')).toHaveCount(0);
    await page.goto(`/events/${futureHike.slug}`);
    await expect(page.getByTestId('group-chat-link')).toHaveText('Open WhatsApp group', { timeout: 20_000 });
    await expect(page.getByTestId('group-chat-block')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Join WhatsApp group' })).toHaveCount(0);

    // The learning itself still speaks of learning.
    await page.goto(`/events/${futureHike.slug}/confirm`);
    await page.getByTestId('learn-card-cta').click({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/prepare`));
    await expect(page.getByTestId('agenda')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('agenda')).toContainText('Share your view on the expected benefits');
    await expect(page.getByText(/prepar/i)).toHaveCount(0);

    // A learner (here: this event's learning complete) gets no invitation — the page ends at "You're registered".
    const at = new Date().toISOString();
    await supabaseAdmin.from('event_preparations').upsert(
      { event_id: futureHike.id, profile_id: u.user.id, started_at: at, completed_at: at },
      { onConflict: 'event_id,profile_id' },
    );
    await page.goto(`/events/${futureHike.slug}/confirm`);
    await expect(page.getByTestId('registered-when')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('learn-card')).toHaveCount(0);
  });

  test('round 6 (A): a member of the group sees no learning invitation on the registration thank-you', async ({ page }) => {
    const u = await attendee('P1542 Member', futureHike);
    const { data: cm } = await supabaseAdmin.from('organization').select('id').eq('slug', 'cm').single();
    const m = await supabaseAdmin.from('membership').insert({ org_id: cm!.id, user_id: u.user.id, role: 'member' });
    if (m.error) throw m.error;
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${futureHike.slug}/confirm`);
    await expect(page.getByTestId('registered-card').getByTestId('group-chat-link')).toBeVisible({ timeout: 20_000 });
    // Give the invitation's reads time to land, then prove it never appears.
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('learn-card')).toHaveCount(0);
  });

  test('B: the event room is inside the signed-in shell — left menu on desktop, bottom tabs on phone, Opt in bar above them', async ({ page, browser }) => {
    const u = await attendee('P1542 Shell', futureHike);
    await page.setViewportSize(DESKTOP);
    await setTestSession(page, u.email);
    await page.goto(`/events/${futureHike.slug}/meet`);
    await expect(page.getByTestId('room-steps')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(1280);
    await expect(page.locator('[data-nav="sidebar"]')).toBeVisible();
    await expect(page.getByTestId('room-sticky-head')).toBeVisible();
    // Founder UAT round (2026-10-29): on a desktop "Back to the event" sits on the step bar's row, in the pinned head.
    await expect(page.getByTestId('room-sticky-head').getByRole('button', { name: 'Back to the event' })).toBeVisible();
    // The step bar is not under the sidebar.
    const sidebar = (await page.locator('[data-nav="sidebar"]').boundingBox())!;
    expect((await page.getByTestId('room-steps').boundingBox())!.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);

    await page.setViewportSize(PHONE);
    await page.reload();
    await expect(page.getByTestId('room-steps')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(375);
    const tabs = page.locator('[data-nav="bottom"]');
    await expect(tabs).toBeVisible();
    const bar = page.locator('.room-decision-bar');
    await expect(bar).toBeVisible();
    const [barBox, tabsBox] = [(await bar.boundingBox())!, (await tabs.boundingBox())!];
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabsBox.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Signed out, the room gate keeps its own compact page: no shell.
    const anon = await browser.newPage();
    await anon.goto(`/events/${futureHike.slug}/room`);
    await anon.waitForLoadState('networkidle');
    await expect(anon.locator('[data-nav="sidebar"]')).toHaveCount(0);
    await expect(anon.locator('[data-nav="bottom"]')).toHaveCount(0);
    await anon.close();
  });

  test('VQA round 5: the end of a hike\'s learning is in the app menu, says time and place once, and leads with Back to the event', async ({ page }) => {
    const u = await attendee('P1542 Learned', futureHike);
    const at = new Date().toISOString();
    await supabaseAdmin.from('event_preparations').upsert(
      { event_id: futureHike.id, profile_id: u.user.id, started_at: at, completed_at: at },
      { onConflict: 'event_id,profile_id' },
    );
    for (const vp of [PHONE, DESKTOP]) {
      await page.setViewportSize(vp);
      await setTestSession(page, u.email);
      await page.goto(`/events/${futureHike.slug}/prepare`);
      const end = page.getByTestId('end-card');
      await expect(end).toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => window.innerWidth)).toBe(vp.width);
      // (2) the card carries the time and the meeting point; the separate line is gone.
      await expect(page.getByTestId('end-on-time')).toHaveCount(0);
      await expect(page.getByText(/^We meet at/)).toHaveCount(0);
      // (2) Back to the event is the one primary, in the page (no bar pinned over the tabs).
      const back = page.getByTestId('end-inline-actions').getByRole('button', { name: 'Back to the event' });
      await expect(back).toBeVisible();
      await expect(page.getByTestId('step-actions')).toHaveCount(0);
      expect((await back.boundingBox())!.x).toBeGreaterThan(0);
      // (3) the caption does not repeat "WhatsApp group:".
      await expect(page.getByText(/WhatsApp group:/)).toHaveCount(0);
      // (1c) the app menu: bottom tabs on a phone, the left menu on desktop.
      if (vp === PHONE) await expect(page.locator('[data-nav="bottom"]')).toBeVisible();
      else await expect(page.locator('[data-nav="sidebar"]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    // Round 6 (F, decision 44): opened from the room, the end of learning stays in the room's frame — Learn ticked,
    // what was learned, the next step, ONE button; no event box, calendar, group chat, share or "Back to the room".
    await page.goto(`/events/${futureHike.slug}/prepare?from=room`);
    const roomEnd = page.getByTestId('learn-room-end');
    await expect(roomEnd).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('learn-room-steps').getByTestId('room-step-learn-check')).toBeVisible();
    await expect(roomEnd.getByRole('heading')).toHaveText("You've learned the clarity principle");
    await expect(page.getByTestId('learn-room-end-next')).toHaveText('Next: decide whether to try the principle on this hike.');
    for (const gone of ['end-card', 'group-chat-link', 'end-inline-actions']) await expect(page.getByTestId(gone)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /add to calendar|Back to the room/i })).toHaveCount(0);
    await expect(roomEnd.getByRole('button')).toHaveCount(1);
    await roomEnd.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/(room|meet)`));
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('aria-current', 'step', { timeout: 20_000 });
    await expect(page.getByTestId('room-step-learn-check')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('room-step-learn')).toHaveAttribute('data-state', 'done');
  });

  test('round 5 (4+5) + round 6: a learner is invited on the thank-you, goes straight to the group terms (Accept and join / Back), and once joined sees no join', async ({ page }) => {
    const u = await attendee('P1542 Joiner', hike);
    const at = new Date().toISOString();
    await supabaseAdmin.from('event_preparations').upsert(
      { event_id: hike.id, profile_id: u.user.id, started_at: at, completed_at: at },
      { onConflict: 'event_id,profile_id' },
    );
    // The three feedback answers are in: the close resumes after them.
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: u.user.id, score: 8, improve: 'P1542 joiner improve.', liked: 'P1542 joiner liked.', quote_ok: false });
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${hike.slug}/close`);
    await expect(page.getByTestId('ask-connect').or(page.getByTestId('step-end'))).toBeVisible({ timeout: 20_000 });
    // The join offer is no longer a close step: it is on the thank-you.
    await expect(page.getByTestId('ask-community')).toHaveCount(0);
    await passAsks(page);
    const join = page.getByTestId('end-join');
    await expect(page.getByText(/Learn about/)).toHaveCount(0);
    // Learned: the same label, and no line under it (round 6, E).
    await expect(join.getByTestId('end-join-learn-first')).toHaveCount(0);
    await join.getByRole('button', { name: `Join ${COMMUNITY}` }).click();
    const terms = page.getByTestId('community-terms');
    await expect(terms).toBeVisible();
    await expect(page).not.toHaveURL(/prepare/);
    await expect(terms.getByTestId('step-question')).toHaveText(`Join ${COMMUNITY}`);
    // Founder round 9: no "Group terms" eyebrow above "Join …".
    await expect(page.getByText('Group terms', { exact: true })).toHaveCount(0);
    const accept = page.getByRole('button', { name: 'Accept and join' });
    // Round 6c (I): one Back only — the shell top bar's, to the thank-you (decision 45); the pinned footer holds
    // "Accept and join" alone (no "Not now", no second "Back").
    await expect(accept).toBeVisible();
    await expect(page.getByTestId('terms-actions').getByRole('button')).toHaveCount(1);
    const back = page.locator('[data-shell-top-bar]').getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await back.click();
    // Back records no refusal: the thank-you still offers the join.
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('end-join')).toBeVisible();
    const { data: refusals } = await supabaseAdmin.from('personal_ask_answers').select('ask, answer').eq('event_id', hike.id).eq('user_id', u.user.id);
    expect((refusals ?? []).filter((r) => r.ask === 'community' && r.answer === 'no')).toHaveLength(0);
    // Joining: the thanks says so by the short name, and a member sees no join button.
    await page.getByTestId('end-join').getByRole('button', { name: `Join ${COMMUNITY}` }).click();
    await page.getByRole('button', { name: 'Accept and join' }).click();
    // Round 9 (6): a short welcome first — the community by name, ONE primary (its chat), a quiet way back.
    const welcome = page.getByTestId('step-welcome');
    await expect(welcome.getByTestId('step-question')).toHaveText("Welcome, you're in", { timeout: 20_000 });
    await expect(welcome.getByTestId('welcome-community')).toContainText(CM_FULL_NAME);
    await expect(welcome.getByRole('button', { name: 'Open the community chat' })).toHaveClass(/bg-blue-600/);
    await welcome.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('end-joined')).toHaveText(`You joined ${COMMUNITY}.`, { timeout: 20_000 });
    await expect(page.getByTestId('end-join')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('end-join')).toHaveCount(0);
  });

  /** Desktop sidebar rows that render filled (an active-looking row). Exactly one per page (VQA round 4, item 1). */
  async function litSidebarRows(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-nav="sidebar"] a')]
        .filter((a) => getComputedStyle(a).backgroundColor !== 'rgba(0, 0, 0, 0)')
        .map((a) => (a.textContent ?? '').trim()),
    );
  }
  async function expectOneActiveSidebarItem(page: Page) {
    await expect(page.locator('[data-nav="sidebar"]')).toBeVisible();
    await page.mouse.move(1270, 890); // off the menu: a hover fill is not "active"
    await expect(page.locator('[data-nav="sidebar"] [aria-current="page"]')).toHaveCount(1);
    await expect.poll(() => litSidebarRows(page)).toHaveLength(1);
  }

  test('VQA round 4: one active menu item on every hike page; the feedback steps sit in the app menu', async ({ page }) => {
    const u = await attendee('P1542 One Active', futureHike);
    await rsvpToEvent(hike.id, u.user.id);
    await page.setViewportSize(DESKTOP);
    await setTestSession(page, u.email);
    // (1) The room before the start, and the registration thank-you.
    await page.goto(`/events/${futureHike.slug}/room`);
    await expect(page.getByTestId('room-steps')).toBeVisible({ timeout: 20_000 });
    await expectOneActiveSidebarItem(page);
    await page.goto(`/events/${futureHike.slug}/confirm`);
    await expect(page.getByTestId('registered-card')).toBeVisible({ timeout: 20_000 });
    await expectOneActiveSidebarItem(page);

    // (2) The feedback steps: the left menu on desktop, the step header and bar beside it, not under it.
    await page.goto(`/events/${hike.slug}/close`);
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 20_000 });
    await expectOneActiveSidebarItem(page);
    const side = (await page.locator('[data-nav="sidebar"]').boundingBox())!;
    expect((await page.getByTestId('step-header').boundingBox())!.x).toBeGreaterThanOrEqual(side.x + side.width - 1);
    expect((await page.getByTestId('step-actions').boundingBox())!.x).toBeGreaterThanOrEqual(side.x + side.width - 1);
    // On a phone: the bottom tabs, with the step's pinned bar above them.
    await page.setViewportSize(PHONE);
    await page.reload();
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(375);
    const tabs = page.locator('[data-nav="bottom"]');
    await expect(tabs).toBeVisible();
    const bar = page.locator('[data-shell-bar]').filter({ has: page.getByTestId('step-actions') });
    const [barBox, tabsBox] = [(await bar.boundingBox())!, (await tabs.boundingBox())!];
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabsBox.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // (5) Optional writing: Submit is full strength on the empty recommendation, and an empty Submit just continues.
    await page.getByRole('button', { name: 'Rate 8' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Continue without feedback' }).click({ timeout: 15_000 });
    await expect(page.getByTestId('step-appreciate')).toBeVisible({ timeout: 15_000 });
    // (4) The step is called what it is.
    await expect(page.getByTestId('step-name')).toHaveText('Recommend');
    const submit = page.getByRole('button', { name: 'Submit' });
    await expect(submit).toBeEnabled();
    await expect(submit).not.toHaveClass(/(^|\s)opacity-50(\s|$)/); // the dimmed look, not the shared disabled: variant
    expect(await submit.evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
    await submit.click();
    await expect(page.getByTestId('step-appreciate')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('submit-hint')).toHaveCount(0);
    await passAsks(page);
    const { data: fb } = await supabaseAdmin.from('event_feedback').select('liked, quote_ok').eq('event_id', hike.id).eq('user_id', u.user.id).single();
    expect(fb?.liked ?? '').toBe('');
    // P1542 rounds 9–11: the box's default tick is kept even with no words (only the box can change it, and every
    // reader that publishes a quote also needs the words) — so no words, no review, below.
    expect(fb?.quote_ok).toBe(true);
    expect((await reviewsFor(hike.id)).filter((r) => r.author_profile_id === u.user.id)).toHaveLength(0);

    // (1) The feedback thank-you, on desktop: still one lit row. (6) Its card carries the success mark.
    await expect(page.getByTestId('step-end').getByTestId('end-success')).toBeVisible();
    await page.setViewportSize(DESKTOP);
    await page.reload();
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 20_000 });
    await expectOneActiveSidebarItem(page);
  });

  test('VQA round 4 (4): the step total is fixed from the first screen for a learner', async ({ page }) => {
    const u = await attendee('P1542 Steady Count', hike);
    const at = new Date().toISOString();
    await supabaseAdmin.from('event_preparations').upsert(
      { event_id: hike.id, profile_id: u.user.id, started_at: at, completed_at: at },
      { onConflict: 'event_id,profile_id' },
    );
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${hike.slug}/close`);
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 20_000 });
    const label = () => page.getByTestId('step-header').getByRole('progressbar').first().getAttribute('aria-label');
    const total = (await label())!.match(/of (\d+)/)![1];
    const seen: string[] = [(await label())!];
    await page.getByRole('button', { name: 'Rate 9' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Continue without feedback' }).click({ timeout: 15_000 });
    await expect(page.getByTestId('step-appreciate')).toBeVisible({ timeout: 15_000 });
    seen.push((await label())!);
    await page.getByRole('button', { name: 'Continue without sharing' }).click();
    // Round 5: the join offer moved to the thank-you, so the close's last step is the connect ask (if any).
    await expect(page.getByTestId('ask-connect').or(page.getByTestId('step-end'))).toBeVisible({ timeout: 15_000 });
    if (await page.getByTestId('ask-connect').isVisible()) seen.push((await label())!);
    await expect(page.getByTestId('ask-community')).toHaveCount(0);
    for (const l of seen) expect(l, seen.join(' | ')).toContain(`of ${total}`);
  });

  test('a Clarity Night room keeps its words', async ({ page }) => {
    const u = await attendee('P1542 Night Room', night);
    await supabaseAdmin.from('events').update({ datetime: new Date(Date.now() - 14 * HOURS).toISOString() }).eq('id', night.id);
    await setTestSession(page, u.email);
    await page.goto(`/events/${night.slug}/meet`);
    await expect(page.getByTestId('room-close')).toContainText('Thanks for coming', { timeout: 20_000 });
    await expect(page.getByTestId('room-close')).toContainText('The evening has ended. Two minutes to tell us how it went?');
    // Clarity Night keeps Ready, Table and Compare in its bar.
    for (const step of ['ready', 'table', 'compare']) await expect(page.getByTestId(`room-step-${step}`)).toBeVisible();
    // UAT 2026-10-23 #1: one shared label — every room calls the last step Feedback. No Learn step there.
    await expect(page.getByTestId('room-step-close')).toHaveText('Feedback');
    await expect(page.getByTestId('room-step-learn')).toHaveCount(0);

    // Founder 2026-10-23, one default-step rule for every event: a Clarity Night before (end − 30 min) still lands
    // where it does today (Principle on /meet), with Feedback closed until the host ends the evening.
    const soon = await createTestEvent(host.user.id, new Date(Date.now() + 2 * HOURS), { title: 'Clarity Night #97: P1542 soon', location: 'Test venue, Chiang Mai' });
    events.push(soon);
    await supabaseAdmin.from('events').update({ series_slug: 'clarity-night' }).eq('id', soon.id);
    await rsvpToEvent(soon.id, u.user.id);
    await page.goto(`/events/${soon.slug}/meet`);
    await expect(page.getByTestId('room-step-principle')).toHaveAttribute('aria-current', 'step', { timeout: 20_000 });
    await expect(page.getByTestId('room-step-close')).toBeDisabled();
  });
  test('round 6b (15): Give feedback → thank-you → Back to the event leaves no feedback screen behind (URL sequence)', async ({ page }) => {
    const u = await attendee('P1542 History', hike);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    const seq: string[] = [];
    const here = () => { const url = new URL(page.url()); seq.push(url.pathname + url.search); };
    // Item 7, when this attendee is offered a "Today's event" strip at all (control on /feed): inside the event it
    // points to, it steps aside. Recorded either way, so a silent skip is visible in the report.
    await page.goto('/feed');
    await page.waitForTimeout(3000);
    const strip = page.locator('[data-nav="bottom"] [data-testid="tonights-event-cta"]');
    const stripTo = (await strip.count()) > 0 ? await strip.first().getAttribute('href') : null;
    test.info().annotations.push({ type: 'todays-strip-on-feed', description: String(stripTo) });
    await page.goto(`/events/${hike.slug}`); here();
    await page.locator(`a[href="/events/${hike.slug}/room"]`).first().click({ timeout: 20_000 });
    await expect(page.getByTestId('room-close-feedback')).toHaveText('Start now', { timeout: 20_000 }); here();
    // Item 7: inside the event the strip points to, it steps aside.
    if (stripTo?.startsWith(`/events/${hike.slug}`)) await expect(page.locator('[data-nav="bottom"] [data-testid="tonights-event-cta"]')).toHaveCount(0);
    await page.getByTestId('room-close-feedback').click();
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 30_000 }); here();
    if (stripTo?.startsWith(`/events/${hike.slug}`)) await expect(page.locator('[data-nav="bottom"] [data-testid="tonights-event-cta"]')).toHaveCount(0);
    // Browser Back from the first question returns to the room; forward again, the in-app Back does too (a pop).
    await page.goBack(); await expect(page).toHaveURL(new RegExp(`/events/${hike.slug}/meet$`), { timeout: 20_000 }); here();
    await page.goForward(); await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 30_000 }); here();
    // Founder UAT (2026-10-29): no inner Back on the first question in the room; the phone's Back pops it again.
    await expect(page.getByTestId('header-back')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/events/${hike.slug}/meet$`), { timeout: 20_000 }); here();
    // Through to the thank-you.
    await page.getByTestId('room-close-feedback').click({ timeout: 20_000 });
    await expect(page.getByTestId('step-score')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Rate 7' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Continue without feedback' }).click({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continue without sharing' }).click({ timeout: 15_000 });
    await passAsks(page); here();
    await page.getByRole('button', { name: 'Back to the event' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${hike.slug}$`), { timeout: 20_000 }); here();
    // Browser Back now: never the thank-you, never a question.
    await page.goBack(); await page.waitForTimeout(1500); here();
    await expect(page).not.toHaveURL(/\/close|view=feedback/);
    await expect(page.getByTestId('step-end')).toHaveCount(0);
    await expect(page.getByTestId('step-score')).toHaveCount(0);
    console.log('[p1542 round 6b URL sequence]', JSON.stringify(seq));
    test.info().annotations.push({ type: 'url-sequence', description: seq.join(' -> ') });
  });

  test('round 6b (14): someone who finished /prepare counts as learned — the hike thank-you Join goes straight to the group terms', async ({ page }) => {
    const u = await attendee('P1542 Prepare Learner', hike);
    // The cognitive-understanding clip is recorded as watched (playing a video is not what is under test); the cmp7
    // statements are answered, so /prepare offers Continue — the moment the part must be recorded.
    await supabaseAdmin.from('person_prep_parts').upsert(
      { profile_id: u.user.id, part: 'cognitive_video', content_version: 1, completed_at: new Date().toISOString() },
      { onConflict: 'profile_id,part' },
    );
    const ids = await cmp7Ids();
    const { error } = await supabaseAdmin.from('point_positions').insert(ids.map((id) => ({ point_id: id, user_id: u.user.id, position: 'agree' })));
    if (error) throw error;
    const cmp7Row = async () => (await supabaseAdmin.from('person_prep_parts').select('completed_at').eq('profile_id', u.user.id).eq('part', 'cmp7').maybeSingle()).data;
    expect(await cmp7Row()).toBeNull();
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto('/prepare');
    await page.getByTestId('agenda-step-cmp7').getByRole('button').click({ timeout: 20_000 });
    // Continue counts only once the answers have loaded (before that a tap re-checks them): wait for "N of N".
    await expect(page.getByTestId('answered-count')).toHaveText(/^(\d+) of \1 answered$/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('What is your value perception of the Clarity Meeting Principle?')).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => !!(await cmp7Row())?.completed_at, { timeout: 15_000 }).toBe(true);
    // The hike's close, finished: the thank-you invites to join and the button opens the terms, not the learning.
    await supabaseAdmin.from('event_feedback').insert({ event_id: hike.id, user_id: u.user.id, score: 8, improve: null, liked: null, quote_ok: false });
    const c = await asUser(u.email);
    await c.rpc('finish_event_close', { p_event_id: hike.id });
    await page.goto(`/events/${hike.slug}/close`);
    const join = page.getByTestId('end-join');
    await expect(join).toBeVisible({ timeout: 45_000 });
    await expect(join.getByTestId('end-join-learn-first')).toHaveCount(0);
    await join.getByRole('button', { name: `Join ${COMMUNITY}` }).click();
    await expect(page.getByTestId('community-terms')).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/prepare/);
  });

  test('round 8d: opened from the event page, Learn toggled twice, "Back to the event" lands on the event page; one more Back leaves it', async ({ page }) => {
    const u = await attendee('P1542 Depth', futureHike);
    await page.setViewportSize(PHONE);
    await setTestSession(page, u.email);
    await page.goto(`/events/${futureHike.slug}`);
    await page.locator(`a[href="/events/${futureHike.slug}/room"]`).first().click({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet`), { timeout: 20_000 });
    await page.getByTestId('room-steps').evaluate((el) => { (el as HTMLElement).dataset.mounted = 'kept'; });
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('room-step-learn').click();
      await expect(page).toHaveURL(/\/meet\?view=learn/);
      await expect(page.getByTestId('room-learn')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('room-step-principle').click();
      await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}/meet$`));
    }
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-mounted', 'kept');
    await page.getByRole('button', { name: 'Back to the event' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${futureHike.slug}$`), { timeout: 20_000 });
    // It popped back to the event page's own entry: one more Back leaves the event (never lands in the room again).
    await page.goBack();
    await expect(page).not.toHaveURL(/\/meet/);
  });
});
