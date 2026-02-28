import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../../e2e',
  testMatch: '**/p147-kanban-ui.spec.ts',
  fullyParallel: false,
  timeout: 30000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:9050',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:server & npx vite --port 9050',
    url: 'http://localhost:9050',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
