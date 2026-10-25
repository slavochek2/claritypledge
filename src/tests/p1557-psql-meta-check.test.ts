/**
 * P1557: scripts/selfhosted/lib/psql-meta-check.py refuses a migration that carries a psql backslash
 * command outside a string, comment or dollar-quoted body. psql runs these from stdin anywhere on a
 * line, so `SELECT 1; \! id` would run a shell in the db container. The bypass cases are the ones the
 * review found: each makes a naive scanner lose track of where a string or comment ends.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CHECK = path.resolve(__dirname, '../../scripts/selfhosted/lib/psql-meta-check.py');
const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const BS = '\\';

function check(sql: string): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1557-meta-'));
  const file = path.join(dir, 'm.sql');
  fs.writeFileSync(file, sql);
  const r = spawnSync('python3', [CHECK, file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r.status ?? -1;
}

describe('P1557 psql meta-command check', () => {
  it.each([
    ['at line start', `${BS}! id\n`],
    ['after a statement', `SELECT 1; ${BS}! id\n`],
    ['after a block comment', `/* x */ ${BS}c postgres\n`],
    ['after a standard string ending in a backslash', `SELECT 'a${BS}'; ${BS}! id; -- '\n`],
    ['after a nested comment closes', `/* /* */ */ ${BS}! id\n`],
    ['after a quoted identifier holding a quote', `SELECT "col'name" FROM t; ${BS}! id; -- '\n`],
  ])('refuses a backslash command %s', (_label, sql) => {
    expect(check(sql)).toBe(1);
  });

  it.each([
    ['inside a standard string', `SELECT 'a${BS}b';\n`],
    ['inside an E-string, with an escaped quote', `SELECT E'${BS}d+ ${BS}' still in';\n`],
    ['inside a line comment', `-- ${BS}! id\nSELECT 1;\n`],
    ['inside a nested comment', `/* outer /* ${BS}! id */ still comment ${BS}c x */ SELECT 1;\n`],
    ['inside a dollar-quoted body', `DO $$ BEGIN RAISE NOTICE '${BS}x'; END $$;\n`],
    ['inside a tagged dollar-quoted body', `CREATE FUNCTION f() RETURNS text LANGUAGE sql AS $fn$ SELECT '${BS}!' $fn$;\n`],
    ['inside a quoted identifier', `SELECT 1 AS "a${BS}b";\n`],
  ])('allows a backslash %s', (_label, sql) => {
    expect(check(sql)).toBe(0);
  });

  it('every real migration passes (the check must not block the existing workflow)', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => path.join(MIGRATIONS, f));
    expect(files.length).toBeGreaterThan(400);
    const r = spawnSync('python3', [CHECK, ...files], { encoding: 'utf8' });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});
