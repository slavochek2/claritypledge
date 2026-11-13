/**
 * @file p1631-recording-clarify-migration.test.ts
 * @description P1631 Clarify from the live recording banner: source contract for 20261113100000_p1631_recording_clarify.sql.
 *   - _clarify_begin is its newest earlier body plus only the marked lines (one dispatch);
 *   - get_clarify_thread is its newest earlier body with the two cited lines replaced by marked lines;
 *   - clarify_start_recording and the internal helpers have the grants of the pattern;
 *   - the three read-set filters (round, own, room) are in both the press and the run, and the run reads transcribe_messages only.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113100000_p1631_recording_clarify.sql';
const MARK = '-- P1631 recording';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const raw = read(FILE);
const code = stripComments(raw);

function fnBody(sql: string, name: string): string {
  const c = stripComments(sql);
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).exec(c);
  if (!m) throw new Error(`${name} not found`);
  return norm(c.slice(m.index, c.indexOf('$$;', c.indexOf('AS $$', m.index)) + 3));
}
function newestBefore(name: string, before: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < before && re.test(stripComments(read(f)))).sort();
  return defs[defs.length - 1]!;
}
const unmarked = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');

describe('20261113100000 recording clarify migration', () => {
  it('has the header lines of the house convention', () => {
    expect(raw).toMatch(/^-- client-safe:/m);
    expect(raw).toContain('diffed against:');
    expect(raw).toContain('Guaranteed by:');
  });

  it("allows scope 'recording', names the room, and keeps one recording thread per owner and room", () => {
    const sql = norm(code);
    expect(sql).toContain("CHECK (scope IN ('message', 'thread', 'chat', 'recording'))");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS recording_room_id uuid REFERENCES public.transcribe_rooms(id) ON DELETE SET NULL');
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS clarify_threads_one_recording_per_owner_room ON public.clarify_threads (owner_id, recording_room_id) WHERE scope = 'recording' AND recording_room_id IS NOT NULL");
  });

  it('clarify_drafts gains the four nullable rec_* columns', () => {
    const sql = norm(code);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS rec_kind text CHECK (rec_kind IN ('round', 'own', 'room'))");
    for (const c of ['rec_round_id uuid', 'rec_table_no integer', 'rec_until timestamptz']) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    const alter = sql.slice(sql.indexOf('ALTER TABLE public.clarify_drafts'), sql.indexOf(';', sql.indexOf('ALTER TABLE public.clarify_drafts')));
    expect(alter).not.toContain('NOT NULL');
  });

  it('the scope CHECK name the migration drops is the one the scope migration created', () => {
    const first = norm(stripComments(read('20261112200000_p1631_clarify_scope.sql')));
    expect(first).toContain("ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'message' CHECK (scope IN ('message', 'thread', 'chat'))");
    expect(norm(code)).toContain('DROP CONSTRAINT IF EXISTS clarify_threads_scope_check');
  });

  it('clarify_start_recording is a closed definer function granted to authenticated alone', () => {
    const b = fnBody(raw, 'clarify_start_recording');
    expect(b).toContain('SECURITY DEFINER');
    expect(b).toContain("SET search_path = ''");
    const sql = norm(code);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_start_recording(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start_recording(uuid) TO authenticated;');
  });

  it('clarify_start_recording has the skeleton of clarify_start_chat: auth, the same lock key, sweep, busy', () => {
    const b = fnBody(raw, 'clarify_start_recording');
    expect(b).toContain("RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501'");
    expect(b).toContain("pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0))");
    expect(b).toContain('PERFORM public._clarify_sweep(v_uid)');
    expect(b).toContain("d.owner_id = v_uid AND d.state IN ('queued', 'running')");
    expect(b).toContain("jsonb_build_object('status', 'busy')");
    expect(b.indexOf("'busy'")).toBeLessThan(b.indexOf('transcribe_room_members'));
  });

  it('clarify_start_recording refuses a non-member, a room with no chat, a Mirror and a chat the presser cannot read, all as 42501 not available', () => {
    const b = fnBody(raw, 'clarify_start_recording');
    expect(b).toContain('m.room_id = p_room AND m.profile_id = v_uid');
    expect(b).toContain('v_room.conversation_id IS NULL');
    expect(b).toContain("v_conv.kind = 'mirror'");
    expect(b).toContain('public._chat_access_since(v_room.conversation_id, v_uid)');
    expect(b.match(/RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '42501'/g)?.length).toBe(2);
  });

  it('clarify_start_recording decides the read set at press time: round at a table, own at an event, room elsewhere', () => {
    const b = fnBody(raw, 'clarify_start_recording');
    expect(b).toContain("v_conv.kind = 'event'");
    expect(b).toContain('public._transcribe_decide_destination(p_room, v_seat)');
    expect(b).toContain("d.o_kind = 'round'");
    expect(b).toContain("v_kind := 'round'");
    expect(b).toContain("v_kind := 'own'");
    expect(b).toContain("v_kind := 'room'");
    expect(b).toContain("v_until timestamptz := clock_timestamp()");
    for (const f of [
      "(v_kind = 'round' AND x.dest_kind = 'round' AND x.dest_round_id = v_round AND x.dest_table_no = v_table)",
      "(v_kind = 'own' AND x.member_id = v_seat)",
      "v_kind = 'room'",
    ]) expect(b).toContain(f);
    expect(b).toContain("jsonb_build_object('status', 'empty')");
  });

  it('clarify_start_recording reuses the owner\'s thread for the room, else makes a Mirror root with no words in it', () => {
    const b = fnBody(raw, 'clarify_start_recording');
    expect(b).toContain("t.owner_id = v_uid AND t.scope = 'recording' AND t.recording_room_id = p_room");
    expect(b).toContain('m.id = v_thread.root_id AND m.deleted_at IS NULL');
    expect(b).toContain("'reused', true");
    expect(b).toContain("'reused', false");
    expect(b).toContain('v_mirror := public._chat_ensure_mirror(v_uid)');
    expect(b).toContain("VALUES (v_mirror, v_uid, NULL, 'clarify', v_snap, NULL, NULL, clock_timestamp())");
    const snap = b.slice(b.indexOf('v_snap := jsonb_build_object'), b.indexOf('IF v_ref IS NOT NULL'));
    for (const k of ["'scope', 'recording'", "'conversation_kind'", "'conversation_title'", "'recording_started_at'", "'recording_until'", "'created_at'"]) expect(snap).toContain(k);
    for (const dropped of ["'body'", "'author_name'", "'thread'", "'is_transcription'", "'system_kind'"]) expect(snap).not.toContain(dropped);
    expect(b).toContain("INSERT INTO public.clarify_threads (root_id, owner_id, scope, recording_room_id) VALUES (v_row.id, v_uid, 'recording', p_room)");
    expect(b).toContain('EXCEPTION WHEN unique_violation THEN');
  });

  it('_clarify_begin_recording is internal: definer, empty search_path, no client grant', () => {
    const b = fnBody(raw, '_clarify_begin_recording');
    expect(b).toContain('SECURITY DEFINER');
    expect(b).toContain("SET search_path = ''");
    const sql = norm(code);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin_recording(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._clarify_begin_recording/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_cited_recording_rows(jsonb, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._clarify_cited_recording_rows/);
  });

  it('the run applies the three read-set filters, stops at rec_until, and reads transcribe_messages only', () => {
    const b = fnBody(raw, '_clarify_begin_recording');
    for (const f of [
      "(v_kind = 'round' AND x.dest_kind = 'round' AND x.dest_round_id = v_round AND x.dest_table_no = v_table)",
      "(v_kind = 'own' AND x.member_id = v_seat)",
      "v_kind = 'room'",
      'x.spoken_at <= v_until',
      "NULLIF(btrim(x.text), '') IS NOT NULL",
      'LIMIT c_rows',
      'c_chars',
      'FOR SHARE SKIP LOCKED',
    ]) expect(b).toContain(f);
    // the lines come only from transcribe_messages: the one chat_messages read in the run is the owner's own typed directions, and published cards
    const lines = b.slice(b.indexOf('v_ids := ARRAY('), b.indexOf('v_source := jsonb_build_object'));
    expect(lines).toContain('transcribe_messages');
    expect(lines).not.toContain('chat_messages');
    // never a name: no profile name read anywhere in the run
    expect(b).not.toMatch(/p\.name|display_name/);
  });

  it('the run re-checks seat and access, takes the follow-up read set from the thread, and returns the run shape of _clarify_begin', () => {
    const b = fnBody(raw, '_clarify_begin_recording');
    expect(b).toContain('m.room_id = v_room AND m.profile_id = v_d.owner_id');
    expect(b).toContain("error_code = 'no_access'");
    expect(b).toContain('f.rec_kind IS NOT NULL AND f.rec_until IS NOT NULL');
    for (const k of ["'status', 'run'", "'draft_id'", "'run_token'", "'owner_id'", "'reserved_usd'", "'owner_instruction'", "'source_message'", "'thread', '[]'::jsonb", "'surrounding_chat'", "'already_drafted'", "'owner_messages'", "'latest_draft'", "'scope', 'recording'"]) {
      expect(b).toContain(k);
    }
    expect(b).toContain('public._mirror_reserve(v_d.owner_id, \'canvas\', v_usd)');
    expect(b).toContain("SET state = 'running'");
    expect(b).toContain('sent_ids = v_locked');
    // every distinct speaker's ref, so _clarify_erase_person keeps working
    expect(b).toContain('public._chat_author_ref(m.profile_id)');
    expect(b).toContain('FROM public.transcribe_room_members m');
  });

  it('_clarify_begin is its newest previous body plus only the marked dispatch', () => {
    const prev = newestBefore('_clarify_begin', FILE);
    expect(prev).toBe('20261112250000_p1631_event_only_exclusion.sql');
    const start = raw.indexOf('CREATE OR REPLACE FUNCTION public._clarify_begin(p_draft uuid)');
    expect(start).toBeGreaterThan(-1);
    const mineSrc = raw.slice(start, raw.indexOf('REVOKE ALL ON FUNCTION public._clarify_begin(uuid)'));
    expect(mineSrc.split('\n').filter((l) => l.includes(MARK)).length).toBe(3);
    expect(fnBody(unmarked(mineSrc), '_clarify_begin')).toBe(fnBody(read(prev), '_clarify_begin'));
    const b = fnBody(mineSrc, '_clarify_begin');
    expect(b).toContain("IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'recording' THEN RETURN public._clarify_begin_recording(p_draft); END IF;");
    // placed after the draft-state checks and before the first access read
    const at = b.indexOf("= 'recording' THEN");
    expect(at).toBeGreaterThan(b.indexOf('IF v_d.updated_at < now()'));
    expect(at).toBeLessThan(b.indexOf('v_since := public._chat_access_since'));
  });

  it('_clarify_begin keeps its grants', () => {
    const sql = norm(code);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;');
  });

  it('get_clarify_thread is its newest body with only the two cited lines replaced by marked lines', () => {
    const prev = newestBefore('get_clarify_thread', FILE);
    expect(prev).toBe('20261112150000_p1631_publish_to_chat.sql');
    const mineSrc = raw.slice(raw.indexOf('CREATE OR REPLACE FUNCTION public.get_clarify_thread('));
    const marked = mineSrc.split('\n').filter((l) => l.includes(MARK));
    expect(marked.length).toBe(2);
    const old = read(prev);
    const oldSrc = old.slice(old.indexOf('CREATE OR REPLACE FUNCTION public.get_clarify_thread('));
    const dropOld = oldSrc.split('\n').filter((l) => !/'a', public\._clarify_cited_rows\(d\.cited -> 'a', v_uid\),$/.test(l.trim()) && !/'b', public\._clarify_cited_rows\(d\.cited -> 'b', v_uid\)\) END$/.test(l.trim())).join('\n');
    expect(fnBody(unmarked(mineSrc), 'get_clarify_thread')).toBe(fnBody(dropOld, 'get_clarify_thread'));
    expect(marked[0]).toContain("public._clarify_cited_rows(d.cited -> 'a', v_uid) || public._clarify_cited_recording_rows(d.cited -> 'a', v_uid)");
    expect(marked[1]).toContain("public._clarify_cited_rows(d.cited -> 'b', v_uid) || public._clarify_cited_recording_rows(d.cited -> 'b', v_uid)");
    const sql = norm(code);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_clarify_thread(uuid) TO authenticated;');
  });

  it('cited recording rows read the text from transcribe_messages and need a seat in that room', () => {
    const b = fnBody(raw, '_clarify_cited_recording_rows');
    expect(b).toContain('JOIN public.transcribe_messages m ON m.id = i.id::uuid');
    expect(b).toContain("'text', left(m.text, 4000)");
    expect(b).toContain('s.room_id = m.room_id AND s.profile_id = p_uid');
  });
});
