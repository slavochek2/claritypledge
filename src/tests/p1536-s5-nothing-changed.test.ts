/**
 * P1536 3c wording table: an update that changed nothing reads "Nothing changed on the canvas. I noted: …" (without the note when there is none).
 * It supersedes "No box changed." in section 2, J11 and S1.13. Two places write it: the engine's reply (canvas-reply.ts) and the database's own fallback
 * when a run completes with no reply (`_canvas_draft_run_complete`, migration 20261103000000). The database behaviour is proved on the test
 * database by src/tests/integration/p1536-v6-engine.test.ts; this pins the SHAPE: the new body is the v6 body with exactly that one literal changed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDraftReply } from '../../supabase/functions/_shared/canvas-reply';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261103000000_p1536_nothing_changed_wording.sql';
const V6 = '20261030080000_p1536_v6_engine.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
/** The 10-argument function (v6 also holds the older 6-argument one further down). */
function runComplete(sql: string): string {
  const code = stripComments(sql);
  const a = code.indexOf('CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(\n  p_run uuid, p_owner uuid');
  if (a < 0) throw new Error('_canvas_draft_run_complete (10 args) not found');
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}

describe('3c: "Nothing changed on the canvas." in the engine reply', () => {
  const none = { total: 0, outcome: 'unchanged' as const, unreadable: [], droppedUnverified: 0, droppedNames: 0 };
  it('with the model\'s note: the note follows, quoted', () => {
    expect(buildDraftReply({ ...none, note: 'That is a question, not a change.' })).toBe('Nothing changed on the canvas. I noted: "That is a question, not a change."');
  });
  it('without a note: the sentence alone', () => {
    expect(buildDraftReply(none)).toBe('Nothing changed on the canvas.');
  });
  it('the old wording is gone from every reply the engine builds', () => {
    const all = [
      buildDraftReply(none), buildDraftReply({ ...none, note: 'x' }), buildDraftReply({ ...none, outcome: 'updated', changedBoxes: ['canvas:love'] }),
      buildDraftReply({ ...none, outcome: 'draft', filledBoxes: 3, total: 3 }), buildDraftReply({ ...none, outcome: 'failed' }),
    ].join('\n');
    expect(all).not.toContain('No box changed');
  });
});

describe('3c: the database fallback says it too (migration 20261103000000)', () => {
  const sql = () => read(NEW);
  it('the header names what it was diffed against and why a client is unaffected', () => {
    expect(sql()).toMatch(/^-- diffed against: 20261030080000_p1536_v6_engine\.sql/m);
    expect(sql()).toMatch(/^-- client-safe: /m);
  });
  /** The v6 body with exactly the changes of this file: the wording literal, one declaration, the J9 block (a COPY of step 5's offer merge, run only for an upload on an empty scope), and the J9 line. */
  function expectedBody(): string {
    const once = (body: string, from: string, to: string): string => {
      const n = body.split(from).length - 1;
      if (n !== 1) throw new Error(`edit source found ${n} times: ${from.slice(0, 70)}`);
      return body.replace(from, () => to);
    };
    let b = runComplete(read(V6));
    b = once(b, "v_reply := 'No box changed.' || COALESCE(' ' || NULLIF(left(btrim(COALESCE(p_note, '')), 160), ''), '');",
      "v_reply := 'Nothing changed on the canvas.' || COALESCE(' I noted: \"' || NULLIF(left(btrim(COALESCE(p_note, '')), 160), '') || '\"', '');");
    b = once(b, 'v_open integer;', 'v_open integer; v_j9_labels text[];');
    // step 5's loop, copied: from "FOR v_el IN" to its END LOOP
    const from = b.indexOf('FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_other_canvases');
    const loop = b.slice(from, b.indexOf('END LOOP;', from) + 'END LOOP;'.length);
    expect(loop.length, 'the copied loop was found').toBeGreaterThan(400);
    b = once(b, "END IF; v_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');",
      `END IF; IF cardinality(v_scope) = 0 AND v_run.kind = 'message' AND v_run.input_kind = 'file' THEN ${loop} IF cardinality(v_new_offers) > 0 THEN SELECT array_agg(o.group_label ORDER BY o.created_at, o.id) INTO v_j9_labels FROM public.canvas_draft_offers o WHERE o.id = ANY (v_new_offers); END IF; END IF; v_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');`);
    b = once(b, 'v_reply_id := public._canvas_draft_post_reply(',
      "IF v_j9_labels IS NOT NULL THEN v_reply := 'Your new file is also about ' || CASE WHEN cardinality(v_j9_labels) = 1 THEN v_j9_labels[1] ELSE array_to_string(v_j9_labels[1:cardinality(v_j9_labels) - 1], ', ') || ' and ' || v_j9_labels[cardinality(v_j9_labels)] END || '.' || COALESCE(' This canvas stays about ' || v_focus || '.', '') || E'\\n' || v_reply; END IF; v_reply_id := public._canvas_draft_post_reply(");
    return b;
  }
  it('the function is the v6 body with exactly these changes: the wording literal and the J9 exception for an upload, and nothing else', () => {
    expect(runComplete(sql())).toBe(expectedBody());
  });
  it('the J9 exception is exactly: kind message, input_kind file, EMPTY scope; typed and spoken input keep the rule', () => {
    const body = runComplete(sql());
    expect(body).toContain("IF cardinality(v_scope) = 0 AND v_run.kind = 'message' AND v_run.input_kind = 'file' THEN");
    expect(body.split("v_run.input_kind = 'file'")).toHaveLength(2);                        // named once
    expect(body).not.toMatch(/input_kind = '(?:text|voice)'/);
    // no step, no focus, no points, no questions in the exception: it has no INSERT INTO canvas_draft_steps and no focus update of its own
    const exception = body.slice(body.indexOf("IF cardinality(v_scope) = 0 AND v_run.kind = 'message'"), body.indexOf("v_reply := NULLIF(btrim"));
    expect(exception).not.toContain('canvas_draft_steps');
    expect(exception).not.toContain('SET pending_links');
    expect(exception).not.toMatch(/UPDATE public\.canvas_drafts/);
    expect(exception).toContain('INSERT INTO public.canvas_draft_offers');
  });
  it('CONTROL: the comparison is not blind: a body with a second edit is not equal', () => {
    const was = runComplete(read(V6));
    expect(runComplete(sql())).not.toBe(was);
    expect(runComplete(sql()).replace('Nothing changed on the canvas.', 'Nothing changed on the canvas!')).not.toBe(runComplete(sql()));
  });
  it('the 6-argument overload is restated byte for byte, AFTER the 10-argument one (sd-guard-completeness keeps one body per name per file: the last)', () => {
    const six = (sql: string) => {
      const code = stripComments(sql);
      const a = code.indexOf('CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(\n  p_run uuid, p_actions jsonb');
      if (a < 0) throw new Error('6-arg form not found');
      return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
    };
    expect(six(sql())).toBe(six(read(V6)));
    const code = stripComments(sql());
    expect(code.indexOf('p_run uuid, p_owner uuid')).toBeLessThan(code.indexOf('p_run uuid, p_actions jsonb'));
  });
  it('the grants are v6\'s: service role only', () => {
    const code = stripComments(sql());
    expect(norm(code)).toContain('REVOKE ALL ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric) FROM PUBLIC, anon, authenticated;');
    expect(norm(code)).toContain('GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric) TO service_role;');
  });
  it('no other migration holds the version', () => {
    expect(NEW.slice(0, 14)).toBe('20261103000000');
  });
});
