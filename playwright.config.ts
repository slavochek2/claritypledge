import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
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
 * Playwright E2E Test Configuration
 *
 * This config is optimized for testing the auth flow:
 * - Sequential test execution (workers: 1) to avoid DB conflicts
 * - Screenshots on failure for debugging
 * - Automatic dev server startup
 * - Dynamic port based on worktree (5000 for main, 5N00 for worktree-N)
 */

export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests sequentially to avoid database conflicts
  fullyParallel: false,
  workers: 1,

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
  },

  // Test projects (browsers to test)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
