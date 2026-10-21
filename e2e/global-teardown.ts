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
 * Both share one 60 s budget. A failure here is logged, never fails the run.
 */
import { currentRunId, readLedger, removeLedger } from './helpers/run-ledger';
import { isTestProjectUrl, purgeUserIds, sweepE2eTestUsers } from '../scripts/sweep-e2e-test-users';

const BUDGET_MS = 60_000;

export default async function globalTeardown(): Promise<void> {
  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) return;
  const started = Date.now();
  const runId = currentRunId();
  if (runId) {
    const ids = readLedger(runId);
    try {
      const r = await purgeUserIds(ids, { timeBudgetMs: BUDGET_MS / 2 });
      console.log(`[P1532 run ledger] this run created ${ids.length} users; deleted ${r.deleted} still alive, failed ${r.failed}, ${r.requests} requests`);
      if (r.stopped === 'done' && r.failed === 0) removeLedger(runId);
    } catch (err) {
      console.warn('[P1532 run ledger] skipped:', (err as Error).message);
    }
  }
  if (process.env.P1522_SKIP_SWEEP) return;
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
