/**
 * P1545 WP1: shape of migration 20261023100000 (offline). The behaviour is proven against the TEST
 * database in src/tests/integration/p1545-artifacts-data.test.ts; this pins what a text read can:
 * the closed table, the explicit grants, and that no client-callable function lost a guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261023100000_p1545_artifacts_data.sql'), 'utf8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('P1545 artifacts data migration', () => {
  it('canvas_reads is closed to every client role (RLS on, no policy, no grant)', () => {
    expect(code).toMatch(/ALTER TABLE public\.canvas_reads ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/REVOKE ALL ON TABLE public\.canvas_reads FROM PUBLIC, anon, authenticated/);
    expect(code).not.toMatch(/CREATE POLICY[^;]*canvas_reads/);
    expect(code).not.toMatch(/GRANT [^;]* ON TABLE public\.canvas_reads/);
  });

  it('the attachment kinds are widened to canvas and letter in the CHECK and in send_chat_message', () => {
    expect(code).toMatch(/attachment_kind IN \('point', 'story', 'canvas', 'letter'\)/);
    expect(code).toMatch(/NOT IN \('point', 'story', 'canvas', 'letter'\)/);
    expect(code).toMatch(/_chat_can_attach\(p_attachment_kind, p_attachment_id, v_uid, p_conversation\)/);
  });

  it('every new client-callable function is granted to authenticated only', () => {
    for (const sig of ['list_my_artifacts_canvases\\(\\)', 'list_canvases_shared_with_me\\(\\)', 'mark_canvas_read\\(uuid, text\\)', 'get_chat_artifact_attachment\\(text, uuid\\)']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig} FROM PUBLIC, anon, authenticated`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO authenticated;`));
      expect(code).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO[^;]*anon`));
    }
  });

  it('internal helpers are never executable by a client role', () => {
    for (const fn of ['_chat_dm_for_share\\(uuid, uuid\\)', '_chat_post_artifact\\(uuid, uuid, text, uuid\\)', '_chat_post_canvas_share\\(uuid, uuid, text, uuid\\)', '_chat_can_attach\\(text, uuid, uuid, uuid\\)', '_chat_post_letter_on_delivery\\(\\)']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn} FROM PUBLIC, anon, authenticated`));
      expect(code).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}`));
    }
  });

  it('every SECURITY DEFINER function pins search_path', () => {
    const defs = code.split(/CREATE OR REPLACE FUNCTION/).slice(1);
    for (const d of defs) {
      const head = d.split('AS $$')[0] ?? '';
      if (/SECURITY DEFINER/.test(head)) expect(head, head.split('\n')[0] ?? '').toMatch(/SET search_path = ''/);
    }
  });

  it('Shared with me reads only explicit grants through _canvas_admitted_via, never general_access', () => {
    const fn = code.slice(code.indexOf('FUNCTION public.list_canvases_shared_with_me'), code.indexOf('FUNCTION public.mark_canvas_read'));
    expect(fn).toMatch(/_canvas_admitted_via\(c\.id, v_uid\)/);
    expect(fn).not.toMatch(/general_access/);
  });

  it('share_canvas posts only when the audience INSERT created a row', () => {
    expect(code).toMatch(/ON CONFLICT DO NOTHING\s+RETURNING id INTO v_entry/);
    expect(code).toMatch(/IF v_entry IS NOT NULL THEN/);
  });
});
