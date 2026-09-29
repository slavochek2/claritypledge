/**
 * P1369 offline harness — shared constants and helpers for e2e/offline/*.spec.ts.
 *
 * Run: npx playwright test --config e2e/offline/playwright.config.ts
 * (global setup builds the app twice — build A and a renamed-chunk build B — into a temp dir,
 *  ~15s; set OFFLINE_REUSE_BUILD=1 to skip rebuilding when nothing under src/ or vite.config changed.)
 */
import { createClient } from '@supabase/supabase-js';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { TEST_PASSWORD } from '../helpers/test-user';

export { REPO_ROOT, OFFLINE_PORT, BUILD_ROOT, BASE_URL, deploy } from './paths';
import { BASE_URL } from './paths';

export async function newAppContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE_URL, serviceWorkers: 'allow' });
}

/**
 * Load the app once and wait until the service worker controls the page and has finished
 * installing. Models a user who has used the installed PWA before.
 */
export async function warmServiceWorker(page: Page) {
  await page.goto('/');
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active && !reg.installing && !reg.waiting && !!navigator.serviceWorker.controller;
    },
    null,
    { timeout: 45_000, polling: 500 },
  );
}

/** Open a page online and let every read (and any cache write) settle. */
export async function visitOnline(page: Page, url: string, visibleText: string | RegExp) {
  await page.goto(url);
  await expect(page.getByText(visibleText).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_000);
}

/** Navigate while offline. A browser-level network error means the app shell never booted. */
export async function gotoOffline(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    throw new Error(`app shell did not load offline for ${url} (browser network error): ${(e as Error).message}`);
  }
}

export const STRIP_CACHED = /showing what you saw/i;
export const NEEDS_CONNECTION = /needs a connection/i;
export const CHUNK_ERROR = /New version available|Module load failed/i;

/** The build a page is running, read from its module entry script. */
export async function runningBuild(page: Page): Promise<'a' | 'b'> {
  const srcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="module"][src]')).map((s) => (s as HTMLScriptElement).src),
  );
  return srcs.some((s) => /-b\.js$/.test(s)) ? 'b' : 'a';
}

/** Every URL held in Cache Storage, for asserting what the service worker keeps. */
export async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) out.push(req.url);
    }
    return out;
  });
}

const supabaseUrl = () => process.env.VITE_SUPABASE_URL!;
export const authStorageKey = () => `sb-${supabaseUrl().split('//')[1].split('.')[0]}-auth-token`;

/**
 * Sign a test user in by writing a real session into localStorage ONCE and reloading.
 * Deliberately not addInitScript (which re-injects on every load and would undo a sign-out).
 */
export async function signIn(page: Page, email: string) {
  const client = createClient(supabaseUrl(), process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`signIn failed for ${email}: ${error?.message}`);
  const s = data.session;
  const value = JSON.stringify({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: 'bearer',
    user: s.user,
  });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [authStorageKey(), value] as const);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/** Sign out through the product's own UI (desktop header menu → Log Out). */
export async function signOutViaUi(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.getByRole('menuitem', { name: /log out/i }).click();
  await expect
    .poll(async () => page.evaluate((k) => localStorage.getItem(k), authStorageKey()), { timeout: 15_000 })
    .toBeNull();
  await page.waitForLoadState('networkidle');
}
