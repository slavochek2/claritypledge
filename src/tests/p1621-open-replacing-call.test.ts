import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({ throwDbError: (_c: string, e: { message?: string }, m: string) => { throw new Error(`${m}: ${e?.message}`); } }));

import { openCanvasDraftReplacing } from '@/app/data/canvas-draft-service';
import { subscribeCanvasDraftEvents, type CanvasDraftEvent } from '@/app/data/canvas-draft-events';

const events: CanvasDraftEvent[] = [];
beforeEach(() => { rpc.mockReset(); maybeSingle.mockReset(); events.length = 0; });

describe('P1621 openCanvasDraftReplacing', () => {
  it('sends the contract arguments and maps the answer to OpenDraftResult', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'opened', draft_id: 'd2', conversation_id: 'c', thread_root_id: 't', canvas_name: 'canvas', version_name: 'v2', from_seq: 1 }, error: null });
    maybeSingle.mockResolvedValueOnce({ data: { revision: 3, canvas_id: 'cv', version_name: 'v2' }, error: null });
    expect(await openCanvasDraftReplacing('v1', 'd1', 5)).toEqual({
      status: 'opened', revision: 3, canvasId: 'cv', versionName: 'v2', draftId: 'd2', conversationId: 'c', threadRootId: 't', canvasName: 'canvas', fromSeq: 1,
    });
    expect(rpc).toHaveBeenCalledWith('canvas_draft_open_replacing', { p_from_version: 'v1', p_replace_draft: 'd1', p_replace_revision: 5 });
  });
  it('busy and stale_view are typed refusals; stale_view asks the page to re-read', async () => {
    const off = subscribeCanvasDraftEvents(e => events.push(e));
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'busy', revision: 5 }, error: null });
    expect(await openCanvasDraftReplacing('v1', 'd1', 5)).toEqual({ ok: false, refused: 'busy', revision: 5 });
    expect(events).toEqual([]);
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 6 }, error: null });
    expect(await openCanvasDraftReplacing('v1', 'd1', 5)).toEqual({ ok: false, refused: 'stale_view', revision: 6 });
    off();
    expect(events).toEqual([{ kind: 'updated', draftId: 'd1' }]);
  });
  it('a database refusal throws', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'too many open drafts' } });
    await expect(openCanvasDraftReplacing('v1', 'd1', 5)).rejects.toThrow();
  });
});
