/**
 * @file p1536-canvas-title-migration.test.ts
 * @description P1536 W8 source contract for migration 20261101180000 (a canvas has a display title the owner can rename):
 *   - canvases gains a NULLABLE title, checked trimmed and 1 to 60 characters at the table level;
 *   - canvas_rename is owner-only (SECURITY DEFINER, search_path pinned, the same 42501 refusal as the neighbouring canvas functions),
 *     trims, refuses empty and over-60 titles, never touches the address tag or a version name, and is granted to authenticated only;
 *   - every read function it restates is its NEWEST previous body plus only the listed title edits, keeps its grants, and is the newest
 *     definition of all (so no P1536 edit of those bodies was dropped by copying an older one).
 * Epistemic gate 7: the last block runs each fact against a mutated copy of the real file and shows it fail.
 * The behaviour itself needs the test database; this file pins the source.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const M = '20261101180000_p1536_canvas_title.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const rawM = read(M);

function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}
function patched(source: string, name: string, edits: Array<[string, string]>): string {
  let body = fnBody(read(source), name);
  for (const [from, to] of edits) {
    const f = norm(from);
    const occurrences = body.split(f).length - 1;
    if (occurrences !== 1) throw new Error(`${name}: edit source found ${occurrences} times: ${f.slice(0, 70)}`);
    body = norm(body.replace(f, norm(to)));
  }
  return body;
}
const definers = (name: string): string[] => {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  return readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && re.test(stripComments(read(f)))).sort();
};

const A = '20261029100000_p1536_canvas_draft_versions.sql';
const V6 = '20261030080000_p1536_v6_engine.sql';
type Replaced = { source: string; sig: string; edits: Array<[string, string]>; dropped?: boolean };
const REPLACED: Record<string, Replaced> = {
  get_canvas: {
    source: V6, sig: 'uuid, text, text, text',
    edits: [[`'published_none', v_pub_none,`,
      `'published_none', v_pub_none, 'title', (SELECT c.title FROM public.canvases c WHERE c.id = v_canvas), 'canvas_id', CASE WHEN v_is_owner THEN v_canvas END,`]],
  },
  list_my_artifacts_canvases: {
    source: A, sig: '', dropped: true,
    edits: [
      [`last_edit      timestamptz )`, `last_edit      timestamptz, title          text )`],
      [`COALESCE(tg.edited, c.created_at) FROM tagged tg`, `COALESCE(tg.edited, c.created_at), c.title FROM tagged tg`],
    ],
  },
  list_canvases_shared_with_me: {
    source: A, sig: '', dropped: true,
    edits: [
      [`unread             boolean )`, `unread             boolean, title              text )`],
      [`(r.read_at IS NULL OR r.read_at < a.created_at) FROM public.canvases c`, `(r.read_at IS NULL OR r.read_at < a.created_at), c.title FROM public.canvases c`],
    ],
  },
  get_chat_artifact_attachment: {
    source: A, sig: 'text, uuid',
    edits: [[`'is_owner', v_canvas.owner_id = v_uid);`, `'is_owner', v_canvas.owner_id = v_uid, 'title', v_canvas.title);`]],
  },
  list_my_canvas_versions: {
    source: A, sig: '',
    edits: [[`'canvas_name', c.name, 'name', v.name,`, `'canvas_name', c.name, 'canvas_title', c.title, 'name', v.name,`]],
  },
  list_canvases_shared_with_event: {
    source: A, sig: 'uuid',
    edits: [[`'owner_slug', pr.slug, 'name', c.name)`, `'owner_slug', pr.slug, 'name', c.name, 'title', c.title)`]],
  },
};

describe('P1536 W8 migration: the title column', () => {
  const code = norm(stripComments(rawM));
  it('canvases gains a NULLABLE title, checked trimmed and 1 to 60 characters', () => {
    expect(code).toContain('ALTER TABLE public.canvases ADD COLUMN IF NOT EXISTS title text;');
    expect(code).not.toMatch(/ADD COLUMN IF NOT EXISTS title text NOT NULL/);
    expect(code).toContain('CHECK (title IS NULL OR (title = btrim(title) AND char_length(title) BETWEEN 1 AND 60))');
  });
  it('the file is one transaction and changes no other table', () => {
    expect(code.startsWith('BEGIN;')).toBe(true);
    expect(code.endsWith('COMMIT;')).toBe(true);
    expect(code.match(/ALTER TABLE public\.\w+/g)!.every((m) => m === 'ALTER TABLE public.canvases')).toBe(true);
  });
});

describe('P1536 W8 migration: canvas_rename', () => {
  const body = fnBody(rawM, 'canvas_rename');
  it('is SECURITY DEFINER with the search_path pinned empty, like every neighbouring canvas function', () => {
    expect(body).toContain('RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = \'\'');
  });
  it('refuses the signed-out and anyone who is not the canvas owner with the neighbours\' 42501 "not authorized for this canvas"', () => {
    expect(body).toContain("IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';");
    expect(body).toContain('NOT EXISTS (SELECT 1 FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = v_uid)');
    expect(body).toContain("RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';");
  });
  it('trims, refuses empty and over-60-character titles, and writes only the title of an owned canvas', () => {
    expect(body).toContain("v_title text := btrim(COALESCE(p_title, ''));");
    expect(body).toContain('char_length(v_title) < 1 OR char_length(v_title) > 60');
    expect(body).toContain("USING ERRCODE = '22023'");
    expect(body).toContain('UPDATE public.canvases c SET title = v_title WHERE c.id = p_canvas AND c.owner_id = v_uid;');
  });
  it('never touches the address tag or a version name', () => {
    const update = body.slice(body.indexOf('UPDATE public.canvases'));
    expect(update).not.toMatch(/SET[^;]*\bname\b/);
    expect(body).not.toContain('canvas_versions');
  });
  it('is closed to PUBLIC and anon and granted to authenticated only', () => {
    const code = stripComments(rawM);
    expect(code).toContain('REVOKE ALL ON FUNCTION public.canvas_rename(uuid, text) FROM PUBLIC, anon;');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.canvas_rename(uuid, text) TO authenticated;');
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.canvas_rename[^;]*\b(anon|PUBLIC)\b/);
  });
});

describe('P1536 W8 migration: replaced read functions', () => {
  it.each(Object.keys(REPLACED))('%s is its NEWEST previous body plus only the title edits', (name) => {
    const r = REPLACED[name]!;
    expect(fnBody(rawM, name)).toBe(patched(r.source, name, r.edits));
  });
  it.each(Object.keys(REPLACED))('%s: the source named is the newest definition before this file, and this file is the newest of all', (name) => {
    const defs = definers(name);
    expect(defs[defs.length - 1]).toBe(M);
    expect(defs[defs.length - 2]).toBe(REPLACED[name]!.source);
  });
  it.each(Object.keys(REPLACED))('%s restates its grants exactly as its source has them', (name) => {
    const r = REPLACED[name]!;
    const sig = r.sig.replace(/[()]/g, '\\$&');
    const grantsOf = (sql: string) => stripComments(sql).match(new RegExp(`(?:REVOKE|GRANT)[^;]*FUNCTION public\\.${name}\\(${sig}\\)[^;]*;`, 'g'))!.map(norm);
    expect(grantsOf(rawM)).toEqual(grantsOf(read(r.source)));
    expect(grantsOf(rawM).length).toBe(2);
  });
  it('the two TABLE-returning functions are dropped first (a row type cannot change under CREATE OR REPLACE), in the same transaction', () => {
    const code = stripComments(rawM);
    for (const name of ['list_my_artifacts_canvases', 'list_canvases_shared_with_me']) {
      expect(code.indexOf(`DROP FUNCTION IF EXISTS public.${name}();`), name).toBeGreaterThan(code.indexOf('BEGIN;'));
      expect(code.indexOf(`DROP FUNCTION IF EXISTS public.${name}();`), name).toBeLessThan(code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
    }
  });
  it('get_canvas keeps the v6 additions (from_seq, revision, focus, changed_boxes) and its anon grant', () => {
    const body = fnBody(rawM, 'get_canvas');
    for (const keep of [`'from_seq', v.from_seq`, `'revision', d.revision, 'focus', d.focus`, `'changed_boxes', to_jsonb(public._canvas_draft_changed_boxes(d.id))`]) {
      expect(body, keep).toContain(norm(keep));
    }
    expect(stripComments(rawM)).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas\(uuid, text, text, text\) TO anon, authenticated;/);
  });
  it('the canvas id reaches the OWNER only (a reader never learns it)', () => {
    expect(fnBody(rawM, 'get_canvas')).toContain("'canvas_id', CASE WHEN v_is_owner THEN v_canvas END");
  });
});

describe('CONTROL (gate 7): the same facts fail on a mutated copy of the real file', () => {
  it('a body that dropped a P1536 edit (copied from the older A instead of v6) is not the patched v6 body', () => {
    const olderGetCanvas = fnBody(read(A), 'get_canvas');
    expect(olderGetCanvas).not.toBe(patched(V6, 'get_canvas', REPLACED.get_canvas!.edits));
  });
  it('a rename that let anon execute it is caught by the grant predicate', () => {
    const bad = rawM.replace('REVOKE ALL ON FUNCTION public.canvas_rename(uuid, text) FROM PUBLIC, anon;', 'REVOKE ALL ON FUNCTION public.canvas_rename(uuid, text) FROM PUBLIC;');
    expect(stripComments(bad)).not.toContain('FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.canvas_rename');
    expect(stripComments(bad)).not.toContain('REVOKE ALL ON FUNCTION public.canvas_rename(uuid, text) FROM PUBLIC, anon;');
  });
  it('a rename without the owner check or the length check is caught', () => {
    const noOwner = rawM.replace('AND c.owner_id = v_uid) THEN', ') THEN');
    expect(fnBody(noOwner, 'canvas_rename')).not.toContain('c.id = p_canvas AND c.owner_id = v_uid)');
    const noLength = rawM.replace('OR char_length(v_title) > 60', '');
    expect(fnBody(noLength, 'canvas_rename')).not.toContain('char_length(v_title) > 60');
  });
  it('a copy that left out a title edit differs from the expected body', () => {
    const mutated = rawM.replace("),\n         c.title -- P1536 W8\n    FROM tagged tg", ")\n    FROM tagged tg");
    expect(mutated).not.toBe(rawM);
    expect(fnBody(mutated, 'list_my_artifacts_canvases')).not.toBe(patched(A, 'list_my_artifacts_canvases', REPLACED.list_my_artifacts_canvases!.edits));
  });
});
