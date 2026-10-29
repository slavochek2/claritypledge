/**
 * @file p1536-canvas-service-draft-map.test.ts
 * @description P1536: `canvasService.getCanvas` maps what `get_canvas` now returns: a version's seq / published_at / draft
 * flag, `published_none`, and the owner-only `draft` block. An answer from before drafts reads as published, no draft.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(),
  throwDbError: (_what: string, error: { message?: string } | null, message: string) => { throw new Error(error?.message ?? message); },
}));

import { canvasService } from '@/app/data/canvas-service';

const answer = (access: Record<string, unknown>) => ({
  data: { points: [], stories: [], positions: [], visibility: 'private', access: { is_owner: true, admitted: true, ...access } },
  error: null,
});

beforeEach(() => rpc.mockReset());

describe('getCanvas maps the draft shape', () => {
  it('versions carry seq, published_at and the draft flag; published_none and the owner draft come through', async () => {
    rpc.mockResolvedValueOnce(answer({
      version: 'canvas_dabc123', published_none: true,
      versions: [{ name: 'canvas_dabc123', seq: null, published_at: null, created_at: '2026-10-20T10:00:00Z', draft: true }],
      draft: { id: 'draft-1', version: 'canvas_dabc123', questions: { 'canvas:love': 'Why?', 'canvas:bad': 7 }, thread_root_id: 'root-1', conversation_id: 'conv-1', base_seq: 2, run_count: 3, tension_count: 1 },
    }));
    const view = await canvasService.getCanvas('o', 'canvas');
    expect(view.versions).toEqual([{ name: 'canvas_dabc123', createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true }]);
    expect(view.publishedNone).toBe(true);
    expect(view.draft).toEqual({ id: 'draft-1', version: 'canvas_dabc123', questions: { 'canvas:love': 'Why?' }, threadRootId: 'root-1', conversationId: 'conv-1', baseSeq: 2, runCount: 3 });
  });

  it('CONTROL: an answer with no draft block and no published_none (a reader, or before drafts) maps to none', async () => {
    rpc.mockResolvedValueOnce(answer({ is_owner: false, version: 'sales', versions: [{ name: 'sales', seq: 1, published_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z' }] }));
    const view = await canvasService.getCanvas('o', 'sales');
    expect(view.draft).toBeNull();
    expect(view.publishedNone).toBe(false);
    expect(view.versions[0]).toMatchObject({ seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false });
  });
});
