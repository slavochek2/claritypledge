/**
 * @file p1631-shared-point-stories-migration.test.ts
 * @description Source contract for 20261113110000_p1631_shared_point_stories.sql: a story written on a shared card is bound to that point and readable by exactly the card's readers.
 * The write is one checked definer RPC, the reads are four permissive SELECT policies on the bound pairs, and a restrictive INSERT policy stops bridging. Nothing existing is dropped or replaced.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(__dirname, '..', '..', 'supabase', 'migrations', '20261113110000_p1631_shared_point_stories.sql');
const code = readFileSync(FILE, 'utf8').replace(/--[^\n]*/g, '');
const sql = code.replace(/\s+/g, ' ').trim();
const fn = (name: string): string => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(.*?\\$\\$;`).exec(sql);
  if (!m) throw new Error(`${name} not found`);
  return m[0];
};
const policy = (name: string): string => {
  const m = new RegExp(`CREATE POLICY ${name} ON public\\.(\\w+) (AS RESTRICTIVE )?FOR (\\w+) TO authenticated (USING|WITH CHECK) \\((.*?)\\);`).exec(sql);
  if (!m) throw new Error(`${name} not found`);
  return `${m[1]}|${m[2] ?? ''}|${m[3]}|${m[5]}`;
};

describe('20261113110000 shared point stories migration', () => {
  it('creates point_chat_stories with RLS on, no policy and no client privilege', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.point_chat_stories ( story_id uuid PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE, point_id uuid NOT NULL REFERENCES public.points(id) ON DELETE CASCADE');
    expect(sql).toContain('ALTER TABLE public.point_chat_stories ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.point_chat_stories FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/ON public\.point_chat_stories (AS \w+ )?FOR/);
    expect(sql).not.toMatch(/GRANT [A-Z, ]+ ON (TABLE )?public\.point_chat_stories/);
  });

  it('adds exactly these functions and drops, alters and replaces nothing existing', () => {
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(['_chat_story_link_ok', '_my_chat_story_points', 'point_chat_add_story']);
    // the only DROP allowed is the idempotency guard on this file's own five policies
    expect([...sql.matchAll(/DROP (\w+)(?: IF EXISTS)? (\w+)/g)].map((m) => `${m[1]} ${m[2]}`).sort()).toEqual([
      'POLICY stories_select_chat_point_story', 'POLICY story_point_history_select_chat_point_story', 'POLICY story_points_insert_bound_story',
      'POLICY story_points_select_chat_point_story', 'POLICY story_versions_select_chat_point_story',
    ]);
    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(5);
    expect(sql).not.toMatch(/ALTER POLICY|ALTER TABLE public\.(?!point_chat_stories)|DISABLE ROW LEVEL SECURITY/i);
  });

  it('point_chat_add_story is a closed definer RPC granted to authenticated alone', () => {
    const f = fn('point_chat_add_story');
    expect(f).toContain('SECURITY DEFINER');
    expect(f).toContain("SET search_path = ''");
    expect(f).toContain("RAISE EXCEPTION 'story: not authenticated' USING ERRCODE = '42501'");
    expect(f).toContain('pr.is_verified = true');
    expect(f).toContain("p.visibility = 'private'");
    expect(f).toContain('p.id IN (SELECT public._my_chat_shared_point_ids())');
    expect(f).toContain("VALUES (v_uid, p_content, COALESCE(p_tags, '{}'), '{}', 'private')");
    expect(f.indexOf('INSERT INTO public.point_chat_stories')).toBeGreaterThan(f.indexOf('INSERT INTO public.stories'));
    expect(f.indexOf('INSERT INTO public.story_points')).toBeGreaterThan(f.indexOf('INSERT INTO public.point_chat_stories'));
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.point_chat_add_story(uuid, text, text[]) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.point_chat_add_story(uuid, text, text[]) TO authenticated;');
  });

  it('the helpers are closed definer functions; the read helper takes no argument and reads only the caller\'s set', () => {
    const r = fn('_my_chat_story_points');
    expect(r).toContain('SECURITY DEFINER');
    expect(r).toContain("SET search_path = ''");
    expect(r).toContain('pcs.point_id IN (SELECT public._my_chat_shared_point_ids())');
    expect(fn('_chat_story_link_ok')).toContain('pcs.point_id IS DISTINCT FROM p_point');
    for (const [f, sig] of [['_my_chat_story_points', ''], ['_chat_story_link_ok', 'uuid, uuid']]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f}(${sig}) FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f}(${sig}) TO authenticated;`);
    }
  });

  it('four permissive SELECT policies: stories private and bound; links, history and versions through the bound pair', () => {
    expect(policy('stories_select_chat_point_story')).toBe("stories||SELECT|visibility = 'private' AND id IN (SELECT m.story_id FROM public._my_chat_story_points() m)");
    const pair = '(story_id, point_id) IN (SELECT m.story_id, m.point_id FROM public._my_chat_story_points() m)';
    expect(policy('story_points_select_chat_point_story')).toBe(`story_points||SELECT|${pair}`);
    expect(policy('story_point_history_select_chat_point_story')).toBe(`story_point_history||SELECT|${pair}`);
    expect(policy('story_versions_select_chat_point_story')).toBe('story_versions||SELECT|story_id IN (SELECT m.story_id FROM public._my_chat_story_points() m)');
  });

  it('no verification policy and no policy on points or positions is added; no write policy except the restrictive guard', () => {
    expect(sql).not.toMatch(/ON public\.(story_verifications|points|point_positions|point_position_history)\b/);
    const all = [...sql.matchAll(/CREATE POLICY (\w+) ON public\.(\w+) (AS RESTRICTIVE )?FOR (\w+)/g)].map((m) => `${m[2]}.${m[1]}:${m[3] ? 'R' : 'P'}:${m[4]}`).sort();
    expect(all).toEqual([
      'stories.stories_select_chat_point_story:P:SELECT',
      'story_point_history.story_point_history_select_chat_point_story:P:SELECT',
      'story_points.story_points_insert_bound_story:R:INSERT',
      'story_points.story_points_select_chat_point_story:P:SELECT',
      'story_versions.story_versions_select_chat_point_story:P:SELECT',
    ]);
  });

  it('the bridge guard is restrictive on INSERT and calls the link check', () => {
    expect(policy('story_points_insert_bound_story')).toBe('story_points|AS RESTRICTIVE |INSERT|public._chat_story_link_ok(story_id, point_id)');
  });

  it('20261113170000 replaces point_chat_add_story with the 110000 body byte for byte except the marked search_path line', () => {
    const fix = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261113170000_p1631_shared_point_stories_fixes.sql'), 'utf8');
    const body = (s: string) => {
      const c = s.replace(/--[^\n]*/g, (m) => (m.includes('P1631 trigger search_path') ? m : '')).replace(/\s+/g, ' ');
      return /CREATE OR REPLACE FUNCTION public\.point_chat_add_story\(.*?\$\$;/.exec(c)![0];
    };
    const mine = body(fix).replace("SET search_path = public, pg_temp -- P1631 trigger search_path", "SET search_path = ''");
    expect(mine).toBe(body(readFileSync(FILE, 'utf8')));
    expect(fix).toContain('GRANT EXECUTE ON FUNCTION public.point_chat_add_story(uuid, text, text[]) TO authenticated;');
    expect(fix.replace(/--[^\n]*/g, '')).not.toMatch(/CREATE POLICY|DROP /);
  });

  it('110000 is re-runnable: table, index and every policy are guarded', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS point_chat_stories_point_idx');
    expect(sql).not.toMatch(/CREATE (TABLE|INDEX) (?!IF NOT EXISTS)/);
  });

  describe('20261113200000 (card binding, doc_stories trigger, oracle)', () => {
    const raw200 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261113200000_p1631_shared_point_stories_card.sql'), 'utf8');
    const s200 = raw200.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
    const f200 = (name: string) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(.*?\\$\\$;`).exec(s200)![0];

    it('binds a story to its card: message_id column, NOT NULL after backfill, cascade, index', () => {
      expect(s200).toContain('ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE');
      expect(s200).toContain('ALTER COLUMN message_id SET NOT NULL');
      expect(s200.indexOf('SET message_id = (SELECT m.id')).toBeLessThan(s200.indexOf('ALTER COLUMN message_id SET NOT NULL'));
      expect(s200).toContain('CREATE INDEX IF NOT EXISTS point_chat_stories_message_idx');
    });

    it('the read helper admits a pair only for a live card the caller reads under the history rule', () => {
      const f = f200('_my_chat_story_points');
      expect(f).toContain('JOIN public.chat_messages m ON m.id = pcs.message_id');
      expect(f).toContain("m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = pcs.point_id");
      expect(f).toContain("m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, (SELECT auth.uid())), 'infinity'::timestamptz)");
      expect(f).not.toContain('_my_chat_shared_point_ids');
    });

    it('point_chat_add_story takes the card id, checks the card, drops the old signature, keeps the grants', () => {
      expect(s200).toContain('DROP FUNCTION IF EXISTS public.point_chat_add_story(uuid, text, text[]);');
      const f = f200('point_chat_add_story');
      expect(f).toContain('p_point uuid, p_message uuid, p_content text');
      expect(f).toContain("m.id = p_message AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = p_point");
      expect(f).toContain("m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)");
      expect(f).toContain("p.visibility = 'private'");
      expect(f).toContain('JOIN public.point_chat_shares s ON s.message_id = m.id AND s.point_id = p_point');
      expect(f).toContain('INSERT INTO public.point_chat_stories (story_id, point_id, message_id) VALUES (v_story, p_point, p_message)');
      expect(f).toContain('SET search_path = public, pg_temp');
      expect(s200).toContain('REVOKE ALL ON FUNCTION public.point_chat_add_story(uuid, uuid, text, text[]) FROM PUBLIC, anon, authenticated;');
      expect(s200).toContain('GRANT EXECUTE ON FUNCTION public.point_chat_add_story(uuid, uuid, text, text[]) TO authenticated;');
    });

    it('a bound story cannot enter doc_stories (insert or update), by a closed definer trigger function', () => {
      const f = f200('_refuse_chat_bound_doc_story');
      expect(f).toContain('SECURITY DEFINER');
      expect(f).toContain("SET search_path = ''");
      expect(f).toContain('pcs.story_id = NEW.story_id');
      expect(s200).toContain('BEFORE INSERT OR UPDATE ON public.doc_stories FOR EACH ROW EXECUTE FUNCTION public._refuse_chat_bound_doc_story()');
      expect(s200).toContain('DROP TRIGGER IF EXISTS trg_refuse_chat_bound_doc_story ON public.doc_stories;');
    });

    it('_chat_story_link_ok answers true unless the caller is the story author (no oracle on others\' stories)', () => {
      const f = f200('_chat_story_link_ok');
      expect(f).toContain('s.author_id = (SELECT auth.uid())');
      expect(f).toContain('pcs.point_id IS DISTINCT FROM p_point');
    });

    it('adds no policy, drops no policy, and creates nothing unguarded', () => {
      expect(s200).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/);
      expect(s200).not.toMatch(/CREATE (TABLE|INDEX) (?!IF NOT EXISTS)/);
    });
  });

  describe('20261113240000 (durable marker, share-row join, live-session trigger)', () => {
    const raw240 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261113240000_p1631_shared_point_stories_durable.sql'), 'utf8');
    const s240 = raw240.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
    const f240 = (name: string) => new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(.*?\\$\\$;`).exec(s240)![0];

    it('both foreign keys become ON DELETE SET NULL on nullable columns; the old ones are dropped; the story key still cascades', () => {
      expect(s240).toContain("c.confrelid IN ('public.points'::regclass, 'public.chat_messages'::regclass)");
      expect(s240).toContain('ALTER COLUMN message_id DROP NOT NULL');
      expect(s240).toContain('ALTER COLUMN point_id DROP NOT NULL');
      expect(s240).toContain('FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL');
      expect(s240).toContain('FOREIGN KEY (point_id) REFERENCES public.points(id) ON DELETE SET NULL');
      expect(s240).not.toMatch(/point_chat_stories[^;]*DELETE FROM|DELETE FROM public\.point_chat_stories/);
      expect(s240).not.toContain('ON DELETE CASCADE'); // story_id's cascade (110000) is untouched
    });

    it('the read helper also joins point_chat_shares on the bound message and point; a NULL key joins nothing', () => {
      const f = f240('_my_chat_story_points');
      expect(f).toContain('JOIN public.point_chat_shares sh ON sh.message_id = pcs.message_id AND sh.point_id = pcs.point_id');
      expect(f).toContain('JOIN public.chat_messages m ON m.id = pcs.message_id');
      expect(f).toContain("m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, (SELECT auth.uid())), 'infinity'::timestamptz)");
      expect(s240).toContain('GRANT EXECUTE ON FUNCTION public._my_chat_story_points() TO authenticated;');
    });

    it('clarity_sessions refuses a bound story by source_story_id, selectedStoryId and selectedStoryData.id, with a uuid shape check', () => {
      const f = f240('_refuse_chat_bound_session_story');
      expect(f).toContain('SECURITY DEFINER');
      expect(f).toContain("SET search_path = ''");
      expect(f).toContain("NEW.live_state ->> 'selectedStoryId'");
      expect(f).toContain("NEW.live_state #>> '{selectedStoryData,id}'");
      expect(f).toContain('NEW.source_story_id');
      expect(f).toContain('c_uuid');
      expect(s240).toContain('BEFORE INSERT OR UPDATE OF source_story_id, live_state ON public.clarity_sessions FOR EACH ROW EXECUTE FUNCTION public._refuse_chat_bound_session_story()');
      expect(s240).toContain('DROP TRIGGER IF EXISTS trg_refuse_chat_bound_session_story ON public.clarity_sessions;');
    });

    it('my_chat_bound_story_ids returns only the caller\'s own bound stories; the file corrects the 200000 header claim', () => {
      const f = f240('my_chat_bound_story_ids');
      expect(f).toContain('s.author_id = (SELECT auth.uid())');
      expect(s240).toContain('GRANT EXECUTE ON FUNCTION public.my_chat_bound_story_ids() TO authenticated;');
      expect(raw240).toContain('CORRECTION to 20261113200000');
    });

    it('adds no policy and the doc_stories trigger of 200000 (existence by story_id) is not replaced', () => {
      expect(s240).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY|doc_stories/);
    });
  });

  it('what the guarantees lean on still exists: visibility immutability triggers for stories and points', () => {
    const p586 = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260325120000_p586_visibility_privacy_foundation.sql'), 'utf8');
    expect(p586).toContain('CREATE TRIGGER trg_story_visibility_immutable');
    expect(p586).toContain('CREATE TRIGGER trg_point_visibility_immutable');
  });
});
