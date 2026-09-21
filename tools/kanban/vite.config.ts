import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { KANBAN_CONFIG } from './config'

export default defineConfig({
  plugins: [react()],
  // One dep cache per instance: cp (9050) and pp (9052) run this same install, and a
  // shared node_modules/.vite let one server's re-optimize delete chunks the other
  // was still serving (blank board, 404 on deps/chunk-*.js — twice on 2026-09-21).
  cacheDir: `node_modules/.vite-${KANBAN_CONFIG.ports.frontend}`,
  server: {
    port: KANBAN_CONFIG.ports.frontend,
    strictPort: true, // fail loud if 9050 is held by a zombie, never drift to 9052
    proxy: {
      // 127.0.0.1, not localhost: the API binds to IPv4 loopback only (P1317), and
      // `localhost` can resolve to ::1 first, which would then refuse every request.
      '/api': `http://127.0.0.1:${KANBAN_CONFIG.ports.api}`
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
