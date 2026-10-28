/**
 * Global setup — P1557: refuse a run whose reused dev server talks to another database.
 *
 * Here and not at config load: loading the config is also how the port test, editors and report
 * viewers read it, and none of them run tests. Global setup runs once per real run, after the
 * webServer step, so it sees the server the run will actually use; one the run just started has
 * the right env and passes. No webServer (remote smoke modes): nothing to check.
 */
import type { FullConfig } from '@playwright/test';
import { reusedServerMismatch } from '../scripts/lib/reused-server-check.mjs';

export default function globalSetup(config: FullConfig) {
  const server = config.webServer;
  if (!server?.url || process.env.CI) return;
  const port = Number(new URL(server.url).port);
  const mismatch = reusedServerMismatch(port, process.env.VITE_SUPABASE_URL ?? '');
  if (mismatch) throw new Error(`[P1557] ${mismatch}`);
}
