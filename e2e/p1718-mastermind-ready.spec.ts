/**
 * @file p1718-mastermind-ready.spec.ts
 * @description P1718 — Ready comes back to the Sales Mastermind's room, with a Skip that records nothing. A real browser
 * on the self-hosted TEST server: the gate's routing (first visit, after a skip, the host), what Skip and Continue store
 * (read back with the service role), the room's step bar on /ready, and screenshots of /ready at 1280, 375 and 320 (with
 * and without the Canvas step, and Clarity Night at 375), each with window.innerWidth read back.
 *
 * Fixture: an event starting now with preparation off, so neither "Have you arrived?" nor the preparation offer stands
 * in front of the room (both are other features' gates, tested in their own files). Cleanup removes exactly what this
 * file created (e2e/helpers/p1529-mastermind.ts).
 *
 * Screenshots: <P1718_OUT>/shots (default test-results/p1718).
 */
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { supabaseAdmin } from './helpers/supabase-admin';
import { setTestSession } from './helpers/test-user';
import { assertSelfHostedTest, cleanup, leftovers, makeEvent, makeUser, newLedger, register, type Ledger, type Person } from './helpers/p1529-mastermind';
import type { TestEvent } from './helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000, navigationTimeout: 90_000 });

const OUT = process.env.P1718_OUT ?? 'test-results/p1718';
const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });

const ledger: Ledger = newLedger();
let host: Person;
let MM: TestEvent; // mastermind, Canvas before the event
let MMC: TestEvent; // mastermind, Canvas made at the event
let CN: TestEvent; // Clarity Night

async function roomEvent(title: string, o: { series?: string | null; canvasTiming?: 'before' | 'at_event' }): Promise<TestEvent> {
  const ev = await makeEvent(ledger, host.user, title, o);
  // No arrival question, no preparation offer: this file tests what comes after them.
  const { error } = await supabaseAdmin.from('events').update({ preparation_enabled: false }).eq('id', ev.id);
  if (error) throw new Error(`[P1718 fixture] preparation off: ${error.message}`);
  return ev;
}

async function registered(name: string, ev: TestEvent): Promise<Person> {
  const p = await makeUser(ledger, name);
  if (ev === CN) {
    const { error } = await supabaseAdmin.from('event_rsvps').insert({ event_id: ev.id, profile_id: p.user.user.id });
    if (error) throw new Error(`[P1718 fixture] rsvp: ${error.message}`);
  } else {
    await register(p, ev.slug);
  }
  return p;
}

async function readiness(ev: TestEvent, p: Person): Promise<number | null | undefined> {
  const { data, error } = await supabaseAdmin.from('event_room_members').select('readiness_value')
    .eq('event_id', ev.id).eq('profile_id', p.user.user.id).maybeSingle();
  if (error) throw new Error(`readiness read: ${error.message}`);
  return data ? (data.readiness_value as number | null) : undefined;
}

async function enterRoom(page: Page, p: Person, ev: TestEvent): Promise<void> {
  await setTestSession(page, p.user.email);
  await page.goto(`/events/${ev.slug}/room`);
}

async function shots(page: Page, name: string, widths: readonly number[] = [1280, 375, 320]): Promise<void> {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w >= 1280 ? 900 : 812 });
    await page.waitForTimeout(400);
    const iw = await page.evaluate(() => window.innerWidth);
    expect(iw, `viewport for ${name}-${w}`).toBe(w);
    // No horizontal page scroll at any width (R5).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${name} at ${w}px`).toBeLessThanOrEqual(0);
    // R5: the step labels never collide and never hang past the bar. Measured on the glyphs with a Range: a label's
    // span is stretched to its cell, so its own box never spills (a known-bad control with a lengthened label passed
    // that version of this check). Labels may use the 4px gap between cells (Clarity Night's live bar puts
    // "Feedback", 49px, in a 48px cell at 375), so the test is 2px clear of the next label and 1px of the bar's edges.
    const clashes = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="room-steps"] ol');
      if (!bar) return [];
      const edge = bar.getBoundingClientRect();
      const glyphs = [...bar.querySelectorAll('li')].flatMap((li) => {
        const text = li.querySelector('[data-testid$="-text"]');
        if (!text) return [];
        const range = document.createRange();
        range.selectNodeContents(text);
        return [{ label: text.textContent ?? '', rect: range.getBoundingClientRect() }];
      });
      const out: string[] = [];
      glyphs.forEach(({ label, rect }, k) => {
        if (rect.left < edge.left - 1 || rect.right > edge.right + 1) out.push(`${label} past the bar (${rect.left.toFixed(1)}-${rect.right.toFixed(1)} in ${edge.left.toFixed(1)}-${edge.right.toFixed(1)})`);
        const next = glyphs[k + 1];
        if (next && next.rect.left - rect.right < 2) out.push(`${label} touches ${next.label} (${(next.rect.left - rect.right).toFixed(1)}px)`);
      });
      return out;
    });
    expect.soft(clashes, `step labels collide or hang past the bar on ${name} at ${w}px`).toEqual([]);
    const file = `${SHOTS}/${name}-${w}.png`;
    await page.screenshot({ path: file, fullPage: true });
    appendFileSync(`${OUT}/shots.jsonl`, JSON.stringify({ file, width: w, innerWidth: iw }) + '\n');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  assertSelfHostedTest();
  host = await makeUser(ledger, 'Hana P1718host');
  MM = await roomEvent('P1718 mastermind', {});
  MMC = await roomEvent('P1718 mastermind canvas at event', { canvasTiming: 'at_event' });
  CN = await roomEvent('P1718 clarity night', { series: null });
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  assertSelfHostedTest();
  await cleanup(ledger);
  const left = await leftovers(ledger);
  for (const [k, n] of Object.entries(left)) expect(n, `leftover ${k}`).toBe(0);
});

test('smoke: a first visit to the mastermind room lands on Ready, with the room\'s step bar and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await registered('Ada P1718first', MM);
  await enterRoom(page, a, MM);
  await expect(page).toHaveURL(new RegExp(`/events/${MM.slug}/ready$`));
  await expect(page.getByTestId('room-ready')).toBeVisible();
  await expect(page.getByTestId('room-ready-continue')).toBeVisible();
  await expect(page.getByTestId('room-ready-skip')).toHaveText('Skip');
  // R7: the mastermind's bar, no statement Compare. R5 (founder 2026-11-24): its last step is "Review".
  await expect(page.getByTestId('room-steps').getByRole('listitem')).toHaveText(['Learn and prepare', 'Ready', 'Principle', 'Table', 'Review']);
  await shots(page, 'mastermind-ready');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Skip stores nothing, opens the room, re-entry goes straight to the room, and Ready carries no done tick', async ({ page }) => {
  const b = await registered('Bo P1718skip', MM);
  await enterRoom(page, b, MM);
  await expect(page.getByTestId('room-ready')).toBeVisible();
  await page.getByTestId('room-ready-skip').click();
  await expect(page).toHaveURL(new RegExp(`/events/${MM.slug}/meet`));
  await expect(page.getByTestId('room-meet')).toBeVisible();
  expect(await readiness(MM, b), 'a skip stores no readiness value').toBeNull();
  // R10: the Ready step is not shown as done after a skip.
  await expect(page.getByRole('button', { name: 'Ready, done' })).toHaveCount(0);
  await shots(page, 'mastermind-meet-after-skip');
  // R4: the next entry through /room goes to the room, not back to Ready.
  await page.goto(`/events/${MM.slug}/room`);
  await expect(page).toHaveURL(new RegExp(`/events/${MM.slug}/meet`));
  // Ready can still be opened from the bar, and answering it then stores a value.
  await page.getByRole('button', { name: /^Ready/ }).click();
  await expect(page.getByTestId('room-ready')).toBeVisible();
  await page.getByRole('slider').press('ArrowRight');
  await page.getByTestId('room-ready-continue').click();
  await expect(page.getByTestId('room-meet')).toBeVisible();
  await expect.poll(() => readiness(MM, b), { timeout: 20_000 }).toBe(6);
});

test('Continue without moving the slider stores nothing; Continue after moving it stores the value', async ({ page, browser }) => {
  const c = await registered('Cy P1718untouched', MM);
  await enterRoom(page, c, MM);
  await expect(page.getByTestId('room-ready')).toBeVisible();
  await page.getByTestId('room-ready-continue').click();
  await expect(page.getByTestId('room-meet')).toBeVisible();
  expect(await readiness(MM, c), 'an untouched Continue stores no value').toBeNull();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  const d = await registered('Di P1718moved', MM);
  await enterRoom(p2, d, MM);
  await expect(p2.getByTestId('room-ready')).toBeVisible();
  await p2.getByRole('slider').press('ArrowLeft');
  await p2.getByTestId('room-ready-continue').click();
  await expect(p2.getByTestId('room-meet')).toBeVisible();
  await expect.poll(() => readiness(MM, d), { timeout: 20_000 }).toBe(4);
  // R10: an answered Ready is ticked.
  await expect(p2.getByRole('button', { name: 'Ready, done' })).toBeVisible();
  await ctx.close();
});

test('the mastermind host goes straight to the room', async ({ page }) => {
  await enterRoom(page, host, MM);
  await expect(page).toHaveURL(new RegExp(`/events/${MM.slug}/meet`), { timeout: 60_000 });
});

test('a mastermind host opening /ready directly is sent to the room (R9)', async ({ page }) => {
  await setTestSession(page, host.user.email);
  await page.goto(`/events/${MM.slug}/ready`);
  await expect(page).toHaveURL(new RegExp(`/events/${MM.slug}/meet`), { timeout: 60_000 });
});

test('a person seated in the round running now is forwarded from /ready to the room (R8)', async ({ page }) => {
  const g = await registered('Gus P1718seated', MM);
  await enterRoom(page, g, MM);
  await expect(page.getByTestId('room-ready')).toBeVisible();
  const { data: member, error: me } = await supabaseAdmin.from('event_room_members').select('id')
    .eq('event_id', MM.id).eq('profile_id', g.user.user.id).single();
  if (me) throw new Error(`room member: ${me.message}`);
  const { data: round, error: re } = await supabaseAdmin.from('event_rounds')
    .insert({ event_id: MM.id, round_no: 1, group_size: 2 }).select('id').single();
  if (re) throw new Error(`round: ${re.message}`);
  const { error: se } = await supabaseAdmin.from('event_round_seats')
    .insert({ round_id: round.id, room_member_id: member.id, table_no: 1, role: 'first' });
  if (se) throw new Error(`seat: ${se.message}`);
  try {
    await page.goto(`/events/${MM.slug}/ready`);
    await expect(page).toHaveURL(new RegExp(`/events/${MM.slug}/meet`), { timeout: 60_000 });
  } finally {
    await supabaseAdmin.from('event_rounds').delete().eq('id', round.id);
  }
});

test('Canvas made at the event: /ready shows the Canvas step and still no Compare', async ({ page }) => {
  const e = await registered('Ed P1718canvas', MMC);
  await enterRoom(page, e, MMC);
  await expect(page).toHaveURL(new RegExp(`/events/${MMC.slug}/ready$`));
  await expect(page.getByTestId('room-steps').getByRole('listitem')).toHaveText(['Learn and prepare', 'Ready', 'Principle', 'Canvas', 'Table', 'Review']);
  await shots(page, 'mastermind-canvas-ready');
  // Six steps with a tick (review round 2): an answered Ready carries its check on /meet, and the bar still fits.
  await page.getByRole('slider').press('ArrowRight');
  await page.getByTestId('room-ready-continue').click();
  await expect(page.getByTestId('room-meet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ready, done' })).toBeVisible();
  await shots(page, 'mastermind-canvas-meet-answered', [1280, 768, 600, 430, 375, 320]);
});

test('Clarity Night: Ready keeps its order and gains Skip; an untouched Continue stores nothing', async ({ page }) => {
  const f = await registered('Flo P1718night', CN);
  await enterRoom(page, f, CN);
  await expect(page).toHaveURL(new RegExp(`/events/${CN.slug}/ready$`));
  await expect(page.getByRole('button', { name: /Compare/ })).toBeVisible();
  await expect(page.getByTestId('room-ready-skip')).toHaveText('Skip');
  await shots(page, 'clarity-night-ready', [375, 1280, 320]);
  await page.getByTestId('room-ready-continue').click();
  await expect(page.getByTestId('room-meet')).toBeVisible();
  expect(await readiness(CN, f), 'an untouched Continue stores no value on Clarity Night either').toBeNull();
  await shots(page, 'clarity-night-meet', [375]);
});
