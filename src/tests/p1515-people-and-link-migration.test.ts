/**
 * @file p1515-people-and-link-migration.test.ts
 * @description P1515 phase 3 source contract for migration 20261021200000 (share with one person,
 * and "anyone with the link"). It pins what a live test cannot see across a future edit:
 *   - the five functions it re-creates are their previous bodies plus ONLY the edits listed here
 *     (a whole-body copy is the regression class this guards: an older base silently reverting an
 *     earlier fix);
 *   - the new internal helpers are closed to every client role, the new owner function is open to
 *     signed-in callers only, and get_canvas is the single anon-executable canvas function;
 *   - a person entry is accepted only by the search_profiles rule, and only for a canvas the caller owns;
 *   - the migration touches no policy, no point visibility and no trigger (rows never change visibility).
 *
 * Epistemic gate 7: every check runs against a mutated copy of the real file in the last block, so a
 * green run proves each one can fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261021200000_p1515_people_and_link.sql';
const BASE1 = '20261021100000_p1515_artifact_sharing.sql';
const BASE2 = '20261021170000_p1515_review_fixes.sql';

const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One function's statement, from its CREATE to the closing $$; (comments stripped, whitespace collapsed). */
function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}

/** The previous body with each listed edit applied, to compare with the new body. */
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
  _canvas_event_admits: {
    source: BASE1,
    edits: [[
      `AND NOT EXISTS ( SELECT 1 FROM public.event_removals x WHERE x.event_id = e.id AND x.user_id = p_uid )`,
      `AND NOT EXISTS ( SELECT 1 FROM public.event_removals x WHERE x.event_id = e.id AND x.user_id = p_uid ) AND e.status IS DISTINCT FROM 'cancelled'`,
    ]],
  },
  _canvas_entry_admits: {
    source: BASE1,
    edits: [[
      `SELECT public._canvas_target_admits(a.kind, a.event_id, a.org_id, c.owner_id) AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_uid) FROM`,
      `SELECT CASE a.kind WHEN 'person' THEN p_uid IS NOT NULL AND a.profile_id = p_uid ELSE public._canvas_target_admits(a.kind, a.event_id, a.org_id, c.owner_id) AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_uid) END FROM`,
    ]],
  },
  _canvas_can_read: {
    source: BASE1,
    edits: [[
      `AND (c.owner_id = p_uid OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)`,
      `AND (c.owner_id = p_uid OR c.general_access = 'link' OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)`,
    ]],
  },
  get_canvas: {
    source: BASE2,
    edits: [
      [`v_admitted boolean;`, `v_admitted boolean; v_link boolean;`],
      [`SELECT c.id INTO v_canvas FROM public.canvases c`, `SELECT c.id, c.general_access = 'link' INTO v_canvas, v_link FROM public.canvases c`],
      [`v_admitted := v_is_owner OR v_via IS NOT NULL;`, `v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_link, false);`],
      [`'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)`, `'access', jsonb_build_object('is_owner', false, 'admitted', false, 'general_access', 'restricted', 'via', NULL)`],
      [
        `'visibility', CASE WHEN EXISTS ( SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = v_canvas AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner) ) THEN 'shared' ELSE 'private' END,`,
        `'visibility', CASE WHEN COALESCE(v_link, false) OR EXISTS ( SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = v_canvas AND (a.kind = 'person' OR public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner)) ) THEN 'shared' ELSE 'private' END,`,
      ],
      [
        `'admitted', true, 'via', ( SELECT jsonb_build_object( 'kind', a.kind, 'id', COALESCE(a.event_id, a.org_id), 'name', COALESCE(e.title, o.name), 'slug', COALESCE(e.slug, o.slug)) FROM public.canvas_audience a LEFT JOIN public.events e ON e.id = a.event_id LEFT JOIN public.organization o ON o.id = a.org_id WHERE a.id = v_via )`,
        `'admitted', true, 'general_access', CASE WHEN COALESCE(v_link, false) THEN 'link' ELSE 'restricted' END, 'via', ( SELECT jsonb_build_object( 'kind', a.kind, 'id', COALESCE(a.event_id, a.org_id, a.profile_id), 'name', CASE WHEN a.kind = 'person' THEN ow.name ELSE COALESCE(e.title, o.name) END, 'slug', CASE WHEN a.kind = 'person' THEN ow.slug ELSE COALESCE(e.slug, o.slug) END) FROM public.canvas_audience a LEFT JOIN public.events e ON e.id = a.event_id LEFT JOIN public.organization o ON o.id = a.org_id LEFT JOIN public.profiles ow ON ow.id = p_owner WHERE a.id = v_via )`,
      ],
    ],
  },
  share_canvas: {
    source: BASE2,
    edits: [
      [`p_kind NOT IN ('event', 'group')`, `p_kind NOT IN ('event', 'group', 'person')`],
      [
        `IF NOT public._canvas_target_admits( p_kind, CASE WHEN p_kind = 'event' THEN p_target END, CASE WHEN p_kind = 'group' THEN p_target END, v_uid) THEN RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501'; END IF;`,
        `IF p_kind = 'person' THEN IF NOT public._canvas_person_eligible(v_uid, p_target) THEN RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501'; END IF; ELSIF NOT public._canvas_target_admits( p_kind, CASE WHEN p_kind = 'event' THEN p_target END, CASE WHEN p_kind = 'group' THEN p_target END, v_uid) THEN RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501'; END IF;`,
      ],
      [
        `INSERT INTO public.canvas_audience (canvas_id, kind, event_id, org_id) VALUES ( v_canvas, p_kind, CASE WHEN p_kind = 'event' THEN p_target END, CASE WHEN p_kind = 'group' THEN p_target END )`,
        `INSERT INTO public.canvas_audience (canvas_id, kind, event_id, org_id, profile_id) VALUES ( v_canvas, p_kind, CASE WHEN p_kind = 'event' THEN p_target END, CASE WHEN p_kind = 'group' THEN p_target END, CASE WHEN p_kind = 'person' THEN p_target END )`,
      ],
    ],
  },
  unshare_canvas: {
    source: BASE1,
    edits: [[
      `AND ((a.kind = 'event' AND a.event_id = p_target) OR (a.kind = 'group' AND a.org_id = p_target))`,
      `AND ((a.kind = 'event' AND a.event_id = p_target) OR (a.kind = 'group' AND a.org_id = p_target) OR (a.kind = 'person' AND a.profile_id = p_target))`,
    ]],
  },
};

describe('P1515 phase 3 migration (20261021200000)', () => {
  const raw = read(NEW);
  const code = stripComments(raw);

  it('carries the header: diffed-against, client-safe, and a reason for each anon re-grant', () => {
    expect(raw).toMatch(/diffed against:/);
    expect(raw).toMatch(/client-safe:/);
    expect(raw).toMatch(/widens-revoked-grant: 20261021100000 \S/);
    expect(raw).toMatch(/widens-revoked-grant: 20261021170000 \S/);
  });

  it.each(Object.keys(EDITS))('%s is its previous body plus only the edits listed in this test', name => {
    const { source, edits } = EDITS[name]!;
    expect(fnBody(raw, name)).toBe(patched(source, name, edits));
  });

  it('the audience table gains the person kind with exactly one target per row, one entry per person, and a canvas general access of two values', () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
    expect(code).toMatch(/CHECK \(kind IN \('event', 'group', 'person'\)\)/);
    expect(code).toMatch(/kind = 'person' AND profile_id IS NOT NULL AND event_id IS NULL AND org_id IS NULL/);
    expect(code).toMatch(/kind = 'event'\s+AND event_id IS NOT NULL AND org_id IS NULL AND profile_id IS NULL/);
    expect(code).toMatch(/UNIQUE \(canvas_id, profile_id\)/);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS general_access text NOT NULL DEFAULT 'restricted'/);
    expect(code).toMatch(/CHECK \(general_access IN \('restricted', 'link'\)\)/);
  });

  it('a person is accepted only by the search_profiles rule: never the owner, an existing profile, admin or in the relationship scope', () => {
    const fn = fnBody(raw, '_canvas_person_eligible');
    expect(fn).toContain('p_owner <> p_person');
    expect(fn).toContain('p878_relationship_scope(p_owner)');
    expect(fn).toMatch(/o\.is_admin/);
    expect(fn).toMatch(/t\.is_admin/);
    expect(fn).toMatch(/SELECT 1 FROM public\.profiles t WHERE t\.id = p_person/);
    expect(fnBody(raw, 'share_canvas')).toContain('_canvas_person_eligible(v_uid, p_target)');
  });

  it('set_canvas_general_access: signed in, two values, a canvas the caller owns, no public point to open it, one refusal message', () => {
    const fn = fnBody(raw, 'set_canvas_general_access');
    expect(fn).toContain("IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501'");
    expect(fn).toContain("p_access NOT IN ('restricted', 'link')");
    expect(fn).toMatch(/p\.first_validator_id = v_uid/);
    expect(fn).toMatch(/p_access = 'link' AND EXISTS \( SELECT 1 FROM public\.points p WHERE[^;]*p\.visibility = 'public'::public\.content_visibility/);
    expect(fn).toMatch(/INSERT INTO public\.canvases \(owner_id, name, general_access\) VALUES \(v_uid, v_name, p_access\) ON CONFLICT \(owner_id, name\) DO UPDATE SET general_access = EXCLUDED\.general_access/);
    const refusals = new Set([...fn.matchAll(/RAISE EXCEPTION '([^']*)' USING ERRCODE = '42501'/g)].map(m => m[1]));
    expect(refusals).toEqual(new Set(['not authorized for this canvas', 'sign in required']));
    // the caller is derived from auth.uid() only: no parameter names an owner
    expect(fn).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
    expect(fn).not.toMatch(/p_owner/);
  });

  it('grants: get_canvas is the only anon-executable function; the helpers are closed; the owner function is signed-in only', () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas\(uuid, text\) TO anon, authenticated;/);
    const anonGrants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+)\([^)]*\) TO ([^;]*);/g)].filter(m => /\banon\b/.test(m[2]!));
    expect(anonGrants.map(m => m[1])).toEqual(['public.get_canvas']);
    for (const helper of ['_canvas_person_eligible(uuid, uuid)', '_canvas_event_admits(uuid, uuid)', '_canvas_entry_admits(uuid, uuid)', '_canvas_can_read(uuid, uuid)']) {
      expect(code, helper).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
      expect(code, helper).not.toMatch(new RegExp(`GRANT[^;]*public\\.${helper.split('(')[0]}\\([^;]*\\bTO\\b`));
    }
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.set_canvas_general_access(text, text) TO authenticated;');
    // every grant comes after its function, so the file's last word on get_canvas is the re-grant
    expect(code.lastIndexOf('GRANT EXECUTE ON FUNCTION public.get_canvas')).toBeGreaterThan(code.indexOf('CREATE OR REPLACE FUNCTION public.get_canvas('));
  });

  it('every function it creates pins an empty search_path and runs as definer', () => {
    for (const name of ['_canvas_person_eligible', 'set_canvas_general_access', '_canvas_can_read', 'get_canvas', 'share_canvas']) {
      expect(fnBody(raw, name), name).toMatch(/SECURITY DEFINER SET search_path = ''/);
    }
  });

  it('rows never change visibility: no policy, no trigger, no points DDL, no change of any row\'s visibility', () => {
    expect(code).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(code).not.toMatch(/CREATE TRIGGER|DROP TRIGGER|DISABLE TRIGGER/i);
    expect(code).not.toMatch(/ALTER TABLE public\.points|UPDATE public\.points|INSERT INTO public\.points/i);
    expect(code).not.toMatch(/SET visibility/i);
  });

  it('a link canvas appears in no list: the two list functions are not touched', () => {
    expect(code).not.toContain('list_canvases_shared_with_event');
    expect(code).not.toContain('get_canvas_share_targets');
  });
});

describe('CONTROLS: the helpers above fail on a broken copy of the real file', () => {
  const raw = read(NEW);

  it('an extra edit in a copied body is caught by the equality check', () => {
    const mutated = raw.replace('AND cas.point_id IN (SELECT cp.id FROM cp)', 'AND true');
    expect(mutated).not.toBe(raw);
    expect(fnBody(mutated, 'get_canvas')).not.toBe(patched(BASE2, 'get_canvas', EDITS.get_canvas!.edits));
  });

  it('a dropped cancelled-event predicate is caught', () => {
    const mutated = raw.replace("AND e.status IS DISTINCT FROM 'cancelled'", '');
    expect(fnBody(mutated, '_canvas_event_admits')).not.toBe(patched(BASE1, '_canvas_event_admits', EDITS._canvas_event_admits!.edits));
  });

  it('an anon grant on a second function is caught', () => {
    const mutated = raw.replace('TO authenticated;\n\nCOMMIT;', 'TO authenticated;\nGRANT EXECUTE ON FUNCTION public.get_canvas_audience(text) TO anon;\n\nCOMMIT;');
    const anon = [...stripComments(mutated).matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+)\([^)]*\) TO ([^;]*);/g)].filter(m => /\banon\b/.test(m[2]!));
    expect(anon.map(m => m[1])).toContain('public.get_canvas_audience');
  });

  it('a person check that drops the relationship rule is caught', () => {
    const mutated = raw.replace('OR EXISTS (SELECT 1 FROM public.p878_relationship_scope(p_owner) s WHERE s = p_person)', 'OR true');
    expect(fnBody(mutated, '_canvas_person_eligible')).not.toContain('p878_relationship_scope(p_owner)');
  });
});
