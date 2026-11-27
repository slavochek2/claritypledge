/**
 * @file p1739-reproduce.spec.ts
 * @description P1739 reproduction: the reachability check (P1540) logs a red console 401.
 *
 * Every Supabase client request goes through `withNetworkOutcome` (src/lib/supabase.ts), and a request that
 * rejects marks the backend suspect, which starts one reachability check: GET <supabase>/auth/v1/health.
 * Sent without the public key, the gateway answers 401 and Chrome prints "Failed to load resource: the server
 * responded with a status of 401". This test cuts off the page's first Supabase REST request, so the check
 * runs every time, and asserts what the user would see: every check is answered with 200 and the console
 * carries no 401 line. On the unfixed code it fails on the status (received 401).
 *
 * No check runs unprompted on load: every caller of probeSupabase is gated on the backend being suspect
 * (src/app/contexts/offline-status-context.tsx), so a recorded check is one the cut-off caused.
 */
import { test, expect } from '@playwright/test';

const SETUP_TIMEOUT_MS = 20_000;
/** Recorded for a check that never got an answer (refused preflight, network error), so it fails as such. */
const NO_ANSWER = 0;

test('p1739: the reachability check after a cut-off request is answered and logs no 401', async ({ page }) => {
  // Two setup polls of up to 20 s each exceed the 30 s default, which would replace their setup messages with
  // a generic timeout exactly when a check never runs.
  test.setTimeout(2 * SETUP_TIMEOUT_MS + 15_000);
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  expect(supabaseUrl, 'setup: VITE_SUPABASE_URL is not set for this run').not.toBe('');
  const checkUrl = `${supabaseUrl}/auth/v1/health`;
  const isCheck = (url: string, method: string) => url.split('?')[0] === checkUrl && method === 'GET';

  // The cut-off below logs its own "Failed to load resource: net::ERR_FAILED" line. That line is expected, so
  // the console check further down looks for 401 lines only, never for "no console errors at all".
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // Every check the page makes until the assertions run (first answer plus the settle), not just the first one.
  const checkStatuses: number[] = [];
  page.on('response', (r) => { if (isCheck(r.url(), r.request().method())) checkStatuses.push(r.status()); });
  page.on('requestfailed', (r) => { if (isCheck(r.url(), r.method())) checkStatuses.push(NO_ANSWER); });

  let cutOff = false;
  await page.route('**/rest/v1/**', async (route) => {
    if (!cutOff) {
      cutOff = true;
      await route.abort('failed'); // rejects as a TypeError in the page, which counts as a failure
      return;
    }
    await route.continue();
  });

  await page.goto('/events');
  await expect
    .poll(() => cutOff, { message: 'setup: the page made no Supabase REST request to cut off', timeout: SETUP_TIMEOUT_MS })
    .toBe(true);
  await expect
    .poll(() => checkStatuses.length, { message: 'setup: no reachability check followed the cut-off request', timeout: SETUP_TIMEOUT_MS })
    .toBeGreaterThan(0);

  // A brief settle: Chrome prints a resource error slightly after the response event, and a second check could
  // still be answering. Both assertions run after it, so neither misses what arrived during the settle.
  await page.waitForTimeout(500);
  expect(checkStatuses, `reachability check statuses (401 = sent without the public key, ${NO_ANSWER} = no answer)`)
    .toEqual(checkStatuses.map(() => 200));
  expect(consoleErrors.filter((t) => /status of 401/.test(t)), 'console 401 lines').toEqual([]);
});
