/**
 * Playwright config for VIDEO CAPTURE against PROD with your real account (P973).
 *
 * READ-ONLY by intent: capture specs here navigate your existing prod content (stories,
 * letters, calibration, sessions, agreements) — they must NOT create/seal/send/delete
 * prod data. Reuses your saved prod session from .private/test-auth/prod.json
 * (produced by scripts/video/save-prod-auth.mjs). No dev server — targets the live site.
 *
 * Run:  npx playwright test --config=playwright.capture.prod.config.ts
 */
import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SIZE = { width: 1920, height: 1080 };
const PROD_AUTH = path.resolve('.private/test-auth/prod.json');

if (!fs.existsSync(PROD_AUTH)) {
  console.warn(
    `\n[capture.prod] No prod session at ${PROD_AUTH}\n` +
      '  Run:  ! node scripts/video/save-prod-auth.mjs  (log in as yourself), then re-run capture.\n'
  );
}

export default defineConfig({
  testDir: './scripts/video/captures/prod',
  testMatch: '**/*.capture.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 360_000, // human-paced full-letter walk runs long by design
  reporter: [['list']],
  use: {
    baseURL: 'https://claritypledge.com',
    viewport: SIZE,
    video: { mode: 'on', size: SIZE },
    screenshot: 'only-on-failure',
    ...(fs.existsSync(PROD_AUTH) ? { storageState: PROD_AUTH } : {}),
  },
  projects: [
    {
      name: 'capture-prod',
      use: {
        ...devices['Desktop Chrome'],
        viewport: SIZE,
        video: { mode: 'on', size: SIZE },
        launchOptions: { slowMo: 0 }, // pacing is controlled manually in _human.ts
      },
    },
  ],
});
