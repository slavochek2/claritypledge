/**
 * P1729: signing in must not wipe a hand-set profile banner.
 *
 * Every /auth/callback run calls upsert_my_profile with a p_data built by AuthCallbackPage, which
 * carries no bio / banner_url / banner_generation_attempted. If the function's ON CONFLICT branch
 * assigns those columns from EXCLUDED, a returning user's sign-in sets banner_url = NULL and
 * banner_generation_attempted = false, and the owner's next profile visit runs the P504 lazy
 * generation over the hand-set banner (prod incidents 2026-11-01 and 2026-11-25).
 *
 * This reads the LATEST migration that defines the function (the one prod runs once applied) and
 * checks each of the three columns keeps the stored value when p_data omits the key.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');
const DEF = /CREATE OR REPLACE FUNCTION public\.upsert_my_profile\(/;

function latestUpsertBody(): { file: string; onConflict: string } {
  const files = readdirSync(MIGRATIONS).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort();
  const file = files.filter(f => DEF.test(readFileSync(join(MIGRATIONS, f), 'utf8'))).pop();
  if (!file) throw new Error('no migration defines upsert_my_profile');
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
  const start = sql.search(DEF);
  const end = sql.indexOf('$$;', sql.indexOf('AS $$', start) + 5);
  const body = sql.slice(start, end);
  const onConflict = body.slice(body.indexOf('ON CONFLICT (id) DO UPDATE SET'));
  return { file, onConflict };
}

describe('P1729: upsert_my_profile keeps columns the caller did not send', () => {
  const { file, onConflict } = latestUpsertBody();

  it('found the ON CONFLICT branch (control: the parser is not blind)', () => {
    expect(onConflict).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(onConflict).toMatch(/name\s*=\s*EXCLUDED\.name/);
  });

  for (const col of ['banner_url', 'banner_generation_attempted', 'bio']) {
    it(`${col}: not overwritten when p_data has no '${col}' key (${file})`, () => {
      const line = onConflict.split('\n').find(l => new RegExp(`^\\s*${col}\\s*=`).test(l));
      expect(line, `${col} assignment in ON CONFLICT`).toBeDefined();
      // The unconditional form is the bug: `${col} = EXCLUDED.${col},`
      expect(line).not.toMatch(new RegExp(`^\\s*${col}\\s*=\\s*EXCLUDED\\.${col}\\s*,?\\s*$`));
      // Parse both arms so a swapped CASE fails: key present -> EXCLUDED value, absent -> stored.
      const m = line!.match(/CASE\s+WHEN\s+p_data\s*\?\s*'([a-z_]+)'\s+THEN\s+(\S+)\s+ELSE\s+(\S+)\s+END/);
      expect(m, `${col} is a CASE on the p_data key`).not.toBeNull();
      const [, key, whenPresent, whenAbsent] = m!;
      expect(key).toBe(col);
      expect(whenPresent).toBe(`EXCLUDED.${col}`);
      expect(whenAbsent).toBe(`public.profiles.${col}`);
    });
  }

  it("AuthCallbackPage's p_data still omits the three keys (the input that triggered the wipe)", () => {
    const src = readFileSync(join(__dirname, '../auth/AuthCallbackPage.tsx'), 'utf8');
    const block = src.slice(src.indexOf('const upsertData = {'), src.indexOf('};', src.indexOf('const upsertData = {')));
    expect(block.length).toBeGreaterThan(50);
    for (const col of ['banner_url', 'banner_generation_attempted', 'bio']) {
      expect(block).not.toMatch(new RegExp(`\\b${col}\\s*:`));
    }
  });
});
