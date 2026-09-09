/**
 * P1283 — pg_cron jobs are scheduled by migrations and nothing checks them.
 *
 * The properties pinned here:
 *  1. The expected-job list is DERIVED from the migrations, and `cron.unschedule`
 *     subtracts in filename order. A second hardcoded list would drift, and the drift
 *     would be invisible — which is how the P1256 job stayed broken for three months.
 *  2. Tolerance comes from each job's OWN cron expression, not one global window.
 *  3. The failure paths fire: missing job, inactive job, stale job, failed runs.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  parseMigrationsForCronJobs,
  cronIntervalMinutes,
  toleranceMinutes,
  evaluateJobs,
  parsePgTimestamp,
  fetchCronRows,
  cronRowShapeProblem,
} from '../../scripts/check-cron-health.mjs';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

function fixtureDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'p1283-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('P1283 — expected jobs derived from migrations', () => {
  it('finds every cron.schedule in the real migrations directory', () => {
    const jobs = parseMigrationsForCronJobs(MIGRATIONS_DIR);
    expect(Object.keys(jobs).sort()).toEqual([
      'cleanup_expired_ready_submissions',
      'cleanup_stale_live_invites',
      'dispatch_event_emails',
    ]);
    expect(jobs.dispatch_event_emails).toBe('*/30 * * * *');
    expect(jobs.cleanup_expired_ready_submissions).toBe('*/5 * * * *');
    expect(jobs.cleanup_stale_live_invites).toBe('0 * * * *');
  });

  // P1283's repair migration is the one file in the tree that both unschedules and
  // reschedules the SAME job, and whose prose and RAISE strings name that job several
  // more times. Parsed alone it must resolve to exactly one expectation: the two calls
  // must net to "present" in text order, and no comment or error-message mention may
  // invent a second job. Without this, the repair could silently drop the very job it
  // exists to create, and the health check would then agree with prod that nothing is
  // expected — the exact blindness this whole spec is about.
  it('the P1283 repair migration resolves, alone, to exactly the one job it creates', () => {
    const file = '20260909120000_p1283_schedule_stale_live_invites_cleanup.sql';
    const dir = fixtureDir({ [file]: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({
        cleanup_stale_live_invites: '0 * * * *',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a later migration unscheduling a job removes it from the expectation', () => {
    const dir = fixtureDir({
      '20260101000000_add.sql': "PERFORM cron.schedule(\n  'legacy_job',\n  '0 */6 * * *',\n  $job$ SELECT 1; $job$\n);",
      '20260202000000_remove.sql': "PERFORM cron.unschedule('legacy_job');",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unschedule BEFORE the schedule does not remove it (filename order matters)', () => {
    const dir = fixtureDir({
      '20260101000000_remove.sql': "PERFORM cron.unschedule('later_job');",
      '20260202000000_add.sql': "PERFORM cron.schedule(\n  'later_job',\n  '*/15 * * * *',\n  $job$ SELECT 1; $job$\n);",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ later_job: '*/15 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('P1283 — tolerance is per job, from its own cron expression', () => {
  it('reads the minute and hour fields', () => {
    expect(cronIntervalMinutes('*/5 * * * *')).toBe(5);
    expect(cronIntervalMinutes('*/30 * * * *')).toBe(30);
    expect(cronIntervalMinutes('0 * * * *')).toBe(60);
    expect(cronIntervalMinutes('0 */6 * * *')).toBe(360);
    expect(cronIntervalMinutes('0 3 * * *')).toBe(1440);
  });

  it('doubles the interval with a 15-minute floor', () => {
    expect(toleranceMinutes('*/5 * * * *')).toBe(15);
    expect(toleranceMinutes('*/30 * * * *')).toBe(60);
    expect(toleranceMinutes('0 */6 * * *')).toBe(720);
  });

  it('returns null for an expression it cannot read, rather than guessing', () => {
    expect(cronIntervalMinutes('@weekly')).toBeNull();
  });
});

describe('P1283 — evaluation', () => {
  const now = Date.parse('2026-09-08T17:00:00Z');
  const expected = { dispatch_event_emails: '*/30 * * * *' };

  const healthyRow = {
    jobname: 'dispatch_event_emails',
    active: true,
    last_ok: '2026-09-08 16:50:00.277543+00',
    failed_24h: 0,
  };

  it('passes a job that ran successfully inside its tolerance', () => {
    const r = evaluateJobs(expected, [healthyRow], now);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('fails a job that is absent from cron.job entirely', () => {
    const r = evaluateJobs(expected, [], now);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/not scheduled/i);
    expect(r.failures.join(' ')).toContain('dispatch_event_emails');
  });

  it('fails a job that exists but is inactive', () => {
    const r = evaluateJobs(expected, [{ ...healthyRow, active: false }], now);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/inactive/i);
  });

  it('fails a job whose last success is older than its tolerance', () => {
    const r = evaluateJobs(expected, [{ ...healthyRow, last_ok: '2026-09-08 14:00:00.118220+00' }], now);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/no successful run/i);
  });

  it('fails a job that has never succeeded', () => {
    const r = evaluateJobs(expected, [{ ...healthyRow, last_ok: null }], now);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/never/i);
  });

  it('fails a job with failed runs in the last 24h even when it also succeeded', () => {
    const r = evaluateJobs(expected, [{ ...healthyRow, failed_24h: 328 }], now);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('328');
  });

  it('ignores a job on prod that no migration expects, rather than failing on it', () => {
    const r = evaluateJobs(expected, [healthyRow, { jobname: 'ad_hoc', active: true, last_ok: null, failed_24h: 0 }], now);
    expect(r.ok).toBe(true);
    expect(r.unexpected).toEqual(['ad_hoc']);
  });

  it('flags a migration-declared job that prod does not have (the real 2026-09-09 prod state)', () => {
    const real = parseMigrationsForCronJobs(MIGRATIONS_DIR);
    const prodRows = [
      { jobname: 'cleanup_expired_ready_submissions', active: true, last_ok: '2026-09-08 16:55:00+00', failed_24h: 0 },
      { jobname: 'dispatch_event_emails', active: true, last_ok: '2026-09-08 16:50:00.277543+00', failed_24h: 0 },
    ];
    const r = evaluateJobs(real, prodRows, now);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('cleanup_stale_live_invites');
  });
});

describe('P1283 — the two defects that made the first draft of this check useless', () => {
  // Both were found by running the check against prod on 2026-09-09. Neither is
  // hypothetical: the first draft exited 2 on every possible run, and would then have
  // exited 1 on every healthy job. A watcher that cannot report health is worse than no
  // watcher, because the alarm it raises is indistinguishable from a real outage.

  it('parses the timestamptz shape Postgres actually returns (space separator, one-part offset)', () => {
    // The literal below is copied from a real Management API response.
    expect(parsePgTimestamp('2026-09-09 08:10:00.277543+00'))
      .toBe(Date.parse('2026-09-09T08:10:00.277543Z'));
    // Date.parse on the raw form is NaN — this is the bug, pinned so it cannot return.
    expect(Number.isNaN(Date.parse('2026-09-09T08:10:00.277543+00'))).toBe(true);
  });

  it('parses the other offset spellings, and refuses the unreadable', () => {
    expect(parsePgTimestamp('2026-09-09 08:10:00+02:00')).toBe(Date.parse('2026-09-09T06:10:00Z'));
    expect(parsePgTimestamp('2026-09-09 08:10:00+0200')).toBe(Date.parse('2026-09-09T06:10:00Z'));
    expect(parsePgTimestamp('2026-09-09 08:10:00-05')).toBe(Date.parse('2026-09-09T13:10:00Z'));
    expect(parsePgTimestamp('2026-09-09T08:10:00Z')).toBe(Date.parse('2026-09-09T08:10:00Z'));
    expect(parsePgTimestamp(null)).toBeNull();
    expect(parsePgTimestamp('')).toBeNull();
    expect(parsePgTimestamp('not a timestamp')).toBeNull();
  });

  it('a healthy prod row evaluates as healthy end to end', () => {
    // The regression this pins: with the unfixed parser every row below produced
    // "timestamp is unparseable" and the check exited 1 on a perfectly healthy database.
    const expected = { dispatch_event_emails: '*/30 * * * *', cleanup_expired_ready_submissions: '*/5 * * * *' };
    const rows = [
      { jobname: 'cleanup_expired_ready_submissions', active: true, last_ok: '2026-09-09 08:10:00.277543+00', failed_24h: 0 },
      { jobname: 'dispatch_event_emails', active: true, last_ok: '2026-09-09 08:00:00.226838+00', failed_24h: 0 },
    ];
    const r = evaluateJobs(expected, rows, Date.parse('2026-09-09T08:14:35Z'));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('accepts HTTP 201 from the Management API query endpoint, not only 200', async () => {
    // Measured: a successful POST to /database/query answers 201. The first draft
    // tested `status !== 200` and threw on every successful read.
    const rows = [{ jobname: 'dispatch_event_emails', active: true, last_ok: null, failed_24h: 0 }];
    const fetchImpl = async () => ({ ok: true, status: 201, text: async () => JSON.stringify(rows) });
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl })).resolves.toEqual(rows);
  });

  it('still throws on a real HTTP error, and names the status', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"message":"Unauthorized"}' });
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl })).rejects.toThrow(/401/);
  });

  it('throws when the endpoint answers 200 with something that is not an array of rows', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '{"message":"nope"}' });
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl })).rejects.toThrow(/expected an array/);
  });
});

describe('P1283 — the migration parser against the shapes the repo actually contains', () => {
  it('does not let a later unschedule of a NEAR-IDENTICAL name remove a live job', () => {
    // The real pair: 20260907140000 schedules `dispatch_event_emails` (underscore) and
    // 20260907160000 unschedules the legacy `dispatch-event-emails` (hyphen). One
    // character apart, four minutes apart in filename order. A parser that normalised
    // separators would silently stop watching the job that replaced the broken one.
    const dir = fixtureDir({
      '20260907140000_add.sql': "PERFORM cron.schedule(\n  'dispatch_event_emails',\n  '*/30 * * * *',\n  $job$ SELECT 1; $job$\n);",
      '20260907160000_drop_legacy.sql': "PERFORM cron.unschedule('dispatch-event-emails');",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ dispatch_event_emails: '*/30 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles the unschedule-then-reschedule idempotency pattern inside one file', () => {
    // 20260907140000 does exactly this. Read in text order the unschedule would delete
    // the job the next statement creates, and the check would watch nothing.
    const dir = fixtureDir({
      '20260907140000_p1256.sql':
        "PERFORM cron.unschedule('dispatch_event_emails')\n  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch_event_emails');\n" +
        "PERFORM cron.schedule(\n  'dispatch_event_emails',\n  '*/30 * * * *',\n  $job$ SELECT 1; $job$\n);",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ dispatch_event_emails: '*/30 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('P1283 — defects found by adversarial review (codex, 2026-09-09)', () => {
  it('a job scheduled then unscheduled LATER IN THE SAME FILE is not expected', () => {
    // The unschedule-first draft returned {doomed: '*/5 * * * *'} here, so the check
    // would have opened a "pg_cron job unhealthy" incident for a job the migration
    // deliberately removed — an alarm nobody can ever clear, on a correct database.
    const dir = fixtureDir({
      '20260101000000_add_then_remove.sql':
        "SELECT cron.schedule('doomed', '*/5 * * * *', 'SELECT 1');\nSELECT cron.unschedule('doomed');\n",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still keeps a job whose file unschedules it BEFORE rescheduling it', () => {
    // The control for the test above: the repo's real idempotency shape must survive
    // the ordering fix. A parser that satisfies one of these and not the other is
    // exactly as broken, in the opposite direction.
    const dir = fixtureDir({
      '20260907140000_p1256.sql':
        "PERFORM cron.unschedule('dispatch_event_emails')\n  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch_event_emails');\n" +
        "PERFORM cron.schedule(\n  'dispatch_event_emails',\n  '*/30 * * * *',\n  $job$ SELECT 1; $job$\n);",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ dispatch_event_emails: '*/30 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a commented-out schedule does not invent an expected job', () => {
    const dir = fixtureDir({
      '20260101000000_commented.sql':
        "-- PERFORM cron.schedule('never_real', '*/5 * * * *', 'SELECT 1');\n"
        + "PERFORM cron.schedule('real_one', '0 * * * *', 'SELECT 1');\n",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ real_one: '0 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the real migrations still resolve to the same three jobs after the ordering fix', () => {
    const jobs = parseMigrationsForCronJobs(MIGRATIONS_DIR);
    expect(Object.keys(jobs).sort()).toEqual([
      'cleanup_expired_ready_submissions',
      'cleanup_stale_live_invites',
      'dispatch_event_emails',
    ]);
  });

  it('a response whose ROW SHAPE is wrong exits as a broken check, not a prod outage', async () => {
    // Reproduced by the reviewer: `[{"unexpected":"schema-change"}]` used to reach
    // evaluateJobs, where every expected job then looked absent — a healthy database
    // reported as a total cron outage, under the wrong incident title.
    const fetchImpl = async () => ({ ok: true, status: 201, text: async () => '[{"unexpected":"schema-change"}]' });
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl })).rejects.toThrow(/not a cron\.job row/);
  });

  it('a row missing only `active` is also refused', async () => {
    const fetchImpl = async () => ({ ok: true, status: 201, text: async () => '[{"jobname":"a","last_ok":null}]' });
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl })).rejects.toThrow(/not a cron\.job row/);
  });

  it('a well-formed row is still accepted', async () => {
    const rows = [{ jobname: 'a', active: true, last_ok: '2026-09-09 08:10:00.277543+00', failed_24h: 0 }];
    const fetchImpl = async () => ({ ok: true, status: 201, text: async () => JSON.stringify(rows) });
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl })).resolves.toEqual(rows);
  });
});

describe('P1283 — non-executable SQL must never create an expectation', () => {
  // Both shapes below were reproduced against the shipped parser before the fix:
  // a block comment produced `{"phantom":"0 3 * * *"}`, and a trailing `--` comment was
  // unreachable by the whole-line regex. Either one raises an incident that no change to
  // the database can clear, because the job it names cannot exist.
  it('a BLOCK comment does not invent a job', () => {
    const dir = fixtureDir({
      '20260101000000_doc.sql':
        "/* docs: cron.schedule('phantom', '0 3 * * *', 'SELECT 1') */\n"
        + "PERFORM cron.schedule('real_one', '0 * * * *', 'SELECT 1');\n",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ real_one: '0 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('NESTED block comments are closed at the right depth, as Postgres closes them', () => {
    const dir = fixtureDir({
      '20260101000000_nested.sql':
        "/* outer /* inner cron.schedule('phantom_a', '0 3 * * *') */ still commented"
        + " cron.schedule('phantom_b', '0 4 * * *') */\n"
        + "PERFORM cron.schedule('real_one', '0 * * * *', 'SELECT 1');\n",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ real_one: '0 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a TRAILING -- comment after real code does not invent a job', () => {
    const dir = fixtureDir({
      '20260101000000_trailing.sql':
        "PERFORM cron.schedule('real_one', '0 * * * *', 'SELECT 1');"
        + " -- superseded cron.schedule('phantom', '0 3 * * *')\n",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({ real_one: '0 * * * *' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The false-positive direction (gate 7c). The old parser left trailing comments alone
  // for a real reason — `--` and `/*` also occur inside string literals — so the fix has
  // to be proven not to eat a live command.
  it('a -- inside a string literal is data, not a comment', () => {
    const dir = fixtureDir({
      '20260101000000_literal.sql':
        "PERFORM cron.schedule(\n  'real_one',\n  '0 * * * *',\n"
        + "  $job$ UPDATE t SET note = 'a -- b /* c' WHERE x; $job$\n);\n"
        + "PERFORM cron.schedule('second_one', '*/5 * * * *', 'SELECT 1');\n",
    });
    try {
      expect(parseMigrationsForCronJobs(dir)).toEqual({
        real_one: '0 * * * *',
        second_one: '*/5 * * * *',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the real migrations are unchanged by the comment stripper', () => {
    expect(parseMigrationsForCronJobs(MIGRATIONS_DIR)).toEqual({
      cleanup_expired_ready_submissions: '*/5 * * * *',
      cleanup_stale_live_invites: '0 * * * *',
      dispatch_event_emails: '*/30 * * * *',
    });
  });
});

describe('P1283 — a row must never be scored green on telemetry that never arrived', () => {
  const ok = async (rows: unknown) => async () => ({
    ok: true, status: 201, text: async () => JSON.stringify(rows),
  });

  it('refuses a row with no failed_24h — NaN > 0 is false, so it would read as zero failures', async () => {
    const fetchImpl = await ok([{ jobname: 'a', active: true, last_ok: '2026-09-09 08:10:00+00' }]);
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl }))
      .rejects.toThrow(/failed_24h is not a number/);
  });

  it('refuses `active` as the string "false" — a truthy value for a disabled job', async () => {
    const fetchImpl = await ok([{ jobname: 'a', active: 'false', last_ok: null, failed_24h: 0 }]);
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl }))
      .rejects.toThrow(/active is not a boolean/);
  });

  it('refuses an absent last_ok, which is not the same claim as "never succeeded"', async () => {
    const fetchImpl = await ok([{ jobname: 'a', active: true, failed_24h: 0 }]);
    await expect(fetchCronRows({ projectRef: 'x', token: 'y', fetchImpl }))
      .rejects.toThrow(/last_ok is absent/);
  });

  it('refuses null and empty-string failed_24h, both of which coerce to 0', () => {
    expect(cronRowShapeProblem({ jobname: 'a', active: true, last_ok: null, failed_24h: null }))
      .toMatch(/failed_24h/);
    expect(cronRowShapeProblem({ jobname: 'a', active: true, last_ok: null, failed_24h: '' }))
      .toMatch(/failed_24h/);
  });

  // Gate 7c: the exact rows prod returned on 2026-09-09 must still pass, or the stricter
  // validation has replaced a false green with a permanent false exit 2.
  it('accepts the real prod response verbatim', () => {
    const prodRows = [
      { jobname: 'cleanup_expired_ready_submissions', active: true, last_ok: '2026-09-09 10:35:00.211668+00', failed_24h: 0 },
      { jobname: 'dispatch_event_emails', active: true, last_ok: '2026-09-09 10:30:00.049536+00', failed_24h: 0 },
    ];
    for (const row of prodRows) expect(cronRowShapeProblem(row)).toBeNull();
  });

  it('accepts a job that has never succeeded (last_ok null) — that is a real prod state', () => {
    expect(cronRowShapeProblem({ jobname: 'a', active: true, last_ok: null, failed_24h: 3 })).toBeNull();
  });
});
