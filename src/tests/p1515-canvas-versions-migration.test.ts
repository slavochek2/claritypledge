/**
 * @file p1515-canvas-versions-migration.test.ts
 * @description P1515 phase 5 source contract for migration 20261022170000 (one canvas, many versions):
 *   - every body it redefines is its previous body plus only the edits listed here;
 *   - versions are closed to clients, one name per owner, and every canvas has its own name as its first version;
 *   - get_canvas is the only anon-executable function it touches, with the new argument last;
 *   - the writes find the canvas by any version name and check the point against the canvas's versions.
 * Epistemic gate 7: the last block runs each check against a mutated copy of the real file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261022170000_p1515_canvas_versions.sql';
const S230 = '20261021230000_p1515_link_write_snapshot.sql';
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

const LOCK_OLD = 'FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name FOR SHARE;';
const LOCK_NEW = 'FROM public.canvases c WHERE c.id = public._canvas_resolve(p_owner, v_name) FOR SHARE;';
const POINT_OLD = 'public._canvas_point_in(p_owner, v_name, p_point)';
const POINT_NEW = 'public._canvas_point_in_canvas(v_canvas, p_owner, v_name, p_point)';
const SOURCES: Record<string, string> = { get_canvas: S230, canvas_set_position: S230, canvas_add_story: S230, canvas_remove_position: S210 };
const EDITS: Record<string, Array<[string, string]>> = {
  canvas_set_position: [[LOCK_OLD, LOCK_NEW], [POINT_OLD, POINT_NEW]],
  canvas_add_story: [[LOCK_OLD, LOCK_NEW], [POINT_OLD, POINT_NEW]],
  canvas_remove_position: [
    ['SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name;',
      'SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.id = public._canvas_resolve(p_owner, v_name);'],
    [POINT_OLD, POINT_NEW],
  ],
  get_canvas: [
    ['CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text, p_link_token text DEFAULT NULL)',
      'CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text, p_link_token text DEFAULT NULL, p_version text DEFAULT NULL)'],
    ['v_tag text;', 'v_tag text; v_ver text;'],
    ['WHERE c.owner_id = p_owner AND c.name = v_name; IF v_canvas IS NOT NULL AND NOT v_is_owner THEN',
      'WHERE c.id = public._canvas_resolve(p_owner, v_name); IF v_canvas IS NOT NULL AND NOT v_is_owner THEN'],
    ['v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_tok_ok, false); END IF;',
      `v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_tok_ok, false);
       IF COALESCE(v_admitted, false) THEN
         IF v_canvas IS NULL THEN
           v_ver := CASE WHEN p_version IS NULL OR lower(p_version) = v_name THEN v_name END;
         ELSE
           SELECT v.name INTO v_ver FROM public.canvas_versions v
            WHERE v.canvas_id = v_canvas AND (p_version IS NULL OR v.name = lower(p_version))
            ORDER BY v.created_at DESC, v.name DESC LIMIT 1;
         END IF;
         IF v_ver IS NULL THEN v_admitted := false; END IF;
       END IF;
       END IF;`],
    ["v_tag := 'canvas_' || v_name;", "v_tag := 'canvas_' || v_ver;"],
    ["'canvas_exists', (v_is_owner AND v_canvas IS NOT NULL),",
      `'canvas_exists', (v_is_owner AND v_canvas IS NOT NULL),
       'version', v_ver,
       'versions', COALESCE((
         SELECT jsonb_agg(jsonb_build_object('name', v.name, 'created_at', v.created_at) ORDER BY v.created_at DESC, v.name DESC)
           FROM public.canvas_versions v WHERE v.canvas_id = v_canvas
       ), jsonb_build_array(jsonb_build_object('name', v_name, 'created_at', NULL))),`],
  ],
};

describe('P1515 phase 5 migration (20261022170000)', () => {
  const raw = read(NEW);
  const code = stripComments(raw);

  it('carries the header: diffed-against and client-safe', () => {
    expect(raw).toMatch(/diffed against:/);
    expect(raw).toMatch(/client-safe:/);
  });

  it.each(Object.keys(EDITS))('%s is its previous body plus only the edits listed in this test', name => {
    expect(fnBody(raw, name)).toBe(patched(SOURCES[name]!, name, EDITS[name]!));
  });

  it('versions are closed to clients, one name per owner and per canvas, and cascade with the canvas', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.canvas_versions/);
    expect(code).toMatch(/ALTER TABLE public\.canvas_versions ENABLE ROW LEVEL SECURITY;/);
    expect(code).toMatch(/REVOKE ALL ON TABLE public\.canvas_versions FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/UNIQUE \(owner_id, name\)/);
    expect(code).toMatch(/UNIQUE \(canvas_id, name\)/);
    expect(code).toMatch(/canvas_id\s+uuid NOT NULL REFERENCES public\.canvases\(id\) ON DELETE CASCADE/);
    expect(code).not.toMatch(/CREATE POLICY/i);
  });

  it('every canvas has its own name as its first version: a backfill, and a trigger for every new canvas', () => {
    expect(norm(code)).toContain('INSERT INTO public.canvas_versions (canvas_id, owner_id, name, created_at) SELECT c.id, c.owner_id, c.name, c.created_at FROM public.canvases c');
    expect(code).toMatch(/CREATE TRIGGER canvases_first_version AFTER INSERT ON public\.canvases/);
  });

  it('the old 3-argument get_canvas is dropped (no ambiguous overload) and the new one is the only anon grant', () => {
    expect(code).toMatch(/DROP FUNCTION IF EXISTS public\.get_canvas\(uuid, text, text\);/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_canvas\(uuid, text, text, text\) FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas\(uuid, text, text, text\) TO anon, authenticated;/);
    const anonGrants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO [^;]*\banon\b/g)].map(m => m[1]);
    expect(anonGrants).toEqual(['get_canvas']);
  });

  it('the helpers and the trigger function are closed to every client role, pin an empty search_path and run as definer', () => {
    for (const [name, sig] of [['_canvas_resolve', 'uuid, text'], ['_canvas_point_in_canvas', 'uuid, uuid, text, uuid'], ['_canvas_first_version', '']]) {
      expect(code, name).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(${sig}\\) FROM PUBLIC, anon, authenticated;`));
      expect(code, `${name} not granted`).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}`));
    }
    for (const name of ['_canvas_resolve', '_canvas_point_in_canvas', '_canvas_first_version']) {
      const header = code.slice(code.indexOf(`FUNCTION public.${name}(`), code.indexOf('AS $$', code.indexOf(`FUNCTION public.${name}(`)));
      expect(header, name).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    }
  });

  it('the grants of the three writes are restated exactly as before (signed in only)', () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.canvas_set_position\(uuid, text, uuid, public\.position_type, text, text\) TO authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.canvas_add_story\(uuid, text, uuid, text, text\) TO authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.canvas_remove_position\(uuid, text, uuid, text\) TO authenticated;/);
  });

  it('a version that is not this canvas\'s empties the answer: the shared not-found branch is untouched', () => {
    const body = fnBody(raw, 'get_canvas');
    expect(body).toContain('IF v_ver IS NULL THEN v_admitted := false; END IF;');
    expect(body).toContain("'points', '[]'::jsonb, 'stories', '[]'::jsonb, 'positions', '[]'::jsonb, 'visibility', NULL, 'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)");
  });
});

describe('CONTROLS: the checks fail on a broken copy of the real file', () => {
  const raw = read(NEW);
  it('an extra edit in a copied body is caught by the equality check', () => {
    const mutated = raw.replace('ORDER BY v.created_at DESC, v.name DESC\n         LIMIT 1;', 'ORDER BY v.created_at ASC, v.name DESC\n         LIMIT 1;');
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched(S230, 'get_canvas', EDITS.get_canvas!));
  });
  it('a policy on the versions table would be caught', () => {
    expect(stripComments(raw + '\nCREATE POLICY x ON public.canvas_versions FOR SELECT USING (true);')).toMatch(/CREATE POLICY/i);
  });
  it('an anon grant on a helper would be caught', () => {
    const code = stripComments(raw + '\nGRANT EXECUTE ON FUNCTION public._canvas_resolve(uuid, text) TO anon;');
    expect([...code.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO [^;]*\banon\b/g)].map(m => m[1])).not.toEqual(['get_canvas']);
  });
});

describe('P1515 phase 5 integrity migration (20261022180000)', () => {
  const FILE = '20261022180000_p1515_canvas_versions_integrity.sql';
  const raw = read(FILE);
  const code = stripComments(raw);

  it('carries the header: client-safe, and says what each constraint is for', () => {
    expect(raw).toMatch(/client-safe:/);
  });

  it('the version\'s owner is the canvas\'s owner: a composite foreign key onto a unique (id, owner_id)', () => {
    expect(code).toMatch(/ALTER TABLE public\.canvases ADD CONSTRAINT canvases_id_owner_key UNIQUE \(id, owner_id\);/);
    expect(norm(code)).toContain('FOREIGN KEY (canvas_id, owner_id) REFERENCES public.canvases (id, owner_id) ON DELETE CASCADE');
  });

  it('a point carries at most one version tag of a canvas: a trigger on points (insert and system_tags update) and one on canvas_versions', () => {
    expect(code).toMatch(/CREATE TRIGGER trg_p1515_point_one_version\s+BEFORE INSERT OR UPDATE OF system_tags ON public\.points/);
    expect(code).toMatch(/HAVING count\(DISTINCT v\.name\) > 1/);
    expect(code).toMatch(/CREATE TRIGGER trg_p1515_version_points_single\s+BEFORE INSERT ON public\.canvas_versions/);
    expect(code.match(/ERRCODE = '23514'/g)).toHaveLength(2);
  });

  it('adds no policy, no grant and no new client-callable function; the trigger functions are closed and pin an empty search_path', () => {
    expect(code).not.toMatch(/CREATE POLICY|GRANT /i);
    for (const name of ['_canvas_point_one_version', '_canvas_version_keeps_points_single']) {
      expect(code, name).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC, anon, authenticated;`));
      const header = code.slice(code.indexOf(`FUNCTION public.${name}(`), code.indexOf('AS $$', code.indexOf(`FUNCTION public.${name}(`)));
      expect(header, name).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    }
  });

  it('CONTROLS: a dropped foreign key, a dropped trigger and a weakened count are each caught on a broken copy', () => {
    const noFk = stripComments(raw.replace('FOREIGN KEY (canvas_id, owner_id)', 'FOREIGN KEY (canvas_id)'));
    expect(norm(noFk)).not.toContain('FOREIGN KEY (canvas_id, owner_id) REFERENCES public.canvases (id, owner_id)');
    expect(stripComments(raw.replace('CREATE TRIGGER trg_p1515_point_one_version', 'CREATE TRIGGER other'))).not.toMatch(/CREATE TRIGGER trg_p1515_point_one_version/);
    expect(stripComments(raw.replace('count(DISTINCT v.name) > 1', 'count(DISTINCT v.name) > 2'))).not.toMatch(/HAVING count\(DISTINCT v\.name\) > 1/);
  });
});

describe('P1515 phase 5 race migration (20261022190000)', () => {
  const FILE = '20261022190000_p1515_canvas_versions_race.sql';
  const PREV = '20261022180000_p1515_canvas_versions_integrity.sql';
  const raw = read(FILE);
  const code = stripComments(raw);
  const LOCK = (key: string) => `PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || ${key}::text, 0));`;

  it('carries the header: diffed-against, client-safe, and the reason the second waiter sees the first\'s commit', () => {
    expect(raw).toMatch(/diffed against: 20261022180000/);
    expect(raw).toMatch(/client-safe:/);
    expect(raw).toMatch(/READ COMMITTED/);
    expect(raw).toMatch(/fresh snapshot/);
  });

  it('both triggers are their previous bodies plus ONLY the one lock statement, taken on the owner\'s key before any check', () => {
    const one = fnBody(read(PREV), '_canvas_point_one_version');
    expect(fnBody(raw, '_canvas_point_one_version')).toBe(one.replace('IF EXISTS (', `${LOCK('NEW.first_validator_id')} IF EXISTS (`));
    const keep = fnBody(read(PREV), '_canvas_version_keeps_points_single');
    expect(fnBody(raw, '_canvas_version_keeps_points_single')).toBe(keep.replace('BEGIN IF EXISTS (', `BEGIN ${LOCK('NEW.owner_id')} IF EXISTS (`));
    for (const name of ['_canvas_point_one_version', '_canvas_version_keeps_points_single']) {
      const b = fnBody(raw, name);
      expect(b.indexOf('pg_advisory_xact_lock'), `${name}: the lock comes before the check`).toBeLessThan(b.indexOf('IF EXISTS ('));
    }
    // both use the SAME key text, so the two writers queue on one lock
    expect(code.match(/'p1515:canvas_versions:'/g)).toHaveLength(2);
  });

  it('canvas_id, owner_id and name are immutable (a BEFORE UPDATE trigger on canvas_versions)', () => {
    expect(code).toMatch(/CREATE TRIGGER trg_p1515_version_immutable\s+BEFORE UPDATE ON public\.canvas_versions/);
    const b = fnBody(raw, '_canvas_version_immutable');
    for (const col of ['canvas_id', 'owner_id', 'name']) expect(b).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
  });

  it('the points trigger also fires when only first_validator_id changes', () => {
    expect(code).toMatch(/CREATE TRIGGER trg_p1515_point_one_version\s+BEFORE INSERT OR UPDATE OF system_tags, first_validator_id ON public\.points/);
  });

  it('adds no policy and no grant; the new function is closed and pins an empty search_path', () => {
    expect(code).not.toMatch(/CREATE POLICY|GRANT /i);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\._canvas_version_immutable\(\) FROM PUBLIC, anon, authenticated;/);
  });

  it('CONTROLS: a dropped lock, a dropped column and a dropped immutable column are each caught on a broken copy', () => {
    expect(fnBody(raw.replace(LOCK('NEW.owner_id'), ''), '_canvas_version_keeps_points_single')).not.toContain('pg_advisory_xact_lock');
    expect(stripComments(raw.replace('system_tags, first_validator_id', 'system_tags'))).not.toMatch(/OF system_tags, first_validator_id/);
    expect(fnBody(raw.replace('NEW.name IS DISTINCT FROM OLD.name', 'false'), '_canvas_version_immutable')).not.toContain('NEW.name IS DISTINCT FROM OLD.name');
  });
});
