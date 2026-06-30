/**
 * Capture 02 — the RECEIVER experience (anonymous, real prod letter).
 *
 * Walks the reading flow the way a PERSON would: a visible cursor glides to each
 * control, pauses to "aim", clicks, then the viewer gets time to read what appears.
 * The in-product "Double-click…" coachmark is hidden from the RECORDING (it still
 * ships in the real product). Forces an anonymous context (true first-time reader).
 *
 * Pacing lives in _human.ts (PACE). Narration is added at assembly (macOS `say`),
 * synced to these beats — the capture itself is intentionally silent.
 *
 * NOTE: an anonymous read records a reading/rating against this real letter.
 */
import { test } from '@playwright/test';
import { installCursor, hideCoachmarks, parkCursor, glideClick, read, PACE } from '../_human';

test.use({ storageState: { cookies: [], origins: [] } });

const LETTER_URL = 'https://claritypledge.com/letter/3032ba57-9ab5-4310-97b4-fddb4d4f9e52';

test('read a letter as the receiver', async ({ page }) => {
  await installCursor(page);
  await hideCoachmarks(page);

  await page.goto(LETTER_URL, { waitUntil: 'networkidle' });
  await parkCursor(page);
  await read(page, PACE.readPanel); // let the cover land

  const visible = (loc: ReturnType<typeof page.locator>) =>
    loc.first().isVisible().catch(() => false);

  // Cover → open the letter
  await glideClick(page, page.getByRole('button', { name: /open the letter|open|start/i }));
  await read(page, PACE.readLong); // chapter 1 prose appears — give time to read

  let stuck = 0;
  for (let step = 0; step < 60 && stuck < 6; step++) {
    let acted = false;

    // completion?
    if (await visible(page.getByText(/letter summary|finished reading|see your results|view (your )?summary|you'?re all done/i))) break;

    // 1) understanding rating (Rate 0-10) — pick 8, then read the reveal
    const rate = page.getByRole('button', { name: /^(Rate )?8$/ });
    if (await visible(rate)) {
      if (await glideClick(page, rate)) {
        acted = true;
        await read(page, PACE.readPanel); // "WHERE YOU EACH STAND" reveal
      }
    }

    // 2) position on point — pick a stance, read it, then lock in
    const lockIn = page.getByRole('button', { name: /lock in/i });
    if (await visible(lockIn)) {
      const pos = page.getByRole('button', { name: /^(agree|disagree)/i });
      if (await glideClick(page, pos)) { acted = true; await read(page, PACE.readShort); }
      if (await glideClick(page, lockIn)) { acted = true; await read(page, PACE.readShort); }
    }

    // 3) advance — specific verbs only (NOT "View full-size image" / "Show less")
    const advNames = /^(continue|reveal|got it|finish|i'?m done)$|^next\b|^complete\b|^read\b.*\bstory/i;
    let next = page.getByRole('button', { name: advNames });
    if (!(await visible(next))) next = page.getByRole('link', { name: advNames });
    if (await visible(next)) {
      // "Read X's story" reveals prose to read; plain "Next" advances the chapter.
      const isStory = /read .*story/i.test((await next.first().textContent().catch(() => '')) || '');
      if (await glideClick(page, next)) {
        acted = true;
        await read(page, isStory ? PACE.readLong : PACE.readPanel);
      }
    }

    stuck = acted ? 0 : stuck + 1;
    if (!acted) await read(page, PACE.readShort); // allow transitions to settle
  }

  await read(page, PACE.readPanel);
  await page.screenshot({ path: 'test-results/capture-02-reading-final.png', fullPage: true });
});
