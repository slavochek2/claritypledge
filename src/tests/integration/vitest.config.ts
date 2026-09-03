/**
 * Vitest — LIVE integration lane (TEST Supabase project only).
 *
 * The default vitest run (vite.config.ts) is deliberately offline: it stubs
 * VITE_SUPABASE_URL to localhost:54321 and mocks Supabase at the service level,
 * because CI has no Supabase credentials. That makes it structurally unable to
 * prove anything about a PostgREST select list — the exact defect class P1095
 * shipped (three select lists naming a dropped column, every one of them
 * degrading SILENTLY to zero points).
 *
 * This config is the opposite lane: real `.env.test.local` credentials, real
 * network, node environment, and the app's OWN service modules under test.
 * It cannot be a Playwright e2e/integration spec, because those services reach
 * the DB through `@/lib/supabase`, which reads `import.meta.env` — Vite-only.
 *
 * Lives here rather than beside vite.config.ts because the repo-structure gate
 * (P1221) refuses new root entries, and this belongs with the lane it configures.
 *
 * Run:  npm run test:integration
 * Excluded from `npm test` — see vite.config.ts `test.exclude`.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Real credentials for the TEST project (gfjctyxqlwexxwsmkakq). Never prod.
const parsed = dotenv.config({ path: path.resolve(REPO_ROOT, '.env.test.local') }).parsed ?? {};

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      '@': path.resolve(REPO_ROOT, './src'),
      '@components': path.resolve(REPO_ROOT, './src/components'),
      'pages': path.resolve(REPO_ROOT, './src/pages'),
      '@lib': path.resolve(REPO_ROOT, './src/lib'),
      '(components)': path.resolve(REPO_ROOT, './src/(components)'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/tests/integration/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    // Live DB rows are shared state — serialise rather than race sibling files.
    fileParallelism: false,
    env: {
      ...parsed,
      // The services read this to pick real-vs-mock. This lane is only ever real.
      VITE_USE_REAL_API: 'true',
    },
  },
});
