/**
 * P1698: the standalone /events list has a third tab, "My events", that lists every event the signed-in person
 * hosts or registered for, hidden ones included (marked Hidden, with the Host or Going mark). Upcoming and Past are
 * unchanged: hidden events stay out of them for everyone. Group pages never get the tab.
 *
 * Fixtures (all disposable, one random run id in every title so parallel runs never collide):
 *   host  hosts six events: a public one that started 2h ago (inside the grace window, so upcoming), a hidden one in
 *         3 days, a public one in 7 days (the host also registered for it: hosted + registered), a group event in
 *         14 days, a hidden one 2 days ago still marked `upcoming` (past by the grace rule), a completed public one
 *         20 days ago.
 *   guest registered for the host's hidden event in 3 days, and hosts nothing.
 *   nobody hosts and registered for nothing.
 * Public events in the same lists are the positive controls, so an empty or unloaded list can never pass an absence.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MY_TAB = /^My events/;

test.describe('P1698 — My events tab on /events', () => {
  const run = Math.random().toString(36).slice(2, 8);
  const title = (name: string) => `P1698 ${name} ${run}`;

  let host: TestUser;
  let guest: TestUser;
  let nobody: TestUser;
  let org: TestOrganization;

  let graceUpcoming: TestEvent; // public, started 2h ago, status upcoming: still upcoming
  let hiddenSoon: TestEvent; // hidden, +3d
  let publicLater: TestEvent; // public, +7d, host also registered
  let groupEvent: TestEvent; // public, +14d, in the group
  let hiddenPast: TestEvent; // hidden, -2d, status upcoming: past by the grace rule
  let pastOld: TestEvent; // public, -20d, completed
  const events: TestEvent[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    host = await createTestUser({ name: 'P1698 Host' });
    guest = await createTestUser({ name: 'P1698 Guest' });
    nobody = await createTestUser({ name: 'P1698 Nobody' });
    org = await createTestOrganization({ name: `P1698 Group ${run}`, visibility: 'public', hasEvents: true });
    await createTestMembership(org.id, host.user.id, { role: 'organizer' });

    const now = Date.now();
    graceUpcoming = await createTestEvent(host.user.id, new Date(now - 2 * HOUR), { title: title('Started Recently') });
    hiddenSoon = await createTestEvent(host.user.id, new Date(now + 3 * DAY), { title: title('Hidden Soon'), isHidden: true });
    publicLater = await createTestEvent(host.user.id, new Date(now + 7 * DAY), { title: title('Public Later') });
    groupEvent = await createTestEvent(host.user.id, new Date(now + 14 * DAY), { title: title('Group Gathering'), orgId: org.id });
    hiddenPast = await createTestEvent(host.user.id, new Date(now - 2 * DAY), { title: title('Hidden Past'), isHidden: true });
    pastOld = await createTestEvent(host.user.id, new Date(now - 20 * DAY), { title: title('Public Past'), status: 'completed' });
    events.push(graceUpcoming, hiddenSoon, publicLater, groupEvent, hiddenPast, pastOld);

    await rsvpToEvent(hiddenSoon.id, guest.user.id);
    await rsvpToEvent(publicLater.id, host.user.id);
  });

  test.afterAll(async () => {
    for (const event of events) await deleteTestEvent(event.id);
    if (org) await deleteTestOrganization(org.id);
    for (const user of [host, guest, nobody]) if (user) await deleteTestUser(user.user.id);
  });

  const card = (page: Page, eventTitle: string) => page.getByTestId('event-card').filter({ hasText: eventTitle });

  async function openList(page: Page, email?: string) {
    if (email) await setTestSession(page, email);
    await page.goto('/events/list');
  }

  test('smoke: the host sees all three tabs and no console errors on any of them', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));
    // "Failed to load resource" carries no URL; record which request it was, so a failure names its cause.
    const failedRequests: string[] = [];
    page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));
    // An HTTP error is a response, not a failed request: record its status and URL too.
    page.on('response', (res) => { if (res.status() >= 400) failedRequests.push(`${res.url()} (HTTP ${res.status()})`); });

    await openList(page, host.email);
    await expect(card(page, publicLater.title)).toBeVisible({ timeout: 20000 });
    await page.getByRole('tab', { name: /^Past/ }).click();
    await expect(card(page, pastOld.title)).toBeVisible({ timeout: 20000 });
    await page.getByRole('tab', { name: MY_TAB }).click({ timeout: 20000 });
    await expect(card(page, hiddenSoon.title)).toBeVisible();
    await page.getByRole('tab', { name: /^Upcoming/ }).click();
    await expect(card(page, publicLater.title)).toBeVisible();
    await page.waitForLoadState('networkidle');
    // The global lists on TEST carry other events whose banner URLs point at a host that no longer resolves (a
    // retired hosted-TEST project); that DNS failure is test data, not this page. Any other failed load (a 4xx/5xx
    // from a read this page makes) still counts.
    const pageErrors = errors.filter((e) => !/Failed to load resource: net::ERR_NAME_NOT_RESOLVED/.test(e));
    expect(pageErrors, `Console errors on /events/list: ${pageErrors.join(', ')}; failed requests: ${failedRequests.join(', ')}`).toEqual([]);
  });

  test('the host finds their own hidden event under My events, marked Hidden and Host', async ({ page }) => {
    await openList(page, host.email);
    const myTab = page.getByRole('tab', { name: MY_TAB });
    await expect(myTab).toHaveText('My events (6)', { timeout: 20000 });
    await myTab.click();
    await expect(myTab).toHaveAttribute('aria-selected', 'true');

    const hidden = card(page, hiddenSoon.title);
    await expect(hidden).toBeVisible();
    await expect(hidden.getByTestId('hidden-event-mark')).toBeVisible();
    await expect(hidden).toContainText("You're Hosting");
    await expect(hidden).not.toContainText("You're Going");
    // Going count comes from the same RSVP count read as the global lists: the guest plus the host.
    await expect(hidden).toContainText('2 going');
  });

  test('a registered guest finds someone else\'s hidden event under My events, marked Hidden and Going', async ({ page }) => {
    await openList(page, guest.email);
    const myTab = page.getByRole('tab', { name: MY_TAB });
    await expect(myTab).toHaveText('My events (1)', { timeout: 20000 });
    await myTab.click();

    const hidden = card(page, hiddenSoon.title);
    await expect(hidden).toBeVisible();
    await expect(hidden.getByTestId('hidden-event-mark')).toBeVisible();
    await expect(hidden).toContainText("You're Going");
    await expect(hidden).not.toContainText("You're Hosting");
    await expect(hidden).toContainText('2 going');
    await expect(page.getByTestId('event-card')).toHaveCount(1);
  });

  test('signed out: no My events tab, the page as today', async ({ page }) => {
    await openList(page);
    await expect(card(page, publicLater.title)).toBeVisible({ timeout: 20000 }); // control: the list loaded
    await expect(page.getByRole('tab', { name: /^Upcoming \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Past/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: MY_TAB })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(2);
  });

  test('signed in with no events: no My events tab', async ({ page }) => {
    await openList(page, nobody.email);
    await expect(card(page, publicLater.title)).toBeVisible({ timeout: 20000 }); // control: the list loaded
    await expect(page.getByRole('link', { name: /host event/i })).toBeVisible(); // control: signed in
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: MY_TAB })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(2);
  });

  test('Upcoming and Past never show a hidden event, the host included', async ({ page }) => {
    await openList(page, host.email);
    await expect(card(page, publicLater.title)).toBeVisible({ timeout: 20000 }); // control
    await expect(card(page, graceUpcoming.title)).toBeVisible(); // the grace rule: started 2h ago is still upcoming
    await expect(card(page, hiddenSoon.title)).toHaveCount(0);
    await expect(card(page, hiddenPast.title)).toHaveCount(0);

    await page.getByRole('tab', { name: /^Past/ }).click();
    await expect(card(page, pastOld.title)).toBeVisible({ timeout: 20000 }); // control
    await expect(card(page, hiddenPast.title)).toHaveCount(0);
    await expect(card(page, hiddenSoon.title)).toHaveCount(0);
  });

  test('My events: hosted and registered appears once; upcoming soonest first, then past most recent first under "Past"', async ({ page }) => {
    await openList(page, host.email);
    await page.getByRole('tab', { name: MY_TAB }).click({ timeout: 20000 });

    const both = card(page, publicLater.title);
    await expect(both).toHaveCount(1);
    await expect(both).toContainText("You're Hosting");
    await expect(both).not.toContainText("You're Going");

    const titles = page.getByTestId('event-card').locator('h3');
    await expect(titles).toHaveText([
      graceUpcoming.title,
      hiddenSoon.title,
      publicLater.title,
      groupEvent.title,
      hiddenPast.title,
      pastOld.title,
    ]);
    // The past half sits under the "Past" divider, split by the same grace rule as the Past tab.
    const past = page.getByTestId('my-events-past');
    await expect(past).toContainText('Past');
    await expect(past.getByTestId('event-card').locator('h3')).toHaveText([hiddenPast.title, pastOld.title]);
    await expect(card(page, hiddenPast.title).getByTestId('hidden-event-mark')).toBeVisible();
  });

  test('from My events, a hidden event\'s card opens its event page', async ({ page }) => {
    await openList(page, host.email);
    await page.getByRole('tab', { name: MY_TAB }).click({ timeout: 20000 });
    await card(page, hiddenSoon.title).click();
    await expect(page).toHaveURL(new RegExp(`/events/${hiddenSoon.slug}$`));
    await expect(page.getByRole('heading', { name: hiddenSoon.title })).toBeVisible({ timeout: 15000 });
  });

  test('a group page events tab never shows My events, even for a host who has events', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/groups/${org.slug}?tab=events`);
    await expect(card(page, groupEvent.title)).toBeVisible({ timeout: 20000 }); // control: the group list loaded
    const filters = page.getByRole('tablist', { name: 'Event filters' });
    await expect(filters.getByRole('tab', { name: /^Upcoming/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: MY_TAB })).toHaveCount(0);
    await expect(filters.getByRole('tab')).toHaveCount(2);
  });

  // Decision 9 and the Cost Budget: the personal read is 3 requests for a signed-in visit (hosted ∥ registered, then
  // one counts batch for these ≤100 events), and none for a signed-out one. Counted from the browser, not the code.
  test('requests: a signed-in visit adds exactly 3 personal reads; a signed-out visit adds none', async ({ page }) => {
    const personal: string[] = [];
    const isPersonal = (raw: string) => {
      const url = decodeURIComponent(raw);
      if (!url.includes('/rest/v1/')) return false;
      // Matched by their full-card select: the shell's "Today's event" read also asks for this host's hosted and
      // registered events, with a narrow column list and a date window, and is not part of this change.
      const hosted = url.includes('/rest/v1/events?select=*,host:') && url.includes(`host_id=eq.${host.user.id}`);
      const registered = url.includes('/rest/v1/event_rsvps?select=event:events!inner(*,host:');
      // The counts read for My events is the only RSVP count read that names a hidden event (the global lists never do).
      const counts = url.includes('/rest/v1/event_rsvps?') && url.includes('select=event_id,profile_id') && url.includes(hiddenSoon.id);
      return hosted || registered || counts;
    };
    page.on('request', (req) => { if (isPersonal(req.url())) personal.push(decodeURIComponent(req.url())); });
    // Response sizes feed the spec's Cost Budget (egress per visit).
    const bytes: number[] = [];
    page.on('response', async (res) => {
      if (isPersonal(res.url())) bytes.push((await res.body().catch(() => Buffer.alloc(0))).length);
    });

    await openList(page);
    await expect(card(page, publicLater.title)).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');
    expect(personal, personal.join('\n')).toEqual([]);

    await openList(page, host.email);
    await expect(page.getByRole('tab', { name: MY_TAB })).toHaveText('My events (6)', { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    expect(personal, personal.join('\n')).toHaveLength(3);
    console.log(`[P1698 personal read bytes, 6 events] ${bytes.join(' + ')} = ${bytes.reduce((a, b) => a + b, 0)}`);
  });

  // A phone, not a desktop window resized to 320: desktop Chromium keeps a 15px classic scrollbar, which leaves a 305px
  // page (measured: clientWidth 305), not the 320px a phone's overlay scrollbar leaves.
  test.describe('at 320px on a phone', () => {
  test.use({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('at 320px the three pills fit on one row without horizontal overflow', async ({ page }) => {
    await openList(page, host.email);
    const filters = page.getByRole('tablist', { name: 'Event filters' });
    await expect(filters.getByRole('tab', { name: MY_TAB })).toBeVisible({ timeout: 20000 });
    // Measure the widest state: all three counts drawn (before the lists answer, Upcoming/Past carry no count).
    await expect(filters.getByRole('tab', { name: /^Upcoming \(\d+\)$/ })).toBeVisible({ timeout: 20000 });
    await expect(filters.getByRole('tab', { name: /^Past \(\d+\)$/ })).toBeVisible();
    expect(await page.evaluate(() => [window.innerWidth, document.documentElement.clientWidth])).toEqual([320, 320]);

    const tabs = await filters.getByRole('tab').all();
    expect(tabs).toHaveLength(3);
    const boxes = await Promise.all(tabs.map((t) => t.boundingBox()));
    const list = await filters.boundingBox();
    const labels = await Promise.all(tabs.map((t) => t.textContent()));
    console.log(`[P1698 pills@320] ${labels.map((l, i) => `${l}: ${boxes[i]?.width.toFixed(1)}px`).join(', ')}; row right edge ${(list!.x + list!.width).toFixed(1)}`);
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(box!.y).toBe(boxes[0]!.y); // one row
      expect(box!.height).toBe(boxes[0]!.height); // no pill wraps onto two lines
      expect(box!.x + box!.width).toBeLessThanOrEqual(list!.x + list!.width);
    }
    expect(list!.x + list!.width).toBeLessThanOrEqual(320 - 16); // inside the page gutter
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('at 320px, counts with more digits than TEST holds wrap the pills to a second row instead of overflowing', async ({ page }) => {
    await openList(page, host.email);
    const filters = page.getByRole('tablist', { name: 'Event filters' });
    await expect(filters.getByRole('tab', { name: MY_TAB })).toBeVisible({ timeout: 20000 });
    await expect(filters.getByRole('tab', { name: /^Upcoming \(\d+\)$/ })).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => [window.innerWidth, document.documentElement.clientWidth])).toEqual([320, 320]);
    // TEST cannot hold 1,000 past events per run, so the labels are lengthened in place: this checks the row's CSS
    // with the widest plausible text, which is all the wrap fallback is about.
    await filters.evaluate((row) => {
      const labels = ['Upcoming (1000)', 'Past (10000)', 'My events (100)'];
      row.querySelectorAll('[role="tab"]').forEach((tab, i) => { tab.textContent = labels[i] ?? tab.textContent; });
    });
    const list = await filters.boundingBox();
    const boxes = await Promise.all((await filters.getByRole('tab').all()).map((t) => t.boundingBox()));
    console.log(`[P1698 pills@320, long counts] ${boxes.map((b) => `${b?.x.toFixed(1)}+${b?.width.toFixed(1)}@y${b?.y.toFixed(0)}`).join(', ')}; row right edge ${(list!.x + list!.width).toFixed(1)}`);
    for (const box of boxes) expect(box!.x + box!.width).toBeLessThanOrEqual(320 - 16);
    expect(list!.x + list!.width).toBeLessThanOrEqual(320 - 16);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y); // it wrapped, rather than fitting by luck
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
  });
});
