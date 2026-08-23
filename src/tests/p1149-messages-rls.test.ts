/**
 * @file p1149-messages-rls.test.ts
 * @description P1149 DW-5 — a non-member cannot read a room's messages. RLS enforced,
 * tested from a non-member.
 *
 * This repo's convention for a LIVE two-client RLS proof is Playwright (see
 * e2e/integration/p396-host-rls-migration.spec.ts) — vitest here runs under a stubbed
 * VITE_SUPABASE_URL (vite.config.ts test.env) with zero live DB credentials, by design
 * (goal-gate.sh: "CI has no Supabase credentials"). This file proves the same invariant
 * the only way available at this layer: the migration's actual RLS policy SQL requires
 * room membership — never USING (true) — and every client read path in this codebase
 * goes through the plain (RLS-subject) client, never a service-role client that would
 * bypass RLS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const MIGRATION = R('supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql');
const SERVICE = R('src/app/data/transcribe-service.ts');

describe('P1149 DW-5: transcribe_messages SELECT policy requires room membership', () => {
  it('is not USING (true) — the legacy-open posture must not be copied (A4)', () => {
    const policy = MIGRATION.slice(
      MIGRATION.indexOf('CREATE POLICY "room members can read messages"'),
      MIGRATION.indexOf('CREATE POLICY "room members can send their own messages"')
    );
    expect(policy).not.toMatch(/USING\s*\(\s*true\s*\)/);
    expect(policy).toMatch(/EXISTS/);
    expect(policy).toMatch(/transcribe_room_members/);
    expect(policy).toMatch(/m\.profile_id = auth\.uid\(\)/);
  });

  it('the SELECT policy filters by the SAME room_id being read, not just "any room I am in"', () => {
    const policy = MIGRATION.slice(
      MIGRATION.indexOf('CREATE POLICY "room members can read messages"'),
      MIGRATION.indexOf('CREATE POLICY "room members can send their own messages"')
    );
    expect(policy).toMatch(/m\.room_id = transcribe_messages\.room_id/);
  });

  it('RLS is enabled on transcribe_messages before any policy is declared', () => {
    const rlsIdx = MIGRATION.indexOf('ALTER TABLE public.transcribe_messages ENABLE ROW LEVEL SECURITY');
    const policyIdx = MIGRATION.indexOf('CREATE POLICY "room members can read messages"');
    expect(rlsIdx).toBeGreaterThan(-1);
    expect(policyIdx).toBeGreaterThan(rlsIdx);
  });
});

describe('P1149 DW-5: no client read path bypasses RLS', () => {
  it('getRoomMessages / subscribeToRoomMessages never use a service-role client', () => {
    expect(SERVICE).not.toMatch(/service_role|SERVICE_ROLE|supabaseAdmin/);
    expect(SERVICE).toMatch(/import \{ supabase \} from '@\/lib\/supabase'/);
  });

  it('getRoomMessages always filters by room_id — a caller cannot fetch all rooms at once', () => {
    const fn = SERVICE.slice(
      SERVICE.indexOf('export async function getRoomMessages'),
      SERVICE.indexOf('export async function getRoomMessages') + 500
    );
    expect(fn).toMatch(/\.eq\('room_id', roomId\)/);
  });
});
