import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { KANBAN_CONFIG } from './config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: KANBAN_CONFIG.ports.frontend,
    proxy: {
      '/api': `http://localhost:${KANBAN_CONFIG.ports.api}`
    }
  },
  test: {
    globals: true,
    environment: 'node', // Kanban tests are Node.js (not browser)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
  },
})
