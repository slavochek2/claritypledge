/**
 * @file p1536-b5-open-from-version-migration.test.ts
 * @description P1536 3c B5 source contract for migration 20261102090000 (canvas_draft_open starts a draft as its base):
 *   - the opener is its LATEST previous body (20261029100000) plus only the edits named here: the declarations the inline construction
 *     needed go, and the inline construction (the canvas, the draft version, the thread root, the draft row) is replaced by the engine's
 *     _canvas_draft_new_canvas / _canvas_draft_new(uid, canvas, base, NULL, NULL), with the JSON response read from the new draft row;
 *   - signature, security, search path and grants are unchanged, and nothing else is defined or dropped;
 *   - it is the newest definition of canvas_draft_open, and the two engine functions it now calls are not redefined after the v6 engine.
 * Epistemic gate 7: the last block runs each fact against a mutated copy of the real file and shows it fail.
 * The behaviour is proved on the test database by src/tests/integration/p1536-b5-open-from-version.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261102090000_p1536_b5_open_from_version.sql';
const PREV = '20261029100000_p1536_canvas_draft_versions.sql';
const V6 = '20261030080000_p1536_v6_engine.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}

/** The earlier opener with only the B5 edits applied: what the new body must equal. */
function expectedBody(prevSql: string): string {
  let body = fnBody(prevSql, 'canvas_draft_open');
  const once = (from: string) => {
    const n = body.split(from).length - 1;
    if (n !== 1) throw new Error(`edit source found ${n} times: ${from.slice(0, 70)}`);
  };
  // 1. the declarations only the inline construction used
  const decl = `v_name text := 'canvas'; v_n integer := 1; v_vname text; v_ver uuid; v_conv uuid; v_root uuid; v_at timestamptz; v_draft uuid;`;
  once(decl);
  body = body.replace(decl, 'v_d public.canvas_drafts;');
  // 2. the inline construction, from the new-canvas name loop to the draft row's insert, is the engine's
  const start = 'IF p_from_version IS NULL THEN WHILE EXISTS';
  const end = 'INTO v_draft;';
  once(start); once(end);
  const i = body.indexOf(start); const j = body.indexOf(end) + end.length;
  body = body.slice(0, i)
    + 'IF p_from_version IS NULL THEN v_canvas := public._canvas_draft_new_canvas(v_uid); END IF; '
    + 'v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);'
    + body.slice(j);
  // 3. the response reads the new draft row
  const resp = `'status', 'opened', 'draft_id', v_draft, 'conversation_id', v_conv, 'thread_root_id', v_root, 'canvas_name', v_canvas.name, 'version_name', v_vname,`;
  once(resp);
  body = body.replace(resp, `'status', 'opened', 'draft_id', v_d.id, 'conversation_id', v_d.conversation_id, 'thread_root_id', v_d.thread_root_id, 'canvas_name', v_canvas.name, 'version_name', v_d.version_name,`);
  return norm(body);
}

const facts: Record<string, (sql: string) => boolean> = {
  isThePreviousBodyPlusTheB5Edits: (sql) => fnBody(sql, 'canvas_draft_open') === expectedBody(read(PREV)),
  buildsTheDraftThroughTheEngine: (sql) => {
    const b = fnBody(sql, 'canvas_draft_open');
    return b.includes('v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);')
      && b.includes('v_canvas := public._canvas_draft_new_canvas(v_uid);');
  },
  buildsNothingInline: (sql) => {
    const b = fnBody(sql, 'canvas_draft_open');
    return !/INSERT INTO public\.(canvases|canvas_versions|chat_messages|canvas_drafts|chat_member_state)/.test(b) && !b.includes('_chat_ensure_mirror');
  },
  sameSignatureAndSecurity: (sql) => {
    const b = fnBody(sql, 'canvas_draft_open');
    return b.startsWith(`CREATE OR REPLACE FUNCTION public.canvas_draft_open(p_from_version uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$`);
  },
  sameGrants: (sql) => {
    const code = norm(stripComments(sql));
    return code.includes('REVOKE ALL ON FUNCTION public.canvas_draft_open(uuid) FROM PUBLIC, anon, authenticated;')
      && code.includes('GRANT EXECUTE ON FUNCTION public.canvas_draft_open(uuid) TO authenticated;');
  },
  definesNothingElse: (sql) => {
    const code = stripComments(sql);
    return (code.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? []).length === 1 && !/DROP |ALTER TABLE|CREATE TABLE/.test(code);
  },
};

describe('migration 20261102090000: canvas_draft_open starts a draft as its base', () => {
  const sql = read(NEW);

  it('every fact holds for the real file', () => {
    for (const [name, fact] of Object.entries(facts)) expect(fact(sql), name).toBe(true);
  });

  it('keeps the wrapper the earlier opener had (the checks and the answers stay)', () => {
    const b = fnBody(sql, 'canvas_draft_open');
    for (const keep of [
      "RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501'",
      'pr.is_verified = true',
      "pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0))",
      "v.id = p_from_version AND v.owner_id = v_uid AND v.published_at IS NOT NULL",
      "'status', 'open_elsewhere'",
      "'resumed', true",
      "RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000'",
    ]) expect(b, keep).toContain(keep);
  });

  it('is the newest definition of canvas_draft_open, and the engine functions it calls are not redefined after the v6 engine', () => {
    const files = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    const defs = (name: string) => files.filter((f) => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`).test(stripComments(read(f))));
    expect(defs('canvas_draft_open').pop()).toBe(NEW);
    expect(defs('_canvas_draft_new')).toEqual([V6]);
    expect(defs('_canvas_draft_new_canvas')).toEqual([V6]);
    expect(NEW > PREV && NEW > V6, 'it runs after both').toBe(true);
  });

  describe('gate 7: each fact fails against a mutated copy of the real file', () => {
    const swap = (from: string, to: string) => {
      expect(sql.includes(from), `mutation source present: ${from.slice(0, 50)}`).toBe(true);
      return sql.replace(from, to);
    };
    it('putting the base argument back to NULL breaks the engine call', () => {
      const m = swap('v_canvas.id, p_from_version, NULL, NULL)', 'v_canvas.id, NULL, NULL, NULL)');
      expect(facts.buildsTheDraftThroughTheEngine!(m)).toBe(false);
      expect(facts.isThePreviousBodyPlusTheB5Edits!(m)).toBe(false);
    });
    it('an inline insert coming back is caught', () => {
      const m = swap('v_d := public._canvas_draft_new(', "INSERT INTO public.canvas_versions (canvas_id, owner_id, name) VALUES (v_canvas.id, v_uid, 'x'); v_d := public._canvas_draft_new(");
      expect(facts.buildsNothingInline!(m)).toBe(false);
      expect(facts.isThePreviousBodyPlusTheB5Edits!(m)).toBe(false);
    });
    it('dropping a guard of the wrapper is caught by the body comparison', () => {
      const m = swap("RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';", 'NULL;');
      expect(facts.isThePreviousBodyPlusTheB5Edits!(m)).toBe(false);
    });
    it('losing the grant, or a second definition, is caught', () => {
      expect(facts.sameGrants!(swap('GRANT EXECUTE ON FUNCTION public.canvas_draft_open(uuid) TO authenticated;', ''))).toBe(false);
      expect(facts.definesNothingElse!(sql + '\nCREATE OR REPLACE FUNCTION public.other() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;')).toBe(false);
      expect(facts.sameSignatureAndSecurity!(swap('SECURITY DEFINER', 'SECURITY INVOKER'))).toBe(false);
    });
  });
});
