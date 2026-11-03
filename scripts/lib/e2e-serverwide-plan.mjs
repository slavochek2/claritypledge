/**
 * e2e-serverwide-plan.mjs — P1607 decision 2: inside a run, the specs that change server-wide state must never
 * race each other, whatever the path into the run, WITHOUT dropping the rest of the suite to one worker.
 *
 * Playwright's `workers` exists per project (node_modules/playwright/types/test.d.ts, TestProject.workers:
 * "Limiting workers to one for such a project will prevent simultaneous use"). So when it can be done without
 * changing what a command selects, the server-wide specs move to their own project (`serverwide`, one worker,
 * not fully parallel), and every other spec keeps the global worker count.
 *
 * It cannot be done when the command names a project (`--project=integration p1307-sweep-tick` must still run
 * that spec in that project): then the specs stay where they are and the run uses ONE worker for everything.
 * A CLI `--workers N` (N > 1) would override that, so such a command is refused with the reason.
 *
 * The plan is decided once, in the main runner, and travels to the workers in E2E_SERVERWIDE_PLAN: Playwright
 * workers evaluate the config again with a different argv, and the project list must be identical in both.
 * The value names its owner (the main runner's pid) and is trusted only by that process itself or by a worker
 * whose parent it is; anywhere else (a shell that exported it, the listing child, another run) it is ignored
 * and the plan is worked out again.
 */
export const PLAN_ENV = 'E2E_SERVERWIDE_PLAN';

/** `--workers` / `-j` as typed on the command line (`--workers=3`, `--workers 3`, `-j3`, `-j 3`), or null. */
export function cliWorkers(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--workers' || a === '-j') return args[i + 1] ?? '';
    if (a.startsWith('--workers=')) return a.slice('--workers='.length);
    if (/^-j.+/.test(a)) return a.slice(2);
  }
  return null;
}

export const namesAProject = args => args.some(a => a === '--project' || a.startsWith('--project=') || a === '-p');

/**
 * The plan for this process: { files, unknown, split, error }.
 * `guard` is what guardTestDbRun returned in the main runner; a worker (or a --list) has none and reads the env.
 */
export function planServerWide({ argv, guard, env = process.env, pid = process.pid, ppid = process.ppid }) {
  if (env[PLAN_ENV]) {
    try {
      const inherited = JSON.parse(env[PLAN_ENV]);
      const isWorker = env.TEST_WORKER_INDEX !== undefined || env.TEST_PARALLEL_INDEX !== undefined;
      if (inherited && (inherited.owner === pid || (isWorker && inherited.owner === ppid))) return inherited;
    } catch { /* unreadable: recompute */ }
  }
  const files = guard?.serverWideFiles ?? [];
  if (!files.length) return { files: [], unknown: false, split: false, error: null, owner: pid };
  const args = argv.slice(2);
  const split = !namesAProject(args);
  const w = cliWorkers(args);
  const error = !split && w !== null && w !== '1'
    ? `this run covers ${guard.unknown ? 'possibly ' : ''}server-wide specs in a named project, so it must use one worker, and --workers ${w} would override that. ` +
      'Drop --workers/-j (or pass 1), or drop --project so those specs run in their own one-worker project.'
    : null;
  const plan = { files, unknown: !!guard.unknown, split, error, owner: pid };
  env[PLAN_ENV] = JSON.stringify(plan);
  return plan;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A regular expression matching exactly these absolute file paths (testMatch / testIgnore take one). */
export const fileSetPattern = files => new RegExp(`^(?:${files.map(esc).join('|')})$`);
