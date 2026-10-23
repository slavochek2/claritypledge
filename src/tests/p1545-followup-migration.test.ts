/**
 * @file p1545-followup-migration.test.ts
 * @description Shape of migration 20261023110000 (offline). Behaviour is proven against TEST in
 *   src/tests/integration/p1545-artifacts-data.test.ts: the letter card carries the viewer's delivery id,
 *   and get_received_letters_page pages every received letter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261023110000_p1545_chat_letter_delivery_id.sql'), 'utf8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('P1545 follow-up migration', () => {
  it('carries a client-safe annotation', () => {
    expect(sql).toMatch(/^-- client-safe:/m);
  });

  it('the letter answer gains the viewer\'s own delivery id, looked up by receiver_profile_id = caller', () => {
    expect(code).toMatch(/'delivery_id', v_delivery/);
    expect(code).toMatch(/d\.letter_id = v_letter\.id AND d\.receiver_profile_id = v_uid/);
  });

  it('every function pins search_path and is granted to authenticated only', () => {
    const defs = code.split(/CREATE OR REPLACE FUNCTION/).slice(1);
    expect(defs).toHaveLength(2);
    for (const d of defs) expect(d.split('AS $$')[0] ?? '').toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    for (const sig of ['get_chat_artifact_attachment\\(text, uuid\\)', 'get_received_letters_page\\(int, timestamptz, uuid\\)']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig} FROM PUBLIC, anon, authenticated`));
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO authenticated;`));
      expect(code).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO[^;]*anon`));
    }
  });

  it('received letters are the caller\'s own, not self-sent, with no row cap beyond the clamped page', () => {
    expect(code).toMatch(/ld\.receiver_profile_id = v_uid/);
    expect(code).toMatch(/cl\.sender_id <> v_uid/);
    expect(code).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 100\), 1\), 200\)/);
  });
});
