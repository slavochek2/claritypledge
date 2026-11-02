/**
 * @file p1536-x9-review-migration.test.ts
 * @description Source contract for migration 20261102110000 (X9 review fixes). The behaviour is proved on the test database by
 * src/tests/integration/p1536-x9-voice.test.ts ("review fixes" blocks); this pins the SHAPE, and each fact fails against a mutated copy (gate 7).
 *   - _canvas_draft_expire is the v6 body plus ONLY: the 30-minute voice wait, the lazy lease stamp, and the three lease conditions (voice runs by
 *     ready_at, voice runs not yet landed by the wait, every other run by creation as before);
 *   - the transcript trigger function is the X9 body plus ONE stamp block that cannot wait on a lock or fail the transcript write;
 *   - canvas_voice_send is the X9 body with search_path '' and the key derived from the message the send returned, checked on every ok result.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FIX = '20261102110000_p1536_x9_review_fixes.sql';
const X9 = '20261102100000_p1536_x9_voice_notes.sql';
const V6 = '20261030080000_p1536_v6_engine.sql';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
function fnBody(sql: string, name: string): string {
  const code = stripComments(sql);
  const a = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (a < 0) throw new Error(`${name} not found`);
  return norm(code.slice(a, code.indexOf('$$;', code.indexOf('AS $$', a)) + 3));
}
const once = (body: string, from: string, to: string): string => {
  const n = body.split(from).length - 1;
  if (n !== 1) throw new Error(`edit source found ${n} times: ${from.slice(0, 70)}`);
  return body.replace(from, () => to);
};

function expectedExpire(v6: string): string {
  let b = fnBody(v6, '_canvas_draft_expire');
  b = once(b, "c_running CONSTANT interval := interval '5 minutes';", "c_running CONSTANT interval := interval '5 minutes'; c_voice_wait CONSTANT interval := interval '30 minutes';");
  b = once(b, 'BEGIN FOR v_c IN', "BEGIN UPDATE public.canvas_draft_runs r SET ready_at = now() WHERE r.owner_id = p_owner AND r.state = 'queued' AND r.input_kind = 'voice' AND r.ready_at IS NULL AND EXISTS (SELECT 1 FROM public.chat_messages t WHERE t.id = r.trigger_message_id AND t.transcript_status = 'done' AND btrim(COALESCE(t.transcript, '')) <> ''); FOR v_c IN");
  b = once(b, "AND ((r.state = 'queued' AND r.created_at < now() - c_queued) OR (r.state = 'running'",
    "AND ((r.state = 'queued' AND r.input_kind <> 'voice' AND r.created_at < now() - c_queued) OR (r.state = 'queued' AND r.input_kind = 'voice' AND r.ready_at IS NOT NULL AND r.ready_at < now() - c_queued) OR (r.state = 'queued' AND r.input_kind = 'voice' AND r.ready_at IS NULL AND r.created_at < now() - c_voice_wait) OR (r.state = 'running'");
  return norm(b);
}
function expectedTrigger(x9: string): string {
  const b = fnBody(x9, '_canvas_voice_transcript_settled');
  return norm(once(b, 'BEGIN SELECT decrypted_secret',
    "BEGIN UPDATE public.canvas_draft_runs r SET ready_at = now() WHERE r.id = (SELECT q.id FROM public.canvas_draft_runs q WHERE q.id = v_run AND q.state = 'queued' AND q.ready_at IS NULL FOR UPDATE SKIP LOCKED); EXCEPTION WHEN OTHERS THEN RAISE WARNING '_canvas_voice_transcript_settled: lease stamp failed (sqlstate %), the next engine call stamps it', SQLSTATE; END; BEGIN SELECT decrypted_secret"));
}
function expectedVoiceSend(x9: string): string {
  let b = fnBody(x9, 'canvas_voice_send');
  b = once(b, 'SET search_path = public, pg_temp', "SET search_path = ''");
  b = once(b, 'v_path text;', 'v_expect text;');
  const from = b.slice(b.indexOf("IF v_res ->> 'status' = 'ok' AND COALESCE"), b.indexOf('RETURN v_res;'));
  return norm(b.replace(from, () => "IF v_res ->> 'status' = 'ok' THEN SELECT lower(m.conversation_id::text) || '/' || lower(m.author_id::text) || '/' || lower(m.client_id::text) || '.wav' INTO v_expect FROM public.chat_messages m WHERE m.id = (v_res ->> 'message_id')::uuid; IF v_expect IS DISTINCT FROM p_object_key THEN RAISE EXCEPTION 'canvas send: that voice note is stored under another key' USING ERRCODE = '22023'; END IF; END IF; "));
}

const facts: Record<string, (sql: string) => boolean> = {
  expireIsTheV6BodyPlusTheVoiceLease: (sql) => fnBody(sql, '_canvas_draft_expire') === expectedExpire(read(V6)),
  triggerIsTheX9BodyPlusTheStamp: (sql) => fnBody(sql, '_canvas_voice_transcript_settled') === expectedTrigger(read(X9)),
  voiceSendIsTheX9BodyWithTheRepeatKeyCheck: (sql) => fnBody(sql, 'canvas_voice_send') === expectedVoiceSend(read(X9)),
  voiceSendHasAnEmptySearchPathAndQualifiesEverything: (sql) => {
    const b = fnBody(sql, 'canvas_voice_send');
    const unqualified = b.replace(/public\.\w+/g, '').match(/\b(chat_messages|canvas_workspace_send|chat_voice_audio|canvas_drafts|canvas_draft_runs)\b/g);
    return b.includes("SET search_path = ''") && !unqualified;
  },
  stampCannotWaitOnALock: (sql) => fnBody(sql, '_canvas_voice_transcript_settled').includes('FOR UPDATE SKIP LOCKED'),
  columnAndGrantsAreAdditive: (sql) => {
    const code = norm(stripComments(sql));
    return code.includes('ALTER TABLE public.canvas_draft_runs ADD COLUMN IF NOT EXISTS ready_at timestamptz;')
      && code.includes('GRANT SELECT (input_kind, ready_at) ON public.canvas_draft_runs TO authenticated;')
      && !/DROP |RENAME |ALTER COLUMN/.test(code);
  },
  grantsKept: (sql) => {
    const code = norm(stripComments(sql));
    return code.includes('REVOKE ALL ON FUNCTION public._canvas_draft_expire(uuid) FROM PUBLIC, anon, authenticated;')
      && code.includes('REVOKE ALL ON FUNCTION public._canvas_voice_transcript_settled() FROM PUBLIC, anon, authenticated;')
      && code.includes('GRANT EXECUTE ON FUNCTION public.canvas_voice_send(uuid, uuid, uuid, uuid, integer, boolean, text[], text, integer, jsonb, uuid) TO service_role;')
      && !/GRANT EXECUTE ON FUNCTION public\._canvas_draft_expire/.test(code);
  },
  definesOnlyWhatItNames: (sql) => {
    const names = [...stripComments(sql).matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]).sort();
    return JSON.stringify(names) === JSON.stringify(['_canvas_draft_expire', '_canvas_voice_transcript_settled', 'canvas_voice_send']);
  },
};

describe('migration 20261102110000: X9 review fixes', () => {
  const sql = read(FIX);
  it('every fact holds for the real file', () => {
    for (const [name, fact] of Object.entries(facts)) expect(fact(sql), name).toBe(true);
  });
  it('is the newest definition of each function it changes, after the applied X9 migration', () => {
    const files = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    const defs = (name: string) => files.filter((f) => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`).test(stripComments(read(f))));
    expect(defs('_canvas_draft_expire').pop()).toBe(FIX);
    expect(defs('_canvas_voice_transcript_settled').pop()).toBe(FIX);
    expect(defs('canvas_voice_send').pop()).toBe(FIX);
    expect(defs('canvas_workspace_send').pop(), 'the send itself is not touched here').toBe(X9);
    expect(FIX > X9, 'it runs after the migration it amends').toBe(true);
  });
  it('carries the header the migration gates read', () => {
    expect(sql).toMatch(/^-- diffed against: /m);
    expect(sql).toMatch(/^-- client-safe: /m);
  });

  describe('gate 7: each fact fails against a mutated copy of the real file', () => {
    const swap = (from: string, to: string) => {
      expect(sql.includes(from), `mutation source present: ${from.slice(0, 60)}`).toBe(true);
      return sql.replace(from, to);
    };
    it('the voice wait or the landing-based lease going back to creation age is caught', () => {
      expect(facts.expireIsTheV6BodyPlusTheVoiceLease!(swap("r.ready_at IS NOT NULL AND r.ready_at < now() - c_queued", "r.ready_at IS NOT NULL AND r.created_at < now() - c_queued"))).toBe(false);
      expect(facts.expireIsTheV6BodyPlusTheVoiceLease!(swap("r.created_at < now() - c_voice_wait", "r.created_at < now() - c_queued"))).toBe(false);
      expect(facts.expireIsTheV6BodyPlusTheVoiceLease!(swap("r.input_kind <> 'voice' AND r.created_at < now() - c_queued", "r.created_at < now() - c_queued"))).toBe(false);
    });
    it('dropping the lazy stamp, or the v6 failed-transcript arm, is caught', () => {
      expect(facts.expireIsTheV6BodyPlusTheVoiceLease!(swap("UPDATE public.canvas_draft_runs r SET ready_at = now()\n   WHERE r.owner_id = p_owner", "UPDATE public.canvas_draft_runs r SET ready_at = ready_at\n   WHERE r.owner_id = p_owner"))).toBe(false);
      expect(facts.expireIsTheV6BodyPlusTheVoiceLease!(swap("OR (r.state = 'queued' AND r.input_kind = 'voice' AND t.id IS NOT NULL", "OR (r.state = 'queued' AND false AND t.id IS NOT NULL"))).toBe(false);
    });
    it('a stamp that can wait on a lock, or that loses its own block, is caught', () => {
      expect(facts.stampCannotWaitOnALock!(swap('FOR UPDATE SKIP LOCKED', 'FOR UPDATE'))).toBe(false);
      expect(facts.triggerIsTheX9BodyPlusTheStamp!(swap("RAISE WARNING '_canvas_voice_transcript_settled: lease stamp failed", "RAISE EXCEPTION '_canvas_voice_transcript_settled: lease stamp failed"))).toBe(false);
    });
    it('the repeat going unchecked, or a search_path that is not empty, is caught', () => {
      expect(facts.voiceSendIsTheX9BodyWithTheRepeatKeyCheck!(swap("IF v_res ->> 'status' = 'ok' THEN", "IF v_res ->> 'status' = 'ok' AND COALESCE((v_res ->> 'replayed')::boolean, false) = false THEN"))).toBe(false);
      expect(facts.voiceSendHasAnEmptySearchPathAndQualifiesEverything!(swap("SET search_path = ''\nAS $$\nDECLARE\n  v_sub", "SET search_path = public, pg_temp\nAS $$\nDECLARE\n  v_sub"))).toBe(false);
    });
    it('a destructive change to the table, or a client grant on the function, is caught', () => {
      expect(facts.columnAndGrantsAreAdditive!(sql + '\nALTER TABLE public.canvas_draft_runs DROP COLUMN spend_id;')).toBe(false);
      expect(facts.grantsKept!(swap('TO service_role;', 'TO authenticated;'))).toBe(false);
      expect(facts.definesOnlyWhatItNames!(sql + '\nCREATE OR REPLACE FUNCTION public.extra() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;')).toBe(false);
    });
  });
});
