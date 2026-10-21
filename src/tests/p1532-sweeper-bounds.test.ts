/**
 * P1532 (C1, C3) — the e2e user sweeper is bounded with no flags at all.
 *
 * The version P1532 replaced had `limit: Infinity` on the CLI, no time budget, a deadline that
 * started only after it had paged through every auth user, and no stop on repeated failure. It ran
 * against 17,500 leftovers and the test project went down. Each bound is shown here against a fake
 * client, with the failure simulated, so the real test project is never touched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SWEEP_DEFAULTS, exitCodeFor, sweepE2eTestUsers, type SweepClient } from '../../scripts/sweep-e2e-test-users';

const TEST_URL = 'https://gfjctyxqlwexxwsmkakq.supabase.co';
type Reply = { data: unknown; error: { message: string } | null; status: number };

/** A fake client: `reply(fn, args)` answers each call; every call is recorded. */
function fakeClient(reply: (fn: string, args: Record<string, unknown>) => Reply) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: SweepClient = {
    rpc: (fn, args) => ({
      abortSignal: () => {
        calls.push({ fn, args });
        return Promise.resolve(reply(fn, args));
      },
    }),
  };
  return { client, calls };
}

const counts = (older: number): Reply => ({ data: { auth_users: older + 10, e2e: older, e2e_older: older }, error: null, status: 200 });
const purged = (n: number): Reply => ({
  data: { deleted: Array.from({ length: n }, (_, i) => `id-${i}`), refused: [], missing: [], failed: [], dependent_rows: 0 },
  error: null,
  status: 200,
});
const quiet = () => undefined;

let savedUrl: string | undefined;
beforeEach(() => {
  savedUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = TEST_URL;
});
afterEach(() => {
  process.env.VITE_SUPABASE_URL = savedUrl;
});

describe('P1532 sweeper bounds', () => {
  it('a dry run is one counting request and deletes nothing', async () => {
    const { client, calls } = fakeClient(() => counts(12_000));
    const r = await sweepE2eTestUsers({ apply: false, olderThanHours: 24, client, log: quiet });
    expect(calls.map((c) => c.fn)).toEqual(['e2e_test_user_counts']);
    expect(r).toMatchObject({ candidates: 12_000, deleted: 0, stopped: 'dry-run' });
  });

  it('--apply with no other flag stops at the default limit, one request per batch', async () => {
    const { client, calls } = fakeClient((fn, args) => (fn === 'e2e_test_user_counts' ? counts(17_500) : purged(args.p_limit as number)));
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, log: quiet });
    expect(r.deleted).toBe(SWEEP_DEFAULTS.limit);
    expect(r.stopped).toBe('limit');
    expect(calls).toHaveLength(1 + SWEEP_DEFAULTS.limit / SWEEP_DEFAULTS.batchSize);
    expect(calls.slice(1).every((c) => (c.args.p_limit as number) <= SWEEP_DEFAULTS.batchSize)).toBe(true);
    expect(exitCodeFor(r)).toBe(0);
  });

  it('the time budget includes the counting request', async () => {
    let clock = 0;
    const { client, calls } = fakeClient((fn) => {
      clock += 40_000; // every request takes 40 s
      return fn === 'e2e_test_user_counts' ? counts(17_500) : purged(50);
    });
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, timeBudgetMs: 60_000, now: () => clock, log: quiet });
    // count ends at 40 s, one purge starts inside the budget and ends at 80 s, then it stops.
    expect(calls.map((c) => c.fn)).toEqual(['e2e_test_user_counts', 'e2e_purge_test_users']);
    expect(r.stopped).toBe('time-budget');
  });

  it('stops after three consecutive 5xx and exits non-zero', async () => {
    const { client, calls } = fakeClient((fn) =>
      fn === 'e2e_test_user_counts' ? counts(17_500) : { data: null, error: { message: 'upstream unavailable' }, status: 503 });
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, log: quiet });
    expect(calls.filter((c) => c.fn === 'e2e_purge_test_users')).toHaveLength(SWEEP_DEFAULTS.maxConsecutiveFailures);
    expect(r).toMatchObject({ stopped: 'request-failures', requestFailures: 3, deleted: 0 });
    expect(exitCodeFor(r)).toBe(1);
  });

  it('a timeout counts as a failed request', async () => {
    const client: SweepClient = {
      rpc: (fn) => ({
        abortSignal: () => (fn === 'e2e_test_user_counts' ? Promise.resolve(counts(10)) : Promise.reject(new Error('The operation was aborted due to timeout'))),
      }),
    };
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, log: quiet });
    expect(r).toMatchObject({ stopped: 'request-failures', requestFailures: 3 });
    expect(exitCodeFor(r)).toBe(1);
  });

  it('a refusal (4xx) stops at once instead of retrying', async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: { message: 'refused: the caller is not the test project' }, status: 403 }));
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, log: quiet });
    expect(calls).toHaveLength(1);
    expect(r.stopped).toBe('refused');
    expect(exitCodeFor(r)).toBe(1);
  });

  it('a batch that deletes nobody because every candidate fails stops (no loop on unfixable users)', async () => {
    const { client, calls } = fakeClient((fn) =>
      fn === 'e2e_test_user_counts'
        ? counts(3)
        : { data: { deleted: [], refused: [], missing: [], failed: [{ id: 'x', sqlstate: '23503', message: 'blocked' }] }, error: null, status: 200 });
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, log: quiet });
    expect(calls).toHaveLength(2);
    expect(r).toMatchObject({ stopped: 'no-progress', failed: 1 });
    expect(exitCodeFor(r)).toBe(1);
  });

  it('refuses before any request when the URL is not the test project', async () => {
    process.env.VITE_SUPABASE_URL = 'https://besjtuodziykmjidubzw.supabase.co';
    const { client, calls } = fakeClient(() => counts(1));
    await expect(sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, log: quiet })).rejects.toThrow(/not the test project/);
    expect(calls).toHaveLength(0);
  });
});
