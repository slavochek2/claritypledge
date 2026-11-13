/**
 * @file p1631-recording-clarify-fixes-migration.test.ts
 * @description P1631: source contract for 20261113190000_p1631_recording_clarify_fixes.sql. Each replaced function is the 20261113100000 body plus only the marked lines
 * (one old line, the first-draft ORDER BY, is replaced in place by a marked line), and the three fixes are present.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113190000_p1631_recording_clarify_fixes.sql';
const MARK = '-- P1631 recording fixes';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const raw = read(FILE);
const code = stripComments(raw);

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
const marked = (s: string) => s.split('\n').filter((l) => l.includes(MARK));

describe('20261113190000 recording clarify fixes migration', () => {
  it('has the header lines of the house convention', () => {
    expect(raw).toMatch(/^-- client-safe:/m);
    expect(raw).toContain('diffed against:');
    expect(raw).toContain('Guaranteed by:');
  });

  it('clarify_start_recording is the newest previous body plus only the one marked update', () => {
    const prev = newestBefore('clarify_start_recording', FILE);
    expect(prev).toBe('20261113100000_p1631_recording_clarify.sql');
    const start = raw.indexOf('CREATE OR REPLACE FUNCTION public.clarify_start_recording(');
    const mine = raw.slice(start, raw.indexOf('REVOKE ALL ON FUNCTION public.clarify_start_recording'));
    expect(marked(mine).length).toBe(1);
    expect(fnBody(unmarked(mine), 'clarify_start_recording')).toBe(fnBody(read(prev), 'clarify_start_recording'));
  });

  it('a reused thread\'s root takes the new cutoff, only that key, after the draft is inserted and before the answer', () => {
    const b = fnBody(raw, 'clarify_start_recording');
    const upd = "UPDATE public.chat_messages m SET forward_snapshot = jsonb_set(m.forward_snapshot, '{recording_until}', to_jsonb(v_until)) WHERE m.id = v_root.id;";
    expect(b).toContain(upd);
    expect(b.indexOf(upd)).toBeGreaterThan(b.indexOf('RETURNING id INTO v_id;'));
    expect(b.indexOf(upd)).toBeLessThan(b.indexOf("'reused', true"));
  });

  it('_clarify_begin_recording is the newest previous body plus marked lines, the first-draft ORDER BY replaced in place', () => {
    const prev = newestBefore('_clarify_begin_recording', FILE);
    expect(prev).toBe('20261113100000_p1631_recording_clarify.sql');
    const start = raw.indexOf('CREATE OR REPLACE FUNCTION public._clarify_begin_recording(');
    const mine = raw.slice(start, raw.indexOf('REVOKE ALL ON FUNCTION public._clarify_begin_recording'));
    expect(marked(mine).length).toBe(4);
    const old = read(prev);
    const oldSrc = old.slice(old.indexOf('CREATE OR REPLACE FUNCTION public._clarify_begin_recording('), old.indexOf('REVOKE ALL ON FUNCTION public._clarify_begin_recording'));
    const oldMinus = oldSrc.split('\n').filter((l) => l.trim() !== 'ORDER BY f.created_at, f.id LIMIT 1;').join('\n');
    expect(oldMinus.length).toBeLessThan(oldSrc.length);
    expect(fnBody(unmarked(mine), '_clarify_begin_recording')).toBe(fnBody(oldMinus, '_clarify_begin_recording'));
  });

  it('F8: a follow-up draft takes the NEWEST draft that has a read set', () => {
    const b = fnBody(raw, '_clarify_begin_recording');
    expect(b).toContain('f.rec_kind IS NOT NULL AND f.rec_until IS NOT NULL ORDER BY f.created_at DESC, f.id DESC LIMIT 1;');
    expect(b).not.toContain('ORDER BY f.created_at, f.id LIMIT 1');
  });

  it('F7: the three published-card reads stop at the run\'s rec_until', () => {
    const b = fnBody(raw, '_clarify_begin_recording');
    expect(b.match(/m\.created_at <= v_until/g)?.length).toBe(3);
    // the owner's typed directions keep their own bound (the draft's creation time)
    expect(b).toContain('m.created_at <= v_d.created_at');
  });

  it('keeps the grants of the pattern', () => {
    const sql = norm(code);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_start_recording(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start_recording(uuid) TO authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin_recording(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._clarify_begin_recording/);
  });
});
