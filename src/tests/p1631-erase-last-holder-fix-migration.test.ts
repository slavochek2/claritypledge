/**
 * @file p1631-erase-last-holder-fix-migration.test.ts
 * @description P1631 source contract for 20261113180000_p1631_erase_last_holder_fix.sql: erase_chat_data_for is its newest earlier body plus one marked line,
 * the new helper is the narrow sweep, and the sweep runs BEFORE step 5 (the 1:1 delete that cascades the share rows the sweep reads).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113180000_p1631_erase_last_holder_fix.sql';
const MARK = '-- P1631 erase last holder fix';
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

describe('20261113180000 erase last holder fix', () => {
  const prev = newestBefore('erase_chat_data_for', FILE);

  it('diffs against 20261113130000, its newest earlier definition', () => {
    expect(prev).toBe('20261113130000_p1631_erase_keeps_held_points.sql');
  });

  it('erase_chat_data_for is that body plus only the marked line', () => {
    expect(fnBody(unmarked(raw), 'erase_chat_data_for')).toBe(fnBody(read(prev), 'erase_chat_data_for'));
  });

  it('CONTROL: an unmarked change, or an unmarked added line, is caught by the same comparison', () => {
    const changed = raw.replace("WHERE c.kind = 'mirror' AND c.owner_id = p_uid;", "WHERE c.kind = 'mirror';");
    expect(changed).not.toBe(raw);
    expect(fnBody(unmarked(changed), 'erase_chat_data_for')).not.toBe(fnBody(read(prev), 'erase_chat_data_for'));
    const lines = raw.split('\n');
    const i = lines.findIndex((l) => l.includes('PERFORM public._point_chat_erase_orphans'));
    lines[i] = lines[i]!.replace(MARK, '');
    expect(fnBody(unmarked(lines.join('\n')), 'erase_chat_data_for')).not.toBe(fnBody(read(prev), 'erase_chat_data_for'));
  });

  it('the sweep runs after step 2 and before step 5 (the 1:1 delete cascades point_chat_shares)', () => {
    const b = fnBody(raw, 'erase_chat_data_for');
    const call = b.indexOf('PERFORM public._point_chat_erase_orphans(p_uid);');
    expect(call).toBeGreaterThan(b.indexOf('author_id = NULL WHERE m.author_id = p_uid;'));
    expect(call).toBeLessThan(b.indexOf("DELETE FROM public.chat_conversations c WHERE c.kind = 'dm'"));
    // the premise of the fix: the share row dies with the chat
    expect(norm(stripComments(read('20261112150000_p1631_publish_to_chat.sql')))).toContain('conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE');
  });

  it('the helper is the narrow sweep, closed to clients, with the position test on the erased person', () => {
    const b = fnBody(raw, '_point_chat_erase_orphans');
    expect(b).toContain("op.visibility = 'private'::public.content_visibility");
    expect(b).toContain('os.point_id = op.id AND os.shared_by IS NULL');
    expect(b).toContain('lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid');
    expect(b).toContain("SET search_path = public, pg_temp");
    const code = norm(stripComments(raw));
    expect(code).toContain('REVOKE ALL ON FUNCTION public._point_chat_erase_orphans(uuid) FROM PUBLIC, anon, authenticated;');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/GRANT EXECUTE/);
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
});
