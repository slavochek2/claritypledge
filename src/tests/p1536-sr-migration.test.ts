/**
 * P1536 server review batch, the SHAPE of migration 20261103010000. The SQL cannot run in this suite (the migration is applied to the test database by the main
 * session; its behaviour is pinned by the "server review fixes" block of src/tests/integration/p1536-v6-engine.test.ts). What is pinned here is that each redefined function is
 * the earlier definition with exactly the edits listed in the migration header, so a body copied from an older base, or a stray edit, fails this file.
 *
 * Comments are stripped and whitespace collapsed before any comparison, as src/tests/p1536-s5-nothing-changed.test.ts does for the migration before this one.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWN_MESSAGES_LABEL } from '../../supabase/functions/_shared/canvas-run';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261103010000_p1536_server_review_fixes.sql';
const V6 = '20261030080000_p1536_v6_engine.sql';
const P1592 = '20261030090000_p1536_p1592_merge_erase_forward.sql';
const M3 = '20261103000000_p1536_nothing_changed_wording.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One function's definition: from its CREATE line (the first `start` found) to its closing `$$;`, comments stripped and whitespace collapsed. */
function fn(sql: string, start: string): string {
  const code = stripComments(sql);
  const at = code.indexOf(start);
  if (at < 0) throw new Error(`function not found: ${start}`);
  if (code.indexOf(start, at + 1) >= 0) throw new Error(`function found twice: ${start}`);
  return norm(code.slice(at, code.indexOf('$$;', code.indexOf('AS $$', at)) + 3));
}
/** `old` replaced by `new` in `body` exactly once (both given in any whitespace). */
function edit(body: string, old: string, neu: string): string {
  const o = norm(stripComments(old));
  const n = body.split(o).length - 1;
  if (n !== 1) throw new Error(`edit source found ${n} times: ${o.slice(0, 90)}`);
  return body.replace(o, () => norm(stripComments(neu)));
}

const COMPLETE = 'CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(\n  p_run uuid, p_owner uuid';
const COMPLETE6 = 'CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(\n  p_run uuid, p_actions jsonb';
const BEGIN = 'CREATE OR REPLACE FUNCTION public._canvas_draft_run_begin(p_run uuid, p_owner uuid';
const BEGIN_LEGACY = 'CREATE OR REPLACE FUNCTION public._canvas_draft_run_begin(p_owner uuid, p_draft uuid, p_kind text, p_speed text)';
const RETRY = 'CREATE OR REPLACE FUNCTION public.canvas_draft_retry(';
const UNDO = 'CREATE OR REPLACE FUNCTION public.canvas_draft_undo(';
const ERASE = 'CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)';

const sql = () => read(NEW);

describe('the header', () => {
  it('names what it was diffed against and why a client is unaffected', () => {
    expect(sql()).toMatch(/^-- diffed against: 20261103000000_p1536_nothing_changed_wording\.sql/m);
    expect(sql()).toMatch(/^-- client-safe: /m);
  });
  it('the version is the one the main session was given, and no other migration holds it', () => {
    expect(NEW.slice(0, 14)).toBe('20261103010000');
  });
});

describe('Opus 1: a retried upload stays an upload', () => {
  it('canvas_draft_retry is the v6 body with the one line that keeps the input kind', () => {
    const want = edit(fn(read(V6), RETRY),
      "v_in := CASE WHEN v_old.input_kind = 'voice' THEN 'voice' ELSE 'text' END;",
      "v_in := CASE WHEN v_old.input_kind IN ('voice', 'file') THEN v_old.input_kind ELSE 'text' END;");
    expect(fn(sql(), RETRY)).toBe(want);
  });
  it('begin is ready for an upload with no bytes when the upload\'s text was kept for the trigger message', () => {
    expect(fn(sql(), BEGIN)).toContain(norm(`ELSIF v_run.input_kind = 'file' AND NOT COALESCE(p_has_file, false)
      AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_material x WHERE x.draft_id = v_d.id AND x.message_id = v_run.trigger_message_id) THEN`));
  });
});

describe('Opus 5 / Opus 8 / begin: the names of a fork, as a helper', () => {
  const v6Begin = () => fn(read(V6), BEGIN);
  const block = (b: string) => b.slice(b.indexOf('SELECT COALESCE(array_agg(DISTINCT q.n)'), b.indexOf("lower(q.n) <> lower(v_full);") + "lower(q.n) <> lower(v_full);".length);
  it('the helper\'s query is exactly the query begin ran inline (same unions, same filter), with its parameters for the variables', () => {
    const inline = block(v6Begin()).replace(/v_ids/g, 'p_ids').replace(/v_run\.owner_id/g, 'p_owner').replace(/v_ref/g, 'p_ref').replace(/v_full/g, 'p_full');
    expect(inline.length, 'the inline block was found').toBeGreaterThan(500);
    expect(fn(sql(), 'CREATE OR REPLACE FUNCTION public._canvas_draft_other_names(')).toContain(inline);
  });
  it('begin calls the helper for its own copies, and for a fork also for the SOURCE draft\'s copies, read live', () => {
    const b = fn(sql(), BEGIN);
    expect(b).toContain('v_names := public._canvas_draft_other_names(v_ids, v_run.owner_id, v_ref, v_full);');
    expect(b).toContain(`IF v_run.kind = 'fork_first' AND v_d.source_draft_id IS NOT NULL THEN`);
    expect(b).toContain(`public._canvas_draft_effective_input(v_d.source_draft_id, NULL) -> 'copy_ids'`);
    expect(b, 'the inline query is gone from begin').not.toContain('SELECT COALESCE(array_agg(DISTINCT q.n)');
    expect(b, 'nothing is stored in the fork: no write of names anywhere in begin').not.toMatch(/INSERT INTO public\.canvas_draft_material/);
  });
  it('begin is the v6 body with exactly the two edits (the readiness line and the names)', () => {
    let want = v6Begin();
    want = edit(want, "ELSIF v_run.input_kind = 'file' AND NOT COALESCE(p_has_file, false) THEN",
      `ELSIF v_run.input_kind = 'file' AND NOT COALESCE(p_has_file, false)
        AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_material x WHERE x.draft_id = v_d.id AND x.message_id = v_run.trigger_message_id) THEN`);
    want = want.replace(block(want), () => norm(`v_names := public._canvas_draft_other_names(v_ids, v_run.owner_id, v_ref, v_full);
      IF v_run.kind = 'fork_first' AND v_d.source_draft_id IS NOT NULL THEN
        v_names := ARRAY(SELECT DISTINCT u FROM unnest(v_names || public._canvas_draft_other_names(
          ARRAY(SELECT jsonb_array_elements_text(public._canvas_draft_effective_input(v_d.source_draft_id, NULL) -> 'copy_ids')::uuid),
          v_run.owner_id, v_ref, v_full)) u);
      END IF;`));
    expect(fn(sql(), BEGIN)).toBe(want);
  });
  it('the fork seed row is labelled exactly as the engine reads it', () => {
    expect(fn(read(V6), 'CREATE OR REPLACE FUNCTION public.canvas_draft_fork(')).toContain(`'Your messages'`);
    expect(OWN_MESSAGES_LABEL).toBe('Your messages');
  });
});

describe('Opus 2: Undo gives back the offer a first draft took as its focus', () => {
  it('canvas_draft_undo is the v6 body plus one UPDATE before the draft row is restored', () => {
    const want = edit(fn(read(V6), UNDO),
      `UPDATE public.canvas_drafts d SET pending_links = v_step.pending_links, questions = v_step.questions, focus = v_step.focus, revision = d.revision + 1`,
      `UPDATE public.canvas_draft_offers o SET state = 'offered'
         WHERE o.draft_id = v_d.id AND o.state = 'focused'
           AND (v_step.focus IS NULL OR public._canvas_offer_key(o.group_label) IS DISTINCT FROM public._canvas_offer_key(v_step.focus));
       UPDATE public.canvas_drafts d SET pending_links = v_step.pending_links, questions = v_step.questions, focus = v_step.focus, revision = d.revision + 1`);
    expect(fn(sql(), UNDO)).toBe(want);
  });
});

describe('Opus 8: erasure reaches the offers a run made from the erased person\'s words', () => {
  const OFFERS_STEP = `
    UPDATE public.canvas_drafts d SET revision = d.revision + 1
     WHERE d.id IN (SELECT o.draft_id FROM public.canvas_draft_offers o
                     WHERE (o.state = 'offered' OR o.why IS NOT NULL)
                       AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]));
    DELETE FROM public.canvas_draft_offers o
     WHERE o.state = 'offered'
       AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offers_erased', n);
    UPDATE public.canvas_draft_offers o SET why = NULL
     WHERE o.why IS NOT NULL
       AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offer_reasons_cleared', n);`;
  it('erase_chat_data_for is the earlier body plus exactly that step, after the round threads are retitled and BEFORE step 8, so step 8 stays one unbroken block (the earlier migrations\' tests pin it)', () => {
    const was = fn(read(P1592), ERASE);
    const anchor = "v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));";
    expect(fn(sql(), ERASE)).toBe(edit(was, anchor, `${anchor}${OFFERS_STEP}`));
  });
  it('the step touches only offers of runs whose derived_refs hold the subject: no offer of any other run is named without that condition', () => {
    const body = fn(sql(), ERASE);
    const from = body.indexOf('UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id IN (SELECT o.draft_id');
    const step = body.slice(from, body.indexOf("'canvas_draft_offer_reasons_cleared', n);", from));
    expect(step.split('DELETE FROM public.canvas_draft_offers').length - 1).toBe(1);
    expect(step.split('derived_refs @> ARRAY[v_ref]').length - 1).toBe(3);   // the revision bump, the delete, the reason clear
  });
});

describe('Gemini 6: one offer merge', () => {
  it('the helper is the earlier step-5 loop with its parameters for the variables', () => {
    const was = fn(read(M3), COMPLETE);
    const from = was.indexOf('FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_other_canvases');
    const loop = was.slice(from, was.indexOf('END LOOP;', from) + 'END LOOP;'.length);
    expect(loop.length, 'the loop was found').toBeGreaterThan(400);
    const asHelper = loop.replace(/v_d\.id/g, 'p_draft').replace(/v_run\.id/g, 'p_run').replace(/v_focus/g, 'p_focus').replace("COALESCE(p_other_canvases, '[]'::jsonb)", "COALESCE(p_offers, '[]'::jsonb)").replace(/v_new_offers/g, 'v_new');
    expect(fn(sql(), 'CREATE OR REPLACE FUNCTION public._canvas_draft_merge_offers(')).toContain(asHelper);
  });
  it('complete holds no offer loop of its own, and calls the helper exactly twice (scoped, and an upload on an empty scope)', () => {
    const b = fn(sql(), COMPLETE);
    expect(b).not.toContain('FOR v_el IN');
    expect(b.split('public._canvas_draft_merge_offers(').length - 1).toBe(2);
    expect(b.split('INSERT INTO public.canvas_draft_offers').length - 1, 'only the focus run\'s previous-focus offer is written inline').toBe(1);
  });
});

describe('_canvas_draft_run_complete: the earlier body with exactly these edits', () => {
  /** The J9 loop block is replaced by the helper call; the rest are the edits below. */
  function expected(): string {
    let b = fn(read(M3), COMPLETE);
    b = edit(b, 'v_j9_labels text[];', 'v_j9_labels text[]; v_idle boolean := false; v_removed boolean;');
    b = edit(b, `PERFORM set_config('p1536.keep_updated_at', 'off', true); FOREACH v_k IN ARRAY v_scope LOOP`, `PERFORM set_config('p1536.keep_updated_at', 'off', true);
      v_removed := EXISTS (SELECT 1 FROM unnest(v_pre) q WHERE NOT (q = ANY (public._canvas_draft_point_ids(v_d.id))));
      v_idle := v_run.kind = 'message' AND NOT v_first AND v_made = 0 AND NOT v_removed;
      IF v_idle THEN DELETE FROM public.canvas_draft_steps s WHERE s.run_id = v_run.id; END IF;
      IF NOT v_idle THEN FOREACH v_k IN ARRAY v_scope LOOP`);
    b = edit(b, `WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id));`, `WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id)); END IF;`);
    b = edit(b, `ELSIF v_first THEN v_focus := COALESCE(NULLIF(left(btrim(COALESCE(p_focus, '')), 120), ''), v_d.focus); END IF;`,
      `ELSIF v_first THEN v_focus := COALESCE(NULLIF(left(btrim(COALESCE(p_focus, '')), 120), ''), v_d.focus);
         UPDATE public.canvas_draft_offers o SET state = 'focused'
          WHERE o.draft_id = v_d.id AND o.state = 'offered' AND v_focus IS NOT NULL
            AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_focus);
       END IF;`);
    // step 5's loop, then the upload exception's block, become helper calls
    const from5 = b.indexOf('FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_other_canvases');
    const loop = b.slice(from5, b.indexOf('END LOOP;', from5) + 'END LOOP;'.length);
    b = b.replace(loop, () => 'v_new_offers := v_new_offers || public._canvas_draft_merge_offers(v_d.id, v_run.id, v_focus, p_other_canvases);');
    const fromJ9 = b.indexOf("IF cardinality(v_scope) = 0 AND v_run.kind = 'message' AND v_run.input_kind = 'file' THEN");
    const toJ9 = b.indexOf('v_reply := NULLIF(btrim(COALESCE(p_reply');
    b = b.slice(0, fromJ9) + norm(`IF cardinality(v_scope) = 0 AND v_run.kind = 'message' AND v_run.input_kind = 'file' THEN
        v_new_offers := v_new_offers || public._canvas_draft_merge_offers(v_d.id, v_run.id, v_focus, p_other_canvases);
      END IF;
      IF v_run.kind = 'message' AND NOT v_first AND cardinality(v_new_offers) > 0 THEN
        SELECT array_agg(o.group_label ORDER BY o.created_at, o.id) INTO v_j9_labels FROM public.canvas_draft_offers o WHERE o.id = ANY (v_new_offers);
      END IF;`) + ' ' + b.slice(toJ9);
    b = edit(b, 'IF v_reply IS NULL AND cardinality(v_scope) = 0 THEN', 'IF v_reply IS NULL AND (cardinality(v_scope) = 0 OR v_idle) THEN');
    b = edit(b, "v_reply := 'Your new file is also about ' || CASE", "v_reply := 'Your ' || CASE v_run.input_kind WHEN 'file' THEN 'new file' WHEN 'voice' THEN 'voice note' ELSE 'message' END || ' is also about ' || CASE");
    b = edit(b, "|| E'\\n' || v_reply;", "|| COALESCE(E'\\n' || v_reply, '');");
    b = edit(b, "'status', 'ok', 'applied', cardinality(v_scope) > 0, 'scope'", "'status', 'ok', 'applied', cardinality(v_scope) > 0 AND NOT v_idle, 'scope'");
    return b;
  }
  it('is the 20261103000000 body with exactly the edits of the header (J9 on every path, one merge helper, idle runs, the first draft\'s focus)', () => {
    expect(fn(sql(), COMPLETE)).toBe(expected());
  });
  it('CONTROL: the comparison is not blind: a second stray edit is not equal, and the new body differs from the old one', () => {
    expect(fn(sql(), COMPLETE).replace('NOT v_idle', 'v_idle')).not.toBe(expected());
    expect(fn(sql(), COMPLETE)).not.toBe(fn(read(M3), COMPLETE));
  });
  it('an idle run is only ever a later message: never the first draft, a focus switch or a fork\'s first run', () => {
    const b = fn(sql(), COMPLETE);
    expect(b).toContain(`v_idle := v_run.kind = 'message' AND NOT v_first AND v_made = 0 AND NOT v_removed;`);
    // the questions and links of the run are written only when it is not idle
    expect(b).toMatch(/IF NOT v_idle THEN FOREACH v_k IN ARRAY v_scope LOOP/);
  });
  it('the J9 line is said for every non-first message run from the persisted rows, and never for a first draft', () => {
    const b = fn(sql(), COMPLETE);
    expect(b).toContain(`IF v_run.kind = 'message' AND NOT v_first AND cardinality(v_new_offers) > 0 THEN SELECT array_agg(o.group_label ORDER BY o.created_at, o.id) INTO v_j9_labels`);
    expect(b).toContain(`WHEN 'file' THEN 'new file' WHEN 'voice' THEN 'voice note' ELSE 'message'`);
  });
});

describe('the grants and the restated overloads', () => {
  const code = () => norm(stripComments(sql()));
  it('the two helpers are closed to every client role and granted to none', () => {
    expect(code()).toContain('REVOKE ALL ON FUNCTION public._canvas_draft_merge_offers(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;');
    expect(code()).toContain('REVOKE ALL ON FUNCTION public._canvas_draft_other_names(uuid[], uuid, text, text) FROM PUBLIC, anon, authenticated;');
    expect(code()).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._canvas_draft_(?:merge_offers|other_names)/);
  });
  it('every redefined function keeps the grants it had', () => {
    const c = code();
    expect(c).toContain('REVOKE ALL ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;');
    expect(c).toContain('GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) TO service_role;');
    expect(c).toContain('REVOKE ALL ON FUNCTION public.canvas_draft_retry(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;');
    expect(c).toContain('GRANT EXECUTE ON FUNCTION public.canvas_draft_retry(uuid, uuid, integer, uuid) TO authenticated;');
    expect(c).toContain('REVOKE ALL ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;');
    expect(c).toContain('GRANT EXECUTE ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) TO authenticated;');
    expect(c).toContain('REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;');
    expect(c).toContain('REVOKE ALL ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric) FROM PUBLIC, anon, authenticated;');
    expect(c).toContain('GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric) TO service_role;');
  });
  it('the legacy overloads are restated byte for byte AFTER the forms above (sd-guard-completeness keeps the last definition per name per file)', () => {
    expect(fn(sql(), BEGIN_LEGACY)).toBe(fn(read(V6), BEGIN_LEGACY));
    expect(fn(sql(), COMPLETE6)).toBe(fn(read(V6), COMPLETE6));
    const c = stripComments(sql());
    expect(c.indexOf('p_run uuid, p_owner uuid, p_has_file')).toBeLessThan(c.indexOf('p_owner uuid, p_draft uuid, p_kind text, p_speed text'));
    expect(c.indexOf('p_run uuid, p_owner uuid, p_actions')).toBeLessThan(c.indexOf('p_run uuid, p_actions jsonb'));
  });
  it('no later migration redefines a function this file redefines (the version is the newest)', () => {
    const later = readdirSync(MIG).filter((f) => f.endsWith('.sql') && f > NEW);
    for (const f of later) {
      const c = read(f);
      for (const name of ['_canvas_draft_run_complete', '_canvas_draft_run_begin', 'canvas_draft_retry', 'canvas_draft_undo', 'erase_chat_data_for', '_canvas_draft_merge_offers', '_canvas_draft_other_names']) {
        expect(c.includes(`FUNCTION public.${name}(`), `${f} redefines ${name}`).toBe(false);
      }
    }
  });
});
