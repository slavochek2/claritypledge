/**
 * Global setup — P1557: refuse a run whose reused dev server talks to another database.
 * P1312: and say whether TEST serves this branch's edge functions (e2e/helpers/branch-functions.ts).
 *
 * Here and not at config load: loading the config is also how the port test, editors and report
 * viewers read it, and none of them run tests. Global setup runs once per real run, after the
 * webServer step, so it sees the server the run will actually use; one the run just started has
 * the right env and passes. No webServer (remote smoke modes): nothing to check.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';
import { reusedServerMismatch } from '../scripts/lib/reused-server-check.mjs';
import { functionsAtSetup } from './helpers/branch-functions';

/** P1672: a run on a TEST lane extends its lease first; a dead lease is a refusal here, not a mid-run failure. */
function laneHeartbeat(): void {
  if (!process.env.CP_TEST_LANE) return;
  // The repo root comes from this file's own location, never from process.cwd(), which Playwright does not pin.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = spawnSync('python3', [path.join(root, 'scripts/selfhosted/lane.py'), 'heartbeat'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  if (r.error || r.status !== 0) {
    const why = r.error ? `${r.error.message}${(r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ? ' (no answer within 120 s)' : ''}` : `exit ${r.status}`;
    throw new Error(`[P1672] lane heartbeat failed, so the lease on ${process.env.CP_TEST_LANE} is not extended and this run will not start (${why}): ${(r.stderr || '').trim()}`);
  }
}

export default function globalSetup(config: FullConfig) {
  laneHeartbeat();
  const server = config.webServer;
  if (!server?.url || process.env.CI) return;
  const port = Number(new URL(server.url).port);
  const mismatch = reusedServerMismatch(port, process.env.VITE_SUPABASE_URL ?? '');
  if (mismatch) throw new Error(`[P1557] ${mismatch}`);
  functionsAtSetup(config);
}
