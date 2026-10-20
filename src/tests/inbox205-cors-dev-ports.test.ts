/**
 * INBOX-205: every checkout's dev port (scripts/lib/worktree-port.mjs) must pass edge-function CORS.
 * w9 (5900) and w10 (6050) used to fall outside the allowed range, so the browser blocked every
 * edge-function call from those worktrees.
 */
import { describe, expect, it } from 'vitest';
import { MAIN_PORT, portForSlot } from '../../scripts/lib/worktree-port.mjs';
import { resolveAllowedOrigin } from '../../supabase/functions/_shared/cors';

const PROD = 'https://claritypledge.com';
const origin = (port: number) => `http://localhost:${port}`;
const req = (o: string) => new Request('https://x.supabase.co/functions/v1/f', { headers: { Origin: o } });

describe('edge-function CORS accepts every worktree dev port', () => {
  const slots = [null, ...Array.from({ length: 10 }, (_, i) => `w${i + 1}`), 'p1508-base', 'named-x'];
  for (const slot of slots) {
    it(`${slot ?? 'main'} → ${portForSlot(slot)}`, () => {
      const o = origin(portForSlot(slot));
      expect(resolveAllowedOrigin(req(o))).toBe(o);
    });
  }

  it('main checkout is 5001', () => {
    expect(resolveAllowedOrigin(req(origin(MAIN_PORT)))).toBe(origin(MAIN_PORT));
  });

  it('CONTROL: ports no checkout uses fall back to prod', () => {
    for (const p of [5000, 6000, 6051, 6100, 3000, 59000]) {
      expect(resolveAllowedOrigin(req(origin(p)))).toBe(PROD);
    }
  });
});
