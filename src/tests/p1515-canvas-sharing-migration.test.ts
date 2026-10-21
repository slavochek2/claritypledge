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
