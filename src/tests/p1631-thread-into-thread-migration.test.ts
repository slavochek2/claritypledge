/**
 * @file p1631-thread-into-thread-migration.test.ts
 * @description Source contract for 20261113140000_p1631_thread_point_into_thread.sql: clarify_publish is its newest earlier body plus only the lines
 * marked `-- P1631 into thread`, and the marked lines carry the rule (scope 'thread' only, the same root conditions as the reply path).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113140000_p1631_thread_point_into_thread.sql';
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
const unmarked = (s: string) => s.split('\n').filter((l) => !/-- P1631 into thread/.test(l)).join('\n');

describe('20261113140000 a point about a thread publishes into that thread', () => {
  it('starts with the client-safe line and keeps one transaction', () => {
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
    expect(norm(code)).toMatch(/^BEGIN; CREATE OR REPLACE FUNCTION public\.clarify_publish/);
    expect(norm(code)).toMatch(/COMMIT;$/);
  });

  it('clarify_publish is its newest previous body plus only the marked lines', () => {
    const prev = newestBefore('clarify_publish', FILE);
    expect(prev).toBe('20261112170000_p1631_publish_fixes.sql');
    expect(fnBody(unmarked(raw), 'clarify_publish')).toBe(fnBody(read(prev), 'clarify_publish'));
    expect(fnBody(raw, 'clarify_publish')).not.toBe(fnBody(read(prev), 'clarify_publish')); // the marked lines are really there
  });

  it('CONTROL: the comparison fails when an unmarked line changes', () => {
    const prev = fnBody(read('20261112170000_p1631_publish_fixes.sql'), 'clarify_publish');
    const mutated = unmarked(raw).replace("'code', 'no_position'", "'code', 'no_position2'");
    expect(fnBody(mutated, 'clarify_publish')).not.toBe(prev);
  });

  it('the marked lines apply only to scope thread, after the reply path found no thread', () => {
    const b = fnBody(raw, 'clarify_publish');
    const ifAt = b.indexOf("IF v_thread IS NULL AND COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'thread' THEN");
    expect(ifAt).toBeGreaterThan(-1);
    expect(ifAt).toBeGreaterThan(b.indexOf('SELECT r.id INTO v_thread'));
    expect(ifAt).toBeLessThan(b.indexOf('SELECT m.* INTO v_live'));
  });

  it('the pressed message is the root only under the reply path\'s root conditions', () => {
    const b = fnBody(raw, 'clarify_publish');
    const sel = b.slice(b.indexOf('SELECT s.id INTO v_thread'), b.indexOf('END IF;', b.indexOf('SELECT s.id INTO v_thread')));
    expect(sel).toContain('s.id = v_d.source_message_id');
    expect(sel).toContain('s.conversation_id = v_d.source_conversation_id');
    expect(sel).toContain('s.deleted_at IS NULL');
    expect(sel).toContain('s.thread_root_id IS NULL');
    expect(sel).toContain("s.created_at >= COALESCE(public._chat_access_since(s.conversation_id, v_uid), 'infinity'::timestamptz)");
  });

  it('keeps SECURITY DEFINER, the empty search_path and the grants', () => {
    const b = fnBody(raw, 'clarify_publish');
    expect(b).toContain('SECURITY DEFINER');
    expect(b).toContain("SET search_path = ''");
    expect(b).toContain('RETURNS jsonb');
    expect(b).toContain('public.clarify_publish(p_draft uuid, p_client_id uuid DEFAULT NULL)');
    const sql = norm(code);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_publish(uuid, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_publish(uuid, uuid) TO authenticated;');
  });
});
