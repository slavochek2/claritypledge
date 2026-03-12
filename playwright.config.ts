import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load test environment variables from .env.test.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.test.local') });

/**
 * Determine the port based on the worktree.
 * Port pattern: 5{N}00 where N is the worktree number (1-7)
 * Main repo (polymet-clarity-pledge-app) uses port 5000
 * Worktrees (claritypledge-N) use port 5N00
 */
function getWorktreePort(): number {
  // Check if we're in a worktree by looking at the directory name
  const dirName = path.basename(__dirname);

  // Match "claritypledge-N" pattern
  const worktreeMatch = dirName.match(/^claritypledge-(\d+)$/);
  if (worktreeMatch) {
    const worktreeNum = parseInt(worktreeMatch[1], 10);
    return 5000 + (worktreeNum * 100); // 5100, 5200, etc.
  }

  // Main repo uses port 5001 (5000 is blocked by macOS AirPlay)
  if (dirName === 'polymet-clarity-pledge-app') {
    return 5001;
  }

  // Fallback to 5173 (Vite default) for unknown directories
  return 5173;
}

const PORT = getWorktreePort();

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

const storageState = loadStorageState();

/**
 * Playwright E2E Test Configuration
 *
 * - Parallel test execution with 3 workers locally (2 in CI)
 * - Screenshots on failure for debugging
 * - Automatic dev server startup
 * - Dynamic port based on worktree (5000 for main, 5N00 for worktree-N)
 * - Override worker count: PLAYWRIGHT_WORKERS=N npm run test:e2e
 */

export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in parallel; serial describe blocks (e.g. pledgers-page) are exempt
  fullyParallel: true,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? parseInt(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI ? 2 : 3,

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

    // Inject saved auth state when available (produced by `npm run test:save-auth`)
    // undefined → no storageState set, unauthenticated baseline
    ...(storageState !== undefined ? { storageState } : {}),
  },

  // Test projects (browsers to test)
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/integration/**',
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

  // Web server configuration
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes to start
    env: {
      // Load test environment variables
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      // Always use real API in E2E tests — mock services don't have test user data
      VITE_USE_REAL_API: 'true',
      VITE_USE_REAL_EVENTS_API: 'true',
    },
  },
});
