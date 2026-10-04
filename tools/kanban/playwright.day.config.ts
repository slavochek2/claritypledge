// P1399: e2e for the Day page, on synthetic data only.
//
//   npx playwright test --config=playwright.day.config.ts
//
// Starts two board instances on ports nobody else uses (9050–9053 may be live):
//   • base+1 API + base vite (default 9071/9070) — Day enabled, KANBAN_DAY_DIR = a temp dir the tests seed per test
//   • base+3 API + base+2 vite (default 9073/9072) — Day disabled (no KANBAN_DAY_DIR), for "no Day entry"
// The API reads the day dir at request time, so each test re-seeds it with scripts/day-seed.ts.

import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'os'
import { join } from 'path'

export const DAY_E2E_DIR = process.env.DAY_E2E_DIR ?? join(tmpdir(), 'kanban-day-e2e')
// DAY_E2E_PORT_BASE moves all four ports (default 9070–9073) when another board holds them.
const BASE = Number(process.env.DAY_E2E_PORT_BASE ?? 9070)
export const ON = { api: BASE + 1, web: BASE }
export const OFF = { api: BASE + 3, web: BASE + 2 }

const env = (p: { api: number; web: number }, day: boolean): Record<string, string> => {
  const e: Record<string, string> = {
    ...(process.env as Record<string, string>),
    KANBAN_PORT_API: String(p.api),
    KANBAN_PORT_FRONTEND: String(p.web),
    KANBAN_DISABLE_WORKTREES: 'true',
  }
  delete e.KANBAN_DAY_DIR
  if (day) e.KANBAN_DAY_DIR = DAY_E2E_DIR
  return e
}

export default defineConfig({
  testDir: './e2e-day',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${ON.web}`,
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'npx tsx server/api.ts', url: `http://127.0.0.1:${ON.api}/api/config`, env: env(ON, true), reuseExistingServer: false, timeout: 30_000 },
    { command: `npx vite --port ${ON.web} --strictPort`, url: `http://localhost:${ON.web}`, env: env(ON, true), reuseExistingServer: false, timeout: 30_000 },
    { command: 'npx tsx server/api.ts', url: `http://127.0.0.1:${OFF.api}/api/config`, env: env(OFF, false), reuseExistingServer: false, timeout: 30_000 },
    { command: `npx vite --port ${OFF.web} --strictPort`, url: `http://localhost:${OFF.web}`, env: env(OFF, false), reuseExistingServer: false, timeout: 30_000 },
  ],
})
