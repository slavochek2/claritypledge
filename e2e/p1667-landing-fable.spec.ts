/**
 * @file p1667-landing-fable.spec.ts
 * @description P1667 — the two dev-only landing redesign pages, measured in a real browser.
 * The unit test (src/tests/p1667-landing-fable.test.tsx) can only check structure: jsdom has no
 * layout. The claims that need geometry live here: on a phone the first screen holds the call
 * button and ends before the example card, nothing scrolls sideways, and on desktop the card sits
 * beside the headline. The routes exist only on the dev server (they are DEV-guarded), which is
 * what this suite runs against.
 */
import { test, expect, type Page } from '@playwright/test';

const PAGES = ['/tree/landing-fable', '/tree/landing-fable-change'] as const;
// The tall phone is the one that proves the layout: at 375x740 the hero text nearly fills the
// screen by itself, so the card lands below the fold even with the full-screen column removed
// (measured: the mutated run passed at 375 and failed only here).
const PHONES = [
  { width: 375, height: 740 },
  { width: 320, height: 640 },
  { width: 430, height: 932 },
] as const;
const CTA = 'Book a 15-min discovery call';

/**
 * Waits for the page's own hero, then measures it. The site menu carries a link with the same
 * label as the hero's call button and renders before the lazy page does, so everything here is
 * scoped to the section that holds the example card, never to the first matching link.
 */
async function measure(page: Page) {
  await page.getByTestId('agreed-graphic').waitFor();
  return page.evaluate((cta) => {
    const box = (el: Element | null | undefined) => el?.getBoundingClientRect();
    const card = document.querySelector('[data-testid="agreed-graphic"]');
    const hero = card?.closest('section');
    const call = [...(hero?.querySelectorAll('a') ?? [])].find((a) => a.textContent?.includes(cta));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      callBottom: box(call)?.bottom ?? -1,
      cardTop: box(card)?.top ?? -1,
      cardLeft: box(card)?.left ?? -1,
      cardBottom: box(card)?.bottom ?? -1,
      headlineRight: box(document.querySelector('h1'))?.right ?? -1,
    };
  }, CTA);
}

for (const path of PAGES) {
  test.describe(`P1667 ${path}`, () => {
    test('smoke: page loads and has no console errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByTestId('agreed-graphic').getByText('Illustration')).toBeVisible();
      expect(errors).toEqual([]);
    });

    for (const phone of PHONES) {
      test(`phone ${phone.width}px: the first screen holds the call button and ends before the example`, async ({ page }) => {
        await page.setViewportSize(phone);
        await page.goto(path);
        const m = await measure(page);
        expect(m.scrollWidth, 'no sideways scroll').toBeLessThanOrEqual(m.clientWidth);
        expect(m.callBottom, 'the call button is found').toBeGreaterThan(0);
        expect(m.callBottom, 'the call button is on the first screen').toBeLessThanOrEqual(phone.height);
        expect(m.cardTop, 'the example card starts below the first screen').toBeGreaterThanOrEqual(phone.height);
      });
    }

    test('desktop 1280px: the example sits beside the headline, whole, on the first screen', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      const m = await measure(page);
      expect(m.scrollWidth, 'no sideways scroll').toBeLessThanOrEqual(m.clientWidth);
      expect(m.headlineRight, 'the headline is found').toBeGreaterThan(0);
      expect(m.callBottom, 'the call button is found').toBeGreaterThan(0);
      expect(m.cardLeft, 'the card is to the right of the headline').toBeGreaterThanOrEqual(m.headlineRight);
      expect(m.cardTop, 'the card starts on the first screen').toBeGreaterThan(0);
      expect(m.cardBottom, 'the card ends on the first screen').toBeLessThanOrEqual(800);
      expect(m.callBottom, 'the call button is on the first screen').toBeLessThanOrEqual(800);
    });
  });
}
