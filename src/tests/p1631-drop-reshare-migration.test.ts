/**
 * @file p1631-drop-reshare-migration.test.ts
 * @description Source contract for 20261113150000_p1631_drop_reshare.sql: exactly one statement, the DROP of point_share_to_chat, and nothing else
 * in the migrations calls that function.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113150000_p1631_drop_reshare.sql';
const raw = readFileSync(join(MIG, FILE), 'utf8');
const code = raw.replace(/--[^\n]*/g, '').trim();

describe('20261113150000 drop the unused re-share function', () => {
  it('starts with the client-safe line and says why', () => {
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
    expect(raw).toContain('Founder decision 2026-11-13');
  });

  it('contains exactly the DROP and nothing else', () => {
    expect(code.replace(/\s+/g, ' ')).toBe('DROP FUNCTION IF EXISTS public.point_share_to_chat(uuid, uuid, uuid, uuid);');
  });

  it('no later migration creates or grants the function again, and no function body outside its own definitions calls it', () => {
    const later = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f > FILE);
    for (const f of later) expect(readFileSync(join(MIG, f), 'utf8').replace(/--[^\n]*/g, ''), f).not.toContain('point_share_to_chat');
    // every earlier mention (code, not comments) is the function's own create / replace / revoke / grant
    for (const f of readdirSync(MIG).filter((x) => /^\d{14}_.*\.sql$/.test(x) && x < FILE)) {
      const c = readFileSync(join(MIG, f), 'utf8').replace(/--[^\n]*/g, '');
      for (const line of c.split('\n').filter((l) => l.includes('point_share_to_chat'))) {
        expect(line, f).toMatch(/(CREATE OR REPLACE FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) public\.point_share_to_chat/);
      }
    }
  });
});
