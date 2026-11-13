/**
 * @file p1631-erase-last-holder-migration.test.ts
 * @description P1631 source contract for 20261113160000_p1631_erase_last_holder.sql: _point_chat_erase_author is its newest earlier body plus only the marked lines,
 * the added delete is narrow (private, publisher gone, no other holder), and the function stays closed to clients.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113160000_p1631_erase_last_holder.sql';
const MARK = '-- P1631 erase last holder';
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

describe('20261113160000 erase last holder', () => {
  const prevFile = newestBefore('_point_chat_erase_author', FILE);

  it('diffs against 20261113130000, its newest earlier definition', () => {
    expect(prevFile).toBe('20261113130000_p1631_erase_keeps_held_points.sql');
  });

  it('is that body plus only the marked lines', () => {
    expect(fnBody(unmarked(raw), '_point_chat_erase_author')).toBe(fnBody(read(prevFile), '_point_chat_erase_author'));
  });

  it('CONTROL: an unmarked change, or an unmarked added line, is caught by the same comparison', () => {
    const changed = raw.replace("AND p.id IN (SELECT s.point_id FROM public.point_chat_shares s WHERE s.shared_by = p_uid)", "AND p.id IN (SELECT s.point_id FROM public.point_chat_shares s)");
    expect(changed).not.toBe(raw);
    expect(fnBody(unmarked(changed), '_point_chat_erase_author')).not.toBe(fnBody(read(prevFile), '_point_chat_erase_author'));
    const lines = raw.split('\n');
    const i = lines.findIndex((l) => l.includes('DELETE FROM public.points op'));
    lines[i] = lines[i]!.replace(MARK, '');
    expect(fnBody(unmarked(lines.join('\n')), '_point_chat_erase_author')).not.toBe(fnBody(read(prevFile), '_point_chat_erase_author'));
  });

  it('the added delete is narrow: private, publisher gone, no position by anyone but the person erasing', () => {
    const marked = norm(raw.split('\n').filter((l) => l.includes(MARK) && !l.trim().startsWith('--')).join('\n'));
    expect(marked).toContain("op.visibility = 'private'::public.content_visibility");
    expect(marked).toContain('os.point_id = op.id AND os.shared_by IS NULL');
    expect(marked).toContain('lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid');
    expect(marked).toContain('NOT EXISTS');
  });

  it('stays closed to every client and says why it is client-safe', () => {
    const code = norm(stripComments(raw));
    expect(code).toContain('REVOKE ALL ON FUNCTION public._point_chat_erase_author(uuid) FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/GRANT EXECUTE/);
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
});
