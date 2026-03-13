/**
 * Save Playwright storageState for Visual QA
 *
 * Usage:
 *   npm run test:save-auth
 *   npm run test:save-auth -- --host prod   (defaults to "local")
 *
 * Workflow:
 *   1. Opens a headed Chromium window at baseURL
 *   2. You log in manually (magic link or any auth flow)
 *   3. Once you press Enter in the terminal, the script saves
 *      cookies + localStorage to .private/test-auth/{host}.json
 *   4. All subsequent `npm run test:e2e` and `/verify` runs load
 *      that file automatically (see playwright.config.ts)
 *
 * Cookie / token expiry:
 *   - Supabase access tokens expire after 1 hour by default
 *   - Refresh tokens last much longer (weeks) but are rotated on use
 *   - storageState includes both; Playwright replays them on startup
 *   - If you get auth errors during tests, re-run `test:save-auth`
 *   - You do NOT need to re-run daily — only when sessions expire
 *
 * Security:
 *   - .private/ is gitignored; these files never leave your machine
 *   - Never commit or share .private/test-auth/*.json
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse --host flag (default: "local")
const hostFlagIdx = process.argv.indexOf('--host');
const host = hostFlagIdx !== -1 ? (process.argv[hostFlagIdx + 1] ?? 'local') : 'local';

// Determine base URL based on host
function getBaseUrl(host: string): string {
  switch (host) {
    case 'prod':
      return 'https://claritypledge.com';
    case 'staging':
      return 'https://claritypledge-git-staging.vercel.app';
    default:
      // Local — try to match playwright.config.ts port detection
      return 'http://localhost:5173';
  }
}

const baseUrl = getBaseUrl(host);
const authDir = path.resolve(__dirname, '..', '.private', 'test-auth');
const authFile = path.join(authDir, `${host}.json`);

async function prompt(question: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

async function saveAuth(): Promise<void> {
  console.log(`\nSave Playwright auth state`);
  console.log(`Host: ${host}`);
  console.log(`URL:  ${baseUrl}`);
  console.log(`Out:  ${authFile}\n`);

  // Ensure output directory exists
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl);

  console.log('A browser window has opened.');
  console.log('Log in to the app using your normal credentials.');
  console.log('When you are fully logged in and can see your account,');
  await prompt('press Enter here to save the session state...\n');

  await context.storageState({ path: authFile });
  console.log(`Auth state saved to: ${authFile}`);

  await browser.close();

  // Verify the file looks reasonable
  try {
    const raw = fs.readFileSync(authFile, 'utf8');
    const state = JSON.parse(raw) as {
      cookies?: unknown[];
      origins?: { origin: string; localStorage: { name: string }[] }[];
    };
    const cookieCount = state.cookies?.length ?? 0;
    const lsEntries = (state.origins ?? []).reduce(
      (acc, o) => acc + (o.localStorage?.length ?? 0),
      0,
    );
    console.log(
      `Saved: ${cookieCount} cookies, ${lsEntries} localStorage entries`,
    );
    if (cookieCount === 0 && lsEntries === 0) {
      console.warn(
        '\nWarning: no cookies or localStorage found. ' +
          'Are you sure you were logged in when you pressed Enter?',
      );
    } else {
      console.log('\nDone. Run `npm run test:e2e` to use the saved state.');
    }
  } catch {
    console.error('Could not read saved file — something went wrong.');
    process.exit(1);
  }
}

saveAuth().catch((err: unknown) => {
  console.error('save-auth failed:', err);
  process.exit(1);
});
