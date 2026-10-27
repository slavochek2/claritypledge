/**
 * @file p1545-sender-seen-migration.test.ts
 * @description Shape of migration 20261027150000 (offline): the sender-side "seen" mark. Behaviour is for TEST to prove
 *   once applied; this pins the authorisation, the grants and what the sender's reader returns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261027150000_p1545_sender_seen.sql'), 'utf8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('P1545 sender-seen migration', () => {
  it('carries the diffed-against and client-safe annotations', () => {
    expect(sql).toMatch(/^-- diffed against: /m);
    expect(sql).toMatch(/^-- client-safe:/m);
  });

  it('adds a nullable sender_seen_at to letter_deliveries and leaves read_at alone', () => {
    expect(code).toMatch(/ALTER TABLE public\.letter_deliveries\s+ADD COLUMN IF NOT EXISTS sender_seen_at timestamptz;/);
    expect(code).not.toMatch(/sender_seen_at timestamptz\s+NOT NULL/);
    expect(code).not.toMatch(/mark_inbox_item_read|get_inbox_items/);
    expect(code).not.toMatch(/SET read_at/);
  });

  it('the mark is SECURITY DEFINER with an empty search_path, sender-only, and set on every call (not only when null)', () => {
    const def = code.split('CREATE OR REPLACE FUNCTION public.mark_delivery_seen_by_sender')[1]!.split('CREATE OR REPLACE FUNCTION public.get_deliveries_with_progress')[0]!;
    expect(def).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(def).toMatch(/auth\.uid\(\) IS DISTINCT FROM v_sender_id/);
    expect(def).toMatch(/auth\.uid\(\) IS NULL/);
    expect(def).not.toMatch(/receiver_profile_id/); // the recipient may not write it
    expect(def).toMatch(/SET sender_seen_at = now\(\)\s+WHERE id = p_delivery_id;/);
    expect(def).not.toMatch(/sender_seen_at IS NULL/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.mark_delivery_seen_by_sender\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_delivery_seen_by_sender\(uuid\) TO authenticated;/);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_delivery_seen_by_sender\(uuid\) TO[^;]*anon/);
  });

  it('the sender\'s reader returns the seen time and the latest progress, still only for the caller\'s own letters, with its grants restated', () => {
    expect(code).toMatch(/'sender_seen_at',\s+ld\.sender_seen_at/);
    expect(code).toMatch(/'last_progress_at',\s+GREATEST\(/);
    for (const source of ['ld.completed_at', 'letter_point_responses', 'story_explain_backs', 'ld.opened_at']) expect(code).toContain(source);
    expect(code).toMatch(/eb\.deleted_at IS NULL/);
    expect(code).toMatch(/AND cl\.sender_id = v_user_id/);
    expect(code).not.toMatch(/invitation_token/); // P1487: the token stays out
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_deliveries_with_progress\(uuid\[\]\) TO authenticated, service_role;/);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_deliveries_with_progress\(uuid\[\]\) TO[^;]*anon/);
  });

  it('back-fills the new mark from the old shared one, so switching on lights no past letter as new', () => {
    expect(sql).toMatch(/UPDATE public\.letter_deliveries\s+SET sender_seen_at = read_at\s+WHERE sender_seen_at IS NULL AND read_at IS NOT NULL;/);
  });
});
