/**
 * @file p1686-next-version-changes.test.tsx
 * @description P1686: the room card's change list and its Publish. Never publish blind (decisions.md 2026-11-13 [product]): Publish exists only
 * under the list of the draft being asked about, never after a successful Publish, and every refusal either re-reads or says it could not publish.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { publishCanvasDraft } = vi.hoisted(() => ({ publishCanvasDraft: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', () => ({ publishCanvasDraft }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas: vi.fn() } }));

import { diffCanvasPoints, CHANGES_COPY } from '@/app/prototypes/events/rounds/next-version-changes';
import { useNextVersionChanges } from '@/app/prototypes/events/rounds/use-next-version-changes';

const pt = (statement: string, box: string) => ({ statement, systemTags: [`canvas:${box}`] });
const VERSIONS = [{ name: 'v3-draft', seq: null, draft: true }, { name: 'v2', seq: 2, draft: false }, { name: 'v4-draft', seq: null, draft: true }];
function reads(draftPoints = [pt('New', 'segments')], basePoints = [pt('Old', 'segments')], changedBoxes: string[] = ['canvas:segments']) {
  return vi.fn(async (_o: string, _n: string, _v?: string, _k?: string, version?: string) => (version === 'v2'
    ? { points: basePoints, versions: VERSIONS, draft: null }
    : { points: draftPoints, versions: VERSIONS, draft: { id: `id-${version}`, version, baseSeq: 2, revision: 7, changedBoxes } })) as never;
}
const hook = (getCanvas: never, versionName = 'v3-draft', onSettled = vi.fn()) =>
  renderHook(({ v }: { v: string }) => useNextVersionChanges({ ownerId: 'p-owner', canvasName: 'launch_plan', versionName: v, onSettled, getCanvas }), { initialProps: { v: versionName } });

beforeEach(() => { publishCanvasDraft.mockReset(); });

describe('P1686 diffCanvasPoints', () => {
  it('lists boxes in the canvas reading order, counts duplicate text, and a first draft shows every point as added', () => {
    const d = diffCanvasPoints([pt('A', 'revenue'), pt('B', 'segments'), pt('B', 'segments')], [pt('B', 'segments')]);
    expect(d.map(b => b.tag)).toEqual(['canvas:segments', 'canvas:revenue']);
    expect(d[0].added).toEqual(['B']);
    expect(diffCanvasPoints([pt('A', 'problem')], null)).toEqual([{ tag: 'canvas:problem', title: 'Problem', added: ['A'], removed: [] }]);
  });
  it('a box the server counts as changed with the same words is still listed (Publish never hides a change)', () => {
    const d = diffCanvasPoints([pt('Same', 'problem')], [pt('Same', 'problem')], ['canvas:problem']);
    expect(d).toEqual([{ tag: 'canvas:problem', title: 'Problem', added: [], removed: [], sameWords: true }]);
  });
});

describe('P1686 useNextVersionChanges', () => {
  it('after a successful Publish there is no Publish while the offer is read again', async () => {
    let settle: () => void = () => undefined;
    publishCanvasDraft.mockImplementation(() => new Promise(res => { settle = () => res({ ok: true, seq: 3 }); }));
    const onSettled = vi.fn();
    const h = hook(reads(), 'v3-draft', onSettled);
    await waitFor(() => expect(h.result.current.publish).not.toBeNull());
    act(() => h.result.current.publish!());
    await act(async () => { settle(); await Promise.resolve(); });
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(publishCanvasDraft).toHaveBeenCalledWith('id-v3-draft', 7);
    expect(h.result.current.view.phase).toBe('published');
    expect(h.result.current.publish).toBeNull();
  });

  it('a refusal that is not a re-read keeps the list and says it could not publish', async () => {
    publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'cap_reached', revision: 7 });
    const h = hook(reads());
    await waitFor(() => expect(h.result.current.publish).not.toBeNull());
    await act(async () => { h.result.current.publish!(); });
    await waitFor(() => expect(h.result.current.note).toBe(CHANGES_COPY.failed));
    expect(h.result.current.view.phase).toBe('ready');
    expect(h.result.current.publish).not.toBeNull();
  });

  it('when the draft changes, the old list never stands under the new draft: no Publish until the new read is in', async () => {
    const getCanvas = reads();
    const h = hook(getCanvas);
    await waitFor(() => expect(h.result.current.publish).not.toBeNull());
    h.rerender({ v: 'v4-draft' });
    expect(h.result.current.publish).toBeNull(); // the very render the new draft arrives on
    expect(h.result.current.view.phase).toBe('loading');
    await waitFor(() => expect(h.result.current.publish).not.toBeNull());
    publishCanvasDraft.mockResolvedValue({ ok: true, seq: 3 });
    await act(async () => { h.result.current.publish!(); });
    expect(publishCanvasDraft).toHaveBeenCalledWith('id-v4-draft', 7);
  });
});

describe('P1686 notes never outlive their list', () => {
  it('a stale_view note shows only above the re-read list, and another draft clears a failed note', async () => {
    const h = hook(reads());
    await waitFor(() => expect(h.result.current.publish).not.toBeNull());
    publishCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'cap_reached', revision: 7 });
    await act(async () => { h.result.current.publish!(); });
    await waitFor(() => expect(h.result.current.note).toBe(CHANGES_COPY.failed));
    h.rerender({ v: 'v4-draft' });
    await waitFor(() => expect(h.result.current.note).toBeNull());

    const g = hook(reads());
    await waitFor(() => expect(g.result.current.publish).not.toBeNull());
    publishCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 8 });
    await act(async () => { g.result.current.publish!(); });
    await waitFor(() => expect(g.result.current.publish).not.toBeNull());
    expect(g.result.current.note).toBe(CHANGES_COPY.moved);
  });
});

describe('P1686 a Publish answer belongs to its draft', () => {
  it('a publish in flight when the card moves to another draft leaves the new draft\'s list and Publish alone', async () => {
    let answer: (v: unknown) => void = () => undefined;
    publishCanvasDraft.mockImplementationOnce(() => new Promise(res => { answer = res; }));
    const onSettled = vi.fn();
    const h = hook(reads(), 'v3-draft', onSettled);
    await waitFor(() => expect(h.result.current.publish).not.toBeNull());
    act(() => h.result.current.publish!());
    h.rerender({ v: 'v4-draft' });
    await waitFor(() => expect(h.result.current.view.phase).toBe('ready'));
    await act(async () => { answer({ ok: true, seq: 3 }); await Promise.resolve(); });
    expect(onSettled).toHaveBeenCalled();
    expect(h.result.current.view.phase).toBe('ready'); // not "published" over v4's list
    expect(h.result.current.publish).not.toBeNull();
  });
});
