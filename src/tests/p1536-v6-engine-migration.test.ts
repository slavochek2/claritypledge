/**
 * @file p1536-v6-engine-migration.test.ts
 * @description P1536 Design v6 (S1 + S5) source contract for migration 20261030080000_p1536_v6_engine.sql:
 *   - every body it replaces is its LATEST previous body plus only the edits listed here, and its newest definition
 *     anywhere is this file: get_canvas, _mirror_limits, erase_chat_data_for, and the four earlier functions that gain one
 *     guard against a v6 draft (canvas_draft_publish(uuid), canvas_draft_discard(uuid), the 4-argument
 *     _canvas_draft_run_begin, the 6-argument _canvas_draft_run_complete). The 4-argument _canvas_draft_run_fail is NOT
 *     replaced: a 5-argument overload is added;
 *   - the functions other P1536 migrations edited (erase_chat_data_for, forward_chat_message, mirror_request_reply,
 *     _mirror_voice_start_reply) still carry those edits in their NEWEST definition across all migrations;
 *   - the new tables are closed to every client, the client functions are granted to authenticated alone, the workers
 *     to service_role alone, and the only anon grant is get_canvas;
 *   - lock order (owner lock, expire step, draft row, run row), the refusal codes, the 30-run cap, the retention rule;
 *   - the v6 completion never calls the clear function.
 * Epistemic gate 7: the last block runs each fact against a mutated copy of the real file and shows it fail.
 * The behaviour itself is proved on the test database by src/tests/integration/p1536-v6-engine.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const A = '20261029100000_p1536_canvas_draft_versions.sql';
const B = '20261029100100_p1536_canvas_draft_runs.sql';
const C = '20261029100200_p1536_reword_keeps_stories.sql';
const M = '20261030080000_p1536_v6_engine.sql';
const MERGE = '20261030090000_p1536_p1592_merge_erase_forward.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function fnBody(sql: string, name: string, nth = 0): string {
  const code = stripComments(sql);
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, 'g');
  const hits = [...code.matchAll(re)];
  if (hits.length <= nth) throw new Error(`${name} (#${nth}) not found`);
  const a = hits[nth]!.index!;
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
/** The newest migration (any file) that defines `name`. */
function newestDefinition(name: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && re.test(stripComments(read(f)))).sort();
  if (defs.length === 0) throw new Error(`${name} has no definition`);
  return defs[defs.length - 1]!;
}

const rawM = read(M);

// ----------------------------------------------------------------------------------------------------------------
// The replaced bodies: the source plus exactly these edits.
// ----------------------------------------------------------------------------------------------------------------
const GUARD = (use: string) => `IF public._canvas_draft_is_v6(v_d.id) THEN RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use ${use}' USING ERRCODE = '55000'; END IF;`;
type Replaced = { source: string; edits: Array<[string, string]>; fn?: string; nth?: number };
const REPLACED: Record<string, Replaced> = {
  _mirror_limits: {
    source: B,
    edits: [
      [`'person_canvas_daily_usd', 3.00,`, `'person_canvas_daily_usd', 6.00,`],
      [`'person_canvas_daily_count', 20,`, `'person_canvas_daily_count', 60,`],
      [`'global_canvas_daily_usd', 15.00,`, `'global_canvas_daily_usd', 45.00,`],
    ],
  },
  get_canvas: {
    source: A,
    edits: [
      [`'created_at', v.created_at) || CASE WHEN v.published_at IS NULL`,
       `'created_at', v.created_at, 'from_seq', v.from_seq) || CASE WHEN v.published_at IS NULL`],
      [`'run_count', d.run_count, 'tension_count', d.tension_count)`,
       `'run_count', d.run_count, 'tension_count', d.tension_count,
        'revision', d.revision, 'focus', d.focus,
        'changed_boxes', to_jsonb(public._canvas_draft_changed_boxes(d.id)))`],
    ],
  },
  // the earlier P1536 functions: their latest body plus ONE guard that refuses a v6 draft
  'canvas_draft_publish(uuid)': {
    source: A, fn: 'canvas_draft_publish', nth: 1,
    edits: [[`IF v_d.state <> 'open' THEN RAISE EXCEPTION 'this draft is closed' USING ERRCODE = '55000'; END IF;`,
             `${GUARD('canvas_draft_publish(draft, expected revision)')} IF v_d.state <> 'open' THEN RAISE EXCEPTION 'this draft is closed' USING ERRCODE = '55000'; END IF;`]],
  },
  'canvas_draft_discard(uuid)': {
    source: A, fn: 'canvas_draft_discard', nth: 1,
    edits: [[`IF v_d.state <> 'open' THEN RETURN false; END IF;`,
             `${GUARD('canvas_draft_discard(draft, expected revision)')} IF v_d.state <> 'open' THEN RETURN false; END IF;`]],
  },
  '_canvas_draft_run_begin(4 args)': {
    source: B, fn: '_canvas_draft_run_begin', nth: 1,
    edits: [[`IF p_kind = 'tensions' AND v_d.base_version_id IS NULL THEN`,
             `${GUARD('_canvas_draft_run_begin(run, owner)')} IF p_kind = 'tensions' AND v_d.base_version_id IS NULL THEN`]],
  },
  '_canvas_draft_run_complete(6 args)': {
    source: C, fn: '_canvas_draft_run_complete', nth: 1,
    edits: [[`IF v_run.id IS NOT NULL AND v_run.state = 'cancelled' THEN`,
             `${GUARD('_canvas_draft_run_complete(run, owner, ...)')} IF v_run.id IS NOT NULL AND v_run.state = 'cancelled' THEN`]],
  },
  // erase_chat_data_for: before anything else it takes the engine's per-owner advisory locks (the erased user's and every
  // affected owner's, one sorted set); right after the step-6 context lock it locks the affected draft rows; every P1536 edit
  // stays and step 7 is untouched
  erase_chat_data_for: {
    source: B,
    edits: [
      [`pass integer; BEGIN`, `pass integer; v_o record; BEGIN`],
      [`IF p_uid IS NULL THEN RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023'; END IF;`,
       `IF p_uid IS NULL THEN RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023'; END IF;
        FOR v_o IN
          SELECT x.owner_id FROM (
            SELECT p_uid AS owner_id
            UNION
            SELECT d.owner_id FROM public.canvas_drafts d
              WHERE d.tension_refs @> ARRAY[v_ref] OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
          ) x
          ORDER BY x.owner_id
        LOOP PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0)); END LOOP;`],
      [`PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));`,
       `PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));
        PERFORM 1 FROM public.canvas_drafts d
          WHERE d.tension_refs @> ARRAY[v_ref] OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
          ORDER BY d.id FOR UPDATE;`],
      [`UPDATE public.canvas_draft_runs r SET state = 'cancelled', error_code = 'erased', finished_at = now() WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];`,
       `UPDATE public.canvas_drafts d SET revision = d.revision + 1
          WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]
                           AND r.kind IN ('message', 'focus', 'fork_first'));
        UPDATE public.canvas_draft_runs r SET state = 'cancelled', error_code = 'erased', finished_at = now() WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];`],
    ],
  },
};

describe('P1536 v6 migration: header', () => {
  it('carries client-safe, diffed-against and new-function annotations, and names every replaced function next to its source', () => {
    expect(rawM).toMatch(/^-- client-safe:/m);
    expect(rawM).toMatch(/diffed against/);
    expect(rawM).toMatch(/new function/);
    const header = rawM.slice(0, rawM.indexOf('BEGIN;'));
    for (const [name, r] of Object.entries(REPLACED)) {
      expect(header, `${name}: source`).toContain(r.source);
      expect(header, `${name}: named`).toContain(r.fn ?? name);
    }
  });
});

describe('P1536 v6 migration: replaced bodies', () => {
  it.each(Object.keys(REPLACED))('%s is its LATEST previous body plus only the edits listed in this test', (name) => {
    const r = REPLACED[name]!;
    expect(fnBody(rawM, r.fn ?? name, r.nth ?? 0)).toBe(patched(r.source, r.fn ?? name, r.edits));
  });
  it.each(Object.keys(REPLACED))('%s: the source named is the newest definition before this file, and this file is the newest of all', (name) => {
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${REPLACED[name]!.fn ?? name}\\s*\\(`, 'i');
    const before = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < M && re.test(stripComments(read(f)))).sort();
    expect(before[before.length - 1]).toBe(REPLACED[name]!.source);
    // erase_chat_data_for is restated once more by the merge file (P1536 + P1592); every other function ends here
    expect(newestDefinition(REPLACED[name]!.fn ?? name)).toBe((REPLACED[name]!.fn ?? name) === 'erase_chat_data_for' ? MERGE : M);
  });
  it('the earlier 4-argument _canvas_draft_run_fail is NOT redefined; the v6 five-argument form checks the owner, the state and settles the spend', () => {
    expect(stripComments(rawM)).not.toMatch(/FUNCTION public\._canvas_draft_run_fail\(p_run uuid, p_code text/);
    const now = fnBody(rawM, '_canvas_draft_run_fail');
    for (const keep of [
      `NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner`,
      `IF v_run.state = 'cancelled' THEN PERFORM public._mirror_settle(v_run.spend_id, p_actual_usd);`,
      `IF v_run.state <> 'running' THEN RETURN false; END IF;`,
      `state = 'failed', error_code = left(COALESCE(NULLIF(p_code, ''), 'error'), 40), finished_at = now()`,
      `_canvas_draft_post_reply(`, `PERFORM public._canvas_draft_expire(v_run.owner_id);`, `revision = d.revision + 1`,
    ]) expect(now, keep).toContain(norm(keep));
    expect(rawM).toMatch(/REVOKE ALL ON FUNCTION public\._canvas_draft_run_fail\(uuid, uuid, text, text, numeric\) FROM PUBLIC, anon, authenticated;/);
    expect(rawM).toMatch(/GRANT EXECUTE ON FUNCTION public\._canvas_draft_run_fail\(uuid, uuid, text, text, numeric\) TO service_role;/);
  });
  it('get_canvas keeps its grants exactly (the only anon grant of the file)', () => {
    const code = stripComments(rawM);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_canvas\(uuid, text, text, text\) FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_canvas\(uuid, text, text, text\) TO anon, authenticated;/);
  });
});

// A LATER migration that rebuilds one of these functions from an older body silently drops P1536's change (the bug the
// P1576 rebase hit, and the one another feature's migration now causes on the shared test database). The newest definition
// anywhere must still carry every P1536 edit.
describe('P1536 edits survive in the NEWEST definition of every function P1536 changed elsewhere', () => {
  const MARKERS: Record<string, string[]> = {
    erase_chat_data_for: [`'canvas_draft_runs_cancelled'`, `'canvas_drafts_scrubbed'`, `public.canvas_draft_runs r SET state = 'cancelled'`],
    forward_chat_message: [`IF v_src.attachment_kind = 'canvas_version' THEN`],
    mirror_request_reply: [`FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id)`, `v_msg.audio_duration_ms IS NOT NULL`],
    _mirror_voice_start_reply: [`FROM public.canvas_drafts d WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)`],
  };
  it.each(Object.keys(MARKERS))('%s', (name) => {
    const newest = newestDefinition(name);
    const body = fnBody(read(newest), name);
    for (const m of MARKERS[name]!) expect(body, `${name} in ${newest}`).toContain(norm(m));
  });
});

// P1592 (event transcripts in round threads, branch feature/p1592-event-transcripts-round-threads) restates the same two
// functions from the same older body. The merge file is the newest definition of both and must hold a marker from EACH side.
// The P1592 markers are pinned as literals: they are copied from that branch's 20261029180000_p1592_event_transcripts_round_threads.sql
// (erase_chat_data_for steps 0 and 7, forward_chat_message's snapshot allowlist), which this tree does not contain.
describe('P1536 + P1592: the newest erase_chat_data_for and forward_chat_message carry both features\' edits', () => {
  const P1536_MARKERS: Record<string, string[]> = {
    erase_chat_data_for: [
      `PERFORM public._erase_lock_canvas_owners(p_uid);`,
      `SET revision = d.revision + 1`,
      `public.canvas_draft_runs r SET state = 'cancelled'`,
      `'canvas_drafts_scrubbed'`,
    ],
    forward_chat_message: [`IF v_src.attachment_kind = 'canvas_version' THEN RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023'; END IF;`],
  };
  const P1592_MARKERS: Record<string, string[]> = {
    erase_chat_data_for: [
      `pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0))`,
      `'p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text`,
      `PERFORM public._transcribe_retitle_thread(v_th.id);`,
      `'chat_round_threads_retitled'`,
    ],
    forward_chat_message: [
      `CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END`,
      `'is_transcription', v_src.is_transcription`,
      `'system_kind', v_src.system_kind`,
    ],
  };
  const missing = (body: string, markers: string[]) => markers.filter((m) => !body.includes(norm(m)));
  it.each(Object.keys(P1592_MARKERS))('%s: the newest definition holds every P1536 marker and every P1592 marker', (name) => {
    const newest = newestDefinition(name);
    const body = fnBody(read(newest), name);
    expect(newest).toBe(MERGE);
    expect(missing(body, P1536_MARKERS[name]!), `${name}: P1536 markers missing in ${newest}`).toEqual([]);
    expect(missing(body, P1592_MARKERS[name]!), `${name}: P1592 markers missing in ${newest}`).toEqual([]);
  });
  it('CONTROL: removing any one P1592 marker, or any one P1536 marker, from the newest body makes the check fail', () => {
    for (const name of Object.keys(P1592_MARKERS)) {
      const body = fnBody(read(newestDefinition(name)), name);
      for (const [side, table] of [['P1592', P1592_MARKERS], ['P1536', P1536_MARKERS]] as const) {
        for (const m of table[name]!) {
          const mutated = body.split(norm(m)).join('');
          expect(mutated, `${name}: ${side} marker not present once to remove: ${m}`).not.toBe(body);
          expect(missing(mutated, table[name]!), `${name}: dropping the ${side} marker must be caught`).toContain(m);
        }
      }
    }
  });
});

// ----------------------------------------------------------------------------------------------------------------
// Whole-delta parity, lock order and grants of the merge file. Markers alone let a statement inside a delta disappear
// (a mutation that deleted the round-thread member DELETE, or the draft FOR UPDATE block, stayed green), so each side's
// delta is pinned as an exact comment-stripped, whitespace-normalized substring of the NEWEST body.
// ----------------------------------------------------------------------------------------------------------------
/** The LAST definition of a function in a file: PostgreSQL installs the last CREATE OR REPLACE of a signature. */
function fnBodyLast(sql: string, name: string): string {
  const n = [...stripComments(sql).matchAll(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, 'g'))].length;
  return fnBody(sql, name, n - 1);
}
/** Splits SQL (comments already stripped) into normalized top-level statements. A dollar-quoted body (and a single-quoted
 *  string) is skipped over, not removed: its semicolons do not end a statement, and its text stays in the statement. */
function topLevelStatements(code: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === "'") {
      const end = code.indexOf("'", i + 1);
      i = end === -1 ? code.length : end + 1;
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(code.slice(i));
      if (tag) {
        const end = code.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? code.length : end + tag[0].length;
      } else i += 1;
    } else if (ch === ';') {
      out.push(norm(code.slice(start, i)));
      start = ++i;
    } else i += 1;
  }
  const rest = norm(code.slice(start));
  if (rest) out.push(rest);
  return out.filter((t) => t.length > 0);
}
const P1592_SRC = 'w5 commit 9dff3211c, supabase/migrations/20261029180000_p1592_event_transcripts_round_threads.sql (forward_chat_message is the same as in 38686306e and 3678c2b76)';
const P1536_SRC = 'this tree: erase_chat_data_for from 20261030080000_p1536_v6_engine.sql, forward_chat_message from 20261029100000_p1536_canvas_draft_versions.sql';
// Literals copied from P1592_SRC (comments stripped, whitespace collapsed).
const P1592_HUNKS = {
  erase: [
    "v_threads uuid[]; v_th public.chat_round_threads; v_key record;",
    "PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));",
    "PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0)); FOR v_key IN SELECT k.round_id, k.table_no FROM ( SELECT t.round_id, t.table_no FROM public.chat_round_threads t JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid UNION SELECT s.round_id, s.table_no FROM public.event_round_seats s JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid ) k ORDER BY k.round_id, k.table_no LOOP PERFORM pg_advisory_xact_lock( hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0)); END LOOP; SELECT COALESCE(array_agg(x.id ORDER BY x.round_id, x.table_no), '{}') INTO v_threads FROM ( SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid UNION SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t JOIN public.event_round_seats s ON s.round_id = t.round_id AND s.table_no = t.table_no JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid ) x;",
    "FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid; PERFORM public._transcribe_retitle_thread(v_th.id); END LOOP; v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));",
  ],
  forward: [
    "v_snapshot := jsonb_build_object( 'author_name', v_author, 'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END, 'created_at', v_src.created_at, 'is_transcription', v_src.is_transcription, 'system_kind', v_src.system_kind);",
  ],
};
// Literals copied from P1536_SRC.
const P1536_HUNKS = {
  // the call that replaced the owner-lock loop in erase_chat_data_for (the loop itself moved into the helper below)
  helperLoop: "FOR v_o IN SELECT x.owner_id FROM ( SELECT p_uid AS owner_id UNION SELECT d.owner_id FROM public.canvas_drafts d WHERE d.tension_refs @> ARRAY[v_ref] OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]) ) x ORDER BY x.owner_id LOOP PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0)); END LOOP;",
  erase: [
    "PERFORM public._erase_lock_canvas_owners(p_uid);",
    "PERFORM 1 FROM public.canvas_drafts d WHERE d.tension_refs @> ARRAY[v_ref] OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]) ORDER BY d.id FOR UPDATE;",
    "UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref] AND r.kind IN ('message', 'focus', 'fork_first')); UPDATE public.canvas_draft_runs r SET state = 'cancelled', error_code = 'erased', finished_at = now() WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]; GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_runs_cancelled', n); UPDATE public.canvas_drafts d SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}' WHERE d.tension_refs @> ARRAY[v_ref] OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id AND r.derived_refs @> ARRAY[v_ref]); GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_drafts_scrubbed', n);",
  ],
  forward: [
    "IF v_src.attachment_kind = 'canvas_version' THEN RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023'; END IF;",
  ],
};
// The helper's complete body: the owner-lock loop of the v6 erase_chat_data_for (loop literal above), moved unchanged.
const P1536_HELPER = "CREATE OR REPLACE FUNCTION public._erase_lock_canvas_owners(p_uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ DECLARE v_ref text := public._chat_author_ref(p_uid); v_o record; BEGIN IF p_uid IS NULL THEN RAISE EXCEPTION '_erase_lock_canvas_owners: no subject' USING ERRCODE = '22023'; END IF; FOR v_o IN SELECT x.owner_id FROM ( SELECT p_uid AS owner_id UNION SELECT d.owner_id FROM public.canvas_drafts d WHERE d.tension_refs @> ARRAY[v_ref] OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]) ) x ORDER BY x.owner_id LOOP PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0)); END LOOP; END; $$;";
// What erase_my_account gains: the erasing marker, then the helper, before its first mutation.
const P1536_EAM_LOCKS = "PERFORM pg_advisory_xact_lock(hashtextextended('p1536:erasure', 0)); PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || v_uid::text, 0)); PERFORM public._erase_lock_canvas_owners(v_uid);";
// What erase_chat_data_for gains first: the global one-erasure-at-a-time lock (it sits before P1592's erasing marker).
const P1536_ERASURE_LOCK = "PERFORM pg_advisory_xact_lock(hashtextextended('p1536:erasure', 0));";
// P1592's COMPLETE bodies, comment-stripped, one source line per element. Copied from w5 commit 9dff3211c (the newest P1592
// commit when this was written), supabase/migrations/20261029180000_p1592_event_transcripts_round_threads.sql. forward_chat_message
// is identical in 38686306e (P1592 review round 1), 3678c2b76 and 9dff3211c; it differs from the first P1592 commit 00d6daf24 (round 1 added the
// bare round-thread root title).
const P1592_FULL = {
  erase: [
    "CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)",
    "RETURNS jsonb",
    "LANGUAGE plpgsql",
    "SECURITY DEFINER",
    "SET search_path = ''",
    "AS $$",
    "DECLARE",
    "v_out jsonb := '{}'::jsonb;",
    "v_ref text := public._chat_author_ref(p_uid);",
    "n integer;",
    "pass integer;",
    "v_threads uuid[];",
    "v_th public.chat_round_threads;",
    "v_key record;",
    "BEGIN",
    "IF p_uid IS NULL THEN",
    "RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';",
    "END IF;",
    "PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));",
    "PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0));",
    "FOR v_key IN",
    "SELECT k.round_id, k.table_no FROM (",
    "SELECT t.round_id, t.table_no FROM public.chat_round_threads t",
    "JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid",
    "UNION",
    "SELECT s.round_id, s.table_no FROM public.event_round_seats s",
    "JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid",
    ") k ORDER BY k.round_id, k.table_no",
    "LOOP",
    "PERFORM pg_advisory_xact_lock(",
    "hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0));",
    "END LOOP;",
    "SELECT COALESCE(array_agg(x.id ORDER BY x.round_id, x.table_no), '{}') INTO v_threads FROM (",
    "SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t",
    "JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid",
    "UNION",
    "SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t",
    "JOIN public.event_round_seats s ON s.round_id = t.round_id AND s.table_no = t.table_no",
    "JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid",
    ") x;",
    "DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);",
    "UPDATE public.chat_messages m",
    "SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),",
    "attachment_kind = NULL, attachment_id = NULL,",
    "forward_snapshot = NULL, forward_author_id = NULL,",
    "author_id = NULL",
    "WHERE m.author_id = p_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);",
    "FOR pass IN 1..2 LOOP",
    "UPDATE public.chat_messages m",
    "SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),",
    "'{body}', 'null'::jsonb),",
    "attachment_kind = NULL, attachment_id = NULL,",
    "forward_author_id = NULL",
    "WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);",
    "UPDATE public.chat_messages m",
    "SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (",
    "SELECT COALESCE(jsonb_agg(",
    "CASE WHEN t.e ->> 'author_ref' = v_ref",
    "THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)",
    "ELSE t.e END",
    "ORDER BY t.ord), '[]'::jsonb)",
    "FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))",
    "WHERE m.forward_snapshot IS NOT NULL",
    "AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',",
    "jsonb_build_object('ref', v_ref));",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);",
    "UPDATE public.chat_messages m",
    "SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',",
    "to_jsonb('Deleted user'::text))",
    "WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;",
    "END LOOP;",
    "DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;",
    "DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;",
    "DELETE FROM public.chat_conversations c",
    "WHERE c.kind = 'dm'",
    "AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));",
    "UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;",
    "PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));",
    "UPDATE public.mirror_jobs j",
    "SET state = 'cancelled', error_code = 'erased', finished_at = now()",
    "WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);",
    "UPDATE public.chat_messages m",
    "SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL",
    "WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);",
    "FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP",
    "DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;",
    "PERFORM public._transcribe_retitle_thread(v_th.id);",
    "END LOOP;",
    "v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));",
    "RETURN v_out;",
    "END;",
    "$$;",
  ],
  forward: [
    "CREATE OR REPLACE FUNCTION public.forward_chat_message(",
    "p_source uuid,",
    "p_target_conversation uuid,",
    "p_note text DEFAULT NULL,",
    "p_client_id uuid DEFAULT NULL",
    ")",
    "RETURNS public.chat_messages",
    "LANGUAGE plpgsql",
    "SECURITY DEFINER",
    "SET search_path = ''",
    "AS $$",
    "DECLARE",
    "v_uid uuid := auth.uid();",
    "v_src public.chat_messages;",
    "v_author text;",
    "v_note text;",
    "v_snapshot jsonb;",
    "v_orig_id uuid;",
    "v_since timestamptz;",
    "v_row public.chat_messages;",
    "BEGIN",
    "IF v_uid IS NULL THEN",
    "RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';",
    "END IF;",
    "PERFORM public._chat_assert_can_post(p_target_conversation, v_uid);",
    "v_since := public._chat_access_since(p_target_conversation, v_uid);",
    "IF p_client_id IS NOT NULL THEN",
    "SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;",
    "IF FOUND THEN",
    "IF v_row.conversation_id <> p_target_conversation THEN",
    "RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';",
    "END IF;",
    "IF v_row.created_at < v_since THEN",
    "RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';",
    "END IF;",
    "RETURN v_row;",
    "END IF;",
    "END IF;",
    "SELECT m.* INTO v_src FROM public.chat_messages m",
    "WHERE m.id = p_source",
    "AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)",
    "FOR SHARE;",
    "IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN",
    "RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';",
    "END IF;",
    "v_note := NULLIF(btrim(COALESCE(p_note, '')), '');",
    "IF char_length(v_note) > 4000 THEN",
    "RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';",
    "END IF;",
    "IF v_src.kind = 'message' THEN",
    "SELECT COALESCE(p.name, 'Deleted user') INTO v_author",
    "FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;",
    "v_snapshot := jsonb_build_object(",
    "'author_name', v_author,",
    "'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,",
    "'created_at', v_src.created_at,",
    "'is_transcription', v_src.is_transcription,",
    "'system_kind', v_src.system_kind);",
    "v_orig_id := v_src.author_id;",
    "ELSE",
    "v_snapshot := public._chat_forward_snapshot(v_src.forward_snapshot);",
    "v_orig_id := v_src.forward_author_id;",
    "END IF;",
    "INSERT INTO public.chat_messages",
    "(conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,",
    "forwarded_from_message_id, attachment_kind, attachment_id, client_id, created_at)",
    "VALUES",
    "(p_target_conversation, v_uid, v_note, 'forward', v_snapshot, v_orig_id,",
    "v_src.id, v_src.attachment_kind, v_src.attachment_id, p_client_id, clock_timestamp())",
    "ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING",
    "RETURNING * INTO v_row;",
    "IF NOT FOUND THEN",
    "SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;",
    "IF v_row.conversation_id <> p_target_conversation THEN",
    "RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';",
    "END IF;",
    "IF v_row.created_at < v_since THEN",
    "RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';",
    "END IF;",
    "RETURN v_row;",
    "END IF;",
    "UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_target_conversation;",
    "RETURN v_row;",
    "END;",
    "$$;",
  ],
};
const P1592_EAM_FULL = [
    "CREATE OR REPLACE FUNCTION public.erase_my_account()",
    "RETURNS jsonb",
    "LANGUAGE plpgsql",
    "SECURITY DEFINER",
    "SET search_path = ''",
    "AS $$",
    "DECLARE",
    "v_uid uuid := auth.uid();",
    "v_name text;",
    "v_email text;",
    "v_slug text;",
    "v_tomb constant text := 'Deleted user';",
    "v_tomb_email constant text := 'deleted-user@invalid';",
    "v_sessions uuid[] := '{}';",
    "v_same_name uuid[] := '{}';",
    "v_counterparts uuid[];",
    "v_their_stories uuid[];",
    "v_out jsonb := '{}'::jsonb;",
    "n integer;",
    "s record;",
    "v_my_name text;",
    "v_other_name text;",
    "BEGIN",
    "IF v_uid IS NULL THEN",
    "RAISE EXCEPTION 'erase_my_account: not authenticated' USING ERRCODE = '42501';",
    "END IF;",
    "SELECT p.name, p.email, p.slug INTO v_name, v_email, v_slug FROM public.profiles p WHERE p.id = v_uid;",
    "IF v_name IS NOT NULL THEN",
    "PERFORM 1 FROM public.clarity_sessions",
    "WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid",
    "FOR UPDATE;",
    "SELECT COALESCE(array_agg(id), '{}') INTO v_sessions",
    "FROM public.clarity_sessions",
    "WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid;",
    "UPDATE public.clarity_agreements",
    "SET status = 'terminated',",
    "terminated_at = COALESCE(terminated_at, now()),",
    "terminated_by = NULL,",
    "partner_profile_id = NULL,",
    "partner_email = v_tomb_email,",
    "partner_display_name = v_tomb",
    "WHERE partner_profile_id = v_uid",
    "OR (partner_profile_id IS NULL AND lower(partner_email) = lower(v_email));",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_anonymised', n);",
    "DELETE FROM public.clarity_agreements WHERE creator_profile_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_deleted', n);",
    "SELECT array_agg(DISTINCT x) INTO v_counterparts",
    "FROM (SELECT speaker_id AS x FROM public.story_verifications WHERE listener_id = v_uid",
    "UNION",
    "SELECT listener_id AS x FROM public.story_verifications WHERE speaker_id = v_uid) q",
    "WHERE x <> v_uid;",
    "SELECT array_agg(DISTINCT sv.story_id) INTO v_their_stories",
    "FROM public.story_verifications sv",
    "JOIN public.stories st ON st.id = sv.story_id",
    "WHERE (sv.speaker_id = v_uid OR sv.listener_id = v_uid)",
    "AND st.author_id <> v_uid;",
    "DELETE FROM public.story_verifications WHERE speaker_id = v_uid OR listener_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('verifications_deleted', n);",
    "UPDATE public.profiles p",
    "SET ears_count = (SELECT count(DISTINCT sv.speaker_id) FROM public.story_verifications sv",
    "WHERE sv.listener_id = p.id AND sv.accuracy_achieved),",
    "verification_session_count =",
    "(SELECT count(*) FROM public.story_verifications sv WHERE sv.listener_id = p.id)",
    "+ (SELECT count(*) FROM public.story_verifications sv",
    "WHERE sv.speaker_id = p.id AND sv.speaker_id <> sv.listener_id)",
    "WHERE p.id = ANY(COALESCE(v_counterparts, '{}'::uuid[]));",
    "UPDATE public.stories st",
    "SET understood_count = (SELECT count(DISTINCT sv.listener_id) FROM public.story_verifications sv",
    "WHERE sv.story_id = st.id AND sv.accuracy_achieved)",
    "WHERE st.id = ANY(COALESCE(v_their_stories, '{}'::uuid[]));",
    "UPDATE public.clarity_sessions SET source_letter_id = NULL",
    "WHERE source_letter_id IN (SELECT id FROM public.clarity_letters WHERE sender_id = v_uid);",
    "DELETE FROM public.story_explain_backs WHERE recorder_id = v_uid;",
    "DELETE FROM public.clarity_letters WHERE sender_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('letters_deleted', n);",
    "DELETE FROM public.clarity_docs WHERE owner_id = v_uid;",
    "DELETE FROM public.letter_point_responses",
    "WHERE delivery_id IN (SELECT id FROM public.letter_deliveries WHERE receiver_profile_id = v_uid);",
    "UPDATE public.letter_deliveries",
    "SET receiver_profile_id = NULL, receiver_email = NULL, receiver_name = v_tomb",
    "WHERE receiver_profile_id = v_uid",
    "OR (receiver_email IS NOT NULL AND lower(receiver_email) = lower(v_email));",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('deliveries_anonymised', n);",
    "DELETE FROM public.clarity_sessions",
    "WHERE id = ANY(v_sessions) AND creator_profile_id = v_uid",
    "AND joiner_profile_id IS NULL AND joiner_name IS NULL;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('solo_sessions_deleted', n);",
    "DELETE FROM public.session_transcripts WHERE session_id = ANY(v_sessions);",
    "DELETE FROM public.transcription_jobs WHERE session_id = ANY(v_sessions);",
    "FOR s IN",
    "SELECT id, code, creator_profile_id, joiner_profile_id, creator_name, joiner_name, live_state",
    "FROM public.clarity_sessions",
    "WHERE id = ANY(v_sessions)",
    "LOOP",
    "IF s.creator_profile_id = v_uid THEN",
    "v_my_name := s.creator_name; v_other_name := s.joiner_name;",
    "ELSIF s.joiner_profile_id = v_uid THEN",
    "v_my_name := s.joiner_name; v_other_name := s.creator_name;",
    "ELSE",
    "v_my_name := NULL; v_other_name := NULL;",
    "END IF;",
    "IF v_my_name IS NOT NULL AND v_my_name IS NOT DISTINCT FROM v_other_name THEN",
    "v_same_name := v_same_name || s.id;",
    "ELSIF v_my_name IS NOT NULL THEN",
    "DELETE FROM public.clarity_verifications v",
    "USING public.clarity_chat_messages m",
    "WHERE v.message_id = m.id AND m.session_id = s.id AND v.verifier_name = v_my_name;",
    "DELETE FROM public.clarity_chat_messages WHERE session_id = s.id AND author_name = v_my_name;",
    "DELETE FROM public.clarity_ideas WHERE session_id = s.id AND author_name = v_my_name;",
    "DELETE FROM public.clarity_live_turns WHERE session_id = s.id AND actor_name = v_my_name;",
    "UPDATE public.clarity_live_turns",
    "SET speaker_name = CASE WHEN speaker_name = v_my_name THEN v_tomb ELSE speaker_name END,",
    "listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END",
    "WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);",
    "UPDATE public.clarity_demo_rounds",
    "SET speaker_name = CASE WHEN speaker_name = v_my_name THEN v_tomb ELSE speaker_name END,",
    "listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END",
    "WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);",
    "DELETE FROM public.ml_training_sessions WHERE session_code = s.code AND user_name = v_my_name;",
    "END IF;",
    "UPDATE public.clarity_sessions",
    "SET live_state = public._p520_scrub_live_state(live_state, COALESCE(v_my_name, v_name), v_slug, v_tomb)",
    "WHERE id = s.id AND live_state IS NOT NULL;",
    "END LOOP;",
    "UPDATE public.clarity_sessions",
    "SET creator_profile_id = CASE WHEN creator_profile_id = v_uid THEN NULL ELSE creator_profile_id END,",
    "creator_name = CASE WHEN creator_profile_id = v_uid THEN v_tomb ELSE creator_name END,",
    "joiner_profile_id = CASE WHEN joiner_profile_id = v_uid THEN NULL ELSE joiner_profile_id END,",
    "joiner_name = CASE WHEN joiner_profile_id = v_uid THEN v_tomb ELSE joiner_name END,",
    "target_listener_id = CASE WHEN target_listener_id = v_uid THEN NULL ELSE target_listener_id END,",
    "status = 'cancelled'",
    "WHERE id = ANY(v_sessions);",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('sessions_anonymised', n);",
    "UPDATE public.clarity_sessions SET source_story_id = NULL",
    "WHERE source_story_id IN (SELECT id FROM public.stories WHERE author_id = v_uid);",
    "DELETE FROM public.point_positions WHERE user_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('positions_deleted', n);",
    "DELETE FROM public.point_position_history WHERE user_id = v_uid;",
    "DELETE FROM public.story_point_history WHERE user_id = v_uid;",
    "DELETE FROM public.stories WHERE author_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('stories_deleted', n);",
    "UPDATE public.points SET first_validator_id = NULL WHERE first_validator_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('points_orphaned', n);",
    "UPDATE public.events SET host_id = NULL WHERE host_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('events_orphaned', n);",
    "UPDATE public.witnesses",
    "SET witness_profile_id = NULL, witness_name = v_tomb, witness_linkedin_url = NULL",
    "WHERE witness_profile_id = v_uid;",
    "PERFORM public.erase_chat_data_for(v_uid);",
    "UPDATE public.email_send_log SET profile_id = NULL WHERE profile_id = v_uid;",
    "UPDATE public.event_room_members SET profile_id = NULL, display_name = v_tomb WHERE profile_id = v_uid;",
    "DELETE FROM public.terms_acceptances WHERE user_id = v_uid;",
    "DELETE FROM public.session_consents WHERE user_id = v_uid;",
    "END IF;",
    "INSERT INTO public.erased_subjects (user_id, same_name_sessions)",
    "VALUES (v_uid, v_same_name)",
    "ON CONFLICT (user_id) DO UPDATE SET erased_at = now(), same_name_sessions = EXCLUDED.same_name_sessions;",
    "DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_refresh_tokens_deleted', n);",
    "DELETE FROM auth.flow_state WHERE user_id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_flow_state_deleted', n);",
    "DELETE FROM auth.users WHERE id = v_uid;",
    "GET DIAGNOSTICS n = ROW_COUNT;",
    "IF n <> 1 THEN",
    "RAISE EXCEPTION 'erase_my_account: auth user % not found', v_uid USING ERRCODE = 'P0002';",
    "END IF;",
    "RETURN v_out || jsonb_build_object('auth_user_deleted', true,",
    "'same_name_sessions', to_jsonb(v_same_name));",
    "END;",
    "$$;",
  ];
const expectedMerged = (name: 'erase' | 'forward' | 'eam'): string => {
  let body = norm((name === 'eam' ? P1592_EAM_FULL : P1592_FULL[name]).join(' '));
  const after = (anchor: string, hunk: string) => {
    expect(body.split(norm(anchor)).length, `merge anchor: ${anchor.slice(0, 60)}`).toBe(2);
    body = body.replace(norm(anchor), (a) => `${a} ${norm(hunk)}`);
  };
  if (name === 'erase') {
    const [ownerLocks, draftRows, step8] = P1536_HUNKS.erase as [string, string, string];
    after(`RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023'; END IF;`, P1536_ERASURE_LOCK);
    after(`PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));`, ownerLocks);
    after(`PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));`, draftRows);
    after(`'chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));`, step8);
  } else if (name === 'eam') {
    after(`RAISE EXCEPTION 'erase_my_account: not authenticated' USING ERRCODE = '42501'; END IF;`, P1536_EAM_LOCKS);
  } else {
    after(`RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501'; END IF;`, P1536_HUNKS.forward[0]!);
  }
  return body;
};
const ERASE_HEADER = `CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$`;
const EAM_HEADER = `CREATE OR REPLACE FUNCTION public.erase_my_account() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$`;
const HELPER_HEADER = `CREATE OR REPLACE FUNCTION public._erase_lock_canvas_owners(p_uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$`;
const FORWARD_HEADER = `CREATE OR REPLACE FUNCTION public.forward_chat_message( p_source uuid, p_target_conversation uuid, p_note text DEFAULT NULL, p_client_id uuid DEFAULT NULL ) RETURNS public.chat_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$`;
const mergeFacts = {
  deltaParity: (sql: string) => {
    const e = fnBodyLast(sql, 'erase_chat_data_for');
    const fw = fnBodyLast(sql, 'forward_chat_message');
    const am = fnBodyLast(sql, 'erase_my_account');
    return [...P1592_HUNKS.erase, ...P1536_HUNKS.erase].every((h) => e.includes(h)) && am.includes(norm(P1536_EAM_LOCKS)) &&
      fnBodyLast(sql, '_erase_lock_canvas_owners').includes(norm(P1536_HUNKS.helperLoop)) &&
      [...P1592_HUNKS.forward, ...P1536_HUNKS.forward].every((h) => fw.includes(h));
  },
  // erasing marker, owner locks, speaker, thread locks, p1520 context lock, draft rows FOR UPDATE; the first four before step 1
  lockOrder: (sql: string) => {
    const e = fnBodyLast(sql, 'erase_chat_data_for');
    const at = [
      `hashtextextended('p1536:erasure', 0)`,
      `hashtextextended('p1592:erasing:' || p_uid::text, 0)`,
      `PERFORM public._erase_lock_canvas_owners(p_uid);`,
      `hashtextextended('p1592:speaker:' || p_uid::text, 0)`,
      `hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0)`,
      `pg_advisory_xact_lock(hashtext('p1520_mirror_context'))`,
      `ORDER BY d.id FOR UPDATE;`,
    ].map((t) => e.indexOf(norm(t)));
    const step1 = e.indexOf(`DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror'`);
    return at.every((i, k) => i > -1 && (k === 0 || i > at[k - 1]!)) && at[4]! < step1 && at[5]! > step1 &&
      e.split('_erase_lock_canvas_owners').length === 2 && e.split(`'p1592:speaker:'`).length === 2 && e.split(`'p1592:erasing:'`).length === 2 && e.split(`'p1536:erasure'`).length === 2 && e.split('FOR UPDATE;').length === 2;
  },
  // erase_my_account: the erasing marker, then the owner-lock helper, each once, before its first mutation (any UPDATE, DELETE, INSERT
  // or FOR UPDATE row lock)
  eamLockOrder: (sql: string) => {
    const b = fnBodyLast(sql, 'erase_my_account');
    const global = b.indexOf(`hashtextextended('p1536:erasure', 0)`);
    const marker = b.indexOf(`hashtextextended('p1592:erasing:' || v_uid::text, 0)`);
    const helper = b.indexOf('PERFORM public._erase_lock_canvas_owners(v_uid);');
    const firstMutation = b.search(/\b(UPDATE|DELETE|INSERT)\b/);
    return global > -1 && marker > global && helper > marker && helper < firstMutation &&
      b.split(`'p1536:erasure'`).length === 2 && b.split(`'p1592:erasing:'`).length === 2 && b.split('_erase_lock_canvas_owners').length === 2;
  },
  // the file, comments stripped, is EXACTLY this sequence of top-level statements and nothing else (no DO, ALTER, second definition)
  structure: (sql: string) => {
    const statements = topLevelStatements(stripComments(sql));
    const fn = (header: string) => (t: string) => t.startsWith(norm(header)) && t.endsWith('$$') && t.split('$$').length === 3;
    const exact = (want: string) => (t: string) => t === want;
    const shape = [
      exact('BEGIN'),
      fn(HELPER_HEADER),
      exact('REVOKE ALL ON FUNCTION public._erase_lock_canvas_owners(uuid) FROM PUBLIC, anon, authenticated'),
      fn(ERASE_HEADER),
      exact('REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated'),
      fn(EAM_HEADER),
      exact('REVOKE EXECUTE ON FUNCTION public.erase_my_account() FROM PUBLIC, anon, authenticated'),
      exact('GRANT EXECUTE ON FUNCTION public.erase_my_account() TO authenticated'),
      fn(FORWARD_HEADER),
      exact('REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated'),
      exact('GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated'),
      exact('COMMIT'),
    ];
    return statements.length === shape.length && shape.every((ok, i) => ok(statements[i]!));
  },
  // every body, whole: P1592's complete body with P1536's hunks inserted at named anchors, nothing else
  fullBodies: (sql: string) =>
    fnBodyLast(sql, 'erase_chat_data_for') === expectedMerged('erase') && fnBodyLast(sql, 'forward_chat_message') === expectedMerged('forward') &&
    fnBodyLast(sql, 'erase_my_account') === expectedMerged('eam') && fnBodyLast(sql, '_erase_lock_canvas_owners') === norm(P1536_HELPER),
  // every GRANT / REVOKE / ALTER DEFAULT PRIVILEGES statement outside the function bodies is exactly one of the expected ones
  grantsAndSecurity: (sql: string) => {
    const code = stripComments(sql).replace(/\$\$[\s\S]*?\$\$/g, '');
    const statements = [...code.matchAll(/\b(?:GRANT|REVOKE|ALTER\s+DEFAULT\s+PRIVILEGES)\b[^;]*;/gi)].map((m) => norm(m[0]));
    return fnBodyLast(sql, 'erase_chat_data_for').startsWith(norm(ERASE_HEADER)) &&
      fnBodyLast(sql, 'erase_my_account').startsWith(norm(EAM_HEADER)) && fnBodyLast(sql, '_erase_lock_canvas_owners').startsWith(norm(HELPER_HEADER)) &&
      fnBodyLast(sql, 'forward_chat_message').startsWith(norm(FORWARD_HEADER)) &&
      JSON.stringify(statements) === JSON.stringify([
        `REVOKE ALL ON FUNCTION public._erase_lock_canvas_owners(uuid) FROM PUBLIC, anon, authenticated;`,
        `REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;`,
        `REVOKE EXECUTE ON FUNCTION public.erase_my_account() FROM PUBLIC, anon, authenticated;`,
        `GRANT EXECUTE ON FUNCTION public.erase_my_account() TO authenticated;`,
        `REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;`,
        `GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated;`,
      ]);
  },
};
describe(`P1536 + P1592 merge: whole deltas, lock order and grants of the newest definitions (P1592 from ${P1592_SRC}; P1536 from ${P1536_SRC})`, () => {
  const sql = read(MERGE);
  it('the merge file is the newest definition of all four functions', () => {
    expect(newestDefinition('erase_chat_data_for')).toBe(MERGE);
    expect(newestDefinition('erase_my_account')).toBe(MERGE);
    expect(newestDefinition('_erase_lock_canvas_owners')).toBe(MERGE);
    expect(newestDefinition('forward_chat_message')).toBe(MERGE);
  });
  it('both sides\' whole deltas are present in each newest body', () => expect(mergeFacts.deltaParity(sql)).toBe(true));
  it('each newest body equals P1592\'s complete body plus the P1536 hunks at their anchors, exactly', () => expect(mergeFacts.fullBodies(sql)).toBe(true));
  it('the merge file is exactly BEGIN, one definition of each of the four functions with their grants, COMMIT; and holds one definition per function', () => {
    expect(mergeFacts.structure(sql)).toBe(true);
    for (const name of ['_erase_lock_canvas_owners', 'erase_chat_data_for', 'erase_my_account', 'forward_chat_message']) {
      expect(stripComments(sql).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, 'g'))).toHaveLength(1);
    }
  });
  it('neither the merge file nor the v6 file grants in bulk or by schema or default privileges', () => {
    for (const file of [MERGE, M]) {
      const code = stripComments(read(file)).replace(/\$\$[\s\S]*?\$\$/g, '');
      expect(code, file).not.toMatch(/ON\s+ALL\s+(FUNCTIONS|TABLES|SEQUENCES)|ALTER\s+DEFAULT\s+PRIVILEGES|(GRANT|REVOKE)\b[^;]*\bON\s+SCHEMA/i);
    }
  });
  it('erase_chat_data_for locks in the order: erasing marker, owner locks, speaker, thread locks, p1520 context, draft rows FOR UPDATE', () => expect(mergeFacts.lockOrder(sql)).toBe(true));
  it('erase_my_account takes the erasing marker and then the owner locks before its first UPDATE, DELETE, INSERT or row lock', () => expect(mergeFacts.eamLockOrder(sql)).toBe(true));
  it('erase has no grant to anyone, forward is granted to authenticated only, both are SECURITY DEFINER with search_path empty, signatures unchanged', () => expect(mergeFacts.grantsAndSecurity(sql)).toBe(true));
  it('CONTROLS: each mutation of the real merge file is caught', () => {
    const mut = (a: string, b: string) => { expect(sql.split(a).length, `mutation anchor: ${a.slice(0, 60)}`).toBe(2); return sql.replace(a, b); };
    const memberDelete = 'DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;';
    expect(mergeFacts.deltaParity(mut(memberDelete, 'NULL;'))).toBe(false);
    const draftRows = sql.slice(sql.indexOf('  PERFORM 1 FROM public.canvas_drafts d'), sql.indexOf('ORDER BY d.id FOR UPDATE;') + 'ORDER BY d.id FOR UPDATE;'.length);
    expect(mergeFacts.deltaParity(mut(draftRows, 'NULL;'))).toBe(false);
    expect(mergeFacts.lockOrder(mut(draftRows, 'NULL;'))).toBe(false);
    expect(mergeFacts.lockOrder(mut(`PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0));`, 'NULL;'))).toBe(false);
    const revoke = 'REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;';
    expect(mergeFacts.grantsAndSecurity(mut(revoke, revoke + '\nGRANT EXECUTE ON FUNCTION public.erase_chat_data_for(uuid) TO authenticated;'))).toBe(false);
    expect(mergeFacts.grantsAndSecurity(mut(revoke, ''))).toBe(false);
    expect(mergeFacts.grantsAndSecurity(mut(revoke, revoke + '\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;'))).toBe(false);
    expect(mergeFacts.fullBodies(mut(`AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)`, ''))).toBe(false);
    expect(mergeFacts.fullBodies(mut(memberDelete, 'NULL;'))).toBe(false);
    // erase_my_account: drop the helper call, or move both lock lines below the first UPDATE
    expect(mergeFacts.eamLockOrder(mut('PERFORM public._erase_lock_canvas_owners(v_uid);', 'NULL;'))).toBe(false);
    expect(mergeFacts.fullBodies(mut('PERFORM public._erase_lock_canvas_owners(v_uid);', 'NULL;'))).toBe(false);
    const eamLocks = sql.slice(sql.indexOf("  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || v_uid::text, 0));"), sql.indexOf('PERFORM public._erase_lock_canvas_owners(v_uid);') + 'PERFORM public._erase_lock_canvas_owners(v_uid);'.length);
    const moved = sql.replace(eamLocks, '').replace('    DELETE FROM public.clarity_agreements WHERE creator_profile_id = v_uid;', `${eamLocks}\n    DELETE FROM public.clarity_agreements WHERE creator_profile_id = v_uid;`);
    expect(moved).not.toBe(sql);
    expect(mergeFacts.eamLockOrder(moved)).toBe(false);
    expect(mergeFacts.fullBodies(moved)).toBe(false);
    const commit = '\nCOMMIT;';
    const forwardFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.forward_chat_message('), sql.indexOf('$$;', sql.indexOf('AS $$', sql.indexOf('CREATE OR REPLACE FUNCTION public.forward_chat_message(')) + 5) + 3);
    expect(mergeFacts.structure(mut(commit, `\n${forwardFn.replace(`'chat: message not available'`, `'x'`)}${commit}`))).toBe(false);
    expect(mergeFacts.fullBodies(mut(commit, `\n${forwardFn.replace(`'chat: message not available'`, `'x'`)}${commit}`))).toBe(false);
    expect(mergeFacts.structure(mut(commit, `\nDO $$ BEGIN EXECUTE 'GRANT EXECUTE ON FUNCTION public.erase_chat_data_for(uuid) TO authenticated'; END $$;${commit}`))).toBe(false);
    expect(mergeFacts.structure(mut(commit, `\nALTER FUNCTION public.erase_chat_data_for(uuid) OWNER TO authenticated;${commit}`))).toBe(false);
    expect(mergeFacts.grantsAndSecurity(mut(`TO authenticated;\n\nCOMMIT;`, `TO authenticated, anon;\n\nCOMMIT;`))).toBe(false);
    expect(mergeFacts.grantsAndSecurity(sql.replace(`SET search_path = ''\nAS $$\nDECLARE\n  v_out jsonb`, `SET search_path = public\nAS $$\nDECLARE\n  v_out jsonb`))).toBe(false);
  });
});

// ----------------------------------------------------------------------------------------------------------------
// The facts about the new file, as predicates over SQL text so the CONTROLS block can run them on mutated copies.
// ----------------------------------------------------------------------------------------------------------------
const CLIENT = [
  'canvas_workspace_send', 'canvas_draft_retry', 'canvas_draft_switch_focus', 'canvas_draft_fork', 'canvas_draft_offer_dismiss',
  'canvas_draft_undo', 'canvas_draft_publish', 'canvas_draft_discard', 'get_canvas_draft_state',
];
/** The exact signatures, because the earlier overloads of the same names keep their own (older) grants. */
const CLIENT_SIGS = [
  'canvas_workspace_send\\(uuid, uuid, uuid, integer, boolean, text, text\\[\\], jsonb, uuid\\)', 'canvas_draft_retry\\(uuid, uuid, integer, uuid\\)',
  'canvas_draft_switch_focus\\(uuid, uuid, integer, uuid\\)', 'canvas_draft_fork\\(uuid, uuid, integer, uuid\\)',
  'canvas_draft_offer_dismiss\\(uuid, uuid, integer\\)', 'canvas_draft_undo\\(uuid, uuid, integer\\)',
  'canvas_draft_publish\\(uuid, integer\\)', 'canvas_draft_discard\\(uuid, integer\\)', 'get_canvas_draft_state\\(uuid\\)',
];
const WORKER_SIGS = [
  '_canvas_draft_run_begin\\(uuid, uuid, boolean, text\\)', '_canvas_draft_add_material\\(uuid, uuid, text, text, text, uuid\\)',
  '_canvas_draft_run_complete\\(uuid, uuid, jsonb, jsonb, text\\[\\], text, jsonb, text, text, numeric\\)',
  '_canvas_draft_run_fail\\(uuid, uuid, text, text, numeric\\)', '_canvas_draft_material_expire\\(\\)', '_canvas_draft_expire_all\\(\\)',
];
const NEW_TABLES = ['canvas_draft_steps', 'canvas_draft_points', 'canvas_draft_offers'];
/** the functions that take the per-owner lock and then the expire step */
const LOCKING = [
  'canvas_workspace_send', 'canvas_draft_retry', 'canvas_draft_switch_focus', 'canvas_draft_fork', 'canvas_draft_offer_dismiss',
  'canvas_draft_undo', 'canvas_draft_publish', 'canvas_draft_discard', 'get_canvas_draft_state',
  '_canvas_draft_run_begin', '_canvas_draft_add_material', '_canvas_draft_run_complete', '_canvas_draft_run_fail',
];

const facts: Record<string, (sql: string) => boolean> = {
  clientFunctionsGrantedToAuthenticatedAlone: (sql) => {
    const code = stripComments(sql);
    return CLIENT_SIGS.every((sig) =>
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig}\\s+FROM PUBLIC, anon, authenticated;`).test(code) &&
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig}\\s+TO authenticated;`).test(code));
  },
  workersGrantedToServiceRoleAlone: (sql) => {
    const code = stripComments(sql);
    return WORKER_SIGS.every((sig) =>
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig}\\s+FROM PUBLIC, anon, authenticated;`).test(code) &&
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig}\\s+TO service_role;`).test(code));
  },
  onlyGetCanvasIsGrantedToAnon: (sql) => {
    const grants = [...stripComments(sql).matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\)\s+TO ([^;]+);/g)];
    return grants.every((m) => (/\banon\b/.test(m[2]!) ? m[1] === 'get_canvas' : /^(authenticated|service_role)$/.test(m[2]!.trim()) || m[1] === 'get_canvas'));
  },
  everyHelperIsClosedToClients: (sql) => {
    const code = stripComments(sql);
    const helpers = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(_\w+)\(/g)].map((m) => m[1]!);
    return helpers.length > 20 && helpers.every((fn) => new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`).test(code));
  },
  newTablesAreClosed: (sql) => {
    const code = stripComments(sql);
    return NEW_TABLES.every((t) =>
      new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`).test(code) &&
      new RegExp(`REVOKE ALL ON TABLE public\\.${t}\\s+FROM PUBLIC, anon, authenticated`).test(code) &&
      !new RegExp(`GRANT [^;]*ON (TABLE )?public\\.${t}\\b`).test(code)) &&
      !/CREATE POLICY/.test(code);
  },
  ownerReadsRevisionAndFocusOnly: (sql) => {
    const code = stripComments(sql);
    const grants = [...code.matchAll(/GRANT SELECT \(([^)]*)\) ON public\.(\w+) TO (\w+);/g)];
    return grants.length === 1 && grants[0]![2] === 'canvas_drafts' && grants[0]![3] === 'authenticated' &&
      norm(grants[0]![1]!) === 'revision, focus';
  },
  lockOrder: (sql) => LOCKING.every((fn) => {
    const body = fnBody(sql, fn);
    const lock = body.indexOf(`pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:'`);
    const expire = body.indexOf('_canvas_draft_expire(');
    const draft = body.search(/FROM public\.canvas_drafts d WHERE [^;]*FOR UPDATE/);
    const run = body.search(/FROM public\.canvas_draft_runs r (WHERE|JOIN)[^;]*FOR UPDATE/);
    const canvas = body.search(/FROM public\.canvases c WHERE [^;]*FOR UPDATE/);
    const ordered = lock >= 0 && expire > lock && (draft < 0 || draft > expire) && (run < 0 || (draft >= 0 && run > draft)) &&
      (canvas < 0 || (canvas > expire && (draft < 0 || canvas < draft)));
    // get_canvas_draft_state reads without locking the draft rows, send does not lock a run row (it inserts one)
    return ordered;
  }),
  expireStepLocksDraftBeforeRun: (sql) => {
    const body = fnBody(sql, '_canvas_draft_expire');
    const d = body.search(/FROM public\.canvas_drafts d WHERE [^;]*FOR UPDATE/);
    const r = body.search(/FROM public\.canvas_draft_runs r\s+WHERE r\.id = v_c\.id[^;]*FOR UPDATE/);
    return d >= 0 && r > d && body.includes(`interval '3 minutes'`) && body.includes(`interval '5 minutes'`) &&
      body.includes(`'transcript_failed'`) && body.includes(`state = 'settled'`);
  },
  completeNeverCallsTheClearFunction: (sql) =>
    // the v6 completion (first definition of the name) never clears; only the earlier six-argument form still does
    !fnBody(sql, '_canvas_draft_run_complete').includes('_canvas_draft_clear_points') &&
    fnBody(sql, '_canvas_draft_run_complete').includes('canvas_draft_steps') &&
    // the earlier discard and the earlier six-argument complete are the only callers left
    stripComments(sql).split('_canvas_draft_clear_points').length - 1 === 2,
  stepIsWrittenBeforeAnyPointChange: (sql) => {
    const b = fnBody(sql, '_canvas_draft_run_complete');
    const step = b.indexOf('INSERT INTO public.canvas_draft_steps');
    return step > 0 && step < b.indexOf('INSERT INTO public.points') && step < b.indexOf('SET system_tags = array_remove') &&
      b.indexOf('INSERT INTO public.canvas_draft_points') > step;
  },
  scopeIsEnforcedBothWays: (sql) => {
    const b = fnBody(sql, '_canvas_draft_run_complete');
    return b.includes('NOT (v_src = ANY (v_scope))') && b.includes('NOT (v_box = ANY (v_scope))') &&
      b.includes(`v_run.kind = 'message' AND v_trig.box_refs IS NOT NULL`) && b.includes('v_scope := v_boxes') &&
      b.includes(`v_run.kind = 'focus' AND v_src = ANY (v_cust)`) && b.includes(`ELSIF v_first THEN`) &&
      // a tagged message is exactly its tags, even on an empty draft; the first draft needs no focus yet
      b.includes(`v_trig.box_refs IS NULL AND cardinality(v_pre) = 0 AND v_d.base_version_id IS NULL AND v_d.focus IS NULL`) &&
      // a refused action does not remove its source point
      b.includes(`v_keep := v_keep || v_old;`) &&
      // an empty scope applies nothing: what the model supplied is dropped AND counted
      b.includes(`IF cardinality(v_scope) = 0 THEN v_drop := v_drop + jsonb_array_length(p_actions) + (SELECT count(*) FROM jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)));`) &&
      b.includes(`'not_offered'`) &&
      b.includes(`RAISE EXCEPTION 'canvas draft: a point is named twice'`) &&
      b.includes(`RAISE EXCEPTION 'canvas draft: point is not a point of this draft'`);
  },
  refusalCodes: (sql) => {
    const has = (fn: string, ...codes: string[]) => { const b = fnBody(sql, fn); return codes.every((c) => b.includes(`'${c}'`)); };
    const busy = fnBody(sql, '_canvas_draft_busy_code');
    return busy.includes(`'busy'`) && busy.includes(`'busy_elsewhere'`) &&
      has('canvas_workspace_send', 'cap_reached', 'stale_view') && fnBody(sql, 'canvas_workspace_send').includes('_canvas_draft_busy_code(') &&
      has('canvas_draft_retry', 'cap_reached', 'stale_view', 'not_retryable') &&
      has('canvas_draft_switch_focus', 'cap_reached', 'stale_view', 'not_offered') &&
      has('canvas_draft_fork', 'stale_view', 'expired', 'not_offered') &&
      has('canvas_draft_offer_dismiss', 'stale_view') && fnBody(sql, 'canvas_draft_offer_dismiss').includes('_canvas_draft_busy_code(v_uid, v_d.id, true)') &&
      has('canvas_draft_undo', 'stale_view') && has('canvas_draft_publish', 'stale_view', 'draft_empty', 'no_changes') &&
      has('canvas_draft_discard', 'stale_view') && has('_canvas_draft_refuse', 'refused');
  },
  capIsThirtyUsedRuns: (sql) => {
    const used = fnBody(sql, '_canvas_draft_used_runs');
    return used.includes(`r.state IN ('done', 'undone')`) && !used.includes(`'failed'`) &&
      ['canvas_workspace_send', 'canvas_draft_retry', 'canvas_draft_switch_focus'].every((fn) => /c_cap\s+CONSTANT integer := 30/.test(fnBody(sql, fn)));
  },
  capsAreTheFoundersD18: (sql) => {
    const lim = fnBody(sql, '_mirror_limits');
    return lim.includes(`'person_canvas_daily_usd', 6.00`) && lim.includes(`'person_canvas_daily_count', 60`) &&
      lim.includes(`'global_canvas_daily_usd', 45.00`) && lim.includes(`'global_reply_daily_usd', 5.00`) && lim.includes(`'global_total_daily_usd', 50.00`);
  },
  retentionRule: (sql) => {
    const p = fnBody(sql, 'canvas_draft_publish');
    return p.includes(`now() + interval '719 hours'`) && p.includes('DELETE FROM public.canvas_draft_material') &&
      p.includes('_canvas_draft_cleanup_ledger(') && p.includes('DELETE FROM public.canvas_draft_steps') && p.includes('from_seq = v_from') &&
      fnBody(sql, 'canvas_draft_fork').includes('v_src.material_until < now()') && fnBody(sql, '_canvas_draft_offers_settled').includes('DELETE FROM public.canvas_draft_material') &&
      fnBody(sql, '_canvas_draft_material_expire').includes('d.material_until < now()');
  },
  hourlyCron: (sql) => /cron\.schedule\('canvas_draft_material_expire', '5 \* \* \* \*'/.test(sql) && /cron\.unschedule\('canvas_draft_material_expire'\)/.test(sql),
  searchPaths: (sql) => {
    const code = stripComments(sql);
    // functions that write points, stories or positions need the public search path (their triggers resolve unqualified names)
    const publicPath = new Set(['_canvas_draft_cleanup_ledger', '_canvas_draft_discard_inner', '_canvas_draft_new_canvas', '_canvas_draft_new',
      '_canvas_draft_run_complete', 'canvas_workspace_send', 'canvas_draft_fork', 'canvas_draft_undo', 'canvas_draft_publish', 'canvas_draft_discard']);
    let seen = 0;
    for (const m of code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)) {
      const name = m[1]!;
      const start = code.indexOf(m[0]);
      const header = code.slice(start, code.indexOf('AS $$', start));
      if (!/SECURITY DEFINER/.test(header)) continue;
      seen++;
      const want = publicPath.has(name) ? /SET search_path = public, pg_temp/ : /SET search_path = ''/;
      if (!want.test(header)) return false;
    }
    return seen > 20;
  },
  schemaMatchesTheSpec: (sql) => {
    const code = norm(stripComments(sql));
    return [
      `ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0`, `ADD COLUMN IF NOT EXISTS focus text`,
      `ADD COLUMN IF NOT EXISTS material_until timestamptz`, `ADD COLUMN IF NOT EXISTS source_draft_id uuid REFERENCES public.canvas_drafts(id)`,
      `CHECK (kind IN ('tensions', 'draft', 'extract', 'message', 'focus', 'fork_first'))`,
      `CHECK (state IN ('queued', 'running', 'done', 'failed', 'capped', 'cancelled', 'undone'))`,
      `ADD COLUMN IF NOT EXISTS trigger_message_id uuid REFERENCES public.chat_messages(id)`, `ADD COLUMN IF NOT EXISTS scope text[]`,
      `ADD COLUMN IF NOT EXISTS target_offer_id uuid`, `ADD COLUMN IF NOT EXISTS client_id uuid`,
      `CREATE UNIQUE INDEX IF NOT EXISTS canvas_draft_runs_owner_client ON public.canvas_draft_runs (owner_id, client_id) WHERE client_id IS NOT NULL`,
      `ADD COLUMN IF NOT EXISTS reply_message_id uuid REFERENCES public.chat_messages(id)`,
      `CHECK (state IN ('offered', 'focused', 'started', 'dismissed'))`,
      `CHECK (kind IN ('file', 'link', 'messages'))`, `CHECK (origin IN ('message', 'fork_seed'))`,
      `ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE`,
      `ADD COLUMN IF NOT EXISTS box_refs text[]`, `box_refs <@ public._canvas_box_tags()`,
      `CREATE TABLE IF NOT EXISTS public.canvas_draft_steps`, `CREATE TABLE IF NOT EXISTS public.canvas_draft_points`,
      `CREATE TABLE IF NOT EXISTS public.canvas_draft_offers`,
    ].every((s) => code.includes(norm(s))) && !/DROP INDEX[^;]*canvas_draft_runs_one_active/.test(code) &&
      !code.includes('DROP FUNCTION') && !/\bDROP TABLE\b/.test(code);
  },
  tagOnlyUpdatesKeepUpdatedAt: (sql) => {
    const trigger = norm(stripComments(sql));
    if (!trigger.includes(`CREATE OR REPLACE TRIGGER trg_points_updated_at BEFORE UPDATE ON public.points FOR EACH ROW WHEN (COALESCE(current_setting('p1536.keep_updated_at', true), '') <> 'on') EXECUTE FUNCTION public.update_updated_at();`)) return false;
    return ['_canvas_draft_discard_inner', '_canvas_draft_new', '_canvas_draft_run_complete', 'canvas_draft_undo'].every((fn) => {
      const b = fnBody(sql, fn);
      const on = b.indexOf(`set_config('p1536.keep_updated_at', 'on', true)`);
      const first = b.indexOf('SET system_tags = array_');
      const lastOff = b.lastIndexOf(`set_config('p1536.keep_updated_at', 'off', true)`);
      const last = Math.max(b.lastIndexOf('SET system_tags = array_remove'), b.lastIndexOf('SET system_tags = array_append'));
      return on >= 0 && on < first && lastOff > last;
    });
  },
  legacyFunctionsOnlyGainTheGuard: (sql) => {
    // canvas_draft_open and the tension/extract functions are not touched; the four replaced ones carry the v6 guard
    const code = stripComments(sql);
    return !/CREATE OR REPLACE FUNCTION public\.canvas_draft_open\(/.test(code) && !code.includes('DROP FUNCTION') &&
      [['canvas_draft_publish', 1], ['canvas_draft_discard', 1], ['_canvas_draft_run_begin', 1], ['_canvas_draft_run_complete', 1]]
        .every(([fn, nth]) => fnBody(sql, fn as string, nth as number).includes('IF public._canvas_draft_is_v6(v_d.id) THEN RAISE EXCEPTION')) &&
      ['canvas_draft_publish', 'canvas_draft_discard', '_canvas_draft_run_begin', '_canvas_draft_run_complete']
        .every((fn) => !fnBody(sql, fn, 0).includes('_canvas_draft_is_v6'));
  },
  workersCheckTheOwner: (sql) => ['_canvas_draft_run_begin', '_canvas_draft_add_material', '_canvas_draft_run_complete', '_canvas_draft_run_fail']
    .every((fn) => fnBody(sql, fn, 0).includes('v_run.owner_id IS DISTINCT FROM p_owner') && /\(\s*p_run uuid, p_owner uuid/.test(
      stripComments(sql).slice(stripComments(sql).indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`), stripComments(sql).indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`) + 160))),
  everyClientFunctionChecksVerified: (sql) => CLIENT.every((fn) => {
    const b = fnBody(sql, fn);
    return b.includes('_canvas_draft_require_verified(v_uid)') || (fn === 'canvas_workspace_send' && b.includes('pr.is_verified = true'));
  }),
  oneDefinitionOfDiffersFromBase: (sql) =>
    fnBody(sql, 'canvas_draft_publish').includes('cardinality(public._canvas_draft_changed_boxes(v_d.id)) = 0') &&
    fnBody(sql, 'get_canvas_draft_state').includes('cardinality(public._canvas_draft_changed_boxes(v_d.id)) > 0') &&
    fnBody(sql, '_canvas_draft_changed_boxes').includes('COALESCE(cp.copied_from, p.id)'),
  oneDefinitionOfAnOfferKey: (sql) => {
    const code = stripComments(sql);
    return !/lower\(regexp_replace\(btrim\((o\.)?group_label|lower\(regexp_replace\(btrim\(v_(prev|label|focus)/.test(code) &&
      fnBody(sql, '_canvas_offer_key').includes('\\u00a0') && norm(code).includes('canvas_draft_offers_label ON public.canvas_draft_offers (draft_id, public._canvas_offer_key(group_label))');
  },
  seedAndMaterialCaps: (sql) => {
    const f = fnBody(sql, 'canvas_draft_fork');
    const m = fnBody(sql, '_canvas_draft_add_material');
    return /c_seed CONSTANT integer := 12/.test(f) && f.includes(`'Earlier material'`) && f.includes('v_merge') &&
      m.includes(`m.origin = 'message'`) && m.includes(`NOT IN ('undone', 'failed', 'capped', 'cancelled')`);
  },
  forkDiscardReopensTheOffer: (sql) => {
    const d = fnBody(sql, '_canvas_draft_discard_inner');
    return d.includes('v_d.source_draft_id IS NOT NULL') && d.includes(`THEN 'offered' ELSE 'dismissed' END`) && d.includes('started_canvas_id = NULL');
  },
  focusInheritedAndRetryVoiceAndClosedDrafts: (sql) =>
    fnBody(sql, '_canvas_draft_new').includes(`pd.version_id = p_base AND pd.state = 'published'`) &&
    fnBody(sql, 'canvas_draft_retry').includes(`m.transcript_status = 'failed'`) &&
    fnBody(sql, 'get_canvas_draft_state').includes(`'closed_drafts', v_closed_all`) &&
    fnBody(sql, 'canvas_draft_fork').includes('RETURN public._canvas_draft_started_result(v_o.started_canvas_id, v_uid);'),
  roundTwoFixes: (sql) => {
    const fork = fnBody(sql, 'canvas_draft_fork');
    const erase = fnBody(sql, 'erase_chat_data_for');
    const firstStep = erase.indexOf(`DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror'`);
    const ownerLocks = erase.indexOf(`hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0)`);
    const lockAt = erase.indexOf(`pg_advisory_xact_lock(hashtext('p1520_mirror_context'))`);
    const drafts = erase.indexOf('ORDER BY d.id FOR UPDATE');
    const jobs = erase.indexOf('UPDATE public.mirror_jobs j');
    const replies = erase.indexOf(`WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref]`);
    // the owner locks (the erased user's included, as ONE sorted set) come before ANY row is touched, once; the draft rows
    // are locked after the context lock and before the jobs and reply messages
    return ownerLocks > 0 && ownerLocks < firstStep && lockAt > firstStep && drafts > lockAt && jobs > drafts && replies > drafts &&
      erase.includes('SELECT p_uid AS owner_id UNION SELECT d.owner_id FROM public.canvas_drafts d') &&
      erase.split(`hashtextextended('p1515:canvas_versions:'`).length - 1 === 1 &&
      // step 7 here (step 8 in the merge file): the revision of each draft with a cancelled v6 run moves, before the runs are cancelled
      erase.indexOf('UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r') > drafts &&
      erase.indexOf('UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id IN (SELECT r.draft_id') < erase.indexOf(`UPDATE public.canvas_draft_runs r SET state = 'cancelled', error_code = 'erased'`) &&
      // one definition of an expired material
      fnBody(sql, 'get_canvas_draft_state').includes('public._canvas_draft_material_expired(v_c.id)') &&
      fnBody(sql, 'get_canvas_draft_state').includes('public._canvas_draft_material_expired(c.id)') &&
      !fnBody(sql, 'get_canvas_draft_state').includes('material_until < now()') &&
      fnBody(sql, '_canvas_draft_material_expired').includes(`o.state = 'offered'`) &&
      // fork: a replay whose draft has closed answers like a second tap
      fork.includes(`IF v_old.state = 'open' THEN RETURN public._canvas_draft_run_result(v_prev, true); END IF; RETURN public._canvas_draft_started_result(v_old.canvas_id, v_uid);`) &&
      fnBody(sql, '_canvas_draft_started_result').includes(`d.state = 'open' LIMIT 1`) &&
      // the state lists published drafts with an offered OR a started offer
      fnBody(sql, 'get_canvas_draft_state').includes(`o.state IN ('offered', 'started')`) &&
      // a discarded fork draft settles the source after reopening or dismissing its offer
      fnBody(sql, '_canvas_draft_discard_inner').includes('PERFORM public._canvas_draft_offers_settled(v_d.source_draft_id);') &&
      // seed rows keep the source row's created_at; the consolidated row takes the oldest of the rows it merged
      fork.includes(`x.id, x.created_at`) && fork.includes(`min(x.created_at) INTO v_cons, v_cons_at`) && fork.includes(`v_cons_at);`);
  },
  addMaterialBumpsTheRevision: (sql) => {
    const b = fnBody(sql, '_canvas_draft_add_material');
    const insert = b.indexOf('INSERT INTO public.canvas_draft_material');
    const bump = b.indexOf('UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;');
    return insert > 0 && bump > insert && bump < b.indexOf('_canvas_draft_effective_input(');
  },
  publishKeepsTheOldVersionByteIdentical: (sql) => {
    const b = fnBody(sql, 'canvas_draft_publish');
    const on = b.indexOf(`PERFORM set_config('p1536.keep_updated_at', 'on', true); UPDATE public.points o SET superseded_by = v_new WHERE o.id = v_old; PERFORM set_config('p1536.keep_updated_at', 'off', true);`);
    return on > 0 && on > b.indexOf('FOR v_link IN');
  },
  // the job is ONE statement: it locks the expired rows in id order (the order a fork share-locks them in) and deletes them; no owner lock
  // (blocking or try), no loop, so a busy owner cannot delay it
  expiryNeedsNoOwnerLock: (sql) => {
    const b = fnBody(sql, '_canvas_draft_material_expire');
    return b.includes(norm(`WITH doomed AS ( SELECT m.id FROM public.canvas_draft_material m JOIN public.canvas_drafts d ON d.id = m.draft_id WHERE d.state = 'published' AND d.material_until IS NOT NULL AND d.material_until < now() ORDER BY m.id FOR UPDATE OF m) DELETE FROM public.canvas_draft_material m USING doomed WHERE m.id = doomed.id;`)) &&
      !/advisory|\bLOOP\b|\bCONTINUE\b/i.test(b) && b.split('DELETE FROM').length === 2 &&
      fnBody(sql, 'canvas_draft_fork').includes(`IF NULLIF(v_cons, '') IS NOT NULL THEN`) &&
      fnBody(sql, 'canvas_draft_fork').includes(norm(`IF v_src.state = 'published' AND v_src.material_until IS NOT NULL AND v_src.material_until < now() THEN RETURN public._canvas_draft_refuse('expired', v_src.id);`));
  },
  // the fork share-locks the source's listed material rows (id order) in the statement that lists them, before anything is written, and
  // refuses 'expired' when fewer rows were locked than listed or the time has passed
  forkLocksItsSeedRows: (sql) => {
    const f = fnBody(sql, 'canvas_draft_fork');
    const lock = f.indexOf(norm(`SELECT count(*) INTO v_locked FROM ( SELECT m.id FROM public.canvas_draft_material m WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid) ORDER BY m.id FOR SHARE) l;`));
    const check = f.indexOf(norm(`IF v_locked <> v_listed OR (v_src.state = 'published' AND v_src.material_until IS NOT NULL AND v_src.material_until < clock_timestamp()) THEN RETURN public._canvas_draft_refuse('expired', v_src.id); END IF;`));
    const write = f.indexOf('_canvas_draft_new_canvas(v_uid)');
    // the FIRST material lock covers the complete source set, ordered, before the selector lists anything
    const full = f.indexOf(norm(`SELECT count(*) INTO v_all FROM ( SELECT m.id FROM public.canvas_draft_material m WHERE m.draft_id = v_src.id ORDER BY m.id FOR SHARE) a;`));
    if (!(full > 0 && full < f.indexOf('v_in := public._canvas_draft_effective_input(v_src.id, NULL);') && f.split('FOR SHARE').length === 3)) return false;
    return lock > 0 && check > lock && write > check && f.split('v_in := public._canvas_draft_effective_input(v_src.id, NULL);').length === 2 &&
      f.indexOf('v_in := public._canvas_draft_effective_input(v_src.id, NULL);') < lock;
  },
  // every DELETE of canvas_draft_material rows in the file locks the rows first, in id order (WITH x AS (SELECT ... ORDER BY m.id FOR UPDATE) DELETE ... USING x),
  // the order a fork share-locks them in, so no two of them can cross; at least the four known sites (settle, discard, publish, expiry)
  everyMaterialDeleteIsOrdered: (sql) => {
    const code = norm(stripComments(sql));
    const all = code.split('DELETE FROM public.canvas_draft_material').length - 1;
    const ordered = [...code.matchAll(/WITH (\w+) AS \( ?SELECT m\.id FROM public\.canvas_draft_material m [^;]*?ORDER BY m\.id FOR UPDATE(?: OF m)?\) ?DELETE FROM public\.canvas_draft_material m USING \1 WHERE m\.id = \1\.id;/g)].length;
    return all >= 4 && ordered === all;
  },
  // the hourly job also fails the stale runs of ALL owners, through the per-owner expire (one settle logic), with a TRY lock per owner and the
  // same leases (3 minutes queued, 5 minutes running)
  sweepsStaleRunsOfAllOwners: (sql) => {
    const b = fnBody(sql, '_canvas_draft_expire_all');
    const e = fnBody(sql, '_canvas_draft_expire');
    return b.includes(norm(`SELECT DISTINCT r.owner_id FROM public.canvas_draft_runs r WHERE (r.state = 'running' AND COALESCE(r.started_at, r.created_at) < now() - interval '5 minutes') OR (r.state = 'queued' AND r.created_at < now() - interval '3 minutes')`)) &&
      b.includes(norm(`CONTINUE WHEN NOT pg_try_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));`)) &&
      b.includes('n := n + public._canvas_draft_expire(v_o.owner_id);') && !/PERFORM pg_advisory_xact_lock/.test(b) &&
      e.includes(`c_queued CONSTANT interval := interval '3 minutes'`) && e.includes(`c_running CONSTANT interval := interval '5 minutes'`) &&
      /cron\.schedule\('canvas_draft_material_expire', '5 \* \* \* \*', \$job\$ SELECT public\._canvas_draft_material_expire\(\); SELECT public\._canvas_draft_expire_all\(\); \$job\$\)/.test(sql);
  },
  replayAfterExpire: (sql) => ['canvas_workspace_send', 'canvas_draft_retry', 'canvas_draft_switch_focus', 'canvas_draft_fork'].every((fn) => {
    const b = fnBody(sql, fn);
    const replay = b.indexOf('_canvas_draft_run_result(v_prev, true)');
    return replay > 0 && b.indexOf('_canvas_draft_expire(') > 0 && b.indexOf('_canvas_draft_expire(') < replay;
  }) && fnBody(sql, '_canvas_draft_run_result').includes(`'revision', d.revision`),
};

describe('P1536 v6 migration: facts about the file', () => {
  it.each(Object.keys(facts))('%s', (name) => {
    expect(facts[name]!(rawM), name).toBe(true);
  });
  it('the 30-run cap, the 3-open-offers limit and the leases are the spec\'s numbers', () => {
    expect(fnBody(rawM, 'canvas_workspace_send')).toContain('>= c_cap');
    expect(fnBody(rawM, '_canvas_draft_run_complete')).toContain('v_open >= 3');
    const exp = fnBody(rawM, '_canvas_draft_expire');
    expect(exp).toContain(`c_queued CONSTANT interval := interval '3 minutes'`);
    expect(exp).toContain(`c_running CONSTANT interval := interval '5 minutes'`);
  });
  it('a repeat with the same client id is answered after the expire step and before anything is written, with the CURRENT revision', () => {
    for (const fn of ['canvas_workspace_send', 'canvas_draft_retry', 'canvas_draft_switch_focus', 'canvas_draft_fork']) {
      const b = fnBody(rawM, fn);
      expect(b.indexOf('_canvas_draft_expire('), fn).toBeGreaterThan(0);
      expect(b.indexOf('_canvas_draft_run_result(v_prev, true)'), fn).toBeGreaterThan(b.indexOf('_canvas_draft_expire('));
      expect(b.indexOf('_canvas_draft_run_result(v_prev, true)'), fn).toBeLessThan(b.indexOf('FROM public.canvas_drafts d WHERE'));
    }
  });
  it('the upload run is claimed before the file is extracted: begin reserves the extraction price on top, and a file run is not_ready without the file', () => {
    const b = fnBody(rawM, '_canvas_draft_run_begin');
    expect(b).toContain(`v_run.input_kind = 'file' AND NOT COALESCE(p_has_file, false)`);
    expect(b).toContain(`'extract_max_usd'`);
    expect(b).toContain(`'not_ready'`);
    expect(b).toContain(`'transcript_failed'`);
  });
  it('voice goes through P1576\'s one write path', () => {
    expect(fnBody(rawM, 'canvas_workspace_send')).toContain('public.chat_commit_voice_note(v_uid, v_d.conversation_id, v_key');
  });
  it('the selector includes the trigger and done messages only, fork seed rows always, and never an agent reply', () => {
    const b = fnBody(rawM, '_canvas_draft_effective_input');
    expect(b).toContain(`m.kind = 'message' AND m.author_id = v_d.owner_id`);
    expect(b).toContain(`m.id = v_trigger`);
    expect(b).toContain(`ORDER BY r.created_at DESC, r.id DESC LIMIT 1) = 'done'`);
    expect(b).toContain(`x.origin = 'fork_seed' OR x.message_id = ANY (v_msgs)`);
    expect(b).not.toContain(`'agent'`);
    // a fork reads the same selector and ignores the copies
    const f = fnBody(rawM, 'canvas_draft_fork');
    expect(f).toContain('_canvas_draft_effective_input(v_src.id, NULL)');
    expect(f).not.toContain(`copy_ids`);
  });
});

// ----------------------------------------------------------------------------------------------------------------
// CONTROLS (gate 7): each fact must FAIL on a deliberately broken copy of the real file.
// ----------------------------------------------------------------------------------------------------------------
describe('CONTROLS: each fact fails on a broken copy of the real file', () => {
  const mutate = (from: string | RegExp, to: string): string => {
    const out = rawM.replace(from, to);
    if (out === rawM) throw new Error(`mutation did not apply: ${String(from).slice(0, 60)}`);
    return out;
  };
  it('the real file satisfies every fact (so a failure below is the mutation, not the fact)', () => {
    for (const [n, f] of Object.entries(facts)) expect(f(rawM), n).toBe(true);
  });
  it('a client function handed to anon is caught', () => {
    const m = mutate('GRANT EXECUTE ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) TO authenticated;',
                     'GRANT EXECUTE ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) TO anon, authenticated;');
    expect(facts.clientFunctionsGrantedToAuthenticatedAlone!(m)).toBe(false);
    expect(facts.onlyGetCanvasIsGrantedToAnon!(m)).toBe(false);
  });
  it('a multi-line grant of Send to anon is caught', () => {
    const m = mutate(/(GRANT EXECUTE ON FUNCTION public\.canvas_workspace_send\([^)]*\)\s+TO )authenticated;/, '$1anon, authenticated;');
    expect(facts.onlyGetCanvasIsGrantedToAnon!(m)).toBe(false);
    expect(facts.clientFunctionsGrantedToAuthenticatedAlone!(m)).toBe(false);
  });
  it('a worker handed to authenticated is caught', () => {
    const m = mutate('GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) TO service_role;',
                     'GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) TO authenticated;');
    expect(facts.workersGrantedToServiceRoleAlone!(m)).toBe(false);
  });
  it('a policy or a grant on a new table is caught', () => {
    expect(facts.newTablesAreClosed!(mutate('REVOKE ALL ON TABLE public.canvas_draft_offers FROM PUBLIC, anon, authenticated;',
      'GRANT SELECT ON TABLE public.canvas_draft_offers TO authenticated;'))).toBe(false);
    expect(facts.newTablesAreClosed!(rawM + '\nCREATE POLICY p ON public.canvas_draft_offers FOR SELECT USING (true);')).toBe(false);
  });
  it('widening the owner column grant is caught', () => {
    expect(facts.ownerReadsRevisionAndFocusOnly!(mutate('GRANT SELECT (revision, focus) ON', 'GRANT SELECT (revision, focus, material_until) ON'))).toBe(false);
  });
  it('the expire step taken after the draft lock is caught', () => {
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public.canvas_draft_undo(');
    const expire = '  PERFORM public._canvas_draft_expire(v_uid);\n';
    const at = rawM.indexOf(expire, start);
    const next = rawM.indexOf('\n', rawM.indexOf('SELECT d.* INTO v_d', at)) + 1;
    const draftLine = rawM.slice(at + expire.length, next);
    const m = rawM.slice(0, at) + draftLine + expire + rawM.slice(next);
    expect(m).not.toBe(rawM);
    expect(facts.lockOrder!(m)).toBe(false);
  });
  it('the run row locked before the draft row is caught', () => {
    const m = mutate(`  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;

  IF v_run.state = 'running' THEN`, `  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;

  IF v_run.state = 'running' THEN`);
    expect(facts.lockOrder!(m)).toBe(false);
  });
  it('the completion calling the clear function is caught', () => {
    expect(facts.completeNeverCallsTheClearFunction!(mutate(`    -- 1. the undo step: the draft as it is before this run changes anything`,
      `    PERFORM public._canvas_draft_clear_points(v_d.id);`))).toBe(false);
  });
  it('a point change before the undo step is caught', () => {
    const m = mutate(/ {4}INSERT INTO public\.canvas_draft_steps \(run_id, draft_id, point_ids, questions, pending_links, focus\)\n {4}VALUES \(v_run\.id, v_d\.id, v_pre, v_d\.questions, v_d\.pending_links, v_d\.focus\);\n/, '');
    expect(facts.stepIsWrittenBeforeAnyPointChange!(m)).toBe(false);
  });
  it('a scope check dropped from the apply is caught', () => {
    expect(facts.scopeIsEnforcedBothWays!(mutate('NOT (v_box = ANY (v_scope))', 'false'))).toBe(false);
    expect(facts.scopeIsEnforcedBothWays!(mutate('NOT (v_src = ANY (v_scope))', 'false'))).toBe(false);
    expect(facts.scopeIsEnforcedBothWays!(mutate(`RAISE EXCEPTION 'canvas draft: a point is named twice'`, `RAISE EXCEPTION 'x'`))).toBe(false);
    expect(facts.scopeIsEnforcedBothWays!(mutate(`jsonb_array_length(p_actions) + (SELECT count(*) FROM jsonb_object_keys`, `0 + (SELECT count(*) FROM jsonb_object_keys`))).toBe(false);
  });
  it('a refusal code removed or a busy check dropped is caught', () => {
    expect(facts.refusalCodes!(mutate(`RETURN public._canvas_draft_refuse('no_changes', v_d.id);`, `RETURN public._canvas_draft_refuse('nothing', v_d.id);`))).toBe(false);
  });
  it('a cap that counts failed runs is caught', () => {
    expect(facts.capIsThirtyUsedRuns!(mutate(`r.state IN ('done', 'undone')`, `r.state IN ('done', 'undone', 'failed')`))).toBe(false);
  });
  it('the old caps are caught', () => {
    const m = rawM.replace(`'person_canvas_daily_usd',   6.00`, `'person_canvas_daily_usd',   3.00`);
    expect(m).not.toBe(rawM);
    expect(facts.capsAreTheFoundersD18!(m)).toBe(false);
  });
  it('a retention window of 30 days (not 30 days minus an hour) is caught', () => {
    expect(facts.retentionRule!(mutate(`now() + interval '719 hours'`, `now() + interval '30 days'`))).toBe(false);
  });
  it('a missing cron job is caught', () => {
    expect(facts.hourlyCron!(mutate(`'5 * * * *'`, `'5 3 * * *'`))).toBe(false);
  });
  it('a point-writing function on the empty search_path is caught', () => {
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public._canvas_draft_cleanup_ledger(');
    const at = rawM.indexOf('SET search_path = public, pg_temp', start);
    const m = rawM.slice(0, at) + `SET search_path = ''` + rawM.slice(at + 'SET search_path = public, pg_temp'.length);
    expect(facts.searchPaths!(m)).toBe(false);
  });
  it('a tag-only UPDATE that bumps updated_at (the switch removed) is caught', () => {
    expect(facts.tagOnlyUpdatesKeepUpdatedAt!(mutate(`WHEN (COALESCE(current_setting('p1536.keep_updated_at', true), '') <> 'on')`, `WHEN (true)`))).toBe(false);
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public.canvas_draft_undo(');
    const at = rawM.indexOf(`PERFORM set_config('p1536.keep_updated_at', 'on', true);`, start);
    const m = rawM.slice(0, at) + rawM.slice(at + `PERFORM set_config('p1536.keep_updated_at', 'on', true);`.length);
    expect(facts.tagOnlyUpdatesKeepUpdatedAt!(m)).toBe(false);
  });
  it('a dropped index or function is caught', () => {
    expect(facts.schemaMatchesTheSpec!(rawM + '\nDROP INDEX public.canvas_draft_runs_one_active;')).toBe(false);
    expect(facts.schemaMatchesTheSpec!(rawM + '\nDROP FUNCTION public.canvas_draft_open(uuid);')).toBe(false);
  });
  it('redefining canvas_draft_open, or a legacy body without the guard, is caught', () => {
    expect(facts.legacyFunctionsOnlyGainTheGuard!(rawM + '\nCREATE OR REPLACE FUNCTION public.canvas_draft_open(p_from_version uuid)')).toBe(false);
    const start = rawM.indexOf('-- _canvas_draft_run_begin(uuid, uuid, text, text): previous body');
    const at = rawM.indexOf('IF public._canvas_draft_is_v6(v_d.id) THEN', start);
    const m = rawM.slice(0, at) + 'IF false THEN' + rawM.slice(at + 'IF public._canvas_draft_is_v6(v_d.id) THEN'.length);
    expect(facts.legacyFunctionsOnlyGainTheGuard!(m)).toBe(false);
  });
  it('a worker that does not check the owner is caught', () => {
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public._canvas_draft_add_material(');
    const at = rawM.indexOf('OR v_run.owner_id IS DISTINCT FROM p_owner', start);
    expect(facts.workersCheckTheOwner!(rawM.slice(0, at) + rawM.slice(at + 'OR v_run.owner_id IS DISTINCT FROM p_owner'.length))).toBe(false);
  });
  it('a client function that skips the verified check is caught', () => {
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public.canvas_draft_undo(');
    const at = rawM.indexOf('PERFORM public._canvas_draft_require_verified(v_uid);', start);
    expect(facts.everyClientFunctionChecksVerified!(rawM.slice(0, at) + rawM.slice(at + 'PERFORM public._canvas_draft_require_verified(v_uid);'.length))).toBe(false);
  });
  it('a second definition of "differs from base" and of the offer key are caught', () => {
    expect(facts.oneDefinitionOfDiffersFromBase!(mutate('IF cardinality(public._canvas_draft_changed_boxes(v_d.id)) = 0 THEN', 'IF v_bpts = v_pts THEN'))).toBe(false);
    expect(facts.oneDefinitionOfAnOfferKey!(rawM + `\nSELECT lower(regexp_replace(btrim(o.group_label), '\\s+', ' ', 'g'));`)).toBe(false);
  });
  it('a material cap that counts every row, a missing seed cap, a missing reopen and a missing focus inheritance are caught', () => {
    expect(facts.seedAndMaterialCaps!(mutate(`m.origin = 'message'`, `true`))).toBe(false);
    expect(facts.seedAndMaterialCaps!(mutate(`c_seed     CONSTANT integer := 12;`, `c_seed     CONSTANT integer := 99;`))).toBe(false);
    expect(facts.forkDiscardReopensTheOffer!(mutate(`THEN 'offered' ELSE 'dismissed' END`, `THEN 'started' ELSE 'started' END`))).toBe(false);
    expect(facts.focusInheritedAndRetryVoiceAndClosedDrafts!(mutate(`pd.version_id = p_base AND pd.state = 'published'`, `false`))).toBe(false);
  });
  it('round two: erase interleaving with the engine, a stale fork replay, a lost started offer, an unsettled source and shuffled seeds are caught', () => {
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public.erase_chat_data_for(');
    const at = rawM.indexOf(`PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));`, start);
    expect(facts.roundTwoFixes!(rawM.slice(0, at) + 'NULL;' + rawM.slice(at + `PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));`.length))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`SELECT p_uid AS owner_id`, `SELECT NULL::uuid AS owner_id`))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r
                   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]`, `  UPDATE public.canvas_drafts d SET focus = d.focus
   WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r
                   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]`))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`'material_expired', public._canvas_draft_material_expired(c.id),`, `'material_expired', c.material_until IS NOT NULL AND c.material_until < now(),`))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`IF v_old.state = 'open' THEN`, `IF true THEN`))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`o.state IN ('offered', 'started'));`, `o.state = 'offered');`))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`PERFORM public._canvas_draft_offers_settled(v_d.source_draft_id);`, `NULL;`))).toBe(false);
    expect(facts.roundTwoFixes!(mutate(`'fork_seed', x.id, x.created_at`, `'fork_seed', x.id, now()`))).toBe(false);
  });
  it('a material write that leaves the revision alone is caught', () => {
    expect(facts.addMaterialBumpsTheRevision!(mutate(`  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
  -- the material the run may read NOW`, `  -- the material the run may read NOW`))).toBe(false);
  });
  it('a supersede link that moves updated_at, and a cron deletion outside the owner lock, are caught', () => {
    expect(facts.publishKeepsTheOldVersionByteIdentical!(mutate(`      PERFORM set_config('p1536.keep_updated_at', 'on', true);
      UPDATE public.points o SET superseded_by = v_new WHERE o.id = v_old;`, `      UPDATE public.points o SET superseded_by = v_new WHERE o.id = v_old;`))).toBe(false);
    // a material delete reverted to a plain DELETE (any one of the sites) must fail
    expect(facts.everyMaterialDeleteIsOrdered!(mutate(`WITH x AS (SELECT m.id FROM public.canvas_draft_material m WHERE m.draft_id = p_draft ORDER BY m.id FOR UPDATE)
    DELETE FROM public.canvas_draft_material m USING x WHERE m.id = x.id;`, `DELETE FROM public.canvas_draft_material m WHERE m.draft_id = p_draft;`))).toBe(false);
    expect(facts.everyMaterialDeleteIsOrdered!(mutate(`ORDER BY m.id FOR UPDATE)
  DELETE FROM public.canvas_draft_material m USING x WHERE m.id = x.id;
  UPDATE public.canvas_drafts d`, `FOR UPDATE)
  DELETE FROM public.canvas_draft_material m USING x WHERE m.id = x.id;
  UPDATE public.canvas_drafts d`))).toBe(false);
    // the stale-run sweep: a blocking lock, no per-owner expire call, a shorter-than-expire lease, or a job without it must fail
    expect(facts.sweepsStaleRunsOfAllOwners!(mutate(`    CONTINUE WHEN NOT pg_try_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));
    n := n + public._canvas_draft_expire(v_o.owner_id);`, `    PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));
    n := n + public._canvas_draft_expire(v_o.owner_id);`))).toBe(false);
    expect(facts.sweepsStaleRunsOfAllOwners!(mutate(`n := n + public._canvas_draft_expire(v_o.owner_id);`, `n := n + 0;`))).toBe(false);
    expect(facts.sweepsStaleRunsOfAllOwners!(mutate(`now() - interval '5 minutes')`, `now() - interval '50 minutes')`))).toBe(false);
    expect(facts.sweepsStaleRunsOfAllOwners!(mutate(`SELECT public._canvas_draft_material_expire(); SELECT public._canvas_draft_expire_all(); $job$`, `SELECT public._canvas_draft_material_expire(); $job$`))).toBe(false);
    // the cron takes no owner lock: putting the blocking lock back, or the try-lock skip, must fail
    const cronDelete = `  WITH doomed AS (`;
    expect(facts.expiryNeedsNoOwnerLock!(mutate(cronDelete, `  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || 'x', 0));
${cronDelete}`))).toBe(false);
    expect(facts.expiryNeedsNoOwnerLock!(mutate(cronDelete, `  IF NOT pg_try_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || 'x', 0)) THEN RETURN 0; END IF;
${cronDelete}`))).toBe(false);
    expect(facts.expiryNeedsNoOwnerLock!(mutate(`ORDER BY m.id FOR UPDATE OF m)`, `FOR UPDATE OF m)`))).toBe(false);
    // the first fork lock restricted back to the effective set (or unordered) must fail
    expect(facts.forkLocksItsSeedRows!(mutate(`WHERE m.draft_id = v_src.id ORDER BY m.id FOR SHARE) a;`, `WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid) ORDER BY m.id FOR SHARE) a;`))).toBe(false);
    expect(facts.forkLocksItsSeedRows!(mutate(`WHERE m.draft_id = v_src.id ORDER BY m.id FOR SHARE) a;`, `WHERE m.draft_id = v_src.id FOR SHARE) a;`))).toBe(false);
    // the fork: no share lock, no count check, a check that stopped refusing, or the lock after the first write must fail
    expect(facts.forkLocksItsSeedRows!(mutate(`ORDER BY m.id FOR SHARE) l;`, `ORDER BY m.id) l;`))).toBe(false);
    expect(facts.forkLocksItsSeedRows!(mutate(`IF v_locked <> v_listed
     OR (v_src.state`, `IF false
     OR (v_src.state`))).toBe(false);
    expect(facts.forkLocksItsSeedRows!(mutate(`v_src.material_until < clock_timestamp()) THEN
    RETURN public._canvas_draft_refuse('expired', v_src.id);`, `v_src.material_until < clock_timestamp()) THEN
    RETURN public._canvas_draft_refuse('stale_view', v_src.id);`))).toBe(false);
    expect(facts.expiryNeedsNoOwnerLock!(mutate(`v_src.material_until < now() THEN`, `false THEN`))).toBe(false);
  });
  it('a replay answered before the expire step is caught', () => {
    const start = rawM.indexOf('CREATE OR REPLACE FUNCTION public.canvas_draft_retry(');
    const expire = '  PERFORM public._canvas_draft_expire(v_uid);\n';
    const at = rawM.indexOf(expire, start);
    const m = rawM.slice(0, at) + rawM.slice(at + expire.length).replace('  IF FOUND THEN\n    RETURN public._canvas_draft_run_result(v_prev, true);\n  END IF;', '  IF FOUND THEN\n    RETURN public._canvas_draft_run_result(v_prev, true);\n  END IF;\n' + expire);
    expect(facts.replayAfterExpire!(m)).toBe(false);
  });
});
