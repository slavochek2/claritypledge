/**
 * @file global-teardown.ts
 * @description P1522: after every main-suite run, delete a bounded batch of e2e users that
 * outlived their test (timeouts and dead workers skip per-test cleanup). Test project only, users
 * older than 6h only, so a concurrent run in another worktree never loses a live user; at most 60s.
 * A failure
 * here is logged, never fails the run.
 */
import { isTestProjectUrl, sweepE2eTestUsers } from '../scripts/sweep-e2e-test-users';

export default async function globalTeardown(): Promise<void> {
  if (process.env.P1522_SKIP_SWEEP) return;
  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) return;
  try {
    await sweepE2eTestUsers({ apply: true, olderThanHours: 6, limit: 300, timeBudgetMs: 60_000 });
  } catch (err) {
    console.warn('[P1522 sweep] skipped:', (err as Error).message);
  }
}
