/**
 * @file p1515-link-contributors-migration.test.ts
 * @description P1515 phase 3d source contract for migration 20261021220000:
 *   - _canvas_can_read no longer says yes for everyone while a canvas is open to anyone with the link;
 *   - the token-checked writes record a link-only writer as a contributor of the CURRENT link generation,
 *     and get_canvas counts a non-entry author only while that generation is current;
 *   - set_canvas_general_access returns {general_access, link_token}, issues a new generation on opening
 *     and lets an owner always close (the point checks apply only to opening).
 * Epistemic gate 7: the last block runs each check against a mutated copy of the real file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261021220000_p1515_link_contributors.sql';
const S200 = '20261021200000_p1515_people_and_link.sql';
const S210 = '20261021210000_p1515_canvas_read_per_user.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}
function patched(source: string, name: string, edits: Array<[string, string]>): string {
  let body = fnBody(read(source), name);
  for (const [from, to] of edits) {
    const a = norm(from);
    if (!body.includes(a)) throw new Error(`${name}: edit source not found: ${a.slice(0, 70)}`);
    body = body.replace(a, norm(to));
  }
  return body;
}

const EDITS: Record<string, { source: string; edits: Array<[string, string]> }> = {
  _canvas_can_read: { source: S200, edits: [[
    `AND (c.owner_id = p_uid OR c.general_access = 'link' OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)`,
    `AND (c.owner_id = p_uid OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)`,
  ]] },
  canvas_set_position: { source: S210, edits: [[
    `INSERT INTO public.point_positions (point_id, user_id, position, reasoning)`,
    `PERFORM public._canvas_note_link_contributor(v_canvas, v_uid); INSERT INTO public.point_positions (point_id, user_id, position, reasoning)`,
  ]] },
  canvas_add_story: { source: S210, edits: [[
    `INSERT INTO public.stories (author_id, content, visibility)`,
    `PERFORM public._canvas_note_link_contributor(v_canvas, v_uid); INSERT INTO public.stories (author_id, content, visibility)`,
  ]] },
  get_canvas: { source: S210, edits: [[
    `SELECT u.uid, public._canvas_can_read(v_canvas, u.uid) AS ok`,
    `SELECT u.uid, (public._canvas_can_read(v_canvas, u.uid) OR public._canvas_link_contributor_current(v_canvas, u.uid)) AS ok`,
  ]] },
};

describe('P1515 phase 3d migration (20261021220000)', () => {
  const raw = read(NEW);
  const code = stripComments(raw);

  it('carries the header: diffed-against and client-safe', () => {
    expect(raw).toMatch(/diffed against:/);
    expect(raw).toMatch(/client-safe:/);
  });

  it.each(Object.keys(EDITS))('%s is its previous body plus only the edit listed in this test', name => {
    const { source, edits } = EDITS[name]!;
    expect(fnBody(raw, name)).toBe(patched(source, name, edits));
  });

  it('_canvas_can_read mentions no link at all: the open link is never a reason to read someone else\'s rows', () => {
    expect(fnBody(raw, '_canvas_can_read')).not.toMatch(/general_access|link/);
  });

  it('a contributor is current only while the canvas is open AND their generation is the one in force', () => {
    const fn = fnBody(raw, '_canvas_link_contributor_current');
    expect(fn).toContain(`c.general_access = 'link'`);
    expect(fn).toContain('c.link_token IS NOT NULL');
    expect(fn).toContain('c.link_generation = lc.generation');
    expect(fn).toContain('lc.user_id = p_uid');
  });

  it('only someone the link ALONE admits is recorded, only while open; the owner and entry-admitted people are not', () => {
    const fn = fnBody(raw, '_canvas_note_link_contributor');
    expect(fn).toContain(`c.general_access = 'link'`);
    expect(fn).toContain('c.owner_id <> p_uid');
    expect(fn).toContain('public._canvas_admitted_via(c.id, p_uid) IS NULL');
    expect(fn).toContain('ON CONFLICT (canvas_id, user_id) DO UPDATE SET generation = EXCLUDED.generation');
    // it is called by the two token-checked writes only, after their authorisation checks
    for (const name of ['canvas_set_position', 'canvas_add_story']) {
      const body = fnBody(raw, name);
      expect(body.indexOf('_canvas_can_write(v_canvas, v_uid, p_link_token)'), name).toBeLessThan(body.indexOf('_canvas_note_link_contributor'));
    }
    expect(fnBody(raw, 'canvas_set_position')).toContain('_canvas_note_link_contributor');
  });

  it('the new table is closed to every client role', () => {
    expect(code).toContain('ALTER TABLE public.canvas_link_contributors ENABLE ROW LEVEL SECURITY;');
    expect(code).toContain('REVOKE ALL ON TABLE public.canvas_link_contributors FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/CREATE POLICY|GRANT[^;]*canvas_link_contributors/i);
  });

  it('set_canvas_general_access returns {general_access, link_token}, closing needs no points, opening issues a new generation', () => {
    const fn = fnBody(raw, 'set_canvas_general_access');
    expect(fn).toContain('RETURNS jsonb');
    expect(fn).toContain(`RETURN jsonb_build_object('general_access', 'restricted', 'link_token', NULL)`);
    // the restricted branch returns BEFORE the "owns a current point" and "no public point" checks
    expect(fn.indexOf(`IF p_access = 'restricted' THEN`)).toBeGreaterThan(-1);
    expect(fn.indexOf(`RETURN jsonb_build_object('general_access', 'restricted'`)).toBeLessThan(fn.indexOf('p.first_validator_id = v_uid'));
    expect(fn).toContain('link_generation = CASE WHEN public.canvases.general_access = \'link\' AND public.canvases.link_token IS NOT NULL THEN public.canvases.link_generation ELSE public.canvases.link_generation + 1 END');
    expect(fn).toContain('extensions.gen_random_bytes(16)');
    expect(code).toContain('DROP FUNCTION IF EXISTS public.set_canvas_general_access(text, text);');
    const refusals = new Set([...fn.matchAll(/RAISE EXCEPTION '([^']*)' USING ERRCODE = '42501'/g)].map(m => m[1]));
    expect(refusals).toEqual(new Set(['not authorized for this canvas', 'sign in required']));
    expect(fn).not.toMatch(/p_owner/); // the caller is auth.uid() only
  });

  it('grants: internal helpers closed; the owner function signed-in only; get_canvas still the only anon function', () => {
    for (const helper of ['_canvas_link_contributor_current(uuid, uuid)', '_canvas_note_link_contributor(uuid, uuid)', '_canvas_can_read(uuid, uuid)']) {
      expect(code, helper).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
      expect(code, helper).not.toMatch(new RegExp(`GRANT[^;]*public\\.${helper.split('(')[0]}\\(`));
    }
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.set_canvas_general_access(text, text) TO authenticated;');
    const anonGrants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+)\([^)]*\) TO ([^;]*);/g)].filter(m => /\banon\b/.test(m[2]!));
    expect(anonGrants.map(m => m[1])).toEqual(['public.get_canvas']);
  });
});

describe('CONTROLS: the checks above fail on a broken copy of the real file', () => {
  const raw = read(NEW);

  it('the link clause put back into _canvas_can_read is caught', () => {
    const mutated = raw.replace(`AND (c.owner_id = p_uid\n            OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)`, `AND (c.owner_id = p_uid OR c.general_access = 'link'\n            OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)`);
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, '_canvas_can_read')).toMatch(/general_access/);
  });

  it('a dropped generation comparison is caught (an old link\'s contributor would show again)', () => {
    const mutated = raw.replace('AND c.link_generation = lc.generation', '');
    expect(fnBody(mutated, '_canvas_link_contributor_current')).not.toContain('c.link_generation = lc.generation');
  });

  it('get_canvas without the contributor rule is caught', () => {
    const mutated = raw.replace(' OR public._canvas_link_contributor_current(v_canvas, u.uid)', '');
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched(S210, 'get_canvas', EDITS.get_canvas!.edits));
  });

  it('a close that needs points again is caught', () => {
    const mutated = raw.replace("    RETURN jsonb_build_object('general_access', 'restricted', 'link_token', NULL);\n  END IF;\n", '  END IF;\n');
    expect(mutated).not.toBe(raw);
    const fn = fnBody(mutated, 'set_canvas_general_access');
    expect(fn).not.toContain(`RETURN jsonb_build_object('general_access', 'restricted', 'link_token', NULL)`);
  });
});
