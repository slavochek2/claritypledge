/**
 * @file sweep-e2e-test-users.ts
 * @description P1522: delete e2e-namespace users that outlived their test on the TEST project.
 *
 * Cleanup does not run when a test times out or a worker dies, so leftovers pile up (19,477 by
 * P1522). This sweeps the residue.
 *
 * P1532: every batch is ONE request to e2e_purge_test_users
 * (supabase/migrations/20261021120000_p1532_e2e_purge_test_users.sql), which picks the candidates
 * and deletes them with their dependent rows on the server. The version it replaces listed every
 * auth user page by page (13 pages of full user objects at 12,700 users), then spent 6 + 2k
 * requests per user, many of them deliberately failing deletes that each wrote error log lines, and
 * had no default limit, no time budget for the listing and no stop on repeated failure. It ran
 * against 17,500 leftovers and the test project went down.
 *
 * Bounds, each with a default so a bare `--apply` is safe:
 *   --limit N          users per run (default 500)
 *   --batch N          users per request (default 50; the server allows 200 and has 8 s)
 *   --time-budget-s N  stop starting requests after N s, counted from the first request (default 120)
 *   --max-failures N   stop after N consecutive failed requests (default 3), exit 1
 *
 * Safety: refuses unless VITE_SUPABASE_URL is the test project, and the server refuses too; only
 * emails that match generateTestEmail() exactly; only users older than --older-than-hours, so a
 * running suite never loses a live user. Dry run (one counting request) unless --apply.
 *
 *   npx tsx scripts/sweep-e2e-test-users.ts                       # dry run: counts only, 24h
 *   npx tsx scripts/sweep-e2e-test-users.ts --apply --limit 500   # delete up to 500
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { E2E_EMAIL, TEST_PROJECT_REF, isTestProjectUrl } from '../e2e/helpers/e2e-namespace';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export { E2E_EMAIL, TEST_PROJECT_REF, isTestProjectUrl };

export const SWEEP_DEFAULTS = {
  limit: 500,
  batchSize: 50,
  timeBudgetMs: 120_000,
  maxConsecutiveFailures: 3,
  pauseMs: 250,
  /** Per request; the server's own statement timeout is 8 s. */
  requestTimeoutMs: 20_000,
};

/** The slice of a Supabase client the sweep uses, so a test can hand it a fake. */
export interface SweepClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: { message: string } | null; status: number }> };
}

export interface SweepOptions {
  apply: boolean;
  olderThanHours: number;
  limit?: number;
  batchSize?: number;
  /** Stop starting new requests after this long, counted from the first request (counting included). */
  timeBudgetMs?: number;
  maxConsecutiveFailures?: number;
  pauseMs?: number;
  requestTimeoutMs?: number;
  client?: SweepClient;
  log?: (line: string) => void;
  /** Injected by tests; defaults to the real clock. */
  now?: () => number;
}

export type SweepStop = 'dry-run' | 'done' | 'limit' | 'time-budget' | 'request-failures' | 'refused' | 'no-progress';

export interface SweepResult {
  /** e2e users older than the cutoff before the sweep (null if the count request failed). */
  candidates: number | null;
  requests: number;
  deleted: number;
  failed: number;
  requestFailures: number;
  /** purgeUserIds only: ids the server would not delete because they are not e2e-namespace users. */
  refused?: number;
  stopped: SweepStop;
}

interface PurgeResult {
  deleted: string[];
  refused?: string[];
  /** Not tried: the server stopped its per-user retry before the statement timeout. */
  deferred?: string[];
  failed: Array<{ id: string; sqlstate: string; message: string }>;
}

async function serviceClient(): Promise<SweepClient> {
  const { createClient } = await import('@supabase/supabase-js');
  // Its own client: the shared e2e supabaseAdmin can carry a signed-in user's JWT.
  // Both are present: the caller checked VITE_SUPABASE_URL, and the key is in .env.test.local.
  return createClient(process.env.VITE_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SweepClient;
}

/** Exponential backoff with jitter (metered-services.md rule 4). */
function backoffMs(pauseMs: number, attempt: number): number {
  return Math.round(pauseMs * 2 ** attempt * (0.75 + Math.random() * 0.5));
}

/**
 * A 5xx, 408, 429, a timeout or a network failure is worth another try (after backoff); anything
 * else (a refusal, a bad argument) will fail again.
 */
function transient(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export async function sweepE2eTestUsers(opts: SweepOptions): Promise<SweepResult> {
  const log = opts.log ?? console.log;
  const now = opts.now ?? Date.now;
  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) {
    throw new Error(`sweep refused: VITE_SUPABASE_URL is not the test project (${TEST_PROJECT_REF})`);
  }
  const limit = opts.limit ?? SWEEP_DEFAULTS.limit;
  // Halved after a transient failure or a batch the server could not finish (deferred), never grown.
  let batchSize = Math.min(opts.batchSize ?? SWEEP_DEFAULTS.batchSize, 200);
  const maxFailures = opts.maxConsecutiveFailures ?? SWEEP_DEFAULTS.maxConsecutiveFailures;
  const pauseMs = opts.pauseMs ?? SWEEP_DEFAULTS.pauseMs;
  const requestTimeoutMs = opts.requestTimeoutMs ?? SWEEP_DEFAULTS.requestTimeoutMs;
  const client = opts.client ?? (await serviceClient());
  const deadline = now() + (opts.timeBudgetMs ?? SWEEP_DEFAULTS.timeBudgetMs);
  const olderThan = `${opts.olderThanHours} hours`;
  const result: SweepResult = { candidates: null, requests: 0, deleted: 0, failed: 0, requestFailures: 0, stopped: 'done' };

  // The budget decides whether a request STARTS; a started request keeps its full timeout, because
  // cutting it short client-side cannot stop the server finishing it anyway.
  const call = async (fn: string, args: Record<string, unknown>) => {
    result.requests++;
    try {
      return await client.rpc(fn, args).abortSignal(AbortSignal.timeout(requestTimeoutMs));
    } catch (err) {
      return { data: null, error: { message: (err as Error).message }, status: 0 };
    }
  };

  const counted = await call('e2e_test_user_counts', { p_older_than: olderThan });
  if (counted.error) {
    log(`sweep: count failed (${counted.status}): ${counted.error.message}`);
    if (!transient(counted.status)) return { ...result, requestFailures: 1, stopped: 'refused' };
    result.requestFailures++;
  } else {
    const c = counted.data as { auth_users: number; e2e: number; e2e_older: number };
    result.candidates = c.e2e_older;
    log(`sweep: ${c.auth_users} auth users, ${c.e2e} e2e users, ${c.e2e_older} older than ${opts.olderThanHours}h; ${opts.apply ? `deleting up to ${Math.min(limit, c.e2e_older)}` : 'dry run'}`);
  }
  if (!opts.apply) return { ...result, stopped: 'dry-run' };

  let consecutive = result.requestFailures;
  for (;;) {
    const remaining = limit - result.deleted - result.failed;
    if (remaining <= 0) { result.stopped = 'limit'; break; }
    if (now() >= deadline) { result.stopped = 'time-budget'; break; }
    if (consecutive >= maxFailures) { result.stopped = 'request-failures'; break; }

    const { data, error, status } = await call('e2e_purge_test_users', {
      p_older_than: olderThan,
      p_limit: Math.min(batchSize, remaining),
    });
    if (error) {
      result.requestFailures++;
      log(`sweep: request failed (${status}): ${error.message}`);
      if (!transient(status)) { result.stopped = 'refused'; break; }
      consecutive++;
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      await new Promise((r) => setTimeout(r, backoffMs(pauseMs, consecutive)));
      continue;
    }
    const r = data as PurgeResult;
    result.deleted += r.deleted.length;
    result.failed += r.failed.length;
    for (const f of r.failed) log(`sweep: FAILED ${f.id}: ${f.sqlstate} ${f.message}`);
    if (r.deferred?.length) {
      // The server ran short of time: the deferred users stay candidates, and the next request is
      // smaller. A batch that only defers counts as a failed attempt, so this cannot loop.
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      if (r.deleted.length === 0) {
        consecutive++;
        await new Promise((res) => setTimeout(res, backoffMs(pauseMs, consecutive)));
        continue;
      }
    }
    consecutive = 0;
    if (r.deleted.length === 0) {
      result.stopped = r.failed.length ? 'no-progress' : 'done';
      break;
    }
    await new Promise((res) => setTimeout(res, pauseMs));
  }
  log(`sweep: deleted ${result.deleted}, failed ${result.failed}, ${result.requests} requests (${result.requestFailures} failed), stopped: ${result.stopped}`);
  return result;
}

/**
 * P1532: delete these users (the run ledger's ids), PURGE_BATCH per request, same bounds as the
 * sweep. Ids already gone come back `missing` and cost nothing more.
 */
export async function purgeUserIds(
  ids: string[],
  opts: Omit<SweepOptions, 'apply' | 'olderThanHours' | 'limit'>,
): Promise<SweepResult> {
  const log = opts.log ?? console.log;
  const now = opts.now ?? Date.now;
  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) {
    throw new Error(`purge refused: VITE_SUPABASE_URL is not the test project (${TEST_PROJECT_REF})`);
  }
  const maxFailures = opts.maxConsecutiveFailures ?? SWEEP_DEFAULTS.maxConsecutiveFailures;
  const pauseMs = opts.pauseMs ?? SWEEP_DEFAULTS.pauseMs;
  const requestTimeoutMs = opts.requestTimeoutMs ?? SWEEP_DEFAULTS.requestTimeoutMs;
  const client = opts.client ?? (await serviceClient());
  const deadline = now() + (opts.timeBudgetMs ?? SWEEP_DEFAULTS.timeBudgetMs);
  const result: SweepResult = { candidates: ids.length, requests: 0, deleted: 0, failed: 0, requestFailures: 0, refused: 0, stopped: 'done' };
  // A batch that failed transiently (often a timeout) is sent again at half the size.
  let batchSize = Math.min(opts.batchSize ?? SWEEP_DEFAULTS.batchSize, 200);
  const queue = [...ids];
  const deferredOnce = new Set<string>();
  let consecutive = 0;
  while (queue.length) {
    if (now() >= deadline) { result.stopped = 'time-budget'; break; }
    if (consecutive >= maxFailures) { result.stopped = 'request-failures'; break; }
    const batch = queue.slice(0, batchSize);
    result.requests++;
    let res: { data: unknown; error: { message: string } | null; status: number };
    try {
      res = await client.rpc('e2e_purge_test_users', { p_user_ids: batch }).abortSignal(AbortSignal.timeout(requestTimeoutMs));
    } catch (err) {
      res = { data: null, error: { message: (err as Error).message }, status: 0 };
    }
    if (res.error) {
      result.requestFailures++;
      log(`purge: request failed (${res.status}): ${res.error.message}`);
      if (!transient(res.status)) { result.stopped = 'refused'; break; }
      consecutive++;
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      await new Promise((r) => setTimeout(r, backoffMs(pauseMs, consecutive)));
      continue;
    }
    consecutive = 0;
    queue.splice(0, batch.length);
    const r = res.data as PurgeResult;
    result.deleted += r.deleted.length;
    result.failed += r.failed.length;
    for (const f of r.failed) log(`purge: FAILED ${f.id}: ${f.sqlstate} ${f.message}`);
    // Not deleted, and not retried: the server refuses users outside the e2e namespace on purpose.
    result.refused = (result.refused ?? 0) + (r.refused?.length ?? 0);
    for (const id of r.refused ?? []) log(`purge: left ${id}: not an e2e-namespace user (delete it by hand if it is a test user)`);
    for (const id of r.deferred ?? []) {
      if (deferredOnce.has(id)) { result.failed++; log(`purge: FAILED ${id}: deferred twice`); }
      else { deferredOnce.add(id); queue.push(id); }
    }
  }
  return result;
}

/** Exit status for the CLI: 0 only when nothing failed and nothing was cut short by failures. */
export function exitCodeFor(r: SweepResult): number {
  if (r.failed > 0 || r.requestFailures > 0) return 1;
  if (r.stopped === 'request-failures' || r.stopped === 'refused' || r.stopped === 'no-progress') return 1;
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const num = (name: string, dflt: number) => {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return dflt;
    const v = Number(args[i + 1]);
    if (!Number.isFinite(v) || v < 0) {
      console.error(`--${name} needs a non-negative number (got ${args[i + 1] ?? 'nothing'})`);
      process.exit(2);
    }
    return v;
  };
  sweepE2eTestUsers({
    apply: args.includes('--apply'),
    olderThanHours: num('older-than-hours', 24),
    limit: num('limit', SWEEP_DEFAULTS.limit),
    batchSize: num('batch', SWEEP_DEFAULTS.batchSize),
    timeBudgetMs: num('time-budget-s', SWEEP_DEFAULTS.timeBudgetMs / 1000) * 1000,
    maxConsecutiveFailures: num('max-failures', SWEEP_DEFAULTS.maxConsecutiveFailures),
  })
    .then((r) => process.exit(exitCodeFor(r)))
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(2);
    });
}
