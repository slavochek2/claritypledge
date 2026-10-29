/**
 * P1544: the server refuses mirror agent calls from a caller who has not accepted the current terms,
 * before any job, reservation or model call, and the client turns the typed refusal into a message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, from: vi.fn(), rpc: vi.fn() } }));

import { requestMirrorReply, newMirrorFace } from '@/app/data/mirror-service';

const refusal = (status: number, body: unknown) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } });
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('P1544: the client reads the typed refusal', () => {
  beforeEach(() => invoke.mockReset());

  it('409 TERMS_NOT_ACCEPTED is terms, for a reply and for a portrait', async () => {
    invoke.mockResolvedValue(refusal(409, { error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' }));
    expect(await requestMirrorReply('m1')).toBe('terms');
    expect(await newMirrorFace()).toBe('terms');
  });

  it('CONTROL: another 409 stays an ordinary failure, and a cap stays a cap', async () => {
    invoke.mockResolvedValueOnce(refusal(409, { state: 'cancelled' }));
    expect(await requestMirrorReply('m1')).toBe('cancelled');
    invoke.mockResolvedValueOnce(refusal(429, { code: 'CAPPED' }));
    expect(await requestMirrorReply('m1')).toBe('capped');
  });
});

describe('P1544: the gate runs first in both functions', () => {
  it.each([
    ['supabase/functions/mirror-portrait/index.ts', ["rpc('_mirror_begin_portrait'", 'await runArtistBanner({']],
  ])('%s checks terms before %j', (file, later) => {
    const src = read(file);
    const gate = src.indexOf('await callerHasCurrentTerms(');
    expect(gate, 'no gate call').toBeGreaterThan(-1);
    for (const token of later) {
      const at = src.indexOf(token);
      expect(at, `${token} missing`).toBeGreaterThan(-1);
      expect(gate, `${token} runs before the gate`).toBeLessThan(at);
    }
    expect(src).toContain('TERMS_NOT_ACCEPTED_STATUS');
  });

  // P1576: mirror-reply's logic moved into handler.ts with two entrances (the user's JWT, and the internal call the
  // voice-note trigger makes). EACH entrance must check terms before it creates a job or runs one (which reserves
  // spend and calls the model); index.ts only wires the real dependencies (hasTerms is callerHasCurrentTerms).
  it.each([
    ['handleUser', ['d.requestReply(', 'runJob(']],
    ['handleInternal', ['runJob(']],
  ])('mirror-reply handler.ts: %s checks terms before %j', (fn, later) => {
    const src = read('supabase/functions/mirror-reply/handler.ts');
    const start = src.indexOf(`async function ${fn}(`);
    expect(start, `${fn} missing`).toBeGreaterThan(-1);
    const end = src.indexOf('\n}\n', start);
    const body = src.slice(start, end);
    const gate = body.indexOf('await d.hasTerms(');
    expect(gate, 'no gate call').toBeGreaterThan(-1);
    for (const token of later) {
      const at = body.indexOf(token);
      expect(at, `${token} missing`).toBeGreaterThan(-1);
      expect(gate, `${token} runs before the gate`).toBeLessThan(at);
    }
    expect(read('supabase/functions/mirror-reply/index.ts')).toContain('hasTerms: (userId) => callerHasCurrentTerms(service, userId)');
  });
});
