/** UAT-18 (no marketing nav / Project control) + UAT-25 (no horizontal scroll at
 * 320/375/desktop) across all three room routes. Throwaway script. */
import { chromium } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession } from '../../../e2e/helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from '../../../e2e/helpers/test-event';

const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://localhost:5200';
const VIEWPORTS = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function main() {
  const host = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT1825 Host' });
  const event = await createTestEvent(host.user.id, new Date());
  const visitor = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT1825 Visitor' });
  await rsvpToEvent(event.id, visitor.user.id);

  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      for (const route of ['ready', 'meet']) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, baseURL: BASE_URL });
        const page = await context.newPage();
        await setTestSession(page, visitor.email);
        await page.goto(`${BASE_URL}/events/${event.slug}/${route}`);
        await page.waitForSelector(`[data-testid="room-${route}"]`);
        await page.waitForTimeout(300);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const navLinksText = await page.evaluate(() => {
          const nav = document.querySelector('nav');
          return nav ? nav.innerText : null;
        });
        const bodyText = await page.locator('body').innerText();
        const hasProjectControl = /\bProject\b/.test(bodyText);
        console.log(
          `${route} @ ${vp.name}: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} ` +
          `hOverflow=${overflow.scrollWidth > overflow.clientWidth} hasProjectControl=${hasProjectControl} navText=${JSON.stringify(navLinksText)}`
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await deleteTestEvent(event.id);
    await deleteTestUser(visitor.user.id);
    await deleteTestUser(host.user.id);
  }
  console.log('DONE');
}

main().catch((err) => { console.error(err); process.exit(1); });
