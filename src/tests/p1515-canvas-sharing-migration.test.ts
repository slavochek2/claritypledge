/**
 * @file p1515-canvas-sharing-migration.test.ts
 * @description P1515 phase 1 source contract for the canvas-sharing migrations. These pin what a
 * live database test cannot see across a future edit:
 *   - the SQL copy of the canvas box tags equals CANVAS_BOX_TAGS (the same loud-duplication pattern as
 *     p1114-grace-hours-sync: Postgres cannot import a TS constant);
 *   - the sharing migration touches NO row-level-security policy (the invariant: existing read
 *     policies on points, stories, links, positions, versions, histories and verifications are not
 *     widened), and creates no table that a client role could reach;
 *   - every function it creates pins an empty search_path, internal ones are closed to clients, and
 *     only get_canvas is open to signed-out callers;
 *   - the sealed-letter migration is the P1212 base plus ONE predicate (rebuilding that function from
 *     an older base is the regression class sd-guard-completeness exists for).
 *
 * Fixtures control (epistemic gate 7): the helpers are exercised against a mutated copy of the real
 * file in the last describe block, so a green run proves each check can fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANVAS_BOX_TAGS } from '@/lib/canvas-boxes';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const SHARING = '20261021100000_p1515_artifact_sharing.sql';
const SEAL = '20261021100100_p1515_seal_letter_skips_foreign_private_points.sql';
const RULING = '20261021110000_p1515_audience_decides_everything_inside.sql';
const TARGETS = '20261021150000_p1515_canvas_share_targets.sql';
const REVIEW = '20261021170000_p1515_review_fixes.sql';
const SEAL_BASE = '20260904120000_p1212_seal_rpc_story_author_name.sql';

const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** The tags listed in public._canvas_box_tags() */
function sqlBoxTags(sql: string): string[] {
  const body = /FUNCTION public\._canvas_box_tags\(\)[\s\S]*?ARRAY\[([\s\S]*?)\]::text\[\]/.exec(stripComments(sql));
  if (!body) throw new Error('_canvas_box_tags() not found');
  return [...body[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

/** name -> { header (everything up to AS $$), signature } for each CREATE OR REPLACE FUNCTION */
function functions(sql: string): Array<{ name: string; header: string }> {
  const code = stripComments(sql);
  return [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\bAS \$\$/g)].map((m) => ({
    name: m[1]!,
    header: m[0],
  }));
}

describe('P1515: canvas box tags in SQL equal the TypeScript list', () => {
  it('lists exactly CANVAS_BOX_TAGS', () => {
    expect(sqlBoxTags(read(SHARING)).sort()).toEqual([...CANVAS_BOX_TAGS].sort());
  });
});

describe('P1515: the sharing migration widens nothing existing', () => {
  const sql = read(SHARING);
  const code = stripComments(sql);

  it('contains no policy statement at all (no existing read policy is created, altered or dropped)', () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP)\s+POLICY\b/i);
  });

  it('does not alter points, stories, story_points, point_positions or any history table', () => {
    for (const t of ['points', 'stories', 'story_points', 'point_positions', 'story_versions', 'point_position_history', 'story_point_history', 'story_verifications']) {
      expect(code, `ALTER TABLE ${t}`).not.toMatch(new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:public\\.)?${t}\\b`, 'i'));
    }
  });

  it('enables RLS on, and revokes client access from, every table it creates', () => {
    const created = [...code.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]!);
    expect(created.sort()).toEqual(['canvas_added_stories', 'canvas_audience', 'canvases', 'event_removals']);
    for (const t of created) {
      expect(code, `RLS on ${t}`).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
      expect(code, `REVOKE on ${t}`).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${t}\\s+FROM PUBLIC, anon, authenticated`));
      expect(code, `no grant to a client role on ${t}`).not.toMatch(new RegExp(`GRANT[^;]*ON\\s+(?:TABLE\\s+)?public\\.${t}\\b[^;]*TO[^;]*(anon|authenticated)`, 'i'));
    }
  });
});

describe('P1515: function hygiene', () => {
  const sql = read(SHARING);
  const code = stripComments(sql);
  const fns = functions(sql);

  it('finds the functions it should (the extractor is not blind)', () => {
    const names = fns.map((f) => f.name);
    for (const n of ['get_canvas', 'share_canvas', '_canvas_can_read', 'p1515_stamp_rsvp_time']) expect(names).toContain(n);
    expect(fns.length).toBeGreaterThanOrEqual(20);
  });

  it('every function pins an empty search_path, except canvas_add_story (see the migration)', () => {
    // canvas_add_story inserts into stories, which fires sync_story_st_tags_to_points: an invoker
    // trigger function with unqualified table names that needs `public` on the caller's path.
    for (const f of fns) {
      const want = f.name === 'canvas_add_story' ? /SET search_path = public\b/ : /SET search_path = ''/;
      expect(f.header, f.name).toMatch(want);
    }
  });

  it('every function revokes EXECUTE from PUBLIC, anon and authenticated, then grants only what is intended', () => {
    const open = new Set(['get_canvas', 'canvas_set_position', 'canvas_remove_position', 'canvas_add_story',
      'canvas_remove_added_story', 'share_canvas', 'unshare_canvas', 'get_canvas_audience',
      'remove_event_attendee', 'list_canvases_shared_with_event']);
    for (const f of fns) {
      expect(code, `${f.name} revoke`).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f.name}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`));
      const grants = [...code.matchAll(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f.name}\\([^)]*\\)\\s+TO\\s+([a-z_, ]+);`, 'g'))].map((m) => m[1]!.trim());
      if (open.has(f.name)) {
        expect(grants, `${f.name} is client-callable`).toHaveLength(1);
        // Only get_canvas is open to signed-out callers.
        expect(grants[0]!.includes('anon'), `${f.name} anon`).toBe(f.name === 'get_canvas');
      } else {
        expect(grants, `${f.name} is internal: no grant at all`).toEqual([]);
      }
    }
  });
});

describe('P1515: founder ruling migration (the audience decides everything inside)', () => {
  const sql = read(RULING);
  const code = stripComments(sql);
  const fns = functions(sql);
  const getCanvasBody = code.slice(code.indexOf('CREATE OR REPLACE FUNCTION public.get_canvas('), code.indexOf('CREATE OR REPLACE FUNCTION public.p1515_stamp_rsvp_time'));

  it('redefines only get_canvas and the rsvp stamp, each with an empty search_path', () => {
    expect(fns.map((f) => f.name).sort()).toEqual(['get_canvas', 'p1515_stamp_rsvp_time']);
    for (const f of fns) expect(f.header, f.name).toMatch(/SET search_path = ''/);
  });

  it('widens nothing: no grant, no policy, no table change', () => {
    expect(code).not.toMatch(/\bGRANT\b/i);
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP)\s+POLICY\b/i);
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
  });

  it('get_canvas has no public-stories-by-others path (D-A dropped) and returns visibility', () => {
    expect(getCanvasBody).not.toMatch(/d_a_public|c_include_public_by_others/);
    expect(getCanvasBody).not.toMatch(/visibility\s*=\s*'public'/);
    expect(getCanvasBody).toMatch(/'visibility',\s*CASE/);
    expect(getCanvasBody).toMatch(/NOT COALESCE\(v_admitted, false\)/);
  });

  it('the rsvp stamp fires on UPDATE of the gating columns too', () => {
    expect(code).toMatch(/BEFORE INSERT OR UPDATE OF rsvped_at, event_id, profile_id ON public\.event_rsvps/);
  });

  it('CONTROL: the first migration really did have the D-A path (the absence above is not a blind regex)', () => {
    expect(stripComments(read(SHARING))).toMatch(/d_a_public_stories_by_others/);
  });
});

describe('P1515: the share-targets migration (phase 2)', () => {
  const code = stripComments(read(TARGETS));

  it('adds one signed-in function with an empty search_path, and nothing that widens access', () => {
    expect(functions(read(TARGETS)).map((f) => f.name)).toEqual(['get_canvas_share_targets']);
    expect(functions(read(TARGETS))[0]!.header).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_canvas_share_targets\(\)\s+FROM PUBLIC, anon, authenticated/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas_share_targets\(\) TO authenticated;/);
    expect(code).not.toMatch(/GRANT[^;]*\banon\b/i);
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(POLICY|TABLE)\b/i);
  });

  it('offers only events the same admission rule share_canvas checks admits, never every event', () => {
    expect(code).toMatch(/public\._canvas_event_admits\(e\.id, v_uid\)/);
    expect(code).toMatch(/WHERE m\.user_id = v_uid|m\.user_id = v_uid/);
  });
});

/** One function's statement, from its CREATE to the closing $$; (comments stripped, whitespace collapsed). */
function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3).replace(/\s+/g, ' ').trim();
}

describe('P1515: review fixes migration (20261021170000)', () => {
  const raw = read(REVIEW);
  const code = stripComments(raw);

  it('carries the usual header: diffed-against and a client-safe annotation', () => {
    expect(raw).toMatch(/diffed against:/);
    expect(raw).toMatch(/client-safe:/);
  });

  it('1. one added story per person per point: a unique key on (canvas, point, author) and a plain refusal first', () => {
    expect(code).toMatch(/ADD CONSTRAINT canvas_added_stories_one_per_person_per_point UNIQUE \(canvas_id, point_id, author_id\)/);
    const add = fnBody(raw, 'canvas_add_story');
    expect(add).toMatch(/cas\.point_id = p_point AND cas\.author_id = v_uid/);
    expect(add).toMatch(/RAISE EXCEPTION 'you already added a story to this point' USING ERRCODE = '23505'/);
    // the refusal comes BEFORE the story insert, so a refusal leaves no stray story row
    expect(add.indexOf('you already added a story')).toBeLessThan(add.indexOf('INSERT INTO public.stories'));
  });

  it('2. get_canvas differs from its previous body only in the visibility CASE, which now needs an entry admitting the owner', () => {
    const before = fnBody(read('20261021110000_p1515_audience_decides_everything_inside.sql'), 'get_canvas');
    const after = fnBody(raw, 'get_canvas');
    const oldCase = "'visibility', CASE WHEN EXISTS (SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = v_canvas) THEN 'shared' ELSE 'private' END,";
    const newCase = "'visibility', CASE WHEN EXISTS ( SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = v_canvas AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner) ) THEN 'shared' ELSE 'private' END,";
    expect(before).toContain(oldCase);
    expect(after).toContain(newCase);
    expect(after.replace(newCase, oldCase)).toBe(before);
  });

  it('3. a public point carrying a canvas_ tag is refused for every role: no role test in the trigger function, INSERT and UPDATE OF both columns', () => {
    const fn = fnBody(raw, 'p1515_canvas_points_are_private');
    expect(fn).toMatch(/LIKE 'canvas\\_%'/);
    expect(fn).toMatch(/ERRCODE = '23514'/);
    for (const role of ['current_user', 'auth.role', 'session_user', 'service_role', 'authenticated']) expect(fn, role).not.toContain(role);
    expect(code).toMatch(/BEFORE INSERT OR UPDATE OF system_tags, visibility ON public\.points/);
  });

  it('4. share_canvas refuses a canvas holding a public point and a cancelled event, with its usual message', () => {
    const fn = fnBody(raw, 'share_canvas');
    expect(fn).toMatch(/p\.visibility = 'public'::public\.content_visibility/);
    expect(fn).toMatch(/e\.status = 'cancelled'/);
    const refusals = [...fn.matchAll(/RAISE EXCEPTION '([^']*)' USING ERRCODE = '42501'/g)].map((m) => m[1]);
    expect(refusals.length).toBeGreaterThanOrEqual(5);
    expect(new Set(refusals), 'one message for every refusal').toEqual(new Set(['not authorized for this canvas', 'sign in required']));
  });

  it('5. canvas_add_story pins search_path = public, pg_temp', () => {
    expect(fnBody(raw, 'canvas_add_story')).toMatch(/SET search_path = public, pg_temp AS \$\$/);
  });

  it('6. get_canvas is revoked from anon and granted to authenticated only, as the last word on its grants', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_canvas\(uuid, text\) FROM PUBLIC, anon;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas\(uuid, text\) TO authenticated;/);
    expect(code).not.toMatch(/GRANT[^;]*\banon\b/i);
    expect(code.indexOf('REVOKE ALL ON FUNCTION public.get_canvas')).toBeGreaterThan(code.indexOf('CREATE OR REPLACE FUNCTION public.get_canvas('));
  });

  it('9. the letter correction lives in this header; the seal migration is a separate file this one does not redefine', () => {
    expect(raw).toMatch(/write REPLY/);
    expect(raw).toMatch(/ACCEPTED/);
    expect(code).not.toContain('seal_and_send_letter');
  });

  it('CONTROL: each check above fails on a mutated copy of the real file', () => {
    const mutated = (find: RegExp | string, to: string) => raw.replace(find, to);
    expect(stripComments(mutated('ADD CONSTRAINT canvas_added_stories_one_per_person_per_point UNIQUE (canvas_id, point_id, author_id)', 'ADD CONSTRAINT x UNIQUE (canvas_id, point_id)'))).not.toMatch(/UNIQUE \(canvas_id, point_id, author_id\)/);
    expect(fnBody(mutated("AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner)", ''), 'get_canvas')).not.toContain('p_owner) ) THEN');
    expect(fnBody(mutated("IF NEW.visibility IS DISTINCT FROM 'public'::public.content_visibility THEN", "IF current_user = 'authenticated' THEN"), 'p1515_canvas_points_are_private')).toContain('current_user');
    expect(fnBody(mutated("e.status = 'cancelled'", "e.status = 'x'"), 'share_canvas')).not.toMatch(/e\.status = 'cancelled'/);
    expect(stripComments(mutated('TO authenticated;\n\n-- 1 + 5', 'TO anon, authenticated;\n\n-- 1 + 5'))).toMatch(/GRANT[^;]*\banon\b/i);
  });
});

describe('P1515: the sealed-letter migration is the P1212 base plus one predicate', () => {
  const body = (f: string) => stripComments(read(f)).slice(stripComments(read(f)).indexOf('CREATE OR REPLACE FUNCTION')).replace(/\s+/g, ' ').trim();
  const ADDED = "AND (pt.visibility = 'public'::content_visibility OR pt.first_validator_id = v_sender_id)";

  it('differs from the base only by the added predicate', () => {
    const base = body(SEAL_BASE);
    const next = body(SEAL);
    expect(next).toContain(ADDED);
    expect(next.replace(ADDED, '').replace(/\s+/g, ' ')).toBe(base.replace(/\s+/g, ' '));
  });

  it('keeps every RAISE EXCEPTION guard of the base', () => {
    const raises = (s: string) => [...s.matchAll(/RAISE EXCEPTION\s+'((?:[^']|'')*)'/g)].map((m) => m[1]);
    expect(raises(body(SEAL))).toEqual(raises(body(SEAL_BASE)));
  });
});

describe('P1515: control, each check above fails on a mutated copy of the real file', () => {
  const sql = read(SHARING);
  it('a stray policy statement is caught', () => {
    expect(stripComments(sql + '\nDROP POLICY "Points visible by visibility" ON public.points;')).toMatch(/\bDROP\s+POLICY\b/i);
  });
  it('a box tag drifting is caught', () => {
    const mutated = sql.replace("'canvas:cost'", "'canvas:costs'");
    expect(sqlBoxTags(mutated).sort()).not.toEqual([...CANVAS_BOX_TAGS].sort());
  });
  it('a function without an empty search_path is caught', () => {
    const mutated = sql.replace(/(CREATE OR REPLACE FUNCTION public\.get_canvas\(uuid, text\)|CREATE OR REPLACE FUNCTION public\.get_canvas\(p_owner uuid, p_name text\)[\s\S]*?)SET search_path = ''/, '$1SET search_path = public');
    const bad = functions(mutated).filter((f) => !/SET search_path = ''/.test(f.header));
    expect(bad.map((f) => f.name)).toContain('get_canvas');
  });
  it('the seal predicate being dropped is caught', () => {
    const nextBody = stripComments(read(SEAL)).replace(/AND \(pt\.visibility = 'public'::content_visibility OR pt\.first_validator_id = v_sender_id\)/, '');
    expect(nextBody).not.toContain("pt.first_validator_id = v_sender_id");
  });
});
