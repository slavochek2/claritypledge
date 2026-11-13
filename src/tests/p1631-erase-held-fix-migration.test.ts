/**
 * @file p1631-erase-held-fix-migration.test.ts
 * @description P1631 source contract for 20261113230000_p1631_erase_held_fix.sql. The held set (points a person erasing held) used to be recorded only by a call that the erase_my_account LIVE on TEST
 * does not make; it is now recorded by a statement-level AFTER DELETE trigger on point_positions, whatever erase_my_account's body is.
 *   - the trigger collects per user the points a DELETE statement removed and merges them into the setting that _erase_held_points reads (same name helper);
 *   - the trigger is statement-level with a transition table, AFTER DELETE only, and writes no table;
 *   - the erasure still deletes positions with a plain DELETE statement before it calls erase_chat_data_for (so the trigger fires first), in the repo's newest erase_my_account;
 *   - the function is closed to clients.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113230000_p1631_erase_held_fix.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const raw = read(FILE);
const code = norm(stripComments(raw));

function fnBody(sql: string, name: string): string {
  const c = stripComments(sql);
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).exec(c);
  if (!m) throw new Error(`${name} not found`);
  return norm(c.slice(m.index, c.indexOf('$$;', c.indexOf('AS $$', m.index)) + 3));
}

describe('20261113230000 erase held fix', () => {
  it('the trigger function merges the deleted positions per user into the setting that _erase_held_points reads', () => {
    const b = fnBody(raw, '_record_deleted_positions');
    expect(b).toContain('RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER');
    expect(b).toContain("SET search_path = ''");
    expect(b).toContain('FROM old_rows o WHERE o.user_id IS NOT NULL GROUP BY o.user_id');
    expect(b).toContain('array_agg(DISTINCT o.point_id::text)');
    expect(b).toContain('PERFORM set_config(public._erase_held_setting(r.user_id),');
    expect(b).toContain('current_setting(public._erase_held_setting(r.user_id), true)');
    expect(b).toContain(", ''), true);"); // is_local = true: gone at the end of the transaction
    // it builds no name of its own and writes no table
    expect(b).not.toContain("'p1631.erase_held");
    expect(b).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    // the reader uses the same helper
    const reader = fnBody(read('20261113220000_p1631_erase_held_name.sql'), '_erase_held_points');
    expect(reader).toContain('current_setting(public._erase_held_setting(p_uid), true)');
  });

  it('the trigger is statement-level, AFTER DELETE, with a transition table, on point_positions only', () => {
    expect(code).toContain('CREATE TRIGGER point_positions_record_deleted AFTER DELETE ON public.point_positions REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public._record_deleted_positions();');
    expect((code.match(/CREATE TRIGGER/g) ?? []).length).toBe(1);
    expect(code).toContain('DROP TRIGGER IF EXISTS point_positions_record_deleted ON public.point_positions;');
  });

  it('CONTROL: the check is not vacuous (a row-level or BEFORE variant would not match)', () => {
    const rowLevel = code.replace('FOR EACH STATEMENT', 'FOR EACH ROW');
    expect(rowLevel).not.toContain('FOR EACH STATEMENT EXECUTE FUNCTION public._record_deleted_positions();');
    const before = code.replace('AFTER DELETE ON public.point_positions', 'BEFORE DELETE ON public.point_positions');
    expect(before).not.toContain('CREATE TRIGGER point_positions_record_deleted AFTER DELETE');
  });

  it('the erasure removes positions with a plain DELETE statement before erase_chat_data_for runs, in the repo\'s newest erase_my_account', () => {
    const files = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < FILE && /CREATE OR REPLACE FUNCTION public\.erase_my_account\(/.test(stripComments(read(f)))).sort();
    const newest = files[files.length - 1]!;
    expect(newest).toBe('20261030090000_p1536_p1592_merge_erase_forward.sql');
    const eam = fnBody(read(newest), 'erase_my_account');
    const del = eam.indexOf('DELETE FROM public.point_positions WHERE user_id = v_uid;');
    expect(del).toBeGreaterThan(-1);
    expect(del).toBeLessThan(eam.indexOf('PERFORM public.erase_chat_data_for(v_uid);'));
  });

  it('is closed to every client, restates no function, and says why it is client-safe', () => {
    expect(code).toContain('REVOKE ALL ON FUNCTION public._record_deleted_positions() FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/GRANT EXECUTE/);
    expect((code.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(1);
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
});
