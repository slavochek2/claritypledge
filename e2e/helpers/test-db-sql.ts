/**
 * P1606: raw SQL on the TEST database this run targets.
 *
 * Self-hosted goes through scripts/selfhosted/run-test-sql.sh (IAP SSH to postgres-meta, the engine
 * behind Supabase's /database/query). Hosted goes through the Management API, for a deliberate run
 * after the founder has switched hosted TEST on. Both treat one call as one implicit transaction and
 * return the rows of the last row-returning statement. Anything else, prod above all, is refused.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELFHOSTED_TEST_REF, isHostedTestUrl, testRefForUrl } from '../../scripts/lib/test-target.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The database refused the SQL, as distinct from "the query could not be sent". */
export class TestDbSqlError extends Error {}

function fromEnvLocal(name: string): string {
  const file = path.join(REPO_ROOT, '.env.local');
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

async function viaManagementApi(url: string, sql: string, readOnly: boolean): Promise<unknown> {
  const ref = new URL(url).hostname.split('.')[0];
  const token = readOnly
    ? fromEnvLocal('SUPABASE_READONLY_TOKEN')
    : fromEnvLocal('SUPABASE_TEST_WRITE_TOKEN');
  if (!token) throw new Error(`no ${readOnly ? 'read-only' : 'test write'} token in .env.local; raw SQL cannot run`);
  const endpoint = readOnly ? '/database/query/read-only' : '/database/query';
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new TestDbSqlError(`test DB query failed (${res.status}): ${body}`);
  return JSON.parse(body);
}

function viaSelfHosted(sql: string, readOnly: boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = readOnly ? ['--read-only'] : [];
    const child = spawn(path.join(REPO_ROOT, 'scripts/selfhosted/run-test-sql.sh'), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); } catch { reject(new Error(`unparseable SQL result: ${out.slice(0, 200)}`)); }
      } else if (code === 3) {
        reject(new TestDbSqlError(`test DB query failed: ${err.trim()}`));
      } else {
        reject(new Error(`raw SQL could not run (exit ${code}): ${err.trim()}`));
      }
    });
    child.stdin.end(sql);
  });
}

export async function testDbSql<T = Record<string, unknown>>(
  sql: string,
  { readOnly = false }: { readOnly?: boolean } = {},
): Promise<T[]> {
  const url = process.env.VITE_SUPABASE_URL ?? '';
  if (testRefForUrl(url, process.env) === SELFHOSTED_TEST_REF) return (await viaSelfHosted(sql, readOnly)) as T[];
  if (isHostedTestUrl(url, process.env)) return (await viaManagementApi(url, sql, readOnly)) as T[];
  throw new Error(`refusing to run raw SQL against ${url || 'an unknown server'}: TEST servers only`);
}
