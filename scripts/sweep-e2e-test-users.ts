/**
 * @file sweep-e2e-test-users.ts
 * @description P1522: delete e2e-namespace users that outlived their test on the TEST project.
 *
 * 473 e2e specs create users and nearly all of them delete in afterEach/afterAll, yet 19,477
 * e2e users had piled up on the test project: cleanup does not run when a test times out or a
 * worker dies, and deleteTestUser fails soft. Fixing that per spec is 473 edits; this sweeps the
 * residue instead. It reuses deleteTestUser so the FK order lives in one place.
 *
 * Safety: refuses to run unless VITE_SUPABASE_URL is the test project; only touches emails that
 * match generateTestEmail() exactly; only users older than --older-than-hours, so a running suite
 * never loses a live user. Dry run unless --apply.
 *
 *   npx tsx scripts/sweep-e2e-test-users.ts                       # dry run, 24h
 *   npx tsx scripts/sweep-e2e-test-users.ts --apply --limit 500   # delete up to 500
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export const TEST_PROJECT_REF = 'gfjctyxqlwexxwsmkakq';
/** Mirrors generateTestEmail() in e2e/helpers/test-user.ts. */
export const E2E_EMAIL = /^e2e-test-\d+-\d+@gmail\.com$/;

/** Exact host match, not a substring: a URL that merely contains the ref must not pass. */
export function isTestProjectUrl(url: string | undefined): boolean {
  try {
    return new URL(url ?? '').hostname === `${TEST_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export interface SweepOptions {
  apply: boolean;
  olderThanHours: number;
  limit: number;
  /** Stop starting new deletes after this long (the e2e teardown must not stall a run). */
  timeBudgetMs?: number;
  log?: (line: string) => void;
}

export interface SweepResult {
  scanned: number;
  candidates: number;
  deleted: number;
  failed: number;
}

export async function sweepE2eTestUsers(opts: SweepOptions): Promise<SweepResult> {
  const log = opts.log ?? console.log;
  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) {
    throw new Error(`sweep refused: VITE_SUPABASE_URL is not the test project (${TEST_PROJECT_REF})`);
  }
  // Imported after the guard: the helper builds an admin client on import.
  const { supabaseAdmin } = await import('../e2e/helpers/supabase-admin');
  const { deleteTestUser } = await import('../e2e/helpers/test-user');

  const cutoff = Date.now() - opts.olderThanHours * 3600_000;
  const ids: string[] = [];
  let scanned = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      scanned++;
      if (E2E_EMAIL.test(u.email ?? '') && Date.parse(u.created_at) < cutoff) ids.push(u.id);
    }
    // Applying a bounded batch needs no full census: listing every page is itself egress.
    if (opts.apply && ids.length >= opts.limit) break;
    if (data.users.length < 1000) break;
  }
  const batch = ids.slice(0, opts.limit);
  const counted = opts.apply && ids.length >= opts.limit ? 'at least ' : '';
  log(`sweep: scanned ${scanned} users, ${counted}${ids.length} e2e users older than ${opts.olderThanHours}h, ${opts.apply ? 'deleting' : 'would delete'} ${batch.length}`);
  const result: SweepResult = { scanned, candidates: ids.length, deleted: 0, failed: 0 };
  if (!opts.apply) return result;

  const deadline = Date.now() + (opts.timeBudgetMs ?? Number.POSITIVE_INFINITY);
  for (const id of batch) {
    if (Date.now() > deadline) {
      log(`sweep: time budget reached, ${batch.length - result.deleted - result.failed} left for the next run`);
      break;
    }
    try {
      await deleteTestUser(id);
      // deleteTestUser only warns when the auth delete fails; confirm the user is really gone.
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      if (data?.user) throw new Error('auth user still present after delete');
      result.deleted++;
    } catch (err) {
      result.failed++;
      log(`sweep: FAILED ${id}: ${(err as Error).message}`);
    }
  }
  log(`sweep: deleted ${result.deleted}, failed ${result.failed}`);
  return result;
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
    limit: num('limit', Number.POSITIVE_INFINITY),
  })
    .then((r) => process.exit(r.failed ? 1 : 0))
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(2);
    });
}
