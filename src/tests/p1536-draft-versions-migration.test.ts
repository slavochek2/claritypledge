/**
 * @file p1536-draft-versions-migration.test.ts
 * @description P1536 WP1 source contract for migrations 20261029100000 (draft versions) and 20261029100100 (the
 *   draft engine's database side):
 *   - every body it replaces is its LATEST previous body plus only the edits listed here;
 *   - the draft tables are closed to clients except an owner SELECT through a column grant;
 *   - every _canvas_draft_* function is service-role only, and the only anon grant is get_canvas;
 *   - a version has a published state, readers see published versions only, a version shows its own points;
 *   - spend: the canvas bucket and its caps, and the global total at the founder's $50/day;
 *   - P1545 (shipped between P1536's first diff and this one) is kept: the bodies both features replace start from
 *     P1545's, so its 'canvas' and 'letter' kinds, the 4-argument _chat_can_attach and the share message survive;
 *   - P1576 (on prod before these files, which were renamed from 20261027100000/100100 and 20261028110000 to run
 *     after it) is kept: mirror_request_reply keeps its transcript wait, and its server-side voice path
 *     (_mirror_voice_start_reply) is quiet in canvas threads too.
 * Epistemic gate 7: the last block runs each fact against a mutated copy of the real file and shows it fail.
 * The behaviour itself is proved on the test database by src/tests/integration/p1536-canvas-draft-write.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const A = '20261029100000_p1536_canvas_draft_versions.sql';
const B = '20261029100100_p1536_canvas_draft_runs.sql';
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
    const f = norm(from);
    const occurrences = body.split(f).length - 1;
    if (occurrences !== 1) throw new Error(`${name}: edit source found ${occurrences} times: ${f.slice(0, 70)}`);
    body = norm(body.replace(f, norm(to)));
  }
  return body;
}
/** The newest migration before the two under test that defines `name`: the body a replacement must start from. */
function latestSource(name: string): string {
  const re = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`);
  const files = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < A).sort();
  const defs = files.filter((f) => re.test(stripComments(read(f))));
  if (defs.length === 0) throw new Error(`${name} has no earlier definition`);
  return defs[defs.length - 1]!;
}

type Replaced = { migration: string; source: string; edits: Array<[string, string]> };
const REPLACED: Record<string, Replaced> = {
  _canvas_version_immutable: {
    migration: A, source: '20261022190000_p1515_canvas_versions_race.sql',
    edits: [[
      `END IF; RETURN NEW;`,
      `END IF;
       IF OLD.published_at IS NOT NULL
          AND (NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_seq IS DISTINCT FROM OLD.published_seq) THEN
         RAISE EXCEPTION 'a published canvas version cannot change' USING ERRCODE = '23514';
       END IF;
       RETURN NEW;`,
    ]],
  },
  _canvas_first_version: {
    migration: A, source: '20261022170000_p1515_canvas_versions.sql',
    edits: [[
      `BEGIN INSERT INTO public.canvas_versions`,
      `BEGIN
       IF current_setting('p1536.first_version_draft', true) = 'on' THEN
         RETURN NEW;
       END IF;
       INSERT INTO public.canvas_versions`,
    ]],
  },
  _canvas_resolve: {
    migration: A, source: '20261022170000_p1515_canvas_versions.sql',
    edits: [[
      `SELECT v.canvas_id FROM public.canvas_versions v WHERE v.owner_id = p_owner AND v.name = lower(COALESCE(p_name, ''))`,
      `SELECT COALESCE(
         (SELECT v.canvas_id FROM public.canvas_versions v WHERE v.owner_id = p_owner AND v.name = lower(COALESCE(p_name, ''))),
         (SELECT c.id FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = lower(COALESCE(p_name, ''))))`,
    ]],
  },
  _canvas_point_in: {
    migration: A, source: '20261021100000_p1515_artifact_sharing.sql',
    edits: [[`AND p.superseded_by IS NULL`, ``]],
  },
  _canvas_point_in_canvas: {
    migration: A, source: '20261022170000_p1515_canvas_versions.sql',
    edits: [[
      `FROM public.canvas_versions v WHERE v.canvas_id = p_canvas), false)`,
      `FROM public.canvas_versions v
         WHERE v.canvas_id = p_canvas AND (v.published_at IS NOT NULL OR auth.uid() = p_owner)), false)`,
    ]],
  },
  get_canvas: {
    migration: A, source: '20261022170000_p1515_canvas_versions.sql',
    edits: [
      [`v_result jsonb; BEGIN`, `v_result jsonb; v_pub_none boolean := false; BEGIN`],
      [`SELECT v.name INTO v_ver
          FROM public.canvas_versions v
         WHERE v.canvas_id = v_canvas AND (p_version IS NULL OR v.name = lower(p_version))
         ORDER BY v.created_at DESC, v.name DESC
         LIMIT 1;
      END IF;
      IF v_ver IS NULL THEN v_admitted := false; END IF;`,
       `SELECT v.name INTO v_ver
          FROM public.canvas_versions v
         WHERE v.canvas_id = v_canvas AND (p_version IS NULL OR v.name = lower(p_version))
           AND (v.published_at IS NOT NULL
                OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))
         ORDER BY (v.published_at IS NULL), v.published_seq DESC NULLS LAST, v.created_at DESC, v.name DESC
         LIMIT 1;
        v_pub_none := NOT EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL);
      END IF;
      IF v_ver IS NULL AND NOT (v_canvas IS NOT NULL AND p_version IS NULL) THEN v_admitted := false; END IF;`],
      [`AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY[v_tag]::text[]`,
       `AND v_ver IS NOT NULL
       AND p.system_tags @> ARRAY[v_tag]::text[]`],
      [`'versions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', v.name, 'created_at', v.created_at) ORDER BY v.created_at DESC, v.name DESC)
          FROM public.canvas_versions v WHERE v.canvas_id = v_canvas
      ), jsonb_build_array(jsonb_build_object('name', v_name, 'created_at', NULL))),`,
       `'versions', CASE
        WHEN v_canvas IS NULL THEN jsonb_build_array(jsonb_build_object('name', v_name, 'seq', 1, 'published_at', NULL, 'created_at', NULL))
        ELSE COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object('name', v.name, 'seq', v.published_seq, 'published_at', v.published_at, 'created_at', v.created_at)
                   || CASE WHEN v.published_at IS NULL THEN jsonb_build_object('draft', true) ELSE '{}'::jsonb END
                   ORDER BY (v.published_at IS NULL) DESC, v.published_seq DESC NULLS LAST, v.created_at DESC, v.name DESC)
            FROM public.canvas_versions v
           WHERE v.canvas_id = v_canvas
             AND (v.published_at IS NOT NULL
                  OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))
        ), '[]'::jsonb) END,
      'published_none', v_pub_none,`],
      [`to_jsonb(cp) || jsonb_build_object('creator', (`,
       `to_jsonb(cp)
       || CASE WHEN v_is_owner THEN '{}'::jsonb ELSE jsonb_build_object('system_tags', (
            SELECT COALESCE(jsonb_agg(t.tag ORDER BY t.n), '[]'::jsonb)
              FROM unnest(cp.system_tags) WITH ORDINALITY AS t(tag, n)
             WHERE t.tag NOT LIKE 'canvas\\_%'
                OR EXISTS (SELECT 1 FROM public.canvas_versions pv
                            WHERE pv.canvas_id = v_canvas AND pv.published_at IS NOT NULL
                              AND 'canvas_' || pv.name = t.tag))) END
       || jsonb_build_object('creator', (`],
      [`WHERE a.id = v_via
      )
    )
  ) INTO v_result;`,
       `WHERE a.id = v_via
      )
    ) || CASE WHEN v_is_owner THEN jsonb_build_object('draft', (
        SELECT jsonb_build_object(
                 'id', d.id, 'version', dv.name, 'questions', d.questions, 'thread_root_id', d.thread_root_id,
                 'conversation_id', d.conversation_id, 'base_seq', bv.published_seq,
                 'run_count', d.run_count, 'tension_count', d.tension_count)
          FROM public.canvas_drafts d
          JOIN public.canvas_versions dv ON dv.id = d.version_id
          LEFT JOIN public.canvas_versions bv ON bv.id = d.base_version_id
         WHERE d.canvas_id = v_canvas AND d.state = 'open'))
      ELSE '{}'::jsonb END
  ) INTO v_result;`],
    ],
  },
  share_canvas: {
    migration: A, source: '20261023100000_p1545_artifacts_data.sql',
    edits: [
      [`IF NOT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ) THEN`, `IF NOT public._canvas_owner_has_points(v_uid, v_name) THEN`],
      [`IF EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
  ) THEN`, `IF public._canvas_has_public_point(v_uid, v_name) THEN`],
    ],
  },
  set_canvas_general_access: {
    migration: A, source: '20261021230000_p1515_link_write_snapshot.sql',
    edits: [
      [`IF NOT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ) THEN`, `IF NOT public._canvas_owner_has_points(v_uid, v_name) THEN`],
      [`IF EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
  ) THEN`, `IF public._canvas_has_public_point(v_uid, v_name) THEN`],
    ],
  },
  _chat_can_attach: {
    migration: A, source: '20261023100000_p1545_artifacts_data.sql',
    edits: [
      [`ELSIF p_kind NOT IN ('canvas', 'letter') THEN`, `ELSIF p_kind NOT IN ('canvas', 'letter', 'canvas_version') THEN`],
      [`IF NOT FOUND THEN RETURN false; END IF; IF p_kind = 'canvas' THEN`,
       `IF NOT FOUND THEN RETURN false; END IF;
        IF p_kind = 'canvas_version' THEN
          RETURN v_conv.kind = 'mirror' AND v_conv.owner_id = p_uid
             AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.id = p_id AND x.owner_id = p_uid);
        END IF;
        IF p_kind = 'canvas' THEN`],
    ],
  },
  send_chat_message: {
    migration: A, source: '20261023100000_p1545_artifacts_data.sql',
    edits: [
      [`NOT IN ('point', 'story', 'canvas', 'letter') THEN`, `NOT IN ('point', 'story', 'canvas', 'letter', 'canvas_version') THEN`],
    ],
  },
  mirror_request_reply: {
    // P1576's body (its transcript wait kept), the canvas quiet rule placed BEFORE that wait: a voice note in a canvas
    // thread is quiet at once instead of answering 'transcribing' for a reply that will never come.
    migration: A, source: '20261027120600_p1576_mirror_voice_and_waveform.sql',
    edits: [[
      `USING ERRCODE = '42501'; END IF; IF v_msg.audio_duration_ms IS NOT NULL`,
      `USING ERRCODE = '42501'; END IF;
       IF EXISTS (SELECT 1 FROM public.canvas_drafts d
                   WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
          AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
         RETURN;
       END IF;
       IF v_msg.audio_duration_ms IS NOT NULL`,
    ]],
  },
  _mirror_voice_start_reply: {
    // P1576's server path inserts the Mirror's job for a voice note itself; the same quiet rule, after its owner check
    migration: A, source: '20261027120700_p1576_mirror_voice_server_trigger.sql',
    edits: [[
      `RETURN NEW; END IF; BEGIN INSERT INTO public.mirror_jobs`,
      `RETURN NEW; END IF;
       IF EXISTS (SELECT 1 FROM public.canvas_drafts d
                   WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN
         RETURN NEW;
       END IF;
       BEGIN INSERT INTO public.mirror_jobs`,
    ]],
  },
  forward_chat_message: {
    migration: A, source: '20261019203000_p1512_clarity_chat.sql',
    edits: [[
      `v_note := NULLIF(btrim(COALESCE(p_note, '')), '');`,
      `IF v_src.attachment_kind = 'canvas_version' THEN
         RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
       END IF;
       v_note := NULLIF(btrim(COALESCE(p_note, '')), '');`,
    ]],
  },
  list_my_artifacts_canvases: {
    migration: A, source: '20261023100000_p1545_artifacts_data.sql',
    edits: [
      [`SELECT substr(t.tag, 8) AS cname, max(p.updated_at) AS edited
      FROM public.points p
     CROSS JOIN LATERAL unnest(p.system_tags) AS t(tag)`,
       `SELECT COALESCE(vc.name, substr(t.tag, 8)) AS cname, max(p.updated_at) AS edited
      FROM public.points p
     CROSS JOIN LATERAL unnest(p.system_tags) AS t(tag)
      LEFT JOIN public.canvas_versions v ON v.owner_id = v_uid AND v.name = substr(t.tag, 8)
      LEFT JOIN public.canvases vc ON vc.id = v.canvas_id`],
      // (the anchor is after the regex: a \$' inside a String.replace replacement would expand)
      [`GROUP BY 1 ) SELECT c.id,`,
       `AND (v.id IS NULL OR v.published_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open'))
     GROUP BY 1 ) SELECT c.id,`],
      [`ON c.name = tg.cname ORDER BY`,
       `ON c.name = tg.cname
   WHERE tg.cname IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.canvas_versions x
                  WHERE x.canvas_id = c.id
                    AND (x.published_at IS NOT NULL
                         OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = x.id AND d.state = 'open')))
   ORDER BY`],
    ],
  },
  list_canvases_shared_with_me: {
    migration: A, source: '20261023100000_p1545_artifacts_data.sql',
    edits: [[
      `AND v.aid IS NOT NULL ORDER BY`,
      `AND v.aid IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)
       ORDER BY`,
    ]],
  },
  list_canvases_shared_with_event: {
    migration: A, source: '20261021100000_p1515_artifact_sharing.sql',
    edits: [[
      `AND (c.owner_id = v_uid OR public._canvas_entry_admits(a.id, v_uid))`,
      `AND (c.owner_id = v_uid
            OR (public._canvas_entry_admits(a.id, v_uid)
                AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)))`,
    ]],
  },
  get_chat_artifact_attachment: {
    migration: A, source: '20261023110000_p1545_chat_letter_delivery_id.sql',
    edits: [[
      `IF FOUND AND (v_canvas.owner_id = v_uid OR public._canvas_admitted_via(v_canvas.id, v_uid) IS NOT NULL) THEN`,
      `IF FOUND AND (v_canvas.owner_id = v_uid
                  OR (public._canvas_admitted_via(v_canvas.id, v_uid) IS NOT NULL
                      AND EXISTS (SELECT 1 FROM public.canvas_versions x
                                   WHERE x.canvas_id = v_canvas.id AND x.published_at IS NOT NULL))) THEN`,
    ]],
  },
  erase_chat_data_for: {
    migration: B, source: '20261020213000_p1520_mirror_v2.sql',
    edits: [[
      `RETURN v_out;`,
      `UPDATE public.canvas_draft_runs r
          SET state = 'cancelled', error_code = 'erased', finished_at = now()
        WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];
       GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_runs_cancelled', n);
       UPDATE public.canvas_drafts d
          SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}'
        WHERE d.tension_refs @> ARRAY[v_ref]
           OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id AND r.derived_refs @> ARRAY[v_ref]);
       GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_drafts_scrubbed', n);
       RETURN v_out;`,
    ]],
  },
  _mirror_limits: {
    migration: B, source: '20261023120000_p1547_mirror_token_budget.sql',
    edits: [[
      `'global_total_daily_usd', 10.00`,
      `'canvas_max_usd', 0.27,
       'extract_max_usd', 0.35,
       'person_canvas_daily_usd', 3.00,
       'person_canvas_daily_count', 20,
       'global_canvas_daily_usd', 15.00,
       'global_total_daily_usd', 50.00`,
    ]],
  },
  _mirror_reserve: {
    migration: B, source: '20261020213000_p1520_mirror_v2.sql',
    edits: [[`p_bucket NOT IN ('reply', 'portrait') OR`, `p_bucket NOT IN ('reply', 'portrait', 'canvas') OR`]],
  },
};

const rawA = read(A);
const rawB = read(B);
const codeA = stripComments(rawA);
const codeB = stripComments(rawB);
const RAW: Record<string, string> = { [A]: rawA, [B]: rawB };

describe('P1536 migrations: headers', () => {
  it.each([A, B])('%s carries client-safe, diffed-against and new-function annotations', (f) => {
    expect(RAW[f]).toMatch(/^-- client-safe:/m);
    expect(RAW[f]).toMatch(/diffed against/);
    expect(RAW[f]).toMatch(/new function/);
  });
  it('every replaced function is named in its migration header next to the source it is diffed against', () => {
    for (const [name, r] of Object.entries(REPLACED)) {
      const header = RAW[r.migration]!.slice(0, RAW[r.migration]!.indexOf('BEGIN;'));
      expect(header, `${name}: source named`).toContain(r.source);
      expect(header, `${name}: function named`).toContain(name);
    }
  });
  it('the superseded filter is gone from every live body that had one, and each site is named', () => {
    for (const name of ['get_canvas', '_canvas_point_in', 'share_canvas', 'set_canvas_general_access']) {
      expect(fnBody(RAW[A]!, name), name).not.toContain('superseded_by IS NULL');
    }
    expect(rawA).toMatch(/:165 of 20261022170000/);
    expect(rawA).toMatch(/:266 of\s*(--)?\s*20261021100000/);
  });
});

describe('P1536 migrations: replaced bodies', () => {
  it.each(Object.keys(REPLACED))('%s is its LATEST previous body plus only the edits listed in this test', (name) => {
    const r = REPLACED[name]!;
    expect(fnBody(RAW[r.migration]!, name)).toBe(patched(r.source, name, r.edits));
  });
  it.each(Object.keys(REPLACED))('%s: the source named is the latest migration that defines it', (name) => {
    expect(latestSource(name)).toBe(REPLACED[name]!.source);
  });
  // A LATER migration that rebuilds one of these functions from an older body would silently drop P1536's change
  // (the bug the P1576 rebase hit). So the newest definition anywhere must still carry every P1536 edit.
  it.each(Object.keys(REPLACED))('%s: the newest definition across all migrations still carries the P1536 edits', (name) => {
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
    const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && re.test(stripComments(read(f)))).sort();
    const newest = fnBody(read(defs[defs.length - 1]!), name);
    for (const [, to] of REPLACED[name]!.edits) expect(newest, `${name} in ${defs[defs.length - 1]}`).toContain(norm(to));
  });
  it('the grants of the replaced client functions are restated exactly as before', () => {
    expect(codeA).toMatch(/REVOKE ALL ON FUNCTION public\.get_canvas\(uuid, text, text, text\) FROM PUBLIC, anon, authenticated;/);
    expect(codeA).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas\(uuid, text, text, text\) TO anon, authenticated;/);
    expect(codeA).toMatch(/GRANT EXECUTE ON FUNCTION public\.share_canvas\(text, text, uuid\) TO authenticated;/);
    expect(codeA).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_canvas_general_access\(text, text\) TO authenticated;/);
    expect(codeA).toMatch(/GRANT EXECUTE ON FUNCTION public\.send_chat_message\(uuid, text, uuid, uuid, text, uuid, uuid\) TO authenticated;/);
    expect(codeA).toMatch(/GRANT EXECUTE ON FUNCTION public\.mirror_request_reply\(uuid\) TO authenticated;/);
    expect(codeA).toMatch(/REVOKE ALL ON FUNCTION public\._mirror_voice_start_reply\(\) FROM PUBLIC, anon, authenticated;/);
    expect(codeA).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._mirror_voice_start_reply/);
    expect(codeA).toMatch(/REVOKE ALL ON FUNCTION public\.forward_chat_message\(uuid, uuid, text, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(codeA).toMatch(/GRANT EXECUTE ON FUNCTION public\.forward_chat_message\(uuid, uuid, text, uuid\) TO authenticated;/);
    for (const sig of ['list_my_artifacts_canvases\\(\\)', 'list_canvases_shared_with_me\\(\\)', 'get_chat_artifact_attachment\\(text, uuid\\)', 'list_canvases_shared_with_event\\(uuid\\)']) {
      expect(codeA, sig).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig} FROM PUBLIC, anon, authenticated;`));
      expect(codeA, sig).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO authenticated;`));
    }
  });
});

describe('P1536 migration A: versions, tables, client functions', () => {
  it('canvas_versions gains the published pair, backfilled once, checked and unique per canvas', () => {
    expect(norm(codeA)).toContain('ADD COLUMN published_at timestamptz, ADD COLUMN published_seq integer');
    expect(norm(codeA)).toContain("row_number() OVER (PARTITION BY x.canvas_id ORDER BY x.created_at, x.name)");
    expect(norm(codeA)).toContain('IF NOT EXISTS (SELECT 1 FROM information_schema.columns');
    expect(norm(codeA)).toContain('CHECK ((published_at IS NULL) = (published_seq IS NULL)');
    expect(norm(codeA)).toContain('UNIQUE (canvas_id, published_seq)');
  });
  it('a version inserted without the pair is published at once unless the transaction opts out', () => {
    const b = fnBody(rawA, '_canvas_version_default_publish');
    expect(b).toContain("current_setting('p1536.first_version_draft', true), '') <> 'on'");
    expect(b).toContain('NEW.published_seq := public._canvas_next_version_seq(NEW.canvas_id)');
    expect(codeA).toMatch(/CREATE TRIGGER trg_p1536_version_default_publish\s+BEFORE INSERT ON public\.canvas_versions/);
    expect(fnBody(rawA, '_canvas_next_version_seq')).toContain("pg_advisory_xact_lock(hashtextextended('p1536:canvas_seq:' || p_canvas::text, 0))");
  });
  it('reuse: the two P1515 single-version triggers and functions are dropped', () => {
    expect(codeA).toMatch(/DROP TRIGGER IF EXISTS trg_p1515_point_one_version ON public\.points;/);
    expect(codeA).toMatch(/DROP TRIGGER IF EXISTS trg_p1515_version_points_single ON public\.canvas_versions;/);
    expect(codeA).toMatch(/DROP FUNCTION IF EXISTS public\._canvas_point_one_version\(\);/);
    expect(codeA).toMatch(/DROP FUNCTION IF EXISTS public\._canvas_version_keeps_points_single\(\);/);
  });
  it('the draft tables: RLS on, every privilege revoked, only an owner SELECT by column grant, no write policy', () => {
    for (const t of ['canvas_drafts', 'canvas_draft_runs', 'canvas_draft_material']) {
      expect(codeA, t).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`));
      expect(codeA, t).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated;`));
      expect(codeA, t).toMatch(new RegExp(`CREATE POLICY ${t}_select ON public\\.${t} FOR SELECT TO authenticated\\s+USING \\(owner_id = \\(SELECT auth\\.uid\\(\\)\\)\\);`));
    }
    expect(codeA).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i);
    const grants = [...codeA.matchAll(/GRANT SELECT \(([^)]*)\)\s+ON public\.(\w+) TO authenticated;/g)];
    expect(grants.map((m) => m[2]).sort()).toEqual(['canvas_draft_material', 'canvas_draft_runs', 'canvas_drafts']);
    expect(codeA).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ON (TABLE )?public\.canvas_draft/i);
    const cols = Object.fromEntries(grants.map((m) => [m[2], m[1]!.split(',').map((c) => c.trim())]));
    expect(cols.canvas_drafts, 'the pending links are never granted').not.toContain('pending_links');
    expect(cols.canvas_draft_runs, 'neither the spend link nor the derived refs').not.toContain('spend_id');
    expect(cols.canvas_draft_runs).not.toContain('derived_refs');
    expect(cols.canvas_draft_material, 'the extracted text is never granted').not.toContain('text');
    expect(cols.canvas_draft_material).toContain('label');
  });
  it('one open draft per canvas and one active run per owner are unique partial indexes', () => {
    expect(norm(codeA)).toContain("CREATE UNIQUE INDEX IF NOT EXISTS canvas_drafts_one_open ON public.canvas_drafts (canvas_id) WHERE state = 'open'");
    expect(norm(codeA)).toContain("CREATE UNIQUE INDEX IF NOT EXISTS canvas_draft_runs_one_active ON public.canvas_draft_runs (owner_id) WHERE state IN ('queued', 'running')");
    expect(norm(codeA)).toContain('thread_root_id uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE');
    expect(norm(codeA)).toContain('version_id uuid NOT NULL UNIQUE REFERENCES public.canvas_versions(id) ON DELETE CASCADE');
  });
  it('material is capped per row, and the retention hook deletes it and carries the founder flag', () => {
    expect(norm(codeA)).toContain('CHECK (char_length(label) <= 200)');
    expect(norm(codeA)).toContain('CHECK (char_length(text) <= 200000)');
    expect(fnBody(rawA, '_canvas_draft_material_retention')).toContain('DELETE FROM public.canvas_draft_material m WHERE m.draft_id = p_draft');
    expect(rawA).toContain('-- [FOUNDER DECISION: Open Question 1 — keep extracted text after Publish? Today: delete.]');
    expect(fnBody(rawA, 'canvas_draft_publish')).toContain('PERFORM public._canvas_draft_material_retention(v_d.id)');
    expect(fnBody(rawA, 'canvas_draft_discard')).toContain('PERFORM public._canvas_draft_material_retention(v_d.id)');
  });
  it('open: a draft thread root has no text and attaches the version; a second open draft is returned, never started', () => {
    const b = fnBody(rawA, 'canvas_draft_open');
    expect(b).toContain("VALUES (v_conv, v_uid, NULL, 'message', 'canvas_version', COALESCE(p_from_version, v_ver), clock_timestamp())");
    expect(b).toContain("'status', 'open_elsewhere'");
    expect(b).toContain("v.id = p_from_version AND v.owner_id = v_uid AND v.published_at IS NOT NULL");
    expect(b).toContain("PERFORM set_config('p1536.first_version_draft', 'on', true)");
  });
  it('publish: needs a point and no active run, links only a head under the owner lock, then numbers the version', () => {
    const b = fnBody(rawA, 'canvas_draft_publish');
    expect(b).toContain("pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0))");
    expect(b).toContain("RAISE EXCEPTION 'nothing to publish'");
    expect(b).toContain("r.state IN ('queued', 'running')");
    expect(b).toContain('o.superseded_by IS NULL');
    expect(b).toContain('UPDATE public.points o SET superseded_by = v_new WHERE o.id = v_old');
    expect(b).toContain('EXCEPTION WHEN check_violation OR foreign_key_violation THEN');
    expect(b.indexOf('superseded_by = v_new')).toBeLessThan(b.indexOf('_canvas_next_version_seq'));
    expect(b).toContain("state = 'published'");
  });
  it('discard: refused while a run is active, deletes only what the draft created, keeps the version row', () => {
    const b = fnBody(rawA, 'canvas_draft_discard');
    expect(b).toContain("RAISE EXCEPTION 'a draft run is active' USING ERRCODE = '55006'");
    expect(b).toContain('PERFORM public._canvas_draft_clear_points(v_d.id)');
    expect(b).toContain("state = 'discarded'");
    expect(b).not.toContain('DELETE FROM public.canvas_versions');
    const c = fnBody(rawA, '_canvas_draft_clear_points');
    expect(c).toContain("NOT EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t LIKE 'canvas\\_%' AND t <> v_tag)");
    expect(c).toContain('SET system_tags = array_remove(p.system_tags, v_tag)');
  });
  it('a reader sees only published versions; the owner also the open draft; a stranger the empty shape', () => {
    const b = fnBody(rawA, 'get_canvas');
    expect(b).toContain("AND (v.published_at IS NOT NULL OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))");
    expect(b).toContain("'points', '[]'::jsonb, 'stories', '[]'::jsonb, 'positions', '[]'::jsonb, 'visibility', NULL, 'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)");
    expect(b).toContain("CASE WHEN v_is_owner THEN jsonb_build_object('draft'");
  });
  it('a non-owner may write only on a point of a published version', () => {
    expect(fnBody(rawA, '_canvas_point_in_canvas')).toContain('(v.published_at IS NOT NULL OR auth.uid() = p_owner)');
  });
  it('chat: the attachment kind check accepts canvas_version; attaching one needs its owner and the owner\'s own mirror', () => {
    expect(norm(codeA)).toContain("CHECK (attachment_kind IS NULL OR attachment_kind IN ('point', 'story', 'canvas', 'letter', 'canvas_version'))");
    expect(fnBody(rawA, '_chat_can_attach')).toContain("IF p_kind = 'canvas_version' THEN RETURN v_conv.kind = 'mirror' AND v_conv.owner_id = p_uid AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.id = p_id AND x.owner_id = p_uid); END IF;");
    expect(fnBody(rawA, 'send_chat_message')).toContain('public._chat_can_attach(p_attachment_kind, p_attachment_id, v_uid, p_conversation)');
  });
  it('Artifacts: the owner\'s list folds every version tag (a draft\'s <canvas>_d<hex> too) onto its canvas, by the version row', () => {
    const b = fnBody(rawA, 'list_my_artifacts_canvases');
    expect(b).toContain('SELECT COALESCE(vc.name, substr(t.tag, 8)) AS cname');
    expect(b).toContain('LEFT JOIN public.canvas_versions v ON v.owner_id = v_uid AND v.name = substr(t.tag, 8)');
    expect(b).toContain('LEFT JOIN public.canvases vc ON vc.id = v.canvas_id');
    // a discarded draft's version lends nothing; an open draft's does (a draft-only canvas is listed for its owner)
    expect(b).toContain("AND (v.id IS NULL OR v.published_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open'))");
    expect(b).toContain("WHERE tg.cname IS NOT NULL OR EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND (x.published_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = x.id AND d.state = 'open')))");
  });
  it('get_canvas: anyone but the owner gets each point\'s system_tags without the tag of any version that is not published', () => {
    const b = fnBody(rawA, 'get_canvas');
    expect(b).toContain("|| CASE WHEN v_is_owner THEN '{}'::jsonb ELSE jsonb_build_object('system_tags', (");
    expect(b).toContain("FROM unnest(cp.system_tags) WITH ORDINALITY AS t(tag, n) WHERE t.tag NOT LIKE 'canvas\\_%' OR EXISTS (SELECT 1 FROM public.canvas_versions pv WHERE pv.canvas_id = v_canvas AND pv.published_at IS NOT NULL AND 'canvas_' || pv.name = t.tag)");
    // the override comes AFTER to_jsonb(cp), so it replaces the raw column (jsonb || keeps the right-hand key)
    expect(b.indexOf("jsonb_build_object('system_tags'")).toBeGreaterThan(b.indexOf('to_jsonb(cp)'));
  });
  it('the event page\'s canvas list shows a reader only a canvas with a published version', () => {
    expect(fnBody(rawA, 'list_canvases_shared_with_event')).toContain('OR (public._canvas_entry_admits(a.id, v_uid) AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)))');
  });
  it('Artifacts: a reader\'s list and chat card never show a canvas with nothing published', () => {
    expect(fnBody(rawA, 'list_canvases_shared_with_me')).toContain('AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)');
    expect(fnBody(rawA, 'get_chat_artifact_attachment')).toContain('IF FOUND AND (v_canvas.owner_id = v_uid OR (public._canvas_admitted_via(v_canvas.id, v_uid) IS NOT NULL AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = v_canvas.id AND x.published_at IS NOT NULL))) THEN');
  });
  it('Artifacts: no other P1545 function reads a canvas_<name> tag, so none needs the fold', () => {
    // every P1545 body that matches a canvas_ tag; the shared ones are replaced above with a fold or a canvas-level read
    const tagReaders = (f: string) => [...stripComments(read(f)).matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\$\$;/g)]
      .filter((m) => /'canvas_' \|\||LIKE 'canvas\\\\?_%'/.test(m[2]!)).map((m) => m[1]).sort();
    expect(tagReaders('20261023100000_p1545_artifacts_data.sql')).toEqual(['list_my_artifacts_canvases', 'share_canvas']);
    expect(tagReaders('20261023110000_p1545_chat_letter_delivery_id.sql')).toEqual([]);
    expect(fnBody(rawA, 'share_canvas')).not.toContain("'canvas_' ||");
  });
  it('mirror: quiet in every canvas draft thread (and at its root) whatever the draft\'s state; other threads unchanged', () => {
    const b = fnBody(rawA, 'mirror_request_reply');
    expect(b).toContain('IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id)) AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN RETURN; END IF;');
    expect(b).not.toContain("d.state = 'published'");
    // the job insert is still reached by any message outside a canvas thread
    expect(b).toContain('INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)');
  });
  it('P1545 is kept: its kinds, the 4-argument _chat_can_attach and its audience rules, the share message', () => {
    // the kinds, in the CHECK and in send_chat_message's allow-list
    expect(norm(codeA)).toMatch(/attachment_kind IN \('point', 'story', 'canvas', 'letter', 'canvas_version'\)/);
    expect(fnBody(rawA, 'send_chat_message')).toContain("NOT IN ('point', 'story', 'canvas', 'letter', 'canvas_version')");
    // only the 4-argument helper: P1545 dropped the 3-argument one and nothing here re-creates or grants it
    const ca = fnBody(rawA, '_chat_can_attach');
    expect(ca).toContain('_chat_can_attach(p_kind text, p_id uuid, p_uid uuid, p_conversation uuid)');
    expect(codeA).not.toMatch(/_chat_can_attach\(p_kind text, p_id uuid, p_uid uuid\)/);
    expect(codeA).not.toMatch(/_chat_can_attach\(text, uuid, uuid\)/);
    expect(codeA).toMatch(/REVOKE ALL ON FUNCTION public\._chat_can_attach\(text, uuid, uuid, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(codeA).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._chat_can_attach/);
    // canvas: the sender reads it; the 1:1 partner / group / event holds a grant. letter: 1:1, sealed, one-to-one.
    expect(ca).toContain('public._canvas_admitted_via(v_canvas.id, p_uid) IS NOT NULL');
    expect(ca).toContain("a.kind = 'person' AND a.profile_id = v_other");
    expect(ca).toContain("a.kind = 'group' AND a.org_id = v_conv.org_id");
    expect(ca).toContain("a.kind = 'event' AND a.event_id = v_conv.event_id");
    expect(ca).toContain("l.sender_id = p_uid AND l.status = 'sealed' AND l.mode = 'one-to-one'");
    // share_canvas posts one chat message on a NEW grant, and a chat failure never fails the share
    const sc = fnBody(rawA, 'share_canvas');
    expect(sc).toContain('ON CONFLICT DO NOTHING RETURNING id INTO v_entry;');
    expect(sc).toContain('IF v_entry IS NOT NULL THEN BEGIN PERFORM public._chat_post_canvas_share(v_uid, v_canvas, p_kind, p_target); EXCEPTION WHEN OTHERS THEN');
  });
  it('the only anon grant in migration A is get_canvas, and every client function is granted to authenticated alone', () => {
    const anon = [...codeA.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO [^;]*\banon\b/g)].map((m) => m[1]);
    expect(anon).toEqual(['get_canvas']);
    for (const fn of ['canvas_draft_open', 'canvas_draft_discard', 'canvas_draft_publish', 'list_my_canvas_versions']) {
      expect(codeA, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(codeA, fn).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated;`));
    }
  });
});

describe('P1536 migration B: spend, runs, writes', () => {
  it('spend: the canvas bucket and its caps; the global total is the founder\'s $50/day', () => {
    expect(norm(codeB)).toContain("CHECK (bucket IN ('reply', 'portrait', 'canvas'))");
    const lim = fnBody(rawB, '_mirror_limits');
    for (const [k, v] of [['canvas_max_usd', '0.27'], ['extract_max_usd', '0.35'], ['person_canvas_daily_usd', '3.00'],
      ['person_canvas_daily_count', '20'], ['global_canvas_daily_usd', '15.00'], ['global_total_daily_usd', '50.00']]) {
      expect(lim, k).toContain(`'${k}', ${v}`);
    }
    expect(rawB).toContain('-- Founder 2026-10-27: $50/day across all mirror and canvas AI');
    expect(rawB).not.toContain('FOUNDER DECISION: raise global_total_daily_usd');
  });
  it('the canvas ceiling is the mirror prices: (63k in x 1.5 + 16k out x 7.5) / 1e6 x 1.25, rounded up', () => {
    expect(Math.ceil(((63000 * 1.5 + 16000 * 7.5) / 1e6) * 1.25 * 100) / 100).toBe(0.27);
  });
  it('every _canvas_draft_* function is closed to clients; the engine set is granted to service_role and nothing else', () => {
    const defined = [...codeB.matchAll(/CREATE OR REPLACE FUNCTION public\.(_canvas_draft_\w+)\(/g)].map((m) => m[1]!);
    expect(defined.sort()).toEqual([
      '_canvas_draft_add_material', '_canvas_draft_extract_complete', '_canvas_draft_post', '_canvas_draft_run_begin',
      '_canvas_draft_run_complete', '_canvas_draft_run_fail', '_canvas_draft_tensions_complete',
    ]);
    for (const fn of defined) expect(codeB, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
    const granted = [...codeB.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO (\w+);/g)];
    expect(granted.every((m) => m[2] === 'service_role')).toBe(true);
    expect(granted.map((m) => m[1]).sort()).toEqual(defined.filter((f) => f !== '_canvas_draft_post').sort());
    expect(codeB).not.toMatch(/TO [^;]*\b(anon|authenticated)\b/);
  });
  it('every definer function pins an empty search_path, except the four that write points and say why', () => {
    const exceptions = new Set(['_canvas_draft_clear_points', 'canvas_draft_discard', 'canvas_draft_publish', '_canvas_draft_run_complete']);
    for (const [raw, code] of [[rawA, codeA], [rawB, codeB]] as const) {
      for (const m of code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)) {
        const name = m[1]!;
        if (!/^(_canvas|canvas_draft|list_my_canvas|get_canvas|share_canvas|set_canvas|send_chat|mirror_request|_chat_can|_mirror)/.test(name)) continue;
        const start = code.indexOf(m[0]);
        const header = code.slice(start, code.indexOf('AS $$', start));
        if (!/SECURITY DEFINER/.test(header)) continue;
        if (exceptions.has(name)) {
          expect(header, name).toMatch(/SET search_path = public, pg_temp/);
          expect(raw).toContain('Not search_path = \'\'');
        } else {
          expect(header, name).toMatch(/SET search_path = ''/);
        }
      }
    }
  });
  it('begin: 5-minute dead runs, 5 revisions, a reservation in the canvas bucket, agent rows never read, erasure-safe locks', () => {
    const b = fnBody(rawB, '_canvas_draft_run_begin');
    expect(b).toContain("c_dead CONSTANT interval := interval '5 minutes'");
    expect(b).toContain('c_revisions CONSTANT integer := 5');
    expect(b).toContain("'busy'");
    expect(b).toContain("'cap_reached'");
    expect(b).toContain("public._mirror_reserve(p_owner, 'canvas', v_max)");
    expect(b).toContain("x.kind IN ('message', 'forward', 'clarify') AND x.author_id = p_owner AND x.context_conversation_id IS NULL AND x.deleted_at IS NULL");
    expect(b).not.toContain("'agent'");
    expect(b).toContain('FOR SHARE SKIP LOCKED');
    expect(b).toContain("pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context'))");
    expect(b).toContain('derived_refs');
    expect(b).toContain("p_kind = 'tensions' AND v_d.base_version_id IS NULL");
  });
  it('run_complete: private points with a box tag, the draft tag and NO user tag; links recorded, never written; one transaction', () => {
    const b = fnBody(rawB, '_canvas_draft_run_complete');
    expect(b).toContain("VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])");
    expect(b).toContain("VALUES (v_pid, v_d.owner_id, 'agree')");
    expect(b).not.toContain('superseded_by =');
    expect(b).toContain('v_op.superseded_by IS NULL');
    expect(b).toContain('AND p.system_tags @> ARRAY[v_btag]::text[]');
    expect(b.indexOf('_canvas_draft_clear_points')).toBeLessThan(b.indexOf('INSERT INTO public.points'));
    expect(b.indexOf('INSERT INTO public.points')).toBeLessThan(b.indexOf('_canvas_draft_post'));
    expect(b).not.toMatch(/\bCOMMIT\b|\bROLLBACK\b/);
  });
  it('the agent reply is an agent row in the thread carrying the run\'s derived refs', () => {
    const b = fnBody(rawB, '_canvas_draft_post');
    expect(b).toContain("VALUES (p_conversation, NULL, left(btrim(p_body), 4000), 'agent', p_thread_root, COALESCE(p_refs, '{}'), clock_timestamp())");
  });
});

describe('P1536 review fixes (set A): database', () => {
  const COMPLETERS = ['_canvas_draft_run_complete', '_canvas_draft_tensions_complete', '_canvas_draft_extract_complete'] as const;
  it('A1: erasure cancels canvas runs that read the erased words, under the shared context lock, and scrubs stored tensions and decided notes', () => {
    expect(norm(codeA)).toContain("CHECK (state IN ('queued', 'running', 'done', 'failed', 'capped', 'cancelled'))");
    expect(norm(codeA)).toContain('CREATE INDEX IF NOT EXISTS canvas_draft_runs_derived_refs ON public.canvas_draft_runs USING gin (derived_refs) WHERE derived_refs IS NOT NULL');
    const e = fnBody(rawB, 'erase_chat_data_for');
    expect(e).toContain("SET state = 'cancelled', error_code = 'erased'");
    expect(e).toContain("SET tensions = '[]'::jsonb, decided = '[]'::jsonb");
    expect(e.indexOf("pg_advisory_xact_lock(hashtext('p1520_mirror_context'))")).toBeGreaterThan(-1);
    expect(e.indexOf("pg_advisory_xact_lock(hashtext('p1520_mirror_context'))")).toBeLessThan(e.indexOf('UPDATE public.canvas_draft_runs'));
    // every earlier step is still there
    for (const k of ["'chat_mirrors_deleted'", "'mirror_jobs_cancelled'", "'mirror_replies_erased'", "'chat_forwards_anonymised_'"]) expect(e).toContain(k);
  });
  it('A1: every completion of a cancelled run writes and posts nothing, and still settles what the call cost', () => {
    for (const fn of COMPLETERS) {
      const b = fnBody(rawB, fn);
      const at = b.indexOf("v_run.state = 'cancelled'");
      expect(at, fn).toBeGreaterThan(-1);
      expect(at, `${fn}: the cancelled branch comes before the running check`).toBeLessThan(b.indexOf("v_run.state <> 'running'"));
      const branch = b.slice(at, b.indexOf('END IF;', at));
      expect(branch, fn).toContain('_mirror_settle(v_run.spend_id');
      expect(branch, fn).toMatch(/RETURN (NULL|jsonb_build_object\('status', 'denied'\));/);
    }
    const f = fnBody(rawB, '_canvas_draft_run_fail');
    expect(f.indexOf("v_run.state = 'cancelled'")).toBeGreaterThan(-1);
    expect(f.indexOf("v_run.state = 'cancelled'")).toBeLessThan(f.indexOf("v_run.state <> 'running'"));
  });
  it('A2: a keep of a point that is not private becomes a private copy with no link; reword and move of one record no link', () => {
    const b = fnBody(rawB, '_canvas_draft_run_complete');
    expect(b).toContain("IF v_type = 'keep' AND v_op.visibility = 'private'::public.content_visibility THEN");
    expect(b).toContain("IF v_type IN ('reword', 'move') AND v_op.superseded_by IS NULL AND v_op.visibility = 'private'::public.content_visibility THEN");
    // the tag UPDATE of a reused point sits only inside the private-keep branch
    const tagAt = b.indexOf('SET system_tags = array_append(p.system_tags, v_tag)');
    expect(tagAt).toBeGreaterThan(b.indexOf("IF v_type = 'keep' AND v_op.visibility = 'private'"));
    expect(tagAt).toBeLessThan(b.indexOf('CONTINUE;'));
    expect(b.split('array_append(p.system_tags, v_tag)').length - 1).toBe(1);
    // the copy takes the owner's private stories of the old point, exactly like a move
    expect(b).toContain("ELSIF v_type IN ('move', 'keep') THEN");
  });
  it('A3: any open draft can be discarded (a first canvas has no base), and an untouched new-canvas draft is continued, not duplicated', () => {
    const d = fnBody(rawA, 'canvas_draft_discard');
    expect(d).not.toContain('base_version_id');
    expect(d).toContain("d.id = p_draft AND d.owner_id = v_uid FOR UPDATE");
    const o = fnBody(rawA, 'canvas_draft_open');
    const resume = "d.owner_id = v_uid AND d.state = 'open' AND d.base_version_id IS NULL AND d.run_count = 0 AND d.tension_count = 0";
    expect(o).toContain(resume);
    expect(o).toContain("AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id)");
    expect(o).toContain("AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_material m WHERE m.draft_id = d.id)");
    expect(o).toContain("'status', 'opened', 'resumed', true");
    expect(o.indexOf(resume), 'resuming does not count against the cap').toBeLessThan(o.indexOf('c_max_open THEN'));
    expect(o).toContain("IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN");
  });
  it('A4: only the stories the engine created are deleted, tracked on the draft and never granted to a client', () => {
    expect(norm(codeA)).toContain("created_story_ids uuid[] NOT NULL DEFAULT '{}'");
    const grant = codeA.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.canvas_drafts TO authenticated;/)![1]!;
    expect(grant).not.toContain('created_story_ids');
    const c = fnBody(rawA, '_canvas_draft_clear_points');
    expect(c).toContain('s.id = ANY (v_d.created_story_ids)');
    expect(c).not.toContain('v_stories');
    expect(c).toContain('NOT EXISTS (SELECT 1 FROM public.story_points sp WHERE sp.story_id = s.id)');
    expect(c).toContain("SET created_story_ids = '{}'");
    const r = fnBody(rawB, '_canvas_draft_run_complete');
    expect(r).toContain('v_new_stories := v_new_stories || v_sid');
    expect(r).toContain('created_story_ids = v_new_stories');
  });
  it('A12: the owner reads the draft\'s canvas name and version name from canvas_drafts (columns set at open, owner-only through RLS)', () => {
    expect(norm(codeA)).toContain('canvas_name text NOT NULL');
    expect(norm(codeA)).toContain('version_name text NOT NULL');
    const grant = codeA.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.canvas_drafts TO authenticated;/)![1]!;
    expect(grant.split(',').map((c) => c.trim())).toEqual(expect.arrayContaining(['canvas_name', 'version_name']));
    // still only an owner SELECT: the names are no more readable than the row
    expect(norm(codeA)).toContain('CREATE POLICY canvas_drafts_select ON public.canvas_drafts FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()))');
    const o = fnBody(rawA, 'canvas_draft_open');
    expect(o).toContain('INSERT INTO public.canvas_drafts (version_id, canvas_id, owner_id, base_version_id, conversation_id, thread_root_id, canvas_name, version_name) VALUES (v_ver, v_canvas.id, v_uid, p_from_version, v_conv, v_root, v_canvas.name, v_vname)');
  });
  it('A5: forwarding refuses a canvas_version attachment', () => {
    expect(fnBody(rawA, 'forward_chat_message')).toContain("IF v_src.attachment_kind = 'canvas_version' THEN RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023'; END IF;");
  });
  it('A6: a run\'s spend_id references the spend row and is cleared with it', () => {
    expect(norm(codeA)).toContain('spend_id uuid REFERENCES public.mirror_ai_spend(id) ON DELETE SET NULL');
  });
  it('A10: begin tells the engine the draft so far (with stories) and the owner\'s name', () => {
    const b = fnBody(rawB, '_canvas_draft_run_begin');
    expect(b).toContain("'owner_name', NULLIF(v_full, '')");
    const at = b.indexOf("'reused', EXISTS");
    expect(at).toBeGreaterThan(-1);
    expect(b.slice(b.lastIndexOf("'id', p.id", at), at)).toContain("'story'");
  });
});

describe('P1536 review fixes (round 2, set A): database', () => {
  it('R1: the provenance of the stored tensions is kept with them, ungranted, indexed, and cleared with them', () => {
    expect(norm(codeA)).toContain("tension_refs text[] NOT NULL DEFAULT '{}'");
    const grant = codeA.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.canvas_drafts TO authenticated;/)![1]!;
    expect(grant, 'never granted to a client').not.toContain('tension_refs');
    expect(norm(codeA)).toContain('USING gin (tension_refs)');
    const t = fnBody(rawB, '_canvas_draft_tensions_complete');
    expect(t).toContain('SET tensions = p_tensions, tension_refs = COALESCE(v_run.derived_refs, \'{}\')');
    const e = fnBody(rawB, 'erase_chat_data_for');
    expect(e).toContain("SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}'");
    expect(e).toContain('d.tension_refs @> ARRAY[v_ref]');
  });
  it('R1: a draft run unions the tensions\' refs into its own, under the shared context lock, before the run row is written', () => {
    const b = fnBody(rawB, '_canvas_draft_run_begin');
    const lock = b.indexOf("pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context'))");
    const union = b.indexOf('v_d.tension_refs');
    const insert = b.indexOf('INSERT INTO public.canvas_draft_runs (draft_id, owner_id, kind, speed, state, attempts');
    expect(union, 'the stored refs are read').toBeGreaterThan(-1);
    expect(union).toBeGreaterThan(lock);
    expect(union).toBeLessThan(insert);
    expect(b.slice(Math.max(0, union - 200), union + 200)).toContain("p_kind = 'draft'");
  });
  it('R6: a draft point that came from a reword or move says which base point it derives from and how', () => {
    const r = fnBody(rawB, '_canvas_draft_run_complete');
    expect(r).toContain("'relation', v_type");
    const b = fnBody(rawB, '_canvas_draft_run_begin');
    const at = b.indexOf("'reused', EXISTS");
    const item = b.slice(b.lastIndexOf("'id', p.id", at), at + 700);
    expect(item).toContain("'from_point_id'");
    expect(item).toContain("'relation'");
    expect(item).toContain('v_d.pending_links');
  });
});

describe('CONTROLS: each fact fails on a broken copy of the real file', () => {
  const mutate = (raw: string, from: string, to: string) => {
    expect(raw, `control source present: ${from.slice(0, 50)}`).toContain(from);
    return raw.replace(from, to);
  };
  const readerPublishedOnly = (s: string) => fnBody(s, 'get_canvas').includes("AND (v.published_at IS NOT NULL OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))");
  const noSupersededFilter = (s: string) => !fnBody(s, 'get_canvas').includes('superseded_by IS NULL');
  const writesPublishedOnly = (s: string) => fnBody(s, '_canvas_point_in_canvas').includes('(v.published_at IS NOT NULL OR auth.uid() = p_owner)');
  const linksOnlyHeads = (s: string) => fnBody(s, 'canvas_draft_publish').includes('o.superseded_by IS NULL');
  const noUserTag = (s: string) => fnBody(s, '_canvas_draft_run_complete').includes("'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])");
  const globalAtFounderCap = (s: string) => fnBody(s, '_mirror_limits').includes("'global_total_daily_usd', 50.00");
  const keepsP1545Kinds = (s: string) => norm(stripComments(s)).includes("attachment_kind IN ('point', 'story', 'canvas', 'letter', 'canvas_version')")
    && fnBody(s, 'send_chat_message').includes("NOT IN ('point', 'story', 'canvas', 'letter', 'canvas_version')");
  const keepsShareMessage = (s: string) => fnBody(s, 'share_canvas').includes('PERFORM public._chat_post_canvas_share(v_uid, v_canvas, p_kind, p_target)');
  const readerTagsFiltered = (s: string) => fnBody(s, 'get_canvas').includes("ELSE jsonb_build_object('system_tags', (")
    && fnBody(s, 'get_canvas').includes('pv.published_at IS NOT NULL');
  const foldsDraftTags = (s: string) => fnBody(s, 'list_my_artifacts_canvases').includes('SELECT COALESCE(vc.name, substr(t.tag, 8)) AS cname');
  const hidesDiscarded = (s: string) => fnBody(s, 'list_my_artifacts_canvases').includes("AND (v.id IS NULL OR v.published_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open'))");
  const readerPublishedList = (s: string) => fnBody(s, 'list_canvases_shared_with_me').includes('x.published_at IS NOT NULL');
  // quiet only where a canvas draft roots the thread: an ordinary mirror thread still reaches the job insert
  const quietOnlyInCanvasThreads = (s: string) => {
    const b = fnBody(s, 'mirror_request_reply');
    return b.includes('IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))')
      && !b.includes("d.state = 'published'") && b.includes('INSERT INTO public.mirror_jobs');
  };
  // P1576's transcript wait survives in the merged body, and its server voice path is quiet in canvas threads too
  const keepsTranscriptWait = (s: string) => fnBody(s, 'mirror_request_reply')
    .includes("IF v_msg.audio_duration_ms IS NOT NULL AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN RETURN QUERY SELECT NULL::uuid");
  const voicePathQuiet = (s: string) => fnBody(s, '_mirror_voice_start_reply')
    .includes('IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN RETURN NEW; END IF;');
  const keepsLetterRule = (s: string) => fnBody(s, '_chat_can_attach').includes("l.status = 'sealed' AND l.mode = 'one-to-one'");
  const noClientGrant = (s: string) => !/TO [^;]*\b(anon|authenticated)\b/.test(stripComments(s));

  const rejectsCancelled = (s: string) => ['_canvas_draft_run_complete', '_canvas_draft_tensions_complete', '_canvas_draft_extract_complete']
    .every((fn) => fnBody(s, fn).includes("v_run.state = 'cancelled'"));
  const deletesOnlyTracked = (s: string) => fnBody(s, '_canvas_draft_clear_points').includes('s.id = ANY (v_d.created_story_ids)');
  const copiesPublicKeep = (s: string) => fnBody(s, '_canvas_draft_run_complete').includes("IF v_type = 'keep' AND v_op.visibility = 'private'::public.content_visibility THEN");
  const refusesForwardedCanvas = (s: string) => fnBody(s, 'forward_chat_message').includes("v_src.attachment_kind = 'canvas_version'");
  it('the real files satisfy every fact (so a failure below is the mutation, not the fact)', () => {
    expect(readerPublishedOnly(rawA)).toBe(true);
    expect(noSupersededFilter(rawA)).toBe(true);
    expect(writesPublishedOnly(rawA)).toBe(true);
    expect(linksOnlyHeads(rawA)).toBe(true);
    expect(noUserTag(rawB)).toBe(true);
    expect(globalAtFounderCap(rawB)).toBe(true);
    expect(keepsP1545Kinds(rawA)).toBe(true);
    expect(keepsShareMessage(rawA)).toBe(true);
    expect(keepsLetterRule(rawA)).toBe(true);
    expect(foldsDraftTags(rawA)).toBe(true);
    expect(readerTagsFiltered(rawA)).toBe(true);
    expect(hidesDiscarded(rawA)).toBe(true);
    expect(readerPublishedList(rawA)).toBe(true);
    expect(quietOnlyInCanvasThreads(rawA)).toBe(true);
    expect(keepsTranscriptWait(rawA)).toBe(true);
    expect(voicePathQuiet(rawA)).toBe(true);
    expect(noClientGrant(rawB)).toBe(true);
    expect(rejectsCancelled(rawB)).toBe(true);
    expect(deletesOnlyTracked(rawA)).toBe(true);
    expect(copiesPublicKeep(rawB)).toBe(true);
    expect(refusesForwardedCanvas(rawA)).toBe(true);
  });
  it('a reader allowed to see a draft is caught', () => {
    const bad = rawA.replace(/AND \(v\.published_at IS NOT NULL\s+OR \(v_is_owner AND EXISTS/g, 'AND (true OR (v_is_owner AND EXISTS');
    expect(bad).not.toBe(rawA);
    expect(readerPublishedOnly(bad)).toBe(false);
  });
  it('the superseded filter put back is caught', () => {
    const bad = mutate(rawA, 'AND v_ver IS NOT NULL', 'AND p.superseded_by IS NULL');
    expect(noSupersededFilter(bad)).toBe(false);
  });
  it('a write allowed on a draft point is caught', () => {
    const bad = mutate(rawA, '(v.published_at IS NOT NULL OR auth.uid() = p_owner)', 'true');
    expect(writesPublishedOnly(bad)).toBe(false);
  });
  it('a link written to a point that is not a head is caught', () => {
    const bad = mutate(rawA, 'WHERE o.id = v_old AND o.first_validator_id = v_uid AND o.superseded_by IS NULL', 'WHERE o.id = v_old AND o.first_validator_id = v_uid');
    expect(linksOnlyHeads(bad)).toBe(false);
  });
  it('a user tag on a written point is caught', () => {
    const bad = mutate(rawB, "'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])", "'private'::public.content_visibility, ARRAY[v_dver], ARRAY[v_box, v_tag])");
    expect(noUserTag(bad)).toBe(false);
  });
  it('a global total other than the founder\'s $50 is caught', () => {
    const bad = mutate(rawB, "'global_total_daily_usd',    50.00", "'global_total_daily_usd',    10.00");
    expect(globalAtFounderCap(bad)).toBe(false);
  });
  it('a reader handed the raw system_tags (the draft\'s tag leaks) is caught', () => {
    const bad = mutate(rawA, "|| CASE WHEN v_is_owner THEN '{}'::jsonb ELSE jsonb_build_object('system_tags', (", "|| CASE WHEN true THEN '{}'::jsonb ELSE jsonb_build_object('system_tags', (");
    expect(readerTagsFiltered(bad)).toBe(true); // the shape is still there, so the equality check must catch it
    expect(fnBody(bad, 'get_canvas')).not.toBe(patched(REPLACED.get_canvas!.source, 'get_canvas', REPLACED.get_canvas!.edits));
    const gone = mutate(rawA, 'AND pv.published_at IS NOT NULL', 'AND true');
    expect(readerTagsFiltered(gone), 'every version\'s tag allowed, drafts included').toBe(false);
  });
  it('the owner\'s list without the fold (a draft tag listed as its own canvas) is caught', () => {
    const bad = mutate(rawA, 'SELECT COALESCE(vc.name, substr(t.tag, 8)) AS cname', 'SELECT substr(t.tag, 8) AS cname');
    expect(foldsDraftTags(bad)).toBe(false);
  });
  it('a discarded draft\'s version lending its points to the owner\'s list is caught', () => {
    const bad = mutate(rawA, "AND (v.id IS NULL OR v.published_at IS NOT NULL\n            OR EXISTS", "AND (true OR v.published_at IS NOT NULL\n            OR EXISTS");
    expect(hidesDiscarded(bad)).toBe(false);
  });
  it('a reader\'s list that shows a draft-only canvas is caught', () => {
    const bad = mutate(rawA, '     AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)\n', '');
    expect(readerPublishedList(bad)).toBe(false);
  });
  it('the mirror quiet only in PUBLISHED canvas threads (the old rule) is caught', () => {
    const bad = mutate(rawA, 'WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))',
      "WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id) AND d.state = 'published')");
    expect(quietOnlyInCanvasThreads(bad)).toBe(false);
  });
  it('CONTROL: the mirror quiet in EVERY thread (an ordinary thread would lose its job) is caught', () => {
    const bad = mutate(rawA, `IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS`, 'IF true\n     AND NOT EXISTS');
    expect(quietOnlyInCanvasThreads(bad)).toBe(false);
  });
  it('P1576\'s transcript wait dropped from mirror_request_reply (a pre-P1576 base) is caught', () => {
    const bad = mutate(rawA, "IF v_msg.audio_duration_ms IS NOT NULL\n     AND (v_msg.transcript_status IS DISTINCT FROM 'done'", "IF false\n     AND (v_msg.transcript_status IS DISTINCT FROM 'done'");
    expect(keepsTranscriptWait(bad)).toBe(false);
    expect(latestSource('mirror_request_reply')).not.toBe('20261023170000_p1554_review_fixes.sql');
  });
  it('a voice note in a canvas thread started by the server path (no quiet rule there) is caught', () => {
    const bad = mutate(rawA, "WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN", "WHERE false) THEN");
    expect(voicePathQuiet(bad)).toBe(false);
  });
  it('a P1545 kind dropped from the CHECK or from send_chat_message is caught', () => {
    const badCheck = mutate(rawA, "attachment_kind IN ('point', 'story', 'canvas', 'letter', 'canvas_version')", "attachment_kind IN ('point', 'story', 'canvas_version')");
    expect(keepsP1545Kinds(badCheck)).toBe(false);
    const badSend = mutate(rawA, "NOT IN ('point', 'story', 'canvas', 'letter', 'canvas_version')", "NOT IN ('point', 'story', 'canvas_version')");
    expect(keepsP1545Kinds(badSend)).toBe(false);
  });
  it('share_canvas without P1545\'s share message is caught', () => {
    const bad = mutate(rawA, 'PERFORM public._chat_post_canvas_share(v_uid, v_canvas, p_kind, p_target);', 'NULL;');
    expect(keepsShareMessage(bad)).toBe(false);
  });
  it('_chat_can_attach without P1545\'s letter rule is caught', () => {
    const bad = mutate(rawA, "AND l.status = 'sealed' AND l.mode = 'one-to-one'", '');
    expect(keepsLetterRule(bad)).toBe(false);
  });
  it('naming a pre-P1545 base (the bodies P1536 was first diffed against) fails the source check', () => {
    // P1545 replaced these three after P1536's first diff; a body rebuilt from the old base would revert P1545
    expect(latestSource('_chat_can_attach')).not.toBe('20261019203000_p1512_clarity_chat.sql');
    expect(latestSource('send_chat_message')).not.toBe('20261022160000_p1546_threads_everywhere.sql');
    expect(latestSource('share_canvas')).not.toBe('20261021200000_p1515_people_and_link.sql');
  });
  it('a client grant on an engine function is caught', () => {
    const bad = rawB + '\nGRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, text, text) TO authenticated;';
    expect(noClientGrant(bad)).toBe(false);
  });
  it('a completion that ignores a cancelled run is caught', () => {
    const bad = rawB.replace(/v_run\.state = 'cancelled'/g, "v_run.state = 'nothing'");
    expect(bad).not.toBe(rawB);
    expect(rejectsCancelled(bad)).toBe(false);
  });
  it('deleting every story that merely lost its last link (not only the engine\'s own) is caught', () => {
    const bad = mutate(rawA, 's.id = ANY (v_d.created_story_ids)', 's.id = ANY (v_stories)');
    expect(deletesOnlyTracked(bad)).toBe(false);
  });
  it('tagging a public point (the trigger would refuse it) is caught', () => {
    const bad = mutate(rawB, "IF v_type = 'keep' AND v_op.visibility = 'private'::public.content_visibility THEN", "IF v_type = 'keep' THEN");
    expect(copiesPublicKeep(bad)).toBe(false);
  });
  it('a forward that copies a canvas attachment is caught', () => {
    const bad = rawA.replace("IF v_src.attachment_kind = 'canvas_version' THEN", "IF false THEN");
    expect(bad).not.toBe(rawA);
    expect(refusesForwardedCanvas(bad)).toBe(false);
  });
  it('an extra edit inside a replaced body is caught by the equality check', () => {
    const bad = mutate(rawA, 'ORDER BY (v.published_at IS NULL), v.published_seq DESC', 'ORDER BY (v.published_at IS NULL), v.published_seq ASC');
    expect(fnBody(bad, 'get_canvas')).not.toBe(patched(REPLACED.get_canvas!.source, 'get_canvas', REPLACED.get_canvas!.edits));
  });
});

// ── 20261029100200: a reword keeps the owner's existing stories (points-only drafts) ──
// The engine sends story null on every action. A move and a keep re-link the owner's private stories of the old
// point; the reword branch is added by C, which replaces _canvas_draft_run_complete.

describe('P1536 C: a reword keeps the owner\'s existing private stories', () => {
  const C = '20261029100200_p1536_reword_keeps_stories.sql';
  const rawC = read(C);
  const FN = '_canvas_draft_run_complete';
  const definers = () => readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .filter((f) => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${FN}\\(`).test(stripComments(read(f)))).sort();
  /** The branch that links the owner's existing stories, taken from the LATEST definition of the function. */
  const storyBranch = (body: string) => body.slice(body.indexOf('ELSIF v_type IN'), body.indexOf('END IF;', body.indexOf('ELSIF v_type IN')));
  const relinksReword = (body: string) => storyBranch(body).includes("ELSIF v_type IN ('move', 'keep', 'reword') THEN");

  it('the latest definition of run_complete is C, and its story branch covers reword', () => {
    const defs = definers();
    expect(defs[defs.length - 1]).toBe(C);
    expect(relinksReword(fnBody(read(defs[defs.length - 1]!), FN))).toBe(true);
  });
  it('C is B\'s body with exactly one edit: the branch also covers reword (nothing else moved)', () => {
    const expected = patched(B, FN, [["ELSIF v_type IN ('move', 'keep') THEN", "ELSIF v_type IN ('move', 'keep', 'reword') THEN"]]);
    expect(fnBody(rawC, FN)).toBe(expected);
  });
  it('the re-linked stories are the owner\'s own and are never recorded as created (so a revision or discard cannot delete them)', () => {
    const body = fnBody(rawC, FN);
    const branch = storyBranch(body);
    expect(branch).toContain('s.author_id = v_d.owner_id');
    expect(branch).toContain("s.visibility = 'private'::public.content_visibility");
    expect(branch).not.toContain('v_new_stories');
    expect(branch).not.toContain('INSERT INTO public.stories');
    expect(body.split('v_new_stories := v_new_stories || v_sid').length - 1).toBe(1); // only the engine's own non-empty story
  });
  it('keeps the definer settings and the service-role-only grants of B', () => {
    const header = stripComments(rawC).slice(stripComments(rawC).indexOf(`CREATE OR REPLACE FUNCTION public.${FN}(`));
    expect(norm(header.slice(0, header.indexOf('AS $$')))).toContain("RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp");
    expect(stripComments(rawC)).toContain(`REVOKE ALL ON FUNCTION public.${FN}(uuid, jsonb, jsonb, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;`);
    expect(stripComments(rawC)).toContain(`GRANT EXECUTE ON FUNCTION public.${FN}(uuid, jsonb, jsonb, jsonb, text, numeric) TO service_role;`);
    expect(stripComments(rawC)).not.toMatch(/TO [^;]*\b(anon|authenticated)\b/);
  });
  it('the file does not touch the clear function, which only deletes the stories recorded as created', () => {
    expect(stripComments(rawC)).not.toContain('_canvas_draft_clear_points(uuid)');
    expect(fnBody(rawA, '_canvas_draft_clear_points')).toContain('s.id = ANY (v_d.created_story_ids)');
  });
  it('CONTROL (gate 7): the old branch, without reword, is caught by the same predicate', () => {
    expect(relinksReword(fnBody(rawB, FN))).toBe(false);
    const bad = rawC.replace("ELSIF v_type IN ('move', 'keep', 'reword') THEN", "ELSIF v_type IN ('move', 'keep') THEN");
    expect(bad).not.toBe(rawC);
    expect(relinksReword(fnBody(bad, FN))).toBe(false);
  });
});
