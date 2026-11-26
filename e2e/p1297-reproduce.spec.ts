/**
 * @file p1297-reproduce.spec.ts
 * @description P1297 canary: a signed-in user is bounced to /login on a cold page load.
 *
 * Mechanism (reproduced 2026-11-26): on a cold load auth-js hands back the unexpired stored
 * session without contacting the server, so AuthProvider always holds a `session`. It then
 * fetches the profile (`get_profile_by_id`, 3 attempts, 1 s apart). If all three fail, the
 * provider settles on `user: null, isLoading: false, sessionChecked: true` — byte-for-byte
 * the "nobody is signed in" state — and every auth gate redirects to /login, while the token
 * stays in localStorage. Nothing retries afterwards, so the login form stays up.
 *
 * The fault injected here is the realistic one: the profile request fails at the network for
 * the first few seconds of the load (a phone on a weak connection, a radio waking up), then
 * recovers. A signed-in user must never be sent to /login for that.
 *
 * The control test (no fault) must pass before and after the fix — it proves the harness
 * reaches /transcribe signed in, so a failure of the canary is the bug, not the setup.
 */
import { test, expect, type Page } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';

const PROFILE_RPC = '**/rest/v1/rpc/get_profile_by_id';
/** How long the profile request is unreachable after the cold load starts. */
const OUTAGE_MS = 4_000;
/** How long after the outage ends we keep watching for a bounce. */
const WATCH_MS = 12_000;

function recordLoginNavigations(page: Page): string[] {
  const hits: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login') hits.push(frame.url());
  });
  return hits;
}

async function storedTokenPresent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith('-auth-token') && localStorage.getItem(k)) return true;
    }
    return false;
  });
}

test.describe('P1297 — signed-in user on a cold load of an auth-gated route', () => {
  test.setTimeout(90_000);

  test('control: with a healthy network the signed-in user stays on /transcribe', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser, { name: 'P1297 Control' });
    const page = await context.newPage();
    try {
      const logins = recordLoginNavigations(page);
      await page.goto('/transcribe');
      await page.waitForTimeout(WATCH_MS);
      expect(logins, 'never navigated to /login').toEqual([]);
      await expect(page).toHaveURL(/\/transcribe/);
    } finally {
      await cleanup();
    }
  });

  test('a profile request that fails for the first seconds of the load does not send the user to /login', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser, { name: 'P1297 Cold Load' });
    const page = await context.newPage();
    try {
      const logins = recordLoginNavigations(page);
      let outageEndsAt = Number.POSITIVE_INFINITY;
      let failed = 0;
      await context.route(PROFILE_RPC, async (route) => {
        if (Date.now() < outageEndsAt) {
          failed += 1;
          await route.abort('internetdisconnected');
        } else {
          await route.continue();
        }
      });

      outageEndsAt = Date.now() + OUTAGE_MS;
      await page.goto('/transcribe');
      await page.waitForTimeout(OUTAGE_MS + WATCH_MS);

      expect(failed, 'the fault actually hit the profile request').toBeGreaterThan(0);
      // Precondition of the bug report: a valid credential is still in storage.
      expect(await storedTokenPresent(page), 'stored session still present').toBe(true);
      // The symptom.
      expect(logins, 'signed-in user was sent to /login').toEqual([]);
      await expect(page).toHaveURL(/\/transcribe/);
      await expect(page.getByRole('button', { name: /sign in|log in|continue with/i })).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
