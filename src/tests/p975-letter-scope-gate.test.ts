/**
 * @file p975-letter-scope-gate.test.ts
 * @description Canary for P975. P914 (20260610140000) added a relationship-scope
 * gate to seal_and_send_letter so a non-admin sender cannot resolve an arbitrary
 * profile's email by UUID (email-harvesting / unsolicited-letter oracle —
 * receiver_profile_id is caller-supplied and the function is SECURITY DEFINER).
 *
 * P952 (20260618120000) recreated the function from a pre-P914 base to add the
 * p_responses_mode parameter and SILENTLY DROPPED the gate, reopening the hole on
 * the reachable 4-arg overload. P975 restored it.
 *
 * This canary fails until the most recent migration that redefines
 * seal_and_send_letter contains the scope gate. It catches the same
 * CREATE-OR-REPLACE-from-an-old-base override pattern in the future — the exact
 * regression P952 was, which no test caught at the time.
 *
 * Mirrors the p819 imageUrl canary's structure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const FUNCTION_DEF_PATTERN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?seal_and_send_letter\b/i;
// The gate calls p878_relationship_scope and raises when the receiver is out of scope.
const SCOPE_GATE_PATTERN = /p878_relationship_scope\s*\(\s*v_sender_id\s*\)/i;
const SCOPE_EXCEPTION_PATTERN = /not in your relationship scope/i;

describe('p975: seal_and_send_letter migrations preserve the relationship-scope gate', () => {
  it(
    'the most recent migration that redefines seal_and_send_letter gates email resolution by relationship scope',
    () => {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      let latestMigration: string | null = null;
      let latestBody = '';
      for (const file of files) {
        const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        if (FUNCTION_DEF_PATTERN.test(body)) {
          latestMigration = file;
          latestBody = body;
        }
      }

      expect(latestMigration, 'No migration redefines seal_and_send_letter — schema regression').not.toBeNull();
      expect(
        SCOPE_GATE_PATTERN.test(latestBody) && SCOPE_EXCEPTION_PATTERN.test(latestBody),
        `${latestMigration} redefines seal_and_send_letter but does not gate receiver-email ` +
          `resolution on p878_relationship_scope. P914 added this gate to block an ` +
          `email-harvesting oracle (any authenticated user resolving any profile's email by ` +
          `UUID via the SECURITY DEFINER RPC); P952 silently dropped it when recreating the ` +
          `function from a pre-P914 base. Re-apply the gate before the email SELECT.`,
      ).toBe(true);
    },
  );
});
