/**
 * @file global-teardown.ts
 * @description After every main-suite run, on the test project only:
 *
 * 1. P1532: delete every user THIS run created that is still alive — pooled users waiting for a
 *    next test, and users a timed-out test or dead worker never cleaned up — from the run ledger
 *    (e2e/helpers/run-ledger.ts), 50 per request. A run then leaves the e2e user count where it found
 *    it. It reports how many users the run created, which is the number the pool exists to keep low.
 * 2. P1522: sweep a bounded batch of older leftovers (crashed runs, other worktrees): users older
 *    than 6h only, so a concurrent run never loses a live user.
 *
 * P1607: step 2 runs only when no other run is live on the server (a live slot, an exclusive claim, a live
 * holder of the old lock); step 1 always runs, because it only touches this run's own users.
 *
 * Both share one 60 s budget. A failure here is logged, never fails the run, with ONE exception:
 *
 * 0. P1312: the end-of-run check that TEST still serves this branch's edge functions
 *    (e2e/helpers/branch-functions.ts). It runs first, outside the 60 s budget and before the test-project
 *    return, retries an unknown once, and with E2E_REQUIRE_FUNCTIONS=1 fails the run, but only in a
 *    throw after steps 1 and 2, so a failing check never leaks test users. Its last output is
 *    one `FUNCTIONS:` line.
 */
import type { FullConfig } from '@playwright/test';
import { currentRunId, readLedger, removeLedger } from './helpers/run-ledger';
import { functionsAtTeardown, functionsRequired } from './helpers/branch-functions';
import path from 'path';
import { fileURLToPath } from 'url';
import { isTestProjectUrl, purgeUserIds, sweepE2eTestUsers } from '../scripts/sweep-e2e-test-users';
import { sweepBlockers } from '../scripts/lib/e2e-test-db-lock.mjs';

const BUDGET_MS = 60_000;

export default async function globalTeardown(config?: FullConfig): Promise<void> {
  // The check comes before anything that can return early, and its failure is thrown last.
  let failure: Error | null = null;
  let line: string | null = null;
  if (config) {
    try {
      ({ failure, line } = functionsAtTeardown(config));
    } catch (err) {
      // Under the flag a check that could not run is not a pass.
      if (functionsRequired()) {
        failure = new Error(`[P1312] the end-of-run function check could not run: ${(err as Error).message}\n[P1312] Failing the run: E2E_REQUIRE_FUNCTIONS is set.`);
      } else {
        console.warn('[P1312] end-of-run function check skipped:', (err as Error).message);
      }
    }
  }
  let cleanupError: unknown = null;
  try {
    await cleanup();
  } catch (err) {
    cleanupError = err;
  }
  if (line) console.log(line);
  if (failure) {
    if (cleanupError) console.warn('[P1312] cleanup also failed:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    throw failure;
  }
  if (cleanupError) throw cleanupError;
}

async function cleanup(): Promise<void> {
  // Test seam (the canary's real-Playwright section): proves cleanup ran, and before the FUNCTIONS line.
  if (process.env.CP_TEARDOWN_CLEANUP_SEAM) console.log('[P1312 canary] cleanup ran');
  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) return;
  const started = Date.now();
  const runId = currentRunId();
  if (runId) {
    const ids = readLedger(runId);
    try {
      const r = await purgeUserIds(ids, { timeBudgetMs: BUDGET_MS / 2 });
      console.log(`[P1532 run ledger] this run created ${ids.length} users; deleted ${r.deleted} still alive, failed ${r.failed}, left ${r.refused ?? 0} outside the e2e namespace, ${r.requests} requests`);
      if (r.stopped === 'done' && r.failed === 0) removeLedger(runId);
    } catch (err) {
      console.warn('[P1532 run ledger] skipped:', (err as Error).message);
    }
  }
  if (process.env.P1522_SKIP_SWEEP) return;
  // P1607 decision 6: another live run may still be using users older than the cutoff.
  const blockers = sweepBlockers({
    repoDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    url: process.env.VITE_SUPABASE_URL ?? '',
  });
  if (blockers.length) {
    console.log(`[P1607] older-leftovers sweep skipped: other runs are live on this server: ${blockers.join('; ')}`);
    return;
  }
  try {
    await sweepE2eTestUsers({
      apply: true,
      olderThanHours: 6,
      limit: 300,
      timeBudgetMs: Math.max(5_000, BUDGET_MS - (Date.now() - started)),
    });
  } catch (err) {
    console.warn('[P1522 sweep] skipped:', (err as Error).message);
  }
}
