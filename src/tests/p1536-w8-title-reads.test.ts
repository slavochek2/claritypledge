/**
 * @file p1536-w8-title-reads.test.ts
 * @description P1536 §3b W8: the owner's rename title reaches every read the client shows a canvas name from, and every one shows
 * `title ?? canvasTitle(name)` through the ONE helper (canvasDisplayTitle):
 *  - the canvas page (get_canvas: access.title, and access.canvas_id for the owner only) and the rename call (canvas_rename);
 *  - Artifacts: Mine, Drafts and Shared with me rows (list_my_artifacts_canvases, list_canvases_shared_with_me);
 *  - the chat's canvas attachment card (get_chat_artifact_attachment), the mirror card (list_my_canvas_versions) and the event page's list.
 * An answer from before the title (no field) reads exactly as it did.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from: vi.fn() } }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(),
  throwDbError: (_what: string, error: { message?: string } | null, message: string) => { throw new Error(error?.message ?? message); },
}));

import { canvasService } from '@/app/data/canvas-service';
import { buildReady } from '@/app/components/canvas/canvas-page-data';
import { listMyCanvasVersions } from '@/app/data/canvas-draft-service';
import { canvasDraftRow, ownCanvasRow, receivedCanvasRow } from '@/app/pages/artifacts/artifacts-view-model';
import type { OpenCanvasDraft } from '@/app/data/canvas-open-drafts';

beforeEach(() => rpc.mockReset());

const answer = (access: Record<string, unknown>) => ({
  data: { points: [], stories: [], positions: [], visibility: 'private', access: { admitted: true, ...access } },
  error: null,
});

describe('get_canvas: the page\'s read', () => {
  it('the owner gets the title and the canvas id; buildReady carries both', async () => {
    rpc.mockResolvedValueOnce(answer({ is_owner: true, title: 'Series A plan', canvas_id: 'cv-1' }));
    const view = await canvasService.getCanvas('o', 'canvas_4');
    expect(view.title).toBe('Series A plan');
    expect(view.canvasId).toBe('cv-1');
    const ready = buildReady({ id: 'o', name: 'Ana' }, view, null);
    expect(ready.title).toBe('Series A plan');
    expect(ready.canvasId).toBe('cv-1');
  });

  it('a reader gets the title (it is the canvas\'s name) but NEVER a canvas id, even if the answer carried one', async () => {
    rpc.mockResolvedValueOnce(answer({ is_owner: false, title: 'Series A plan', canvas_id: 'cv-1' }));
    const view = await canvasService.getCanvas('o', 'canvas_4');
    expect(view.title).toBe('Series A plan');
    expect(view.canvasId).toBeNull();
    expect(buildReady({ id: 'o', name: 'Ana' }, view, null).canvasId).toBeNull();
  });

  it('CONTROL: an answer from before titles reads as no title and no id', async () => {
    rpc.mockResolvedValueOnce(answer({ is_owner: true }));
    const view = await canvasService.getCanvas('o', 'canvas_4');
    expect(view.title).toBeNull();
    expect(view.canvasId).toBeNull();
  });
});

describe('canvas_rename: the call', () => {
  it('sends the canvas id and the title, and returns what the database stored', async () => {
    rpc.mockResolvedValueOnce({ data: 'Series A plan', error: null });
    await expect(canvasService.renameCanvas('cv-1', 'Series A plan')).resolves.toBe('Series A plan');
    expect(rpc).toHaveBeenCalledWith('canvas_rename', { p_canvas: 'cv-1', p_title: 'Series A plan' });
  });
  it('a refusal rejects (the caller rolls back)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not authorized for this canvas' } });
    await expect(canvasService.renameCanvas('cv-1', 'x')).rejects.toThrow('not authorized');
  });
});

describe('Artifacts rows show the title, else the name\'s title', () => {
  it('list_my_artifacts_canvases and list_canvases_shared_with_me map title; rows use it', async () => {
    rpc.mockResolvedValueOnce({ data: [{ canvas_id: 'c1', name: 'canvas_4', general_access: 'restricted', has_audience: false, last_edit: '2026-10-30T10:00:00Z', title: 'Series A plan' }, { canvas_id: 'c2', name: 'canvas_5', general_access: 'restricted', has_audience: false, last_edit: null }], error: null });
    const mine = await canvasService.listMyCanvases();
    expect(mine.map(c => c.title)).toEqual(['Series A plan', null]);
    expect(ownCanvasRow(mine[0]!, 'ana').title).toBe('Series A plan');
    expect(ownCanvasRow(mine[1]!, 'ana').title).toBe('Canvas 5'); // never renamed: the name's own title, as before

    rpc.mockResolvedValueOnce({ data: [{ canvas_id: 'c3', name: 'canvas_7', owner_id: 'o', owner_name: 'Bo', owner_slug: 'bo', via: 'person', shared_at: '2026-10-30T10:00:00Z', unread: false, title: 'Pricing bets' }], error: null });
    const shared = await canvasService.listSharedWithMe();
    expect(shared[0]!.title).toBe('Pricing bets');
    expect(receivedCanvasRow(shared[0]!).title).toBe('Pricing bets');
  });

  it('a Drafts row takes the title from the canvas\'s row in the owner\'s list (the draft row itself has only the address name)', () => {
    const draft = { draftId: 'd1', canvasName: 'canvas_4', versionName: 'canvas_d1', conversationId: 'cv', threadRootId: 't', revision: 1, nextSeq: 2 } as unknown as OpenCanvasDraft;
    const row = { canvasId: 'c1', name: 'canvas_4', generalAccess: 'restricted', hasAudience: false, lastEdit: null, title: 'Series A plan' } as const;
    expect(canvasDraftRow(draft, row, 'ana').title).toBe('Series A plan');
    expect(canvasDraftRow(draft, { ...row, title: null }, 'ana').title).toBe('Canvas 4');
    expect(canvasDraftRow(draft, undefined, 'ana').title).toBe('Canvas 4');
  });
});

describe('the chat\'s cards and the event page', () => {
  it('get_chat_artifact_attachment: the canvas card carries the title (a letter\'s own title is untouched)', async () => {
    rpc.mockResolvedValueOnce({ data: { available: true, kind: 'canvas', id: 'c1', name: 'canvas_4', title: 'Series A plan', owner_id: 'o', owner_name: 'Ana', owner_slug: 'ana', is_owner: true }, error: null });
    const card = await canvasService.getChatArtifact('canvas', 'c1');
    expect(card).toMatchObject({ available: true, kind: 'canvas', name: 'canvas_4', title: 'Series A plan' });
    rpc.mockResolvedValueOnce({ data: { available: true, kind: 'letter', id: 'l1', title: 'A letter', sender_id: 's', is_sender: true }, error: null });
    expect(await canvasService.getChatArtifact('letter', 'l1')).toMatchObject({ kind: 'letter', title: 'A letter' });
  });

  it('list_my_canvas_versions: each version carries its canvas\'s title', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'v1', canvas_id: 'c1', canvas_name: 'canvas_4', canvas_title: 'Series A plan', name: 'canvas_d1', seq: 1, published_at: '2026-10-01T10:00:00Z', has_open_draft: false }, { id: 'v2', canvas_id: 'c2', canvas_name: 'canvas_5', name: 'canvas_d2', seq: 1, published_at: '2026-10-02T10:00:00Z' }], error: null });
    const versions = await listMyCanvasVersions();
    expect(versions.map(v => v.canvasTitle)).toEqual(['Series A plan', null]);
  });

  it('list_canvases_shared_with_event: each canvas carries its title (the event page falls back to the name)', async () => {
    rpc.mockResolvedValueOnce({ data: [{ owner_id: 'o', owner_name: 'Ana', owner_slug: 'ana', name: 'canvas_4', title: 'Series A plan' }, { owner_id: 'o', owner_name: 'Ana', owner_slug: 'ana', name: 'canvas_5' }], error: null });
    const list = await canvasService.listSharedWithEvent('e1');
    expect(list.map(c => c.title ?? c.name)).toEqual(['Series A plan', 'canvas_5']);
  });
});
