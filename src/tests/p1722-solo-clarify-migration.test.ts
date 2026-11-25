/**
 * @file p1722-solo-clarify-migration.test.ts
 * @description Source contract for 20261125104835_p1722_solo_clarify_in_the_mirror.sql: the new columns are not granted to clients, the Mirror refusals
 * are gone from the Clarify and Transcribe functions, the Public path creates a new point (never flips visibility), and every new function is locked down.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(__dirname, '..', '..', 'supabase', 'migrations', '20261125104835_p1722_solo_clarify_in_the_mirror.sql');
const raw = readFileSync(FILE, 'utf8');
const code = raw.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
function fnBody(name: string): string {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).exec(code);
  if (!m) throw new Error(`${name} not found`);
  const start = code.indexOf('AS $', m.index);
  const tag = /\$[a-z_]*\$/.exec(code.slice(start))![0];
  return norm(code.slice(m.index, code.indexOf(tag, start + 3 + tag.length) + tag.length));
}

describe('P1722 migration', () => {
  it('starts with the client-safe line', () => {
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
  it('adds the three columns and grants none of them to a client', () => {
    expect(code).toContain('ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT \'private\'');
    expect(code).toContain('first_published_at timestamptz');
    expect(code).toContain('public_warning_needed boolean NOT NULL DEFAULT true');
    expect(code).not.toMatch(/GRANT[^;]*clarify_drafts/);
  });
  it('the Mirror refusals are gone from the five transcribe sites and clarify_start_chat', () => {
    for (const f of ['assert_transcribe_chat_access', 'get_chat_live_transcription', 'get_chat_transcription_processing', 'clarify_start_recording', 'clarify_start_chat']) {
      expect(fnBody(f), f).not.toMatch(/kind\s*(<>|!=)\s*'mirror'\s*(\)|THEN|AND\s+FALSE)?\s*THEN\s+RAISE|kind = 'mirror' THEN RAISE/);
    }
    expect(fnBody('_transcribe_chat_name')).toContain("WHEN 'mirror' THEN");
  });
  it('mirror_request_reply returns quietly for a transcribed line', () => {
    expect(fnBody('mirror_request_reply')).toContain('is_transcription');
  });
  it('the Public path makes a NEW point and never updates points.visibility', () => {
    const b = fnBody('clarify_publish');
    expect(b).toMatch(/INSERT INTO public\.points/);
    expect(b).not.toMatch(/UPDATE public\.points\s+SET\s+visibility/);
    expect(b).toContain('DELETE FROM public.points');
    for (const t of ['point_chat_shares', 'point_chat_stories', 'letter_point_responses', 'event_round_tables', 'badge_points']) expect(b, t).toContain(`public.${t}`);
    expect(b).toContain("'point_linked'");
  });
  it('clarify_set_visibility and clarify_draft_edit refuse a published draft', () => {
    expect(fnBody('clarify_set_visibility')).toContain("'published'");
    expect(fnBody('clarify_set_visibility')).toContain("'earlier_version'");
    expect(fnBody('clarify_draft_edit')).toContain("'published'");
    expect(fnBody('clarify_draft_edit')).toContain('bad tags');
  });
  it('model text loses every # before it is stored', () => {
    expect(fnBody('_clarify_complete')).toContain("replace(COALESCE(p_result ->> 'statement', ''), '#', '')");
  });
  it('the new and changed functions are locked down', () => {
    expect(code).toContain('REVOKE ALL ON FUNCTION public._clarify_mirror_row_ok(public.chat_messages, uuid) FROM PUBLIC, anon, authenticated;');
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.clarify_set_visibility\(uuid, text\) TO authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.clarify_draft_edit\(uuid, text, text\[\]\) TO authenticated;/);
  });
});
