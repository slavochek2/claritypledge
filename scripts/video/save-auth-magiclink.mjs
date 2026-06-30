// Save a prod session by consuming a magic link (single-use). Headless.
// Usage: node scripts/video/save-auth-magiclink.mjs "<magic-link-url>"
// Writes the session to .private/test-auth/prod.json (gitignored).
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2];
if (!url) { console.error('Usage: node save-auth-magiclink.mjs "<url>"'); process.exit(1); }

const OUT = resolve('.private/test-auth/prod.json');
mkdirSync(resolve('.private/test-auth'), { recursive: true });

const browser = await chromium.launch({ headless: true });
// Load any existing state — it may hold the PKCE code_verifier needed to complete the
// magic-link exchange (the verifier was stored when the link was requested).
const ctx = await browser.newContext(existsSync(OUT) ? { storageState: OUT } : {});
const page = await ctx.newPage();

console.log('[magic] following magic link…');
await page.goto(url, { waitUntil: 'domcontentloaded' });
// the link redirects (email tracker → app auth callback). Give it time to settle the session.
await page.waitForLoadState('networkidle').catch(() => {});

try {
  await page.waitForFunction(
    () => Object.entries(localStorage).some(
      ([k, v]) => /sb-.*-auth-token$/.test(k) && typeof v === 'string' && v.includes('access_token')
    ),
    { timeout: 60_000 }
  );
  await ctx.storageState({ path: OUT });
  console.log(`[magic] ✓ session saved → ${OUT} (final url: ${page.url()})`);
} catch (e) {
  console.error(`[magic] ✗ no session detected. final url: ${page.url()}`);
  console.error('[magic] the link may be expired/already used — request a fresh one.');
  process.exitCode = 2;
}
await browser.close();
