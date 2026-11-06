/**
 * @file p1646-real-run.spec.ts
 * @description P1646 on TEST with the REAL model, as a signed-in owner: a message that contradicts a current point is offered as a choice (nothing written), a pick applies or keeps, a pick with no open choice, on a settled choice or after a hand edit changes nothing, and plain points, memory requests and invented numbers behave as the spec says.
 * The model's wording varies, so every case measures 5 fresh canvases, logs each try, and asserts at least 4 of 5.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'not a TEST project');
test.setTimeout(3_000_000);

const TRIES = 5;
const BAR = 4;
const SEED = 'We sell a file sync app to small design teams for 12 dollars per user per month. Today teams lose files across devices.';
const CONFLICT = 'the problem is organisations waste money on other tools';

// The engine's exact words (supabase/functions/_shared/canvas-choice.ts), copied verbatim.
const OFFER_LEAD = /I['’]m not sure about this\. It contradicts your current Problem,/;
const OFFER_COUNT = /I['’]m not sure about this\./g;
const KEPT = 'You chose to keep it as it is.';
const NO_CHOICE = 'There is no open choice to pick from';
const CLOSED_LEAD = 'That choice is already settled';
const STALE_LEAD = 'The canvas changed since I asked, so I checked your earlier request again.';
const NO_LONGER = 'It no longer conflicts with anything';
// The reply is "Updated: Problem." but the thread renders the box as a chip with no full stop (CanvasMessageBody.tsx UPDATED).
const UPDATED_PROBLEM = 'Updated: Problem';

const composer = (p: Page) => p.getByTestId('composer').getByRole('textbox').first();
const panel = (p: Page) => p.getByTestId('thread-panel');
const messages = (p: Page) => panel(p).getByTestId('message');
const spot = (p: Page) => p.getByTestId('publish-spot').getAttribute('data-state').catch(() => null);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Sends one message and waits for the agent's reply: the thread grows by two messages (the owner's and the agent's) and the run has finished.
 * Throws when no reply arrives, so a silent run is a loud failure and never a quiet pass.
 */
/** No reply came inside the wait: an infrastructure failure of that try, never a crash of the whole test. */
class NoReply extends Error {
  constructor(readonly sent: string) {
    super(`no reply to "${sent.slice(0, 40)}"`);
  }
}
async function say(p: Page, text: string, via: 'enter' | 'button' = 'enter') {
  const before = await messages(p).count();
  await composer(p).fill(text);
  if (via === 'button') await p.getByTestId('composer').getByRole('button', { name: 'Send' }).click();
  else await composer(p).press('Enter');
  console.log(`P1646 sent "${text.slice(0, 40)}" by ${via === 'button' ? 'the Send button' : 'Enter'}`);
  try {
    await expect.poll(() => messages(p).count(), { timeout: 180_000, intervals: [500] }).toBeGreaterThanOrEqual(before + 2);
    await expect.poll(() => spot(p), { timeout: 180_000, intervals: [500] }).not.toBe('updating');
  } catch {
    throw new NoReply(text);
  }
  await p.waitForTimeout(1000); // the boxes arrive by Realtime just after the reply
}
/** Runs one try; a NoReply is logged and counted as a FAIL (returns false), any other error still fails the test. */
async function tryOnce(label: string, i: number, run: () => Promise<void>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (e) {
    if (!(e instanceof NoReply)) throw e;
    console.log(`P1646 ${label} try ${i}: NO REPLY (infra) to "${e.sent.slice(0, 60)}" (FAIL, not a pass, not skipped)`);
    return false;
  }
}
async function open(p: Page) {
  await p.goto('/artifacts');
  await p.getByRole('tab', { name: 'Canvases' }).click();
  await p.getByTestId('artifacts-new-canvas').click();
  await p.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
  await expect(p.getByTestId('canvas-opener')).toBeVisible({ timeout: 40_000 });
}

/** The points of one box (its card list; an empty box reads as ""). */
async function boxText(p: Page, tag: string): Promise<string> {
  const section = p.getByTestId(`canvas-box-${tag}`);
  const list = section.getByTestId('canvas-box-list');
  if ((await list.count()) === 0) return '';
  const cards = '[data-testid^="canvas-point-card-"]';
  // The box shows ONE card and a "See all N" button (BOX_LIMIT = 1): the rest of the points are read from the panel that button opens.
  if ((await section.getByTestId('canvas-box-more').count()) > 0) {
    await section.getByTestId('canvas-box-more').click();
    const full = p.getByTestId('canvas-panel-box-list');
    await expect(full).toBeVisible({ timeout: 20_000 });
    const n = await full.locator(cards).count();
    const text = norm(await full.innerText());
    await p.getByTestId('canvas-panel-close').click();
    await expect(p.getByTestId('canvas-point-panel')).toHaveCount(0, { timeout: 20_000 });
    return `[${n}] ${text}`;
  }
  const n = await list.locator(cards).count();
  return `[${n}] ${norm((await list.innerText()).replace(/See all \d+/g, ''))}`;
}
/** The points of every box on the canvas, one string (empty boxes add nothing). */
async function allBoxText(p: Page): Promise<string> {
  const tags = await p.locator('[data-testid^="canvas-box-canvas:"]').evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('canvas-box-', '')));
  const parts: string[] = [];
  for (const tag of tags) parts.push(await boxText(p, tag));
  return norm(parts.join(' '));
}
/** The thread as the owner reads it, line breaks kept. */
const thread = (p: Page) => panel(p).innerText();
/** The last message in the thread, which after say() is the agent's reply to what was just sent (never text from an earlier message). */
const reply = (p: Page) => messages(p).last().innerText();

/** Opens a fresh canvas and sends the seed; the Problem box must mention "lose files" before the try goes on. */
async function seeded(p: Page): Promise<string | null> {
  await open(p);
  await say(p, SEED);
  const problem = await boxText(p, 'canvas:problem');
  return /lose files/i.test(problem) ? problem : null;
}

const optionA = (r: string) => /(?:^|\s)A(?: \(recommended\))?\. (?:Replace it with|Add ")/.test(norm(r));
const optionAKind = (r: string): 'replace' | 'add' | null =>
  /(?:^|\s)A(?: \(recommended\))?\. Replace it with/.test(norm(r)) ? 'replace' : /(?:^|\s)A(?: \(recommended\))?\. Add "/.test(norm(r)) ? 'add' : null;
/** Case 1's offer check: the lead, an A line, a B line, the Reply line. */
const isOffer = (r: string) => {
  const t = norm(r);
  return OFFER_LEAD.test(t) && optionA(r) && /(?:^|\s)B(?: \(recommended\))?\. /.test(t) && (/Reply A(, B)? or [BC]\./.test(t));
};
const keepLetter = (r: string) => /Reply (?:A|A, B) or ([BC])\./.exec(norm(r))?.[1] ?? null;
/** The option lines of an offer (A. to D.), as one string. */
const optionLines = (r: string) => norm(r).split(/(?=(?:^|\s)[A-D](?: \(recommended\))?\. )/).filter((l) => /^\s*[A-D](?: \(recommended\))?\. /.test(l)).join(' ');
/** Numbers in a text other than 12, the one the owner said. */
// The box count prefix and a message's own timestamp ("7:22 PM") are not numbers the agent wrote.
const strangers = (s: string) => (s.replace(/\[\d+\] /g, '').replace(/\b\d{1,2}:\d{2}\s?(?:AM|PM)\b/gi, '').match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => Number(n.replace(',', '.')) !== 12);

/** skip: the try could not exercise the case (logged apart, neither a pass nor counted against the bar's tries). */
type Verdict = { ok: boolean; note: string; skip?: boolean };
const clip = (s: string, n = 420) => norm(s).slice(-n);

/** Runs one try per fresh canvas; a try whose seed did not land is a seed failure, logged apart, never a pass. */
async function measure(page: Page, label: string, body: (n: number, problem: string) => Promise<Verdict>) {
  let passed = 0;
  let seedFailed = 0;
  let skipped = 0;
  for (let i = 1; i <= TRIES; i++) {
    await tryOnce(label, i, async () => {
      const problem = await seeded(page);
      if (problem === null) {
        seedFailed += 1;
        console.log(`P1646 ${label} try ${i}: SEED DID NOT LAND (not a pass)`, clip(await thread(page)), '| problem box:', await boxText(page, 'canvas:problem'));
        return;
      }
      const v = await body(i, problem);
      if (v.skip) skipped += 1;
      else if (v.ok) passed += 1;
      console.log(`P1646 ${label} try ${i}: ${v.skip ? 'NOT COUNTED' : v.ok ? 'PASS' : 'FAIL'}`, v.note);
    });
  }
  console.log(`P1646 ${label} seed failures ${seedFailed} of ${TRIES}`);
  console.log(`P1646 ${label} not counted (case not exercised) ${skipped} of ${TRIES}`);
  console.log(`P1646 ${label} passed ${passed} of ${TRIES}`);
  return passed;
}

async function withOwner(page: Page, name: string, run: () => Promise<void>) {
  const user = await createTestUser({ name });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, user.email);
    await run();
  } finally {
    await deleteTestUser(user.id);
  }
}

test('case 1 and 2: a contradiction is offered, nothing is written; picking A applies it', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c12', async () => {
    let offers = 0;
    let applied = 0;
    let seedFailed = 0;
    for (let i = 1; i <= TRIES; i++) {
      await tryOnce('case1+2', i, async () => {
        const seedBox = await seeded(page);
        if (seedBox === null) {
          seedFailed += 1;
          console.log(`P1646 case1+2 try ${i}: SEED DID NOT LAND (not a pass)`, clip(await thread(page)));
          return;
        }
        await say(page, CONFLICT);
        const r1 = await reply(page);
        const afterOffer = await boxText(page, 'canvas:problem');
        const offerOk = isOffer(r1) && afterOffer === seedBox;
        if (offerOk) offers += 1;
        console.log(`P1646 case1 try ${i}: ${offerOk ? 'PASS' : 'FAIL'} offer=${isOffer(r1)} boxUnchanged=${afterOffer === seedBox}`, '| tail:', clip(r1), '| box:', afterOffer);

        const kind = optionAKind(r1);
        if (!kind) {
          console.log(`P1646 case2 try ${i}: FAIL no A option in the reply, so no pick was sent`);
          return;
        }
        await say(page, 'A');
        const r2 = await reply(page);
        const afterPick = await boxText(page, 'canvas:problem');
        const told = r2.includes(UPDATED_PROBLEM) && /from your words "/.test(r2);
        const changed = afterPick !== afterOffer;
        const shape = kind === 'replace' ? afterPick !== seedBox : /lose files/i.test(afterPick);
        const ok = told && changed && shape;
        if (ok) applied += 1;
        console.log(`P1646 case2 try ${i}: ${ok ? 'PASS' : 'FAIL'} kind=${kind} told=${told} changed=${changed} shape=${shape}`, '| tail:', clip(r2), '| box:', afterPick);
      });
    }
    console.log(`P1646 case1+2 seed failures ${seedFailed} of ${TRIES}`);
    console.log(`P1646 case1 offer passed ${offers} of ${TRIES}`);
    console.log(`P1646 case2 apply A passed ${applied} of ${TRIES}`);
    expect.soft(offers).toBeGreaterThanOrEqual(BAR);
    expect(applied).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 2 keep: an offer, then "keep", changes nothing', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run keep', async () => {
    const passed = await measure(page, 'case2 keep', async (_n, seedBox) => {
      await say(page, CONFLICT);
      const r1 = await reply(page);
      if (!isOffer(r1)) return { ok: false, note: `no offer to keep from | tail: ${clip(r1)}` };
      await say(page, 'keep');
      const r2 = await reply(page);
      const after = await boxText(page, 'canvas:problem');
      const told = r2.includes(KEPT);
      return { ok: told && after === seedBox, note: `told=${told} boxUnchanged=${after === seedBox} | tail: ${clip(r2)} | box: ${after}` };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 2b: picking the add option keeps the current point and adds the new one', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c2b', async () => {
    const passed = await measure(page, 'case2b pick add', async (_n, seedBox) => {
      await say(page, CONFLICT);
      const r1 = await reply(page);
      const add = /(?:^|\s)B(?: \(recommended\))?\. Add "([^"]*)"/.exec(norm(r1));
      if (!add) return { ok: false, skip: true, note: `the offer has no add line at B, so nothing to pick | tail: ${clip(r1)}` };
      await say(page, 'B');
      const r2 = await reply(page);
      const box = await boxText(page, 'canvas:problem');
      const statement = add[1].toLowerCase().slice(0, 25);
      const keeps = /lose files/i.test(box);
      const holdsNew = box !== seedBox && box.toLowerCase().includes(statement);
      const told = r2.includes(UPDATED_PROBLEM) && r2.includes('I added "') && r2.includes('from your words "');
      return { ok: keeps && holdsNew && told, note: `keepsCurrent=${keeps} holdsNew=${holdsNew} told=${told} | added: "${add[1]}" | tail: ${clip(r2)} | box: ${box}` };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 3a: a pick with no open choice says so and changes nothing', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c3a', async () => {
    const passed = await measure(page, 'case3a no open choice', async (_n, seedBox) => {
      await say(page, 'B');
      const r = await reply(page);
      const after = await boxText(page, 'canvas:problem');
      const told = r.includes(NO_CHOICE);
      return { ok: told && after === seedBox, note: `told=${told} boxUnchanged=${after === seedBox} | tail: ${clip(r)} | box: ${after}` };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 3b: a letter on a settled choice writes nothing and offers again', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c3b', async () => {
    let reoffered = 0;
    let noLonger = 0;
    let seedFailed = 0;
    for (let i = 1; i <= TRIES; i++) {
      await tryOnce('case3b', i, async () => {
        const seedBox = await seeded(page);
        if (seedBox === null) {
          seedFailed += 1;
          console.log(`P1646 case3b try ${i}: SEED DID NOT LAND (not a pass)`, clip(await thread(page)));
          return;
        }
        await say(page, CONFLICT);
        const r1 = await reply(page);
        const keep = keepLetter(r1);
        if (!isOffer(r1) || !keep) {
          console.log(`P1646 case3b try ${i}: FAIL no offer or no keep letter`, '| tail:', clip(r1));
          return;
        }
        await say(page, keep);
        const afterKeep = await boxText(page, 'canvas:problem');
        await say(page, 'A');
        const r3 = await reply(page);
        const afterSecond = await boxText(page, 'canvas:problem');
        const offersInThread = (norm(await thread(page)).match(OFFER_COUNT) ?? []).length;
        const unchanged = afterSecond === afterKeep && afterKeep === seedBox;
        const reoffer = r3.includes(CLOSED_LEAD) && offersInThread >= 2;
        const other = r3.includes(NO_LONGER);
        if (unchanged && reoffer) reoffered += 1;
        else if (unchanged && other) noLonger += 1;
        console.log(`P1646 case3b try ${i}: ${unchanged && reoffer ? 'PASS' : 'FAIL'} keepLetter=${keep} boxUnchanged=${unchanged} reoffer=${reoffer} noLongerConflicts=${other} offersInThread=${offersInThread}`, '| tail:', clip(r3), '| box:', afterSecond);
      });
    }
    console.log(`P1646 case3b seed failures ${seedFailed} of ${TRIES}`);
    console.log(`P1646 case3b other outcome (no longer conflicts, nothing written, not counted as a pass) ${noLonger} of ${TRIES}`);
    console.log(`P1646 case3b passed ${reoffered} of ${TRIES}`);
    expect(reoffered).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 3c: a letter after the canvas changed writes nothing and checks again', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c3c', async () => {
    const forums = 'Our customers find us through design forums.';
    const passed = await measure(page, 'case3c stale after canvas change', async () => {
      await say(page, CONFLICT);
      const r1 = await reply(page);
      if (!isOffer(r1)) return { ok: false, skip: true, note: `no offer was made, so there is nothing to go stale | tail: ${clip(r1)}` };

      // The canvas changes through a normal message that adds a Channels point. A hand edit (pencil and Save) is not used: after it the
      // composer does not send (a client issue outside P1646, INBOX-305).
      const channelsBefore = await boxText(page, 'canvas:channels');
      await say(page, forums);
      const channels = await boxText(page, 'canvas:channels');
      const changed = /forums/i.test(channels) && !/forums/i.test(channelsBefore);
      if (!changed) return { ok: false, note: `FAIL the canvas did not change (Channels has no forums point), so staleness was not exercised | tail: ${clip(await reply(page))} | channels: ${channels}` };
      const problemBefore = await boxText(page, 'canvas:problem');

      await say(page, 'A');
      const r2 = await reply(page);
      const afterPick = await boxText(page, 'canvas:problem');
      const stale = norm(r2).startsWith(STALE_LEAD);
      const unchanged = afterPick === problemBefore;
      return { ok: stale && unchanged, note: `staleLeadFirst=${stale} problemUnchangedByPick=${unchanged} channelsGained=${changed} | tail: ${clip(r2, 500)} | problem: ${afterPick}` };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 4: a plain new point is added, with no choice offered', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c4', async () => {
    const msg = 'Our customers find us through design forums.';
    const passed = await measure(page, 'case4 plain new point', async () => {
      const before = await boxText(page, 'canvas:channels');
      await say(page, msg);
      const r = await reply(page);
      const channels = await boxText(page, 'canvas:channels');
      const gained = /forums/i.test(channels) && !/forums/i.test(before);
      const noChoice = !r.includes("I'm not sure about this.") && !r.includes('I’m not sure about this.') && !/Reply A/.test(r);
      return { ok: gained && noChoice, note: `channelsGainedForums=${gained} noChoiceOffered=${noChoice} | tail: ${clip(r)} | channels: ${channels}` };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 5: "from memory" writes nothing about Dropbox and asks the owner for a fact', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c5', async () => {
    const msg = 'Make it a Dropbox canvas from memory';
    const passed = await measure(page, 'case5 from memory', async () => {
      await say(page, msg);
      const r = await reply(page);
      const boxes = await allBoxText(page);
      const clean = !/dropbox/i.test(boxes);
      const asks = /\?|\b(?:share|tell me|let me know|give me|send me)\b|\bwho (?:buys|uses)\b|\bwhat (?:problem|you charge)\b/i.test(r);
      return { ok: clean && asks, note: `noDropboxInBoxes=${clean} asksForAFact=${asks} | tail: ${clip(r)} | boxes: ${boxes.slice(0, 400)}` };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});

test('case 6: no number the owner never said is shown, or written when an option is applied', async ({ page }) => {
  await withOwner(page, 'P1646 Real Run c6', async () => {
    const msg = 'the problem is that teams waste a lot of money on duplicate tools';
    const passed = await measure(page, 'case6 invented number', async () => {
      await say(page, msg);
      const r1 = await reply(page);
      const boxes1 = await allBoxText(page);
      const shown = strangers(boxes1).concat(strangers(optionLines(r1)));
      if (!optionA(r1)) return { ok: false, skip: true, note: `no offer with an A option, so no pick could be applied (numbers shown meanwhile: [${shown}]) | tail: ${clip(r1, 600)}` };
      const problemBefore = await boxText(page, 'canvas:problem');
      await say(page, 'A');
      const r2 = await reply(page);
      const boxes2 = await allBoxText(page);
      const applied = (await boxText(page, 'canvas:problem')) !== problemBefore && r2.includes(UPDATED_PROBLEM);
      const written = strangers(boxes2).concat(strangers(r2));
      const detail = `otherNumbersWhenOffered=[${shown}] otherNumbersAfterPick=[${written}] | offer: ${clip(r1, 600)} | pick reply: ${clip(r2, 400)} | boxes: ${boxes2.slice(0, 400)}`;
      // A pick that was refused or changed nothing proves nothing about a written number: logged as NOT APPLIED, never a pass.
      if (!applied) return { ok: false, note: `NOT APPLIED (the Problem box did not change or the reply has no "${UPDATED_PROBLEM}") | ${detail}` };
      return { ok: shown.length === 0 && written.length === 0, note: detail };
    });
    expect(passed).toBeGreaterThanOrEqual(BAR);
  });
});
