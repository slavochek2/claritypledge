/**
 * @file p1515-canvas-read-per-user-migration.test.ts
 * @description P1515 phase 3b source contract for migration 20261021210000:
 *   - get_canvas is its previous body (20261021200000) plus two changes: "can this person read the canvas"
 *     is evaluated once per DISTINCT person in a MATERIALIZED CTE (positions and added stories join to it),
 *     and "anyone with the link" is an unguessable TOKEN (p_link_token) that must equal the current one;
 *   - _canvas_admitted_via is its previous body plus one ORDER BY term (a direct person entry wins);
 *   - the three writes are their previous bodies plus the token argument and _canvas_can_write;
 *   - set_canvas_general_access issues a fresh token on opening and clears it on closing;
 *   - the old signatures are dropped (no tokenless overload is left for anon to call).
 * Epistemic gate 7: the last block runs each check against a mutated copy of the real file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261021210000_p1515_canvas_read_per_user.sql';
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

const READERS = `readers AS MATERIALIZED ( SELECT u.uid, public._canvas_can_read(v_canvas, u.uid) AS ok FROM ( SELECT pp.user_id AS uid FROM public.point_positions pp WHERE pp.point_id IN (SELECT cp.id FROM cp) UNION SELECT cas.author_id FROM public.canvas_added_stories cas WHERE v_canvas IS NOT NULL AND cas.canvas_id = v_canvas AND cas.point_id IN (SELECT cp.id FROM cp) ) u ), added_stories AS (`;
const GET_CANVAS_EDITS: Array<[string, string]> = [
  ['CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text)', 'CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text, p_link_token text DEFAULT NULL)'],
  ['v_link boolean;', 'v_open boolean; v_tok_ok boolean;'],
  [`SELECT c.id, c.general_access = 'link' INTO v_canvas, v_link`, `SELECT c.id, c.general_access = 'link', (c.general_access = 'link' AND c.link_token IS NOT NULL AND p_link_token IS NOT NULL AND c.link_token = p_link_token) INTO v_canvas, v_open, v_tok_ok`],
  ['v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_link, false);', 'v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_tok_ok, false);'],
  [`'access', jsonb_build_object('is_owner', false, 'admitted', false, 'general_access', 'restricted', 'via', NULL)`, `'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)`],
  ['WHEN COALESCE(v_link, false) OR EXISTS (', 'WHEN COALESCE(v_open, false) OR EXISTS ('],
  [`'general_access', CASE WHEN COALESCE(v_link, false) THEN 'link' ELSE 'restricted' END,`, `'general_access', CASE WHEN COALESCE(v_open, false) THEN 'link' ELSE 'restricted' END,`],
  ['added_stories AS (', READERS],
  ['OR public._canvas_can_read(v_canvas, cas.author_id)', 'OR EXISTS (SELECT 1 FROM readers r WHERE r.uid = cas.author_id AND r.ok)'],
  ['OR public._canvas_can_read(v_canvas, pp.user_id)', 'OR EXISTS (SELECT 1 FROM readers r WHERE r.uid = pp.user_id AND r.ok)'],
];
const CAN_WRITE_OLD = 'IF NOT (v_uid = p_owner OR public._canvas_can_read(v_canvas, v_uid))';
const CAN_WRITE_NEW = 'IF NOT (v_uid = p_owner OR public._canvas_can_write(v_canvas, v_uid, p_link_token))';
const SET_POSITION_EDITS: Array<[string, string]> = [
  ['p_reasoning text DEFAULT NULL )', 'p_reasoning text DEFAULT NULL, p_link_token text DEFAULT NULL )'],
  [CAN_WRITE_OLD, CAN_WRITE_NEW],
];
const REMOVE_POSITION_EDITS: Array<[string, string]> = [
  ['canvas_remove_position(p_owner uuid, p_name text, p_point uuid)', 'canvas_remove_position(p_owner uuid, p_name text, p_point uuid, p_link_token text DEFAULT NULL)'],
  [CAN_WRITE_OLD, CAN_WRITE_NEW],
];
const ADD_STORY_EDITS: Array<[string, string]> = [
  ['canvas_add_story(p_owner uuid, p_name text, p_point uuid, p_content text)', 'canvas_add_story(p_owner uuid, p_name text, p_point uuid, p_content text, p_link_token text DEFAULT NULL)'],
  ['OR NOT public._canvas_can_read(v_canvas, v_uid)', 'OR NOT public._canvas_can_write(v_canvas, v_uid, p_link_token)'],
];
const GENERAL_ACCESS_EDITS: Array<[string, string]> = [[
  `INSERT INTO public.canvases (owner_id, name, general_access) VALUES (v_uid, v_name, p_access) ON CONFLICT (owner_id, name) DO UPDATE SET general_access = EXCLUDED.general_access;`,
  `INSERT INTO public.canvases (owner_id, name, general_access, link_token) VALUES (v_uid, v_name, p_access, CASE WHEN p_access = 'link' THEN encode(extensions.gen_random_bytes(16), 'hex') END) ON CONFLICT (owner_id, name) DO UPDATE SET general_access = EXCLUDED.general_access, link_token = CASE WHEN EXCLUDED.general_access <> 'link' THEN NULL WHEN public.canvases.general_access = 'link' AND public.canvases.link_token IS NOT NULL THEN public.canvases.link_token ELSE EXCLUDED.link_token END;`,
]];
const AUDIENCE_EDITS: Array<[string, string]> = [
  [`RETURN jsonb_build_object('entries', '[]'::jsonb, 'general_access', 'restricted');`, `RETURN jsonb_build_object('entries', '[]'::jsonb, 'general_access', 'restricted', 'link_token', NULL);`],
  [`RETURN jsonb_build_object('general_access', (SELECT c.general_access FROM public.canvases c WHERE c.id = v_canvas), 'entries', COALESCE((`, `RETURN jsonb_build_object('general_access', (SELECT c.general_access FROM public.canvases c WHERE c.id = v_canvas), 'link_token', (SELECT c.link_token FROM public.canvases c WHERE c.id = v_canvas), 'entries', COALESCE((`],
];
const VIA_EDITS: Array<[string, string]> = [
  ["ORDER BY (a.kind <> 'event'), a.created_at, a.id", "ORDER BY (a.kind <> 'person'), (a.kind <> 'event'), a.created_at, a.id"],
];

describe('P1515 phase 3b migration (20261021210000)', () => {
  const raw = read(NEW);
  const code = stripComments(raw);

  it('carries the header: diffed-against and client-safe', () => {
    expect(raw).toMatch(/diffed against:/);
    expect(raw).toMatch(/client-safe:/);
  });

  const S100 = '20261021100000_p1515_artifact_sharing.sql';
  const S170 = '20261021170000_p1515_review_fixes.sql';
  const S200 = '20261021200000_p1515_people_and_link.sql';

  it('get_canvas is the previous body plus only the once-per-person change and the link token', () => {
    expect(fnBody(raw, 'get_canvas')).toBe(patched(S200, 'get_canvas', GET_CANVAS_EDITS));
  });

  it('the three writes are their previous bodies plus the token argument and the token-aware write check', () => {
    expect(fnBody(raw, 'canvas_set_position')).toBe(patched(S100, 'canvas_set_position', SET_POSITION_EDITS));
    expect(fnBody(raw, 'canvas_remove_position')).toBe(patched(S100, 'canvas_remove_position', REMOVE_POSITION_EDITS));
    expect(fnBody(raw, 'canvas_add_story')).toBe(patched(S170, 'canvas_add_story', ADD_STORY_EDITS));
  });

  it('opening issues a fresh token and closing clears it; asking to open an open canvas keeps its token', () => {
    expect(fnBody(raw, 'set_canvas_general_access')).toBe(patched(S200, 'set_canvas_general_access', GENERAL_ACCESS_EDITS));
    expect(fnBody(raw, 'set_canvas_general_access')).toContain('extensions.gen_random_bytes(16)');
  });

  it('get_canvas_audience is the previous body plus the token, which only the owner-only function returns', () => {
    expect(fnBody(raw, 'get_canvas_audience')).toBe(patched(S200, 'get_canvas_audience', AUDIENCE_EDITS));
    expect(fnBody(raw, 'get_canvas_audience')).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
  });

  it('a caller with no entry is admitted only by the current token; a stranger\'s reply carries no general_access and the token is never raised or logged', () => {
    const body = fnBody(raw, 'get_canvas');
    expect(body).toContain('c.link_token = p_link_token');
    expect(body).toContain('c.general_access = \'link\' AND c.link_token IS NOT NULL AND p_link_token IS NOT NULL');
    const notFound = body.slice(body.indexOf('IF NOT COALESCE(v_admitted, false) THEN'), body.indexOf('END IF;', body.indexOf('IF NOT COALESCE(v_admitted, false) THEN')));
    expect(notFound).not.toContain('general_access');
    for (const name of ['get_canvas', 'canvas_set_position', 'canvas_remove_position', 'canvas_add_story', '_canvas_can_write']) {
      const fnText = fnBody(raw, name);
      expect(fnText, `${name} raises nothing with the token`).not.toMatch(/RAISE[^;]*p_link_token|RAISE (NOTICE|WARNING|LOG|INFO|DEBUG)/);
    }
    // the write check: owner, an admitting entry, or the current token; anon never reaches it (no uid)
    const w = fnBody(raw, '_canvas_can_write');
    expect(w).toContain('p_uid IS NOT NULL');
    expect(w).toContain('c.link_token = p_token');
  });

  it('the old signatures are dropped first, so no tokenless overload is left, and the new column is constrained to the open state', () => {
    for (const sig of ['get_canvas(uuid, text)', 'canvas_set_position(uuid, text, uuid, public.position_type, text)', 'canvas_remove_position(uuid, text, uuid)', 'canvas_add_story(uuid, text, uuid, text)']) {
      expect(code, sig).toContain(`DROP FUNCTION IF EXISTS public.${sig};`);
      expect(code.indexOf(`DROP FUNCTION IF EXISTS public.${sig};`), sig).toBeLessThan(code.indexOf('CREATE OR REPLACE FUNCTION public.get_canvas('));
    }
    expect(code).toMatch(/CHECK \(\(general_access = 'link'\) = \(link_token IS NOT NULL\)\)/);
  });

  it('_canvas_admitted_via is the previous body plus only the person-first ordering', () => {
    expect(fnBody(raw, '_canvas_admitted_via')).toBe(patched('20261021100000_p1515_artifact_sharing.sql', '_canvas_admitted_via', VIA_EDITS));
  });

  it('no per-row _canvas_can_read call is left in get_canvas: it is asked only inside the materialized readers CTE', () => {
    const body = fnBody(raw, 'get_canvas');
    expect(body).toMatch(/readers AS MATERIALIZED/);
    expect([...body.matchAll(/_canvas_can_read\(/g)]).toHaveLength(1);
    expect(body).not.toContain('_canvas_can_read(v_canvas, pp.user_id)');
    expect(body).not.toContain('_canvas_can_read(v_canvas, cas.author_id)');
  });

  it('grants: get_canvas anon + authenticated on the NEW signature only; the writes and owner tools authenticated only; helpers closed', () => {
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text, text) TO anon, authenticated;');
    const anonGrants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+)\([^)]*\) TO ([^;]*);/g)].filter(m => /\banon\b/.test(m[2]!));
    expect(anonGrants.map(m => m[1])).toEqual(['public.get_canvas']);
    for (const sig of ['canvas_set_position(uuid, text, uuid, public.position_type, text, text)', 'canvas_remove_position(uuid, text, uuid, text)', 'canvas_add_story(uuid, text, uuid, text, text)', 'set_canvas_general_access(text, text)', 'get_canvas_audience(text)']) {
      expect(code, sig).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
    for (const helper of ['_canvas_admitted_via(uuid, uuid)', '_canvas_can_write(uuid, uuid, text)']) {
      expect(code, helper).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
      expect(code, helper).not.toMatch(new RegExp(`GRANT[^;]*public\\.${helper.split('(')[0]}\\(`));
    }
  });
});

describe('CONTROLS: the checks above fail on a broken copy of the real file', () => {
  const raw = read(NEW);

  it('a per-row call put back is caught by the equality check and the no-per-row check', () => {
    const mutated = raw.replace('OR EXISTS (SELECT 1 FROM readers r WHERE r.uid = pp.user_id AND r.ok)', 'OR public._canvas_can_read(v_canvas, pp.user_id)');
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched('20261021200000_p1515_people_and_link.sql', 'get_canvas', GET_CANVAS_EDITS));
    expect(fnBody(mutated, 'get_canvas')).toContain('_canvas_can_read(v_canvas, pp.user_id)');
  });

  it('a CTE that is not MATERIALIZED is caught', () => {
    const mutated = raw.replace('readers AS MATERIALIZED', 'readers AS');
    expect(fnBody(mutated, 'get_canvas')).not.toMatch(/readers AS MATERIALIZED/);
  });

  it('a token check dropped from get_canvas is caught (the link would be guessable again)', () => {
    const mutated = raw.replace('AND c.link_token = p_link_token', '');
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched('20261021200000_p1515_people_and_link.sql', 'get_canvas', GET_CANVAS_EDITS));
  });

  it('a write that falls back to the tokenless read rule is caught', () => {
    const mutated = raw.replace('OR NOT public._canvas_can_write(v_canvas, v_uid, p_link_token)', 'OR NOT public._canvas_can_read(v_canvas, v_uid)');
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, 'canvas_add_story')).not.toBe(patched('20261021170000_p1515_review_fixes.sql', 'canvas_add_story', ADD_STORY_EDITS));
  });

  it('general_access put back into the stranger\'s reply is caught', () => {
    const mutated = raw.replace("'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)", "'access', jsonb_build_object('is_owner', false, 'admitted', false, 'general_access', 'restricted', 'via', NULL)");
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched('20261021200000_p1515_people_and_link.sql', 'get_canvas', GET_CANVAS_EDITS));
  });

  it('a lost person-first ordering is caught', () => {
    const mutated = raw.replace("(a.kind <> 'person'), ", '');
    expect(fnBody(mutated, '_canvas_admitted_via')).not.toBe(patched('20261021100000_p1515_artifact_sharing.sql', '_canvas_admitted_via', VIA_EDITS));
  });
});
