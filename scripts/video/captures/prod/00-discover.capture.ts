/**
 * Discovery (read-only): map what real content exists on your prod account, so the
 * real-flow captures target actual data. Navigates key routes, logs headings/links/state,
 * screenshots each. Writes NOTHING to prod.
 */
import { test } from '@playwright/test';

const ROUTES = [
  { name: 'me', url: '/me' },
  { name: 'letters', url: '/letters' },
  { name: 'calibration', url: '/me/calibration' },
  { name: 'sessions', url: '/sessions' },
  { name: 'agreements', url: '/agreements' },
];

test('discover prod content', async ({ page }) => {
  for (const r of ROUTES) {
    await page.goto(r.url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    const title = await page.title().catch(() => '');
    const h1 = await page.locator('h1').allTextContents().catch(() => []);
    // collect letter/story/agreement/session links to learn real ids
    const links = await page.locator('a[href*="/letter/"], a[href*="/story/"], a[href*="/agreements/"], a[href*="/sessions"], a[href*="/d/"]')
      .evaluateAll((els) => Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href')))).slice(0, 15))
      .catch(() => []);
    const bodyHint = (await page.locator('main').first().innerText().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    console.log(`\n===== ${r.name} (${r.url}) =====`);
    console.log(`title: ${title}`);
    console.log(`h1: ${JSON.stringify(h1)}`);
    console.log(`links: ${JSON.stringify(links)}`);
    console.log(`body: ${bodyHint}`);
    await page.screenshot({ path: `test-results/discover-${r.name}.png`, fullPage: false });
  }
});
