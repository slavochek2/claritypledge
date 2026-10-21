/**
 * P1532 (C1, C3) — the e2e user sweeper is bounded with no flags at all.
 *
 * The version P1532 replaced had `limit: Infinity` on the CLI, no time budget, a deadline that
 * started only after it had paged through every auth user, and no stop on repeated failure. It ran
 * against 17,500 leftovers and the test project went down. Each bound is shown here against a fake
 * client, with the failure simulated, so the real test project is never touched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SWEEP_DEFAULTS, exitCodeFor, purgeUserIds, sweepE2eTestUsers, type SweepClient } from '../../scripts/sweep-e2e-test-users';

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

  it('a 429 is retried with backoff, not treated as a refusal', async () => {
    let n = 0;
    const { client } = fakeClient((fn, args) =>
      fn === 'e2e_test_user_counts' ? counts(50) : ++n === 1 ? { data: null, error: { message: 'rate limited' }, status: 429 } : purged(args.p_limit as number));
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, limit: 50, client, pauseMs: 0, log: quiet });
    expect(r).toMatchObject({ deleted: 50, requestFailures: 1, stopped: 'limit' });
  });
});

describe('P1532 sweeper: server-side deferrals', () => {
  it('a batch that only defers halves the next request and gives up after three such batches', async () => {
    const { client, calls } = fakeClient((fn, args) =>
      fn === 'e2e_test_user_counts'
        ? counts(100)
        : { data: { deleted: [], refused: [], missing: [], failed: [], deferred: ['a', 'b'] }, error: null, status: 200, _limit: args.p_limit } as Reply);
    const r = await sweepE2eTestUsers({ apply: true, olderThanHours: 24, client, pauseMs: 0, log: quiet });
    expect(calls.slice(1).map((c) => c.args.p_limit)).toEqual([50, 25, 12]);
    expect(r).toMatchObject({ stopped: 'request-failures', deleted: 0 });
    expect(exitCodeFor(r)).toBe(1);
  });
});

describe('P1532 ledger purge (purgeUserIds)', () => {
  const ids = Array.from({ length: 120 }, (_, i) => `u-${i}`);
  const answer = (batch: string[], deferred: string[] = []): Reply => ({
    data: { deleted: batch.filter((id) => !deferred.includes(id)), refused: [], missing: [], failed: [], deferred },
    error: null,
    status: 200,
  });

  it('sends 50 per request', async () => {
    const { client, calls } = fakeClient((_, args) => answer(args.p_user_ids as string[]));
    const r = await purgeUserIds(ids, { client, pauseMs: 0, log: quiet });
    expect(calls.map((c) => (c.args.p_user_ids as string[]).length)).toEqual([50, 50, 20]);
    expect(r).toMatchObject({ deleted: 120, failed: 0, stopped: 'done' });
  });

  it('halves the batch after a timeout and re-sends it', async () => {
    let n = 0;
    const { client, calls } = fakeClient((_, args) =>
      ++n === 1 ? { data: null, error: { message: 'canceling statement due to statement timeout' }, status: 500 } : answer(args.p_user_ids as string[]));
    const r = await purgeUserIds(ids, { client, pauseMs: 0, log: quiet });
    expect(calls.map((c) => (c.args.p_user_ids as string[]).length)).toEqual([50, 25, 25, 25, 25, 20]);
    expect(r).toMatchObject({ deleted: 120, requestFailures: 1, stopped: 'done' });
  });

  it('re-sends deferred ids once, and counts a second deferral as a failure', async () => {
    const { client } = fakeClient((_, args) => {
      const batch = args.p_user_ids as string[];
      return answer(batch, batch.filter((id) => id === 'u-7'));
    });
    const r = await purgeUserIds(ids, { client, pauseMs: 0, log: quiet });
    expect(r).toMatchObject({ deleted: 119, failed: 1, stopped: 'done' });
  });
});
