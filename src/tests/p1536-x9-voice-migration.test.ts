/**
 * @file p1536-x9-voice-migration.test.ts
 * @description P1536 3c X9 source contract for migration 20261102100100 (voice notes in every canvas thread):
 *   - the send exists ONCE: canvas_workspace_send is the v6 body plus ONE gate (a voice attachment from anyone but the service role is refused,
 *     before any write), so every guard it had stays; canvas_voice_send calls it, so a voice note meets every one of them;
 *   - canvas_voice_send is service-role only, acts for the id it is given by making auth.uid() that id and the role claim 'service_role' for its
 *     own transaction only (restored before it returns), and refuses a note stored under any key but the validated one. The gate reads the role
 *     claim, which a client's signed token cannot carry, so it is exactly as strong as every auth.uid() policy in the database: no new flag;
 *   - the transcript trigger settles a failed transcript through the engine's own expire step, dispatches a finished one in a SEPARATE
 *     exception block, and cannot fail the transcript write.
 * Epistemic gate 7: the last block runs each fact against a mutated copy of the real file and shows it fail.
 * The behaviour is proved on the test database by src/tests/integration/p1536-x9-voice.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const NEW = '20261102100100_p1536_x9_voice_notes.sql';
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
const SIG = 'public.canvas_voice_send(uuid, uuid, uuid, uuid, integer, boolean, text[], text, integer, jsonb, uuid)';

/** The v6 send with the one X9 gate inserted at the start of its voice branch: what the new body must equal. */
const GATE = "IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'canvas send: a voice note arrives only through the voice commit' USING ERRCODE = '42501'; END IF;";
function expectedSend(v6: string): string {
  const body = fnBody(v6, 'canvas_workspace_send');
  const anchor = "ELSE IF v_body IS NOT NULL OR COALESCE(p_attachment ->> 'duration_ms', '') !~ '^[0-9]{1,6}$' THEN";
  const n = body.split(anchor).length - 1;
  if (n !== 1) throw new Error(`gate anchor found ${n} times`);
  return norm(body.replace(anchor, () => `ELSE ${GATE} IF v_body IS NOT NULL OR COALESCE(p_attachment ->> 'duration_ms', '') !~ '^[0-9]{1,6}$' THEN`)); // a function: `$'` in a string replacement means "the rest of the text"
}

const facts: Record<string, (sql: string) => boolean> = {
  sendIsTheV6BodyPlusTheVoiceGate: (sql) => fnBody(sql, 'canvas_workspace_send') === expectedSend(read(V6)),
  sendKeepsItsGrants: (sql) => {
    const code = norm(stripComments(sql));
    return code.includes('REVOKE ALL ON FUNCTION public.canvas_workspace_send(uuid, uuid, uuid, integer, boolean, text, text[], jsonb, uuid) FROM PUBLIC, anon, authenticated;')
      && code.includes('GRANT EXECUTE ON FUNCTION public.canvas_workspace_send(uuid, uuid, uuid, integer, boolean, text, text[], jsonb, uuid) TO authenticated;');
  },
  gateRefusesBeforeAnyWrite: (sql) => {
    const b = fnBody(sql, 'canvas_workspace_send');
    const gate = b.indexOf(GATE);
    return gate > 0 && gate < b.indexOf('pg_advisory_xact_lock') && gate < b.indexOf('INSERT INTO') && gate < b.indexOf('PERFORM public._canvas_draft_expire');
  },
  theSendIsNotCopied: (sql) => {
    const code = stripComments(sql);
    return (code.match(/INSERT INTO public\.canvas_draft_runs/g) ?? []).length === 1 // the one in canvas_workspace_send
      && (code.match(/chat_commit_voice_note\(/g) ?? []).length === 1
      && !/FUNCTION public\._canvas_workspace_send\(/.test(code);
  },
  voiceSendCallsTheUserSendOnceWithTheSameArguments: (sql) => {
    const b = fnBody(sql, 'canvas_voice_send');
    return (b.match(/public\.canvas_workspace_send\(/g) ?? []).length === 1
      && b.includes("v_res := public.canvas_workspace_send( p_canvas, p_from_version, p_expected_draft, p_expected_revision, p_replace, NULL, p_box_refs, jsonb_strip_nulls(jsonb_build_object('kind', 'voice', 'duration_ms', p_duration_ms, 'waveform', p_waveform)), p_client_id);");
  },
  voiceSendIsServiceRoleOnly: (sql) => {
    const code = norm(stripComments(sql));
    return code.includes(`REVOKE ALL ON FUNCTION ${SIG} FROM PUBLIC, anon, authenticated;`)
      && code.includes(`GRANT EXECUTE ON FUNCTION ${SIG} TO service_role;`)
      && !new RegExp(`GRANT EXECUTE ON FUNCTION ${SIG.replace(/[().[\]]/g, '\\$&')} TO (authenticated|anon|PUBLIC)`).test(code);
  },
  voiceSendRefusesAnUnnamedCaller: (sql) => {
    const b = fnBody(sql, 'canvas_voice_send');
    return b.includes("IF p_uid IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501'; END IF;")
      && b.indexOf("IF p_uid IS NULL") < b.indexOf('set_config(');
  },
  voiceSendActsAsTheGivenIdForItsTransactionOnly: (sql) => {
    const b = fnBody(sql, 'canvas_voice_send');
    const set = b.indexOf("set_config('request.jwt.claim.sub', p_uid::text, true)");
    const call = b.indexOf('v_res := public.canvas_workspace_send(');
    const restore = b.indexOf("set_config('request.jwt.claim.sub', COALESCE(v_sub, ''), true)");
    return set > 0 && call > set && restore > call
      && b.includes("set_config('request.jwt.claims', jsonb_build_object('sub', p_uid::text, 'role', 'service_role')::text, true)")
      && b.includes("set_config('request.jwt.claims', COALESCE(v_claims, ''), true)")
      && !/set_config\([^)]*, false\)/.test(b); // never session-wide
  },
  voiceSendRefusesANoteStoredUnderAnotherKey: (sql) => {
    const b = fnBody(sql, 'canvas_voice_send');
    return b.includes("IF v_res ->> 'status' = 'ok' AND COALESCE((v_res ->> 'replayed')::boolean, false) = false THEN")
      && b.includes('a.message_id = (v_res ->> \'message_id\')::uuid')
      && b.includes("IF v_path IS DISTINCT FROM p_object_key THEN RAISE EXCEPTION 'canvas send: that voice note is stored under another key' USING ERRCODE = '22023'; END IF;");
  },
  triggerIsAfterUpdateOfTranscriptStatusOnTheTwoSettledStates: (sql) => {
    const code = norm(stripComments(sql));
    return code.includes('CREATE TRIGGER chat_messages_canvas_voice_settled AFTER UPDATE OF transcript_status ON public.chat_messages FOR EACH ROW')
      && code.includes("WHEN (NEW.audio_duration_ms IS NOT NULL AND NEW.transcript_status IN ('done', 'failed') AND OLD.transcript_status IS DISTINCT FROM NEW.transcript_status)");
  },
  triggerFunctionIsInternal: (sql) => {
    const b = fnBody(sql, '_canvas_voice_transcript_settled');
    const code = norm(stripComments(sql));
    return b.includes("RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$")
      && code.includes('REVOKE ALL ON FUNCTION public._canvas_voice_transcript_settled() FROM PUBLIC, anon, authenticated;')
      && !/GRANT EXECUTE ON FUNCTION public\._canvas_voice_transcript_settled/.test(code);
  },
  failureIsSettledByTheEnginesOwnExpireStepUnderATriedLock: (sql) => {
    const b = fnBody(sql, '_canvas_voice_transcript_settled');
    const at = b.indexOf("IF NEW.transcript_status = 'failed'");
    const upto = b.indexOf('BEGIN SELECT decrypted_secret');
    const branch = b.slice(at, upto);
    return at > 0 && upto > at
      && branch.includes("pg_try_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_owner::text, 0))")
      && branch.includes('PERFORM public._canvas_draft_expire(v_owner);')
      && !branch.includes('net.http_post') && !branch.includes('model');
  },
  dispatchIsASeparateBlockThatCannotFailTheTranscriptWrite: (sql) => {
    const b = fnBody(sql, '_canvas_voice_transcript_settled');
    const upto = b.indexOf('BEGIN SELECT decrypted_secret');
    const tail = b.slice(upto);
    return upto > 0
      && tail.includes("name = 'canvas_draft_url'") && tail.includes("name = 'canvas_draft_internal_secret'") && tail.includes("name = 'chat_voice_anon_key'")
      && tail.includes("'x-canvas-draft-internal', v_secret")
      && tail.includes("jsonb_build_object('run_id', v_run, 'owner_id', v_owner)")
      && /EXCEPTION WHEN OTHERS THEN RAISE WARNING '_canvas_voice_transcript_settled: dispatch failed/.test(tail)
      && (b.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []).length === 3
      && !/RAISE EXCEPTION/.test(b);
  },
  onlyAQueuedVoiceRunOfThisMessageIsConsidered: (sql) => {
    const b = fnBody(sql, '_canvas_voice_transcript_settled');
    return b.includes("r.trigger_message_id = NEW.id AND r.input_kind = 'voice' AND r.state = 'queued'");
  },
  definesOnlyWhatItNames: (sql) => {
    const names = [...stripComments(sql).matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]).sort();
    return JSON.stringify(names) === JSON.stringify(['_canvas_voice_transcript_settled', 'canvas_voice_send', 'canvas_workspace_send'])
      && !/DROP FUNCTION|ALTER TABLE|CREATE TABLE/.test(stripComments(sql));
  },
};

describe('migration 20261102100100: voice notes in every canvas thread', () => {
  const sql = read(NEW);

  it('every fact holds for the real file', () => {
    for (const [name, fact] of Object.entries(facts)) expect(fact(sql), name).toBe(true);
  });

  it('is the newest definition of canvas_workspace_send (a later body would silently drop the gate); the review-fixes migration amends three of the others', () => {
    const files = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    const defs = (name: string) => files.filter((f) => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`).test(stripComments(read(f))));
    const FIX = '20261102110100_p1536_x9_review_fixes.sql';
    expect(defs('canvas_workspace_send')).toEqual([V6, NEW]);
    expect(defs('canvas_voice_send')).toEqual([NEW, FIX]); // the FIX body is pinned in p1536-x9-review-migration.test.ts
    expect(defs('_canvas_voice_transcript_settled')).toEqual([NEW, FIX]);
    expect(defs('_canvas_draft_expire').slice(-2), 'the expire step the trigger calls: the review-fixes lease, then P1653 (its body plus two reply sentences)').toEqual([FIX, '20261110100000_p1653_never_a_wall.sql']);
    expect(NEW > V6, 'it runs after the v6 engine').toBe(true);
  });

  it('carries the header the migration gates read', () => {
    expect(sql).toMatch(/^-- P1536 section 3c, X9/m);
    expect(sql).toMatch(/^-- diffed against: /m);
    expect(sql).toMatch(/^-- client-safe: /m);
  });

  describe('gate 7: each fact fails against a mutated copy of the real file', () => {
    const swap = (from: string, to: string) => {
      expect(sql.includes(from), `mutation source present: ${from.slice(0, 60)}`).toBe(true);
      return sql.replace(from, to);
    };
    it('a second copy of the send is caught', () => {
      const m = sql + "\nCREATE OR REPLACE FUNCTION public._canvas_workspace_send() RETURNS void LANGUAGE sql AS $$ INSERT INTO public.canvas_draft_runs (draft_id) VALUES (NULL) $$;";
      expect(facts.theSendIsNotCopied!(m)).toBe(false);
      expect(facts.definesOnlyWhatItNames!(m)).toBe(false);
    });
    it('a send that no longer carries the gate, or carries it after a write, or lost a v6 guard, is caught', () => {
      expect(facts.sendIsTheV6BodyPlusTheVoiceGate!(swap("::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN", "::jsonb ->> 'role', '') IS DISTINCT FROM 'authenticated' THEN"))).toBe(false);
      expect(facts.sendIsTheV6BodyPlusTheVoiceGate!(swap("RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';", 'NULL;'))).toBe(false);
      expect(facts.gateRefusesBeforeAnyWrite!(swap("IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN", "IF false THEN"))).toBe(false);
      expect(facts.sendKeepsItsGrants!(swap('TO authenticated;', 'TO anon;'))).toBe(false);
    });
    it('granting the voice entry point to users, or losing its service grant, is caught', () => {
      expect(facts.voiceSendIsServiceRoleOnly!(sql + `\nGRANT EXECUTE ON FUNCTION ${SIG} TO authenticated;`)).toBe(false);
      expect(facts.voiceSendIsServiceRoleOnly!(swap(`GRANT EXECUTE ON FUNCTION ${SIG}\n  TO service_role;`, ''))).toBe(false);
    });
    it('calling the send with other arguments, or twice, is caught', () => {
      expect(facts.voiceSendCallsTheUserSendOnceWithTheSameArguments!(swap('p_replace, NULL, p_box_refs,', 'false, NULL, p_box_refs,'))).toBe(false);
      expect(facts.voiceSendCallsTheUserSendOnceWithTheSameArguments!(swap('PERFORM set_config(\'request.jwt.claim.sub\', COALESCE(v_sub', 'PERFORM public.canvas_workspace_send(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL); PERFORM set_config(\'request.jwt.claim.sub\', COALESCE(v_sub'))).toBe(false);
    });
    it('acting without a named caller, for longer than the transaction, or without restoring, is caught', () => {
      expect(facts.voiceSendRefusesAnUnnamedCaller!(swap("IF p_uid IS NULL THEN\n    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';\n  END IF;", ''))).toBe(false);
      expect(facts.voiceSendActsAsTheGivenIdForItsTransactionOnly!(swap("set_config('request.jwt.claim.sub', p_uid::text, true)", "set_config('request.jwt.claim.sub', p_uid::text, false)"))).toBe(false);
      expect(facts.voiceSendActsAsTheGivenIdForItsTransactionOnly!(swap("'role', 'service_role')", "'role', 'authenticated')"))).toBe(false);
      expect(facts.voiceSendActsAsTheGivenIdForItsTransactionOnly!(swap("set_config('request.jwt.claims', COALESCE(v_claims, ''), true)", "set_config('request.jwt.claims', '', true)"))).toBe(false);
    });
    it('dropping the key check, or running it on a repeat, is caught', () => {
      expect(facts.voiceSendRefusesANoteStoredUnderAnotherKey!(swap('IF v_path IS DISTINCT FROM p_object_key THEN', 'IF false THEN'))).toBe(false);
      expect(facts.voiceSendRefusesANoteStoredUnderAnotherKey!(swap("AND COALESCE((v_res ->> 'replayed')::boolean, false) = false", ''))).toBe(false);
    });
    it('the failure branch dispatching, or settling without the tried lock, is caught', () => {
      expect(facts.failureIsSettledByTheEnginesOwnExpireStepUnderATriedLock!(swap('PERFORM public._canvas_draft_expire(v_owner);', 'PERFORM net.http_post(url := v_url);'))).toBe(false);
      expect(facts.failureIsSettledByTheEnginesOwnExpireStepUnderATriedLock!(swap('IF pg_try_advisory_xact_lock(', 'IF pg_advisory_xact_lock('))).toBe(false);
    });
    it('a dispatch that can raise, or that loses the owner, is caught', () => {
      expect(facts.dispatchIsASeparateBlockThatCannotFailTheTranscriptWrite!(swap("RAISE WARNING '_canvas_voice_transcript_settled: dispatch failed (sqlstate %), run left queued', SQLSTATE;", "RAISE EXCEPTION 'x';"))).toBe(false);
      expect(facts.dispatchIsASeparateBlockThatCannotFailTheTranscriptWrite!(swap("'owner_id', v_owner", "'owner_id', NULL"))).toBe(false);
    });
    it('the trigger firing on every update, or on the wrong states, is caught', () => {
      expect(facts.triggerIsAfterUpdateOfTranscriptStatusOnTheTwoSettledStates!(swap("IN ('done', 'failed')", "IN ('done', 'failed', 'pending')"))).toBe(false);
      expect(facts.triggerIsAfterUpdateOfTranscriptStatusOnTheTwoSettledStates!(swap('AFTER UPDATE OF transcript_status ON', 'AFTER UPDATE ON'))).toBe(false);
    });
    it('considering a run that is not queued is caught', () => {
      expect(facts.onlyAQueuedVoiceRunOfThisMessageIsConsidered!(swap("AND r.state = 'queued'\n     ORDER BY", "AND r.state IN ('queued', 'running')\n     ORDER BY"))).toBe(false);
    });
  });
});
