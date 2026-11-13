/**
 * @file p1631-publish-read-set-migration.test.ts
 * @description P1631: source contract for 20261112190000_p1631_publish_read_set.sql.
 *   - the three chat-shared read policies are re-created TO authenticated on _my_chat_shared_point_ids();
 *   - the function is SECURITY DEFINER, search_path '', granted to authenticated alone;
 *   - the policy bodies no longer call chat_shared_point_ids() or the per-row _point_chat_readable_by_me.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(__dirname, '..', '..', 'supabase', 'migrations', '20261112190000_p1631_publish_read_set.sql');
const raw = readFileSync(FILE, 'utf8');
const code = raw.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const sql = norm(code);

const POLICIES: Array<[string, string]> = [
  ['points_select_chat_shared', 'points'],
  ['point_positions_select_chat_shared', 'point_positions'],
  ['point_position_history_select_chat_shared', 'point_position_history'],
];

describe('20261112190000 publish read set', () => {
  it('defines _my_chat_shared_point_ids as SECURITY DEFINER with an empty search_path', () => {
    const m = /CREATE OR REPLACE FUNCTION public\._my_chat_shared_point_ids\(\)(.*?)\$\$;/.exec(sql);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('RETURNS SETOF uuid');
    expect(m![1]).toContain('SECURITY DEFINER');
    expect(m![1]).toContain("SET search_path = ''");
  });

  it('grants the function to authenticated alone', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._my_chat_shared_point_ids() FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._my_chat_shared_point_ids() TO authenticated;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._my_chat_shared_point_ids\(\) TO (anon|PUBLIC)/);
  });

  for (const [policy, table] of POLICIES) {
    it(`re-creates ${policy} TO authenticated on the set`, () => {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table};`);
      const m = new RegExp(`CREATE POLICY ${policy} ON public\\.${table} FOR SELECT TO authenticated USING \\((.*?)\\);`).exec(sql);
      expect(m).not.toBeNull();
      expect(m![1]).toContain('IN (SELECT public._my_chat_shared_point_ids())');
      expect(m![1]).not.toMatch(/(^|[^_])chat_shared_point_ids\(\)/);
      expect(m![1]).not.toContain('_point_chat_readable_by_me');
    });
  }

  it('the points policy still limits itself to private points', () => {
    expect(sql).toContain("USING (visibility = 'private' AND id IN (SELECT public._my_chat_shared_point_ids()))");
  });

  it('reads the published cards and the reader history rule', () => {
    expect(sql).toContain('FROM public.point_chat_shares s');
    expect(sql).toContain('public._chat_access_since(s.conversation_id');
  });
});
