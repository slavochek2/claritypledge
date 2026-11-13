/**
 * @file p1631-clarify-scope.test.ts
 * @description P1631 Clarify scopes: source contract for 20261112200000_p1631_clarify_scope.sql, and the model payload.
 *   - clarify_threads.scope with its CHECK; clarify_start writes it; clarify_start_chat is a closed definer function;
 *   - _clarify_begin and point_chat_shared are their newest body plus only the marked lines;
 *   - the model payload carries scope, and the pressed row loses is_pressed for thread and chat.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClarifyRequest, type ClarifyRun } from '../../supabase/functions/clarify-draft/clarify-model';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261112200000_p1631_clarify_scope.sql';
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

describe('20261112200000 clarify scope migration', () => {
  it('adds the scope column with the three values and a default', () => {
    expect(norm(code)).toContain(
      "ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'message' CHECK (scope IN ('message', 'thread', 'chat'))",
    );
  });

  it('clarify_start writes the scope on the thread and returns it', () => {
    const b = fnBody(raw, 'clarify_start');
    expect(b).toContain('INSERT INTO public.clarify_threads (root_id, owner_id, scope) VALUES (v_row.id, v_uid, v_scope)');
    expect(b).toContain("'scope', v_scope");
    expect(b).toContain("v_scope := 'thread'");
    expect(b).toContain("'outside_rounds'");
    expect(b).toContain('transcribe_session_threads');
  });

  it('clarify_start_chat is SECURITY DEFINER, empty search_path, granted to authenticated alone', () => {
    const b = fnBody(raw, 'clarify_start_chat');
    expect(b).toContain('SECURITY DEFINER');
    expect(b).toContain("SET search_path = ''");
    const sql = norm(code);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_start_chat(uuid, boolean) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start_chat(uuid, boolean) TO authenticated;');
  });

  it('clarify_start_chat refuses a mirror, returns empty, and rewrites the snapshot keys', () => {
    const b = fnBody(raw, 'clarify_start_chat');
    expect(b).toContain("v_kind = 'mirror'");
    expect(b).toContain("USING ERRCODE = '22023'");
    expect(b).toContain("jsonb_build_object('status', 'empty')");
    expect(b).toContain("jsonb_build_object('scope', 'chat', 'new_point', NOT p_draft");
    for (const k of ["'conversation_kind'", "'conversation_title'", "'created_at'", "'conversation_title_ref'"]) expect(b).toContain(k);
    for (const dropped of ["'body'", "'author_name'", "'thread'", "'thread_total'", "'is_transcription'", "'system_kind'", "'session_thread'"]) {
      expect(b.slice(b.indexOf('v_snap := jsonb_build_object'), b.indexOf('UPDATE public.chat_messages'))).not.toContain(dropped);
    }
    expect(b).toContain('attachment_kind = NULL, attachment_id = NULL');
    expect(b).toContain("VALUES (v_row.id, v_uid, 'chat')");
  });

  it('clarify_start_chat is not authenticated, locks, sweeps and answers busy only when drafting', () => {
    const b = fnBody(raw, 'clarify_start_chat');
    expect(b).toContain("RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501'");
    expect(b).toContain("pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0))");
    expect(b).toContain('PERFORM public._clarify_sweep(v_uid)');
    expect(b).toContain("IF p_draft AND EXISTS");
    expect(b).toContain("d.state IN ('queued', 'running')");
    expect(b).toContain('IF p_draft THEN INSERT INTO public.clarify_drafts');
  });

  it('_clarify_begin drops pressed_author outside message scope and returns the scope', () => {
    const b = fnBody(raw, '_clarify_begin');
    expect(b).toContain("FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message'");
    expect(b).toContain("IF v_scope <> 'message' THEN v_source := v_source - 'pressed_author'; END IF;");
    expect(b).toContain("'scope', v_scope");
  });

  it('_clarify_begin is its newest previous body plus only the marked lines', () => {
    const prev = newestBefore('_clarify_begin', FILE);
    expect(prev).toBe('20261111183000_p1631_refine_target_only_for_refines.sql');
    // drop the added lines; the one CHANGED line is the final latest_draft entry, which gained a comma and lost its closing `);`
    const unmarked = (s: string) => s.split('\n').filter((l) => !/-- P1631 scope/.test(l)).join('\n');
    // and the chat selection's `AND x.thread_root_id IS NULL` became the marked scope condition
    const mine = fnBody(unmarked(raw), '_clarify_begin')
      .replace("'latest_draft', v_latest, END;", "'latest_draft', v_latest); END;")
      .replace("WHERE x.conversation_id = v_d.source_conversation_id AND x.kind = 'message'", "WHERE x.conversation_id = v_d.source_conversation_id AND x.thread_root_id IS NULL AND x.kind = 'message'");
    const theirs = fnBody(read(prev), '_clarify_begin');
    expect(mine).toBe(theirs);
  });

  it('clarify_start_chat clears forward_author_id on the rewritten copy (nullable, no CHECK needs it)', () => {
    const b = fnBody(raw, 'clarify_start_chat');
    expect(b).toContain('attachment_kind = NULL, attachment_id = NULL, forward_author_id = NULL WHERE m.id = v_row.id');
    const chat = read('20261019203000_p1512_clarity_chat.sql');
    expect(chat).toMatch(/forward_author_id\s+uuid[^,\n]*,/);
    expect(chat).not.toMatch(/forward_author_id\s+uuid[^,\n]*NOT NULL/);
    expect(chat).toContain("kind = 'message' OR deleted_at IS NOT NULL OR forward_snapshot IS NOT NULL");
  });

  it('already_drafted also lists live published points of the source chat the presser can read, once per point', () => {
    const b = fnBody(raw, '_clarify_begin');
    expect(b).toContain("SELECT v_already || COALESCE(jsonb_agg(q.statement ORDER BY q.created_at, q.point_id), '[]'::jsonb) INTO v_already FROM (");
    // comments are stripped from `b`, so the next real statement is the boundary
    const sel = b.slice(b.indexOf('SELECT v_already ||'), b.indexOf('SELECT COALESCE(jsonb_agg(left(o.body, 500)'));
    expect(b.indexOf('SELECT COALESCE(jsonb_agg(left(o.body, 500)')).toBeGreaterThan(b.indexOf('SELECT v_already ||'));
    expect(sel).toContain('FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id JOIN public.points p ON p.id = s.point_id');
    expect(sel).toContain('s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL');
    expect(sel).toContain("m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since");
    expect(sel).toContain("d4.state = 'done' AND d4.point_id = s.point_id");
  });

  it('chat scope reads ordinary threads but never round, outside-rounds or session threads; scope is read first', () => {
    const b = fnBody(raw, '_clarify_begin');
    const start = b.indexOf('v_chat_ids := ARRAY(');
    const end = b.indexOf('SELECT COALESCE(array_agg(q.id)', start); // the lock pass that follows the selection
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const sel = b.slice(start, end);
    expect(sel).toContain("(x.thread_root_id IS NULL OR (v_scope = 'chat' AND NOT EXISTS (SELECT 1 FROM public.chat_messages r WHERE r.id = x.thread_root_id AND (r.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id)))))");
    expect(sel).toContain('LIMIT c_rows');
    expect(sel).toContain('GREATEST(c_chars - v_thread_chars, 0)');
    // v_scope is assigned before the first row selection that uses it
    expect(b.indexOf('INTO v_scope')).toBeGreaterThan(-1);
    expect(b.indexOf('INTO v_scope')).toBeLessThan(b.indexOf('v_thread_ids := ARRAY('));
    // message and thread scope: the thread selection is untouched
    expect(b.slice(b.indexOf('v_thread_ids := ARRAY('), b.indexOf('v_chat_ids := ARRAY('))).not.toContain('v_scope');
  });

  it('_point_position_write_ok: an unpublished Clarify draft is owner-only, and the body is the newest plus marked lines', () => {
    const prev = newestBefore('_point_position_write_ok', FILE);
    expect(prev).toBe('20261112180000_p1631_publish_read_cost.sql');
    const mine = fnBody(raw, '_point_position_write_ok');
    expect(mine).toContain('WHEN NOT EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p_point) AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.point_id = p_point) THEN true');
    expect(mine).toContain('p.first_validator_id = auth.uid()) THEN true');
    expect(mine).toContain('ELSE public._point_chat_readable_by_me(p_point)');
    // exact: the old body with the first WHEN extended
    const old = fnBody(read(prev), '_point_position_write_ok');
    expect(mine.replace(' AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.point_id = p_point)', '')).toBe(old);
    const sql = norm(code);
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS clarify_drafts_point ON public.clarify_drafts (point_id) WHERE point_id IS NOT NULL;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._point_position_write_ok(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._point_position_write_ok(uuid) TO authenticated;');
  });

  it('clarify_start is its newest previous body plus only the marked lines', () => {
    const prev = newestBefore('clarify_start', FILE);
    expect(prev).toBe('20261110170000_p1631_review_fixes.sql');
    const mine = fnBody(raw, 'clarify_start');
    for (const frag of ['v_uid uuid := auth.uid()', "'p1631:clarify:' || v_uid::text", 'PERFORM public._clarify_sweep(v_uid)', 'EXCEPTION WHEN unique_violation THEN']) {
      expect(mine).toContain(frag);
      expect(fnBody(read(prev), 'clarify_start')).toContain(frag);
    }
  });

  it('point_chat_shared asks _point_chat_readable_by_me and keeps the owner branch and the live-card test', () => {
    const b = fnBody(raw, 'point_chat_shared');
    expect(b).toContain('public._point_has_live_share(p_point)');
    expect(b).toContain('p.first_validator_id = auth.uid()');
    expect(b).toContain('public._point_chat_readable_by_me(p_point)');
    expect(b).not.toContain('chat_shared_point_ids');
    expect(newestBefore('point_chat_shared', FILE)).toBe('20261112170000_p1631_publish_fixes.sql');
    expect(norm(code)).toContain('GRANT EXECUTE ON FUNCTION public.point_chat_shared(uuid) TO authenticated;');
  });

  it('keeps every grant of the replaced functions as the newest files had them', () => {
    const sql = norm(code);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start(uuid) TO authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;');
  });

  it('has the header lines of the house convention', () => {
    expect(raw).toMatch(/^-- client-safe:/m);
    expect(raw).toContain('diffed against:');
  });
});

describe('20261112220000 chat scope fixes migration', () => {
  const FIX = '20261112220000_p1631_chat_scope_fixes.sql';
  const fixRaw = read(FIX);
  const MARK = '-- P1631 chat scope fixes';
  const unmarked = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');

  it('has the header lines of the house convention and names its sources', () => {
    expect(fixRaw).toMatch(/^-- client-safe:/m);
    expect(fixRaw).toContain('diffed against:');
    expect(fixRaw).toContain('20261112200000_p1631_clarify_scope.sql');
  });

  it('replaces from the newest bodies: 200000 is the newest definition of both before this file', () => {
    expect(newestBefore('clarify_start_chat', FIX)).toBe(FILE);
    expect(newestBefore('_clarify_begin', FIX)).toBe(FILE);
  });

  it('clarify_start_chat is the 200000 body plus only the marked lines; the anchor needs system_kind IS NULL', () => {
    const mine = fnBody(fixRaw, 'clarify_start_chat');
    const anchor = mine.slice(mine.indexOf('SELECT m.* INTO v_anchor'), mine.indexOf('IF NOT FOUND'));
    expect(anchor).toContain('m.system_kind IS NULL');
    expect(anchor).toContain('m.thread_root_id IS NULL');
    expect(fnBody(unmarked(fixRaw), 'clarify_start_chat')).toBe(fnBody(raw, 'clarify_start_chat'));
    expect(fnBody(raw, 'clarify_start_chat')).not.toContain('system_kind');
  });

  it('_clarify_begin is the 200000 body plus only the marked lines (nothing changed or removed)', () => {
    expect(fnBody(unmarked(fixRaw), '_clarify_begin')).toBe(fnBody(raw, '_clarify_begin'));
  });

  it('chat scope chat selection requires system_kind IS NULL; message and thread scope are not affected', () => {
    const b = fnBody(fixRaw, '_clarify_begin');
    // comments are stripped from `b`, so the lock pass's first statement is the boundary
    const chatSel = b.slice(b.indexOf('v_chat_ids := ARRAY('), b.indexOf('SELECT COALESCE(array_agg(q.id)'));
    expect(b.indexOf('SELECT COALESCE(array_agg(q.id)')).toBeGreaterThan(b.indexOf('v_chat_ids := ARRAY('));
    expect(chatSel).toContain("AND (v_scope <> 'chat' OR x.system_kind IS NULL)");
    // the thread selection: empty for a chat-scope run whose anchor has a system_kind
    const threadSel = b.slice(b.indexOf('v_thread_ids := ARRAY('), b.indexOf('v_chat_ids := ARRAY('));
    expect(threadSel).toContain("AND NOT (v_scope = 'chat' AND v_src.system_kind IS NOT NULL)");
    // every new condition is guarded by v_scope = 'chat', so the other scopes read as before
    for (const frag of ["v_scope <> 'chat' OR", "v_scope = 'chat' AND v_src"]) expect(b).toContain(frag);
  });

  it('re-anchors only in chat scope, with the anchor filter, and updates the queued draft row', () => {
    const b = fnBody(fixRaw, '_clarify_begin');
    const at = b.indexOf("= 'chat' THEN SELECT m.id INTO v_anchor");
    expect(at).toBeGreaterThan(-1);
    expect(b.slice(b.lastIndexOf('IF COALESCE((SELECT t.scope', at), at)).toContain("FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message')");
    const blk = b.slice(at, b.indexOf('SELECT m.* INTO v_src FROM public.chat_messages m WHERE m.id = v_d.source_message_id'));
    for (const f of [
      'm.conversation_id = v_d.source_conversation_id', 'm.thread_root_id IS NULL', "m.kind = 'message'", 'm.context_conversation_id IS NULL',
      'm.system_kind IS NULL', 'm.deleted_at IS NULL', 'm.created_at >= v_since', 'm.created_at <= v_d.created_at',
      'public._clarify_row_text(m) IS NOT NULL', 'ORDER BY m.created_at DESC, m.id DESC LIMIT 1',
      'IF v_anchor IS NOT NULL AND v_anchor IS DISTINCT FROM v_d.source_message_id THEN',
      "UPDATE public.clarify_drafts d SET source_message_id = v_anchor WHERE d.id = p_draft AND d.state = 'queued'",
      'v_d.source_message_id := v_anchor',
    ]) expect(blk, f).toContain(f);
    // there is exactly one UPDATE of source_message_id, and it sits inside that chat-scope block; the re-anchor runs before the source read
    expect(b.match(/SET source_message_id/g)).toHaveLength(1);
    expect(b.indexOf('INTO v_anchor')).toBeLessThan(b.indexOf('SELECT m.* INTO v_src FROM public.chat_messages m WHERE m.id = v_d.source_message_id'));
    // a missing anchor leaves the old source_gone path as it was
    expect(b).toContain("error_code = 'source_gone'");
  });

  it('keeps every REVOKE/GRANT of both functions', () => {
    const sql = norm(stripComments(fixRaw));
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_start_chat(uuid, boolean) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start_chat(uuid, boolean) TO authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;');
  });
});

describe('20261112230000 review fixes migration: derived_refs of the published points', () => {
  const REV = '20261112230000_p1631_review_fixes.sql';
  const revRaw = read(REV);
  const MARK = '-- P1631 review fixes';
  const unmarked = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');

  it('_clarify_begin is the newest previous body (220000) plus only marked lines', () => {
    expect(newestBefore('_clarify_begin', REV)).toBe('20261112220000_p1631_chat_scope_fixes.sql');
    expect(fnBody(unmarked(revRaw), '_clarify_begin')).toBe(fnBody(read('20261112220000_p1631_chat_scope_fixes.sql'), '_clarify_begin'));
    expect(revRaw).toMatch(/^-- client-safe:/m);
    expect(revRaw).toContain('diffed against:');
  });

  it('adds the refs of the drafts behind the published points, with the already_drafted filter, before the draft row is re-read', () => {
    const b = fnBody(revRaw, '_clarify_begin');
    const at = b.indexOf('SELECT unnest(d5.derived_refs) AS ref FROM public.clarify_drafts d5');
    expect(at).toBeGreaterThan(-1);
    const blk = b.slice(at, b.indexOf('SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE'));
    for (const f of [
      "d5.state = 'done' AND d5.point_id IN (",
      'FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id',
      's.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL',
      "m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since",
    ]) expect(blk, f).toContain(f);
    // it unions what v_refs already holds, so the earlier refs are kept
    expect(b.slice(b.lastIndexOf('INTO v_refs FROM (', at), at)).toContain("SELECT unnest(COALESCE(v_refs, '{}')) AS ref UNION");
    // and it runs after the earlier union and before the draft row's refs are written (derived_refs = COALESCE(v_refs
    expect(at).toBeGreaterThan(b.indexOf("SELECT unnest(d2.derived_refs) AS ref"));
    expect(at).toBeLessThan(b.indexOf('derived_refs = COALESCE(v_refs'));
  });

  it('keeps the grants of _clarify_begin', () => {
    const sql = norm(stripComments(revRaw));
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;');
  });
});

describe('20261112240000 adversary fixes migration: clarify functions', () => {
  const ADV = '20261112240000_p1631_adversary_fixes.sql';
  const advRaw = read(ADV);
  const MARK = '-- P1631 adversary fixes';
  const unmarked = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');

  it('names its sources and replaces from the newest bodies', () => {
    expect(advRaw).toMatch(/^-- client-safe:/m);
    expect(advRaw).toContain('diffed against:');
    expect(newestBefore('clarify_start_chat', ADV)).toBe('20261112220000_p1631_chat_scope_fixes.sql');
    expect(newestBefore('_clarify_begin', ADV)).toBe('20261112230000_p1631_review_fixes.sql');
  });

  it('clarify_start_chat is the 220000 body plus only marked lines; the anchor excludes transcribed lines', () => {
    expect(fnBody(unmarked(advRaw), 'clarify_start_chat')).toBe(fnBody(read('20261112220000_p1631_chat_scope_fixes.sql'), 'clarify_start_chat'));
    const mine = fnBody(advRaw, 'clarify_start_chat');
    const anchor = mine.slice(mine.indexOf('SELECT m.* INTO v_anchor'), mine.indexOf('IF NOT FOUND'));
    expect(anchor).toContain('m.is_transcription = false');
    expect(anchor).toContain('m.system_kind IS NULL');
  });

  it('_clarify_begin is the 230000 body plus only marked lines (whole-body comparison)', () => {
    expect(fnBody(unmarked(advRaw), '_clarify_begin')).toBe(fnBody(read('20261112230000_p1631_review_fixes.sql'), '_clarify_begin'));
  });

  it('transcribed lines: not the re-anchor target, and not surrounding chat in ANY scope', () => {
    const b = fnBody(advRaw, '_clarify_begin');
    const re = b.slice(b.indexOf('SELECT m.id INTO v_anchor'), b.indexOf('IF v_anchor IS NOT NULL'));
    expect(re).toContain('m.is_transcription = false');
    const chatSel = b.slice(b.indexOf('v_chat_ids := ARRAY('), b.indexOf('SELECT COALESCE(array_agg(q.id)'));
    expect(chatSel).toContain('AND x.is_transcription = false');
    // unconditional: not guarded by v_scope
    expect(chatSel).not.toMatch(/v_scope[^)]*is_transcription|is_transcription[^)]*v_scope/);
    // the thread selection (the pressed row's own thread) is not filtered
    expect(b.slice(b.indexOf('v_thread_ids := ARRAY('), b.indexOf('v_chat_ids := ARRAY('))).not.toContain('is_transcription');
  });

  it('already_drafted and the derived_refs union skip a card inside a round, outside-rounds or session thread, and use one filter', () => {
    const b = fnBody(advRaw, '_clarify_begin');
    const THREAD = '(m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id))))';
    const already = b.slice(b.indexOf('SELECT v_already ||'), b.indexOf('SELECT COALESCE(jsonb_agg(left(o.body, 500)'));
    expect(already).toContain(THREAD);
    const refs = b.slice(b.indexOf('SELECT unnest(d5.derived_refs)'), b.indexOf('SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE'));
    expect(refs.split(THREAD).length - 1, 'the filter is in the draft-refs subselect and in the publisher-ref select').toBe(2);
  });

  it("adds the publisher's own ref for each published point shown", () => {
    const b = fnBody(advRaw, '_clarify_begin');
    const at = b.indexOf('SELECT public._chat_author_ref(s.shared_by) AS ref FROM public.point_chat_shares s');
    expect(at).toBeGreaterThan(-1);
    expect(b.slice(b.lastIndexOf('INTO v_refs FROM (', at), at)).toContain("SELECT unnest(COALESCE(v_refs, '{}')) AS ref UNION");
    expect(at).toBeLessThan(b.indexOf('SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE'));
    expect(b.slice(at, at + 700)).toContain('m.created_at >= v_since');
  });

  it('keeps the grants of both clarify functions', () => {
    const sql = norm(stripComments(advRaw));
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_start_chat(uuid, boolean) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start_chat(uuid, boolean) TO authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;');
  });
});

describe('20261112250000 event-only exclusion migration: clarify functions', () => {
  const EV = '20261112250000_p1631_event_only_exclusion.sql';
  const evRaw = read(EV);
  const PREV = '20261112240000_p1631_adversary_fixes.sql';
  const MARK = 'P1631 event only';
  /** comments kept: the replaced lines are compared as text */
  const rawFn = (sql: string, name: string) => {
    const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    return sql.slice(i, sql.indexOf('$$;', sql.indexOf('AS $$', i)) + 3);
  };
  /** the older lines this file replaces in place, by their text up to the trailing comment */
  const REPLACED = [
    'AND m.is_transcription = false',
    "AND NOT (v_scope = 'chat' AND v_src.system_kind IS NOT NULL)",
    "OR (v_scope = 'chat' AND NOT EXISTS (SELECT 1 FROM public.chat_messages r",
    'OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id))))) -- P1631 scope',
    "AND (v_scope <> 'chat' OR x.system_kind IS NULL)",
    'AND x.is_transcription = false',
    'AND (m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr',
  ];
  const withoutNew = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');
  const withoutOld = (s: string) => s.split('\n').filter((l) => !REPLACED.some((p) => l.trim().startsWith(p))).join('\n');

  it('names its sources, and 240000 is the newest definition of all three functions before it', () => {
    expect(evRaw).toMatch(/^-- client-safe:/m);
    expect(evRaw).toContain('diffed against:');
    expect(newestBefore('clarify_start_chat', EV)).toBe(PREV);
    expect(newestBefore('_clarify_begin', EV)).toBe(PREV);
  });

  for (const name of ['clarify_start_chat', '_clarify_begin']) {
    it(`${name}: the body is the 240000 body once the replaced old lines and the marked new lines are removed`, () => {
      expect(withoutNew(rawFn(evRaw, name))).toBe(withoutOld(rawFn(read(PREV), name)));
      expect(rawFn(evRaw, name)).toContain(MARK);
    });
  }

  it('the anchor and re-anchor exclude transcribed lines only at an event; system_kind IS NULL stays everywhere', () => {
    const s = fnBody(evRaw, 'clarify_start_chat');
    const anchor = s.slice(s.indexOf('SELECT m.* INTO v_anchor'), s.indexOf('IF NOT FOUND'));
    expect(anchor).toContain("AND (v_kind <> 'event' OR m.is_transcription = false)");
    expect(anchor).toContain('m.system_kind IS NULL');
    const b = fnBody(evRaw, '_clarify_begin');
    const re = b.slice(b.indexOf('SELECT m.id INTO v_anchor'), b.indexOf('IF v_anchor IS NOT NULL'));
    expect(re).toContain('AND (NOT v_event OR m.is_transcription = false)');
    expect(re).toContain('m.system_kind IS NULL');
  });

  it('v_event is read once, from the source conversation kind, before first use', () => {
    const b = fnBody(evRaw, '_clarify_begin');
    expect(b.match(/INTO v_event/g)).toHaveLength(1);
    expect(b).toContain("SELECT COALESCE((SELECT c.kind = 'event' FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id), false) INTO v_event");
    expect(b.indexOf('INTO v_event')).toBeLessThan(b.indexOf('SELECT m.id INTO v_anchor'));
  });

  it('the chat selection: thread replies and root rows are excluded only at an event; transcribed lines at an event except the presser\'s own', () => {
    const b = fnBody(evRaw, '_clarify_begin');
    const sel = b.slice(b.indexOf('v_chat_ids := ARRAY('), b.indexOf('SELECT COALESCE(array_agg(q.id)'));
    expect(sel).toContain("OR (v_scope = 'chat' AND (NOT v_event OR NOT EXISTS (SELECT 1 FROM public.chat_messages r WHERE r.id = x.thread_root_id AND (r.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id))))))");
    expect(sel).toContain("AND (v_scope <> 'chat' OR NOT v_event OR x.system_kind IS NULL)");
    expect(sel).toContain('AND (NOT v_event OR x.is_transcription = false OR x.author_id = v_d.owner_id)');
    // the budget and the row cap are the ones before
    expect(sel).toContain('LIMIT c_rows');
    expect(sel).toContain('GREATEST(c_chars - v_thread_chars, 0)');
    // the thread guard applies at an event only
    const thr = b.slice(b.indexOf('v_thread_ids := ARRAY('), b.indexOf('v_chat_ids := ARRAY('));
    expect(thr).toContain("AND NOT (v_scope = 'chat' AND v_event AND v_src.system_kind IS NOT NULL)");
  });

  it('the three published-card thread filters (already_drafted, draft refs, publisher ref) are the same event-only filter', () => {
    const b = fnBody(evRaw, '_clarify_begin');
    const THREAD = '(NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id))))';
    expect(b.split(THREAD).length - 1).toBe(3);
  });

  it('keeps the grants of both clarify functions', () => {
    const sql = norm(stripComments(evRaw));
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.clarify_start_chat(uuid, boolean) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.clarify_start_chat(uuid, boolean) TO authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;');
  });
});

describe('20261112260000 point card migration: _clarify_row_text', () => {
  const PC = '20261112260000_p1631_clarify_point_card.sql';
  const pcRaw = read(PC);
  const MARK = '-- P1631 point card';
  const rawFn = (sql: string) => {
    const i = sql.indexOf('CREATE OR REPLACE FUNCTION public._clarify_row_text(');
    return sql.slice(i, sql.indexOf('$$;', sql.indexOf('AS $$', i)) + 3);
  };

  it('is the only earlier definition of _clarify_row_text that this replaces, and names it in the header', () => {
    expect(newestBefore('_clarify_row_text', PC)).toBe('20261110153000_p1631_clarify_drafts.sql');
    expect(pcRaw).toMatch(/^-- client-safe:/m);
    expect(pcRaw).toContain('diffed against:');
    expect(readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && /FUNCTION\s+public\._clarify_row_text\s*\(/i.test(read(f))).sort()).toEqual(['20261110153000_p1631_clarify_drafts.sql', PC]);
  });

  it('the body is the old body once the marked lines and the old closing line (`END);`) are removed; only that line is replaced', () => {
    const mine = rawFn(pcRaw).split('\n').filter((l) => !l.includes(MARK)).join('\n');
    const old = rawFn(read('20261110153000_p1631_clarify_drafts.sql')).split('\n').filter((l) => !l.trim().startsWith('CASE WHEN x.audio_duration_ms IS NOT NULL')).join('\n');
    expect(mine).toBe(old);
  });

  it('returns the statement as "Point: ..." for a live point card with no text, only when the point is public or this card is its share', () => {
    const b = fnBody(pcRaw, '_clarify_row_text');
    expect(b).toContain("CASE WHEN x.attachment_kind = 'point' AND x.deleted_at IS NULL THEN");
    expect(b).toContain("SELECT 'Point: ' || NULLIF(btrim(p.statement), '') FROM public.points p WHERE p.id = x.attachment_id");
    expect(b).toContain("p.visibility = 'public'::public.content_visibility OR EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p.id AND s.message_id = x.id)");
    // the point is the LAST resort: a body and a finished voice transcript still win
    expect(b.indexOf('NULLIF(btrim(x.body)')).toBeLessThan(b.indexOf('x.transcript_status'));
    expect(b.indexOf('x.transcript_status')).toBeLessThan(b.indexOf("x.attachment_kind = 'point'"));
  });

  it('keeps the signature, volatility, search_path and the closed grants', () => {
    const b = fnBody(pcRaw, '_clarify_row_text');
    expect(b).toContain('_clarify_row_text(x public.chat_messages) RETURNS text LANGUAGE sql STABLE SET search_path = \'\'');
    expect(b).not.toContain('SECURITY DEFINER');
    expect(norm(stripComments(pcRaw))).toContain('REVOKE ALL ON FUNCTION public._clarify_row_text(public.chat_messages) FROM PUBLIC, anon, authenticated;');
    expect(norm(stripComments(pcRaw))).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._clarify_row_text/);
  });

  it('the callers named in the header are the only functions that call it (newest definitions)', () => {
    // every migration that mentions it: its definer, _clarify_begin / _clarify_cited_rows / clarify_start_chat bodies, and nothing else
    const callers = new Set<string>();
    for (const f of readdirSync(MIG).filter((x) => /^\d{14}_.*\.sql$/.test(x))) {
      let fn = '';
      for (const l of read(f).split('\n')) {
        const m = /^CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?(\w+)/.exec(l);
        if (m) fn = m[1]!;
        if (l.includes('_clarify_row_text') && !l.trim().startsWith('--') && fn !== '_clarify_row_text') callers.add(fn);
      }
    }
    expect([...callers].sort()).toEqual(['_clarify_begin', '_clarify_cited_rows', 'clarify_start_chat']);
  });
});

// ── the model ──

const run = (over: Partial<ClarifyRun> = {}): ClarifyRun => ({
  status: 'run', draft_id: 'd', run_token: 't', owner_id: 'o', reserved_usd: 0.1, owner_instruction: null,
  source_message: { id: 'src', text: 'pressed text', is_pressed: true, pressed_author: 'owner' },
  thread: [{ id: 't1', text: 'thread row' }], surrounding_chat: [{ id: 'c1', text: 'chat row' }], already_drafted: [], ...over,
});
const payload = (r: ClarifyRun, limit?: number) => {
  const built = buildClarifyRequest(r, { system: 'sys', limit });
  const text = built!.request.contents[0]!.parts[0]!.text;
  return JSON.parse(text.slice(text.indexOf('\n') + 1)) as { scope: string; pressed_author: string | null; transcript_rows: Array<{ id: string; is_pressed?: boolean }> };
};

describe('clarify model scope', () => {
  it('the payload carries scope, defaulting to message', () => {
    expect(payload(run()).scope).toBe('message');
    expect(payload(run({ scope: 'thread' })).scope).toBe('thread');
    expect(payload(run({ scope: 'chat' })).scope).toBe('chat');
  });

  it('message scope marks the pressed row', () => {
    const rows = payload(run({ scope: 'message' })).transcript_rows;
    expect(rows.find((r) => r.id === 'src')?.is_pressed).toBe(true);
  });

  for (const scope of ['thread', 'chat'] as const) {
    it(`${scope} scope leaves the pressed row unmarked but present`, () => {
      const p = payload(run({ scope, source_message: { id: 'src', text: 'pressed text', is_pressed: true } }));
      expect(p.transcript_rows.some((r) => r.is_pressed)).toBe(false);
      expect(p.transcript_rows.some((r) => r.id === 'src')).toBe(true);
      expect(p.pressed_author).toBeNull();
    });
  }

  it('trimming still keeps the pressed row in thread and chat scope', () => {
    const big = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, text: 'x'.repeat(2000) }));
    for (const scope of ['thread', 'chat'] as const) {
      const p = payload(run({ scope, thread: big(40, 't'), surrounding_chat: big(60, 'c') }), 8000);
      expect(p.transcript_rows.some((r) => r.id === 'src')).toBe(true);
      expect(p.transcript_rows.length).toBeLessThan(101);
    }
  });
});
