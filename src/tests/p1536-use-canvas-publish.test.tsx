/**
 * @file p1536-use-canvas-publish.test.tsx
 * @description P1536 review C1: a typed Publish refusal (no_changes / draft_empty) puts a status in the spot for THAT draft at THAT
 * revision only. Another draft at the same revision, or the same draft at a newer revision, has its own Publish.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const publish = vi.hoisted(() => vi.fn());
const emitted = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/canvas-draft-events', () => ({ emitCanvasDraftEvent: emitted }));
vi.mock('@/app/data/canvas-draft-service', () => ({ publishCanvasDraft: publish }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { useCanvasPublish } from '@/app/components/canvas/use-canvas-publish';

const NAME = 'canvas_dabc123';
const point = { id: 'p1', systemTags: ['canvas:problem'] };
const ready = (draftId: string, revision: number): CanvasReady => ({
  status: 'ready', ownerId: 'o', ownerName: 'Ana', owner: { name: 'Ana', hasPledged: false }, points: [point], stories: new Map(), positions: new Map(),
  visibility: 'private', isOwner: true, generalAccess: 'restricted', via: null, audience: [], addedStoryIds: [], version: NAME,
  versions: [{ name: NAME, createdAt: null, seq: null, publishedAt: null, draft: true }], publishedNone: true,
  draft: { id: draftId, version: NAME, questions: {}, threadRootId: 'r', conversationId: 'c', baseSeq: null, runCount: 1, revision, changedBoxes: [] },
} as unknown as CanvasReady);

beforeEach(() => { publish.mockReset(); emitted.mockReset(); });

describe('X7: no_changes and draft_empty return the spot to "Nothing to publish yet" AND re-read', () => {
  it.each(['no_changes', 'draft_empty'])('%s: the status shows and the page is told to read the draft again', async (code) => {
    const { result } = renderHook(() => useCanvasPublish(ready('draft-A', 0), false));
    publish.mockResolvedValue({ ok: false, refused: code, revision: 0 });
    act(() => result.current.publish());
    await waitFor(() => expect(result.current.state.kind).toBe('nothing'));
    expect(emitted).toHaveBeenCalledWith({ kind: 'updated', draftId: 'draft-A' });
  });
});

describe('C1: a refusal belongs to one draft at one revision', () => {
  const refuse = async (result: { current: ReturnType<typeof useCanvasPublish> }) => {
    publish.mockResolvedValue({ ok: false, refused: 'no_changes', revision: 0 });
    act(() => result.current.publish());
    await waitFor(() => expect(result.current.state.kind).toBe('nothing'));
  };

  it('draft A refused with no_changes: the spot says so; draft B at the SAME revision still offers Publish', async () => {
    const { result, rerender } = renderHook(({ r }) => useCanvasPublish(r, false), { initialProps: { r: ready('draft-A', 0) } });
    expect(result.current.state.kind).toBe('publish');
    await refuse(result);
    rerender({ r: ready('draft-B', 0) });
    expect(result.current.state.kind).toBe('publish');
  });

  it('the same draft at a newer revision offers Publish again', async () => {
    const { result, rerender } = renderHook(({ r }) => useCanvasPublish(r, false), { initialProps: { r: ready('draft-A', 0) } });
    await refuse(result);
    rerender({ r: ready('draft-A', 1) });
    expect(result.current.state.kind).toBe('publish');
  });

  it('CONTROL: the refused draft at the refused revision keeps its status', async () => {
    const { result, rerender } = renderHook(({ r }) => useCanvasPublish(r, false), { initialProps: { r: ready('draft-A', 0) } });
    await refuse(result);
    rerender({ r: ready('draft-A', 0) });
    expect(result.current.state.kind).toBe('nothing');
  });
});
