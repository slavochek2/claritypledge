/**
 * reused-server-check.mjs — P1557: refuse a test run that would reuse a dev server booted
 * against a different database.
 *
 * playwright.config.ts reuses a server already listening on the worktree's port, and a reused
 * server keeps the env it was booted with (decisions.md 2026-09-01). `npm run dev` reads
 * .env.local, so after the switch a hand-started dev server talks to hosted TEST while the test
 * helpers write to the self-hosted server: users created on one, the app reading the other.
 *
 * Vite serves each module with its import.meta.env inlined, so the server's real database is
 * readable from one GET. No server: null (a fresh server gets the right env from the webServer
 * block). A server whose database cannot be read: a warning and null, so a changed probe module is
 * visible rather than silently switching the check off.
 */
import { spawnSync } from 'child_process';

const PROBE_PATH = '/src/app/data/api.ts';

function curlGet(url) {
  const r = spawnSync('curl', ['-s', '--noproxy', '*', '--connect-timeout', '1', '-m', '3', url], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

/**
 * The Supabase URL a running dev server on `port` was booted with: a URL, null when no server
 * answers, or 'unreadable' when one answers but the URL cannot be found (the probe module changed).
 */
export function servedSupabaseUrl(port, get = curlGet) {
  const body = get(`http://localhost:${port}${PROBE_PATH}`);
  if (!body) return null;
  const m = body.match(/"VITE_SUPABASE_URL":\s*"([^"]+)"/);
  return m ? m[1] : 'unreadable';
}

/** A message when the running server's database differs from `expected`, else null. */
export function reusedServerMismatch(port, expected, get = curlGet) {
  const served = servedSupabaseUrl(port, get);
  if (served === 'unreadable') {
    console.warn(`[P1557] a dev server answers on port ${port} but its database could not be read from ${PROBE_PATH}; ` +
      'the reused-server check did not run. Update PROBE_PATH in scripts/lib/reused-server-check.mjs.');
    return null;
  }
  if (!served || !expected || served === expected) return null;
  return `the dev server already running on port ${port} talks to ${served}, but this test run targets ${expected}. ` +
    `Playwright would reuse it, so the app and the test helpers would use different databases. ` +
    `Stop that dev server (lsof -ti:${port} | xargs kill) and re-run; the test run starts its own.`;
}
