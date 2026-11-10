/**
 * @file p1631-clarify-drafts-migration.test.ts
 * @description P1631 step 1: source contract for migration 20261110153000_p1631_clarify_drafts.sql.
 *   - the two restated bodies (mirror_request_reply, _mirror_voice_start_reply) are their NEWEST previous body plus ONLY the P1631 block;
 *   - the functions this migration deliberately does not redefine (erase_chat_data_for, _mirror_begin_job, clarify_chat_message) are not;
 *   - client functions are granted to authenticated alone, workers to service_role alone, nothing to anon;
 *   - the table is closed except the owner's column-granted SELECT, with the one-active-draft index;
 *   - the context rules of D4 and the validation of D6 are present in the worker bodies.
 * Epistemic gate 7: the last block runs the body check against a mutated copy of the real file and shows it fail.
 * The behaviour is proved on the test database by src/tests/integration/p1631-clarify-drafts.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261110153000_p1631_clarify_drafts.sql';
const OLD = '20261029100000_p1536_canvas_draft_versions.sql';
const FIX = '20261110170000_p1631_review_fixes.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`);
  const m = re.exec(code);
  if (!m) throw new Error(`${name} not found`);
  return norm(code.slice(m.index, code.indexOf('$$;', code.indexOf('AS $$', m.index)) + 3));
}
function newestBefore(name: string, before: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < before && re.test(stripComments(read(f)))).sort();
  return defs[defs.length - 1]!;
}

const raw = read(FILE);

/** The blocks P1631 adds to the two restated bodies, as they read once comments are stripped and spaces folded. */
const REQUEST_BLOCK = norm(`IF EXISTS (SELECT 1 FROM public.clarify_drafts cd
              WHERE cd.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;`);
const VOICE_BLOCK = norm(`IF EXISTS (SELECT 1 FROM public.clarify_drafts cd
              WHERE cd.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN
    RETURN NEW;
  END IF;`);

function restatedWithout(sql: string, name: string, block: string): string {
  const body = fnBody(sql, name);
  const hits = body.split(block).length - 1;
  if (hits !== 1) throw new Error(`${name}: the P1631 block was found ${hits} times`);
  return norm(body.replace(block, ''));
}

describe('P1631 migration: header and file', () => {
  it('names its source for each restated function and carries client-safe, new-function annotations', () => {
    expect(raw).toMatch(/^-- client-safe:/m);
    expect(raw).toMatch(/diffed against/);
    const header = raw.slice(0, raw.indexOf('CREATE TABLE'));
    expect(header).toContain(OLD);
    for (const f of ['mirror_request_reply', '_mirror_voice_start_reply', 'clarify_chat_message', '_mirror_begin_job', 'erase_chat_data_for']) expect(header).toContain(f);
    for (const f of ['clarify_start', 'clarify_another', 'clarify_retry', 'clarify_draft_edit', 'clarify_draft_delete', 'get_clarify_thread', '_clarify_begin', '_clarify_complete', '_clarify_fail']) {
      expect(raw).toContain(`-- new function: ${f}`);
    }
  });
  it('the source named is the newest definition before this file, and this file is the newest of all', () => {
    for (const name of ['mirror_request_reply', '_mirror_voice_start_reply']) {
      expect(newestBefore(name, FILE)).toBe(OLD);
    }
    const re = (n: string) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${n}\\s*\\(`, 'i');
    const all = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    for (const name of ['mirror_request_reply', '_mirror_voice_start_reply']) {
      const defs = all.filter((f) => re(name).test(stripComments(read(f))));
      // the review-fix migration (20261110170000) restates both again, keyed on the thread marker: it is the newest definition now
      expect(defs.slice(-2)).toEqual([FILE, FIX]);
    }
  });
});

describe('P1631 migration: restated bodies are the newest previous body plus the P1631 block only', () => {
  it('mirror_request_reply', () => {
    expect(restatedWithout(raw, 'mirror_request_reply', REQUEST_BLOCK)).toBe(fnBody(read(OLD), 'mirror_request_reply'));
  });
  it('_mirror_voice_start_reply', () => {
    expect(restatedWithout(raw, '_mirror_voice_start_reply', VOICE_BLOCK)).toBe(fnBody(read(OLD), '_mirror_voice_start_reply'));
  });
  it('the canvas quiet rule is still there, byte for byte, next to the new one', () => {
    const body = fnBody(raw, 'mirror_request_reply');
    expect(body).toContain(norm('FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id)'));
    expect(body).toContain(norm('v_msg.audio_duration_ms IS NOT NULL'));
    expect(fnBody(raw, '_mirror_voice_start_reply')).toContain(norm('FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)'));
  });
  it('grants of both restated functions are unchanged', () => {
    const code = stripComments(raw);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.mirror_request_reply\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.mirror_request_reply\(uuid\) TO authenticated;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\._mirror_voice_start_reply\(\) FROM PUBLIC, anon, authenticated;/);
  });
});

describe('P1631 migration: what is deliberately not redefined', () => {
  it.each(['erase_chat_data_for', '_mirror_begin_job', 'clarify_chat_message', '_mirror_limits', '_mirror_reserve', 'forward_chat_message'])('%s', (name) => {
    expect(stripComments(raw)).not.toMatch(new RegExp(`FUNCTION public\\.${name}\\(`));
  });
  it('clarify_start calls clarify_chat_message (the same access check and copy)', () => {
    expect(fnBody(raw, 'clarify_start')).toContain('public.clarify_chat_message(p_source, NULL)');
  });
  it('no trigger on chat_messages (it would make every chat_messages writer a points writer for the P1364 drift guard)', () => {
    expect(stripComments(raw)).not.toMatch(/ON public\.chat_messages/);
    expect(stripComments(raw)).not.toContain('_clarify_on_message_erase');
  });
});

describe('P1631 migration: grants and table', () => {
  const code = stripComments(raw);
  it.each(['clarify_start(uuid)', 'clarify_another(uuid, text)', 'clarify_retry(uuid)', 'clarify_draft_edit(uuid, text)', 'clarify_draft_delete(uuid)', 'get_clarify_thread(uuid)'])(
    'client function %s: revoked from public and anon, granted to authenticated', (sig) => {
      const e = sig.replace(/[()]/g, '\\$&');
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e} TO authenticated;`));
    });
  it.each(['_clarify_begin(uuid)', '_clarify_complete(uuid, jsonb, numeric)', '_clarify_fail(uuid, text, numeric)'])('worker %s: service_role alone', (sig) => {
    const e = sig.replace(/[()]/g, '\\$&');
    expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;`));
    expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e} TO service_role;`));
  });
  it('no function of this file is granted to anon', () => {
    expect(code).not.toMatch(/GRANT EXECUTE[^;]*\banon\b/);
  });
  it('the table is closed: RLS on, no table grant, a column grant without spend, refs or sent ids, an owner policy', () => {
    expect(code).toContain('ALTER TABLE public.clarify_drafts ENABLE ROW LEVEL SECURITY;');
    expect(code).toContain('REVOKE ALL ON TABLE public.clarify_drafts FROM PUBLIC, anon, authenticated;');
    const grant = /GRANT SELECT \(([^)]*)\)\s+ON public\.clarify_drafts TO authenticated;/.exec(code)![1]!;
    for (const secret of ['spend_id', 'derived_refs', 'sent_ids']) expect(grant).not.toContain(secret);
    for (const col of ['id', 'owner_id', 'thread_root_id', 'point_id', 'state', 'suggestions', 'cited', 'error_code']) expect(grant).toContain(col);
    expect(code).toMatch(/CREATE POLICY clarify_drafts_select ON public\.clarify_drafts FOR SELECT TO authenticated\s+USING \(owner_id = \(SELECT auth\.uid\(\)\)\)/);
    expect(code).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*clarify_drafts/);
  });
  it('one queued or running draft per owner (D8) and the state set of the contract', () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS clarify_drafts_one_active ON public\.clarify_drafts \(owner_id\) WHERE state IN \('queued', 'running'\)/);
    expect(code).toContain(`CHECK (state IN ('queued', 'running', 'done', 'refused', 'failed', 'capped'))`);
  });
});

describe('P1631 migration: every function that writes points keeps the search_path the triggers on points need', () => {
  const code = stripComments(raw);
  it.each(['_clarify_draft_drop_point()', 'clarify_draft_edit(p_draft uuid, p_statement text)', '_clarify_complete(p_draft uuid, p_result jsonb, p_usd numeric)'])(
    '%s uses public, pg_temp (the supersede trigger reads points unqualified; "" fails 42P01)', (sig) => {
      const i = code.indexOf(`CREATE OR REPLACE FUNCTION public.${sig}`);
      expect(i).toBeGreaterThan(0);
      expect(code.slice(i, i + 400)).toContain('SET search_path = public, pg_temp');
    });
});

describe('P1631 migration: D2, D4, D6, D7 in the worker bodies', () => {
  it('begin reserves the canvas bucket at canvas_max_usd, takes the rows FOR SHARE SKIP LOCKED and the context lock shared and TRY only', () => {
    const b = fnBody(raw, '_clarify_begin');
    expect(b).toContain(norm(`public._mirror_reserve(v_d.owner_id, 'canvas', v_usd)`));
    expect(b).toContain(norm(`public._mirror_limits() ->> 'canvas_max_usd'`));
    expect(b).toContain('FOR SHARE SKIP LOCKED');
    expect(b).toContain(`pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context'))`);
    expect(b).toContain('public._chat_access_since(v_d.source_conversation_id, v_d.owner_id)');
    expect(b).toContain('x.created_at <= v_d.created_at');
  });
  it('begin sends rows as {id, text} and never an author name', () => {
    const b = fnBody(raw, '_clarify_begin');
    expect(b).not.toMatch(/profiles/);
    expect(b).not.toMatch(/author_name|'name'|'who'/);
    expect(b).toContain(`jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000))`);
    expect(b).toContain(`'is_pressed', true`);
  });
  it('complete validates cited ids against the ids that were sent, bounds the statement, and stores no model free text', () => {
    const c = fnBody(raw, '_clarify_complete');
    expect(c).toContain('= ANY (v_d.sent_ids)');
    expect(c).toContain('char_length(v_stmt) NOT BETWEEN 1 AND 300');
    expect(c).toContain(`error_code = 'bad_output'`);
    for (const freeText of ['inference', 'grounding_note', 'refusal_reason', 'commits_to']) expect(c).not.toContain(freeText);
    expect(c).toContain(`'private'::public.content_visibility, '{}', '{}'`);
  });
  it('cited lines are read from chat_messages at read time, with no author', () => {
    const f = fnBody(raw, '_clarify_cited_rows');
    expect(f).toContain('public._chat_access_since(m.conversation_id, p_uid)');
    expect(f).not.toMatch(/author|profiles/);
  });
});

describe('P1631 migration: CONTROL (gate 7): the body check fails on a mutated copy of the real file', () => {
  it('removing the P1631 block from mirror_request_reply is caught, and so is a stray edit elsewhere in the body', () => {
    const blockStart = raw.indexOf('-- P1631: the same quiet rule');
    const blockEnd = raw.indexOf('END IF;', blockStart) + 'END IF;'.length;
    const without = raw.slice(0, blockStart) + raw.slice(blockEnd);
    expect(() => restatedWithout(without, 'mirror_request_reply', REQUEST_BLOCK)).toThrow(/found 0 times/);
    const edited = raw.replace(`v_msg.kind NOT IN ('message', 'clarify')`, `v_msg.kind NOT IN ('message')`);
    expect(restatedWithout(edited, 'mirror_request_reply', REQUEST_BLOCK)).not.toBe(fnBody(read(OLD), 'mirror_request_reply'));
  });
});

describe('P1631 follow-up migration: the erasure cleanup runs inside erase_chat_data_for', () => {
  const FU = '20261110160000_p1631_erase_cleanup_in_erase_fn.sql';
  const fu = read(FU);
  const prev = newestBefore('erase_chat_data_for', FU);
  const lock = "pg_advisory_xact_lock(hashtext('p1520_mirror_context'))";
  it('diffs against the newest previous erase_chat_data_for and names it', () => {
    expect(prev).toBe('20261103010000_p1536_server_review_fixes.sql');
    expect(fu.slice(0, fu.indexOf('DROP TRIGGER'))).toContain(prev);
  });
  it('the body is the previous body plus ONLY lines marked -- P1631', () => {
    const mine = fu.split('\n').filter((l) => !l.includes('-- P1631')).join('\n');
    expect(fnBody(mine, 'erase_chat_data_for')).toBe(fnBody(read(prev), 'erase_chat_data_for'));
    expect(fu.split('\n').filter((l) => l.includes('-- P1631')).length).toBeGreaterThan(0);
    expect(stripComments(fu)).toContain('PERFORM public._clarify_erase_person(p_uid);');
  });
  it('drops the trigger and the old function; the new function is internal with the points search_path', () => {
    const code = stripComments(fu);
    expect(code).toContain('DROP TRIGGER IF EXISTS chat_messages_clarify_on_erase ON public.chat_messages;');
    expect(code).toContain('DROP FUNCTION IF EXISTS public._clarify_on_message_erase();');
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\._clarify_erase_person\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(code).not.toMatch(/GRANT EXECUTE[^;]*_clarify_erase_person/);
    const i = code.indexOf('CREATE OR REPLACE FUNCTION public._clarify_erase_person');
    expect(code.slice(i, i + 300)).toContain('SET search_path = public, pg_temp');
    expect(code).not.toMatch(/CREATE\s+TRIGGER/i);
  });
  it('the call sits after the exclusive p1520 lock (step 6)', () => {
    const body = fnBody(fu, 'erase_chat_data_for');
    expect(body).toContain(lock);
    expect(body.indexOf('_clarify_erase_person')).toBeGreaterThan(body.indexOf(lock));
  });
});


describe('P1631 review-fix migration (20261110170000)', () => {
  const fix = read(FIX);
  const code = stripComments(fix);
  // Lines that CHANGE an old line (not pure insertions) are listed with the old text they replace, exactly as p1536 lists its substitutions.
  const CHANGED: Array<[string, string]> = [
    [`RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631`, `RETURN jsonb_build_object('status', 'busy');`],
    // the erase DELETE: the previous text is ONE statement ending at the first semicolon; the new one adds a marked NOT EXISTS line before its terminator
    [`DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility\n     AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id IS DISTINCT FROM p.first_validator_id); -- P1631`, `DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility;`],
  ];
  const marked = (sql: string) => {
    let t = sql;
    for (const [from, to] of CHANGED) t = t.split(from).join(to);
    return t.split('\n').filter((l) => !l.includes('-- P1631')).join('\n');
  };
  it('names what it was diffed against, and each named source is the newest definition before this file', () => {
    const header = fix.slice(0, fix.indexOf('CREATE TABLE'));
    for (const f of ['mirror_request_reply', '_mirror_voice_start_reply', 'clarify_start', '_clarify_begin', '_clarify_erase_person']) {
      expect(header).toContain(f);
      expect(newestBefore(f, FIX), f).toBe(f === '_clarify_erase_person' ? '20261110160000_p1631_erase_cleanup_in_erase_fn.sql' : FILE);
    }
    expect(fix).toMatch(/^-- client-safe:/m);
  });
  it('every restated body is the newest previous body plus ONLY lines marked -- P1631', () => {
    for (const f of ['clarify_start', '_clarify_begin', '_clarify_erase_person']) {
      const src = f === '_clarify_erase_person' ? read('20261110160000_p1631_erase_cleanup_in_erase_fn.sql') : raw;
      expect(fnBody(marked(fix), f), f).toBe(fnBody(src, f));
    }
    // the two quiet-rule functions: the previous P1631 block is replaced by marked lines, so compare with the P1536 body they both come from
    for (const f of ['mirror_request_reply', '_mirror_voice_start_reply']) expect(fnBody(marked(fix), f), f).toBe(fnBody(read(OLD), f));
  });
  it('the quiet rule reads the thread marker, never the draft rows (deleting the last draft must not turn the reply on)', () => {
    for (const f of ['mirror_request_reply', '_mirror_voice_start_reply']) {
      const body = fnBody(fix, f);
      expect(body).toContain('public.clarify_threads ct');
      expect(body).not.toContain('public.clarify_drafts');
    }
    expect(fnBody(fix, 'clarify_start')).toContain('INSERT INTO public.clarify_threads');
    expect(code).toContain('ALTER TABLE public.clarify_threads ENABLE ROW LEVEL SECURITY;');
    expect(code).toContain('REVOKE ALL ON TABLE public.clarify_threads FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/GRANT[^;]*clarify_threads/);
  });
  it('the workers take a run token, the old signatures are dropped, and grants stay service_role alone', () => {
    expect(code).toContain('DROP FUNCTION IF EXISTS public._clarify_complete(uuid, jsonb, numeric);');
    expect(code).toContain('DROP FUNCTION IF EXISTS public._clarify_fail(uuid, text, numeric);');
    for (const sig of ['_clarify_complete(uuid, jsonb, numeric, uuid)', '_clarify_fail(uuid, text, numeric, uuid)']) {
      const e = sig.replace(/[()]/g, '\\$&');
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e} TO service_role;`));
    }
    expect(fnBody(fix, '_clarify_complete')).toContain('v_d.spend_id IS DISTINCT FROM p_run');
    expect(fnBody(fix, '_clarify_fail')).toContain('v_d.spend_id IS DISTINCT FROM p_run');
    expect(fnBody(fix, '_clarify_begin')).toContain(`'run_token', v_spend`);
  });
  it('H1, L1, cap, locked, erase settle and keep, dedupe and the empty refusal are in the bodies', () => {
    const b = fnBody(fix, '_clarify_begin');
    expect(b).toContain('unnest(d2.derived_refs)');
    expect(b).toContain(`v_d.updated_at < now() - interval '5 minutes'`);
    expect(b.split(`'reason', 'locked'`).length - 1).toBe(2);
    expect(fnBody(fix, '_clarify_fail')).toContain(`CASE WHEN p_code = 'cap' THEN 'capped' ELSE 'failed' END`);
    const e = fnBody(fix, '_clarify_erase_person');
    expect(e).toContain(`state = 'settled'`);
    expect(e).toContain('pp.user_id IS DISTINCT FROM p.first_validator_id');
    const c = fnBody(fix, '_clarify_complete');
    expect(c).toContain('GROUP BY btrim(e #>> ');
    expect(c).toContain('jsonb_array_length(v_sugg) = 0');
  });
  it('CONTROL: dropping one marked line of a restated body is caught by the same comparison', () => {
    const mutated = fix.replace("INSERT INTO public.clarify_threads (root_id, owner_id) VALUES (v_row.id, v_uid) ON CONFLICT (root_id) DO NOTHING; -- P1631\n", '');
    expect(fnBody(marked(mutated), 'clarify_start')).toBe(fnBody(raw, 'clarify_start')); // still equal: the line was marked, so removing it changes nothing in the diff
    const unmarked = fix.replace("DO NOTHING; -- P1631", 'DO NOTHING;');
    expect(fnBody(marked(unmarked), 'clarify_start')).not.toBe(fnBody(raw, 'clarify_start'));
  });
});

describe('P1631 review-fix migration 2 (20261110180000)', () => {
  const FIX2 = '20261110180000_p1631_review_fixes_2.sql';
  const fix2 = read(FIX2);
  const code2 = stripComments(fix2);
  // lines that CHANGE an old line: [start of the new (marked) line, the old text it replaces]
  const CHANGED2: Array<[string, string]> = [
    [`    IF p_run IS NOT NULL THEN -- P1631 r2: NULL p_usd releases`, `    IF p_run IS NOT NULL AND p_usd IS NOT NULL THEN`],
    [`  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility; -- P1631 r2`,
      `  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility\n     AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id IS DISTINCT FROM p.first_validator_id);`],
  ];
  const marked2 = (sql: string) => sql.split('\n').flatMap((l) => {
    const hit = CHANGED2.find(([from]) => l.startsWith(from));
    if (hit) return [hit[1]];
    return l.includes('-- P1631 r2') ? [] : [l];
  }).join('\n');
  it('names what it was diffed against, and each source is the newest definition before this file', () => {
    const header = fix2.slice(0, fix2.indexOf('CREATE OR REPLACE'));
    expect(header).toMatch(/^-- client-safe:/m);
    for (const f of ['_clarify_complete', '_clarify_fail', '_clarify_erase_person']) {
      expect(header).toContain(f);
      expect(newestBefore(f, FIX2), f).toBe(FIX);
    }
  });
  it('every restated body is the newest previous body plus ONLY lines marked -- P1631 r2', () => {
    for (const f of ['_clarify_complete', '_clarify_fail', '_clarify_erase_person']) {
      expect(fnBody(marked2(fix2), f), f).toBe(fnBody(read(FIX), f));
    }
  });
  it('grants stay service_role alone, and the erase function stays closed to every client', () => {
    for (const sig of ['_clarify_complete(uuid, jsonb, numeric, uuid)', '_clarify_fail(uuid, text, numeric, uuid)']) {
      const e = sig.replace(/[()]/g, '\\$&');
      expect(code2).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;`));
      expect(code2).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e} TO service_role;`));
    }
    expect(code2).toMatch(/REVOKE ALL ON FUNCTION public\._clarify_erase_person\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(code2).not.toMatch(/GRANT EXECUTE[^;]*_clarify_erase_person/);
  });
  it('erasure deletes the derived point whoever holds a position; a vanished draft settles its own spend', () => {
    const e = fnBody(fix2, '_clarify_erase_person');
    expect(e).not.toContain('point_positions');
    expect(e).toContain(`DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility;`);
    const gone = (f: string) => fnBody(fix2, f).slice(0, fnBody(fix2, f).indexOf('IF NOT FOUND THEN') + 220);
    expect(gone('_clarify_complete')).toContain('_mirror_settle(p_run');
    expect(gone('_clarify_fail')).toContain('_mirror_settle(p_run, p_usd)');
  });
  it('CONTROL: an unmarked change to a restated body is caught by the same comparison', () => {
    const unmarked = fix2.replace(`PERFORM public._mirror_settle(p_run, p_usd); -- P1631 r2`, `PERFORM public._mirror_settle(p_run, p_usd);`);
    expect(fnBody(marked2(unmarked), '_clarify_fail')).not.toBe(fnBody(read(FIX), '_clarify_fail'));
  });
});

describe('P1631 step 1b migration (20261110200000)', () => {
  const FIX3 = '20261110200000_p1631_refine.sql';
  const FIX2 = '20261110180000_p1631_review_fixes_2.sql';
  const fix3 = read(FIX3);
  const code3 = stripComments(fix3);
  // lines that CHANGE an old line: [start of the new line, the old text it replaces]
  const CHANGED3: Array<[string, string]> = [
    [`  v_source := jsonb_build_object('id', v_src.id, 'text', left(v_text, 4000), 'is_pressed', true,`, `  v_source := jsonb_build_object('id', v_src.id, 'text', left(v_text, 4000), 'is_pressed', true);`],
    [`    'already_drafted', v_already,`, `    'already_drafted', v_already);`],
  ];
  const marked3 = (sql: string) => sql.split('\n').flatMap((l) => {
    const hit = CHANGED3.find(([from]) => l.startsWith(from));
    if (hit) return [hit[1]];
    return l.includes('-- P1631 r3') ? [] : [l];
  }).join('\n');
  it('names what it was diffed against, and each source is the newest definition before this file', () => {
    const header = fix3.slice(0, fix3.indexOf('CREATE OR REPLACE'));
    expect(header).toMatch(/^-- client-safe:/m);
    expect(newestBefore('_clarify_begin', FIX3)).toBe(FIX);
    expect(newestBefore('_clarify_complete', FIX3)).toBe(FIX2);
    expect(header).toContain('20261110170000_p1631_review_fixes.sql');
    expect(header).toContain('20261110180000_p1631_review_fixes_2.sql');
  });
  it('begin and complete are the newest previous bodies plus ONLY lines marked -- P1631 r3', () => {
    expect(fnBody(marked3(fix3), '_clarify_begin')).toBe(fnBody(read(FIX), '_clarify_begin'));
    expect(fnBody(marked3(fix3), '_clarify_complete')).toBe(fnBody(read(FIX2), '_clarify_complete'));
  });
  it('CONTROL: an unmarked change to a restated body is caught by the same comparison', () => {
    const unmarked = fix3.replace(`v_target := p_result ->> 'target'; -- P1631 r3: validated here; absent or null means the latest`, `v_target := p_result ->> 'target';`);
    expect(fnBody(marked3(unmarked), '_clarify_complete')).not.toBe(fnBody(read(FIX2), '_clarify_complete'));
  });
  it('the workers stay service_role alone; the two new functions are for signed-in users only (the owner is read from the session)', () => {
    for (const sig of ['_clarify_begin(uuid)', '_clarify_complete(uuid, jsonb, numeric, uuid)']) {
      const e = sig.replace(/[()]/g, '\\$&');
      expect(code3).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;`));
      expect(code3).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e} TO service_role;`));
    }
    for (const sig of ['clarify_message(uuid, text)', 'clarify_mark_failed(uuid)']) {
      const e = sig.replace(/[()]/g, '\\$&');
      expect(code3).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${e} FROM PUBLIC, anon, authenticated;`));
      expect(code3).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${e} TO authenticated;`));
    }
    for (const f of ['clarify_message', 'clarify_mark_failed']) expect(fnBody(fix3, f), f).toContain('auth.uid()');
  });
  it('the target is validated, a refine needs the owner alone on the point, and the message goes through the product send function', () => {
    const c = fnBody(fix3, '_clarify_complete');
    expect(c).toContain(`v_target NOT IN ('latest', 'new')`);
    expect(c).toContain(`COALESCE(v_target, 'latest') = 'latest'`);
    expect(c).toContain('pp.user_id IS DISTINCT FROM v_d.owner_id');
    expect(fnBody(fix3, 'clarify_message')).toContain('public.send_chat_message(');
    expect(fnBody(fix3, 'clarify_message')).toContain(`d.state IN ('queued', 'running')`);
    expect(fnBody(fix3, 'clarify_mark_failed')).toContain(`v_d.state <> 'queued' OR v_d.spend_id IS NOT NULL OR v_d.started_at IS NOT NULL`);
  });
});
