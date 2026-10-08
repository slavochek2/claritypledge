import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { KANBAN_CONFIG } from './config'

const CP_SRC = fileURLToPath(new URL('../../src', import.meta.url))

/**
 * P1445 D: `import 'virtual:cp-tokens.css'` — CP's design tokens (the `:root` block of CP's
 * src/index.css), served as `.cp-scope { … }`. Read from CP at build time, never copied, so the Day
 * page's CP renderers always see CP's current values.
 */
export function cpTokens(): Plugin {
  const ID = 'virtual:cp-tokens.css'
  const RESOLVED = '\0virtual:cp-tokens.css'
  return {
    name: 'cp-tokens',
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null
      const css = readFileSync(`${CP_SRC}/index.css`, 'utf-8')
      const m = /:root\s*\{([^}]*)\}/.exec(css)
      if (!m) throw new Error('cp-tokens: no :root block in CP src/index.css')
      this.addWatchFile(`${CP_SRC}/index.css`)
      return `.cp-scope {${m[1]}}\n`
    },
  }
}

export default defineConfig({
  plugins: [react(), cpTokens()],
  // P1445 D: CP's shared renderers come from CP's source tree, resolved against THIS install's React
  // (one React instance: a second copy breaks hooks).
  resolve: {
    alias: { '@': CP_SRC },
    dedupe: ['react', 'react-dom'],
  },
  // One dep cache per instance: cp (9050) and pp (9052) run this same install, and a
  // shared node_modules/.vite let one server's re-optimize delete chunks the other
  // was still serving (blank board, 404 on deps/chunk-*.js — twice on 2026-09-21).
  cacheDir: `node_modules/.vite-${KANBAN_CONFIG.ports.frontend}`,
  server: {
    port: KANBAN_CONFIG.ports.frontend,
    strictPort: true, // fail loud if 9050 is held by a zombie, never drift to 9052
    // P1445 D: CP's shared renderers live outside this package
    fs: { allow: ['.', CP_SRC] },
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
      // Playwright specs (run by playwright.day.config.ts), not vitest
      'e2e-day/**',
    ],
  },
})
