/** P1529: startCanvasRun records the refusal it came back with and clears it on a valid start (a 200 with no run id is a failure). */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke }, from: vi.fn(), rpc: vi.fn() } }));

import { startCanvasRun } from '@/app/data/canvas-draft-calls';
import { clearStartRefusal, startInFlight, startRefusalOf } from '@/app/data/canvas-start-refusals';

const refusedWith = (status: number, body: unknown) => ({ data: null, error: { context: { status, clone: () => ({ json: async () => body }) } } });
afterEach(() => { clearStartRefusal('r1'); vi.clearAllMocks(); });

describe('startCanvasRun and the refusal store', () => {
  it('a 409 terms refusal is recorded under the run id', async () => {
    h.invoke.mockResolvedValue(refusedWith(409, { code: 'TERMS_NOT_ACCEPTED' }));
    expect(await startCanvasRun('r1')).toEqual({ ok: false, code: 'TERMS_NOT_ACCEPTED' });
    expect(startRefusalOf('r1')).toBe('TERMS_NOT_ACCEPTED');
  });
  it('a valid start (run_id present) clears an earlier refusal', async () => {
    h.invoke.mockResolvedValue(refusedWith(500, {}));
    await startCanvasRun('r1');
    expect(startRefusalOf('r1')).toBe('FAILED');
    h.invoke.mockResolvedValue({ data: { run_id: 'r1', kind: 'message' }, error: null });
    expect((await startCanvasRun('r1')).ok).toBe(true);
    expect(startRefusalOf('r1')).toBeNull();
  });
  it('a success answer without a run id is a failure, recorded, and clears nothing', async () => {
    h.invoke.mockResolvedValue({ data: {}, error: null });
    expect(await startCanvasRun('r1')).toEqual({ ok: false, code: 'FAILED' });
    expect(startRefusalOf('r1')).toBe('FAILED');
  });
  it('a rejected request records FAILED too, and the start is no longer in flight', async () => {
    h.invoke.mockRejectedValue(new Error('network down'));
    expect(await startCanvasRun('r1')).toEqual({ ok: false, code: 'FAILED' });
    expect(startRefusalOf('r1')).toBe('FAILED');
    expect(startInFlight('r1')).toBe(false);
  });
});
