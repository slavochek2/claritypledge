#!/usr/bin/env node
/**
 * @file check-cron-health.mjs
 * @description P1283 — watch the pg_cron jobs the migrations create.
 *
 * The gap: pg_cron jobs are scheduled by migrations and nothing automated ever checks
 * that they exist on prod, are active, or have run. That is the P1256 outage's exact
 * shape — a job that failed 328 consecutive times wrote 328 identical errors into
 * `cron.job_run_details`, and because nothing read the table a hard error was
 * operationally indistinguishable from silence.
 *
 * The expected-job list is DERIVED from `supabase/migrations/*.sql`, never restated
 * here. A second list would drift from the migrations, and the drift would be exactly
 * as invisible as the outage it is meant to catch.
 *
 * ── What a green run proves, and what it does not ────────────────────────────
 * A `succeeded` row in `cron.job_run_details` proves the job's SQL command ran without
 * error. It does NOT prove the work landed: `net.http_post` is asynchronous, so a tick
 * that queues an HTTP request returns success whatever the response turns out to be. A
 * 401 from a rotated secret still records `succeeded`. Delivery is asserted separately
 * against `net._http_response` in `/day`; this check's scope is scheduling and
 * SQL-level execution (epistemic gate 7b).
 *
 * Usage:
 *   node scripts/check-cron-health.mjs                 # prod
 *   node scripts/check-cron-health.mjs --project-ref <ref>
 *
 * Auth: SUPABASE_ACCESS_TOKEN (a Supabase personal access token), from the environment
 * or `.env.local`. `cron.job_run_details` lives in the `cron` schema, which PostgREST
 * does not expose, so the Management API query endpoint is the only read path — the
 * same one `/day` already uses.
 *
 * Exit codes: 0 all healthy · 1 a job is unhealthy · 2 the check itself is
 * misconfigured (no token, no migrations, unreadable response) — distinct so that
 * "the watcher is broken" never reads as "prod is broken".
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const PROD_PROJECT_REF = 'besjtuodziykmjidubzw';
const MIN_TOLERANCE_MINUTES = 15;

// One pass over both call shapes, so their relative TEXT ORDER is preserved:
//   cron.schedule('name', 'expr', ...)   — group 1 'schedule', groups 2 and 3
//   cron.unschedule('name')              — group 1 'unschedule', group 2
const CRON_OP_RE = /cron\.(schedule|unschedule)\s*\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g;

// A line whose first non-blank characters are `--` is a SQL comment. Stripping whole
// comment lines keeps a commented-out call from inventing an expected job. Trailing
// inline comments are deliberately left alone: `--` also appears inside string
// literals, and a naive strip there would corrupt a real command.
const WHOLE_LINE_COMMENT_RE = /^[ \t]*--.*$/gm;

/**
 * Read every migration in filename order and replay its schedule/unschedule calls **in
 * the order they appear**, so the expectation ends where the database ends up.
 * Returns { jobName: cronExpression }.
 *
 * Text order is the correct rule in BOTH directions, which an earlier draft got wrong.
 * It applied every unschedule in a file before every schedule, reasoning that the repo's
 * idempotency pattern — `cron.unschedule(x) WHERE EXISTS(...); cron.schedule(x, ...)`,
 * as 20260907140000 writes it — would otherwise delete the job it just created. That
 * reasoning is backwards: in text order the schedule comes LAST there and wins anyway.
 * What the reordering actually broke is the opposite shape, a migration that schedules a
 * job and then removes it further down the same file: the job stays in the expectation
 * forever and the check reports a deliberately-removed job as a production outage.
 * Found by adversarial review, 2026-09-09.
 *
 * Two shapes this deliberately does not read, both failing LOUD rather than silent:
 *   - the two-argument `cron.schedule('*​/5 * * * *', 'SQL')` form, where pg_cron
 *     auto-names the job. It would be read as a job literally named after the cron
 *     expression, which cannot exist on prod, so the check fails visibly instead of
 *     quietly dropping a job. The repo uses the three-argument named form throughout.
 *   - `cron.unschedule(<jobid>)` by numeric id. An unschedule that is not seen leaves a
 *     job in the expectation, which again fails visibly rather than stopping a watch.
 */
export function parseMigrationsForCronJobs(migrationsDir) {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const jobs = {};
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
      .replace(WHOLE_LINE_COMMENT_RE, '');
    for (const m of sql.matchAll(CRON_OP_RE)) {
      const [, op, name, expr] = m;
      if (op === 'unschedule') delete jobs[name];
      else if (expr) jobs[name] = expr;
    }
  }
  return jobs;
}

/**
 * Minutes between runs for the cron expressions this repo uses: `*​/N * * * *`,
 * `M * * * *`, `M *​/H * * *`, `M H * * *`. Returns null for anything else rather than
 * guessing — a wrong tolerance is a false alarm or a blind spot, both worse than an
 * explicit "cannot read this".
 */
export function cronIntervalMinutes(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour] = parts;

  const stepOf = (field) => {
    if (field === '*') return 1;
    const step = /^\*\/(\d+)$/.exec(field);
    if (step) return Number(step[1]);
    if (/^\d+$/.test(field)) return null; // a fixed value: no repetition within this unit
    return undefined; // unreadable
  };

  const minuteStep = stepOf(minute);
  if (minuteStep === undefined) return null;
  if (minuteStep !== null) return minuteStep; // repeats within the hour

  const hourStep = stepOf(hour);
  if (hourStep === undefined) return null;
  if (hourStep !== null) return hourStep * 60; // repeats within the day
  return 24 * 60; // fixed minute and hour: daily
}

/**
 * Postgres renders a timestamptz as `2026-09-09 08:10:00.277543+00` — a space separator
 * and a ONE-part UTC offset. Neither is ISO 8601, and `Date.parse` returns NaN on it:
 * measured against a real Management API response, not inferred. Left unnormalised, the
 * check reports every healthy job as having an unparseable timestamp, so it fails closed
 * on a green database — the loudest possible false alarm.
 *
 * Returns epoch ms, or null when the value is absent or genuinely unreadable.
 */
export function parsePgTimestamp(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isoish = raw
    .replace(' ', 'T')
    // `+0200` → `+02:00`, then `+00` → `+00:00`. The four-digit form is tried first;
    // it cannot re-match the two-digit rule afterwards because that output holds a colon.
    .replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3')
    .replace(/([+-])(\d{2})$/, '$1$2:00');
  const ms = Date.parse(isoish);
  return Number.isNaN(ms) ? null : ms;
}

/** Two intervals of grace, never under 15 minutes. Null when the expression is unreadable. */
export function toleranceMinutes(expr) {
  const interval = cronIntervalMinutes(expr);
  if (interval === null) return null;
  return Math.max(interval * 2, MIN_TOLERANCE_MINUTES);
}

/**
 * Compare the expected jobs against the rows read from prod.
 * `rows`: { jobname, active, last_ok (timestamp string or null), failed_24h }.
 */
export function evaluateJobs(expected, rows, nowMs) {
  const byName = new Map(rows.map((r) => [r.jobname, r]));
  const failures = [];

  for (const [name, schedule] of Object.entries(expected)) {
    const row = byName.get(name);
    if (!row) {
      failures.push(`${name}: not scheduled on the database — a migration creates it, cron.job has no row`);
      continue;
    }
    if (!row.active) {
      failures.push(`${name}: scheduled but inactive`);
      continue;
    }
    if (Number(row.failed_24h) > 0) {
      failures.push(`${name}: ${row.failed_24h} failed run(s) in the last 24h`);
    }
    if (!row.last_ok) {
      failures.push(`${name}: never had a successful run`);
      continue;
    }
    const tolerance = toleranceMinutes(schedule);
    if (tolerance === null) {
      failures.push(`${name}: cron expression ${JSON.stringify(schedule)} could not be read — tolerance unknown, refusing to report health`);
      continue;
    }
    const lastOkMs = parsePgTimestamp(row.last_ok);
    if (lastOkMs === null) {
      failures.push(`${name}: last successful run timestamp ${JSON.stringify(row.last_ok)} is unparseable`);
      continue;
    }
    const ageMin = Math.round((nowMs - lastOkMs) / 60000);
    if (ageMin > tolerance) {
      failures.push(`${name}: no successful run for ${ageMin} min (schedule ${schedule}, tolerance ${tolerance} min)`);
    }
  }

  // Jobs on prod that no migration expects are reported, never failed on: several
  // legitimate jobs have been created out-of-band, and failing here would make this
  // check permanently red and therefore ignored.
  const unexpected = rows.map((r) => r.jobname).filter((n) => !(n in expected)).sort();

  return { ok: failures.length === 0, failures, unexpected };
}

function loadTokenFromEnvFile(projectDir) {
  try {
    const raw = readFileSync(join(projectDir, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('SUPABASE_ACCESS_TOKEN=')) continue;
      return t.slice('SUPABASE_ACCESS_TOKEN='.length).trim();
    }
  } catch { /* optional */ }
  return '';
}

const CRON_SQL = `
SELECT j.jobname,
       j.active,
       (SELECT max(d.start_time) FROM cron.job_run_details d
         WHERE d.jobid = j.jobid AND d.status = 'succeeded') AS last_ok,
       (SELECT count(*) FROM cron.job_run_details d
         WHERE d.jobid = j.jobid AND d.status = 'failed'
           AND d.start_time > now() - interval '24 hours') AS failed_24h
  FROM cron.job j
 ORDER BY j.jobname;`.trim();

export async function fetchCronRows({ projectRef, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CRON_SQL }),
  });
  const text = await res.text();
  // Any 2xx, NOT `=== 200`: this endpoint answers a successful read with **201**
  // (measured against prod on 2026-09-09). Pinning 200 made the check exit 2 on every
  // healthy run — a watcher that reports itself broken whatever the database is doing.
  if (!res.ok) {
    throw new Error(`Management API returned ${res.status}: ${text.slice(0, 300)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Management API returned unparseable JSON: ${text.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Management API returned ${typeof parsed}, expected an array of rows`);
  }
  // Every row must carry the fields evaluateJobs reads. Without this, a response whose
  // SHAPE changed — an API revision, an error object inside a 2xx envelope — flows into
  // the comparison as a set of rows with no jobname, every expected job then looks
  // absent, and the check reports a healthy database as a total cron outage. That
  // inverts this script's one structural promise: exit 2 means the watcher is broken,
  // exit 1 means prod is. Found by adversarial review, 2026-09-09, reproduced with
  // `[{"unexpected":"schema-change"}]`.
  for (const [i, row] of parsed.entries()) {
    if (!row || typeof row !== 'object' || typeof row.jobname !== 'string' || !('active' in row)) {
      throw new Error(
        `Management API row ${i} is not a cron.job row (got ${JSON.stringify(row).slice(0, 120)}) — `
        + 'the query returned an unexpected shape, which is a fault in this check, not in prod',
      );
    }
  }
  return parsed;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectDir = resolve(scriptDir, '..');
  const migrationsDir = join(projectDir, 'supabase', 'migrations');

  let projectRef = PROD_PROJECT_REF;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project-ref') {
      projectRef = argv[++i];
      if (!projectRef) {
        console.error('check-cron-health: --project-ref needs a value');
        process.exit(2);
      }
    } else if (argv[i].startsWith('--project-ref=')) {
      projectRef = argv[i].slice('--project-ref='.length);
      if (!projectRef) {
        console.error('check-cron-health: --project-ref needs a value');
        process.exit(2);
      }
    } else {
      console.error(`check-cron-health: unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN || loadTokenFromEnvFile(projectDir);
  if (!token) {
    console.error('check-cron-health: SUPABASE_ACCESS_TOKEN is not set (env or .env.local).');
    console.error('  In CI this is the SUPABASE_ACCESS_TOKEN repository secret. This is a');
    console.error('  configuration fault in the check, NOT evidence that prod is unhealthy.');
    process.exit(2);
  }

  let expected;
  try {
    expected = parseMigrationsForCronJobs(migrationsDir);
  } catch (err) {
    console.error(`check-cron-health: cannot read migrations — ${err.message}`);
    process.exit(2);
  }
  if (Object.keys(expected).length === 0) {
    console.error('check-cron-health: no cron.schedule found in any migration — refusing to report health on an empty expectation');
    process.exit(2);
  }

  let rows;
  try {
    rows = await fetchCronRows({ projectRef, token });
  } catch (err) {
    console.error(`check-cron-health: ${err.message}`);
    process.exit(2);
  }

  console.log('\n=== pg_cron health ===');
  console.log(`Project: ${projectRef}`);
  console.log(`Expected jobs (from migrations): ${Object.keys(expected).length}\n`);

  const result = evaluateJobs(expected, rows, Date.now());
  for (const [name, schedule] of Object.entries(expected)) {
    const bad = result.failures.filter((f) => f.startsWith(`${name}:`));
    if (bad.length === 0) console.log(`  ✓ ${name}  (${schedule})`);
    else for (const f of bad) console.log(`  ✗ ${f}`);
  }
  if (result.unexpected.length) {
    console.log(`\n  note: on the database but in no migration: ${result.unexpected.join(', ')}`);
  }

  console.log('');
  if (result.ok) {
    console.log(`PASS — ${Object.keys(expected).length}/${Object.keys(expected).length} expected job(s) healthy`);
    process.exit(0);
  }
  console.log(`FAIL — ${result.failures.length} problem(s) across the expected pg_cron jobs`);
  process.exit(1);
}
