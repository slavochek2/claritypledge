/**
 * @file p1536-canvas-open-drafts.test.ts
 * @description P1536 v3: the owner's open drafts for the Artifacts list. The draft rows are read directly (RLS: owner only,
 * state 'open'); the number a draft gets is one above the newest PUBLISHED version of its own canvas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as unknown }, eq: vi.fn(), select: vi.fn(), from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { from: q.from, rpc: q.rpc } }));

import { listMyOpenCanvasDrafts, listNewestPublishedSeqs } from '@/app/data/canvas-open-drafts';

const row = (over: Record<string, unknown> = {}) => ({ id: 'draft-1', canvas_id: 'cv-1', canvas_name: 'sales_map', conversation_id: 'conv-1', thread_root_id: 'root-1', ...over });
const version = (canvas: string, seq: number) => ({ id: `v-${canvas}-${seq}`, canvas_id: canvas, canvas_name: canvas, name: `n${seq}`, seq, published_at: '2026-10-01T00:00:00Z', has_open_draft: true });

beforeEach(() => {
  vi.clearAllMocks();
  q.result = { data: [], error: null };
  q.eq.mockImplementation(async () => q.result);
  q.select.mockReturnValue({ eq: q.eq });
  q.from.mockReturnValue({ select: q.select });
  q.rpc.mockResolvedValue({ data: [], error: null });
});

describe('listMyOpenCanvasDrafts', () => {
  it('reads only open drafts, from canvas_drafts, and gives each its address and its next number', async () => {
    q.result = { data: [row(), row({ id: 'draft-2', canvas_id: 'cv-2', canvas_name: 'q4_plan', thread_root_id: 'root-2' })], error: null };
    q.rpc.mockResolvedValue({ data: [version('cv-1', 1), version('cv-1', 2), version('cv-2', 1), version('cv-other', 7)], error: null });
    const drafts = await listMyOpenCanvasDrafts();
    expect(q.from).toHaveBeenCalledWith('canvas_drafts');
    expect(q.eq).toHaveBeenCalledWith('state', 'open');
    expect(drafts).toEqual([
      { draftId: 'draft-1', canvasName: 'sales_map', conversationId: 'conv-1', threadRootId: 'root-1', revision: 0, nextSeq: 3 },
      { draftId: 'draft-2', canvasName: 'q4_plan', conversationId: 'conv-1', threadRootId: 'root-2', revision: 0, nextSeq: 2 },
    ]); // cv-other's v7 does not count for either
  });

  it('a first canvas (nothing published) is v1', async () => {
    q.result = { data: [row()], error: null };
    expect((await listMyOpenCanvasDrafts())[0]!.nextSeq).toBe(1);
  });

  it('no drafts: no second read', async () => {
    expect(await listMyOpenCanvasDrafts()).toEqual([]);
    expect(q.rpc).not.toHaveBeenCalled();
  });

  it('a failed version read leaves the number unknown; a failed draft read throws', async () => {
    q.result = { data: [row()], error: null };
    q.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect((await listMyOpenCanvasDrafts())[0]!.nextSeq).toBeNull();
    q.result = { data: [] as unknown[], error: { code: '42501', message: 'denied' } };
    await expect(listMyOpenCanvasDrafts()).rejects.toBeTruthy();
  });
});

describe('listNewestPublishedSeqs (3c X14: a Mine row says the newest PUBLISHED number)', () => {
  it('is the highest published seq per canvas name, whatever order the versions come in', async () => {
    q.rpc.mockResolvedValue({ data: [version('sales_map', 2), version('sales_map', 3), version('sales_map', 1), version('q4_plan', 1)], error: null });
    expect(await listNewestPublishedSeqs()).toEqual({ sales_map: 3, q4_plan: 1 });
    expect(q.rpc).toHaveBeenCalledWith('list_my_canvas_versions');
  });

  it('no published versions: no numbers; a failed read throws, so the page can say numbers are missing', async () => {
    expect(await listNewestPublishedSeqs()).toEqual({});
    q.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(listNewestPublishedSeqs()).rejects.toBeTruthy();
  });
});
