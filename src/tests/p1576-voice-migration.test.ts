/**
 * P1576 Part B: static guards over supabase/migrations/20261027120100_p1576_chat_voice_notes.sql.
 *
 * These read the SQL text; they prove the grants, the constraint bodies and the cron idempotency are
 * written as designed. They do NOT prove the SQL runs: the behavioural checks (has_content with
 * audio, purge on delete and on erasure, mirror refusal, client roles unable to read the path) are
 * in e2e/integration/p1576-chat-voice-notes.spec.ts and need a database.
 *
 * Every rule has a mutation control: the same checker is run over a copy with the rule broken and
 * must report it, so a checker that reports nothing for everything cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGE_COLUMNS } from '@/app/data/chat-service';

const DIR = join(process.cwd(), 'supabase/migrations');
const FILE = '20261027120100_p1576_chat_voice_notes.sql';
const FIXES_FILE = '20261027120200_p1576_chat_voice_fixes.sql';
const FIXES2_FILE = '20261027120300_p1576_chat_voice_fixes_2.sql';
const PURGE_FILE = '20261027120500_p1576_chat_voice_purge_backoff.sql';
const MIRROR_FILE = '20261027120600_p1576_mirror_voice_and_waveform.sql';
const SERVER_FILE = '20261027120700_p1576_mirror_voice_server_trigger.sql';
const MERGE_FILE = '20261027120400_p1576_get_my_chats_merge_p1545.sql';
const sql = readFileSync(join(DIR, FILE), 'utf8');
const fixes = readFileSync(join(DIR, FIXES_FILE), 'utf8');
const fixes2 = readFileSync(join(DIR, FIXES2_FILE), 'utf8');
const purge = readFileSync(join(DIR, PURGE_FILE), 'utf8');

/** Strips `--` comments so a rule cannot be satisfied (or violated) by prose. */
const code = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const VOICE_FN = /^(_?chat_voice_\w+|chat_commit_voice_note)$/;

function problems(text: string): string[] {
  const out: string[] = [];
  const c = code(text);

  // 1. every voice function is closed to client roles and has no client grant
  const created = [...c.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1] ?? '').filter((n) => VOICE_FN.test(n));
  if (created.length < 10) out.push(`expected the voice functions, found ${created.length}`);
  for (const fn of new Set(created)) {
    const revoke = new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`);
    if (!revoke.test(c)) out.push(`${fn}: no REVOKE FROM PUBLIC, anon, authenticated`);
    if (new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO[^;]*(authenticated|anon|PUBLIC)`).test(c)) {
      out.push(`${fn}: granted to a client role`);
    }
  }

  // 2. the two storage tables: RLS on, every client grant revoked, none given back
  for (const t of ['chat_voice_audio', 'chat_voice_purge']) {
    if (!new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(c)) out.push(`${t}: RLS not enabled`);
    if (!new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated`).test(c)) out.push(`${t}: client grants not revoked`);
    if (new RegExp(`GRANT[^;]*ON TABLE public\\.${t} TO[^;]*(authenticated|anon)`).test(c)) out.push(`${t}: granted to a client role`);
    if (new RegExp(`CREATE POLICY[^;]*ON public\\.${t}`).test(c)) out.push(`${t}: has a policy`);
  }

  // 3. the storage path is not a chat_messages column
  if (/ALTER TABLE public\.chat_messages[^;]*audio_path/.test(c)) out.push('audio_path added to chat_messages');

  // 4. constraint bodies
  const deleted = /ADD CONSTRAINT chat_messages_deleted_is_empty CHECK \(([\s\S]*?)\);/.exec(c)?.[1] ?? '';
  for (const col of ['audio_duration_ms', 'transcript IS NULL', 'transcript_status']) {
    if (!deleted.includes(col)) out.push(`deleted_is_empty does not require ${col}`);
  }
  const hasContent = /ADD CONSTRAINT chat_messages_has_content CHECK \(([\s\S]*?)\);/.exec(c)?.[1] ?? '';
  if (!hasContent.includes('audio_duration_ms IS NOT NULL')) out.push('has_content does not count audio');
  if (!hasContent.includes('deleted_at IS NOT NULL OR body IS NOT NULL OR attachment_id IS NOT NULL OR forward_snapshot IS NOT NULL')) {
    out.push('has_content lost a pre-existing branch');
  }

  // 5. cron: every schedule is preceded by an unschedule of the same job, both guarded by pg_cron existing
  for (const m of c.matchAll(/cron\.schedule\(\s*'([\w-]+)'/g)) {
    const before = c.slice(0, m.index);
    if (!new RegExp(`cron\\.unschedule\\('${m[1]}'\\)`).test(before)) out.push(`cron job ${m[1]}: scheduled without unschedule first`);
  }
  if (!/IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/.test(c)) out.push('cron block not guarded by pg_cron');
  if (/CREATE EXTENSION[^;]*pg_cron/.test(c)) out.push('migration creates pg_cron');

  // 5b. a tick never calls the edge function unconditionally (idle invocations are billed)
  for (const fn of ['chat_voice_sweep_tick', 'chat_voice_retention_tick']) {
    const body = new RegExp(`FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?\\$\\$;`).exec(c)?.[0] ?? '';
    if (!/IF public\._chat_voice_has_work\(\) THEN\s+PERFORM public\._chat_voice_call_sweep\(\);/.test(body)) {
      out.push(`${fn}: calls the edge function without checking for work`);
    }
  }

  // 6. the only pre-existing function redefined is get_my_chats
  const others = [...c.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/g)].map((m) => m[1] ?? '')
    .filter((n) => !VOICE_FN.test(n) && n !== 'get_my_chats');
  if (others.length) out.push(`redefines unrelated functions: ${others.join(', ')}`);

  return out;
}

describe('P1576 voice-notes migration (static)', () => {
  it('is clean as committed', () => {
    expect(problems(sql)).toEqual([]);
  });

  // Later features may add migrations after these (they are on prod already), so pin the base, not the tail.
  it('the voice migrations sort after 20261023230000, in order, with unique timestamps', () => {
    const names = readdirSync(DIR).filter((n) => /^\d{14}_/.test(n)).sort();
    const voice = [FILE, FIXES_FILE, FIXES2_FILE, MERGE_FILE, PURGE_FILE, MIRROR_FILE, SERVER_FILE];
    expect(names.filter((n) => voice.includes(n))).toEqual(voice);
    expect(names.filter((n) => n.slice(0, 14) > '20261023230000' && n < SERVER_FILE && !n.includes('_p1576_'))).toEqual([]);
    for (const f of [FILE, FIXES_FILE, FIXES2_FILE, MERGE_FILE, PURGE_FILE, MIRROR_FILE, SERVER_FILE]) expect(names.filter((n) => n.startsWith(f.slice(0, 14)))).toEqual([f]);
  });

  it('the latest get_my_chats keeps P1545\'s empty-channel unread rule and the voice preview', () => {
    const merge = readFileSync(join(DIR, MERGE_FILE), 'utf8');
    expect(merge).toMatch(/WHEN lm\.id IS NULL AND st\.last_read_at IS NULL/);
    expect(merge).toMatch(/event_grace_interval\(\)/);
    expect(merge).toMatch(/WHEN lm\.audio_duration_ms IS NOT NULL THEN 'Voice message'/);
    expect(merge).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_my_chats\(\) TO authenticated;/);
  });

  it('clients never select a storage path or retry bookkeeping', () => {
    expect(MESSAGE_COLUMNS).not.toMatch(/audio_path|attempt/);
  });

  describe('mutation controls: the checker reports each broken rule', () => {
    const mutate = (from: RegExp | string, to: string) => {
      const out = sql.replace(from, () => to); // a function: `$$` in `to` is not a replacement pattern
      expect(out).not.toBe(sql); // the mutation really changed something
      return out;
    };

    it('a missing REVOKE', () => {
      const m = mutate('REVOKE ALL ON FUNCTION public.chat_voice_fail_exhausted() FROM PUBLIC, anon, authenticated;', '');
      expect(problems(m).join()).toMatch(/chat_voice_fail_exhausted: no REVOKE/);
    });
    it('a client grant on a voice function', () => {
      const m = mutate('TO service_role;\n\n-- Counts one', 'TO service_role, authenticated;\n\n-- Counts one');
      expect(problems(m).join()).toMatch(/granted to a client role/);
    });
    it('a client grant on the purge queue', () => {
      const m = mutate('GRANT SELECT, DELETE ON TABLE public.chat_voice_purge TO service_role;', 'GRANT SELECT ON TABLE public.chat_voice_purge TO authenticated, service_role;');
      expect(problems(m).join()).toMatch(/chat_voice_purge: granted to a client role/);
    });
    it('has_content without audio', () => {
      const m = mutate(/\n {2}OR audio_duration_ms IS NOT NULL\n\);/, '\n);');
      expect(problems(m).join()).toMatch(/has_content does not count audio/);
    });
    it('deleted_is_empty that forgets the transcript', () => {
      const m = mutate('AND audio_duration_ms IS NULL AND transcript IS NULL AND transcript_status IS NULL)\n);', 'AND audio_duration_ms IS NULL)\n);');
      expect(problems(m).join()).toMatch(/deleted_is_empty does not require/);
    });
    it('a cron job scheduled twice-over without unscheduling', () => {
      const m = mutate(/PERFORM cron\.unschedule\('chat_voice_retention'\)\s+WHERE EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'chat_voice_retention'\);/, '');
      expect(problems(m).join()).toMatch(/chat_voice_retention: scheduled without unschedule/);
    });
    it('a tick that calls the edge function unconditionally', () => {
      const m = mutate(/CREATE OR REPLACE FUNCTION public\.chat_voice_sweep_tick\(\)[\s\S]*?\$\$;/, 'CREATE OR REPLACE FUNCTION public.chat_voice_sweep_tick() RETURNS void LANGUAGE sql AS $$ SELECT public._chat_voice_call_sweep() $$;');
      expect(problems(m).join()).toMatch(/chat_voice_sweep_tick: calls the edge function without checking for work/);
    });
    it('the path leaking onto chat_messages', () => {
      const m = mutate('ADD COLUMN IF NOT EXISTS transcript_status text;', 'ADD COLUMN IF NOT EXISTS transcript_status text,\n  ADD COLUMN IF NOT EXISTS audio_path text;');
      expect(problems(m).join()).toMatch(/audio_path added to chat_messages/);
    });
    it('an unrelated function redefined', () => {
      const m = sql + '\nCREATE OR REPLACE FUNCTION public.send_chat_message(uuid) RETURNS void AS $$ SELECT 1 $$ LANGUAGE sql;\n';
      expect(problems(m).join()).toMatch(/redefines unrelated functions: send_chat_message/);
    });
  });
});

/**
 * The follow-up migration (the first one is already applied on the test database, so it is never edited).
 * Rate limiting moves to a ledger that deleting a message cannot erase, and a clip that fails
 * re-validation can be failed for good.
 */
describe('P1576 voice-notes fixes migration (static)', () => {
  const c = code(fixes);
  const body = (fn: string) => new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`).exec(c)?.[0] ?? '';

  it('the ledger is server-only: RLS on, client grants revoked and none given back, no policy', () => {
    expect(c).toMatch(/CREATE TABLE IF NOT EXISTS public\.chat_voice_rate_limits/);
    expect(c).toMatch(/ALTER TABLE public\.chat_voice_rate_limits ENABLE ROW LEVEL SECURITY/);
    expect(c).toMatch(/REVOKE ALL ON TABLE public\.chat_voice_rate_limits FROM PUBLIC, anon, authenticated/);
    expect(c).not.toMatch(/GRANT[^;]*ON TABLE public\.chat_voice_rate_limits TO[^;]*(authenticated|anon)/);
    expect(c).not.toMatch(/CREATE POLICY[^;]*chat_voice_rate_limits/);
  });

  it('the commit counts the ledger, never chat_messages, and serialises per author', () => {
    const commit = body('chat_commit_voice_note');
    expect(commit).not.toBe('');
    expect(commit).toMatch(/FROM public\.chat_voice_rate_limits/);
    expect(commit).toMatch(/INSERT INTO public\.chat_voice_rate_limits/);
    expect(commit).toMatch(/pg_advisory_xact_lock/);
    // the old counter (deletable by the user) must be gone: no rate count over chat_messages.audio_duration_ms
    expect(commit).not.toMatch(/count\(\*\) FROM public\.chat_messages[\s\S]{0,200}audio_duration_ms IS NOT NULL/);
  });

  it('the upload quota is reserved in the database before anything is signed: membership, lock, ledger row of kind upload', () => {
    const r = body('chat_voice_reserve_upload');
    expect(r).not.toBe('');
    expect(r).toMatch(/_chat_assert_can_post/);
    expect(r).toMatch(/kind = 'mirror'/);
    expect(r).toMatch(/pg_advisory_xact_lock/);
    expect(r).toMatch(/INSERT INTO public\.chat_voice_rate_limits[\s\S]*'upload'/);
    expect(r).toMatch(/ERRCODE = '54000'/);
    // the two kinds are counted apart: a burst of uploads must not eat the commit allowance or the reverse
    expect(c).toMatch(/kind\s+text\s+NOT NULL[\s\S]*CHECK \(kind IN \('commit', 'upload'\)\)/);
    expect(body('chat_commit_voice_note')).toMatch(/l\.kind = 'commit'/);
  });

  it('every function it touches is closed to client roles and granted to service_role', () => {
    const fns = [...c.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(fns).toEqual(expect.arrayContaining(['chat_commit_voice_note', 'chat_voice_finish_transcription', 'chat_voice_reserve_upload']));
    for (const fn of new Set(fns)) {
      expect(c, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`));
      expect(c, fn).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role;`));
      expect(c, fn).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO[^;]*(authenticated|anon)`));
    }
  });

  it('a final failure fails the message AND removes the audio (which queues the object)', () => {
    const fin = body('chat_voice_finish_transcription');
    expect(fin).toMatch(/p_final/);
    expect(fin).toMatch(/DELETE FROM public\.chat_voice_audio/);
    expect(fin).toMatch(/transcript_status = 'failed'/);
    expect(fin).toMatch(/audio_expired_at/);
  });

  it('a replayed client id must be a voice note: a text message that reuses the upload id is refused, in both replay branches', () => {
    const commit = body('chat_commit_voice_note');
    const refusals = commit.match(/v_row\.audio_duration_ms IS NULL/g) ?? [];
    expect(refusals.length).toBeGreaterThanOrEqual(2); // the up-front replay AND the concurrent-insert replay
    expect(commit).toMatch(/audio_duration_ms IS NULL THEN\s+RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023'/);
  });

  it('retention drains: expire_old loops in batches until a batch comes back short, with a hard cap', () => {
    const e = body('chat_voice_expire_old');
    expect(e).toMatch(/LOOP/);
    expect(e).toMatch(/EXIT WHEN n < /);
    expect(e).toMatch(/batches >= \d+/); // bounded: a bug can not loop for ever inside one transaction
    expect(e).toMatch(/interval '30 days'/);
  });

  it('documents the distinct sweep secret for operators', () => {
    expect(fixes).toMatch(/CHAT_VOICE_CRON_SECRET/);
  });

  it('adds no cron job (the ledger is pruned inside the commit, so no registry entry is needed)', () => {
    expect(c).not.toMatch(/cron\.schedule/);
  });
});

describe('P1576 chat-voice secrets (static)', () => {
  const index = readFileSync(join(process.cwd(), 'supabase/functions/chat-voice/index.ts'), 'utf8');

  it('the sweep secret is its own: CHAT_VOICE_CRON_SECRET, never the project-wide CRON_SECRET other functions read', () => {
    expect(index).toMatch(/Deno\.env\.get\('CHAT_VOICE_CRON_SECRET'\)/);
    expect(index).not.toMatch(/Deno\.env\.get\('CRON_SECRET'\)/);
  });

  it('the Gemini key is its own too', () => {
    expect(index).toMatch(/Deno\.env\.get\('GEMINI_CHAT_VOICE_API_KEY'\)/);
    expect(index).not.toMatch(/Deno\.env\.get\('GEMINI_(API|BATCH_API)_KEY'\)/);
  });
});

/**
 * The second follow-up (the first follow-up is applied on the test database, so it too is left alone).
 * A retry of an upload that is already a message must be answered BEFORE any quota is charged.
 */
describe('P1576 voice-notes fixes 2 migration (static)', () => {
  const c = code(fixes2);
  const commit = new RegExp('FUNCTION public\\.chat_commit_voice_note\\([\\s\\S]*?\\n\\$\\$;').exec(c)?.[0] ?? '';

  it('redefines only the commit function, closed to clients and granted to service_role', () => {
    expect([...c.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1])).toEqual(['chat_commit_voice_note']);
    expect(c).toMatch(/REVOKE ALL ON FUNCTION public\.chat_commit_voice_note\([^)]*\)\s+FROM PUBLIC, anon, authenticated;/);
    expect(c).toMatch(/GRANT EXECUTE ON FUNCTION public\.chat_commit_voice_note\([^)]*\)\s+TO service_role;/);
    expect(c).not.toMatch(/GRANT[^;]*(authenticated|anon)/);
    expect(c).not.toMatch(/CREATE TABLE|cron\.schedule/);
  });

  it('takes the per-author lock ONCE, before the replay lookup and before any ledger row is written', () => {
    expect(commit).not.toBe('');
    expect(commit.match(/pg_advisory_xact_lock/g)?.length).toBe(1);
    const lock = commit.indexOf('pg_advisory_xact_lock');
    const replay = commit.indexOf('WHERE m.author_id = p_uid AND m.client_id = p_client_id');
    const charge = commit.indexOf('INSERT INTO public.chat_voice_rate_limits');
    expect(replay).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(replay);
    expect(lock).toBeLessThan(charge);
  });

  it('keeps everything the first follow-up established', () => {
    expect(commit).toMatch(/l\.kind = 'commit'/);
    expect((commit.match(/v_row\.audio_duration_ms IS NULL/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(commit).toMatch(/lower\(p_uid::text\)/); // the key is still derived from conversation, author and client id
    expect(commit).toMatch(/ERRCODE = '54000'/);
  });
});

/**
 * Purge backoff: a path whose storage delete keeps failing is pushed back across sweeps instead of
 * being the head of the queue on every tick (it ate the whole purge share each time).
 */
describe('P1576 purge backoff migration (static)', () => {
  const c = code(purge);
  const fn = (name: string) => new RegExp(`FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(c)?.[0] ?? '';

  it('adds the backoff columns with safe defaults and an index on the due time', () => {
    expect(c).toMatch(/ALTER TABLE public\.chat_voice_purge[\s\S]*ADD COLUMN IF NOT EXISTS attempts\s+integer\s+NOT NULL DEFAULT 0/);
    expect(c).toMatch(/ADD COLUMN IF NOT EXISTS next_attempt_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/);
    expect(c).toMatch(/CREATE INDEX IF NOT EXISTS chat_voice_purge_due\s+ON public\.chat_voice_purge \(next_attempt_at\)/);
  });

  it('the due read uses the database clock, orders soonest-due first and is bounded', () => {
    const due = fn('chat_voice_purge_due');
    expect(due).not.toBe('');
    expect(due).toMatch(/next_attempt_at <= now\(\)/);
    expect(due).toMatch(/ORDER BY[\s\S]*next_attempt_at/);
    expect(due).toMatch(/LIMIT LEAST\(GREATEST\(/);
  });

  it('a failure counts the attempt and backs off 2^attempts minutes, at most a day', () => {
    const failed = fn('chat_voice_purge_failed');
    expect(failed).not.toBe('');
    expect(failed).toMatch(/attempts\s*=\s*[a-z.]*attempts \+ 1/);
    expect(failed).toMatch(/next_attempt_at\s*=\s*now\(\) \+ make_interval\(mins => LEAST\(1440, /);
    expect(failed).toMatch(/2 \^ LEAST\(/);
  });

  it('both functions are closed to clients and granted to service_role; nothing else is created', () => {
    for (const f of ['chat_voice_purge_due', 'chat_voice_purge_failed']) {
      expect(c, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`));
      expect(c, f).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\)\\s+TO service_role;`));
    }
    expect(c).not.toMatch(/GRANT[^;]*(authenticated|anon)/);
    expect(c).not.toMatch(/CREATE TABLE|cron\.schedule|DROP /);
    expect([...c.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]).sort()).toEqual(['chat_voice_purge_due', 'chat_voice_purge_failed']);
  });
});
