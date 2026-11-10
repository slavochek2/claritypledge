/**
 * @file p1529-mastermind.spec.ts
 * @description P1529 QA walk of the sales mastermind on the self-hosted TEST server: a real browser, the real RPCs and (for the next
 * version) the real model. Setup is API-level (service role plus each attendee's own signed-in client); what the acceptance criteria
 * describe is driven through the real UI. Cleanup removes exactly the rows this file created (e2e/helpers/p1529-mastermind.ts).
 *
 * Every spec step is an `ac(id, name, fn)`: a failure is RECORDED with the observed behaviour and the walk continues, so one broken
 * criterion does not hide the rest; the last test fails the run if any recorded step failed (nothing is weakened or retried).
 * Results: <P1529_OUT>/results.jsonl (default test-results/p1529). Screenshots: <P1529_OUT>/shots/<screen>-<state>-<width>.png at 1280, 375 and 320, each with
 * window.innerWidth confirmed.
 *
 * Run: P1529_OUT=<abs dir> npx playwright test e2e/p1529-mastermind.spec.ts --project=chromium --workers=1
 *
 * NOT exercised here (a headless run cannot): a real versus a muted microphone (the three recording states are exercised with seeded
 * transcription rows instead), and a new user returning from sign-up with the step shown (needs the email link).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { supabaseAdmin } from './helpers/supabase-admin';
import { setTestSession, generateTestEmail } from './helpers/test-user';
import {
  assertSelfHostedTest, newLedger, makeUser, makeEvent, publishCanvas, register, shareForEvent, joinRoom, makeTranscribeRoom,
  postRoundLines, completeJobEmpty, keepRoomOpen, withModelTerms, fixtureLines, savedSeats, roundIdByNo, backdateRound, cleanup, leftovers, SELFHOSTED_TEST_URL,
  type Person, type Ledger,
} from './helpers/p1529-mastermind';
import { pressHostPrimary, openHostPreview } from './helpers/test-event-room';

/** P1529: the round card asks for the mic first; a test browser has none, so it continues without ("Continue without mic"). */
async function continueWithoutMic(pg: Page): Promise<void> {
  const without = pg.getByTestId('round-mic-without');
  if (await without.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) await without.click();
}

/** The round card, or the mic step that comes first (its own test id), then the card once the person continues without a mic. */
async function waitForRoundCard(pg: Page): Promise<void> {
  await expect(pg.getByTestId('mastermind-round-card').or(pg.getByTestId('mastermind-mic-step'))).toBeVisible({ timeout: 120_000 });
  await continueWithoutMic(pg);
  await expect(pg.getByTestId('mastermind-round-card')).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial', timeout: 900_000, retries: 0 });
test.use({ actionTimeout: 30_000, navigationTimeout: 90_000 });

// repo-relative by default (test-results/ is gitignored); pass an absolute P1529_OUT to keep a run's shots elsewhere
const OUT = process.env.P1529_OUT ?? 'test-results/p1529';
const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });
const RESULTS = `${OUT}/results.jsonl`;
const WIDTHS = [1280, 375, 320] as const;
const NOTES = `${OUT}/notes.log`;

const ledger: Ledger = newLedger();
const failures: Array<{ id: string; error: string }> = [];
let lastPage: Page | undefined;
const note = (s: string) => { console.log(`[P1529] ${s}`); appendFileSync(NOTES, `${new Date().toISOString()} ${s}\n`); };

/** One acceptance-criteria step. A failure is recorded (with the page's own words) and the walk goes on. */
async function ac(id: string, name: string, fn: () => Promise<unknown>, page?: Page): Promise<void> {
  try {
    const evidence = (await fn()) ?? '';
    appendFileSync(RESULTS, JSON.stringify({ id, name, status: 'pass', evidence }) + '\n');
    note(`PASS ${id} ${name}${evidence ? ` :: ${evidence}` : ''}`);
  } catch (e) {
    const error = String((e as Error).message ?? e).replace(/\s+/g, ' ').slice(0, 900);
    failures.push({ id, error });
    appendFileSync(RESULTS, JSON.stringify({ id, name, status: 'FAIL', error }) + '\n');
    note(`FAIL ${id} ${name} :: ${error}`);
    const shotPage = page ?? lastPage;
    if (shotPage) await shotPage.screenshot({ path: `${OUT}/fail-${id.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true }).catch(() => undefined);
  }
}

/** Screenshots at 1280, 375 and 320; window.innerWidth is read back each time and recorded. */
async function shots(page: Page, screen: string, state: string, widths: readonly number[] = WIDTHS): Promise<void> {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w >= 1280 ? 900 : 812 });
    await page.waitForTimeout(500);
    const iw = await page.evaluate(() => window.innerWidth);
    const file = `${SHOTS}/${screen}-${state}-${w}.png`;
    if (iw !== w) note(`WARNING innerWidth ${iw} != ${w} for ${screen}-${state}`);
    await page.screenshot({ path: file, fullPage: true });
    appendFileSync(`${OUT}/shots.jsonl`, JSON.stringify({ file, width: w, innerWidth: iw }) + '\n');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

// ── the people ───────────────────────────────────────────────────────────────────────────────────────────────────────

let host: Person;
const A: Person[] = []; // six with canvases
let O1: Person, O2: Person; // two without
let REGU: Person; // browser registration user

async function asUser(page: Page, p: Person, path: string) {
  await setTestSession(page, p.user.email);
  await page.goto(path);
}
const first = (p: Person) => p.user.name.split(' ')[0];

test.beforeAll(async () => {
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(RESULTS, '');
  writeFileSync(NOTES, '');
  writeFileSync(`${OUT}/shots.jsonl`, '');
  note(`target ${process.env.VITE_SUPABASE_URL} (expected ${SELFHOSTED_TEST_URL})`);
  host = await makeUser(ledger, 'Hana Qatest');
  const names = ['Ada Qatest', 'Bo Qatest', 'Cy Qatest', 'Di Qatest', 'Ed Qatest', 'Flo Qatest'];
  for (const n of names) A.push(await makeUser(ledger, n));
  O1 = await makeUser(ledger, 'Gus Qatest');
  O2 = await makeUser(ledger, 'Ivy Qatest');
  REGU = await makeUser(ledger, 'Rae Qatest');
  for (const p of A) await publishCanvas(ledger, p, `${first(p)} canvas`);
  note(`world ready: host ${host.user.user.id}, ${A.length} canvas holders`);
});

const stoppers: Array<() => void> = [];
test.afterAll(async () => {
  test.setTimeout(600_000);
  assertSelfHostedTest();
  for (const stop of stoppers) stop();
  const report = await cleanup(ledger);
  const left = await leftovers(ledger);
  note(`CLEANUP (TEST DB): ${JSON.stringify(report)}`);
  note(`LEFTOVERS after cleanup (all must be 0): ${JSON.stringify(left)}`);
  writeFileSync(`${OUT}/cleanup.json`, JSON.stringify({ report, left }, null, 2));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1 + 2: registration step; the limit
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
test('AC1+2: registration asks before the seat; the limit; Clarity Night stays one tap', async ({ page, browser }) => {
  const REG = await makeEvent(ledger, host.user, `P1529 QA registration ${RUN_TAG()}`, { startsInMs: 2 * 86_400_000, maxAttendees: 4 });
  const CN = await makeEvent(ledger, host.user, `P1529 QA clarity night one tap ${RUN_TAG()}`, { series: null, startsInMs: 2 * 86_400_000 });
  const slug = REG.slug;

  await ac('1a', 'direct calls without answers are refused (insert, rsvp_to_event_by_slug, register without acceptance, unknown answer)', async () => {
    const ins = await REGU.client.from('event_rsvps').insert({ event_id: REG.id, profile_id: REGU.user.user.id });
    expect(ins.error, 'direct insert must be refused').not.toBeNull();
    expect(JSON.stringify(ins.error)).toMatch(/answers_required|asks a few questions/);
    const rsvp = await REGU.client.rpc('rsvp_to_event_by_slug', { p_slug: slug });
    expect(rsvp.error, `rsvp_to_event_by_slug returned ${JSON.stringify(rsvp.data)}`).not.toBeNull();
    expect(rsvp.error!.message).toMatch(/asks a few questions/);
    const noAccept = await REGU.client.rpc('register_for_event', { p_slug: slug, p_participation: 'observer', p_phone: 'usbc', p_hope: null, p_recording_accepted: false });
    expect(noAccept.error?.message ?? 'NO ERROR').toMatch(/accepting transcription/);
    const bad = await REGU.client.rpc('register_for_event', { p_slug: slug, p_participation: 'nonsense', p_phone: 'usbc', p_hope: null, p_recording_accepted: true });
    expect(bad.error, 'an unknown participation answer must be refused').not.toBeNull();
    const { count } = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id).eq('profile_id', REGU.user.user.id);
    expect(count, 'no seat exists after four refused calls').toBe(0);
    const { count: ans } = await supabaseAdmin.from('event_registration_answers').select('*', { count: 'exact', head: true }).eq('event_id', REG.id);
    expect(ans, 'no answers saved by refused calls').toBe(0);
    const noPrep = await REGU.client.rpc('register_for_event', { p_slug: slug, p_participation: 'observer', p_phone: 'usbc', p_hope: null, p_recording_accepted: true });
    expect(noPrep.error?.message ?? 'NO ERROR', 'an observer without the second answer is refused').toMatch(/choose where you will prepare/);
    const early = await REGU.client.rpc('join_event_waitlist', { p_slug: slug, p_participation: 'canvas_before', p_phone: 'usbc', p_hope: null, p_recording_accepted: true });
    expect(early.data, 'the waiting list is for a full event only').toBe('not_full');
    const { count: wl } = await supabaseAdmin.from('event_waitlist').select('*', { count: 'exact', head: true }).eq('event_id', REG.id);
    expect(wl, 'nothing was written to the waiting list').toBe(0);
    return `5 refused (${ins.error!.message} | ${rsvp.error!.message} | ${noAccept.error!.message} | ${bad.error!.message} | ${noPrep.error!.message}); join_event_waitlist while not full -> "not_full"; 0 rsvps, 0 answers, 0 waiting`;
  });

  // three people register through the real RPC, so the cap of 4 leaves one place
  for (const p of A.slice(0, 3)) await register(p, slug, 'canvas_before', 'usbc');

  await asUser(page, REGU, `/events/${slug}`);
  await ac('1b', 'Register opens the step; Register with nothing names what is missing; Other shows the bring-your-own line', async () => {
    await expect(page.getByTestId('rsvp-button').first()).toBeVisible({ timeout: 60_000 });
    // founder, UAT round 1: "x of y seats left" shows only once 8 or more are registered; this walk's limit is 4 with 3 registered
    await expect(page.getByTestId('places-left')).toHaveCount(0);
    await page.getByTestId('rsvp-button').first().click();
    const dlg = page.getByTestId('registration-questions');
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId('bring-own-mic')).toHaveCount(0);
    await dlg.getByTestId('registration-submit').click();
    await expect(dlg.getByTestId('missing-join')).toHaveText('Choose how you want to join.');
    await shots(page, 'registration', 'missing-all');
    const none = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id).eq('profile_id', REGU.user.user.id);
    expect(none.count, 'tapping Register with nothing seats nobody').toBe(0);
    // the second question depends on the first answer: both branches, and a changed first answer clears the second
    await dlg.getByTestId('join-improve').click();
    await dlg.getByTestId('registration-submit').click();
    await expect(dlg.getByTestId('missing-prep')).toBeVisible();
    await shots(page, 'registration', 'missing-after-first');
    await expect(dlg.getByTestId('prep-question')).toContainText('When will you invest 25 minutes to prepare and create your Clarity Canvas?');
    await dlg.getByTestId('prep-event').click();
    await shots(page, 'registration', 'improve-branch');
    await dlg.getByTestId('join-help').click();
    await expect(dlg.getByTestId('prep-question')).toContainText('When will you invest 10 minutes to prepare?');
    await expect(dlg.getByTestId('prep-home')).not.toBeChecked();
    await expect(dlg.getByTestId('prep-event')).not.toBeChecked();
    await shots(page, 'registration', 'help-branch');
    await dlg.getByTestId('registration-submit').click();
    await expect(dlg.getByTestId('missing-prep')).toHaveText('Choose when you will prepare.');
    await dlg.getByTestId('prep-home').click();
    await dlg.getByText('Other', { exact: true }).click();
    await expect(dlg.getByTestId('bring-own-mic')).toHaveText('Please bring a headset or microphone that fits your phone.');
    await dlg.getByTestId('registration-submit').click();
    await expect(dlg.getByTestId('missing-recording')).toHaveText('Tick the box about table conversations to register.');
    await shots(page, 'registration', 'other-selected');
    return 'step opened; three missing-lines in order; bring-own-mic shown for Other';
  }, page);

  await ac('1f', 'closing the form with answers says "You\'re not registered yet." and keeps the answers', async () => {
    const dlg = page.getByTestId('registration-questions');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText("You're not registered yet.")).toBeVisible({ timeout: 10_000 });
    await shots(page, 'registration', 'closed-not-registered');
    const none = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id).eq('profile_id', REGU.user.user.id);
    expect(none.count, 'closing seats nobody').toBe(0);
    await page.getByTestId('rsvp-button').first().click();
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('join-help')).toBeChecked();
    await expect(dlg.getByTestId('prep-home')).toBeChecked();
    return 'toast "You\'re not registered yet." shown on close, no seat, reopening shows the answers kept (help, at home)';
  }, page);

  await ac('1c', 'accepting and registering gives the seat; the answers are stored; the phone answer is "other"', async () => {
    const dlg = page.getByTestId('registration-questions');
    await dlg.getByTestId('recording-accept').click();
    await dlg.getByRole('textbox').fill('QA hope line');
    await dlg.getByTestId('registration-submit').click();
    await expect(dlg).toHaveCount(0, { timeout: 60_000 });
    const { data: r } = await supabaseAdmin.from('event_rsvps').select('profile_id').eq('event_id', REG.id).eq('profile_id', REGU.user.user.id);
    expect(r).toHaveLength(1);
    const { data: a } = await supabaseAdmin.from('event_registration_answers').select('participation, observer_prep, phone, hope, recording_accepted_at').eq('event_id', REG.id).eq('profile_id', REGU.user.user.id).single();
    expect(a).toMatchObject({ participation: 'observer', observer_prep: 'home', phone: 'other', hope: 'QA hope line' });
    expect(a!.recording_accepted_at).not.toBeNull();
    return JSON.stringify(a);
  }, page);

  await ac('2a', 'at the limit the page offers the waiting list, not a message-the-host line', async () => {
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await setTestSession(p2, A[3].user.email);
    await p2.goto(`/events/${slug}`);
    await expect(p2.getByTestId('rsvp-button').first()).toHaveText('Join the waiting list', { timeout: 60_000 });
    await expect(p2.getByTestId('full-message-host')).toHaveCount(0);
    await expect(p2.getByTestId('places-left')).toHaveCount(0);
    await shots(p2, 'registration', 'event-full');
    // the registered people are 4 (3 + REGU); the server refuses a fifth even by a direct call
    const fifth = await A[3].client.rpc('register_for_event', { p_slug: slug, p_participation: 'observer', p_observer_prep: 'home', p_phone: 'usbc', p_hope: null, p_recording_accepted: true });
    expect(fifth.data, `register_for_event at the limit returned ${JSON.stringify(fifth)}`).toBe('full');
    await ctx.close();
    return 'Join the waiting list shown, no message-the-host line; direct call returned "full" (limit set to 4 for this test: the page logic is by count, 24 is the prod value)';
  });

  await ac('2c', 'waiting list: Join the waiting list opens the form; joining is not a seat; the host sees names in order', async () => {
    const ctx = await browser.newContext();
    const p4 = await ctx.newPage();
    await asUser(p4, A[3], `/events/${slug}`);
    await expect(p4.getByTestId('rsvp-button').first()).toHaveText('Join the waiting list', { timeout: 60_000 });
    await p4.getByTestId('rsvp-button').first().click();
    const dlg = p4.getByTestId('registration-questions');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('heading', { name: 'Join the waiting list' })).toBeVisible();
    await expect(dlg.getByTestId('registration-submit')).toHaveText('Join the waiting list');
    await dlg.getByTestId('join-improve').click();
    await dlg.getByTestId('prep-home').click();
    await dlg.getByTestId('recording-accept').click();
    await dlg.getByText('USB-C', { exact: true }).click();
    await shots(p4, 'waitlist', 'form');
    await dlg.getByTestId('registration-submit').click();
    await expect(p4.getByTestId('waitlist-joined').first()).toContainText("You're on the waiting list", { timeout: 60_000 });
    await shots(p4, 'waitlist', 'joined');
    const row = (await supabaseAdmin.from('event_waitlist').select('participation, phone').eq('event_id', REG.id).eq('profile_id', A[3].user.user.id)).data;
    expect(row).toEqual([{ participation: 'canvas_before', phone: 'usbc' }]);
    const seat = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id);
    expect(seat.count, 'joining the list is not a seat: still 4 registered').toBe(4);
    const mine = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id).eq('profile_id', A[3].user.user.id);
    expect(mine.count).toBe(0);
    const ans = await supabaseAdmin.from('event_registration_answers').select('*', { count: 'exact', head: true }).eq('event_id', REG.id).eq('profile_id', A[3].user.user.id);
    expect(ans.count, 'no registration answers for someone on the list').toBe(0);
    // a second person joins after (the real RPC); the host reads both in the order they joined
    const second = await A[4].client.rpc('join_event_waitlist', { p_slug: slug, p_participation: 'canvas_before', p_phone: 'usbc', p_hope: null, p_recording_accepted: true });
    expect(second.data).toBe('ok');
    const hostCtx = await browser.newContext();
    const hp = await hostCtx.newPage();
    await asUser(hp, host, `/events/${slug}/host`);
    await expect(hp.getByTestId('event-waitlist')).toBeVisible({ timeout: 90_000 });
    const order = await hp.getByTestId('event-waitlist-add').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(order).toEqual([`Add ${A[3].user.name}`, `Add ${A[4].user.name}`]);
    await shots(hp, 'host', 'waiting-list');
    await ctx.close(); await hostCtx.close();
    return `joined (row ${JSON.stringify(row)}), registered stayed 4, host order ${JSON.stringify(order)}`;
  });

  await ac('2b', 'cancelling frees a place: the page shows "1 place left" again', async () => {
    await page.goto(`/events/${slug}`);
    await page.getByRole('button', { name: /Can.t make it/ }).first().click();
    const confirm = page.getByRole('button', { name: "I can't go" });
    await confirm.click();
    await expect.poll(async () => (await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id)).count, { timeout: 60_000 }).toBe(3);
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await setTestSession(p2, A[3].user.email);
    await p2.goto(`/events/${slug}`);
    await expect(p2.getByTestId('rsvp-button').first()).toHaveText('Register', { timeout: 60_000 });
    await expect(p2.getByTestId('places-left')).toHaveCount(0); // 3 registered: below the 8 where the seats line starts
    await shots(p2, 'registration', 'places-left');
    await ctx.close();
    return 'rsvps 4 -> 3; the page offers Register again (no seats-left line below 8 registered)';
  }, page);

  await ac('2d', 'a place opened: the listed person sees Register with their answers filled in, and Leave still works', async () => {
    const ctx = await browser.newContext();
    const p4 = await ctx.newPage();
    await asUser(p4, A[3], `/events/${slug}`);
    await expect(p4.getByTestId('rsvp-button').first()).toHaveText('Register', { timeout: 60_000 });
    await expect(p4.getByTestId('waitlist-leave').first()).toBeVisible();
    await shots(p4, 'waitlist', 'place-opened-register');
    await p4.getByTestId('rsvp-button').first().click();
    const dlg = p4.getByTestId('registration-questions');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('join-improve')).toBeChecked();
    await expect(dlg.getByTestId('prep-home')).toBeChecked();
    await expect(dlg.getByTestId('recording-accept')).toBeChecked();
    await expect(dlg.getByRole('radio', { name: 'USB-C' })).toBeChecked();
    await shots(p4, 'waitlist', 'register-prefilled');
    // close without registering (the answers stay), then Leave the list
    await p4.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await p4.getByTestId('waitlist-leave').first().click();
    await expect.poll(async () => (await supabaseAdmin.from('event_waitlist').select('profile_id').eq('event_id', REG.id)).data?.length ?? -1, { timeout: 30_000 }).toBe(1);
    const hostCtx = await browser.newContext();
    const hp = await hostCtx.newPage();
    await asUser(hp, host, `/events/${slug}/host`);
    await expect(hp.getByTestId('event-waitlist-add')).toHaveCount(1, { timeout: 90_000 });
    const after = await hp.getByTestId('event-waitlist-add').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(after).toEqual([`Add ${A[4].user.name}`]);
    const regs = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', REG.id).eq('profile_id', A[3].user.user.id);
    expect(regs.count, 'seeing Register did not seat them').toBe(0);
    await ctx.close(); await hostCtx.close();
    return `button "Register", Leave visible, form filled (improve, at home, accepted, USB-C); after Leave the host list is ${JSON.stringify(after)}`;
  });

  await ac('1d', 'Clarity Night registers in one tap (no step)', async () => {
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await setTestSession(p2, A[0].user.email);
    await p2.goto(`/events/${CN.slug}`);
    await p2.getByTestId('rsvp-button').first().click();
    await expect(p2.getByTestId('registration-questions')).toHaveCount(0);
    await expect.poll(async () => (await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', CN.id).eq('profile_id', A[0].user.user.id)).count, { timeout: 60_000 }).toBe(1);
    const { count } = await supabaseAdmin.from('event_registration_answers').select('*', { count: 'exact', head: true }).eq('event_id', CN.id);
    expect(count, 'a Clarity Night registration stores no answers').toBe(0);
    await ctx.close();
    return 'one tap -> rsvp exists, no dialog, no answers row';
  });
});



test('AC1 (answers before sign-up): a logged-out person answers, signs in, and is registered from the saved answers on the confirm screen', async ({ browser, baseURL }) => {
  const SU = await makeEvent(ledger, host.user, `P1529 QA signup return ${RUN_TAG()}`, { startsInMs: 2 * 86_400_000 });
  const ctx = await browser.newContext(); // logged out: no session
  const page = await ctx.newPage();
  let signupEvidence: { navs: string[]; confirmSeenAt: number; writes: string[] } = { navs: [], confirmSeenAt: 0, writes: [] };
  const signupT0 = Date.now();
  await page.goto(`/events/${SU.slug}`);
  await ac('1g', 'logged out: the form ends in Continue with the sign-in line; Continue keeps the answers in this browser and goes to sign-in', async () => {
    await expect(page.getByTestId('rsvp-button').first()).toBeVisible({ timeout: 90_000 });
    await page.getByTestId('rsvp-button').first().click();
    const dlg = page.getByTestId('registration-questions');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('registration-submit')).toHaveText('Continue');
    await expect(dlg.getByTestId('sign-in-line')).toHaveText('Next, sign in to confirm your place');
    await dlg.getByTestId('join-help').click();
    await dlg.getByTestId('prep-event').click();
    await dlg.getByTestId('recording-accept').click();
    await dlg.getByText('iPhone', { exact: true }).click();
    await dlg.getByRole('textbox').fill('QA signup hope');
    await shots(page, 'registration', 'signed-out-continue');
    await dlg.getByTestId('registration-submit').click();
    await expect(page).toHaveURL(/\/(signup|login|sign-in)/, { timeout: 60_000 });
    const raw = await page.evaluate((k) => localStorage.getItem(k), `cp:registration-draft:${SU.slug}`);
    expect(raw, 'the answers are kept in this browser').not.toBeNull();
    const draft = JSON.parse(raw!);
    expect(draft).toMatchObject({ intent: 'register', answers: { participation: 'observer', observerPrep: 'doors', phone: 'lightning', hope: 'QA signup hope' } });
    const none = await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', SU.id);
    expect(none.count, 'nothing is registered before sign-in').toBe(0);
    return `URL ${new URL(page.url()).pathname}; draft ${JSON.stringify(draft.answers)}; 0 registrations`;
  }, page);

  await ac('1h', 'signing up (the real confirmation link) registers them from the saved answers and lands on the confirm screen', async () => {
    const email = generateTestEmail();
    const callback = `${baseURL}/auth/callback?source=signup&redirect=${encodeURIComponent(`/events/${SU.slug}`)}&action=rsvp`;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup', email, password: `P1529-${Date.now()}-x!`, options: { redirectTo: callback, data: { name: 'Sue Qasignup' } },
    });
    expect(error, `generateLink: ${error?.message}`).toBeNull();
    ledger.users.push({ user: data!.user!, email, slug: 'sue-qasignup', name: 'Sue Qasignup' }); // deleted by the cleanup
    const writes: string[] = [];
    const navs: string[] = [];
    const t0 = Date.now();
    page.on('response', (r) => { if (r.request().method() === 'POST' && /rest\/v1\/rpc\/register_for_event|rest\/v1\/event_rsvps/.test(r.url())) writes.push(`${r.status()} ${r.url().split('/').pop()}`); });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) { const u = new URL(f.url()); navs.push(`${Math.round((Date.now() - t0) / 1000)}s ${u.pathname}${u.search.slice(0, 30)}`); } });
    // any toast that says "Account created" at any moment on the way (the page's toasts last a few seconds)
    await page.addInitScript(() => {
      new MutationObserver(() => { if (document.body?.innerText.includes('Account created!')) sessionStorage.setItem('__sawAccountCreated', '1'); }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.goto(`/auth/verify?token_hash=${data!.properties!.hashed_token}&type=email&redirect_to=${encodeURIComponent(callback)}`);
    // where the callback sends them: the confirm screen, first, with the screen rendered
    await page.waitForURL(new RegExp(`/events/${SU.slug}/confirm`), { timeout: 90_000 });
    const confirmSeenAt = Math.round((Date.now() - t0) / 1000);
    await page.screenshot({ path: `${SHOTS}/registration-confirm-after-signup-1280.png`, fullPage: true });
    appendFileSync(`${OUT}/shots.jsonl`, JSON.stringify({ file: `${SHOTS}/registration-confirm-after-signup-1280.png`, width: 1280, innerWidth: await page.evaluate(() => window.innerWidth) }) + '\n');
    // and the fact that matters: registered, from the saved answers
    await expect.poll(async () => (await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', SU.id).eq('profile_id', data!.user!.id)).count, { timeout: 90_000 }).toBe(1);
    const { data: a } = await supabaseAdmin.from('event_registration_answers').select('participation, observer_prep, phone, hope').eq('event_id', SU.id).eq('profile_id', data!.user!.id).single();
    expect(a).toEqual({ participation: 'observer', observer_prep: 'doors', phone: 'lightning', hope: 'QA signup hope' });
    expect(writes, 'one registration write, as the person').toEqual(['200 register_for_event']);
    const left0 = await page.evaluate((k) => localStorage.getItem(k), `cp:registration-draft:${SU.slug}`);
    expect(left0, 'the saved copy is cleared once used').toBeNull();
    const firstEvent = navs.find((n) => /\/events\//.test(n)) ?? '';
    expect(firstEvent, `the first event page after the callback is the confirm screen; navigations ${JSON.stringify(navs)}`).toMatch(/\/confirm$/);
    signupEvidence = { navs, confirmSeenAt, writes };
    return `registered from the saved answers ${JSON.stringify(a)}; one write ${JSON.stringify(writes)}; the callback's first destination is /confirm; saved draft cleared`;
  }, page);

  await ac('1i', 'they stay on the confirm screen: no second navigation, and no "Account created! Click Reserve a seat" toast for someone already registered', async () => {
    await page.waitForTimeout(6000);
    const sawToast = await page.evaluate(() => sessionStorage.getItem('__sawAccountCreated') === '1');
    const path = new URL(page.url()).pathname;
    note(`SIGNUP RETURN after ${Math.round((Date.now() - signupT0) / 1000)}s: navigations ${JSON.stringify(signupEvidence.navs)}; final ${path}; "Account created" toast seen: ${sawToast}`);
    expect(path, `still on the confirm screen after 6 s (navigations ${JSON.stringify(signupEvidence.navs)})`).toMatch(/\/confirm$/);
    expect(sawToast, `an already-registered person was told "Account created! Click Reserve a seat to confirm your spot" (navigations ${JSON.stringify(signupEvidence.navs)})`).toBe(false);
    await ctx.close();
    return 'stayed on /confirm, no misleading toast';
  }, page);
});

test('AC-SG (seat guard): an unregistered room member is not seated; the host sees why; the server refuses it by name', async ({ page }) => {
  // everyone who is meant to be seated registers properly (the real RPC); Flo is in the room and is NOT registered
  const { ev: SG } = await eventWithPeople('P1529 QA seat guard', [A[0], A[1]], [O1]);
  const flo = A[5];
  await seedMember(SG.id, flo);
  await asUser(page, host, `/events/${SG.slug}/host`);
  await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 90_000 });
  await ac('sg1', 'the host sees "Not registered for this event. They cannot be seated." on that person', async () => {
    const row = page.getByTestId('mm-person').filter({ hasText: new RegExp(`${first(flo)} Q\\.`) });
    await expect(row.getByTestId('mm-not-registered')).toHaveText('Not registered for this event. They cannot be seated.', { timeout: 60_000 });
    await expect(page.getByTestId('mm-person').filter({ hasText: /Ada Q\./ }).getByTestId('mm-not-registered')).toHaveCount(0);
    await shots(page, 'host', 'not-registered');
    return 'mm-not-registered on Flo only';
  }, page);
  await ac('sg2', 'the server refuses to seat them (by name) on a direct call, and the preview proposes tables without them', async () => {
    const seat = (p: Person, t: number, r: string) => ({ m: p.room.get(SG.id), t, r });
    const refused = await host.client.rpc('host_start_round', {
      p_event_id: SG.id, p_round_no: 1, p_group_size: 3, p_seats: [seat(A[0], 1, 'first'), seat(flo, 1, 'second')],
    });
    expect(refused.error, 'seating an unregistered person must be refused').not.toBeNull();
    expect(refused.error!.message).toMatch(/not registered for this event/i);
    expect(`${refused.error!.details ?? ''}${refused.error!.message}`).toContain(flo.user.name);
    const { count } = await supabaseAdmin.from('event_rounds').select('*', { count: 'exact', head: true }).eq('event_id', SG.id);
    expect(count, 'a refused start leaves no round').toBe(0);
    await openHostPreview(page);
    const names = (await page.getByTestId('host-preview').getByTestId('round-grid-name').allInnerTexts()).join(' ');
    expect(names).not.toContain('Flo');
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-preview')).toHaveCount(0, { timeout: 60_000 });
    const seats = await savedSeats(SG.id);
    expect(seats.find((x) => x.profile_id === flo.user.user.id), 'Flo is not seated').toBeUndefined();
    return `host_start_round -> "${refused.error!.message}" detail "${refused.error!.details}"; no round written; the preview and round 1 seat ${seats.length} people, not Flo`;
  }, page);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// E1: the main session (six with canvases, two without)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
let E1: Awaited<ReturnType<typeof makeEvent>>;
let E1room = '';
let A6second: { name: string; canvasId: string; versionId: string };
let A6firstCanvasId = '';
const hostEvent = (page: Page, ev: { slug: string }) => asUser(page, host, `/events/${ev.slug}/host`);

test('SETUP E1: event, registrations through the real RPC, room members, five canvases shared', async () => {
  E1 = await makeEvent(ledger, host.user, `P1529 QA mastermind session 1 ${RUN_TAG()}`, { startsInMs: 0 });
  E1room = await makeTranscribeRoom(ledger, E1);
  stoppers.push(await keepRoomOpen(ledger, host.user, E1room));
  const phones = ['usbc', 'lightning', 'usbc', 'usbc', 'lightning', 'other'];
  for (const [i, p] of A.entries()) await register(p, E1.slug, 'canvas_before', phones[i]);
  await register(O1, E1.slug, 'observer', 'usbc');
  await register(O2, E1.slug, 'observer', 'usbc');
  for (const p of [...A, O1, O2]) await joinRoom(ledger, p, E1, { transcribeRoom: E1room });
  for (const p of A.slice(0, 5)) expect((await shareForEvent(p, E1.id)).status).toBe('ok');
  A6firstCanvasId = A[5].canvasId!;
  A6second = await publishCanvas(ledger, A[5], 'Flo canvas two');
  A[5].canvasName = undefined; // A[5]'s first canvas name was overwritten by the second publish; keep both ids for the UI test
  note(`E1 ${E1.slug} ready (${E1.id})`);
});

test('AC4d: the gut-feel nudge, step 4 state A and the workspace banner (screenshots at 1280, 375, 320)', async ({ page }) => {
  const F = await makeEvent(ledger, host.user, `P1529 QA step 4 shots ${RUN_TAG()}`, { startsInMs: 2 * 86_400_000 });
  const P = await makeUser(ledger, 'Pia Qatest');
  await register(P, F.slug);
  const prep = async (done: string[]) => {
    await supabaseAdmin.from('event_preparations').delete().eq('event_id', F.id).eq('profile_id', P.user.user.id);
    const r = await supabaseAdmin.from('event_preparations').insert({ event_id: F.id, profile_id: P.user.user.id, started_at: new Date().toISOString(), steps_done: done });
    expect(r.error, 'prep seed').toBeNull();
  };
  await ac('4d-nudge', 'on a position step with no position set, the gut-feel card shows after 6 seconds; "Yes, 2 minutes" starts the countdown', async () => {
    await prep(['story', 'principle']); // resumes on the cmp7 position step
    await asUser(page, P, `/events/${F.slug}/prepare`);
    await expect(page.getByTestId('answered-count')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('gut-nudge')).toHaveCount(0);
    await expect(page.getByTestId('gut-nudge')).toBeVisible({ timeout: 20_000 });
    await shots(page, 'prep', 'gut-nudge');
    await page.getByTestId('gut-nudge-yes').click();
    await expect(page.getByTestId('gut-countdown')).toHaveText(/^\d:\d\d$/);
    await shots(page, 'prep', 'gut-countdown');
    return 'card shown, countdown shown';
  }, page);
  await ac('4d-create', 'step 4 state A: one centred column, Create your canvas, no Skip for now', async () => {
    await prep(['story', 'principle', 'cmp7']);
    await page.goto(`/events/${F.slug}/prepare`);
    await expect(page.getByTestId('prep-canvas-step')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('event-canvas-card')).toHaveAttribute('data-state', 'A');
    await expect(page.getByText('Skip for now')).toHaveCount(0);
    await shots(page, 'prep', 'canvas-create');
    return 'state A';
  }, page);
  await ac('4d-banner', 'the workspace banner: back arrow and "Step N of M" line; it reads the real step', async () => {
    const opened = await P.client.rpc('canvas_draft_open', { p_from_version: null });
    expect(opened.error).toBeNull();
    const d = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,canvas_id').eq('owner_id', P.user.user.id).eq('state', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle()).data!;
    ledger.canvases.push(d.canvas_id as string);
    const pt = await supabaseAdmin.from('points').insert({ statement: `Draft point ${RUN_TAG()}`, first_validator_id: P.user.user.id, visibility: 'private', tags: [], system_tags: ['canvas:segments', `canvas_${d.version_name}`] }).select('id').single();
    ledger.points.push(pt.data!.id as string);
    await supabaseAdmin.from('canvas_draft_points').insert({ draft_id: d.id, point_id: pt.data!.id });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    await page.route('**/functions/v1/canvas-draft', async (route) => { // availability only (the TEST function may not boot); nothing else is stubbed
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.method() === 'POST' && (req.postData() ?? '').includes('"availability"')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
      return route.continue();
    });
    await page.goto(`/events/${F.slug}/prepare`);
    await page.getByRole('button', { name: 'Continue your draft' }).click();
    await expect(page).toHaveURL(/\/p\/.+\/canvas\//, { timeout: 90_000 });
    const banner = page.getByTestId('preparation-banner');
    await expect(banner).toHaveText('Step 4 of 4 · Publish, then share', { timeout: 40_000 });
    await expect(page.getByRole('button', { name: 'Back to preparation' })).toBeVisible();
    await shots(page, 'canvas', 'prep-banner');
    for (const w of [375, 320]) {
      await page.setViewportSize({ width: w, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `banner page scroll width at ${w}`).toBeLessThanOrEqual(w);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    return 'banner shown with the real step';
  }, page);
});

test('AC3 (before round 1): the flow row, Undo, switching back restores selections and overrides; refused with unanswered registrations', async ({ page, browser }) => {
  const F = await makeEvent(ledger, host.user, `P1529 QA flow switch ${RUN_TAG()}`, { series: null, startsInMs: 3_600_000 });
  // F is a Clarity Night event with one registration that never answered the mastermind questions
  const rsvp = await supabaseAdmin.from('event_rsvps').insert({ event_id: F.id, profile_id: A[0].user.user.id });
  expect(rsvp.error).toBeNull();
  await hostEvent(page, F);
  await expect(page.getByTestId('host-panel')).toBeVisible({ timeout: 90_000 });

  await ac('3a', 'a switch refused because of unanswered registrations shows the server\'s own message', async () => {
    await expect(page.getByTestId('host-flow-select')).toHaveValue('clarity-night');
    await page.getByTestId('host-flow-select').selectOption('sales-mastermind');
    const refused = page.getByTestId('host-flow-refused');
    await expect(refused).toBeVisible({ timeout: 30_000 });
    // The server counts "1 registered people"; the page's own line says "1 registered person has" and keeps the rest of the message.
    await expect(refused).toContainText('1 registered person has not answered this flow');
    const { data } = await supabaseAdmin.from('events').select('flow, series_slug').eq('id', F.id).single();
    expect(data!.flow).toBeNull();
    await shots(page, 'host', 'flow-switch-refused');
    return `${(await refused.textContent())?.trim()} ; events.flow stays null`;
  }, page);

  await ac('3b', 'answered registrations: the switch applies at once with Undo; Undo returns to Clarity Night', async () => {
    const a = await supabaseAdmin.from('event_registration_answers').insert({ event_id: F.id, profile_id: A[0].user.user.id, participation: 'canvas_before', phone: 'usbc', recording_accepted_at: new Date().toISOString() });
    expect(a.error).toBeNull();
    await page.reload();
    await expect(page.getByTestId('host-flow-select')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('host-flow-select').selectOption('sales-mastermind');
    await expect(page.getByTestId('host-flow-notice')).toContainText('Event flow is now Sales Mastermind.', { timeout: 30_000 });
    // nobody is in the room yet, so the before-round list (mm-people) is not drawn; the flow select shows the switch
    await expect(page.getByTestId('host-flow-select')).toHaveValue('sales-mastermind');
    const afterSwitch = (await supabaseAdmin.from('events').select('flow').eq('id', F.id).single()).data!.flow;
    expect(afterSwitch).toBe('sales-mastermind');
    await shots(page, 'host', 'flow-switched-undo');
    await page.getByTestId('host-flow-undo').click();
    await expect(page.getByTestId('host-flow-select')).toHaveValue('clarity-night', { timeout: 30_000 });
    await expect(page.getByTestId('mm-people')).toHaveCount(0);
    const afterUndo = (await supabaseAdmin.from('events').select('flow').eq('id', F.id).single()).data!.flow;
    expect(afterUndo).toBe('clarity-night');
    return `flow: null -> ${afterSwitch} -> ${afterUndo}; mastermind panel appeared and disappeared with it`;
  }, page);

  await ac('3c', 'prepare, room and close follow the flow (attendee side) and switching back restores selections and overrides', async () => {
    // selections and overrides exist on F while it is a mastermind: a chosen canvas and an observer override
    const share = await shareForEvent(A[0], F.id, undefined).catch((e) => ({ status: `error ${(e as Error).message}` }));
    note(`F share by A0 (admitted? event_rsvps exists): ${JSON.stringify(share)}`);
    const ov = await supabaseAdmin.from('event_observer_overrides').insert({ event_id: F.id, profile_id: A[0].user.user.id, is_observer: true });
    expect(ov.error).toBeNull();
    const before = {
      canvases: (await supabaseAdmin.from('event_canvases').select('profile_id, canvas_id').eq('event_id', F.id)).data,
      overrides: (await supabaseAdmin.from('event_observer_overrides').select('profile_id, is_observer').eq('event_id', F.id)).data,
    };
    // the attendee's room as a Clarity Night: no "Your Clarity Canvas for this event" card; then as a mastermind: the card
    const ctx = await browser.newContext();
    const ap = await ctx.newPage();
    await setTestSession(ap, A[0].user.email);
    await seedMember(F.id, A[0]);
    await ap.goto(`/events/${F.slug}/meet`);
    await expect(ap.getByTestId('room-steps')).toBeVisible({ timeout: 90_000 });
    const cnSteps = await ap.getByTestId('room-steps').innerText();
    await expect(ap.getByTestId('event-canvas-card')).toHaveCount(0);
    await hostEvent(page, F);
    await page.getByTestId('host-flow-select').selectOption('sales-mastermind');
    await expect(page.getByTestId('host-flow-notice')).toContainText('Sales Mastermind', { timeout: 30_000 });
    await ap.reload();
    await expect(ap.getByTestId('room-steps')).toBeVisible({ timeout: 90_000 });
    const mmSteps = await ap.getByTestId('room-steps').innerText();
    await shots(ap, 'room', 'flow-switched-to-mastermind');
    // and back to Clarity Night, then to the mastermind again: the stored selections are untouched
    await page.getByTestId('host-flow-select').selectOption('clarity-night');
    await expect(page.getByTestId('host-flow-notice')).toContainText('Clarity Night', { timeout: 30_000 });
    await page.getByTestId('host-flow-select').selectOption('sales-mastermind');
    await expect(page.getByTestId('host-flow-notice')).toContainText('Sales Mastermind', { timeout: 30_000 });
    const after = {
      canvases: (await supabaseAdmin.from('event_canvases').select('profile_id, canvas_id').eq('event_id', F.id)).data,
      overrides: (await supabaseAdmin.from('event_observer_overrides').select('profile_id, is_observer').eq('event_id', F.id)).data,
    };
    expect(after).toEqual(before);
    expect(mmSteps, 'the room steps differ between the two flows').not.toEqual(cnSteps);
    await ctx.close();
    return `selections unchanged across CN and back (${before.canvases?.length} canvas rows, ${before.overrides?.length} overrides); room steps CN="${cnSteps.replace(/\s+/g, ' ')}" vs MM="${mmSteps.replace(/\s+/g, ' ')}"`;
  }, page);
});

async function seedMember(eventId: string, p: Person) {
  const { seedRoomMember } = await import('./helpers/p1529-mastermind');
  if (p.room.get(eventId)) return;
  const m = await seedRoomMember(eventId, { displayName: p.user.name, profileId: p.user.user.id, optedIn: true, comprehensionRating: 7 });
  p.room.set(eventId, m.id);
}

test('AC4 + AC5 (before round 1): pick, share as its own tap, no Change from the step; observer line; host flips', async ({ page, browser }) => {
  // A6 has two published canvases and has shared neither: its card offers both
  // founder, UAT round 1: the canvas is step 4 of an OWNER's preparation. The three learning steps are marked done so the
  // preparation resumes on the canvas step (current_step cannot hold 'canvas', so resume falls to the first unfinished step).
  const prepSeed = await supabaseAdmin.from('event_preparations').insert({ event_id: E1.id, profile_id: A[5].user.user.id, started_at: new Date().toISOString(), steps_done: ['story', 'principle', 'cmp7'] });
  expect(prepSeed.error, 'seeding the three learning steps as done').toBeNull();
  await asUser(page, A[5], `/events/${E1.slug}/prepare`);
  const card = page.getByTestId('prep-canvas-step').getByTestId('event-canvas-card');
  await ac('4a', 'a canvas is picked and shared as its own tap; the step then reads "Your Clarity Canvas is shared" with the named canvas and Done', async () => {
    await expect(card).toBeVisible({ timeout: 90_000 });
    // round 2: several published canvases and none shared is state D: a picker, the newest preselected, one primary in the bar
    await expect(card.getByTestId('event-canvas-option')).toHaveCount(2);
    await expect(page.getByTestId('event-canvas-primary')).toContainText('Share with event attendees');
    await expect(page.getByText('Continue without a canvas')).toHaveCount(0);
    await shots(page, 'room', 'canvas-card-pick');
    await shots(page, 'prep', 'canvas-pick');
    const before = (await supabaseAdmin.from('canvas_audience').select('canvas_id').eq('event_id', E1.id).eq('kind', 'event')).data!.length;
    await page.getByTestId('event-canvas-primary').getByRole('button').click();
    await expect(card).toHaveAttribute('data-state', 'E', { timeout: 60_000 });
    await expect(page.getByTestId('event-canvas-secondary')).toHaveCount(0); // no Change from this step any more
    const chosen = (await card.getByTestId('event-canvas-body').innerText()).replace(/\s+/g, ' ');
    expect(chosen).toMatch(/^“.+” is shared with this event\.$/);
    const after = (await supabaseAdmin.from('canvas_audience').select('canvas_id').eq('event_id', E1.id).eq('kind', 'event')).data!.length;
    expect(after, 'one more canvas is shared with the event after the tap').toBe(before + 1);
    await shots(page, 'room', 'canvas-card-chosen');
    await shots(page, 'prep', 'canvas-shared');
    return `"${chosen}" + Done; canvas_audience event rows ${before} -> ${after}`;
  }, page);

  await ac('4b', 'a shared canvas cannot be changed from the step: no Change, no Make a different one; "Done" is the one primary and the shared choice stays', async () => {
    const mine = async () => (await supabaseAdmin.from('event_canvases').select('canvas_id').eq('event_id', E1.id).eq('profile_id', A[5].user.user.id).single()).data!.canvas_id as string;
    const sharedIds = async () => ((await supabaseAdmin.from('canvas_audience').select('canvas_id').eq('event_id', E1.id).eq('kind', 'event').in('canvas_id', [A6firstCanvasId, A6second.canvasId])).data ?? []).map((r) => r.canvas_id as string);
    const first = await mine();
    expect(await sharedIds()).toEqual([first]);
    await expect(card.getByRole('heading')).toHaveText('Your Clarity Canvas is shared');
    await expect(page.getByTestId('event-canvas-primary')).toHaveText('Done');
    await expect(page.getByTestId('event-canvas-secondary')).toHaveCount(0);
    await expect(page.getByTestId('event-canvas-quiet')).toHaveCount(0);
    await expect(page.getByText('Change', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Make a different one')).toHaveCount(0);
    await shots(page, 'prep', 'canvas-shared-done-only');
    expect(await mine(), 'the choice is unchanged').toBe(first);
    expect(await sharedIds(), 'the shared canvas is still the only one shared').toEqual([first]);
    return `Done is the only action; chosen ${first.slice(0, 8)} stays shared`;
  }, page);

  const ctxO = await browser.newContext();
  const po = await ctxO.newPage();
  await ac('5a', 'an observer has no canvas step and is not blocked by preparation (room opens)', async () => {
    // the observer line itself is asserted on the owner's canvas step in 4a; observers never see that step (founder, UAT round 1)
    await asUser(po, O1, `/events/${E1.slug}/meet`);
    await expect(po.getByTestId('room-steps')).toBeVisible({ timeout: 90_000 });
    await expect(po.getByTestId('event-canvas-card')).toHaveCount(0);
    await shots(po, 'room', 'observer-without-canvas');
    return 'the room and its step bar render for an observer; no canvas card in the room';
  }, po);
  await ctxO.close();

  await hostEvent(page, E1);
  await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 90_000 });
  await ac('5b', 'the host flips an observer with a shared canvas to participant; flipping one without is refused with a reason', async () => {
    const row = (p: Person) => page.getByTestId('mm-person').filter({ hasText: new RegExp(`${first(p)} Q\\.`) });
    // A5 (index 4) has a shared canvas: make observer, then back
    const a5 = row(A[4]);
    await expect(a5).toHaveAttribute('data-observer', 'false');
    await a5.getByTestId('mm-set-observer').click();
    await expect(a5).toHaveAttribute('data-observer', 'true', { timeout: 30_000 });
    await a5.getByTestId('mm-set-participant').click();
    await expect(a5).toHaveAttribute('data-observer', 'false', { timeout: 30_000 });
    const ovRes = await supabaseAdmin.from('event_observer_overrides').select('is_observer').eq('event_id', E1.id).eq('profile_id', A[4].user.user.id);
    note(`5b override rows for A5: ${JSON.stringify(ovRes.data)} ${ovRes.error?.message ?? ''}`);
    expect(ovRes.data, 'the participant flip stored an override row').toHaveLength(1);
    const ov = ovRes.data![0];
    expect(ov.is_observer).toBe(false);
    // O1 has no canvas: refused with a reason
    const o1 = row(O1);
    await expect(o1).toHaveAttribute('data-observer', 'true');
    await o1.getByTestId('mm-set-participant').click();
    const refusal = o1.getByTestId('mm-observer-refusal');
    await expect(refusal).toBeVisible({ timeout: 30_000 });
    await expect(refusal).toContainText('has no Clarity Canvas shared with this event yet');
    const o1Ov = (await supabaseAdmin.from('event_observer_overrides').select('*').eq('event_id', E1.id).eq('profile_id', O1.user.user.id)).data!;
    expect(o1Ov, 'a refused flip writes nothing').toHaveLength(0);
    await shots(page, 'host', 'observer-switch-refused');
    return `A5 observer<->participant worked (override is_observer=false stored); O1 refusal: "${(await refusal.textContent())?.trim()}"`;
  }, page);
});


// ── helpers for the walk ─────────────────────────────────────────────────────────────────────────────────────────────
const byProfile = (id: string) => [...A, O1, O2, host].find((p) => p.user.user.id === id)!;
const label = (id: string) => first(byProfile(id));

/** The three recording states on a person's transcription membership: off, on with no words, words arriving. */
async function setRecording(p: Person, ev: { id: string }, room: string, state: 'off' | 'silent' | 'words') {
  const tm = p.tmember.get(ev.id)!;
  const u = await supabaseAdmin.from('transcribe_room_members').update({
    capture_ended_at: state === 'off' ? new Date().toISOString() : null, last_seen_at: new Date().toISOString(),
  }).eq('id', tm).select('id, capture_ended_at, last_seen_at, consent_given_at');
  if (u.error || !u.data?.length) throw new Error(`setRecording update: ${u.error?.message ?? 'no row'}`);
  note(`setRecording ${p.user.name} ${state}: ${JSON.stringify(u.data[0])}`);
  if (state === 'words') {
    const r = await supabaseAdmin.from('transcribe_messages').insert({ room_id: room, member_id: tm, text: 'QA seeded words arriving' });
    if (r.error) throw new Error(`transcribe_messages: ${r.error.message}`);
  }
}

/** tables of a round: { table -> {owner, partner, observers} } as profile ids */
function tablesOf(rows: Awaited<ReturnType<typeof savedSeats>>, roundNo: number) {
  const t = new Map<number, { owner?: string; partner?: string; observers: string[] }>();
  for (const r of rows.filter((x) => x.round_no === roundNo)) {
    const e = t.get(r.table_no) ?? { observers: [] };
    if (r.role === 'first') e.owner = r.profile_id;
    else if (r.role === 'second') e.partner = r.profile_id;
    else e.observers.push(r.profile_id);
    t.set(r.table_no, e);
  }
  return t;
}
const tableLine = (rows: Awaited<ReturnType<typeof savedSeats>>, n: number) =>
  [...tablesOf(rows, n)].map(([no, t]) => `T${no}: ${t.owner ? label(t.owner) : '-'}(owner)+${t.partner ? label(t.partner) : '-'}${t.observers.length ? ` obs ${t.observers.map(label).join('/')}` : ''}`).join(' | ');

test('WALK1 (round 1): host before round 1, the real preview, round 1 starts; the room, the canvas link, the projector', async ({ page, browser }) => {
  await hostEvent(page, E1);
  await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 90_000 });

  await ac('1e', 'the phone answers show on the host\'s marks (USB-C x5, Lightning x2, other x1)', async () => {
    const people = page.getByTestId('host-people');
    await expect(people).toBeVisible();
    const count = async (label: string) => people.locator(`[aria-label="${label}"]`).count();
    await expect.poll(() => count('Needs a USB-C mic'), { timeout: 60_000 }).toBe(5);
    expect(await count('Needs a Lightning mic')).toBe(2);
    expect(await count('Needs a mic: other or unknown connector')).toBe(1);
    await shots(page, 'host', 'before-round-1');
    return 'USB-C 5, Lightning 2, other 1 (aria-labels on the people tiles)';
  }, page);

  await ac('6a', 'the real preview proposes round 1; start it through the host screen', async () => {
    await openHostPreview(page);
    await expect(page.getByTestId('mm-preview-notes')).toBeVisible();
    await shots(page, 'host', 'preview-round-1');
    note(`preview notes: ${(await page.getByTestId('mm-preview-notes').innerText()).replace(/\s+/g, ' ')}`);
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-preview')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 1', { timeout: 60_000 });
    const seats = await savedSeats(E1.id);
    const tables = tablesOf(seats, 1);
    note(`ROUND 1: ${tableLine(seats, 1)}`);
    expect(seats.filter((x) => x.round_no === 1)).toHaveLength(8);
    for (const t of tables.values()) {
      expect(t.owner, 'one owner per table').toBeTruthy();
      expect(t.partner, 'one partner per table').toBeTruthy();
      expect(t.observers.length).toBeLessThanOrEqual(2);
    }
    const owners = [...tables.values()].map((t) => t.owner!);
    for (const o of owners) expect([...A].map((a) => a.user.user.id), 'an owner always has a canvas').toContain(o);
    return `R1 saved: ${tableLine(seats, 1)}`;
  }, page);

  const seats1 = await savedSeats(E1.id);
  const t1 = tablesOf(seats1, 1);
  const [tNo1, tT1] = [...t1].at(-1)!; // the LAST table: a card that ignores the caller's table reads table 1's people here
  const obsEntry = [...t1].reverse().find(([, t]) => t.observers.length > 0)!;
  const ownerP = byProfile(tT1.owner!), partnerP = byProfile(tT1.partner!);
  const obsP = byProfile(obsEntry[1].observers[0]);
  const obsOwnerP = byProfile(obsEntry[1].owner!);
  const obsPartnerP = byProfile(obsEntry[1].partner!);
  const round1 = await roundIdByNo(E1.id, 1);

  const roomAs = async (who: Person) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, who, `/events/${E1.slug}/meet`);
    await waitForRoundCard(pg);
    return { ctx, pg, card: pg.getByTestId('mastermind-round-card') };
  };

  const people = (pg: Page) => pg.getByTestId('round-card-person');
  const peopleText = async (pg: Page) => (await people(pg).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());

  await ac('7a', 'round screen, owner: table, canvas headline, one line per person in role order; no Open; no controls', async () => {
    const { ctx, pg, card } = await roomAs(ownerP);
    await expect(pg.getByTestId('round-card-table')).toHaveText(`Table ${tNo1}`);
    await expect(card).toHaveAttribute('data-role', 'owner');
    const lines = await peopleText(pg);
    expect(lines[0], 'the owner line is first and says You').toBe('You: owner');
    expect(lines[1]).toBe(`${first(partnerP)} Q.: partner`);
    await expect(pg.getByTestId('round-canvas-link')).toHaveCount(0);
    for (const gone of ['round-card-role', 'round-card-with', 'round-card-rule', 'round-canvas-card-toggle']) await expect(pg.getByTestId(gone)).toHaveCount(0);
    // the owner sees the selector only when another canvas is shared with the event; with it, Open still appears only after choosing
    expect(await card.locator('button, input, textarea').count(), 'the owner card has no buttons').toBe(0);
    await expect(pg.getByTestId('round-card-confirm')).toHaveCount(0);
    await shots(pg, 'round', 'owner');
    await ctx.close();
    return `Table, lines ${JSON.stringify(lines)}, no Open, no buttons`;
  });

  await ac('7b', 'round screen, partner: canvas headline, one line per person in role order, Open the canvas; selector lists the other shared canvases', async () => {
    const { ctx, pg, card } = await roomAs(partnerP);
    await expect(card).toHaveAttribute('data-role', 'partner');
    const lines = await peopleText(pg);
    const tableMates = [...t1.get(tNo1)!.observers, t1.get(tNo1)!.owner!].map((id) => `${label(id)} Q.`);
    const others = [...t1].filter(([n]) => n !== tNo1).flatMap(([, t]) => [t.owner!, t.partner!, ...t.observers]).map((id) => `${label(id)} Q.`);
    const joined = lines.join(' | ');
    expect(lines).toContain('You: partner');
    expect(lines).toContain(`${first(ownerP)} Q.: owner`);
    for (const n of tableMates) expect(joined, `table-mates only: ${n}`).toContain(n);
    for (const n of others) expect(joined, `nobody from another table: ${n} (table ${tNo1}, text "${joined}")`).not.toContain(n);
    await expect(pg.getByTestId('round-canvas-link')).toBeVisible({ timeout: 60_000 });
    await expect(pg.getByTestId('round-canvas-link')).toHaveText('Open the canvas');
    await expect(pg.getByTestId('round-canvas-select')).toHaveCount(1); // every other owner has shared a canvas with this event
    await expect(pg.getByTestId('round-canvas-select').locator('option').first()).toContainText(first(ownerP));
    expect(await card.locator('button, input, textarea').count()).toBe(0);
    await shots(pg, 'round', 'partner');
    await ctx.close();
    return `lines ${JSON.stringify(lines)}, "Open the canvas", selector present`;
  });

  await ac('7c', 'round screen, observer: one line per person with You, Open the canvas', async () => {
    const { ctx, pg, card } = await roomAs(obsP);
    await expect(card).toHaveAttribute('data-role', 'observer');
    const lines = await peopleText(pg);
    expect(lines).toContain('You: observer');
    expect(lines).toContain(`${first(obsOwnerP)} Q.: owner`);
    expect(lines).toContain(`${first(obsPartnerP)} Q.: partner`);
    await expect(pg.getByTestId('round-canvas-link')).toBeVisible({ timeout: 60_000 });
    await shots(pg, 'round', 'observer');
    await ctx.close();
    return `lines ${JSON.stringify(lines)}, "Open the canvas"`;
  });

  await ac('7d', 'the partner opens the canvas link: the open is recorded (version, round, owner, reader); on the canvas page the partner sets a position and opens Compare', async () => {
    const { ctx, pg } = await roomAs(obsOwnerP === ownerP ? partnerP : partnerP);
    // the partner of table tNo1: record via the real link
    await pg.getByTestId('round-canvas-link').click();
    await expect(pg).toHaveURL(new RegExp(`/p/${ownerP.user.slug}/canvas/`), { timeout: 60_000 });
    await expect(pg.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    const chosen = (await supabaseAdmin.from('event_canvases').select('canvas_id').eq('event_id', E1.id).eq('profile_id', ownerP.user.user.id).single()).data!;
    const owned = await supabaseAdmin.from('canvases').select('id, name').eq('id', chosen.canvas_id).single();
    const latest = (await supabaseAdmin.from('canvas_versions').select('id, published_seq').eq('canvas_id', owned.data!.id).not('published_seq', 'is', null).order('published_seq', { ascending: false }).limit(1).single()).data!;
    await expect.poll(async () => (await supabaseAdmin.from('event_canvas_opens').select('*').eq('event_id', E1.id).eq('round_id', round1).eq('owner_id', ownerP.user.user.id).eq('reader_id', partnerP.user.user.id)).data?.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
    const open = (await supabaseAdmin.from('event_canvas_opens').select('*').eq('event_id', E1.id).eq('round_id', round1).eq('owner_id', ownerP.user.user.id).eq('reader_id', partnerP.user.user.id)).data![0];
    expect(open.version_id).toBe(latest.id);
    // positions + Compare, on the canvas page, as the partner (the owner has a position the partner can compare against)
    const ver = (await supabaseAdmin.from('canvas_versions').select('name').eq('id', latest.id).single()).data!;
    const pt = (await supabaseAdmin.from('points').select('id').eq('first_validator_id', ownerP.user.user.id).contains('system_tags', ['canvas:problem', `canvas_${ver.name}`]).limit(1).single()).data!;
    await supabaseAdmin.from('point_positions').insert({ point_id: pt.id, user_id: ownerP.user.user.id, position: 'agree' });
    await pg.goto(`/p/${ownerP.user.slug}/canvas/${owned.data!.name}?point=${pt.id}`);
    await expect(pg.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
    const panel = pg.getByTestId('canvas-point-panel');
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await panel.getByRole('button', { name: /^disagree/i }).first().click();
    await expect.poll(async () => (await supabaseAdmin.from('point_positions').select('position').eq('point_id', pt.id).eq('user_id', partnerP.user.user.id).maybeSingle()).data?.position ?? null, { timeout: 30_000 }).toMatch(/disagree/);
    await pg.keyboard.press('Escape');
    await pg.getByLabel('Compare positions with').selectOption({ label: ownerP.user.name });
    await expect(pg.getByTestId('canvas-card-compare').first()).toBeVisible({ timeout: 30_000 });
    await shots(pg, 'canvas', 'partner-compare');
    await ctx.close();
    return `open row: round ${round1.slice(0, 8)}, owner ${first(ownerP)}, reader ${first(partnerP)}, version ${open.version_id.slice(0, 8)} = newest published (seq ${latest.published_seq}); partner position "disagree" stored; Compare card visible`;
  });

  await ac('14', 'projector: round, clock, tables, one rule line; no swap wording', async () => {
    await asUser(page, host, `/events/${E1.slug}/host?view=screen`);
    await expect(page.getByTestId('host-screen')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
    await expect(page.getByTestId('round-clock')).toBeVisible();
    await expect(page.getByTestId('screen-table').first()).toBeVisible();
    expect(await page.getByTestId('screen-table').count()).toBe(t1.size);
    await expect(page.getByTestId('screen-rule-line')).toContainText('Both say a number');
    const text = await page.getByTestId('host-screen').innerText();
    expect(text).not.toMatch(/swap/i);
    await shots(page, 'projector', 'round-1', [1280, 375]);
    return `heading Round 1, round-clock, ${t1.size} tables, rule line "${(await page.getByTestId('screen-rule-line').innerText()).trim()}", no "swap" in ${text.length} chars of screen text`;
  }, page);

  let originalStart = '';
  await ac('hostRec', 'host during a round: three recording states per person, a table with no words stands out', async () => {
    // seeded transcription rows (the real microphone is the founder's half): table 1 words + silent, last table silent only
    const nos = [...t1.keys()].sort((a, b) => a - b);
    const lastNo = nos[nos.length - 1];
    const T = (n: number) => t1.get(n)!;
    await setRecording(byProfile(T(nos[0]).owner!), E1, E1room, 'words');
    await setRecording(byProfile(T(nos[0]).partner!), E1, E1room, 'silent');
    await setRecording(byProfile(T(nos[1]).owner!), E1, E1room, 'words');
    await setRecording(byProfile(T(lastNo).owner!), E1, E1room, 'silent'); // on, no words
    // lastNo's partner stays off. Observers stay off.
    originalStart = (await supabaseAdmin.from('event_rounds').select('started_at').eq('id', round1).single()).data!.started_at as string;
    await backdateRound(round1, 9 * 60_000); // past the silent grace (5 min of talk); restored below
    const rpcState = await host.client.rpc('get_mastermind_host_state', { p_event: E1.id });
    note(`get_mastermind_host_state after seeding: ${JSON.stringify(rpcState.data?.map((r: Record<string, unknown>) => ({ n: label(r.profile_id as string), on: r.recording_on, w: r.last_words_at })))} ${rpcState.error?.message ?? ''}`);
    const roomRow = (await supabaseAdmin.from('transcribe_rooms').select('id, ended_at').eq('id', E1room).single()).data;
    note(`transcribe room: ${JSON.stringify(roomRow)}`);
    await hostEvent(page, E1);
    // founder, UAT round 1: one representation per phase. During a round the tiles carry the recording mark (mm-people is the before-round list).
    await expect(page.getByTestId('host-panel')).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => await page.getByTestId('mark-recording').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')).sort().join(',')), { timeout: 60_000 }).toMatch(/off.*silent.*words|silent.*words/);
    const states = await page.getByTestId('mark-recording').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    expect(states).toContain('words'); expect(states).toContain('silent'); expect(states).toContain('off');
    await expect(page.getByTestId('mm-silent-tables')).toContainText(`table ${lastNo}`, { timeout: 60_000 });
    expect(await page.getByTestId('mark-recording').count(), 'tile marks present').toBeGreaterThan(0);
    await shots(page, 'host', 'during-round-recording-marks');
    return `states ${JSON.stringify(states.reduce((a: Record<string, number>, s) => { a[s!] = (a[s!] ?? 0) + 1; return a; }, {}))}; banner "${(await page.getByTestId('mm-silent-tables').innerText()).trim()}"`;
  }, page);
  if (originalStart) await supabaseAdmin.from('event_rounds').update({ started_at: originalStart }).eq('id', round1);
});


// ── the real model: the edge function the page calls, and what a run cost ────────────────────────────────────────────
async function startRunViaEdge(p: Person, runId: string): Promise<number> {
  const { data } = await p.client.auth.getSession();
  const r = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/canvas-draft`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: process.env.VITE_SUPABASE_ANON_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ run_id: runId }),
  });
  return r.status;
}
async function runsOf(owner: Person) {
  const { data } = await supabaseAdmin.from('canvas_draft_runs').select('id, draft_id, state, error_code, created_at, started_at, finished_at, spend_id').eq('owner_id', owner.user.user.id).order('created_at');
  return data ?? [];
}
async function costOf(runIds: string[]): Promise<number> {
  const { data: runs } = await supabaseAdmin.from('canvas_draft_runs').select('spend_id').in('id', runIds);
  const ids = (runs ?? []).map((r) => r.spend_id as string | null).filter((x): x is string => !!x);
  if (!ids.length) return 0;
  const { data } = await supabaseAdmin.from('mirror_ai_spend').select('actual_usd').in('id', ids);
  return (data ?? []).reduce((sum, r) => sum + Number(r.actual_usd ?? 0), 0);
}
const runIsRoundUpdate = async (runId: string) => {
  const r = await supabaseAdmin.rpc('_canvas_run_is_round_update', { p_run: runId });
  if (r.error) throw new Error(`_canvas_run_is_round_update: ${r.error.message}`);
  return r.data as boolean;
};

let r1Tables: Map<number, { owner?: string; partner?: string; observers: string[] }>;
const walk: { ownerA?: Person; ownerB?: Person; ownerC?: Person; v2: Map<string, string> } = { v2: new Map() };

const ownerOfTable = (n: number) => byProfile(r1Tables.get(n)!.owner!);

test('WALK2: after round 1 (flow and canvas fixed), round 2, round 1 transcripts, "Make my next version" on the real model', async ({ page, browser }) => {
  const seats1 = await savedSeats(E1.id);
  r1Tables = tablesOf(seats1, 1);
  const round1 = await roundIdByNo(E1.id, 1);
  const tNos = [...r1Tables.keys()].sort((a, b) => a - b);

  await hostEvent(page, E1);
  await expect(page.getByTestId('host-panel')).toBeVisible({ timeout: 90_000 }); // round 1 is on: the before-round list (mm-people) is not drawn
  await ac('3d', 'after round 1 starts the flow row is gone and a direct call is refused by the server', async () => {
    await expect(page.getByTestId('host-flow-row')).toHaveCount(0);
    const direct = await host.client.rpc('host_set_event_flow', { p_event: E1.id, p_flow: 'clarity-night' });
    expect(direct.error, 'direct flow switch after round 1').not.toBeNull();
    expect(direct.error!.message).toMatch(/fixed once round 1/);
    const viaUpdate = await host.client.from('events').update({ flow: 'clarity-night' }).eq('id', E1.id);
    const after = (await supabaseAdmin.from('events').select('flow').eq('id', E1.id).single()).data!.flow;
    expect(after, 'a direct UPDATE of events.flow did not stick').not.toBe('clarity-night');
    return `flow row count 0; host_set_event_flow refused: "${direct.error!.message}"; direct events UPDATE: ${viaUpdate.error ? `refused (${viaUpdate.error.message})` : 'no error but flow unchanged'}`;
  }, page);

  await ac('4c', 'after round 1 "Change" is gone for a chosen canvas; a direct swap is refused', async () => {
    // a seated person who is not the owner this round (the owner has no canvas card in a round); prefer A6, who chose through the page
    const owners1 = new Set([...r1Tables.values()].map((t) => t.owner));
    const person = !owners1.has(A[5].user.user.id) ? A[5] : A.find((a) => !owners1.has(a.user.user.id))!;
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, person, `/events/${E1.slug}/meet`);
    await waitForRoundCard(pg);
    // The round card no longer carries the canvas card (the in-room "Change" is gone for everyone): only the server's refusal is checked.
    await expect(pg.getByTestId('event-canvas-change')).toHaveCount(0);
    const mine = (await supabaseAdmin.from('event_canvases').select('canvas_id, canvases(name)').eq('event_id', E1.id).eq('profile_id', A[5].user.user.id).single()).data as unknown as { canvases: { name: string } };
    const other = mine.canvases.name === 'canvas' ? 'canvas_2' : 'canvas';
    const swap = await shareForEvent(A[5], E1.id, other).catch((e) => ({ status: `error:${(e as Error).message}`, code: undefined }));
    expect(swap.status).toBe('refused');
    expect(swap.code).toBe('fixed_after_round_1');
        await ctx.close();
    return `${first(person)}'s round card: no canvas card, event-canvas-change count 0; set_event_canvas("${other}") by A6 (chosen "${mine.canvases.name}") -> {"status":"refused","code":"fixed_after_round_1"}`;
  });

  // ── round 2, through the real host screen ──────────────────────────────────────────────────────────────────────────
  await hostEvent(page, E1);
  await expect(page.getByTestId('host-primary')).toBeVisible({ timeout: 90_000 });
  await pressHostPrimary(page);
  await expect(page.getByTestId('host-round-title')).toHaveText('Round 2', { timeout: 60_000 });
  const tmOf = (id: string) => byProfile(id).tmember.get(E1.id)!;
  const tableMembers = (n: number) => {
    const t = r1Tables.get(n)!;
    return { owner: tmOf(t.owner!), partner: tmOf(t.partner!), observer: t.observers[0] ? tmOf(t.observers[0]) : undefined };
  };
  // Round 1's words are posted right after the cut, before the cleaner's 40 s window (a clean job per table): table a (192 lines),
  // table b (128 lines), and table c has no recording (its job finishes empty).
  const posted: Record<number, number> = {};
  await ac('8a', 'round 1 transcripts posted into the round threads (192 and 128 line rows); one table has no recording', async () => {
    posted[tNos[0]] = await postRoundLines(round1, tNos[0], tableMembers(tNos[0]), fixtureLines(192));
    posted[tNos[1]] = await postRoundLines(round1, tNos[1], tableMembers(tNos[1]), fixtureLines(128));
    await completeJobEmpty(round1, tNos[2]);
    const th = await supabaseAdmin.from('chat_round_threads').select('id, table_no, root_message_id').eq('round_id', round1);
    expect(th.data!.map((t) => t.table_no).sort()).toEqual([tNos[0], tNos[1]].sort());
    const counts = [];
    for (const t of th.data!) {
      const { count } = await supabaseAdmin.from('chat_messages').select('*', { count: 'exact', head: true }).eq('thread_root_id', t.root_message_id).eq('kind', 'message');
      counts.push(`table ${t.table_no}: ${count} line rows`);
    }
    return `post_clean_round reported ${JSON.stringify(posted)}; ${counts.join('; ')}; table ${tNos[2]} has no thread`;
  });

  for (const o of [ownerOfTable(tNos[0]), ownerOfTable(tNos[1]), ownerOfTable(tNos[2])]) {
    const of = await o.client.rpc('get_my_next_version_offer', { p_event: E1.id });
    const up = await o.client.rpc('get_my_update_state', { p_event: E1.id });
    note(`STATE ${first(o)}: offer ${JSON.stringify(of.data)} update ${JSON.stringify(up.data)}`);
  }
  await ac('10a', 'the mastermind round thread is titled "{round label} · {owner}\'s canvas, with {partner}"', async () => {
    const th = (await supabaseAdmin.from('chat_round_threads').select('table_no, root_message_id').eq('round_id', round1)).data!;
    const titles: string[] = [];
    for (const t of th) {
      const root = (await supabaseAdmin.from('chat_messages').select('body').eq('id', t.root_message_id).single()).data!;
      const tt = r1Tables.get(t.table_no)!;
      const want = `Round 1 · ${byProfile(tt.owner!).user.name}'s canvas, with ${byProfile(tt.partner!).user.name}`;
      expect(root.body).toBe(want);
      titles.push(root.body as string);
    }
    return titles.join(' || ');
  });

  const ownerOf = (n: number) => byProfile(r1Tables.get(n)!.owner!);
  walk.ownerA = ownerOf(tNos[0]); walk.ownerB = ownerOf(tNos[1]); walk.ownerC = ownerOf(tNos[2]);
  const roomPage = async (who: Person) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    lastPage = pg;
    pg.on('response', async (r) => { if (/functions\/v1\/canvas-draft/.test(r.url())) note(`canvas-draft ${r.request().method()} ${r.status()} (${first(who)}) ${(await r.text().catch(() => '')).slice(0, 200)}`); });
    pg.on('requestfailed', (r) => { if (/functions\/v1\/canvas-draft/.test(r.url())) note(`canvas-draft REQUEST FAILED (${first(who)}): ${r.failure()?.errorText}`); });
    pg.on('console', (m) => { if (m.type() === 'error' && /canvas|draft|next version|p1529/i.test(m.text())) note(`console.error (${first(who)}): ${m.text().slice(0, 200)}`); });
    await asUser(pg, who, `/events/${E1.slug}/meet`);
    return { ctx, pg };
  };
  const expandTask = async (pg: Page) => {
    const line = pg.getByTestId('mastermind-task-line');
    await expect(line.or(pg.getByTestId('mastermind-task')).first()).toBeVisible({ timeout: 120_000 });
    // does the expanded task stay expanded while the page's own polling runs? (a remount would fold it back to one line)
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (await line.count()) await line.first().click();
      await expect(pg.getByTestId('mastermind-task')).toBeVisible();
      const timeline: string[] = [];
      for (let i = 0; i < 8; i++) { await pg.waitForTimeout(500); timeline.push((await pg.getByTestId('mastermind-task').count()) ? 'open' : 'FOLDED'); }
      note(`expand attempt ${attempt}: task stays open over 4 s? ${timeline.join(',')}`);
      if (!timeline.includes('FOLDED')) return;
    }
  };

  await ac('8x', 'the one-line update task stays open on its FIRST click, over six fresh page loads', async () => {
    const results: string[] = [];
    for (const [i, who] of [walk.ownerA!, walk.ownerB!, walk.ownerA!, walk.ownerB!, walk.ownerA!, walk.ownerB!].entries()) {
      const { ctx, pg } = await roomPage(who);
      const line = pg.getByTestId('mastermind-task-line');
      await expect(line.first()).toBeVisible({ timeout: 120_000 });
      await line.first().click();
      const seen: string[] = [];
      for (let k = 0; k < 6; k++) { await pg.waitForTimeout(500); seen.push((await pg.getByTestId('mastermind-task').count()) ? 'open' : 'FOLDED'); }
      results.push(`${i + 1}:${first(who)}:${seen.includes('FOLDED') ? 'FOLDED' : 'open'}`);
      await ctx.close();
    }
    note(`FIRST-CLICK TRIES ${results.join(' ')}`);
    expect(results.filter((r) => r.endsWith('FOLDED')), `first clicks that folded back: ${results.join(' ')}`).toEqual([]);
    return results.join(' ');
  });

  await ac('8b', 'table without a recording: "No recording from this round" and no button', async () => {
    const { ctx, pg } = await roomPage(walk.ownerC!);
    await expect(pg.getByTestId('mastermind-task-line')).toContainText('No recording from your last round', { timeout: 120_000 });
    await expect(pg.getByTestId('mastermind-make')).toHaveCount(0);
    const offer = await walk.ownerC!.client.rpc('get_my_next_version_offer', { p_event: E1.id });
    expect(offer.data.state).toBe('no_recording');
    await ctx.close();
    return `get_my_next_version_offer -> ${JSON.stringify(offer.data)}; card line "No recording from your last round", 0 Make buttons (the full "No recording from this round" face is shot at the update step)`;
  });

  // ── owner A: tap with the drafting call held (drafting shot), forced failure (failed shot), Try again on the real model ───
  let runTap = '', runRetry = '';
  await ac('8c', 'owner taps Make my next version: copies land in the draft (line rows), the run is queued; screen reads drafting', async () => {
    const { ctx, pg } = await roomPage(walk.ownerA!);
    await pg.route('**/functions/v1/canvas-draft**', (route) => route.fulfill({ status: 202, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ run_id: 'qa-held', kind: 'message' }) })); // answered, never started: the run stays queued
    await expandTask(pg);
    await expect(pg.getByTestId('mastermind-make')).toBeVisible({ timeout: 60_000 });
    await shots(pg, 'update-task', 'make-offer');
    await pg.getByTestId('mastermind-make').click();
    await expect(pg.getByTestId('mastermind-task-drafting')).toBeVisible({ timeout: 90_000 });
    await shots(pg, 'update-task', 'drafting');
    const runs = await runsOf(walk.ownerA!);
    expect(runs).toHaveLength(1);
    expect(runs[0].state).toBe('queued');
    runTap = runs[0].id as string;
    const tap = (await supabaseAdmin.from('event_next_version_taps').select('draft_id').eq('round_id', round1).eq('profile_id', walk.ownerA!.user.user.id).single()).data!;
    await supabaseAdmin.from('chat_messages').select('*', { count: 'exact', head: true }).eq('kind', 'forward').eq('author_id', walk.ownerA!.user.user.id).not('forwarded_from_message_id', 'is', null);
    const draft = (await supabaseAdmin.from('canvas_drafts').select('conversation_id, thread_root_id').eq('id', tap.draft_id).single()).data!;
    const { count: inDraft } = await supabaseAdmin.from('chat_messages').select('*', { count: 'exact', head: true }).eq('conversation_id', draft.conversation_id).eq('thread_root_id', draft.thread_root_id).eq('kind', 'forward');
    note(`MATERIAL: table a round thread has ${posted[tNos[0]]} posted lines; the draft thread holds ${inDraft} forward copies (copied lines)`);
    const trig = (await supabaseAdmin.from('chat_messages').select('body').eq('conversation_id', draft.conversation_id).eq('thread_root_id', draft.thread_root_id).eq('author_id', walk.ownerA!.user.user.id).eq('kind', 'message')).data ?? [];
    expect(trig.map((m) => m.body), 'the trigger message the tap sends').toContain('Update my canvas from what was said in Round 1.');
    expect(await runIsRoundUpdate(runTap), 'the tap\'s run is a round update').toBe(true);
    // keep the page open and held: the screen reads "drafting"; the run starts below
    (walk as Record<string, unknown>).holdCtx = ctx;
    (walk as Record<string, unknown>).holdPage = pg;
    return `run ${runTap.slice(0, 8)} queued; draft thread holds ${inDraft} copies of the round's lines (${posted[tNos[0]]} posted in the round thread); _canvas_run_is_round_update(tap run) = true`;
  });

  await ac('8d', 'a failed run reads "did not work"; Try again keeps the round-update mode (_canvas_run_is_round_update true for the retried run)', async () => {
    const pg = (walk as Record<string, unknown>).holdPage as Page;
    // FORCED: a never-started run of this QA draft is set to failed with a service-role update (no clean way to fail the model call on demand)
    const f = await supabaseAdmin.from('canvas_draft_runs').update({ state: 'failed', error_code: 'QA_FORCED', finished_at: new Date().toISOString() }).eq('id', runTap).eq('state', 'queued').select('id');
    expect(f.data).toHaveLength(1);
    await pg.unroute('**/functions/v1/canvas-draft**');
    await expect(pg.getByTestId('mastermind-task-failed')).toBeVisible({ timeout: 90_000 });
    await shots(pg, 'update-task', 'failed');
    await withModelTerms(walk.ownerA!, async () => {
      const started = pg.waitForResponse((r) => /functions\/v1\/canvas-draft/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
      await pg.getByTestId('mastermind-retry').click();
      await started;
    });
    await expect.poll(async () => (await runsOf(walk.ownerA!)).length, { timeout: 60_000 }).toBe(2);
    const runs = await runsOf(walk.ownerA!);
    runRetry = runs[1].id as string;
    const retryMode = await runIsRoundUpdate(runRetry);
    expect(retryMode, 'the retried run reports round-update mode').toBe(true);
    // a later message by the owner keeps the strict rule: none exists yet, so only the two runs are examined
    return `forced run ${runTap.slice(0, 8)} failed (error_code QA_FORCED); retry run ${runRetry.slice(0, 8)} created by the UI's Try again; _canvas_run_is_round_update(retry) = ${retryMode}`;
  });

  await ac('8e', 'the retried run finishes on the real model: the screen reads ready', async () => {
    const pg = (walk as Record<string, unknown>).holdPage as Page;
    const t0 = Date.now();
    await expect(pg.getByTestId('mastermind-task-ready')).toBeVisible({ timeout: 240_000 });
    const secs = Math.round((Date.now() - t0) / 1000);
    const runs = await runsOf(walk.ownerA!);
    const last = runs[runs.length - 1];
    expect(last.state).toBe('done');
    const cost = await costOf([last.id as string]);
    await shots(pg, 'update-task', 'ready');
    return `retry run state done in about ${secs}s after the retry (page-observed); cost $${cost.toFixed(4)}`;
  });

  // ── owner B: a plain tap on the real model ─────────────────────────────────────────────────────────────────────────
  await ac('8f', 'owner B taps once; the real model drafts; ready', async () => {
    const { ctx, pg } = await roomPage(walk.ownerB!);
    await expandTask(pg);
    await expect(pg.getByTestId('mastermind-make')).toBeVisible({ timeout: 60_000 });
    await withModelTerms(walk.ownerB!, async () => {
      const started = pg.waitForResponse((r) => /functions\/v1\/canvas-draft/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
      await pg.getByTestId('mastermind-make').click();
      await started;
    });
    const t0 = Date.now();
    try {
      await expect(pg.getByTestId('mastermind-task-ready')).toBeVisible({ timeout: 240_000 });
    } catch (e) {
      note(`8f runs: ${JSON.stringify(await runsOf(walk.ownerB!))} note=${await pg.getByTestId('mastermind-task-note').allInnerTexts()}`);
      throw e;
    }
    const runs = await runsOf(walk.ownerB!);
    expect(runs.at(-1)!.state).toBe('done');
    expect(await runIsRoundUpdate(runs.at(-1)!.id as string)).toBe(true);
    // the round mode is live on the server (not only flagged in the database): the draft carries the partner's reasoning, writes no
    // partner price, and tells no "best guess" line (P1625's path is bypassed in round mode)
    const tapDraft = (await supabaseAdmin.from('event_next_version_taps').select('draft_id').eq('profile_id', walk.ownerB!.user.user.id).order('created_at', { ascending: false }).limit(1).single()).data!;
    const dp = (await supabaseAdmin.from('canvas_draft_points').select('points(statement)').eq('draft_id', tapDraft.draft_id)).data ?? [];
    const statements = dp.map((r) => ((r as unknown as { points: { statement: string } | null }).points?.statement ?? '')).filter(Boolean);
    const joined = statements.join(' || ');
    const dr = (await supabaseAdmin.from('canvas_drafts').select('conversation_id, thread_root_id').eq('id', tapDraft.draft_id).single()).data!;
    const replies = ((await supabaseAdmin.from('chat_messages').select('body, kind').eq('conversation_id', dr.conversation_id).eq('thread_root_id', dr.thread_root_id).neq('kind', 'forward')).data ?? []).map((m) => m.body ?? '');
    const guessed = replies.filter((b) => /from your words "/.test(b));
    note(`ROUND-MODE CHECK draft points: ${joined.slice(0, 900)}`);
    note(`ROUND-MODE CHECK reply lines: ${replies.map((b) => b.slice(0, 200)).join(' || ')}`);
    expect(joined, 'the partner\'s reasoning reached the draft (tickets, support, nice-to-have)').toMatch(/ticket|support|nice-to-have|reduc/i);
    expect(joined, 'no partner price written').not.toMatch(/5,?000|6,?000|five thousand|six thousand/i);
    expect(guessed, 'no "best guess" line in a round draft').toEqual([]);
    const cost = await costOf([runs.at(-1)!.id as string]);
    expect(cost).toBeLessThan(0.5);
    (walk as Record<string, unknown>).bCtx = ctx;
    return `done in about ${Math.round((Date.now() - t0) / 1000)}s; cost $${cost.toFixed(4)}; round-update mode true`;
  });
});


import { execFileSync } from 'node:child_process';

test('WALK3: the canvas-update step, publishing, rounds 3 and 4, the next partner opens the published version', async ({ page, browser }) => {
  const round2 = await roundIdByNo(E1.id, 2);
  const seats2 = await savedSeats(E1.id);
  const r2Tables = tablesOf(seats2, 2);
  const r2Nos = [...r2Tables.keys()].sort((a, b) => a - b);
  note(`ROUND 2: ${tableLine(seats2, 2)}`);
  const ownerP = byProfile(r2Tables.get(r2Nos[0])!.owner!), ownerR = byProfile(r2Tables.get(r2Nos[2])!.owner!);

  await hostEvent(page, E1);
  await expect(page.getByTestId('host-panel')).toBeVisible({ timeout: 90_000 }); // rounds are on: the before-round list (mm-people) is not drawn

  await ac('9a0', 'the host\'s one primary during round 2 is "End round 2" (asks once while time is on the clock); it ends only that round and the phones read "between rounds"', async () => {
    await expect(page.getByTestId('host-primary')).toHaveText('End round 2', { timeout: 60_000 });
    await expect(page.getByTestId('mm-update-start'), 'the update is not offered while the round runs').toHaveCount(0);
    await page.getByTestId('host-primary').click();
    const yes = page.getByTestId('host-next-yes');
    if (await yes.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await yes.click();
    await expect.poll(async () => (await supabaseAdmin.from('event_rounds').select('ended_at').eq('id', round2).single()).data!.ended_at, { timeout: 30_000 }).not.toBeNull();
    expect((await supabaseAdmin.from('event_evening_ends').select('*', { count: 'exact', head: true }).eq('event_id', E1.id)).count, 'not the evening').toBe(0);
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, ownerP, `/events/${E1.slug}/meet`);
    await expect(pg.getByTestId('mastermind-between')).toContainText('Round 2 is over', { timeout: 60_000 });
    await expect(pg.getByTestId('mastermind-between')).toContainText('The next round starts soon.');
    await expect(pg.getByText('The rounds are over')).toHaveCount(0);
    await expect(pg.getByTestId('room-step-close'), 'Feedback is open at any time').toBeEnabled();
    await ctx.close();
    return 'round 2 ended_at set by End round 2, no evening stamp; the owner\'s phone: "Round 2 is over" + "The next round starts soon.", no "The rounds are over", Feedback step enabled';
  }, page);

  await ac('9a', 'the host starts the canvas-update step (round 2 has ended, nothing to confirm); it shows each owner\'s state', async () => {
    await expect(page.getByTestId('mm-update-start')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('mm-update-start').click();
    await expect(page.getByTestId('mm-update-confirm')).toHaveCount(0);
    await expect(page.getByTestId('mm-update-step')).toBeVisible({ timeout: 60_000 });
    const step = (await supabaseAdmin.from('event_canvas_update_steps').select('after_round_id').eq('event_id', E1.id).single()).data!;
    expect(step.after_round_id).toBe(round2);
    const ended = (await supabaseAdmin.from('event_rounds').select('ended_at').eq('id', round2).single()).data!;
    expect(ended.ended_at, 'round 2 was ended by End round 2').not.toBeNull();
    return `step row after_round = round 2, round 2 ended_at set`;
  }, page);

  // round 2's words (a clean job per table, made when the step ended it)
  await ac('8g', 'round 2 transcripts posted (128 lines at two tables; the third table has no recording)', async () => {
    const m = (n: number) => { const t = r2Tables.get(n)!; return { owner: byProfile(t.owner!).tmember.get(E1.id)!, partner: byProfile(t.partner!).tmember.get(E1.id)!, observer: t.observers[0] ? byProfile(t.observers[0]).tmember.get(E1.id)! : undefined }; };
    const a = await postRoundLines(round2, r2Nos[0], m(r2Nos[0]), fixtureLines(128));
    const b = await postRoundLines(round2, r2Nos[1], m(r2Nos[1]), fixtureLines(128));
    await completeJobEmpty(round2, r2Nos[2]);
    return `posted ${a} and ${b}; table ${r2Nos[2]} empty`;
  });

  await ac('9b', 'host during the update step: each owner\'s state (A, B ready; others not tapped)', async () => {
    await page.reload();
    await expect(page.getByTestId('mm-update-step')).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => await page.getByTestId('mm-update-owner').evaluateAll((els) => els.length), { timeout: 60_000 }).toBe(6);
    const states = async () => Object.fromEntries(await page.getByTestId('mm-update-owner').evaluateAll((els) => els.map((e) => [e.textContent?.split(/Not tapped|Drafting|Ready|Failed|Published/)[0], e.getAttribute('data-state')])));
    await expect.poll(async () => JSON.stringify(await states())).toContain('ready');
    const st = await states();
    note(`update states ${JSON.stringify(st)}`);
    await shots(page, 'host', 'update-step');
    return JSON.stringify(st);
  }, page);

  // Owner A and B publish "as it is" (their drafts are ready); the room shows the full task now that nobody is seated
  for (const [i, who] of [walk.ownerA!, walk.ownerB!].entries()) {
    await ac(`8h${i}`, `${first(who)} publishes the draft as it is at the canvas-update step`, async () => {
      const ctx = await browser.newContext();
      const pg = await ctx.newPage();
      await asUser(pg, who, `/events/${E1.slug}/meet`);
      await expect(pg.getByTestId('mastermind-task')).toBeVisible({ timeout: 120_000 });
      await expect(pg.getByTestId('mastermind-task-ready')).toBeVisible({ timeout: 60_000 });
      await expect(pg.getByTestId('mastermind-publish')).toBeVisible();
      if (i === 0) await shots(pg, 'update-task', 'ready-at-step');
      // the canvas CHOSEN for this event (a person may own other canvases: Flo has two)
      const chosenCanvas = (await supabaseAdmin.from('event_canvases').select('canvas_id').eq('event_id', E1.id).eq('profile_id', who.user.user.id).single()).data!.canvas_id as string;
      const before = (await supabaseAdmin.from('canvas_versions').select('id, published_seq').eq('canvas_id', chosenCanvas).not('published_seq', 'is', null)).data!.length;
      await pg.getByTestId('mastermind-publish').click();
      await expect(pg.getByTestId('mastermind-task-published')).toBeVisible({ timeout: 90_000 });
      const vs = (await supabaseAdmin.from('canvas_versions').select('id, published_seq').eq('canvas_id', chosenCanvas).not('published_seq', 'is', null).order('published_seq', { ascending: false })).data!;
      expect(vs.length, 'one more published version').toBe(before + 1);
      walk.v2.set(who.user.user.id, vs[0].id as string);
      if (i === 0) await shots(pg, 'update-task', 'published');
      await ctx.close();
      return `published versions ${before} -> ${vs.length}; newest published_seq ${vs[0].published_seq} (${(vs[0].id as string).slice(0, 8)})`;
    });
  }

  // the table with no recording, as the owner sees it at the step (the full face)
  await ac('8i', 'update step, owner whose table had no recording: "No recording from this round", no button', async () => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, ownerR, `/events/${E1.slug}/meet`);
    await expect(pg.getByTestId('mastermind-task-no-recording')).toHaveText('No recording from this round', { timeout: 120_000 });
    await expect(pg.getByTestId('mastermind-make')).toHaveCount(0);
    await shots(pg, 'update-task', 'no-recording');
    await ctx.close();
    return 'full face reads "No recording from this round", 0 Make buttons';
  });

  // owner P taps and is left DRAFTING (the start call is held); owner Q never taps: the host starts round 3 anyway (AC9)
  const holdCtx = await browser.newContext();
  const holdPg = await holdCtx.newPage();
  await ac('9c', 'one owner is drafting and one has not tapped; the host starts round 3 anyway', async () => {
    await holdPg.route('**/functions/v1/canvas-draft**', (route) => route.fulfill({ status: 202, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ run_id: 'qa-held', kind: 'message' }) }));
    await asUser(holdPg, ownerP, `/events/${E1.slug}/meet`);
    await expect(holdPg.getByTestId('mastermind-make')).toBeVisible({ timeout: 120_000 });
    await holdPg.getByTestId('mastermind-make').click();
    await expect(holdPg.getByTestId('mastermind-task-drafting')).toBeVisible({ timeout: 90_000 });
    await shots(holdPg, 'update-task', 'drafting-at-step');
    await page.reload();
    await expect.poll(async () => await page.locator('[data-testid=mm-update-owner][data-state=drafting]').count(), { timeout: 60_000 }).toBe(1);
    expect(await page.locator('[data-testid=mm-update-owner][data-state=published]').count()).toBe(2);
    await shots(page, 'host', 'update-step-mixed');
    const states = await page.getByTestId('mm-update-owner').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    await pressHostPrimary(page);
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 3', { timeout: 60_000 });
    const seats = await savedSeats(E1.id);
    note(`ROUND 3: ${tableLine(seats, 3)}`);
    return `states at the moment of starting round 3: ${JSON.stringify(states)}; round 3 started (${tableLine(seats, 3)})`;
  }, page);

  // Round 3 is running. The partner of an owner who owns in round 3 opens the published version.
  const roomAs = async (who: Person) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, who, `/events/${E1.slug}/meet`);
    await waitForRoundCard(pg);
    return { ctx, pg };
  };
  const checkNextPartner = async (roundNo: number) => {
    const seats = await savedSeats(E1.id);
    const tables = tablesOf(seats, roundNo);
    const rid = await roundIdByNo(E1.id, roundNo);
    const out: string[] = [];
    for (const owner of [walk.ownerA!, walk.ownerB!]) {
      const entry = [...tables.values()].find((t) => t.owner === owner.user.user.id);
      if (!entry) continue;
      const partner = byProfile(entry.partner!);
      const { ctx, pg } = await roomAs(partner);
      await pg.getByTestId('round-canvas-link').click();
      await expect(pg).toHaveURL(new RegExp(`/p/${owner.user.slug}/canvas/`), { timeout: 60_000 });
      await expect.poll(async () => (await supabaseAdmin.from('event_canvas_opens').select('version_id').eq('event_id', E1.id).eq('round_id', rid).eq('owner_id', owner.user.user.id).eq('reader_id', partner.user.user.id)).data?.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
      const open = (await supabaseAdmin.from('event_canvas_opens').select('version_id').eq('event_id', E1.id).eq('round_id', rid).eq('owner_id', owner.user.user.id).eq('reader_id', partner.user.user.id)).data![0];
      const seq = (await supabaseAdmin.from('canvas_versions').select('published_seq').eq('id', open.version_id).single()).data!.published_seq;
      expect(open.version_id, `${first(partner)} opened ${first(owner)}'s published version`).toBe(walk.v2.get(owner.user.user.id));
      expect(seq).toBe(2);
      out.push(`round ${roundNo}: ${first(partner)} opened ${first(owner)}'s canvas, recorded version_id = the published v2 (published_seq ${seq})`);
      await ctx.close();
    }
    return out;
  };
  const nextPartnerEvidence: string[] = [];
  await ac('8j', 'the owner\'s next partner opens the published version (round 3, then round 4 for the owners who own there)', async () => {
    nextPartnerEvidence.push(...await checkNextPartner(3));
    return nextPartnerEvidence.join(' ; ') || 'neither of A and B owns in round 3';
  });

  // let P's held run go on the real model now, so no run is left dangling
  await holdCtx.close();
  const pRuns = await runsOf(ownerP);
  if (pRuns.length) note(`P's queued run ${pRuns.at(-1)!.id} state ${pRuns.at(-1)!.state}: starting via the edge function so it does not dangle -> ${await withModelTerms(ownerP, () => startRunViaEdge(ownerP, pRuns.at(-1)!.id as string))}`);

  // round 4
  await hostEvent(page, E1);
  await expect(page.getByTestId('host-primary')).toBeVisible({ timeout: 90_000 });
  await pressHostPrimary(page);
  await expect(page.getByTestId('host-round-title')).toHaveText('Round 4', { timeout: 60_000 });
  note(`ROUND 4: ${tableLine(await savedSeats(E1.id), 4)}`);
  await ac('8k', 'round 4: the owners who own here have their next partner open the published version', async () => {
    const ev = await checkNextPartner(4);
    nextPartnerEvidence.push(...ev);
    expect(nextPartnerEvidence.length, 'A and B each own once in rounds 3-4: two recorded opens of v2 in total').toBe(2);
    return ev.join(' ; ');
  });

  await ac('6b', 'six with canvases, two observers, four rounds: one owner and one partner per table, nobody repeats a partner, everyone owns once in rounds 1-2 and once in 3-4', async () => {
    const seats = await savedSeats(E1.id);
    const holders = A.map((a) => a.user.user.id);
    const met = new Set<string>();
    const ownedFirst = new Map<string, number>(), ownedSecond = new Map<string, number>();
    const lines: string[] = [];
    for (let n = 1; n <= 4; n++) {
      const tables = tablesOf(seats, n);
      lines.push(`R${n}: ${tableLine(seats, n)}`);
      expect(seats.filter((x) => x.round_no === n)).toHaveLength(8);
      for (const [no, t] of tables) {
        expect(t.owner, `round ${n} table ${no}: one owner`).toBeTruthy();
        expect(t.partner, `round ${n} table ${no}: one partner`).toBeTruthy();
        expect(holders, 'an owner holds a canvas').toContain(t.owner);
        const k = [t.owner!, t.partner!].sort().join('|');
        expect(met.has(k), `round ${n}: ${label(t.owner!)} and ${label(t.partner!)} have already been partners`).toBe(false);
        met.add(k);
        const m = n <= 2 ? ownedFirst : ownedSecond;
        m.set(t.owner!, (m.get(t.owner!) ?? 0) + 1);
      }
    }
    for (const h of holders) {
      expect(ownedFirst.get(h), `${label(h)} owns once in rounds 1-2`).toBe(1);
      expect(ownedSecond.get(h), `${label(h)} owns once in rounds 3-4`).toBe(1);
    }
    return lines.join(' || ');
  });

  await ac('15', 'scripts/event-mastermind-results.sh prints per-owner opens and stance counts on this seeded session', async () => {
    const out = execFileSync('bash', ['scripts/event-mastermind-results.sh', E1.slug, '--env', 'test'], { encoding: 'utf8', timeout: 300_000, cwd: process.cwd() });
    writeFileSync(`${OUT}/results-script-output.txt`, out);
    expect(out).toMatch(/6 Clarity Canvas owners/);
    expect(out).toMatch(/opened v\d/);
    return `\n${out}`;
  });
});


// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// E5: five with canvases; E11: a first canvas after round 1; S2: a session linked to session 1; CN: Clarity Night as before
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function eventWithPeople(title: string, holders: Person[], observers: Person[], extra: { previous?: string } = {}) {
  const ev = await makeEvent(ledger, host.user, `${title} ${RUN_TAG()}`, { startsInMs: 0, previous: extra.previous });
  const room = await makeTranscribeRoom(ledger, ev);
  stoppers.push(await keepRoomOpen(ledger, host.user, room));
  for (const p of holders) await register(p, ev.slug, 'canvas_before', 'usbc');
  for (const p of observers) await register(p, ev.slug, 'observer', 'usbc');
  for (const p of [...holders, ...observers]) await joinRoom(ledger, p, ev, { transcribeRoom: room });
  for (const p of holders) expect((await shareForEvent(p, ev.id, 'canvas')).status).toBe('ok');
  return { ev, room };
}

test('AC6 (five with canvases): one observes each round, rotated; the preview names who owns only once; the room before round 1 waits', async ({ page, browser }) => {
  const { ev: E5 } = await eventWithPeople('P1529 QA five canvases', A.slice(0, 5), [O1, O2]);

  await ac('wait', 'before round 1 an attendee\'s room says the round starts soon (waiting card)', async () => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, A[0], `/events/${E5.slug}/meet`);
    await expect(pg.getByTestId('mastermind-waiting')).toContainText('Round 1 starts soon', { timeout: 120_000 });
    await shots(pg, 'room', 'waiting');
    await ctx.close();
    return 'mastermind-waiting reads "Round 1 starts soon"';
  });

  await asUser(page, host, `/events/${E5.slug}/host`);
  await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 90_000 });
  let preview1 = '';
  await ac('6c', 'the round 1 preview with five canvases names who owns only once', async () => {
    await openHostPreview(page);
    const unmet = page.getByTestId('mm-unmet');
    await expect(unmet.first()).toBeVisible({ timeout: 30_000 });
    preview1 = (await page.getByTestId('mm-preview-notes').innerText()).replace(/\s+/g, ' ');
    const rules = await unmet.evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')));
    expect(rules).toContain('owns-once');
    await shots(page, 'host', 'preview-unmet-rules');
    return `preview names: ${preview1}`;
  }, page);
  await page.getByTestId('host-preview-start').click();
  await expect(page.getByTestId('host-preview')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('host-round-title')).toHaveText('Round 1', { timeout: 60_000 });
  for (const n of [2, 3, 4]) {
    await pressHostPrimary(page);
    await expect(page.getByTestId('host-round-title')).toHaveText(`Round ${n}`, { timeout: 60_000 });
  }
  await ac('6d', 'five with canvases, four rounds: one canvas holder observes each round and nobody observes twice; no partner repeats; owners per round are two tables', async () => {
    const seats = await savedSeats(E5.id);
    const holders = new Set(A.slice(0, 5).map((a) => a.user.user.id));
    const observers: string[] = [];
    const met = new Set<string>();
    const lines: string[] = [];
    for (let n = 1; n <= 4; n++) {
      const rs = seats.filter((x) => x.round_no === n);
      const holderObs = rs.filter((x) => x.role === 'observer' && holders.has(x.profile_id));
      expect(holderObs, `round ${n}: exactly one canvas holder observes`).toHaveLength(1);
      observers.push(holderObs[0].profile_id);
      const tables = tablesOf(seats, n);
      for (const t of tables.values()) {
        expect(t.owner && t.partner).toBeTruthy();
        const k = [t.owner!, t.partner!].sort().join('|');
        expect(met.has(k), `round ${n}: repeated partner ${label(t.owner!)}/${label(t.partner!)}`).toBe(false);
        met.add(k);
      }
      lines.push(`R${n}: ${tableLine(seats, n)} | holder observing: ${label(holderObs[0].profile_id)}`);
    }
    expect(new Set(observers).size, 'nobody observes twice').toBe(4);
    const ownedCount = new Map<string, number>();
    for (const r of seats.filter((x) => x.role === 'first')) ownedCount.set(r.profile_id, (ownedCount.get(r.profile_id) ?? 0) + 1);
    const once = [...holders].filter((h) => (ownedCount.get(h) ?? 0) === 1).map(label);
    return `${lines.join(' || ')} || owns exactly once: ${once.join(', ') || 'nobody'}; owner counts ${JSON.stringify([...holders].map((h) => `${label(h)}:${ownedCount.get(h) ?? 0}`))}`;
  });
});

test('AC11 (a first canvas after round 1): the ready line, the host\'s ready mark, seated as owner at the next round; a chosen canvas cannot be swapped', async ({ page, browser }) => {
  const { ev: E11 } = await eventWithPeople('P1529 QA late canvas', [A[0], A[1]], [O1, O2]);
  await asUser(page, host, `/events/${E11.slug}/host`);
  await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 90_000 });
  await pressHostPrimary(page);
  await expect(page.getByTestId('host-round-title')).toHaveText('Round 1', { timeout: 60_000 });
  const seats1 = await savedSeats(E11.id);
  note(`E11 ROUND 1: ${tableLine(seats1, 1)}`);

  const pub = await publishCanvas(ledger, O1, 'Gus first canvas');
  await ac('11a', 'after round 1 started: the first canvas is shared (through the RPC; the round card has no canvas card now)', async () => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, O1, `/events/${E11.slug}/meet`);
    await waitForRoundCard(pg);
    await expect(pg.getByTestId('event-canvas-card')).toHaveCount(0);
    expect((await shareForEvent(O1, E11.id, pub.name)).status).toBe('ok');
    await ctx.close();
    return `chosen canvas "${pub.name}" shared after round 1 through set_event_canvas; no canvas card on the round card`;
  });

  await ac('11b', 'the host sees the ready mark on that person', async () => {
    await page.reload();
    await expect(page.getByTestId('host-panel')).toBeVisible({ timeout: 90_000 }); // round 1 is on: the person is listed under "Not at a table"
    // Gus sits at table 1 as an observer, so the mark is on his tile (the mastermind's list rows exist only before round 1 and for people not at a table)
    await expect(page.getByTestId('mm-ready')).toHaveCount(1, { timeout: 60_000 });
    const owner = await page.getByTestId('mm-ready').evaluate((el) => { let n: HTMLElement | null = el as HTMLElement; while (n && !/\b(AQ|BQ|GQ|IQ|Gus)\b/.test(n.innerText)) n = n.parentElement; return n?.innerText ?? ''; });
    expect(owner).toContain('Gus');
    expect(owner).not.toContain('Ada');
    await shots(page, 'host', 'ready-mark');
    return 'mm-ready mark on Gus\'s tile';
  }, page);

  await ac('11c', 'the host adds them at the next round: seated as a Clarity Canvas owner', async () => {
    await openHostPreview(page);
    const tiles = page.getByTestId('host-preview').getByTestId('round-grid-name');
    const names = await tiles.allInnerTexts();
    note(`E11 round 2 proposal (tile order): ${names.map((n) => n.replace(/\s+/g, ' ')).join(' | ')}`);
    let swapped = false;
    if (!/Gus/.test(names[0])) {
      // the proposal keeps O1 out of the owner seat (two others also still owe an owning round): the host swaps O1 in
      await tiles.filter({ hasText: 'Gus' }).first().click();
      await tiles.first().click();
      swapped = true;
    }
    await shots(page, 'host', 'preview-late-owner');
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-preview')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 2', { timeout: 60_000 });
    const seats = await savedSeats(E11.id);
    const o1 = seats.find((x) => x.round_no === 2 && x.profile_id === O1.user.user.id)!;
    expect(o1.role, `O1 role in round 2: ${tableLine(seats, 2)}`).toBe('first');
    return `round 2: ${tableLine(seats, 2)}; proposal ${swapped ? 'did NOT seat Gus as owner by itself, the host swapped him in' : 'seated Gus as owner'}`;
  }, page);

  await ac('11d', 'swapping an already-chosen canvas after round 1 is refused (second canvas offered to A1)', async () => {
    const second = await publishCanvas(ledger, A[0], 'Ada canvas two');
    const r = await shareForEvent(A[0], E11.id, second.name);
    expect(r).toMatchObject({ status: 'refused', code: 'fixed_after_round_1' });
    return `set_event_canvas("${second.name}") -> ${JSON.stringify(r)}`;
  });
});

test('AC12 (session 2): linked to session 1, the preview avoids session-1 partners and names each repeat', async ({ page }) => {
  const e1pairs = new Set<string>();
  const e1seats = await savedSeats(E1.id);
  for (let n = 1; n <= 4; n++) for (const t of tablesOf(e1seats, n).values()) e1pairs.add([t.owner!, t.partner!].sort().join('|'));
  const { ev: S2 } = await eventWithPeople('P1529 QA session two', A, [O1, O2], { previous: E1.id });
  const linked = (await supabaseAdmin.from('events').select('previous_session_event_id').eq('id', S2.id).single()).data!;
  expect(linked.previous_session_event_id).toBe(E1.id);
  await asUser(page, host, `/events/${S2.slug}/host`);
  await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 90_000 });
  await ac('12a', 'the round 1 preview of session 2 avoids session-1 partners where it can, and names every repeat it keeps', async () => {
    await expect(page.getByTestId('mm-people')).toBeVisible({ timeout: 60_000 });
    await openHostPreview(page);
    const notes = (await page.getByTestId('mm-preview-notes').innerText()).replace(/\s+/g, ' ');
    await shots(page, 'host', 'preview-session-2');
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-preview')).toHaveCount(0, { timeout: 60_000 });
    const seats = await savedSeats(S2.id);
    const pairs = [...tablesOf(seats, 1).values()].map((t) => [t.owner!, t.partner!]);
    const repeats = pairs.filter(([a, b]) => e1pairs.has([a, b].sort().join('|')));
    for (const [a, b] of repeats) {
      expect(notes, `a session-1 partner pair must be named: ${label(a)} / ${label(b)}`).toMatch(new RegExp(`${label(a)} Q\\. and ${label(b)} Q\\.|${label(b)} Q\\. and ${label(a)} Q\\.`));
    }
    return `session 1 pairs: ${e1pairs.size}; session 2 round 1: ${tableLine(seats, 1)}; repeats kept: ${repeats.length} (${repeats.map(([a, b]) => `${label(a)}/${label(b)}`).join(', ') || 'none'}); preview text: ${notes}`;
  }, page);
});

test('AC13: a Clarity Night event opens as before (room, host screen with half-time swap, projector, round title)', async ({ page, browser }) => {
  const CN = await makeEvent(ledger, host.user, `P1529 QA clarity night as before ${RUN_TAG()}`, { series: null, startsInMs: 0 });
  const room = await makeTranscribeRoom(ledger, CN);
  stoppers.push(await keepRoomOpen(ledger, host.user, room));
  const people = A.slice(0, 4);
  for (const p of people) { await supabaseAdmin.from('event_rsvps').insert({ event_id: CN.id, profile_id: p.user.user.id }); await joinRoom(ledger, p, CN, { transcribeRoom: room }); }
  await asUser(page, host, `/events/${CN.slug}/host`);
  await ac('13a', 'host screen: Clarity Night flow, no mastermind panel, "Swap at half time" present', async () => {
    await expect(page.getByTestId('host-panel')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('host-flow-select')).toHaveValue('clarity-night');
    await expect(page.getByTestId('mm-people')).toHaveCount(0);
    await page.getByTestId('host-settings').locator('summary').click();
    await expect(page.getByTestId('host-split-on')).toHaveText('Swap at half time');
    await expect(page.getByTestId('host-split-off')).toHaveText('One talk');
    await shots(page, 'clarity-night', 'host-before-round-1', [1280, 375]);
    return 'flow select = clarity-night; no mm-panel; settings show "Swap at half time" / "One talk"';
  }, page);
  await pressHostPrimary(page);
  await expect(page.getByTestId('host-round-title')).toHaveText('Round 1', { timeout: 60_000 });
  await ac('13b', 'attendee room: the step bar, the round card with a table and a role; the projector keeps its clock, tables and no canvas words', async () => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await asUser(pg, people[0], `/events/${CN.slug}/meet`);
    await expect(pg.getByTestId('round-card')).toBeVisible({ timeout: 120_000 });
    await expect(pg.getByTestId('room-steps')).toHaveAttribute('data-current', 'table');
    await expect(pg.getByTestId('round-card-table')).toContainText('Table');
    await expect(pg.getByTestId('mastermind-round-card')).toHaveCount(0);
    expect(await pg.getByTestId('room-steps').innerText()).toMatch(/Ready[\s\S]*Principle[\s\S]*Table[\s\S]*Compare/);
    await shots(pg, 'clarity-night', 'room-round-card', [1280, 375]);
    await ctx.close();
    await asUser(page, host, `/events/${CN.slug}/host?view=screen`);
    await expect(page.getByTestId('host-screen')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
    await expect(page.getByTestId('round-clock')).toBeVisible();
    await expect(page.getByTestId('screen-rule-line')).toHaveCount(0);
    expect(await page.getByTestId('host-screen').innerText()).not.toMatch(/Clarity Canvas/i);
    await shots(page, 'clarity-night', 'projector', [1280, 375]);
    return 'room: round-card, steps Ready/Principle/Table/Compare, data-current=table, no mastermind card; projector: Round 1 heading, round-clock, no rule line, no canvas wording';
  });
  await ac('10b', 'a Clarity Night round thread keeps its title "Round n · A & B"', async () => {
    await hostEvent(page, CN);
    await pressHostPrimary(page); // round 2 ends round 1: the cut
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 2', { timeout: 60_000 });
    const seats = await savedSeats(CN.id);
    const t1 = [...tablesOf(seats, 1)][0];
    const round1 = await roundIdByNo(CN.id, 1);
    const tm = (id: string) => byProfile(id).tmember.get(CN.id)!;
    const sp = { owner: tm(t1[1].owner!), partner: tm(t1[1].partner!) };
    await postRoundLines(round1, t1[0], sp, fixtureLines(20));
    const th = (await supabaseAdmin.from('chat_round_threads').select('root_message_id').eq('round_id', round1).eq('table_no', t1[0]).single()).data!;
    const root = (await supabaseAdmin.from('chat_messages').select('body').eq('id', th.root_message_id).single()).data!;
    expect(root.body, 'the unchanged Clarity Night shape: first names, "A, B & C"').toMatch(/^Round 1 · [A-Za-z]+(, [A-Za-z]+)* & [A-Za-z]+$/);
    expect(root.body).not.toMatch(/canvas/i);
    return `title: "${root.body}"`;
  }, page);
});

function RUN_TAG(): string { return Math.random().toString(36).slice(2, 6); }

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
test('FINAL: no recorded step failed', async () => {
  expect(failures, `recorded failures:\n${failures.map((f) => `${f.id}: ${f.error}`).join('\n')}`).toEqual([]);
});
