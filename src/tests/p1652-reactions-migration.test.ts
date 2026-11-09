/**
 * P1652: static guards over supabase/migrations/20261109120000_p1652_chat_reactions.sql.
 *
 * These read the SQL text; they prove the structure is written as designed (surrogate key, read rule, no client writes, delete cleanup,
 * realtime, function grants). They do NOT prove the SQL runs or that access is enforced: that is
 * e2e/integration/20261109120000_p1652_chat_reactions.spec.ts, which needs the migration applied to TEST.
 * Every rule has a mutation control: the same checker runs over a copy with the rule broken and must report it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REACTION_EMOJI } from '../app/data/chat-reactions-service';

const FILE = '20261109120000_p1652_chat_reactions.sql';
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', FILE), 'utf8');
const code = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

function problems(text: string): string[] {
  const c = code(text);
  const out: string[] = [];
  if (!/id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/.test(c)) out.push('primary key must be a generated surrogate id');
  if (!/UNIQUE \(message_id, profile_id, emoji\)/.test(c)) out.push('one row per message, person and emoji must be a separate unique rule');
  if (!/ENABLE ROW LEVEL SECURITY/.test(c)) out.push('RLS not enabled');
  if (!/REVOKE ALL ON TABLE public\.chat_message_reactions FROM PUBLIC, anon, authenticated/.test(c)) out.push('table privileges not revoked first');
  if (!/GRANT SELECT ON public\.chat_message_reactions TO authenticated/.test(c)) out.push('no SELECT grant');
  if (/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*chat_message_reactions/i.test(c)) out.push('a client write grant exists');
  if (!/FOR SELECT TO authenticated\s+USING \(EXISTS \(SELECT 1 FROM public\.chat_messages m WHERE m\.id = chat_message_reactions\.message_id\)\)/.test(c)) out.push('read rule must mirror message read access');
  if (!/message_id uuid NOT NULL REFERENCES public\.chat_messages\(id\) ON DELETE CASCADE/.test(c)) out.push('hard delete must cascade');
  if (!/profile_id uuid NOT NULL REFERENCES public\.profiles\(id\)\s+ON DELETE CASCADE/.test(c)) out.push('erasure must cascade from the profile');
  if (!/AFTER UPDATE OF deleted_at ON public\.chat_messages[\s\S]*?WHEN \(OLD\.deleted_at IS NULL AND NEW\.deleted_at IS NOT NULL\)/.test(c)) out.push('soft delete must clear reactions');
  if (!/ALTER PUBLICATION supabase_realtime ADD TABLE public\.chat_message_reactions/.test(c)) out.push('not in the realtime publication');
  for (const fn of ['add_chat_reaction(uuid, text)', 'remove_chat_reaction(uuid, text)']) {
    const esc = fn.replace(/[()]/g, '\\$&');
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated`).test(c)) out.push(`${fn}: not revoked first`);
    if (!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated`).test(c)) out.push(`${fn}: no grant`);
  }
  const bodies = [...c.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.\w+[\s\S]*?\$\$;/g)].map((m) => m[0]);
  for (const b of bodies) if (!/SECURITY DEFINER\s+SET search_path = ''/.test(b)) out.push('a function lacks SECURITY DEFINER with an empty search_path');
  if (/auth\.uid\(\)\s*:?=?\s*p_/.test(c) || /p_(me|user|profile|uid)\b/.test(c)) out.push('a function takes "who am I" from a parameter');
  if (!/INSERT INTO public\.chat_message_reactions[\s\S]*ON CONFLICT \(message_id, profile_id, emoji\) DO NOTHING/.test(c)) out.push('add must be idempotent');
  if (!/_chat_assert_can_post/.test(c)) out.push('add must refuse someone who can no longer post');
  if (!/v_conv\.kind = 'mirror'/.test(c)) out.push('the mirror chat must be refused on the server');
  if (!/v_msg\.deleted_at IS NOT NULL/.test(c)) out.push('a deleted message must be refused');
  if (!/v_msg\.created_at < v_since/.test(c)) out.push('the late-joiner rule must be applied on add');
  const set = [...c.matchAll(/emoji\s+text NOT NULL CHECK \(emoji IN \(([^)]*)\)\)/g)].map((m) => m[1]);
  const fn = [...c.matchAll(/p_emoji NOT IN \(([^)]*)\)/g)].map((m) => m[1]);
  const want = [...REACTION_EMOJI].sort().join(',');
  const listed = (s: string) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]).sort().join(',');
  if (set.length !== 1 || listed(set[0]) !== want) out.push('the table emoji check must be exactly the REACTION_EMOJI set');
  if (fn.length !== 1 || listed(fn[0]) !== want) out.push('add_chat_reaction must restrict emoji to exactly the REACTION_EMOJI set');
  return out;
}

describe('p1652 migration text', () => {
  it('has no problems as written', () => {
    expect(problems(sql)).toEqual([]);
  });
  const mutations: Array<[string, (s: string) => string, RegExp]> = [
    ['natural primary key', (s) => s.replace('id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),', 'id         uuid,'), /surrogate/],
    ['client write grant', (s) => s.replace('GRANT SELECT ON public.chat_message_reactions TO authenticated;', 'GRANT SELECT, INSERT ON public.chat_message_reactions TO authenticated;'), /write grant|no SELECT/],
    ['open read rule', (s) => s.replace('USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = chat_message_reactions.message_id))', 'USING (true)'), /read rule/],
    ['no delete cleanup', (s) => s.replace('AFTER UPDATE OF deleted_at', 'AFTER UPDATE OF edited_at'), /soft delete/],
    ['not realtime', (s) => s.replace('ADD TABLE public.chat_message_reactions', 'ADD TABLE public.chat_member_state'), /realtime/],
    ['no mirror refusal', (s) => s.replace("v_conv.kind = 'mirror'", "v_conv.kind = 'nothing'"), /mirror/],
    ['no since rule', (s) => s.replace('v_msg.created_at < v_since', 'false'), /late-joiner/],
    ['actor from a parameter', (s) => s.replace('p_emoji text)\nRETURNS public', 'p_emoji text, p_me uuid)\nRETURNS public'), /who am I/],
    ['table check missing an emoji', (s) => s.replace(`CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏'))`, `CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢'))`), /table emoji check/],
    ['table check widened', (s) => s.replace(`CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏'))`, `CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏', '🔥'))`), /table emoji check/],
    ['function accepts a different set', (s) => s.replace(`p_emoji NOT IN ('👍', '❤️', '😂', '😮', '😢', '🙏')`, `p_emoji NOT IN ('👍', '❤️')`), /add_chat_reaction must restrict/],
    ['function back to a length check', (s) => s.replace(`p_emoji NOT IN ('👍', '❤️', '😂', '😮', '😢', '🙏')`, `length(p_emoji) > 8`), /add_chat_reaction must restrict/],
    ['not idempotent', (s) => s.replace('ON CONFLICT (message_id, profile_id, emoji) DO NOTHING', ''), /idempotent/],
  ];
  for (const [name, mutate, expected] of mutations) {
    it(`control: reports ${name}`, () => {
      const mutated = mutate(sql);
      expect(mutated).not.toBe(sql);
      expect(problems(mutated).join(' | ')).toMatch(expected);
    });
  }
});
