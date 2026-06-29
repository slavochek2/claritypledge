/**
 * Playwright config for VIDEO CAPTURE of real product walkthroughs (P973).
 *
 * Not a test config — these specs drive the real SPA flows (seed via e2e helpers,
 * setTestSession, click through the UI) with video recording ON, to produce footage
 * for the synthetic-video CREATE lane. Reuses the base config's dev-server boot, env
 * loading, port logic, and storageState; overrides video + pacing.
 *
 * Run:  npx playwright test --config=playwright.capture.config.ts
 * Output: test-results/<spec>/<test>/video.webm (one webm per capture test).
 */
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

const SIZE = { width: 1920, height: 1080 };

export default defineConfig({
  ...base,
  testDir: './scripts/video/captures',
  // capture files are named *.capture.ts (NOT *.spec.ts) so vitest ignores them.
  testMatch: '**/*.capture.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000, // walkthroughs pause deliberately; give them room
  reporter: [['list']],
  use: {
    ...base.use,
    viewport: SIZE,
    video: { mode: 'on', size: SIZE },
  },
  projects: [
    {
      name: 'capture',
      use: {
        ...devices['Desktop Chrome'],
        viewport: SIZE,
        video: { mode: 'on', size: SIZE },
        // slowMo paces clicks so the recording is watchable, not machine-fast.
        launchOptions: { args: ['--use-fake-ui-for-media-stream'], slowMo: 350 },
      },
    },
  ],
});
