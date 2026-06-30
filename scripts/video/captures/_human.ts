/**
 * Human-feel helpers for video capture (P973).
 *
 * Playwright's recorded video has NO cursor and clicks teleport instantly — the result
 * reads as a script, not a person. These helpers fix that:
 *   - installCursor: injects a visible cursor that tracks real page.mouse moves
 *   - hideCoachmarks: removes the in-product "Double-click…" tip from the RECORDING
 *     only (it still ships in the real product — we just don't film it)
 *   - glideClick: scroll into view → glide the cursor to the target → aim → click
 *   - read(): a reading beat sized so a human could actually read what just appeared
 *
 * Pacing constants are deliberately generous: no human reads a revealed panel and
 * clicks the next button in 300ms.
 */
import type { Page, Locator } from '@playwright/test';

// Reading/aiming beats (ms). Tune here, not at call sites.
export const PACE = {
  aim: 320,        // pause after the cursor arrives, before the click ("taking aim")
  afterClick: 750, // settle after a click before doing anything else
  readShort: 1400, // glance at a small change (a single control appears)
  readPanel: 2600, // read a revealed panel (You/Them stand, a story)
  readLong: 3400,  // read a full chapter of letter prose
};

export const read = (page: Page, ms = PACE.readPanel) => page.waitForTimeout(ms);

/** Inject a visible cursor that follows real mouse movement. Call once per page load. */
export async function installCursor(page: Page) {
  await page.addInitScript(() => {
    const ID = '__hf_cursor';
    const make = () => {
      if (document.getElementById(ID)) return;
      const c = document.createElement('div');
      c.id = ID;
      Object.assign(c.style, {
        position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
        width: '22px', height: '22px', pointerEvents: 'none',
        transform: 'translate(-100px,-100px)', willChange: 'transform',
      });
      // A simple arrow pointer with a soft shadow so it reads on any background.
      c.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">' +
        '<path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.3 L10 13 L16 13 Z" ' +
        'fill="#fff" stroke="#1A1A1A" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      (document.body || document.documentElement).appendChild(c);
      const move = (e: MouseEvent) => {
        c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      };
      window.addEventListener('mousemove', move, true);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', make);
    } else {
      make();
    }
  });
}

/** Hide in-product coachmarks from the recording (not from the product). */
export async function hideCoachmarks(page: Page) {
  await page.addInitScript(() => {
    const TIP = /double-click to (pick|adjust)|quick tip/i;
    const sweep = () => {
      document.querySelectorAll('span, div, p').forEach((el) => {
        if (el.children.length === 0 && TIP.test(el.textContent || '')) {
          const row = el.closest('div') || el;
          (row as HTMLElement).style.visibility = 'hidden';
        }
      });
    };
    const start = () => {
      sweep();
      new MutationObserver(sweep).observe(document.documentElement, {
        childList: true, subtree: true,
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  });
}

/** Park the cursor at a neutral spot so its first real move is a visible glide. */
export async function parkCursor(page: Page, x = 960, y = 880) {
  await page.mouse.move(x, y, { steps: 8 });
}

/**
 * Scroll the target into view, glide the cursor to its center, aim, then click.
 * Returns false if the locator isn't actionable (caller decides what to do).
 */
export async function glideClick(page: Page, locator: Locator, opts: { aim?: number } = {}) {
  const el = locator.first();
  if (!(await el.isVisible().catch(() => false))) return false;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(250); // let smooth-scroll settle before we measure
  const box = await el.boundingBox().catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 26 }); // visible glide
  await page.waitForTimeout(opts.aim ?? PACE.aim);
  if (!(await el.isEnabled().catch(() => true))) return false;
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(PACE.afterClick);
  return true;
}
