/**
 * @file p1515-canvas-sharing.spec.ts
 * @description P1515 phase 2 — sharing a Clarity Canvas with events and groups, in the browser,
 * against the TEST DB. ONE visibility idea: a canvas is Private, its owner chooses who else sees it,
 * and everything inside follows. AC numbers are the spec's.
 *
 * Actors: O owner (hosts event E, belongs to groups Y and Yp) · A registered for E in time ·
 * L registered after the 12-hour window · N a signed-in stranger · G a member of Y only ·
 * V signed out. Every absence has a control (the same read, by someone who must see it).
 *
 *   AC1  Private by default: the owner reads it with "Private · only you"; everyone else gets not-found
 *   AC2  O shares with E in the panel: A reads everything with "Shared with you through E"; L, N, V do not
 *   AC3  A takes a position and adds a story; O sees both with A's name; nowhere else
 *   AC16 nothing A does on the canvas goes to the ordinary point, story or position loaders
 *   AC17 a story A linked straight to O's private point is not on the canvas
 *   AC15 the panel lists entries with counts, names for events and public groups, a count only for a private group; only O has it
 *   AC18 the event page lists the canvas to E's admitted people only
 *   AC14 access removed while A is on the canvas: the next refetch (focus, or opening the side panel) shows not-found,
 *        and Back after that does not serve the revoked canvas from the cache (control: before removal it does)
 *   AC6  O stops sharing with E in the panel: A loses it, G (through Y) keeps it
 *
 * Run: npx playwright test e2e/p1515-canvas-sharing.spec.ts --workers=1
 * Screenshots (owner / reader / stranger at 1280, 375, 320): set P1515_SHOTS_DIR to a folder.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const NAME = `p1515ui${RUN}`.toLowerCase();
const CANVAS_TAG = `canvas_${NAME}`;
const PUBLIC_TEXT = `P1515 first bet ${RUN}`; // a point on a canvas is private: the canvas's audience decides
const PRIVATE_TEXT = `P1515 PRIVATE bet ${RUN}`;
const OWNER_STORY = `P1515 owner story on the private point ${RUN}`;
const A_STORY = `P1515 A's added story ${RUN}`;
const A_DIRECT_STORY = `P1515 A's story linked straight to the private point ${RUN}`;
const NOT_FOUND = { name: 'Page not found' } as const;

let O: TestUser, A: TestUser, L: TestUser, N: TestUser, G: TestUser;
let E: TestEvent;
let Y: TestOrganization, Yp: TestOrganization;
let pubId: string, privId: string;
const orgs: TestOrganization[] = [];
let canvasId: string | null = null;

const url = () => `/p/${O.slug}/canvas/${NAME}`;

async function waitForCanvas(page: Page) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}
async function insertPoint(owner: string, statement: string, visibility: 'public' | 'private', box: string) {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement, first_validator_id: owner, visibility, tags: [`p1515ui${RUN}`], system_tags: [box, CANVAS_TAG],
  }).select('id').single();
  if (error) throw new Error(`[P1515 fixture] point: ${error.message}`);
  return data.id as string;
}
async function ensureCanvasRecord(): Promise<string> {
  if (canvasId) return canvasId;
  // The record may already exist: the owner's first share through the panel creates it.
  const existing = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME).maybeSingle();
  if (existing.data) { canvasId = existing.data.id as string; return canvasId; }
  const { data, error } = await supabaseAdmin.from('canvases').insert({ owner_id: O.user.id, name: NAME }).select('id').single();
  if (error) throw new Error(`[P1515 fixture] canvas: ${error.message}`);
  canvasId = data.id as string;
  return canvasId;
}
/** Phase 4: choosing "Anyone with the link" asks first; this picks it and answers the confirmation. */
async function chooseLink(page: Page, panel: ReturnType<Page['getByTestId']>) {
  await panel.getByTestId('canvas-share-general').selectOption('link');
  await page.getByRole('button', { name: 'Share with link' }).click();
}
async function grantClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
}
async function expectNoSidewaysScroll(page: Page, width: number) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${width}px: no sideways scroll`).toBeLessThanOrEqual(width);
}
/** Escape closes the invite list first (when it is open), then the panel: press until the panel is gone. */
async function closeSharePanel(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    if ((await page.getByTestId('canvas-share-panel').count()) === 0) return;
    await page.waitForTimeout(250);
  }
}
async function shareWith(kind: 'event' | 'group', id: string) {
  const canvas = await ensureCanvasRecord();
  const { error } = await supabaseAdmin.from('canvas_audience').insert({
    canvas_id: canvas, kind, event_id: kind === 'event' ? id : null, org_id: kind === 'group' ? id : null,
  });
  if (error) throw new Error(`[P1515 fixture] audience: ${error.message}`);
}
async function stopSharingWith(kind: 'event' | 'group', id: string) {
  const col = kind === 'event' ? 'event_id' : 'org_id';
  const { error } = await supabaseAdmin.from('canvas_audience').delete().eq(col, id);
  if (error) throw new Error(`[P1515 fixture] audience delete: ${error.message}`);
}
async function expectNotFound(page: Page, who: string) {
  await expect(page.getByRole('heading', NOT_FOUND), `${who}: not-found`).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(PUBLIC_TEXT), `${who}: not even the first point`).toHaveCount(0);
  await expect(page.getByText(PRIVATE_TEXT), `${who}: no private point`).toHaveCount(0);
  await expect(page.getByTestId('canvas-grid'), `${who}: no grid`).toHaveCount(0);
}

test.describe('P1515: sharing a canvas with events and groups', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    O = await createTestUser({ name: `P1515 Owner ${RUN}` });
    A = await createTestUser({ name: `P1515 Attendee ${RUN}` });
    L = await createTestUser({ name: `P1515 Late ${RUN}` });
    N = await createTestUser({ name: `P1515 Stranger ${RUN}` });
    G = await createTestUser({ name: `P1515 Member ${RUN}` });
    E = await createTestEvent(O.user.id, new Date(Date.now() - 3_600_000), { title: `P1515 Mastermind ${RUN}` });
    const early = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const late = new Date(Date.now() + 13 * 3_600_000).toISOString(); // after the 12-hour window
    for (const [u, at] of [[A, early], [L, late]] as const) {
      const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: E.id, profile_id: u.user.id, rsvped_at: at });
      if (r.error) throw new Error(`[P1515 fixture] rsvp: ${r.error.message}`);
    }
    Y = await createTestOrganization({ name: `P1515 Public group ${RUN}`, visibility: 'public' });
    Yp = await createTestOrganization({ name: `P1515 Private group ${RUN}`, visibility: 'private' });
    orgs.push(Y, Yp);
    for (const u of [O, G]) await createTestMembership(Y.id, u.user.id);
    for (const u of [O, N]) await createTestMembership(Yp.id, u.user.id);

    pubId = await insertPoint(O.user.id, PUBLIC_TEXT, 'private', 'canvas:problem');
    privId = await insertPoint(O.user.id, PRIVATE_TEXT, 'private', 'canvas:solution');
    // Three more in one other box, so the box shows "See all 4" and its list can be opened (AC16).
    for (let i = 1; i <= 3; i++) await insertPoint(O.user.id, `P1515 channel bet ${i} ${RUN}`, 'private', 'canvas:channels');
    const story = await supabaseAdmin.from('stories').insert({ content: OWNER_STORY, author_id: O.user.id, visibility: 'private' }).select('id').single();
    if (story.error) throw new Error(`[P1515 fixture] story: ${story.error.message}`);
    const link = await supabaseAdmin.from('story_points').insert({ story_id: story.data.id, point_id: privId, author_id: O.user.id });
    if (link.error) throw new Error(`[P1515 fixture] link: ${link.error.message}`);
    // AC17: A's own story linked straight to O's private point id (the ordinary write path allows it).
    const direct = await supabaseAdmin.from('stories').insert({ content: A_DIRECT_STORY, author_id: A.user.id, visibility: 'private' }).select('id').single();
    if (direct.error) throw new Error(`[P1515 fixture] direct story: ${direct.error.message}`);
    const directLink = await supabaseAdmin.from('story_points').insert({ story_id: direct.data.id, point_id: privId, author_id: A.user.id });
    if (directLink.error) throw new Error(`[P1515 fixture] direct link: ${directLink.error.message}`);
    const pos = await supabaseAdmin.from('point_positions').insert({ point_id: privId, user_id: O.user.id, position: 'agree' });
    if (pos.error) throw new Error(`[P1515 fixture] position: ${pos.error.message}`);
  });

  test.afterAll(async () => {
    test.setTimeout(300_000);
    const { data: pts } = await supabaseAdmin.from('points').select('id').contains('tags', [`p1515ui${RUN}`]);
    const ids = (pts ?? []).map(p => p.id as string);
    if (ids.length) {
      await supabaseAdmin.from('story_points').delete().in('point_id', ids);
      await supabaseAdmin.from('point_positions').delete().in('point_id', ids);
      await supabaseAdmin.from('points').delete().in('id', ids);
    }
    await supabaseAdmin.from('stories').delete().like('content', `%${RUN}`);
    if (E) await deleteTestEvent(E.id);
    for (const u of [O, A, L, N, G]) if (u) await deleteTestUser(u.user.id);
    for (const o of orgs) await deleteTestOrganization(o.id);
  });

  test('AC1: a new canvas is Private: the owner reads it ("Private · only you"); everyone else gets not-found', async ({ page, browser }) => {
    // Both points are private rows (the database refuses a public point with a canvas_ tag).
    const rows = await supabaseAdmin.from('points').select('visibility').in('id', [pubId, privId]);
    expect(rows.data!.map(r => r.visibility)).toEqual(['private', 'private']);

    await setTestSession(page, O.email);
    await page.goto(url());
    await waitForCanvas(page);
    // CONTROL: the owner sees both points, the lock control and no shared icon anywhere.
    await expect(page.getByTestId('canvas-share-label')).toHaveText('Private · only you');
    await expect(page.getByTestId('canvas-box-canvas:problem').getByText(PUBLIC_TEXT)).toBeVisible();
    await expect(page.getByTestId('canvas-box-canvas:solution').getByText(PRIVATE_TEXT)).toBeVisible();
    await expect(page.getByTestId('canvas-shared-icon')).toHaveCount(0);
    await expect(page.getByTestId('canvas-shared-with-you')).toHaveCount(0);

    for (const [who, user] of [['A (not yet shared with)', A], ['N (stranger)', N], ['L (late registrant)', L]] as const) {
      await setTestSession(page, user.email);
      await page.goto(url());
      await expectNotFound(page, who);
    }
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.goto(url());
    await expectNotFound(visitor, 'V (signed out)');
    await anon.close();
  });

  test('AC2: O shares with the event in the panel; A reads everything with "Shared with you through …"; L, N and V do not', async ({ page, browser }) => {
    await setTestSession(page, O.email);
    await page.goto(url());
    await waitForCanvas(page);
    await page.getByTestId('canvas-share-control').click();
    const panel = page.getByTestId('canvas-share-panel');
    await expect(panel.getByTestId('canvas-share-empty')).toHaveText('Only you can see it.');
    // The owner's own events and groups, nothing else (not the groups of others, not other events).
    // One invite field: nothing typed lists the owner's own events, then groups by name (no people until 3 letters).
    await expect(panel.getByLabel('Add people, events or groups')).toBeVisible();
    await panel.getByTestId('canvas-share-invite').click(); // focusing the field opens the list
    await expect(panel.getByTestId('canvas-share-option').first()).toBeVisible({ timeout: 20_000 });
    const options = await panel.getByTestId('canvas-share-option').allTextContents();
    expect(options).toEqual([`${E.title}Event`, `${Yp.name}Group`, `${Y.name}Group`]);
    await panel.getByTestId('canvas-share-option').filter({ hasText: E.title }).click(); // picking adds: no separate Add button
    await expect(panel.getByTestId('canvas-share-entry')).toHaveCount(1, { timeout: 20_000 }); // a share, then the panel re-reads
    await expect(panel.getByTestId('canvas-share-entry')).toContainText(E.title);
    await closeSharePanel(page);
    // One idea: still Private, now "shared with" the event; the icon marks the header's cards.
    await expect(page.getByTestId('canvas-share-label')).toHaveText(`Private · shared with ${E.title}`, { timeout: 20_000 }); // the page re-reads after the change
    await expect(page.getByTestId('canvas-shared-icon').first()).toBeVisible();
    await expect(page.getByTestId('canvas-shared-icon').first()).toHaveAttribute('aria-label', `Shared with ${E.title}`);

    // A reads it all, with the one line, and the same icon.
    await setTestSession(page, A.email);
    await page.goto(url());
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-shared-with-you')).toContainText(`Shared with you through ${E.title}`);
    await expect(page.getByTestId('canvas-box-canvas:problem').getByText(PUBLIC_TEXT)).toBeVisible();
    await expect(page.getByTestId('canvas-box-canvas:solution').getByText(PRIVATE_TEXT)).toBeVisible();
    await expect(page.getByTestId('canvas-shared-icon').first()).toHaveAttribute('aria-label', `Shared with you through ${E.title}`);
    // Only the owner has the control.
    await expect(page.getByTestId('canvas-share-control')).toHaveCount(0);

    // L registered too late, N is a stranger, V is signed out: not-found.
    for (const [who, user] of [['L', L], ['N', N]] as const) {
      await setTestSession(page, user.email);
      await page.goto(url());
      await expectNotFound(page, who);
    }
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.goto(url());
    await expectNotFound(visitor, 'V');
    await anon.close();
  });

  test('AC3 + AC16 + AC17: A takes a position and adds a story; O sees both with A\'s name; nothing A does uses the ordinary loaders', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const ordinary = /\/rest\/v1\/(points|stories|story_points|story_versions|point_positions|point_position_history)(\?|$)/;
    const ordinaryRequests: string[] = [];
    const ownerRequests: string[] = [];
    page.on('request', r => { if (ordinary.test(r.url())) ordinaryRequests.push(`${r.method()} ${r.url()}`); });

    await setTestSession(page, A.email);
    ordinaryRequests.length = 0; // the sign-in navigation is not the canvas
    await page.goto(`${url()}?point=${privId}`);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel.getByTestId(`feed-point-card-${privId}`)).toBeVisible();
    // The card renders from the canvas read: the owner's private story is there to read, no Details, no menu.
    await panel.getByTestId('feed-point-story-expander').click();
    await expect(panel.getByText(OWNER_STORY)).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Details/ })).toHaveCount(0);
    await expect(panel.getByTestId('nested-details-story')).toHaveCount(0);
    // AC17: A's own story, linked straight to the private point, is not on the canvas.
    await expect(page.getByText(A_DIRECT_STORY)).toHaveCount(0);

    // A position, through the checked function.
    await panel.getByRole('button', { name: /^disagree/i }).first().click();
    await expect.poll(async () => (await supabaseAdmin.from('point_positions').select('position').eq('point_id', privId).eq('user_id', A.user.id).maybeSingle()).data?.position ?? null, { timeout: 15_000 }).toMatch(/disagree/);

    // A story: the composer says who reads it, then it is saved as a NEW private story, recorded on the canvas.
    await panel.getByRole('button', { name: /add a story|why you/i }).first().click();
    const dialog = page.getByTestId('canvas-add-story-dialog');
    await expect(dialog.getByTestId('canvas-composer-audience')).toContainText(`Visible to you and everyone ${O.name} shared this canvas with`);
    await dialog.locator('textarea').fill(A_STORY);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    const block = panel.getByTestId('point-positions-block');
    const aRow = block.getByRole('button', { name: `${A.name}'s profile` });
    await expect(aRow).toBeVisible({ timeout: 15_000 });
    await aRow.getByTestId('story-toggle').click();
    await expect(panel.getByText(A_STORY)).toBeVisible();
    await expect(panel.getByTestId('canvas-story-meta')).toContainText('Added by you');
    await expect(panel.getByTestId('canvas-remove-added-story')).toBeVisible();
    await expect(panel.getByTestId('canvas-shared-icon').first()).toBeVisible();

    // AC16, widened: Previous / Next, a box's whole list and Compare read through the same one function.
    const nextStep = page.getByTestId('canvas-panel-next');
    const previousStep = page.getByTestId('canvas-panel-previous');
    if (await nextStep.count() > 0) {
      await nextStep.click();
      await expect(previousStep).toBeVisible();
      await previousStep.click();
    } else {
      await previousStep.click();
      await expect(nextStep).toBeVisible();
      await nextStep.click();
    }
    await expect(page.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${privId}`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    await page.getByTestId('canvas-box-canvas:channels').getByTestId('canvas-box-more').click();
    await expect(page.getByTestId('canvas-panel-box-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-panel-box-list')).toHaveCount(0);
    await page.getByLabel('Compare positions with').selectOption({ label: O.name });
    await expect(page.getByTestId('canvas-card-compare').first()).toBeVisible();

    // AC16: nothing of that went to the ordinary point, story or position loaders.
    expect(ordinaryRequests, 'no ordinary point/story/position request from the reader\'s canvas').toEqual([]);

    // The story is a new private story of A's, recorded against the point and linked nowhere else.
    const stored = await supabaseAdmin.from('stories').select('id,visibility').eq('author_id', A.user.id).eq('content', A_STORY).single();
    expect(stored.data!.visibility).toBe('private');
    const links = await supabaseAdmin.from('story_points').select('story_id').eq('story_id', stored.data!.id);
    expect(links.data).toEqual([]);
    const recorded = await supabaseAdmin.from('canvas_added_stories').select('point_id,author_id').eq('story_id', stored.data!.id).single();
    expect(recorded.data).toEqual({ point_id: privId, author_id: A.user.id });

    // The owner sees both, with A's name. CONTROL for the listener above: the owner's own point page (ordinary loaders) DOES read /rest/v1/points.
    const ownerPage = await browser.newPage();
    await ownerPage.setViewportSize({ width: 1440, height: 900 });
    ownerPage.on('request', r => { if (ordinary.test(r.url())) ownerRequests.push(r.url()); });
    await setTestSession(ownerPage, O.email);
    ownerRequests.length = 0;
    await ownerPage.goto(`${url()}?point=${privId}`);
    await waitForCanvas(ownerPage);
    const ownerPanel = ownerPage.getByTestId('canvas-point-panel');
    const ownerBlock = ownerPanel.getByTestId('point-positions-block');
    const aRowForOwner = ownerBlock.getByRole('button', { name: `${A.name}'s profile` });
    await expect(aRowForOwner).toContainText(/Disagrees/);
    await aRowForOwner.getByTestId('story-toggle').click();
    await expect(ownerPanel.getByText(A_STORY)).toBeVisible();
    await expect(ownerPanel.getByTestId('canvas-story-meta')).toContainText(`Added by ${A.name}`);
    await expect(ownerPanel.getByTestId('canvas-remove-added-story'), 'only the author can take it off').toHaveCount(0);
    // ...and the story shows nowhere else: not on O's point page, where the ordinary loaders run.
    ownerRequests.length = 0;
    await ownerPage.goto(`/point/${privId}`);
    await expect(ownerPage.getByText(PRIVATE_TEXT).first()).toBeVisible({ timeout: 30_000 });
    await expect(ownerPage.getByText(A_STORY)).toHaveCount(0);
    expect(ownerRequests.length, 'CONTROL: the same listener sees the owner\'s ordinary reads').toBeGreaterThan(0);
    await ownerPage.close();
  });

  test('A can take their own added story off the canvas; the story stays theirs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, A.email);
    await page.goto(`${url()}?point=${privId}`);
    await waitForCanvas(page);
    const panel = page.getByTestId('canvas-point-panel');
    await panel.getByTestId('point-positions-block').getByRole('button', { name: `${A.name}'s profile` }).getByTestId('story-toggle').click();
    await expect(panel.getByText(A_STORY)).toBeVisible();
    await panel.getByTestId('canvas-remove-added-story').click();
    await expect(panel.getByText(A_STORY)).toHaveCount(0, { timeout: 15_000 });
    const story = await supabaseAdmin.from('stories').select('author_id').eq('content', A_STORY).single();
    expect(story.data!.author_id).toBe(A.user.id);
    const recorded = await supabaseAdmin.from('canvas_added_stories').select('id').eq('author_id', A.user.id);
    expect(recorded.data).toEqual([]);
  });

  test('AC15: the panel lists each entry with its count, names for an event and a public group, a count only for a private group; only O has it', async ({ page }) => {
    await shareWith('group', Y.id);
    await shareWith('group', Yp.id);
    await setTestSession(page, O.email);
    await page.goto(url());
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-share-label')).toContainText(`${E.title}`);
    await page.getByTestId('canvas-share-control').click();
    const entries = page.getByTestId('canvas-share-panel').getByTestId('canvas-share-entry');
    await expect(entries).toHaveCount(3, { timeout: 20_000 });
    // Each row is the essentials only: the name (and the event's date); no counts, no member names, no explainer lines.
    await expect(entries.filter({ hasText: E.title })).toHaveCount(1);
    await expect(entries.filter({ hasText: Y.name })).toHaveCount(1);
    await expect(entries.filter({ hasText: Yp.name })).toHaveCount(1);
    await expect(page.getByTestId('canvas-share-entry-count')).toHaveCount(0);
    await expect(page.getByTestId('canvas-share-entry-names')).toHaveCount(0);
    await expect(page.getByTestId('canvas-share-entry-note')).toHaveCount(0);
    for (const who of [A, L, G]) await expect(page.getByTestId('canvas-share-panel')).not.toContainText(who.name); // nobody's name is listed here
    await expect(page.getByTestId('canvas-share-panel')).not.toContainText(N.name);
    await expect(page.getByTestId('canvas-share-panel').getByText(/\b\d+ (person|people)\b/)).toHaveCount(0);
    await closeSharePanel(page);

    // Only the owner has the control: G (through Y) and N (through Yp) read the canvas without it.
    for (const user of [G, N]) {
      await setTestSession(page, user.email);
      await page.goto(url());
      await waitForCanvas(page);
      await expect(page.getByTestId('canvas-shared-with-you')).toBeVisible();
      await expect(page.getByTestId('canvas-share-control')).toHaveCount(0);
    }
  });

  test('AC18: the event page lists the canvas to the event\'s admitted people (and its host) and to no one else', async ({ page, browser }) => {
    for (const [who, user] of [['A (registered in time)', A], ['O (the host)', O]] as const) {
      await setTestSession(page, user.email);
      await page.goto(`/events/${E.slug}`);
      const section = page.getByTestId('event-shared-canvases');
      await expect(section, who).toBeVisible({ timeout: 30_000 });
      await expect(section.getByTestId('event-shared-canvas-link')).toHaveText(`${O.name} · ${NAME}`);
    }
    // The link opens the canvas.
    await page.getByTestId('event-shared-canvas-link').click();
    await expect(page).toHaveURL(new RegExp(`/p/${O.slug}/canvas/${NAME}$`));
    await waitForCanvas(page);

    // L is registered but too late; N never registered; V is signed out: no section, no hint.
    for (const [who, user] of [['L (late)', L], ['N', N]] as const) {
      await setTestSession(page, user.email);
      await page.goto(`/events/${E.slug}`);
      await expect(page.getByRole('heading', { level: 1 }).first(), `${who}: the event page itself loads`).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('event-shared-canvases'), who).toHaveCount(0);
    }
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.goto(`/events/${E.slug}`);
    await expect(visitor.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await expect(visitor.getByTestId('event-shared-canvases')).toHaveCount(0);
    await anon.close();
  });

  const shots = process.env.P1515_SHOTS_DIR;
  test('screenshots: owner, reader and stranger at 1280, 375 and 320 (set P1515_SHOTS_DIR)', async ({ page }) => {
    test.skip(!shots, 'only when P1515_SHOTS_DIR is set');
    test.setTimeout(420_000); // about thirty page loads, each behind a fresh sign-in
    mkdirSync(shots!, { recursive: true });
    for (const [width, height] of [[1280, 900], [375, 800], [320, 700]] as const) {
      await page.setViewportSize({ width, height });
      for (const [label, user] of [['owner', O], ['reader', A], ['stranger', N]] as const) {
        // N is admitted through the private group in this state; the stranger shot uses L (too late).
        const viewer = label === 'stranger' ? L : user;
        await setTestSession(page, viewer.email);
        await page.goto(url());
        if (label === 'stranger') await expect(page.getByRole('heading', NOT_FOUND)).toBeVisible({ timeout: 30_000 });
        else await waitForCanvas(page);
        await page.screenshot({ path: `${shots}/${label}-${width}.png`, fullPage: false });
        if (label !== 'stranger') {
          await page.goto(`${url()}?point=${privId}`);
          await waitForCanvas(page);
          const sheet = page.getByTestId('canvas-point-panel');
          await expect(sheet).toBeVisible();
          // The open point fills the viewport (a full sheet on phones, a side panel on desktop), top to bottom.
          await expect.poll(async () => (await sheet.boundingBox())?.y, { message: `${label} ${width}: panel top` }).toBe(0);
          expect((await sheet.boundingBox())!.height).toBeCloseTo(height, 0);
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${shots}/${label}-${width}-panel.png`, fullPage: false });
        }
      }
      // The owner's share panel.
      await setTestSession(page, O.email);
      await page.goto(url());
      await waitForCanvas(page);
      await page.getByTestId('canvas-share-control').click();
      await expect(page.getByTestId('canvas-share-panel').getByTestId('canvas-share-entry').first()).toBeVisible();
      await page.screenshot({ path: `${shots}/owner-${width}-share-panel.png`, fullPage: false });
      await closeSharePanel(page);
    }
  });

  test('AC14: access removed while A is on the canvas — the next refetch (tab focus, or opening the side panel) shows the reduced view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, A.email);
    await page.goto(url());
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-box-canvas:solution').getByText(PRIVATE_TEXT)).toBeVisible();

    // (a) the tab leaves and regains focus (a focus with no leaving before it is the navigation's own and is ignored)
    await stopSharingWith('event', E.id);
    // A focus with no leaving before it changes nothing: what is on screen stays until the next real read.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('canvas-box-canvas:solution').getByText(PRIVATE_TEXT)).toBeVisible();
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await expectNotFound(page, 'A after focus');

    // (b) opening the side panel: share again, reload, remove, then open a box's list
    await shareWith('event', E.id);
    await page.goto(url());
    await waitForCanvas(page);
    await expect(page.getByTestId('canvas-box-canvas:solution').getByText(PRIVATE_TEXT)).toBeVisible();
    await stopSharingWith('event', E.id);
    await page.getByTestId(`canvas-point-card-${privId}`).click(); // opens the side panel: a fresh read
    await expectNotFound(page, 'A after opening the side panel');
    await expect(page.getByTestId('canvas-point-panel')).toHaveCount(0);
    await shareWith('event', E.id);

    // (c) the Back cache. Control first: while access holds, Back shows the canvas at once, before
    // the follow-up read (held back here) comes home. Then access ends, a refetch shows not-found, the
    // page is left and Back returns: it must not bring the revoked canvas back from the cache.
    let heldMs = 0;
    await page.route('**/rest/v1/rpc/get_canvas', async route => {
      if (heldMs > 0) await new Promise(resolve => setTimeout(resolve, heldMs));
      await route.continue();
    });
    await page.goto(url());
    await waitForCanvas(page);
    await expect(page.getByText(PRIVATE_TEXT)).toBeVisible();
    await page.getByTestId('canvas-owner-name').click(); // an in-app step away (the cache is in memory)
    await expect(page).toHaveURL(new RegExp(`/p/${O.slug}$`));
    heldMs = 6_000;
    await page.goBack();
    await expect(page.getByText(PRIVATE_TEXT), 'CONTROL: Back serves the cached canvas while access holds').toBeVisible({ timeout: 3_000 });
    heldMs = 0;
    await page.waitForTimeout(7_000); // the held follow-up read settles: still admitted, still shown
    await expect(page.getByText(PRIVATE_TEXT)).toBeVisible();

    await stopSharingWith('event', E.id);
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await expectNotFound(page, 'A after the refetch');
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/\/$/);
    heldMs = 6_000;
    await page.goBack();
    await expect(page).toHaveURL(url());
    await page.waitForTimeout(1_500); // the held read is still out: nothing cached may be on screen
    await expect(page.getByText(PRIVATE_TEXT), 'Back must not serve the revoked canvas').toHaveCount(0);
    await expect(page.getByText(PUBLIC_TEXT)).toHaveCount(0);
    await expect(page.getByRole('heading', NOT_FOUND)).toBeVisible({ timeout: 20_000 });
    heldMs = 0;
    await page.unroute('**/rest/v1/rpc/get_canvas');
    await shareWith('event', E.id);
  });

  test('AC6: O stops sharing with the event in the panel: A loses the canvas on the next request, G (through the group) keeps it', async ({ page, browser }) => {
    await setTestSession(page, O.email);
    await page.goto(url());
    await waitForCanvas(page);
    await page.getByTestId('canvas-share-control').click();
    const panel = page.getByTestId('canvas-share-panel');
    await panel.getByRole('button', { name: `Stop sharing with ${E.title}` }).click();
    await expect(panel.getByTestId('canvas-share-entry')).toHaveCount(2, { timeout: 20_000 });
    await expect(panel.getByTestId('canvas-share-entry').filter({ hasText: E.title })).toHaveCount(0, { timeout: 20_000 });
    // The event is addable again (a real choice back in the list).
    await panel.getByTestId('canvas-share-invite').click();
    await expect(panel.getByTestId('canvas-share-option').first()).toBeVisible({ timeout: 20_000 });
    const options = await panel.getByTestId('canvas-share-option').allTextContents();
    expect(options).toContain(`${E.title}Event`);
    await closeSharePanel(page);
    await expect(page.getByTestId('canvas-share-label')).not.toContainText(E.title, { timeout: 20_000 });

    // A's next request: nothing. G's: everything, through the group.
    const aPage = await browser.newPage();
    await setTestSession(aPage, A.email);
    await aPage.goto(url());
    await expectNotFound(aPage, 'A');
    await aPage.close();
    const gPage = await browser.newPage();
    await setTestSession(gPage, G.email);
    await gPage.goto(url());
    await waitForCanvas(gPage);
    await expect(gPage.getByTestId('canvas-shared-via')).toHaveText(Y.name);
    await expect(gPage.getByTestId('canvas-box-canvas:solution').getByText(PRIVATE_TEXT)).toBeVisible();
    await gPage.close();
  });
  test('PHASE 3: O adds one person from the invite field, then opens the canvas to anyone with the link; a signed-out visitor reads only; closing it returns not-found', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // A is a witness of O, so the existing profile search returns A to O (the invite field is scoped to that).
    const w = await supabaseAdmin.from('witnesses').insert({ profile_id: O.user.id, witness_name: `P1515 witness ${RUN}`, witness_profile_id: A.user.id });
    if (w.error) throw new Error(`[P1515 fixture] witness: ${w.error.message}`);
    await setTestSession(page, O.email);
    await page.goto(url());
    await waitForCanvas(page);
    await page.getByTestId('canvas-share-control').click();
    const panel = page.getByTestId('canvas-share-panel');
    await panel.getByLabel('Add people, events or groups').fill(A.name.slice(0, 12).toLowerCase());
    await panel.getByTestId('canvas-share-option').filter({ hasText: A.name }).click();
    // The person's row is the one that says so (a public group's row lists its members' names too).
    const personRow = panel.getByTestId('canvas-share-entry').filter({ hasText: `@${A.slug}` });
    await expect(personRow).toHaveCount(1, { timeout: 20_000 });
    await expect(personRow).toContainText(A.name);
    await expect(panel.getByTestId('canvas-share-owner')).toHaveText(/You \(owner\)/);
    // CONTROL: someone the search does not return (N, no relationship) is not offered.
    await panel.getByLabel('Add people, events or groups').fill(N.name.slice(0, 12).toLowerCase());
    await expect(panel.getByTestId('canvas-share-nothing-to-add')).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByTestId('canvas-share-option').filter({ hasText: N.name })).toHaveCount(0);
    await closeSharePanel(page);

    // The person's page: the reader line names the owner.
    const aPage = await browser.newPage();
    await setTestSession(aPage, A.email);
    await aPage.goto(url());
    await waitForCanvas(aPage);
    await expect(aPage.getByTestId('canvas-shared-with-you')).toContainText(`Shared with you by ${O.name}`);
    await aPage.close();

    // General access: Anyone with the link.
    await page.getByTestId('canvas-share-control').click();
    await chooseLink(page, panel);
    await expect(panel.getByTestId('canvas-share-general-note')).toContainText('Anyone with the link can read it', { timeout: 20_000 });
    await closeSharePanel(page);
    await expect(page.getByTestId('canvas-share-label')).toHaveText('Anyone with the link', { timeout: 20_000 });
    // The link is a token: read it the way the panel's Copy link does, from the owner's own canvas record.
    const { data: opened } = await supabaseAdmin.from('canvases').select('link_token').eq('owner_id', O.user.id).eq('name', NAME).single();
    const token = opened!.link_token as string;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    // Copy link carries the token.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByTestId('canvas-share-control').click();
    await panel.getByTestId('canvas-share-copy').click();
    await expect(panel.getByTestId('canvas-share-copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}${url()}#k=${token}`);
    await closeSharePanel(page);

    // A signed-out visitor reads with the token, with no way to write; the plain address (no token) is still not-found.
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.setViewportSize({ width: 1440, height: 900 });
    await visitor.goto(url());
    await expectNotFound(visitor, 'V without the token while the link is open');
    await visitor.goto(`${url()}?point=${privId}#k=${token}`);
    await waitForCanvas(visitor);
    // The token is taken off the address on arrival (history, analytics and screenshots must not hold it); the open point stays.
    // index.html's first script does it before any SDK loads, so the tab's storage holds it and the address has no fragment.
    await expect.poll(() => visitor.url(), { timeout: 15_000 }).not.toContain(token);
    expect(visitor.url()).toContain(`point=${privId}`);
    expect(visitor.url()).not.toContain('#');
    expect(await visitor.evaluate(key => sessionStorage.getItem(key), `canvas-link:${O.slug.toLowerCase()}/${NAME}`)).toBe(token);
    expect(await visitor.evaluate(() => (window as unknown as { __canvasLinkTokenLoad?: boolean }).__canvasLinkTokenLoad)).toBe(true);
    // ...and a reload still reads (the tab kept the token)
    await visitor.reload();
    await waitForCanvas(visitor);
    await expect(visitor.getByTestId('canvas-shared-link')).toContainText('Anyone with the link can see this canvas');
    await expect(visitor.getByTestId('canvas-point-panel').getByTestId(`feed-point-card-${privId}`)).toBeVisible();
    // (the "Filter by position" chips below the card are not write controls; the card's own buttons are)
    const visitorCard = visitor.getByTestId(`feed-point-card-${privId}`);
    await expect(visitorCard.getByRole('button', { name: /^disagree/i })).toHaveCount(0);
    await expect(visitor.getByRole('button', { name: /add a story/i })).toHaveCount(0);
    // A signed-in stranger reads AND can take a position (L registered too late for the event, and is in no group: N is in a shared group by now).
    const nPage = await browser.newPage();
    await setTestSession(nPage, L.email);
    await nPage.goto(`${url()}?point=${privId}#k=${token}`);
    await waitForCanvas(nPage);
    await expect(nPage.getByTestId(`feed-point-card-${privId}`).getByRole('button', { name: /^disagree/i }).first()).toBeVisible();

    // Back to "Only people added": both get not-found on their next request.
    await page.getByTestId('canvas-share-control').click();
    await panel.getByTestId('canvas-share-general').selectOption('restricted');
    await expect(panel.getByTestId('canvas-share-general-note')).toContainText('Only the people, events and groups above', { timeout: 20_000 });
    await closeSharePanel(page);
    await visitor.goto(`${url()}#k=${token}`);
    await expectNotFound(visitor, 'V after closing the link');
    await nPage.goto(`${url()}#k=${token}`);
    await expectNotFound(nPage, 'L after closing the link');
    await nPage.close();
    await anon.close();

    // Remove the person: A's next request is not-found (A has no other way in).
    await page.getByTestId('canvas-share-control').click();
    await panel.getByRole('button', { name: `Stop sharing with ${A.name}` }).click();
    await expect(panel.getByTestId('canvas-share-entry').filter({ hasText: `@${A.slug}` })).toHaveCount(0, { timeout: 20_000 });
    const a2 = await browser.newPage();
    await setTestSession(a2, A.email);
    await a2.goto(url());
    await expectNotFound(a2, 'A after the person entry was removed');
    await a2.close();
    await supabaseAdmin.from('witnesses').delete().eq('profile_id', O.user.id);
  });
  test('screenshots (phase 4): the Share button closed; the panel open with the list focused; the confirmation; the link open with Copied; plus a signed-out visitor holding the link and a stranger without it (set P1515_SHOTS_DIR)', async ({ page, browser }) => {
    test.skip(!shots, 'only when P1515_SHOTS_DIR is set');
    test.setTimeout(420_000);
    mkdirSync(shots!, { recursive: true });
    // Fixture: A and L are witnesses of O, so the invite field (the profile search) returns them to O.
    for (const u of [A, L]) {
      const w = await supabaseAdmin.from('witnesses').insert({ profile_id: O.user.id, witness_name: `P1515 witness ${RUN}`, witness_profile_id: u.user.id });
      if (w.error) throw new Error(`[P1515 fixture] witness: ${w.error.message}`);
    }
    const canvas = await ensureCanvasRecord();
    const resetAudience = async () => {
      await supabaseAdmin.from('canvases').update({ general_access: 'restricted', link_token: null }).eq('id', canvas);
      await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvas);
      const r = await supabaseAdmin.from('canvas_audience').insert([{ canvas_id: canvas, kind: 'person', profile_id: A.user.id }]);
      if (r.error) throw new Error(`[P1515 fixture] audience: ${r.error.message}`);
    };
    try {
      for (const [width, height] of [[1280, 900], [375, 800], [320, 700]] as const) {
        await resetAudience();
        await page.setViewportSize({ width, height });
        await grantClipboard(page);
        await setTestSession(page, O.email);
        await page.goto(url());
        await waitForCanvas(page);
        // (a) the panel closed: the Share button, top right
        await page.waitForTimeout(400);
        await expectNoSidewaysScroll(page, width);
        expect((await page.getByTestId('canvas-share-control').boundingBox())!.height, `${width}: Share is a 44px target`).toBeGreaterThanOrEqual(43);
        await page.screenshot({ path: `${shots}/owner-${width}-p4-button-closed.png`, fullPage: false });
        // (b) the panel open, the invite field focused: the owner's events and groups listed without typing
        await page.getByTestId('canvas-share-control').click();
        const panel = page.getByTestId('canvas-share-panel');
        await expect(panel.getByTestId('canvas-share-entry')).toHaveCount(1, { timeout: 20_000 });
        await panel.getByTestId('canvas-share-invite').click(); // a phone sheet does not steal focus on open: focusing is what opens the list
        await expect(panel.getByTestId('canvas-share-option').first()).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(500);
        await expectNoSidewaysScroll(page, width);
        await page.screenshot({ path: `${shots}/owner-${width}-p4-panel-list-focused.png`, fullPage: false });
        // (c) the confirmation
        await panel.getByTestId('canvas-share-general').scrollIntoViewIfNeeded();
        await panel.getByTestId('canvas-share-general').selectOption('link');
        await expect(page.getByRole('button', { name: 'Share with link' })).toBeVisible();
        await page.waitForTimeout(400);
        await expectNoSidewaysScroll(page, width);
        await page.screenshot({ path: `${shots}/owner-${width}-p4-confirmation.png`, fullPage: false });
        await page.getByRole('button', { name: 'Share with link' }).click();
        // (d) the link open, Copy link pressed: "Copied"
        await expect(panel.getByTestId('canvas-share-general-note')).toContainText('Anyone with the link can read it', { timeout: 20_000 });
        await expect(panel.getByTestId('canvas-share-copy')).toBeEnabled({ timeout: 20_000 });
        await panel.getByTestId('canvas-share-copy').scrollIntoViewIfNeeded();
        await panel.getByTestId('canvas-share-copy').click();
        await expect(panel.getByTestId('canvas-share-copied')).toBeVisible();
        await page.waitForTimeout(300);
        const copyBox = await panel.getByTestId('canvas-share-copy').boundingBox();
        const panelBox = await panel.boundingBox();
        expect(copyBox!.x + copyBox!.width, `${width}: Copy link is inside the panel`).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);
        expect(copyBox!.y + copyBox!.height, `${width}: Copy link is inside the panel`).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1);
        await expectNoSidewaysScroll(page, width);
        await page.screenshot({ path: `${shots}/owner-${width}-p4-link-open-copied.png`, fullPage: false });
        // On a phone with a home-indicator inset (emulated, 34px): the bottom-pinned sheet's last control clears the home bar.
        if (width < 640) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
          await page.waitForTimeout(400);
          await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
          await page.waitForTimeout(200);
          // The sheet's header stays in view while the body is scrolled to its end.
          const tb = (await panel.getByTestId('canvas-share-title').boundingBox())!;
          const xb = (await panel.getByRole('button', { name: 'Close' }).boundingBox())!;
          const sh = (await panel.boundingBox())!;
          expect(tb.y, `${width}: the title is not scrolled out`).toBeGreaterThanOrEqual(sh.y);
          expect(xb.y, `${width}: Close is not scrolled out`).toBeGreaterThanOrEqual(sh.y - 1);
          expect(xb.width, `${width}: Close is a 40px target`).toBeGreaterThanOrEqual(39);
          const padBottom = parseFloat(await panel.evaluate(el => getComputedStyle(el).paddingBottom));
          expect(padBottom, `${width}: the emulated inset reached the sheet (control)`).toBeGreaterThanOrEqual(34);
          const sb = (await panel.boundingBox())!;
          const cb = (await panel.getByTestId('canvas-share-copy').boundingBox())!;
          expect(sb.y + sb.height, `${width}: the sheet is pinned to the bottom edge`).toBeGreaterThanOrEqual(height - 1);
          expect(cb.y + cb.height, `${width}: Copy link clears the home bar`).toBeLessThanOrEqual(height - 34 + 1);
          expect(cb.y + cb.height, `${width}: Copy link clears the sheet's bottom edge`).toBeLessThanOrEqual(sb.y + sb.height - 34 + 1);
          await page.screenshot({ path: `${shots}/owner-${width}-p4-sheet-bottom-inset.png`, fullPage: false });
          await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 0 } });
        }
        await closeSharePanel(page);
        // wait for the panel's closing animation to end: a shot taken mid-fade shows the page ghosting through it
        await expect(page.getByTestId('canvas-share-panel')).toHaveCount(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(900);
        await expect(page.getByTestId('canvas-share-open-icon')).toBeVisible(); // the open state wears a globe, not the lock
        await page.screenshot({ path: `${shots}/owner-${width}-p4-button-globe.png`, fullPage: false });

        // (d) a signed-out visitor holding the link: reads, no position buttons
        const { data: opened } = await supabaseAdmin.from('canvases').select('link_token').eq('id', canvas).single();
        const token = opened!.link_token as string;
        const anon = await browser.newContext({ viewport: { width, height } });
        const visitor = await anon.newPage();
        await visitor.goto(`${url()}#k=${token}`);
        await waitForCanvas(visitor);
        await visitor.waitForTimeout(400);
        await visitor.screenshot({ path: `${shots}/visitor-${width}-p3-link.png`, fullPage: false });
        await visitor.goto(`${url()}?point=${privId}#k=${token}`);
        await waitForCanvas(visitor);
        await expect(visitor.getByTestId('canvas-point-panel')).toBeVisible();
        await visitor.waitForTimeout(500);
        await visitor.screenshot({ path: `${shots}/visitor-${width}-p3-link-panel.png`, fullPage: false });
        await anon.close();
        // (e) a stranger without the link (a fresh tab, signed out, the plain address): not-found while the link is open
        const strangerContext = await browser.newContext({ viewport: { width, height } });
        const stranger = await strangerContext.newPage();
        await stranger.goto(url());
        await expect(stranger.getByRole('heading', NOT_FOUND)).toBeVisible({ timeout: 30_000 });
        await stranger.waitForTimeout(1_500); // the 404's entrance animation settles
        await stranger.screenshot({ path: `${shots}/stranger-${width}-p3-no-link.png`, fullPage: false });
        await strangerContext.close();
      }
    } finally {
      await supabaseAdmin.from('canvases').update({ general_access: 'restricted', link_token: null }).eq('id', canvas);
      await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvas);
      await supabaseAdmin.from('witnesses').delete().eq('profile_id', O.user.id);
    }
  });
  test('PHASE 4: the Share button top right; the panel anchored under it (a bottom sheet at 375 and 320); focus lists events and groups; the link asks first; Copied', async ({ page }) => {
    test.setTimeout(240_000);
    const canvas = await ensureCanvasRecord();
    const reset = async () => {
      await supabaseAdmin.from('canvases').update({ general_access: 'restricted', link_token: null }).eq('id', canvas);
      await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvas);
    };
    const generalAccess = async () => (await supabaseAdmin.from('canvases').select('general_access').eq('id', canvas).single()).data!.general_access as string;
    try {
      await reset();
      await grantClipboard(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await setTestSession(page, O.email);
      await page.goto(url());
      await waitForCanvas(page);

      // AC1: the owner's Share button is top right, blue, with a lock (readers and strangers have none: AC2 and AC1 above).
      const button = page.getByTestId('canvas-share-control');
      await expect(button).toBeVisible();
      await expect(button).toHaveText(/^Share/);
      await expect(button).toHaveCSS('background-color', 'rgb(37, 99, 235)');
      await expect(page.getByTestId('canvas-share-lock-icon')).toBeVisible();
      const buttonBox = (await button.boundingBox())!;
      // Founder: Share is in the same header row as the byline (and Compare), not alone in the far corner.
      const bylineBox = (await page.getByTestId('canvas-byline').boundingBox())!;
      expect(Math.abs((buttonBox.y + buttonBox.height / 2) - (bylineBox.y + bylineBox.height / 2)), 'Share is in the byline row').toBeLessThan(40);
      expect(buttonBox.x, 'Share is right of the byline').toBeGreaterThan(bylineBox.x + 100);
      expect(buttonBox.y, 'Share is in the top part of the page').toBeLessThan(250);
      if (await page.getByTestId('canvas-compare-picker').count()) {
        const compareBox = (await page.getByTestId('canvas-compare-picker').boundingBox())!;
        expect(buttonBox.x, 'Share is right of Compare').toBeGreaterThanOrEqual(compareBox.x + compareBox.width - 1);
      }

      // AC6 (desktop): the panel is anchored under the button, a card (border, shadow), about 420px.
      await button.click();
      const panel = page.getByTestId('canvas-share-panel');
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('canvas-share-owner')).toBeVisible({ timeout: 20_000 });
      const box = (await panel.boundingBox())!;
      expect(box.y, 'the panel starts under the button').toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
      expect(Math.abs((box.x + box.width) - (buttonBox.x + buttonBox.width)), 'right edges align').toBeLessThanOrEqual(12);
      expect(box.width).toBeGreaterThan(380);
      expect(box.width).toBeLessThanOrEqual(421);
      await expect(panel).toHaveCSS('border-top-width', '1px');
      expect(await panel.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');

      // AC2: focusing the invite field lists the owner's events and groups without typing.
      await expect(panel.getByTestId('canvas-share-option')).toHaveCount(0); // not on open: the list opens when the field is focused
      await panel.getByTestId('canvas-share-invite').click();
      await expect(panel.getByTestId('canvas-share-invite')).toBeFocused();
      await expect(panel.getByTestId('canvas-share-option').first()).toBeVisible({ timeout: 20_000 });
      expect(await panel.getByTestId('canvas-share-option').allTextContents()).toEqual([`${E.title}Event`, `${Yp.name}Group`, `${Y.name}Group`]);
      // ...picking one adds it to People with access at once; You (owner) is first.
      await panel.getByTestId('canvas-share-option').filter({ hasText: E.title }).click();
      await expect(panel.getByTestId('canvas-share-entry')).toHaveCount(1, { timeout: 20_000 });
      // AC3: You first, then the entry with its subline, and a remove control that works.
      await expect(panel.getByTestId('canvas-share-entries').locator('li').first()).toHaveAttribute('data-testid', 'canvas-share-owner');
      await expect(panel.getByTestId('canvas-share-entry')).toContainText(E.title);
      await expect(panel.getByTestId('canvas-share-entry-count')).toHaveCount(0);
      await expect(panel.getByTestId('canvas-share-entry-date')).toBeVisible();
      await panel.getByTestId('canvas-share-remove').click();
      await expect(panel.getByTestId('canvas-share-entry')).toHaveCount(0, { timeout: 20_000 });

      // AC4: Anyone with the link asks first; Cancel changes nothing.
      await panel.getByTestId('canvas-share-general').selectOption('link');
      await expect(page.getByText('Share with anyone who has the link?')).toBeVisible();
      await expect(page.getByText('Anyone with this link can read this canvas, even without signing in. Signed-in people can also add positions and stories.')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByText('Share with anyone who has the link?')).toHaveCount(0);
      expect(await generalAccess()).toBe('restricted');
      await expect(panel.getByTestId('canvas-share-general')).toHaveValue('restricted');
      await expect(panel).toBeVisible(); // the panel stayed open behind the confirmation
      // ...Share with link opens it and the button becomes the globe.
      await chooseLink(page, panel);
      await expect(panel.getByTestId('canvas-share-reach')).toHaveText('Anyone with the link can open this canvas', { timeout: 20_000 });
      expect(await generalAccess()).toBe('link');
      // AC5: Copy link copies the address with #k= and shows Copied for two seconds.
      const { data: opened } = await supabaseAdmin.from('canvases').select('link_token').eq('id', canvas).single();
      await expect(panel.getByTestId('canvas-share-copy')).toBeEnabled({ timeout: 20_000 });
      await panel.getByTestId('canvas-share-copy').click();
      await expect(panel.getByTestId('canvas-share-copied')).toHaveText('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}${url()}#k=${opened!.link_token}`);
      await expect(panel.getByTestId('canvas-share-copy')).toHaveText('Copy link', { timeout: 4_000 });
      await closeSharePanel(page);
      await expect(page.getByTestId('canvas-share-open-icon')).toBeVisible();
      // ...and going back needs no confirmation.
      await button.click();
      await panel.getByTestId('canvas-share-general').selectOption('restricted');
      await expect(panel.getByTestId('canvas-share-general-note')).toContainText('The old link stops working.', { timeout: 20_000 });
      await expect(page.getByText('Share with anyone who has the link?')).toHaveCount(0);
      expect(await generalAccess()).toBe('restricted');
      await expect(panel.getByTestId('canvas-share-copy')).toBeEnabled({ timeout: 20_000 });
      await panel.getByTestId('canvas-share-copy').click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}${url()}`); // no #k= while it is closed
      await closeSharePanel(page);

      // AC6 (phones): a bottom sheet at 375 and 320, full width, pinned to the bottom, no sideways scroll.
      for (const [width, height] of [[375, 800], [320, 700]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(url());
        await waitForCanvas(page);
        await page.getByTestId('canvas-share-control').click();
        const sheet = page.getByTestId('canvas-share-panel');
        await expect(sheet.getByTestId('canvas-share-owner')).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(500); // the sheet's entrance settles
        const sb = (await sheet.boundingBox())!;
        // Full width of the page (`scrollbar-gutter: stable` on html reserves the classic scrollbar's gutter in this browser: fixed elements span the page, not the gutter).
        const pageWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
        expect(sb.width, `${width}: full width`).toBeGreaterThanOrEqual(pageWidth - 1);
        expect(sb.x, `${width}: starts at the left edge`).toBeLessThanOrEqual(1);
        expect(sb.y + sb.height, `${width}: pinned to the bottom edge`).toBeGreaterThanOrEqual(height - 1);
        expect(sb.y, `${width}: inside the viewport`).toBeGreaterThanOrEqual(0);
        await expectNoSidewaysScroll(page, width);
        await closeSharePanel(page);
        await expect(page.getByTestId('canvas-share-panel')).toHaveCount(0);
      }
    } finally {
      await reset();
    }
  });
  test('PHASE 5: a reader admitted once sees both versions and switches; ?v=older opens it; the owner has the switcher too (screenshots with P1515_SHOTS_DIR)', async ({ page }) => {
    test.setTimeout(300_000);
    const canvas = await ensureCanvasRecord();
    const V2 = `${NAME}v2`;
    const V2_TEXT = `P1515 second version bet ${RUN}`;
    await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvas);
    await supabaseAdmin.from('canvases').update({ general_access: 'restricted', link_token: null }).eq('id', canvas);
    await shareWith('event', E.id); // ONE share: A (registered in time) is admitted to every version
    const ver = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvas, owner_id: O.user.id, name: V2 });
    if (ver.error) throw new Error(`[P1515 fixture] version: ${ver.error.message}`);
    const pt = await supabaseAdmin.from('points').insert({
      statement: V2_TEXT, first_validator_id: O.user.id, visibility: 'private', tags: [`p1515ui${RUN}`], system_tags: ['canvas:problem', `canvas_${V2}`],
    }).select('id').single();
    if (pt.error) throw new Error(`[P1515 fixture] v2 point: ${pt.error.message}`);
    const widths = shots ? ([[1280, 900], [375, 800], [320, 700]] as const) : ([[1280, 900]] as const);
    try {
      for (const [width, height] of widths) {
        await page.setViewportSize({ width, height });
        // A reader, admitted once: no ?v opens the NEWEST version.
        await setTestSession(page, A.email);
        await page.goto(url());
        await waitForCanvas(page);
        await expect(page.getByText(V2_TEXT)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(PUBLIC_TEXT)).toHaveCount(0);
        // The version that opened is written into the address (replace), so Back and a reload return to it.
        await expect(page).toHaveURL(new RegExp(`[?&]v=${V2}`));
        const picker = page.getByTestId('canvas-version-picker');
        await expect(picker).toBeVisible();
        await expect(picker.getByRole('combobox', { name: 'Version' })).toHaveValue(V2);
        expect(await picker.getByRole('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).toEqual([V2, NAME]); // newest first
        await expect(page.getByTestId('canvas-share-control')).toHaveCount(0); // a reader never has Share
        await expectNoSidewaysScroll(page, width);
        if (shots) await page.screenshot({ path: `${shots}/reader-${width}-p5-switcher-newest.png`, fullPage: false });
        // Switching: the address carries ?v= and the older version's points show.
        await picker.getByRole('combobox', { name: 'Version' }).selectOption(NAME);
        await expect(page).toHaveURL(new RegExp(`[?&]v=${NAME}`));
        await expect(page.getByText(PUBLIC_TEXT)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(V2_TEXT)).toHaveCount(0);
        if (shots) await page.screenshot({ path: `${shots}/reader-${width}-p5-switcher-older.png`, fullPage: false });
        // ?v=older opens it directly.
        await page.goto(`${url()}?v=${NAME}`);
        await waitForCanvas(page);
        await expect(page.getByText(PUBLIC_TEXT)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('canvas-version-picker').getByRole('combobox', { name: 'Version' })).toHaveValue(NAME);
        // A version that is not of this canvas is not-found, the same as an unreadable canvas.
        await page.goto(`${url()}?v=nosuchversion`);
        await expectNotFound(page, 'A with an unknown version');
      }
      // The owner has the switcher too (the versions of THIS canvas only), with Share in the same row; a separate canvas of theirs is not listed.
      const other = await supabaseAdmin.from('points').insert({
        statement: `P1515 other canvas bet ${RUN}`, first_validator_id: O.user.id, visibility: 'private', tags: [`p1515ui${RUN}`], system_tags: ['canvas:problem', `${CANVAS_TAG}other`],
      }).select('id').single();
      if (other.error) throw new Error(`[P1515 fixture] other canvas point: ${other.error.message}`);
      try {
        for (const [width, height] of [[1280, 900], [320, 700]] as const) {
          await page.setViewportSize({ width, height });
          await setTestSession(page, O.email);
          await page.goto(url());
          await waitForCanvas(page);
          const versions = page.getByTestId('canvas-version-picker').getByRole('combobox', { name: 'Version' });
          await expect(versions).toHaveValue(V2, { timeout: 20_000 });
          expect(await versions.getByRole('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).toEqual([V2, NAME]);
          await expect(page.getByTestId('canvas-project-picker')).toHaveCount(0);
          await expect(page.getByTestId('canvas-share-control')).toBeVisible();
          await expectNoSidewaysScroll(page, width);
          // The switcher has a visible outline and shares one row with Share at every width (no orphaned icon).
          await expect(page.getByTestId('canvas-version-picker')).toHaveCSS('border-top-width', '1px');
          const vb = (await page.getByTestId('canvas-version-picker').boundingBox())!;
          const sb = (await page.getByTestId('canvas-share-control').boundingBox())!;
          expect(Math.abs((vb.y + vb.height / 2) - (sb.y + sb.height / 2)), `${width}: the switcher and Share are on one row`).toBeLessThan(12);
          expect(sb.x + sb.width, `${width}: Share is inside the page`).toBeLessThanOrEqual(width);
          await page.waitForTimeout(300);
          if (shots) await page.screenshot({ path: `${shots}/owner-${width}-p5-versions-only.png`, fullPage: false });
        }
      } finally {
        await supabaseAdmin.from('points').delete().eq('id', other.data.id);
      }
    } finally {
      await supabaseAdmin.from('points').delete().eq('id', pt.data.id);
      await supabaseAdmin.from('canvas_versions').delete().eq('owner_id', O.user.id).eq('name', V2);
      await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvas);
    }
  });
  test('PHASE 5: a signed-out visitor on the #k= link of a two-version canvas lands on ?v=newest, switches to the older version, survives a reload, and Back returns to the newest (never not-found)', async ({ browser }) => {
    test.setTimeout(240_000);
    const canvas = await ensureCanvasRecord();
    const V2 = `${NAME}v2`;
    const V2_TEXT = `P1515 link version two bet ${RUN}`;
    const TOKEN = 'b'.repeat(32);
    await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvas);
    const open = await supabaseAdmin.from('canvases').update({ general_access: 'link', link_token: TOKEN }).eq('id', canvas);
    if (open.error) throw new Error(`[P1515 fixture] open link: ${open.error.message}`);
    const ver = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvas, owner_id: O.user.id, name: V2 });
    if (ver.error) throw new Error(`[P1515 fixture] version: ${ver.error.message}`);
    const pt = await supabaseAdmin.from('points').insert({
      statement: V2_TEXT, first_validator_id: O.user.id, visibility: 'private', tags: [`p1515ui${RUN}`], system_tags: ['canvas:problem', `canvas_${V2}`],
    }).select('id').single();
    if (pt.error) throw new Error(`[P1515 fixture] v2 point: ${pt.error.message}`);
    const anon = await browser.newContext();
    try {
      const visitor = await anon.newPage();
      await visitor.goto(`${url()}#k=${TOKEN}`);
      await waitForCanvas(visitor);
      // Lands on the newest, written into the address; the token never rides it.
      await expect(visitor).toHaveURL(new RegExp(`[?&]v=${V2}`));
      expect(visitor.url()).not.toContain(TOKEN);
      await expect(visitor.getByText(V2_TEXT)).toBeVisible({ timeout: 20_000 });
      await expect(visitor.getByText(PUBLIC_TEXT)).toHaveCount(0);
      // Switches to the older version.
      await visitor.getByTestId('canvas-version-picker').getByRole('combobox', { name: 'Version' }).selectOption(NAME);
      await expect(visitor).toHaveURL(new RegExp(`[?&]v=${NAME}`));
      await expect(visitor.getByText(PUBLIC_TEXT)).toBeVisible({ timeout: 20_000 });
      await expect(visitor.getByText(V2_TEXT)).toHaveCount(0);
      // A reload still shows it (the token is in the tab's store, not the address).
      await visitor.reload();
      await waitForCanvas(visitor);
      await expect(visitor.getByText(PUBLIC_TEXT)).toBeVisible({ timeout: 20_000 });
      await expect(visitor.getByRole('heading', NOT_FOUND)).toHaveCount(0);
      // Back returns to the newest, never not-found.
      await visitor.goBack();
      await expect(visitor).toHaveURL(new RegExp(`[?&]v=${V2}`));
      await waitForCanvas(visitor);
      await expect(visitor.getByText(V2_TEXT)).toBeVisible({ timeout: 20_000 });
      await expect(visitor.getByRole('heading', NOT_FOUND)).toHaveCount(0);
    } finally {
      await anon.close();
      await supabaseAdmin.from('points').delete().eq('id', pt.data.id);
      await supabaseAdmin.from('canvas_versions').delete().eq('owner_id', O.user.id).eq('name', V2);
      await supabaseAdmin.from('canvases').update({ general_access: 'restricted', link_token: null }).eq('id', canvas);
    }
  });
  test('an owner whose canvas has no current points but has a record still gets the share control; everyone else gets not-found', async ({ page, browser }) => {
    const empty = `${NAME}empty`;
    const created = await supabaseAdmin.from('canvases').insert({ owner_id: O.user.id, name: empty, general_access: 'link', link_token: 'a'.repeat(32), link_generation: 1 }).select('id').single();
    if (created.error) throw new Error(`[P1515 fixture] empty canvas: ${created.error.message}`);
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await setTestSession(page, O.email);
      await page.goto(`/p/${O.slug}/canvas/${empty}`);
      await expect(page.getByTestId('canvas-share-control')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('canvas-empty-owner')).toContainText('This canvas has no points yet.');
      await expect(page.getByTestId('canvas-share-label')).toHaveText('Anyone with the link');
      // the owner can close it
      await page.getByTestId('canvas-share-control').click();
      await page.getByTestId('canvas-share-general').selectOption('restricted');
      await expect(page.getByTestId('canvas-share-general-note')).toContainText('Only the people, events and groups above', { timeout: 20_000 });
      // everyone else: not-found (a reader holding even the right token gets nothing: there is nothing to read)
      const other = await browser.newPage();
      await setTestSession(other, N.email);
      await other.goto(`/p/${O.slug}/canvas/${empty}`);
      await expect(other.getByRole('heading', NOT_FOUND)).toBeVisible({ timeout: 30_000 });
      await other.close();
    } finally {
      await supabaseAdmin.from('canvases').delete().eq('id', created.data.id);
    }
  });
  test('host removal: the host removes a registered person from the event page; their canvas read becomes not-found and they cannot register again (screenshots with P1515_SHOTS_DIR)', async ({ page, browser }) => {
    test.setTimeout(300_000);
    // Names a person would have (short, two words): the row's phone layout is about those, not a 25-character fixture label.
    const R = await createTestUser({ name: `Rita ${RUN.slice(-3)}` });
    const S = await createTestUser({ name: `Sam ${RUN.slice(-3)}` });
    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    const ER = await createTestEvent(O.user.id, tomorrow, { title: `P1515 Removal event ${RUN}` });
    let shared = false;
    try {
      for (const u of [R, S, O]) {
        const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: ER.id, profile_id: u.user.id });
        if (r.error) throw new Error(`[P1515 fixture] rsvp: ${r.error.message}`);
      }
      await shareWith('event', ER.id);
      shared = true;

      // R reads the canvas through the event.
      const rPage = await browser.newPage();
      await setTestSession(rPage, R.email);
      await rPage.goto(url());
      await waitForCanvas(rPage);
      await expect(rPage.getByTestId('canvas-shared-with-you')).toContainText(`Shared with you through ${ER.title}`);

      // A registered guest (S) sees no Remove control.
      const sPage = await browser.newPage();
      await setTestSession(sPage, S.email);
      await sPage.goto(`/events/${ER.slug}`);
      await expect(sPage.getByText(/Participants \(3/)).toBeVisible({ timeout: 30_000 });
      await expect(sPage.getByTestId('event-remove-attendee')).toHaveCount(0);
      await sPage.close();

      // The host: a Remove control next to R and S, not on the host's own row. Screenshots of the list and the dialog.
      await setTestSession(page, O.email);
      const shots = process.env.P1515_SHOTS_DIR;
      for (const [width, height] of shots ? ([[1280, 900], [375, 800], [320, 700]] as const) : ([[1280, 900]] as const)) {
        await page.setViewportSize({ width, height });
        await page.goto(`/events/${ER.slug}`);
        await expect(page.getByText(/Participants \(3/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('event-remove-attendee')).toHaveCount(2);
        await expect(page.getByRole('button', { name: `Remove ${O.name}` })).toHaveCount(0);
        const removeR = page.getByRole('button', { name: `Remove ${R.name}` });
        await removeR.scrollIntoViewIfNeeded();
        const box = await removeR.boundingBox();
        expect(box!.height, `${width}: touch target`).toBeGreaterThanOrEqual(width < 640 ? 44 : 40);
        if (width < 640) expect(box!.width, `${width}: phone touch target width`).toBeGreaterThanOrEqual(44);
        if (shots) { mkdirSync(shots, { recursive: true }); await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/host-${width}-participants-remove.png`, fullPage: false }); }
        // the NAME wins the row on phones: it wraps to a second line instead of being cut (nothing clipped at any width)
        const clipped = await page.getByRole('link', { name: R.name }).last().evaluate(el => ({ h: el.scrollHeight, c: el.clientHeight, w: el.scrollWidth, cw: el.clientWidth }));
        if (width < 640) { // from sm the name keeps the app-wide one-line ellipsis
          expect(clipped.h, `${width}: the removable person's name is not clipped vertically`).toBeLessThanOrEqual(clipped.c + 1);
          expect(clipped.w, `${width}: ...nor horizontally`).toBeLessThanOrEqual(clipped.cw + 1);
        }
        await removeR.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText(`Remove ${R.name}?`);
        await expect(dialog).toContainText('cannot register for this event again');
        await expect(dialog).toContainText('lose access to anything shared with this event');
        if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/host-${width}-remove-dialog.png`, fullPage: false }); }
        await dialog.getByRole('button', { name: 'Keep' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText(/Participants \(3/), `${width}: Keep removed nobody`).toBeVisible();
      }

      // The real removal, at desktop width.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/events/${ER.slug}`);
      await expect(page.getByText(/Participants \(3/)).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: `Remove ${R.name}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(page.getByText(/Participants \(2/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(R.name)).toHaveCount(0);
      await expect(page.getByTestId('event-remove-attendee')).toHaveCount(1); // S only

      // The server holds it: the registration is gone and the removal is recorded.
      const gone = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', ER.id).eq('profile_id', R.user.id);
      expect(gone.data, 'R is no longer registered').toEqual([]);
      const rec = await supabaseAdmin.from('event_removals').select('user_id').eq('event_id', ER.id).eq('user_id', R.user.id);
      expect(rec.data, 'the removal is recorded').toHaveLength(1);

      // R's next canvas read is not-found (the page refetches on focus; a fresh load is the same read).
      await rPage.goto(url());
      await expectNotFound(rPage, 'R after removal');
      // ...and R cannot register again through the page.
      await rPage.goto(`/events/${ER.slug}`);
      await rPage.getByTestId('rsvp-button').first().click();
      await expect(rPage.getByText(/Couldn't sign you up/)).toBeVisible({ timeout: 30_000 });
      const again = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', ER.id).eq('profile_id', R.user.id);
      expect(again.data, 'R is still not registered').toEqual([]);
      await rPage.close();
    } finally {
      if (shared) await stopSharingWith('event', ER.id);
      await deleteTestEvent(ER.id);
      await deleteTestUser(R.user.id);
      await deleteTestUser(S.user.id);
    }
  });
});
