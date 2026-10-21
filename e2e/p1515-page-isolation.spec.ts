/**
 * @file p1515-page-isolation.spec.ts
 * @description P1515: page-level evidence that a canvas leaks nowhere. The real pages, in a browser, against the TEST DB.
 *
 * A canvas holds PRIVATE rows (a point, the owner's story, a reader's added story, a story its reader linked straight to
 * the point). It is shared with an event AND open to anyone with the link. For every kind of viewer, none of those rows
 * may show on the feed, /stake/<tag>, the owner's and the reader's profile, or the point and story pages, and a canvas
 * point's or story's own page must be refused to everyone who is not its author or owner. CONTROLS: the same pages show a
 * PUBLIC point and story of the owner's (so "absent" is not a blind page), and the canvas itself shows the rows to the
 * viewers who may read it. (d): what those pages show for non-canvas data is the same before the canvas exists and after
 * it is shared and open.
 *
 * Viewers: O owner, A admitted through the event, S a signed-in stranger holding the link, V signed out holding the link.
 * Run: npx playwright test e2e/p1515-page-isolation.spec.ts --workers=1
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { createTestLetter, createTestStorySnapshot, getTestStoryVersionId, sealTestLetter, deleteTestLetter } from './helpers/test-letter';

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `p1515iso${RUN}`.toLowerCase(); // the user tag every row carries AND the canvas name
const CANVAS_TAG = `canvas_${TAG}`;
const TOKEN = 'b'.repeat(32);

const CONTROL_POINT = `ISO control public point ${RUN}`;
const CONTROL_STORY = `ISO control public story ${RUN}`;
const CANVAS_POINT = `ISO canvas private point ${RUN}`;
const CANVAS_OWNER_STORY = `ISO canvas owner story ${RUN}`;
const CANVAS_ADDED_STORY = `ISO canvas added story ${RUN}`;
const CANVAS_DIRECT_STORY = `ISO canvas direct-link story ${RUN}`;

const CONTROLS = [CONTROL_POINT, CONTROL_STORY];
// What the assertions forbid. (Pointing this at CONTROLS is the proof that each assertion bites; see the report.)
const FORBIDDEN = [CANVAS_POINT, CANVAS_OWNER_STORY, CANVAS_ADDED_STORY, CANVAS_DIRECT_STORY];

let O: TestUser, A: TestUser, S: TestUser;
let E: TestEvent;
let controlPointId = '', controlStoryId = '', canvasPointId = '', ownerStoryId = '', addedStoryId = '', directStoryId = '';
let canvasId = '';
let letterId = '', letterDocId = '';
const created = { points: [] as string[], stories: [] as string[] };

async function insertPoint(statement: string, visibility: 'public' | 'private', system: string[]) {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement, first_validator_id: O.user.id, visibility, tags: [TAG], system_tags: system,
  }).select('id').single();
  if (error) throw new Error(`[iso fixture] point: ${error.message}`);
  created.points.push(data.id as string);
  return data.id as string;
}
async function insertStory(author: string, content: string, visibility: 'public' | 'private', pointId: string | null) {
  const { data, error } = await supabaseAdmin.from('stories').insert({ content, author_id: author, visibility, tags: [TAG] }).select('id').single();
  if (error) throw new Error(`[iso fixture] story: ${error.message}`);
  created.stories.push(data.id as string);
  if (pointId) {
    const l = await supabaseAdmin.from('story_points').insert({ story_id: data.id, point_id: pointId, author_id: author });
    if (l.error) throw new Error(`[iso fixture] story link: ${l.error.message}`);
  }
  return data.id as string;
}

/** The viewers, as a page each. V and S arrive through the link first, so the tab holds the token like a real link holder. */
type Viewer = { name: string; page: Page; close: () => Promise<void> };
async function viewers(browser: Browser, which: Array<'O' | 'A' | 'S' | 'V'>, withLink: boolean): Promise<Viewer[]> {
  const out: Viewer[] = [];
  for (const w of which) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const user = { O, A, S }[w as 'O' | 'A' | 'S'];
    if (user) await setTestSession(page, user.email);
    if (withLink && (w === 'S' || w === 'V')) {
      await page.goto(`/p/${O.slug}/canvas/${TAG}#k=${TOKEN}`);
      await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    }
    out.push({ name: w, page, close: () => ctx.close() });
  }
  return out;
}

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

/** Open a page; wait until every `must` text is on it (proving the page rendered its data); settle; return its text. */
async function open(page: Page, url: string, must: string[]): Promise<string> {
  await page.goto(url);
  for (const m of must) await expect(page.locator('body'), `${url}: control "${m}" renders`).toContainText(m, { timeout: 30_000 });
  await page.waitForTimeout(1_500); // late rows (a second query) get their chance to appear
  return bodyText(page);
}
function assertNoCanvasRows(text: string, where: string) {
  for (const f of FORBIDDEN) expect(text, `${where}: "${f}" must not appear`).not.toContain(f);
}
/** A page that is refused: none of the canvas rows, and the not-found state (the page proves it was asked). */
async function expectRefused(page: Page, url: string, who: string) {
  await page.goto(url);
  await expect(page.locator('body'), `${who} on ${url}: refused`).toContainText(/not found|doesn.t exist|can.t find|no longer/i, { timeout: 30_000 });
  await page.waitForTimeout(1_000);
  assertNoCanvasRows(await bodyText(page), `${who} on ${url}`);
}

const PAGES = () => [
  ['feed', '/feed'],
  ['stake', `/stake/${TAG}`],
  ["owner's profile", `/p/${O.slug}`],
  ["reader's profile", `/p/${A.slug}`],
] as const;

/**
 * (d) letters: what a viewer's letter page shows, before and after the canvas exists. The letter is the owner's public one-to-many
 * letter that cites the PUBLIC control story and point (a minimal fixture seeded like p1379's). `cover` is the page as it opens;
 * `story` is the page after "Open the letter" (the story and the point it cites).
 */
async function letterSeen(page: Page): Promise<{ cover: string; story: string }> {
  await page.goto(`/letter/${letterId}`);
  const openButton = page.getByRole('button', { name: /open the letter/i });
  // The sender gets "This is your letter" (a preview link); everyone else the cover with "Open the letter".
  await expect(openButton.or(page.getByText(CONTROL_STORY).first()).or(page.getByRole('heading', { name: /this is your letter/i })), 'the letter page renders').toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  const cover = await bodyText(page);
  if (await openButton.count()) {
    await openButton.click();
    await expect(page.getByText(CONTROL_STORY).first(), 'the letter shows the control story').toBeVisible({ timeout: 30_000 });
  }
  await page.waitForTimeout(1_500);
  return { cover, story: await bodyText(page) };
}

/** What a viewer's pages show of the CONTROL data: the controls present on each page. Used for (d). */
async function controlsSeen(page: Page, url: string, expectOnPage: string[]): Promise<string[]> {
  const text = await open(page, url, expectOnPage);
  return CONTROLS.filter(c => text.includes(c));
}
/** Which control texts each page must show for each viewer (the owner's story and point; stake needs the tag). */
const EXPECT: Record<string, string[]> = {
  '/feed': [CONTROL_STORY],
  stake: [CONTROL_POINT],
  profile: [CONTROL_STORY],
  point: [CONTROL_POINT],
  story: [CONTROL_STORY],
};

test.describe('P1515: a canvas leaks into no other page', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  const before: Record<string, string[]> = {};
  const letterBefore: Record<string, { cover: string; story: string }> = {};

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    O = await createTestUser({ name: `Iso Owner ${RUN.slice(-3)}` });
    A = await createTestUser({ name: `Iso Reader ${RUN.slice(-3)}` });
    S = await createTestUser({ name: `Iso Stranger ${RUN.slice(-3)}` });
    E = await createTestEvent(O.user.id, new Date(Date.now() - 2 * 86_400_000), { title: `ISO event ${RUN}` });
    const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: E.id, profile_id: A.user.id, rsvped_at: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    if (r.error) throw new Error(`[iso fixture] rsvp: ${r.error.message}`);
    // The non-canvas data that must look the same before and after: a PUBLIC point and a PUBLIC story linked to it.
    controlPointId = await insertPoint(CONTROL_POINT, 'public', []);
    controlStoryId = await insertStory(O.user.id, CONTROL_STORY, 'public', controlPointId);
    // /stake lists only points somebody has taken a position on: give the control one (the canvas point gets A's, below).
    const cp = await supabaseAdmin.from('point_positions').insert({ point_id: controlPointId, user_id: O.user.id, position: 'agree' });
    if (cp.error) throw new Error(`[iso fixture] control position: ${cp.error.message}`);
    // A minimal letter of the owner's that cites the public control story and point (public, one-to-many, sealed).
    const doc = await supabaseAdmin.from('clarity_docs').insert({ owner_id: O.user.id, title: `ISO letter doc ${RUN}`, visibility: 'public' }).select('id').single();
    if (doc.error) throw new Error(`[iso fixture] letter doc: ${doc.error.message}`);
    letterDocId = doc.data.id as string;
    const ds = await supabaseAdmin.from('doc_stories').insert({ doc_id: letterDocId, story_id: controlStoryId, position: 0 });
    if (ds.error) throw new Error(`[iso fixture] doc story: ${ds.error.message}`);
    const letter = await createTestLetter(O.user.id, letterDocId, { mode: 'one-to-many' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, controlStoryId, await getTestStoryVersionId(controlStoryId), {
      position: 0,
      pointConfig: { storyText: CONTROL_STORY, points: [{ id: controlPointId, text: CONTROL_POINT, authorPosition: null }] },
    });
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    test.setTimeout(300_000);
    if (canvasId) await supabaseAdmin.from('canvases').delete().eq('id', canvasId);
    if (letterId) await deleteTestLetter(letterId);
    if (letterDocId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', letterDocId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', letterDocId);
    }
    if (created.stories.length) await supabaseAdmin.from('stories').delete().in('id', created.stories);
    if (created.points.length) await supabaseAdmin.from('points').delete().in('id', created.points);
    if (E) await deleteTestEvent(E.id);
    for (const u of [O, A, S]) if (u) await deleteTestUser(u.user.id);
  });

  test('(d) BEFORE: the pages show the owner\'s public point and story, and are the baseline for after', async ({ browser }) => {
    const vs = await viewers(browser, ['O', 'A', 'S', 'V'], false);
    try {
      for (const v of vs) {
        before[`${v.name} feed`] = await controlsSeen(v.page, '/feed', EXPECT['/feed']!);
        before[`${v.name} stake`] = await controlsSeen(v.page, `/stake/${TAG}`, EXPECT.stake!);
        before[`${v.name} profile`] = await controlsSeen(v.page, `/p/${O.slug}`, EXPECT.profile!);
        before[`${v.name} point page`] = await controlsSeen(v.page, `/point/${controlPointId}`, EXPECT.point!);
        before[`${v.name} story page`] = await controlsSeen(v.page, `/story/${controlStoryId}`, EXPECT.story!);
        letterBefore[v.name] = await letterSeen(v.page);
      }
      // CONTROL for "same": the letter baseline is not empty for anyone: it shows the cited story and point.
      for (const [who, seen] of Object.entries(letterBefore)) {
        expect(seen.story.length, `baseline letter for ${who} is not an empty page`).toBeGreaterThan(40);
        if (who === 'O') { expect(seen.story, 'the sender\'s letter page').toContain('This is your letter'); continue; }
        expect(seen.story, `baseline letter for ${who} shows the cited story`).toContain(CONTROL_STORY);
      }
      // CONTROL for "same": the baseline is not empty on any page, for anyone.
      for (const [k, seen] of Object.entries(before)) expect(seen.length, `baseline ${k} shows something`).toBeGreaterThan(0);
    } finally {
      for (const v of vs) await v.close();
    }
  });

  test('the canvas exists, is shared with the event and open by link, and its readers really see the private rows (the control for every absence below)', async ({ browser }) => {
    canvasPointId = await insertPoint(CANVAS_POINT, 'private', ['canvas:problem', CANVAS_TAG]);
    ownerStoryId = await insertStory(O.user.id, CANVAS_OWNER_STORY, 'private', canvasPointId);
    const c = await supabaseAdmin.from('canvases').insert({ owner_id: O.user.id, name: TAG, general_access: 'link', link_token: TOKEN, link_generation: 1 }).select('id').single();
    if (c.error) throw new Error(`[iso fixture] canvas: ${c.error.message}`);
    canvasId = c.data.id as string;
    const aud = await supabaseAdmin.from('canvas_audience').insert({ canvas_id: canvasId, kind: 'event', event_id: E.id, org_id: null });
    if (aud.error) throw new Error(`[iso fixture] audience: ${aud.error.message}`);
    // A's added story (recorded on the canvas), A's position on the point, and A's own story linked straight to O's point.
    addedStoryId = await insertStory(A.user.id, CANVAS_ADDED_STORY, 'private', null);
    const rec = await supabaseAdmin.from('canvas_added_stories').insert({ canvas_id: canvasId, point_id: canvasPointId, story_id: addedStoryId, author_id: A.user.id });
    if (rec.error) throw new Error(`[iso fixture] added story: ${rec.error.message}`);
    const pos = await supabaseAdmin.from('point_positions').insert({ point_id: canvasPointId, user_id: A.user.id, position: 'agree' });
    if (pos.error) throw new Error(`[iso fixture] position: ${pos.error.message}`);
    directStoryId = await insertStory(A.user.id, CANVAS_DIRECT_STORY, 'private', canvasPointId);

    // The canvas page shows the point to O, to A (event) and to link holders S and V; the owner's story and A's added story too.
    const vs = await viewers(browser, ['O', 'A', 'S', 'V'], false);
    try {
      for (const v of vs) {
        await v.page.goto(`/p/${O.slug}/canvas/${TAG}${v.name === 'S' || v.name === 'V' ? `#k=${TOKEN}` : ''}`);
        await expect(v.page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
        await expect(v.page.locator('body'), `${v.name}: the canvas shows the private point`).toContainText(CANVAS_POINT, { timeout: 30_000 });
      }
    } finally {
      for (const v of vs) await v.close();
    }
  });

  test('feed, /stake, the owner\'s and the reader\'s profile show none of the canvas\'s rows to anyone, while showing the public control', async ({ browser }) => {
    const vs = await viewers(browser, ['O', 'A', 'S', 'V'], true);
    try {
      for (const v of vs) {
        for (const [label, url] of PAGES()) {
          const must = label === 'reader\'s profile' ? [] : label === 'stake' ? [CONTROL_POINT] : [CONTROL_STORY]; // the reader's profile has no public control of the owner's
          assertNoCanvasRows(await open(v.page, url, must), `${v.name} on ${label} (${url})`);
        }
      }
    } finally {
      for (const v of vs) await v.close();
    }
  });

  test('a canvas point\'s and story\'s own page is refused to everyone who is not its owner or author; the public control opens for all', async ({ browser }) => {
    const vs = await viewers(browser, ['O', 'A', 'S', 'V'], true);
    try {
      for (const v of vs) {
        // the public control page opens (control)
        assertNoCanvasRows(await open(v.page, `/point/${controlPointId}`, [CONTROL_POINT]), `${v.name} on the control point page`);
        assertNoCanvasRows(await open(v.page, `/story/${controlStoryId}`, [CONTROL_STORY]), `${v.name} on the control story page`);
        // refused: the canvas point (owner is the control), the owner's story, A's added story and A's direct-link story
        if (v.name !== 'O') {
          await expectRefused(v.page, `/point/${canvasPointId}`, v.name);
          await expectRefused(v.page, `/story/${ownerStoryId}`, v.name);
        }
        if (v.name !== 'A') {
          await expectRefused(v.page, `/story/${addedStoryId}`, v.name);
          await expectRefused(v.page, `/story/${directStoryId}`, v.name);
        }
      }
      // CONTROLS: the author or owner does read their own row on its own page.
      const [o, a] = [vs[0]!, vs[1]!];
      await o.page.goto(`/point/${canvasPointId}`);
      await expect(o.page.locator('body'), 'CONTROL: the owner opens the canvas point page').toContainText(CANVAS_POINT, { timeout: 30_000 });
      await o.page.goto(`/story/${ownerStoryId}`);
      await expect(o.page.locator('body'), 'CONTROL: the owner opens their story').toContainText(CANVAS_OWNER_STORY, { timeout: 30_000 });
      await a.page.goto(`/story/${addedStoryId}`);
      await expect(a.page.locator('body'), 'CONTROL: the author opens their added story').toContainText(CANVAS_ADDED_STORY, { timeout: 30_000 });
    } finally {
      for (const v of vs) await v.close();
    }
  });

  test('(d) AFTER: the same pages show the same non-canvas items as before, for every viewer', async ({ browser }) => {
    const vs = await viewers(browser, ['O', 'A', 'S', 'V'], true);
    try {
      for (const v of vs) {
        const after: Record<string, string[]> = {
          [`${v.name} feed`]: await controlsSeen(v.page, '/feed', EXPECT['/feed']!),
          [`${v.name} stake`]: await controlsSeen(v.page, `/stake/${TAG}`, EXPECT.stake!),
          [`${v.name} profile`]: await controlsSeen(v.page, `/p/${O.slug}`, EXPECT.profile!),
          [`${v.name} point page`]: await controlsSeen(v.page, `/point/${controlPointId}`, EXPECT.point!),
          [`${v.name} story page`]: await controlsSeen(v.page, `/story/${controlStoryId}`, EXPECT.story!),
        };
        for (const [k, seen] of Object.entries(after)) expect(seen, `${k}: the same items before and after the canvas`).toEqual(before[k]);
        // The letter page: identical content before and after, and no canvas row in it.
        const letterAfter = await letterSeen(v.page);
        assertNoCanvasRows(letterAfter.cover, `${v.name} letter cover`);
        assertNoCanvasRows(letterAfter.story, `${v.name} letter story page`);
        expect(letterAfter.cover, `${v.name}: the letter cover is the same before and after the canvas`).toEqual(letterBefore[v.name]!.cover);
        expect(letterAfter.story, `${v.name}: the letter story page is the same before and after the canvas`).toEqual(letterBefore[v.name]!.story);
      }
    } finally {
      for (const v of vs) await v.close();
    }
  });
});
