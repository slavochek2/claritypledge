import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

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
      'logrocket',
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
    sourcemap: true, // Required for Sentry source maps
    chunkSizeWarningLimit: 1000, // Increase from 500KB to 1MB (main bundle is ~920KB)
  },
  plugins: [
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
        // Precache app shell
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // Runtime caching strategies
        runtimeCaching: [
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
          // Third-party scripts (Sentry, LogRocket, Mixpanel) - Network only
          {
            urlPattern: /^https:\/\/(cdn\.mxpnl\.com|api-eu\.mixpanel\.com|cdn\.logrocket\.io|.*\.sentry\.io)\/.*/,
            handler: 'NetworkOnly',
          },
        ],
        // Navigation fallback for SPA
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth\/callback/, /^\/point\//, /^\/story\//],
      },
      devOptions: {
        enabled: false, // Don't run SW in dev
      },
    }),
  ],
  resolve: {
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
    ],
  },
})
