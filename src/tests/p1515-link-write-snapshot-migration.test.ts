/**
 * @file p1515-link-write-snapshot-migration.test.ts
 * @description P1515 phase 3f source contract for migration 20261021230000:
 *   - the token-checked writes read the canvas row FOR SHARE (one statement that also returns link_generation),
 *     check the token against that locked row and record the contributor with THAT generation, passed to
 *     _canvas_note_link_contributor (no re-read), so a close or reopen racing a write cannot record an old-token
 *     write under the new generation;
 *   - set_canvas_general_access takes the row FOR UPDATE before it closes or reopens;
 *   - get_canvas tells the OWNER of a canvas that has a record, and only the owner, that it exists.
 * Epistemic gate 7: the last block runs each check against a mutated copy of the real file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261021230000_p1515_link_write_snapshot.sql';
const S220 = '20261021220000_p1515_link_contributors.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}
function patched(name: string, edits: Array<[string, string]>): string {
  let body = fnBody(read(S220), name);
  for (const [from, to] of edits) {
    const a = norm(from);
    if (!body.includes(a)) throw new Error(`${name}: edit source not found: ${a.slice(0, 70)}`);
    body = body.replace(a, norm(to));
  }
  return body;
}

const LOOKUP = 'SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name;';
const LOCKED = 'SELECT c.id, c.link_generation INTO v_canvas, v_generation FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name FOR SHARE;';
const NOTE_OLD = 'PERFORM public._canvas_note_link_contributor(v_canvas, v_uid);';
const NOTE_NEW = 'PERFORM public._canvas_note_link_contributor(v_canvas, v_uid, v_generation);';
const EDITS: Record<string, Array<[string, string]>> = {
  canvas_set_position: [[LOOKUP, LOCKED], ['v_canvas uuid;', 'v_canvas uuid; v_generation integer;'], [NOTE_OLD, NOTE_NEW]],
  canvas_add_story: [[LOOKUP, LOCKED], ['v_canvas uuid;', 'v_canvas uuid; v_generation integer;'], [NOTE_OLD, NOTE_NEW]],
  set_canvas_general_access: [[
    `IF p_access = 'restricted' THEN UPDATE public.canvases c`,
    `PERFORM 1 FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name FOR UPDATE; IF p_access = 'restricted' THEN UPDATE public.canvases c`,
  ]],
  get_canvas: [[
    `'general_access', CASE WHEN COALESCE(v_open, false) THEN 'link' ELSE 'restricted' END,`,
    `'general_access', CASE WHEN COALESCE(v_open, false) THEN 'link' ELSE 'restricted' END, 'canvas_exists', (v_is_owner AND v_canvas IS NOT NULL),`,
  ]],
};

describe('P1515 phase 3f migration (20261021230000)', () => {
  const raw = read(NEW);
  const code = stripComments(raw);

  it('carries the header: diffed-against and client-safe', () => {
    expect(raw).toMatch(/diffed against:/);
    expect(raw).toMatch(/client-safe:/);
  });

  it.each(Object.keys(EDITS))('%s is its previous body plus only the edits listed in this test', name => {
    expect(fnBody(raw, name)).toBe(patched(name, EDITS[name]!));
  });

  it('the two writes take the row lock in the SAME statement that reads the generation, before the token check and the note', () => {
    for (const name of ['canvas_set_position', 'canvas_add_story']) {
      const body = fnBody(raw, name);
      const lock = body.indexOf('FOR SHARE');
      expect(lock, name).toBeGreaterThan(-1);
      expect(body.slice(0, lock)).not.toContain('_canvas_can_write(');
      expect(body.indexOf('_canvas_can_write(v_canvas, v_uid, p_link_token)'), name).toBeGreaterThan(lock);
      expect(body.indexOf('_canvas_note_link_contributor(v_canvas, v_uid, v_generation)'), name).toBeGreaterThan(body.indexOf('_canvas_can_write('));
      expect(body, `${name} reads the generation once`).not.toMatch(/link_generation[^;]*FROM public\.canvases c[^;]*;[\s\S]*link_generation[^;]*FROM public\.canvases c/);
    }
  });

  it('the contributor note takes the generation as an argument and re-checks it; the old signature is dropped', () => {
    const note = fnBody(raw, '_canvas_note_link_contributor');
    expect(note).toContain('p_generation integer');
    expect(note).toContain('c.link_generation = p_generation');
    expect(note).toContain('SELECT c.id, p_uid, p_generation');
    expect(note).not.toContain('SELECT c.id, p_uid, c.link_generation');
    expect(code).toContain('DROP FUNCTION IF EXISTS public._canvas_note_link_contributor(uuid, uuid);');
    expect(code).toContain('REVOKE ALL ON FUNCTION public._canvas_note_link_contributor(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/GRANT[^;]*_canvas_note_link_contributor/);
  });

  it('close and reopen lock the row FOR UPDATE before anything else in the body that changes it', () => {
    const fn = fnBody(raw, 'set_canvas_general_access');
    expect(fn.indexOf('FOR UPDATE')).toBeGreaterThan(-1);
    expect(fn.indexOf('FOR UPDATE')).toBeLessThan(fn.indexOf('UPDATE public.canvases c SET'));
    expect(fn.indexOf('FOR UPDATE')).toBeLessThan(fn.indexOf('INSERT INTO public.canvases'));
  });

  it('canvas_exists is only ever true for the owner and appears only in an admitted caller\'s answer', () => {
    const body = fnBody(raw, 'get_canvas');
    expect(body).toContain(`'canvas_exists', (v_is_owner AND v_canvas IS NOT NULL)`);
    const notFound = body.slice(body.indexOf('IF NOT COALESCE(v_admitted, false) THEN'), body.indexOf('END IF;', body.indexOf('IF NOT COALESCE(v_admitted, false) THEN')));
    expect(notFound).not.toContain('canvas_exists');
  });

  it('grants are restated: get_canvas is still the only anon function; the writes and owner tools authenticated only', () => {
    const anonGrants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+)\([^)]*\) TO ([^;]*);/g)].filter(m => /\banon\b/.test(m[2]!));
    expect(anonGrants.map(m => m[1])).toEqual(['public.get_canvas']);
    for (const sig of ['canvas_set_position(uuid, text, uuid, public.position_type, text, text)', 'canvas_add_story(uuid, text, uuid, text, text)', 'set_canvas_general_access(text, text)']) {
      expect(code, sig).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
  });
});

describe('CONTROLS: the checks above fail on a broken copy of the real file', () => {
  const raw = read(NEW);

  it('a write that reads the row without the lock is caught', () => {
    const mutated = raw.replace(/ FOR SHARE;/g, ';');
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, 'canvas_set_position')).not.toBe(patched('canvas_set_position', EDITS.canvas_set_position!));
  });

  it('a contributor note that re-reads the generation is caught', () => {
    const mutated = raw.replace('SELECT c.id, p_uid, p_generation', 'SELECT c.id, p_uid, c.link_generation');
    expect(fnBody(mutated, '_canvas_note_link_contributor')).toContain('SELECT c.id, p_uid, c.link_generation');
  });

  it('a close without the row lock is caught', () => {
    const mutated = raw.replace('PERFORM 1 FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name FOR UPDATE;', '');
    expect(fnBody(mutated, 'set_canvas_general_access')).not.toBe(patched('set_canvas_general_access', EDITS.set_canvas_general_access!));
  });

  it('canvas_exists for non-owners is caught', () => {
    const mutated = raw.replace('(v_is_owner AND v_canvas IS NOT NULL)', '(v_canvas IS NOT NULL)');
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched('get_canvas', EDITS.get_canvas!));
  });
});
