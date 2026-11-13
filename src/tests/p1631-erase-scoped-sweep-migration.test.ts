/**
 * @file p1631-erase-scoped-sweep-migration.test.ts
 * @description P1631 source contract for 20261113210000_p1631_erase_scoped_sweep.sql:
 *   - each replaced function is its newest earlier body plus only the marked lines (the two orphan sweeps replace the one line that ended their statement);
 *   - both sweeps are scoped to points the person erasing held, recorded by _erase_lock_canvas_owners before erase_my_account deletes their positions;
 *   - a refused draft's suggestions are cleared before the ref is removed;
 *   - every new or replaced function stays closed to clients.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113210000_p1631_erase_scoped_sweep.sql';
const MARK = '-- P1631 erase scoped';
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
const unmarked = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');
/** the one old line the marked pair replaces */
const OLD_SWEEP_END = 'lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid);';
const dropOld = (s: string) => {
  expect(s.split('\n').filter((l) => l.includes(OLD_SWEEP_END)).length, 'the old sweep line is in the earlier body once').toBe(1);
  return s.split('\n').filter((l) => !l.includes(OLD_SWEEP_END)).join('\n');
};

const PREV: Record<string, string> = {
  _erase_lock_canvas_owners: '20261030090000_p1536_p1592_merge_erase_forward.sql',
  _clarify_erase_person: '20261113130000_p1631_erase_keeps_held_points.sql',
  _point_chat_erase_author: '20261113160000_p1631_erase_last_holder.sql',
  _point_chat_erase_orphans: '20261113180000_p1631_erase_last_holder_fix.sql',
};

describe('20261113210000 erase scoped sweep: replaced bodies', () => {
  it('each function diffs against the newest earlier definition', () => {
    for (const [fn, file] of Object.entries(PREV)) expect(newestBefore(fn, FILE), fn).toBe(file);
  });

  it('_erase_lock_canvas_owners and _clarify_erase_person are their newest earlier body plus only the marked lines', () => {
    for (const fn of ['_erase_lock_canvas_owners', '_clarify_erase_person']) {
      expect(fnBody(unmarked(raw), fn), fn).toBe(fnBody(read(PREV[fn]!), fn));
    }
  });

  it('the two sweeps are their newest earlier body, minus the one replaced line, plus only the marked lines', () => {
    for (const fn of ['_point_chat_erase_author', '_point_chat_erase_orphans']) {
      expect(fnBody(unmarked(raw), fn), fn).toBe(fnBody(dropOld(read(PREV[fn]!)), fn));
    }
  });

  it('CONTROL: an unmarked change, or an un-marked added line, is caught by the same comparison', () => {
    const changed = raw.replace("WHERE d.derived_refs @> ARRAY[v_ref] AND d.state = 'running' AND d.spend_id IS NOT NULL);", "WHERE d.derived_refs @> ARRAY[v_ref] AND d.spend_id IS NOT NULL);");
    expect(changed).not.toBe(raw);
    expect(fnBody(unmarked(changed), '_clarify_erase_person')).not.toBe(fnBody(read(PREV._clarify_erase_person!), '_clarify_erase_person'));
    const lines = raw.split('\n');
    const i = lines.findIndex((l) => l.includes('AND d.suggestions IS NOT NULL'));
    expect(i).toBeGreaterThan(-1);
    lines[i] = lines[i]!.replace(MARK, '');
    expect(fnBody(unmarked(lines.join('\n')), '_clarify_erase_person')).not.toBe(fnBody(read(PREV._clarify_erase_person!), '_clarify_erase_person'));
    const lines2 = raw.split('\n');
    let j = -1; // the LAST such line belongs to _point_chat_erase_orphans (the first is in _point_chat_erase_author)
    lines2.forEach((l, k) => { if (l.includes('op.id = ANY (public._erase_held_points(p_uid))')) j = k; });
    expect(j).toBeGreaterThan(-1);
    lines2[j] = lines2[j]!.replace(MARK, '');
    expect(fnBody(unmarked(lines2.join('\n')), '_point_chat_erase_orphans')).not.toBe(fnBody(dropOld(read(PREV._point_chat_erase_orphans!)), '_point_chat_erase_orphans'));
  });
});

describe('20261113210000 erase scoped sweep: the rule', () => {
  it('both sweeps require a point the person erasing held', () => {
    for (const fn of ['_point_chat_erase_author', '_point_chat_erase_orphans']) {
      const b = fnBody(raw, fn);
      expect(b, fn).toContain('lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid) AND op.id = ANY (public._erase_held_points(p_uid));');
      expect(b, fn).toContain('os.point_id = op.id AND os.shared_by IS NULL');
    }
  });

  it('the held set is recorded by the first call in the transaction, merged, local to the transaction, and read by a closed helper', () => {
    const rec = fnBody(raw, '_erase_lock_canvas_owners');
    expect(rec).toContain("PERFORM set_config('p1631.erase_held.' || p_uid::text,");
    expect(rec).toContain("current_setting('p1631.erase_held.' || p_uid::text, true)");
    expect(rec).toContain('SELECT pp.point_id::text FROM public.point_positions pp WHERE pp.user_id = p_uid');
    expect(rec).toContain(", ''), true);");
    // after the lock loop (the locks stay first) and before the function ends
    expect(rec.indexOf('END LOOP;')).toBeLessThan(rec.indexOf('set_config'));
    const h = fnBody(raw, '_erase_held_points');
    expect(h).toContain("current_setting('p1631.erase_held.' || p_uid::text, true)");
    expect(h).toContain('STABLE SECURITY DEFINER');
  });

  it('erase_my_account calls the recording helper before its first mutation, so before it deletes the person\'s positions', () => {
    const eam = fnBody(read('20261030090000_p1536_p1592_merge_erase_forward.sql'), 'erase_my_account');
    const call = eam.indexOf('PERFORM public._erase_lock_canvas_owners(v_uid);');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(eam.search(/\b(UPDATE|DELETE|INSERT)\b/));
    expect(call).toBeLessThan(eam.indexOf('DELETE FROM public.point_positions WHERE user_id = v_uid'));
    // and no later migration redefines erase_my_account
    expect(newestBeforeEam()).toBe('20261030090000_p1536_p1592_merge_erase_forward.sql');
  });

  it('a refused draft loses its suggestions before the ref is removed', () => {
    const b = fnBody(raw, '_clarify_erase_person');
    expect(b).toContain("SET suggestions = NULL WHERE d.derived_refs @> ARRAY[v_ref] AND d.suggestions IS NOT NULL AND d.state NOT IN ('queued', 'running');");
    expect(b.indexOf('SET suggestions = NULL WHERE d.derived_refs')).toBeLessThan(b.indexOf('SET derived_refs = array_remove'));
  });

  it('every new or replaced function stays closed to every client', () => {
    const code = norm(stripComments(raw));
    for (const f of ['_erase_lock_canvas_owners(uuid)', '_erase_held_points(uuid)', '_clarify_erase_person(uuid)', '_point_chat_erase_author(uuid)', '_point_chat_erase_orphans(uuid)']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
    expect(code).not.toMatch(/GRANT EXECUTE/);
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
});

function newestBeforeEam(): string {
  return newestBefore('erase_my_account', '99999999999999_');
}
