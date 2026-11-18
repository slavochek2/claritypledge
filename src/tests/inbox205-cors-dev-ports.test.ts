/**
 * INBOX-205 / P1705: every origin the allocator can hand out (scripts/lib/worktree-port.mjs
 * devOrigins(): slots w1..w49, the named range, and load-test ports) must pass edge-function CORS.
 * The accepted set is DERIVED from the allocator, not hand-typed here.
 */
import { describe, expect, it } from 'vitest';
import { MAIN_PORT, devOrigins } from '../../scripts/lib/worktree-port.mjs';
import { resolveAllowedOrigin } from '../../supabase/functions/_shared/cors';

const PROD = 'https://claritypledge.com';
const origin = (port: number) => `http://localhost:${port}`;
const req = (o: string) => new Request('https://x.supabase.co/functions/v1/f', { headers: { Origin: o } });

describe('edge-function CORS accepts every allocator origin', () => {
  it('accepts every origin in devOrigins()', () => {
    const all = devOrigins();
    expect(all.length).toBeGreaterThan(100);
    for (const o of all) expect(resolveAllowedOrigin(req(o)), o).toBe(o);
  });

  it('main checkout is 5001', () => {
    expect(resolveAllowedOrigin(req(origin(MAIN_PORT)))).toBe(origin(MAIN_PORT));
  });

  it('w20 (7050) and w21 (7100) are accepted by name', () => {
    expect(resolveAllowedOrigin(req(origin(7050)))).toBe(origin(7050));
    expect(resolveAllowedOrigin(req(origin(7100)))).toBe(origin(7100));
  });

  it('CONTROL: 5000 and 7000 are Mac-reserved, 6000 is browser-restricted, the rest are not slots', () => {
    for (const p of [5000, 6000, 7000, 3000, 10000, 5150, 59000, 6099]) {
      expect(resolveAllowedOrigin(req(origin(p))), String(p)).toBe(PROD);
    }
  });
});
