import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'node:fs'

// ES Module equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Auto-detect worktree slot from cwd
// PORT LOGIC: Must stay in sync with playwright.config.ts getWorktreePort()
// Returns slot name (e.g. "w1", "w2") or null for main repo
function getWorktreeSlot(): string | null {
  const cwd = process.cwd()
  const slotMatch = cwd.match(/[/\\](w\d+)$/)
  if (slotMatch) return slotMatch[1]
  const legacyMatch = cwd.match(/claritypledge-(\d+)$/)
  if (legacyMatch) return `legacy${legacyMatch[1]}`
  // Named worktrees (e.g. landing-v4-artistic)
  const namedMatch = cwd.match(/[/\\]worktrees[/\\]([^/\\]+)$/)
  if (namedMatch) return namedMatch[1]
  return null
}

// Auto-detect port based on worktree
// Main repo: 5001, Worktrees w1-w7: 5100-5700
function getPort(): number {
  const slot = getWorktreeSlot()
  if (!slot) return 5001 // Main repo (5000 is blocked by macOS AirPlay)
  const numMatch = slot.match(/^w(\d+)$/) || slot.match(/^legacy(\d+)$/)
  if (numMatch) return 5000 + (parseInt(numMatch[1], 10) * 100)
  // Named worktrees: hash to a port in 5800-5899 range
  const hash = [...slot].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  return 5800 + (Math.abs(hash) % 100)
}

// Isolate Vite dep cache per worktree to prevent concurrent corruption
function getCacheDir(): string {
  const slot = getWorktreeSlot()
  return slot ? `node_modules/.vite-${slot}` : 'node_modules/.vite'
}

// https://vite.dev/config/
export default defineConfig({
  cacheDir: getCacheDir(),
  // Pre-bundle all heavy deps so Vite never re-optimizes mid-session (prevents 504 "Outdated Optimize Dep")
  optimizeDeps: {
    // Crawl lazy-loaded entry points so their deps are discovered before any request arrives.
    // Without this, dynamic imports only discovered at runtime trigger re-optimization mid-session.
    entries: [
      'src/App.tsx',
      'src/app/pages/clarity-live-page.tsx',
    ],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@supabase/supabase-js',
      '@sentry/react',
      'marked',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-accordion',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-slider',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'react-helmet-async',
      'canvas-confetti',
      'qrcode.react',
      'html-to-image',
      'sonner',
      'tailwind-merge',
      'vaul',
      'katex',
    ],
    holdUntilCrawlEnd: true, // Wait for full crawl — prevents 504 if a dep is missing from include list
  },
  server: {
    port: getPort(),
    strictPort: true, // Fail if port is already in use
    host: true, // Bind to 0.0.0.0 so 127.0.0.1 and local network IP also work
    // This enables two-party /verify: localhost:5001 (creator) and 127.0.0.1:5001 (listener)
    // have separate localStorage → can hold two different Supabase auth sessions simultaneously
  },
  build: {
    sourcemap: 'hidden', // Required for Sentry source maps
    chunkSizeWarningLimit: 1400, // heic2any is ~1353kB, lazy-loaded so no perf impact
  },
  plugins: [
    // Dev-only: serve any static deck under public/<name>/ at its clean URL
    // (e.g. /presi, /presi2, future /presiN), matching the Vercel /<name> →
    // /<name>/ redirect + static-file serving. Without this, Vite hands /<name>/
    // to the SPA router, which 404s. Triggers ONLY when public/<name>/index.html
    // actually exists, so real SPA routes (/manifesto, /blog, …) are untouched.
    // No effect on the production build.
    {
      name: 'serve-static-decks',
      configureServer(server) {
        const publicDir = path.resolve(__dirname, 'public')
        server.middlewares.use((req, res, next) => {
          const [pathname, query] = (req.url || '').split('?')
          // single path segment of [a-z0-9-], optional trailing slash
          const m = /^\/([a-z0-9][a-z0-9-]*)\/?$/.exec(pathname || '')
          if (m && existsSync(path.join(publicDir, m[1], 'index.html'))) {
            const name = m[1]
            // bare /<name> → /<name>/ so the deck's RELATIVE asset paths
            // (gsap.min.js, fonts/) resolve to /<name>/* and not the site root.
            if (pathname === `/${name}`) {
              res.statusCode = 302
              res.setHeader('Location', `/${name}/` + (query ? `?${query}` : ''))
              res.end()
              return
            }
            req.url = `/${name}/index.html` + (query ? `?${query}` : '')
          }
          next()
        })
      },
    },
    // Fail build early if required env vars are missing (catches Vercel misconfig)
    {
      name: 'env-validate',
      enforce: 'pre',
      configResolved(config) {
        if (config.command !== 'build' || process.env.VITEST) return
        const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
        const missing = required.filter(k => !config.env[k])
        if (missing.length) {
          throw new Error(`Missing required env vars: ${missing.join(', ')}. Check .env.local (local) or Vercel env vars (deploy).`)
        }
      },
    },
    react(),
    // Sentry plugin uploads source maps during build
    // Only runs when SENTRY_AUTH_TOKEN is available (production builds)
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Disable plugin when auth token is not available (local dev)
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    // PWA configuration
    VitePWA({
      injectRegister: 'script-defer', // P553: defer SW registration to avoid blocking first paint
      registerType: 'autoUpdate',
      manifest: {
        name: 'Clarity Pledge',
        short_name: 'Clarity',
        description: 'Commit to clear, honest communication. Sign the pledge and get your shareable certificate.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['productivity', 'business'],
        lang: 'en',
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Precache fonts/CSS/SVG only — JS excluded so a 503 during Vercel CDN
        // propagation doesn't fail SW install and leave the old SW serving stale
        // asset hashes (blank page). JS is handled via runtime NetworkFirst below.
        globPatterns: ['**/*.{css,svg,woff,woff2}'],
        // P864: index.html is intentionally NOT precached (P838 above), so disable the
        // navigation fallback. vite-plugin-pwa otherwise defaults navigateFallback to
        // 'index.html' and emits a NavigationRoute → createHandlerBoundToURL('index.html'),
        // which throws `non-precached-url` at runtime — fresh visitors then get
        // "Page not found" on deep links (e.g. /letter/<uuid>). Navigation is already
        // served by the NetworkFirst 'app-shell' route below, so no precache fallback
        // is needed. (Re-adding html to globPatterns would also fix it but reverts P838.)
        navigateFallback: null,
        // Runtime caching strategies
        runtimeCaching: [
          // JS bundles — NetworkFirst so a failed SW install (e.g. 503 during Vercel CDN
          // propagation) doesn't block the new SW from activating. Content-hashed filenames
          // mean the cached version is always valid once successfully fetched.
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'js-assets',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          // Navigation requests — NetworkFirst so fresh index.html is always fetched on deploy (P838)
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 24 * 60 * 60, // 1 day
              },
            },
          },
          // Images - cache first
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          // Google Fonts stylesheets
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          // Google Fonts webfonts
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          // Supabase API - Network only (never cache auth/data)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
            handler: 'NetworkOnly',
          },
          // Third-party scripts (Sentry, Mixpanel) - Network only
          {
            urlPattern: /^https:\/\/(cdn\.mxpnl\.com|api-eu\.mixpanel\.com|.*\.sentry\.io)\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false, // Don't run SW in dev
      },
    }),
  ],
  resolve: {
    // Prevent duplicate React instances when worktree node_modules/ exists
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      'pages': path.resolve(__dirname, './src/pages'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '(components)': path.resolve(__dirname, './src/(components)'),
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks', // Prevents vi.mock() state leaking between test files
    setupFiles: './src/tests/setup.tsx',
    env: {
      // Prevent supabase.ts from throwing at module load in test environments.
      // Actual Supabase calls are mocked at the service level in each test.
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/e2e/**',
      '**/.claude/**',
      '**/.local/**',
      '**/tools/**', // Exclude tools (kanban has its own test suite)
      '**/supabase/functions/**', // Deno modules — not compatible with vitest/Node
    ],
  },
})
