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
    await expect(panel.getByLabel('Add a person, event or group')).toBeVisible();
    await expect(panel.getByTestId('canvas-share-option').first()).toBeVisible({ timeout: 20_000 });
    const options = await panel.getByTestId('canvas-share-option').allTextContents();
    expect(options).toEqual([`${E.title}Event`, `${Yp.name}Group`, `${Y.name}Group`]);
    await panel.getByTestId('canvas-share-option').filter({ hasText: E.title }).click(); // picking adds: no separate Add button
    await expect(panel.getByTestId('canvas-share-entry')).toHaveCount(1, { timeout: 20_000 }); // a share, then the panel re-reads
    await expect(panel.getByTestId('canvas-share-entry')).toContainText(E.title);
    await page.keyboard.press('Escape');
    // One idea: still Private, now "shared with" the event; the icon marks the header's cards.
    await expect(page.getByTestId('canvas-share-label')).toHaveText(`Private · shared with ${E.title}`);
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

    // The owner sees both, with A's name. CONTROL for the listener above: the owner's picker DOES read /rest/v1/points.
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
    expect(ownerRequests.length, 'CONTROL: the same listener sees the owner\'s ordinary reads').toBeGreaterThan(0);

    // ...and the story shows nowhere else: not on O's point page, where the ordinary loaders run.
    await ownerPage.goto(`/point/${privId}`);
    await expect(ownerPage.getByText(PRIVATE_TEXT).first()).toBeVisible({ timeout: 30_000 });
    await expect(ownerPage.getByText(A_STORY)).toHaveCount(0);
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
    // The event: the host (O) is not counted; A is admitted, L (late) is not.
    const event = entries.filter({ hasText: E.title });
    await expect(event.getByTestId('canvas-share-entry-count')).toHaveText('1 person can see it');
    await expect(event.getByTestId('canvas-share-entry-names')).toHaveText(A.name);
    await expect(event.getByTestId('canvas-share-entry-names')).not.toContainText(L.name);
    // A public group names its members (O excluded); a private group says a count and no names.
    const publicGroup = entries.filter({ hasText: Y.name });
    await expect(publicGroup.getByTestId('canvas-share-entry-count')).toHaveText('1 person can see it');
    await expect(publicGroup.getByTestId('canvas-share-entry-names')).toHaveText(G.name);
    const privateGroup = entries.filter({ hasText: Yp.name });
    await expect(privateGroup.getByTestId('canvas-share-entry-count')).toHaveText('1 person can see it (names are private)');
    await expect(privateGroup.getByTestId('canvas-share-entry-names')).toHaveCount(0);
    await expect(page.getByTestId('canvas-share-panel')).not.toContainText(N.name);
    // No combined total across entries.
    await expect(page.getByTestId('canvas-share-panel').getByText(/\b3 people\b/)).toHaveCount(0);
    await page.keyboard.press('Escape');

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
      await page.keyboard.press('Escape');
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
    const options = await panel.getByTestId('canvas-share-option').allTextContents();
    expect(options).toContain(`${E.title}Event`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-share-label')).not.toContainText(E.title);

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
    await panel.getByLabel('Add a person, event or group').fill(A.name.slice(0, 12).toLowerCase());
    await panel.getByTestId('canvas-share-option').filter({ hasText: A.name }).click();
    // The person's row is the one that says so (a public group's row lists its members' names too).
    const personRow = panel.getByTestId('canvas-share-entry').filter({ hasText: 'Can read it and add to it' });
    await expect(personRow).toHaveCount(1, { timeout: 20_000 });
    await expect(personRow).toContainText(A.name);
    await expect(panel.getByTestId('canvas-share-owner')).toHaveText(/You \(owner\)/);
    // CONTROL: someone the search does not return (N, no relationship) is not offered.
    await panel.getByLabel('Add a person, event or group').fill(N.name.slice(0, 12).toLowerCase());
    await expect(panel.getByTestId('canvas-share-nothing-to-add')).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByTestId('canvas-share-option').filter({ hasText: N.name })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The person's page: the reader line names the owner.
    const aPage = await browser.newPage();
    await setTestSession(aPage, A.email);
    await aPage.goto(url());
    await waitForCanvas(aPage);
    await expect(aPage.getByTestId('canvas-shared-with-you')).toContainText(`Shared with you by ${O.name}`);
    await aPage.close();

    // General access: Anyone with the link.
    await page.getByTestId('canvas-share-control').click();
    await panel.getByTestId('canvas-share-general').selectOption('link');
    await expect(panel.getByTestId('canvas-share-general-note')).toContainText('Anyone with the link can read it', { timeout: 20_000 });
    await page.keyboard.press('Escape');
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
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}${url()}?k=${token}`);
    await page.keyboard.press('Escape');

    // A signed-out visitor reads with the token, with no way to write; the plain address (no token) is still not-found.
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.setViewportSize({ width: 1440, height: 900 });
    await visitor.goto(url());
    await expectNotFound(visitor, 'V without the token while the link is open');
    await visitor.goto(`${url()}?k=${token}&point=${privId}`);
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
    await nPage.goto(`${url()}?k=${token}&point=${privId}`);
    await waitForCanvas(nPage);
    await expect(nPage.getByTestId(`feed-point-card-${privId}`).getByRole('button', { name: /^disagree/i }).first()).toBeVisible();

    // Back to "Only people added": both get not-found on their next request.
    await page.getByTestId('canvas-share-control').click();
    await panel.getByTestId('canvas-share-general').selectOption('restricted');
    await expect(panel.getByTestId('canvas-share-general-note')).toContainText('Only the people, events and groups above', { timeout: 20_000 });
    await page.keyboard.press('Escape');
    await visitor.goto(`${url()}?k=${token}`);
    await expectNotFound(visitor, 'V after closing the link');
    await nPage.goto(`${url()}?k=${token}`);
    await expectNotFound(nPage, 'L after closing the link');
    await nPage.close();
    await anon.close();

    // Remove the person: A's next request is not-found (A has no other way in).
    await page.getByTestId('canvas-share-control').click();
    await panel.getByRole('button', { name: `Stop sharing with ${A.name}` }).click();
    await expect(panel.getByTestId('canvas-share-entry').filter({ hasText: 'Can read it and add to it' })).toHaveCount(0, { timeout: 20_000 });
    const a2 = await browser.newPage();
    await setTestSession(a2, A.email);
    await a2.goto(url());
    await expectNotFound(a2, 'A after the person entry was removed');
    await a2.close();
    await supabaseAdmin.from('witnesses').delete().eq('profile_id', O.user.id);
  });
});
