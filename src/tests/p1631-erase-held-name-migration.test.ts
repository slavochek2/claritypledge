/**
 * @file p1631-erase-held-name-migration.test.ts
 * @description P1631 source contract for 20261113220000_p1631_erase_held_name.sql (fix of 20261113210000, whose setting name held a uuid's dashes and made every erase_my_account fail with 42602):
 *   - the name is built by ONE helper whose expression, evaluated here on a uuid, is a valid custom setting name (letters, digits, underscores);
 *   - the writer (_erase_lock_canvas_owners) and the reader (_erase_held_points) both go through it and neither builds a name of its own;
 *   - _erase_lock_canvas_owners is its newest earlier body with its three `erase scoped` lines replaced by three marked lines.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113220000_p1631_erase_held_name.sql';
const MARK = '-- P1631 erase held name';
const OLD_MARK = '-- P1631 erase scoped';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const raw = read(FILE);

function fnBody(sql: string, name: string): string {
  const c = stripComments(sql);
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).exec(c);
  if (!m) throw new Error(`${name} not found`);
  return norm(c.slice(m.index, c.indexOf('$$;', c.indexOf('AS $$', m.index)) + 3));
}
function newestBefore(name: string, before: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < before && re.test(stripComments(read(f)))).sort();
  return defs[defs.length - 1]!;
}
const without = (s: string, mark: string) => s.split('\n').filter((l) => !l.includes(mark)).join('\n');

/** the SQL expression of the helper, evaluated in TS: 'p1631.erase_held_' || replace(p_uid::text, '-', '') */
const settingName = (uuid: string) => 'p1631.erase_held_' + uuid.replace(/-/g, '');
/** a custom setting name: two or more identifiers of letters, digits and underscores, separated by dots */
const VALID_SETTING = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;

describe('20261113220000 erase held name', () => {
  it('the helper builds the name as prefix + the uuid without dashes, and that is a valid setting name', () => {
    const helper = fnBody(raw, '_erase_held_setting');
    expect(helper).toContain("SELECT 'p1631.erase_held_' || replace(p_uid::text, '-', '');");
    expect(helper).toContain('IMMUTABLE');
    for (let i = 0; i < 50; i++) {
      const id = randomUUID();
      const name = settingName(id);
      expect(name, id).not.toContain('-');
      expect(name, id).toMatch(VALID_SETTING);
    }
  });

  it('CONTROL: the earlier expression (the dashes kept) is NOT a valid setting name, so the check can fail', () => {
    const id = randomUUID();
    expect(('p1631.erase_held.' + id)).not.toMatch(VALID_SETTING);
    expect(norm(stripComments(read('20261113210000_p1631_erase_scoped_sweep.sql')))).toContain("'p1631.erase_held.' || p_uid::text");
  });

  it('writer and reader both use the helper and neither builds a name of its own', () => {
    for (const fn of ['_erase_lock_canvas_owners', '_erase_held_points']) {
      const b = fnBody(raw, fn);
      expect(b, fn).toContain('public._erase_held_setting(p_uid)');
      expect(b, fn).not.toContain("'p1631.erase_held");
    }
    const w = fnBody(raw, '_erase_lock_canvas_owners');
    expect(w).toContain('PERFORM set_config(public._erase_held_setting(p_uid),');
    expect(w).toContain('current_setting(public._erase_held_setting(p_uid), true)');
    expect(w).toContain(", ''), true);");
    // the lock loop stays first
    expect(w.indexOf('END LOOP;')).toBeLessThan(w.indexOf('set_config'));
    // the only place in the file that spells the prefix is the helper
    expect(norm(stripComments(raw)).split("'p1631.erase_held").length - 1).toBe(1);
  });

  it('_erase_lock_canvas_owners is its newest earlier body, with its three `erase scoped` lines replaced by three marked lines', () => {
    expect(newestBefore('_erase_lock_canvas_owners', FILE)).toBe('20261113210000_p1631_erase_scoped_sweep.sql');
    const mine = fnBody(without(raw, MARK), '_erase_lock_canvas_owners');
    const theirs = fnBody(without(read('20261113210000_p1631_erase_scoped_sweep.sql'), OLD_MARK), '_erase_lock_canvas_owners');
    expect(mine).toBe(theirs);
  });

  it('CONTROL: an unmarked change, or an unmarked added line, is caught by the same comparison', () => {
    const prev = fnBody(without(read('20261113210000_p1631_erase_scoped_sweep.sql'), OLD_MARK), '_erase_lock_canvas_owners');
    const changed = raw.replace('ORDER BY x.owner_id', 'ORDER BY x.owner_id DESC');
    expect(changed).not.toBe(raw);
    expect(fnBody(without(changed, MARK), '_erase_lock_canvas_owners')).not.toBe(prev);
    const lines = raw.split('\n');
    const i = lines.findIndex((l) => l.includes('PERFORM set_config(public._erase_held_setting'));
    expect(i).toBeGreaterThan(-1);
    lines[i] = lines[i]!.replace(MARK, '');
    expect(fnBody(without(lines.join('\n'), MARK), '_erase_lock_canvas_owners')).not.toBe(prev);
  });

  it('_erase_held_points keeps its signature, STABLE definer, and every new or replaced function stays closed to clients', () => {
    const h = fnBody(raw, '_erase_held_points');
    expect(h).toContain('RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER');
    const code = norm(stripComments(raw));
    for (const f of ['_erase_held_setting(uuid)', '_erase_lock_canvas_owners(uuid)', '_erase_held_points(uuid)']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
    expect(code).not.toMatch(/GRANT EXECUTE/);
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
});
