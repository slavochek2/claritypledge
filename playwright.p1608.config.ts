import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { buildE2EStorageState } from './e2e/helpers/storage-state';
import { RUN_ID_ENV } from './e2e/helpers/run-ledger';
import { worktreePort } from './scripts/lib/worktree-port.mjs';
import { guardTestDbRun } from './scripts/lib/e2e-test-db-lock.mjs';
import { isTestProjectUrl } from './scripts/sweep-e2e-test-users';
import { testTargetConfigError } from './scripts/lib/test-target.mjs';
import { p1608Refusal } from './scripts/lib/p1608-guard.mjs';

/**
 * P1608: the transcription end-to-end test's OWN Playwright config. Run it only through
 *   npm run test:e2e:p1608          (sets P1608_LIVE=1)
 * The default config (playwright.config.ts) ignores e2e/live/, so a full suite can never reach it.
 *
 *   - retries 0, one worker, no fullyParallel: every attempt calls paid Gemini, and a retry would spend again.
 *   - refuses (throws, before any dev server, browser or network call) unless P1608_LIVE=1 and the database is the
 *     active SELF-HOSTED TEST server (scripts/lib/p1608-guard.mjs). A `--list` is always allowed.
 *   - takes the same P1607 slot lock as the default config (guardTestDbRun), so it queues behind or beside other runs
 *     and exits 75 when TEST is busy.
 *   - the test launches its own Chromium per person (the fake-audio file flag is per process), so no browser flags here.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.test.local') });
process.env[RUN_ID_ENV] ??= randomUUID();

const refusal = p1608Refusal({ url: process.env.VITE_SUPABASE_URL });
if (refusal) throw new Error(`[P1608] REFUSED: ${refusal}`);

const targetConfigError = testTargetConfigError(process.env);
if (targetConfigError) throw new Error(`[P1557] ${targetConfigError}`);

const PORT = worktreePort(__dirname);
const lockGuard = guardTestDbRun({
  repoDir: __dirname,
  port: PORT,
  isTestDb: isTestProjectUrl(process.env.VITE_SUPABASE_URL),
  url: process.env.VITE_SUPABASE_URL ?? '',
  anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
});
void lockGuard;

const storageState = buildE2EStorageState(
  PORT,
  path.resolve(__dirname, '.private', 'test-auth', 'local.json'),
  path.resolve(__dirname, '.private', 'test-auth'),
);

export default defineConfig({
  testDir: './e2e/live',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results-p1608',
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'p1608', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
      VITE_USE_REAL_API: 'true',
      VITE_USE_REAL_EVENTS_API: 'true',
    },
  },
});
