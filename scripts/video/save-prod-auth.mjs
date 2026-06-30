// One-time: save YOUR real prod login session for read-only video capture (P973).
//
// Opens a headed Chrome at claritypledge.com, waits for you to log in manually, then
// saves the session (localStorage Supabase token + cookies) to a gitignored file the
// prod capture config reuses. The session is a secret — it lives only in .private/.
//
// Run interactively:  node scripts/video/save-prod-auth.mjs
// (In Claude Code, prefix with `! ` so the headed browser opens in your session.)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('.private/test-auth/prod.json');
mkdirSync(resolve('.private/test-auth'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

console.log('\n[save-prod-auth] Opening claritypledge.com/login …');
console.log('[save-prod-auth] → Log in as yourself in the browser window that opened.');
console.log('[save-prod-auth] → Waiting for a logged-in session (up to 5 min)…\n');

await page.goto('https://claritypledge.com/login', { waitUntil: 'domcontentloaded' });

// Detect REAL login: the session key ends in `-auth-token` (NOT the PKCE
// `-auth-token-code-verifier`) and its value contains an access_token.
await page.waitForFunction(
  () => Object.entries(localStorage).some(
    ([k, v]) => /sb-.*-auth-token$/.test(k) && typeof v === 'string' && v.includes('access_token')
  ),
  { timeout: 300_000 }
);

await ctx.storageState({ path: OUT });
console.log(`\n[save-prod-auth] ✓ Saved prod session → ${OUT}`);
console.log('[save-prod-auth] You can close the browser. Capture runs will reuse this session.\n');
await browser.close();
