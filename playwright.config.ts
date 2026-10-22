import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildE2EStorageState } from './e2e/helpers/storage-state';
import { worktreePort } from './scripts/lib/worktree-port.mjs';
import { guardTestDbRun } from './scripts/lib/e2e-test-db-lock.mjs';
import { isTestProjectUrl } from './scripts/sweep-e2e-test-users';

// Load test environment variables from .env.test.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.test.local') });

/**
 * Determine the port based on the worktree.
 * P1480: the scheme lives in scripts/lib/worktree-port.mjs, shared with vite.config.ts,
 * e2e/save-auth.ts and scripts/check-worktree-env.sh, so the four cannot disagree.
 *
 * Port scheme:
 *   Main repo (claritypledge): 5001 (5000 blocked by macOS AirPlay)
 *   Worktrees wN (.claude/worktrees/wN): 5100, 5200, … — except w10, which is 6050
 *     because Chromium refuses 6000 (ERR_UNSAFE_PORT)
 *   Legacy worktrees (claritypledge-N): same as wN
 *   Named worktrees (.../worktrees/name): 5800-5899 (hashed)
 *
 * This file's own directory is the checkout, so it is passed explicitly.
 */
function getWorktreePort(): number {
  return worktreePort(__dirname);
}

const PORT = getWorktreePort();

// P1541: TEST is the smallest Supabase size and every session on this machine shares it. One run at
// a time: a second run waits (bounded, exit 75 when the wait runs out) and says who holds the lock.
// Taken here, in the main runner, because the config loads before the dev server starts; workers,
// --list, --ui and CI skip it. Released when this process exits, after teardown.
guardTestDbRun({
  repoDir: __dirname,
  isTestDb: isTestProjectUrl(process.env.VITE_SUPABASE_URL),
  url: process.env.VITE_SUPABASE_URL ?? '',
  anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
});

/**
 * Load saved auth storageState for authenticated-page testing.
 *
 * The file is produced by `npm run test:save-auth` and lives in
 * .private/test-auth/local.json (gitignored, never committed).
 * When present, all test contexts start with the saved cookies +
 * localStorage so authenticated pages render actual content instead
 * of login screens.
 *
 * Fallback behaviour:
 * - File missing → skip silently (unauthenticated baseline tests still run)
 * - File present but expired → Playwright will replay the stored tokens;
 *   if Supabase rejects them the test will fail with a clear auth error
 *   rather than silently showing the wrong state.  Re-run test:save-auth.
 */
function loadStorageState(): string | undefined {
  const authFile = path.resolve(__dirname, '.private', 'test-auth', 'local.json');
  if (fs.existsSync(authFile)) {
    return authFile;
  }
  // Warn only when a developer is running tests locally (not in CI)
  if (!process.env.CI) {
    console.warn(
      '[playwright.config] No saved auth state found at .private/test-auth/local.json\n' +
        '  Run `npm run test:save-auth` to enable authenticated-page tests.\n' +
        '  Unauthenticated tests will still run normally.',
    );
  }
  return undefined;
}

/**
 * P1231: every context starts as a RETURNING user, not a first-run one.
 *
 * The saved auth state (when present) is merged with the first-run tutorial gate, so the
 * hard-mandatory IntensityTutorialModal does not open on top of the letter flow in tests.
 * See e2e/helpers/storage-state.ts for why, and for how a test opts back in.
 *
 * Always defined now — previously this was `undefined` when no auth file existed, which is
 * behaviourally identical to a storageState carrying no cookies and one localStorage key.
 */
const storageState = buildE2EStorageState(
  PORT,
  loadStorageState() ?? path.resolve(__dirname, '.private', 'test-auth', 'local.json'),
  path.resolve(__dirname, '.private', 'test-auth'),
);

/**
 * Playwright E2E Test Configuration
 *
 * - Parallel test execution with 2 workers (P1541: what the TEST project sustains)
 * - Screenshots on failure for debugging
 * - Automatic dev server startup
 * - Dynamic port based on worktree (5000 for main, 5N00 for worktree-N)
 * - Override worker count: PLAYWRIGHT_WORKERS=N npm run test:e2e
 */

export default defineConfig({
  // Test directory
  testDir: './e2e',

  // P1522: sweep e2e users that outlived their test (test project only, bounded batch).
  globalTeardown: './e2e/global-teardown.ts',

  // Run tests in parallel; serial describe blocks (e.g. pledgers-page) are exempt
  fullyParallel: true,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? parseInt(process.env.PLAYWRIGHT_WORKERS)
    // P1541: 2 locally, measured on the TEST project 2026-10-22 (worst DB response 1.8s at 2 vs 13.5s
    // at 3; 3 also tripped the auth rate limit in the P1538 parity run).
    : 2,

  // Timeouts
  timeout: 30000, // 30s per test
  expect: {
    timeout: 5000, // 5s for assertions
  },

  // Retry failed tests once
  retries: process.env.CI ? 2 : 1,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    // P1234 — separates "the dev server vanished" failures from real application
    // failures in the run output. Without it a cascade is indistinguishable from N
    // product bugs, and the failure count supports any hypothesis you bring to it.
    ['./e2e/reporters/infra-cascade.ts'],
  ],

  // Shared settings for all tests
  use: {
    // Base URL - dynamic based on worktree
    baseURL: `http://localhost:${PORT}`,

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshots on failure
    screenshot: 'only-on-failure',

    // Video on retry
    video: 'retain-on-failure',

    // Saved auth state when available (produced by `npm run test:save-auth`), always
    // carrying the P1231 first-run tutorial seed. Contexts built by hand with
    // `browser.newContext()` inherit this too — measured, see e2e/helpers/storage-state.ts.
    storageState,
  },

  // Test projects (browsers to test)
  projects: [
    {
      name: 'chromium',
      // P1369: e2e/offline/ needs a production build (service worker) and has its own config.
      testIgnore: ['**/integration/**', '**/offline/**'],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream'],
        },
      },
    },
    {
      // DB/migration tests — no browser needed, run with: npx playwright test --project=integration
      name: 'integration',
      testMatch: '**/integration/**/*.spec.ts',
    },
  ],

  // Web server configuration.
  // Skipped when targeting a deployed URL (the prod CSP smoke via CSP_SMOKE_URL,
  // or the prod-health smoke via PROD_SMOKE_URL) — booting a local dev server is
  // irrelevant there and only adds startup time + a CI failure point.
  webServer: process.env.CSP_SMOKE_URL || process.env.PROD_SMOKE_URL ? undefined : {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // P1234 — KNOWN, UNFIXED: this is Root Cause path 2. Run B adopts run A's server
    // rather than starting its own; when A finishes, Playwright kills the server *it*
    // started and B loses it mid-flight. Playwright exposes no hook to decline that
    // kill, so this config cannot fix it.
    //
    // Mitigation (named, not automatic): run concurrent E2E batches from separate
    // worktrees — each maps to its own port, so no two runs share a server. The
    // infra-cascade reporter above makes it legible when this does happen.
    //
    // Rejected: a per-run ephemeral port. It would fix path 2, but the port mapping is
    // already recomputed independently in vite.config.ts, this file and
    // check-worktree-env.sh, and concurrent Vite servers in one worktree share the
    // single `.vite-<slot>` dep cache that check-worktree-env.sh's validate_vite_cache
    // exists to repair. Also note reuse silently voids the `env` block below
    // (decisions.md 2026-09-01) — a reused server keeps the env it was booted with.
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes to start
    env: {
      // Load test environment variables.
      //
      // P1043: the service-role key is deliberately NOT passed through here. The dev
      // server never read it — `grep -rn` for that name across src/ returns 0 matches,
      // and the e2e helpers take it from process.env via this file's dotenv call, not
      // from the server's environment. Its only observable effect was that the JSON
      // reporter serializes `config.webServer.env` verbatim, writing a full-privilege
      // credential into every report artifact. Do not add it back.
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
      // Always use real API in E2E tests — mock services don't have test user data
      VITE_USE_REAL_API: 'true',
      VITE_USE_REAL_EVENTS_API: 'true',
    },
  },
});
