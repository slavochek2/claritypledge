/**
 * @file p1621-remove-call.test.ts
 * @description P1621 round 2: removeCanvasDraftPoint maps the RPC's busy_elsewhere to busy, as editCanvasDraftPoint treats it: no throw, no re-read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: () => undefined }));
vi.mock('@/app/data/canvas-draft-events', () => ({ emitCanvasDraftEvent: (...a: unknown[]) => emit(...a) }));
vi.mock('@/app/prototypes/events/when-visible', () => ({ whenVisible: (f: () => void) => f() }));

import { removeCanvasDraftPoint } from '@/app/data/canvas-draft-remove-call';

beforeEach(() => { rpc.mockReset(); emit.mockReset(); });

describe('removeCanvasDraftPoint refusals', () => {
  it('busy_elsewhere reads as busy, does not throw, and asks for no re-read', async () => {
    rpc.mockResolvedValue({ data: { status: 'refused', code: 'busy_elsewhere', revision: 4 }, error: null });
    await expect(removeCanvasDraftPoint('d', 'p', 4)).resolves.toEqual({ ok: false, refused: 'busy', revision: 4 });
    expect(emit).not.toHaveBeenCalled();
  });
  it('stale_view still asks for a re-read', async () => {
    rpc.mockResolvedValue({ data: { status: 'refused', code: 'stale_view', revision: 5 }, error: null });
    await expect(removeCanvasDraftPoint('d', 'p', 4)).resolves.toMatchObject({ ok: false, refused: 'stale_view' });
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
