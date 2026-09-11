/**
 * @file p1283-cron-health-snapshot.spec.ts
 * @description P1283 C — cron job health is a public read of exactly four fields.
 *
 * P270 coverage — this file is the integration test for:
 *   - 20260911100000_p1283_b_narrow_cron_health_reader            (superseded by C, removed by D)
 *   - 20260911163000_p1283_c_cron_health_snapshot_is_a_public_read
 *   - 20260911163100_p1283_d_remove_the_database_login_reader
 *
 * WHAT THIS PROVES. The CI path end to end: the exact REST request .github/workflows/cron-health.yml
 * makes, with the anon key, fed into the real checker — so a change in how PostgREST serializes a
 * column (a bigint arriving as a string, say) fails here rather than as a "check not running" issue.
 *
 * WHAT IT CANNOT SEE (epistemic gate 7b). B and D act on a database role and a schema PostgREST never
 * served, so neither is observable over HTTP. Both are asserted by their own verification blocks at
 * apply time, and the reader's real reach was measured with a real login through the pooler
 * (features/p1283_cron_health_check.md, fourth pass).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const FIELDS = ['active', 'failed_24h', 'jobname', 'last_ok'];

function anon() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// The request the workflow makes, byte for byte — raw fetch, not supabase-js, so a difference in how
// the client library shapes a call cannot hide a difference in what CI receives.
async function workflowRead(): Promise<{ status: number; text: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cron_health_snapshot`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return { status: res.status, text: await res.text() };
}

test.describe('P1283 C: cron job health is a public read of four fields', () => {
  test('CONTROL: the harness reaches PostgREST — an anon-callable RPC answers without error', async () => {
    // Without this, a failure below could be a network or key fault rather than the function.
    const { error } = await anon().rpc('get_session_by_code', { p_code: 'ZZZZZZ' });
    expect(error, `control failed — the harness cannot reach PostgREST at all: ${error?.message}`).toBeNull();
  });

  test('anon reads the snapshot with the request the workflow makes, and every row is typed', async () => {
    const { status, text } = await workflowRead();
    expect(status, `expected 200, got ${status}: ${text.slice(0, 300)}`).toBe(200);
    const rows = JSON.parse(text);
    expect(Array.isArray(rows), 'the snapshot is not an array').toBe(true);
    expect(rows.length, 'test schedules pg_cron jobs; an empty snapshot means the function sees none of them').toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort(), `row carries fields beyond the four: ${JSON.stringify(row)}`).toEqual(FIELDS);
      expect(typeof row.jobname).toBe('string');
      expect(typeof row.active).toBe('boolean');
      expect(row.last_ok === null || typeof row.last_ok === 'string', `last_ok: ${JSON.stringify(row.last_ok)}`).toBe(true);
      expect(
        Number.isInteger(row.failed_24h) && row.failed_24h >= 0,
        `failed_24h arrived as ${JSON.stringify(row.failed_24h)} — a bigint must reach JSON as a number`,
      ).toBe(true);
    }
  });

  test('the snapshot carries nothing from a job command or an HTTP response', async () => {
    // Job commands on this project are SQL with net.http_post URLs and headers, and return_message
    // can echo an HTTP body. None of that may reach a caller who needs no key.
    const { status, text } = await workflowRead();
    // Without the status check this passes on a 404 error body too — blind whenever the function is missing.
    expect(status, `expected 200, got ${status}: ${text.slice(0, 300)}`).toBe(200);
    expect(text).not.toMatch(/net\.|https?:|bearer|authorization|apikey|select\s|delete\s|insert\s/i);
  });

  test('the real checker scores the rows — it never refuses them as an unreadable shape', async () => {
    const { text } = await workflowRead();
    const dir = mkdtempSync(join(tmpdir(), 'p1283c-'));
    try {
      const rowsPath = join(dir, 'rows.json');
      writeFileSync(rowsPath, text);
      const r = spawnSync(
        process.execPath,
        [resolve('scripts/check-cron-health.mjs'), '--rows-file', rowsPath],
        { env: { ...process.env, SUPABASE_ACCESS_TOKEN: '' }, encoding: 'utf8' },
      );
      // 0 or 1 is a verdict about the database. 2 would mean the CI path cannot read what it is given.
      expect([0, 1], `checker exit ${r.status}:\n${r.stdout}${r.stderr}`).toContain(r.status);
      expect(r.stdout).toMatch(/Expected jobs \(from migrations\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
