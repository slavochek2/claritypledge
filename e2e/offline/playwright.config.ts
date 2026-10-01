/**
 * P1369 offline harness config. Separate from the main playwright.config.ts because offline
 * behaviour only exists in a production build (the service worker is not registered in dev).
 *
 *   npx playwright test --config e2e/offline/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { BASE_URL, BUILD_ROOT, OFFLINE_PORT, REPO_ROOT } from './paths';

dotenv.config({ path: path.resolve(REPO_ROOT, '.env.test.local') });

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  // One build is "deployed" at a time (a shared pointer file), so tests run serially.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 150_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  globalSetup: path.resolve(REPO_ROOT, 'e2e/offline/global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/offline/serve.mjs',
    cwd: REPO_ROOT,
    url: `${BASE_URL}/__bench/health`,
    reuseExistingServer: false,
    env: { OFFLINE_PORT: String(OFFLINE_PORT), OFFLINE_BUILD_ROOT: BUILD_ROOT },
    timeout: 30_000,
  },
  outputDir: path.resolve(REPO_ROOT, 'test-results/offline'),
});
