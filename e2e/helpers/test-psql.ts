/**
 * psql sessions held open against the self-hosted TEST database (gcloud IAP SSH into the db container, the route
 * scripts/selfhosted/migrate.sh uses), for specs that must hold a row lock in one session while another runs.
 * PostgREST makes every RPC its own transaction, so a held lock cannot be built any other way.
 *
 * Same mechanism as e2e/integration/p1592-erasure-interleaving.spec.ts (which keeps its own copy). Opt-in: needs gcloud and the TEST
 * VM, so a spec that uses it skips unless P1592_INTERLEAVING=1, with the reason below.
 */
import { spawn, type ChildProcess } from 'node:child_process';

export const HELD_LOCK_ENABLED = process.env.P1592_INTERLEAVING === '1';
export const HELD_LOCK_SKIP_REASON = 'needs gcloud + the self-hosted TEST VM (held row lock over psql): run with P1592_INTERLEAVING=1';

const SSH = ['compute', 'ssh', 'cp-test-supabase', '--project=gen-lang-client-0869694595', '--zone=asia-southeast1-a',
  '--tunnel-through-iap', '--quiet', '--command', 'sudo docker exec -i supabase-db psql -U postgres -d postgres -X -At -v ON_ERROR_STOP=1'];

export interface Sess { proc: ChildProcess; out: string; done: Promise<number | null>; seen: (marker: string, ms?: number) => Promise<void>; }

/** Starts one psql session running `sql`; `seen(marker)` polls its output for a `SELECT 'marker'` line. */
export function psql(sql: string): Sess {
  const proc = spawn('gcloud', SSH, { env: { ...process.env, PATH: `/opt/homebrew/share/google-cloud-sdk/bin:${process.env.PATH}` } });
  const s: Sess = { proc, out: '', done: new Promise((r) => proc.on('close', (c) => r(c))), seen: async () => {} };
  proc.stdout!.on('data', (d) => { s.out += d.toString(); });
  proc.stderr!.on('data', (d) => { s.out += d.toString(); });
  s.seen = async (marker, ms = 90_000) => {
    const t0 = Date.now();
    while (!s.out.includes(marker)) {
      if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${marker}; output so far:\n${s.out}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  proc.stdin!.write(sql);
  proc.stdin!.end();
  return s;
}

export async function runSql(sql: string): Promise<string> { const s = psql(sql); await s.done; return s.out; }

/** Ends every backend a spec started under `application_name`, so a held lock never outlives the test. */
export async function dropHeld(application: string): Promise<void> {
  await runSql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${application}';`);
}
