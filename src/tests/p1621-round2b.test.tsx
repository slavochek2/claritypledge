/** @vitest-environment jsdom */
/**
 * @file p1621-round2b.test.tsx
 * @description P1621 round 2, review round 2: a draft belongs to the clone that asked for it, keys with "|" in a point's words survive, Start over is one
 * transaction, Remove's sentences and buffer, the points lookup is narrowed and owner-bound, an unknown box tag cannot crash a pill.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointWithUserPosition } from '@/app/types';

const svc = vi.hoisted(() => ({ remove: vi.fn(), versions: vi.fn(), open: vi.fn(), replacing: vi.fn(), revision: vi.fn(), discard: vi.fn(), add: vi.fn(), edit: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  addCanvasDraftPoint: (...a: unknown[]) => svc.add(...a),
  editCanvasDraftPoint: (...a: unknown[]) => svc.edit(...a),
  removeCanvasDraftPoint: (...a: unknown[]) => svc.remove(...a),
  listMyCanvasVersions: () => svc.versions(),
  getCanvasDraftRevision: (...a: unknown[]) => svc.revision(...a),
  discardCanvasDraft: (...a: unknown[]) => svc.discard(...a),
  openCanvasDraftReplacing: (...a: unknown[]) => svc.replacing(...a),
  CanvasDraftRefusal: class extends Error { constructor(public code: string) { super(code); } },
}));
vi.mock('@/app/pages/chat/canvas-start', () => ({
  startCanvasThread: (...a: unknown[]) => svc.open(...a),
  canvasStartErrorText: (e: unknown) => ((e as { code?: string } | null)?.code === 'RUN_ACTIVE' ? 'That draft is being written right now. Try again in a minute.' : 'Could not start a canvas. Try again.'),
}));
const registered = vi.hoisted(() => vi.fn());
vi.mock('@/app/pages/chat/canvas-thread-registry', () => ({ registerCanvasThread: (...a: unknown[]) => registered(...a) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));
const pointRows = vi.hoisted(() => ({ rows: [] as unknown[], contains: [] as unknown[][], eq: [] as unknown[][], is: [] as unknown[][], error: null as { message: string } | null, gate: null as Promise<void> | null }));
const pointsQuery = (): Promise<unknown> & { eq: (...a: unknown[]) => unknown; is: (...a: unknown[]) => unknown } => {
  const r = (pointRows.gate ?? Promise.resolve()).then(() => ({ data: pointRows.error ? null : pointRows.rows, error: pointRows.error })) as Promise<unknown> & { eq: (...a: unknown[]) => unknown; is: (...a: unknown[]) => unknown };
  r.eq = (...a: unknown[]) => { pointRows.eq.push(a); return pointsQuery(); };
  r.is = (...a: unknown[]) => { pointRows.is.push(a); return pointsQuery(); };   // currentVersionsOnly: only current versions of a point
  return r;
};
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ contains: (...a: unknown[]) => { pointRows.contains.push(a); return pointsQuery(); } }) }) } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'owner-1' } }, user: { id: 'owner-1' } }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/pages/chat/chat-hooks', async (orig) => ({ ...(await orig<typeof import('@/app/pages/chat/chat-hooks')>()), hasFinePointer: () => true }));

import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { OPEN_ELSEWHERE_TEXT, REMOVE_AMBIGUOUS_TEXT, type EnsureDraft } from '@/app/components/canvas/canvas-hand-draft';
import { BUSY_POINT_TEXT, STALE_POINT_TEXT, type PointEditConfig } from '@/app/components/canvas/canvas-point-edit';
import { ensureNewCard, getNewCards, newCardKey, patchNewCard, resetNewCards } from '@/app/components/canvas/canvas-new-card-store';
import { claimPanelBox, getPointEdits, openPointEdit, pointEditKey, resetPointEdits } from '@/app/components/canvas/canvas-point-edit-store';
import { dropFocusRequest } from '@/app/components/canvas/canvas-focus-request';
import { CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';
import { FULL_BOX_TEXT } from '@/app/components/canvas/canvas-new-card-copy';
import { bufferCanvasId } from '@/app/components/canvas/canvas-page-data';
import { ComposerTagPills } from '@/app/pages/chat/ComposerTagPills';
import { Composer } from '@/app/pages/chat/Composer';
import { ComposerTagContext, createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import { pointKey } from '@/app/pages/chat/composer-tags';
import { useHandDraft } from '@/app/pages/chat/use-hand-draft';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';

const PROB = 'canvas:problem' as CanvasBoxTag;
const SEG = 'canvas:segments' as CanvasBoxTag;
const pt = (id: string, statement: string, box: CanvasBoxTag) => ({ id, statement, tags: [], systemTags: [box], visibility: 'private', userPosition: null } as unknown as PointWithUserPosition);
type Boxes = Map<CanvasBoxTag, PointWithUserPosition[]>;
const boxesOf = (o: Partial<Record<CanvasBoxTag, PointWithUserPosition[]>>): Boxes => new Map(CANVAS_LAYERS.flatMap(l => l.boxes).map(t => [t, o[t] ?? []]));
const ONE = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB)] });
const cfg = (o: Partial<PointEditConfig> = {}): PointEditConfig => ({ canvasId: 'c1', draftId: 'd1', revision: 4, runActive: false, userId: 'owner-1', ...o });
const ws = (): CanvasWorkspaceValue => ({ active: true, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: true, addToChat: vi.fn() });
const view = (boxes: Boxes, edit?: PointEditConfig, canvasId?: string): ReactNode => (
  <MemoryRouter>
    <CanvasWorkspaceContext.Provider value={ws()}>
      <div data-canvas-page><CanvasGrid boxes={boxes} renderCard={p => <CanvasCard key={p.id} point={p} positions={null} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />} onMore={() => undefined} edit={edit} canvasId={canvasId ?? edit?.canvasId} /></div>
    </CanvasWorkspaceContext.Provider>
  </MemoryRouter>
);
const ensureSelected = (tag: string) => { const t = screen.getByTestId(`canvas-box-title-${tag}`); if (t.getAttribute('aria-pressed') !== 'true') fireEvent.click(t); };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  Object.values(svc).forEach(f => f.mockReset());
  toastError.mockReset(); registered.mockReset();
  resetPointEdits(); resetNewCards(); dropFocusRequest(); clearDraftsExcept(null);
  pointRows.rows = []; pointRows.contains = []; pointRows.eq = []; pointRows.is = []; pointRows.error = null; pointRows.gate = null;
  window.localStorage.clear();
  svc.versions.mockResolvedValue([{ id: 'ver-2', canvasName: 'canvas', name: 'v2' }, { id: 'ver-3', canvasName: 'canvas', name: 'v3' }]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('2: a draft belongs to the clone that asked for it', () => {
  it('switching v2 to v3 gives v3 its own draft, and the stale v2 result never navigates', async () => {
    let release: (v: unknown) => void = () => undefined;
    svc.open.mockImplementation((id: string) => (id === 'ver-2'
      ? new Promise(r => { release = r; })
      : Promise.resolve({ status: 'opened', draftId: 'd3', revision: 1, versionName: 'v_3', threadRootId: 't3' })));
    const onOpened = vi.fn();
    const { result, rerender } = renderHook(({ v }) => useHandDraft({ version: v }, 'canvas', onOpened), { initialProps: { v: 'v2' } });
    let a!: ReturnType<EnsureDraft>;
    act(() => { a = result.current!(); });
    rerender({ v: 'v3' });
    const b = await result.current!();
    expect(svc.open.mock.calls.map(c => c[0])).toEqual(['ver-2', 'ver-3']);
    if (!b.ok) throw new Error('ok expected');
    expect(b.draftId).toBe('d3');
    await act(async () => { release({ status: 'opened', draftId: 'd2', revision: 1, versionName: 'v_2', threadRootId: 't2' }); });
    const ra = await a;
    if (!ra.ok) throw new Error('ok expected');
    ra.moveTo();
    expect(onOpened, 'the old clone does not move the page').not.toHaveBeenCalled();
    b.moveTo();
    expect(onOpened).toHaveBeenCalledWith('v_3');
  });
  it('another canvas with the same version name is another clone too', async () => {
    svc.versions.mockResolvedValue([{ id: 'ver-a', canvasName: 'one', name: 'v2' }, { id: 'ver-b', canvasName: 'two', name: 'v2' }]);
    svc.open.mockResolvedValue({ status: 'opened', draftId: 'd', revision: 1, versionName: 'v_x', threadRootId: 't' });
    const { result, rerender } = renderHook(({ tag }) => useHandDraft({ version: 'v2' }, tag, vi.fn()), { initialProps: { tag: 'one' } });
    await result.current!();
    rerender({ tag: 'two' });
    await result.current!();
    expect(svc.open.mock.calls.map(c => c[0])).toEqual(['ver-a', 'ver-b']);
  });
});

describe('3: a point whose words contain "|" keeps its own key through the composer and the bus', () => {
  it('after a change that only the effect reports (another pill removed), the bus still holds exactly the key', async () => {
    const bus = createComposerTagBus();
    const key = pointKey(PROB, 'cats | dogs');
    render(<ComposerTagContext.Provider value={bus}><Composer draftKey="u:r2b" placeholder="Say" onSend={vi.fn()} /></ComposerTagContext.Provider>);
    act(() => { bus.hold(key); bus.flush(true); });
    act(() => { bus.hold(SEG); bus.flush(true); });
    await act(async () => {});
    expect([...bus.mentioned()].sort()).toEqual([key, SEG].sort());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Customer Segments' }));
    await act(async () => {});
    expect([...bus.mentioned()]).toEqual([key]);
  });
});

describe('4: Start over is one transaction', () => {
  it('uses openCanvasDraftReplacing with the sheet\'s revision, never a client discard, and registers the thread', async () => {
    svc.replacing.mockResolvedValue({ status: 'opened', draftId: 'd-r', revision: 2, versionName: 'v_r', threadRootId: 'root-r' });
    const { result } = renderHook(() => useHandDraft({ version: 'v2', replace: { id: 'old', revision: 5 } }, 'canvas', vi.fn()));
    const r = await result.current!();
    expect(r.ok).toBe(true);
    expect(svc.replacing).toHaveBeenCalledWith('ver-2', 'old', 5);
    expect(svc.discard).not.toHaveBeenCalled();
    expect(svc.open).not.toHaveBeenCalled();
    expect(registered).toHaveBeenCalledWith('root-r');
  });
  it('a stale refusal keeps the text with the stale sentence; busy says the draft is being written', async () => {
    svc.replacing.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 6 });
    const { result } = renderHook(() => useHandDraft({ version: 'v2', replace: { id: 'old', revision: 5 } }, 'canvas', vi.fn()));
    expect(await result.current!()).toEqual({ ok: false, text: STALE_POINT_TEXT });
    svc.replacing.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 5 });
    expect(await result.current!()).toEqual({ ok: false, text: 'That draft is being written right now. Try again in a minute.' });
  });
});

describe('5-7: Remove', () => {
  const made = (over: Record<string, unknown> = {}) => {
    const moveTo = vi.fn();
    const ensure = vi.fn(async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo, ...over }));
    return { ensure: ensure as unknown as EnsureDraft, moveTo };
  };
  const pcfg = (ensure: EnsureDraft) => cfg({ draftId: '', revision: 0, ensure });

  it('5: when the draft cannot be made there is one toast: the reason, not also the generic failure', async () => {
    const ensure = vi.fn(async () => ({ ok: false as const, text: 'Could not start a canvas. Try again.' }));
    render(view(ONE, pcfg(ensure as unknown as EnsureDraft)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-remove-p1'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await act(async () => {});
    expect(toastError.mock.calls).toEqual([['Could not start a canvas. Try again.']]);
  });

  it('6: an ambiguous point says so with a Remove-specific sentence and the page still moves to the new draft', async () => {
    const m = made();
    pointRows.rows = [
      { id: 'c1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] },
      { id: 'c2', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] },
    ];
    render(view(ONE, pcfg(m.ensure)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-remove-p1'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(REMOVE_AMBIGUOUS_TEXT));
    expect(REMOVE_AMBIGUOUS_TEXT).toBe('This point changed. Try Remove again.');
    expect(svc.remove).not.toHaveBeenCalled();
    expect(m.moveTo).toHaveBeenCalled();
  });

  it('7: a successful Remove closes any edit buffer for that point', async () => {
    svc.remove.mockResolvedValue({ ok: true, revision: 5 });
    const un = claimPanelBox(PROB);   // the panel holds the box's editors: the grid draws the card, and the buffer waits
    openPointEdit({ canvasId: 'c1', box: PROB, originId: 'p1', text: 'half typed' });
    render(view(ONE, cfg()));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    await waitFor(() => expect(getPointEdits().get(pointEditKey('c1', 'p1'))).toBeUndefined());
    un();
  });
});

describe('8: the points lookup', () => {
  it('is narrowed server-side to the draft AND the box, and bound to the owner', async () => {
    const moveTo = vi.fn();
    const ensure = (async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo })) as unknown as EnsureDraft;
    pointRows.rows = [{ id: 'p1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.remove.mockResolvedValue({ ok: true, revision: 8 });
    render(view(ONE, cfg({ draftId: '', revision: 0, ensure })));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    expect(pointRows.contains).toContainEqual(['system_tags', ['canvas_v_d1', PROB]]);
    expect(pointRows.eq).toContainEqual(['first_validator_id', 'owner-1']);
    expect(pointRows.is, 'only current versions of a point (p1337 guard)').toContainEqual(['superseded_by', null]);
  });
});

describe('9: a pill with an unknown box tag', () => {
  it('draws without a box icon instead of crashing', () => {
    render(<ComposerTagPills tags={['canvas:bogus']} onRemove={() => undefined} />);
    expect(screen.getAllByTestId('composer-tag-pill')).toHaveLength(1);
    expect(screen.queryByTestId('canvas-box-icon')).toBeNull();
  });
});


// ---- review round 5: unsaved text is keyed by the canvas, so nothing ever moves ----
const mk = () => {
  const moveTo = vi.fn();
  const ensure = (async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo })) as unknown as EnsureDraft;
  return { ensure, moveTo };
};
const clonePage = (ensure: EnsureDraft) => cfg({ draftId: '', revision: 0, ensure });
const typeNew = (v: string) => fireEvent.change(screen.getByLabelText('New card'), { target: { value: v } });

describe('r5: a canvas keeps its unsaved text across the clone becoming its draft', () => {
  it('text typed on a pending clone is the same buffer on the draft: no move, nothing lost, shown in place', () => {
    const m = mk();
    const first = render(view(ONE, clonePage(m.ensure)));
    ensureSelected(SEG);
    typeNew('Typed on the clone');
    first.unmount();
    // the first message (or any write) made the draft: the page now has the draft's config, same canvas
    render(view(ONE, cfg({ draftId: 'new-d', revision: 3 })));
    ensureSelected(SEG);
    expect((screen.getByLabelText('New card') as HTMLTextAreaElement).value).toBe('Typed on the clone');
    expect(getNewCards().size, 'one buffer, never copied or moved').toBe(1);
  });

  it('a late refused save after the store was reset does not recreate the buffer (new card)', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.add.mockReturnValue(new Promise(r => { answer = r; }));
    render(view(boxesOf({}), cfg()));
    ensureSelected(SEG);
    typeNew('Typed');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(svc.add).toHaveBeenCalled());
    act(() => { resetNewCards(); });   // sign-out, a different person, the page leaving
    await act(async () => { answer({ ok: false, refused: 'busy', revision: 4 }); });
    expect(getNewCards().size).toBe(0);
  });

  it('a late refused save after the store was reset does not recreate the buffer (Edit)', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.edit.mockReturnValue(new Promise(r => { answer = r; }));
    render(view(ONE, cfg()));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(svc.edit).toHaveBeenCalled());
    act(() => { resetPointEdits(); });
    await act(async () => { answer({ ok: false, refused: 'stale_view', revision: 4 }); });
    expect(getPointEdits().size).toBe(0);
  });

  it('text that lands in the buffer while a save is in flight is not overwritten by the refusal', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.add.mockReturnValue(new Promise(r => { answer = r; }));
    render(view(boxesOf({}), cfg()));
    ensureSelected(SEG);
    typeNew('Typed');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(svc.add).toHaveBeenCalled());
    act(() => patchNewCard(newCardKey('c1', SEG), { text: 'Typed meanwhile' }));
    await act(async () => { answer({ ok: false, refused: 'busy', revision: 4 }); });
    expect(getNewCards().get(newCardKey('c1', SEG))).toMatchObject({ text: 'Typed meanwhile', problem: BUSY_POINT_TEXT, saving: false });
  });

  it('a successful first save from a clone closes its buffer by the canvas key', async () => {
    const m = mk();
    svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'n', revision: 8 });
    render(view(boxesOf({}), clonePage(m.ensure)));
    ensureSelected(SEG);
    typeNew('Saved');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    expect(getNewCards().size).toBe(0);
  });

  it('a box_full refusal keeps its revision on the same buffer, so Save returns when the box has room', async () => {
    const m = mk();
    svc.add.mockResolvedValue({ ok: false, refused: 'box_full', revision: 9 });
    render(view(boxesOf({}), clonePage(m.ensure)));
    ensureSelected(SEG);
    typeNew('Too many');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    expect(getNewCards().get(newCardKey('c1', SEG))).toMatchObject({ problem: FULL_BOX_TEXT, fullAtRevision: 9, text: 'Too many' });
  });

  it('an Edit whose lookup fails keeps its text on its buffer with the failure sentence', async () => {
    const m = mk();
    pointRows.error = { message: 'down' };
    render(view(ONE, clonePage(m.ensure)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    expect(svc.edit).not.toHaveBeenCalled();
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))).toMatchObject({ text: 'Edited', problem: 'Could not save this point. Try again.', saving: false });
  });
});

// ---- review round 6 ----
describe('r6-1: a late success never deletes a buffer it did not send', () => {
  it('new card: buffers reset, new text typed in the same box, then the old save succeeds: the new text stays', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.add.mockReturnValue(new Promise(r => { answer = r; }));
    render(view(boxesOf({}), cfg()));
    ensureSelected(SEG);
    typeNew('Old text');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(svc.add).toHaveBeenCalled());
    act(() => { resetNewCards(); });
    act(() => { ensureNewCard('c1', SEG); patchNewCard(newCardKey('c1', SEG), { text: 'New text' }); });
    await act(async () => { answer({ ok: true, changed: true, pointId: 'n', revision: 5 }); });
    expect(getNewCards().get(newCardKey('c1', SEG))?.text).toBe('New text');
  });

  it('Edit: the same for a buffer reopened on the same point', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.edit.mockReturnValue(new Promise(r => { answer = r; }));
    render(view(ONE, cfg()));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Old edit' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(svc.edit).toHaveBeenCalled());
    act(() => { resetPointEdits(); });
    act(() => openPointEdit({ canvasId: 'c1', box: PROB, originId: 'p1', text: 'New edit' }));
    await act(async () => { answer({ ok: true, changed: true, pointId: 'p1', revision: 5 }); });
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))?.text).toBe('New edit');
  });

  it('Edit: a late refusal does not put its sentence on the new buffer either', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.edit.mockReturnValue(new Promise(r => { answer = r; }));
    render(view(ONE, cfg()));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Old edit' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(svc.edit).toHaveBeenCalled());
    act(() => { resetPointEdits(); });
    act(() => openPointEdit({ canvasId: 'c1', box: PROB, originId: 'p1', text: 'New edit' }));
    await act(async () => { answer({ ok: false, refused: 'busy', revision: 4 }); });
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))).toMatchObject({ text: 'New edit', problem: null, saving: false });
  });

  it('Remove: a buffer reopened while the removal was out is not closed by it', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.remove.mockReturnValue(new Promise(r => { answer = r; }));
    const un = claimPanelBox(PROB);
    openPointEdit({ canvasId: 'c1', box: PROB, originId: 'p1', text: 'old buffer' });
    render(view(ONE, cfg()));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    act(() => { resetPointEdits(); });
    act(() => openPointEdit({ canvasId: 'c1', box: PROB, originId: 'p1', text: 'new buffer' }));
    await act(async () => { answer({ ok: true, revision: 5 }); });
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))?.text).toBe('new buffer');
    un();
  });
});

describe('r6-2: a box_full sentence belongs to the draft that said it', () => {
  it('a fresh draft (its revision restarts) does not inherit "full": Save is there and the text is kept', () => {
    ensureNewCard('c1', SEG);
    patchNewCard(newCardKey('c1', SEG), { text: 'Kept words', problem: FULL_BOX_TEXT, fullAtRevision: 9, fullAtDraftId: 'd-old' });
    render(view(boxesOf({}), cfg({ draftId: 'd-new', revision: 1 })));
    ensureSelected(SEG);
    expect(screen.getByTestId('canvas-new-card-save')).toBeTruthy();
    expect(screen.queryByText(FULL_BOX_TEXT)).toBeNull();
    expect((screen.getByLabelText('New card') as HTMLTextAreaElement).value).toBe('Kept words');
  });
  it('on the draft that said it, the sentence still stands', () => {
    ensureNewCard('c1', SEG);
    patchNewCard(newCardKey('c1', SEG), { text: 'Kept', problem: FULL_BOX_TEXT, fullAtRevision: 9, fullAtDraftId: 'd1' });
    render(view(boxesOf({}), cfg({ draftId: 'd1', revision: 9 })));
    ensureSelected(SEG);
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
  });
});

describe('r6-3: another canvas\'s text is never shown as gone', () => {
  it('the viewed canvas\'s buffer shows; another canvas\'s does not (the page stays mounted across a navigation)', () => {
    ensureNewCard('c1', SEG); patchNewCard(newCardKey('c1', SEG), { text: 'Mine' });
    ensureNewCard('c2', SEG); patchNewCard(newCardKey('c2', SEG), { text: 'Theirs' });
    render(view(boxesOf({}), undefined, 'c2'));
    const gone = screen.getAllByTestId('canvas-new-card-gone-text') as HTMLTextAreaElement[];
    expect(gone.map(g => g.value)).toEqual(['Theirs']);
  });
});

describe('r6-4: the buffer key of a canvas does not change when its Clone becomes a draft', () => {
  it('uses the canvas id; without one it never uses the draft\'s id', () => {
    expect(bufferCanvasId({ canvasId: 'c9', draft: { id: 'draft-1' }, version: 'v2' } as never)).toBe('c9');
    const noId = bufferCanvasId({ canvasId: null, draft: { id: 'draft-1' }, version: 'v2' } as never);
    expect(noId).not.toContain('draft-1');
  });
});

describe('r6-5: Remove on a clone closes the buffer at the mapped id too', () => {
  it('both the published point\'s buffer and the buffer on the draft\'s copy', async () => {
    const m = mk();
    svc.remove.mockResolvedValue({ ok: true, revision: 8 });
    pointRows.rows = [{ id: 'copy-1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    const un = claimPanelBox(PROB);
    openPointEdit({ canvasId: 'c1', box: PROB, originId: 'p1', text: 'a' });
    openPointEdit({ canvasId: 'c1', box: PROB, originId: 'copy-1', text: 'b' });
    render(view(ONE, clonePage(m.ensure)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('new-d', 'copy-1', 7));
    await waitFor(() => expect(getPointEdits().size).toBe(0));
    un();
  });
});

// ---- review round 7 ----
describe('r7-6: a late result for one clone never overwrites another clone\'s draft', () => {
  it('B keeps its made draft when A\'s open answers late, so B\'s next write reuses it (no second open)', async () => {
    let releaseA: (v: unknown) => void = () => undefined;
    svc.open.mockImplementation((id: string) => (id === 'ver-2'
      ? new Promise(r => { releaseA = r; })
      : Promise.resolve({ status: 'opened', draftId: 'd3', revision: 1, versionName: 'v_3', threadRootId: 't3' })));
    svc.revision.mockResolvedValue(6);
    const { result, rerender } = renderHook(({ v }) => useHandDraft({ version: v }, 'canvas', vi.fn()), { initialProps: { v: 'v2' } });
    let a!: ReturnType<EnsureDraft>;
    act(() => { a = result.current!(); });
    rerender({ v: 'v3' });
    await result.current!();   // B made
    await act(async () => { releaseA({ status: 'opened', draftId: 'd2', revision: 1, versionName: 'v_2', threadRootId: 't2' }); });
    await a;                  // A's late continuation lands
    const again = await result.current!();   // B writes again before the page moved
    expect(svc.open.mock.calls.map(c => c[0])).toEqual(['ver-2', 'ver-3']);
    expect(again.ok && [again.draftId, again.revision]).toEqual(['d3', 6]);
  });
});

describe('r7-7: a lost answer on the first open does not dead-end the retry', () => {
  beforeEach(() => {
    svc.versions.mockResolvedValue([{ id: 'ver-2', canvasName: 'canvas', name: 'v2', seq: 2 }]);
  });
  it('open_elsewhere with a draft started from THIS version is resumed: its id and revision are used', async () => {
    svc.open.mockResolvedValue({ status: 'open_elsewhere', draftId: 'd-x', revision: 4, fromSeq: 2, versionName: 'v_x', threadRootId: 'root-x' });
    const onOpened = vi.fn();
    const { result } = renderHook(() => useHandDraft({ version: 'v2' }, 'canvas', onOpened));
    const r = await result.current!();
    if (!r.ok) throw new Error('expected a resume');
    expect([r.draftId, r.revision, r.versionName]).toEqual(['d-x', 4, 'v_x']);
    // (the thread is registered by startCanvasThread itself, which registers whatever draft it finds)
    // it is remembered: the next write, before the page has moved, reuses it
    svc.open.mockClear();
    svc.revision.mockResolvedValue(5);
    const next = await result.current!();
    expect(svc.open).not.toHaveBeenCalled();
    expect(next.ok && next.revision).toBe(5);
    r.moveTo();
    expect(onOpened).toHaveBeenCalledWith('v_x');
  });
  it('a draft of ANOTHER base keeps the open-elsewhere sentence and nothing is adopted', async () => {
    svc.open.mockResolvedValue({ status: 'open_elsewhere', draftId: 'd-y', revision: 4, fromSeq: 1, versionName: 'v_y', threadRootId: 'root-y' });
    const { result } = renderHook(() => useHandDraft({ version: 'v2' }, 'canvas', vi.fn()));
    expect(await result.current!()).toEqual({ ok: false, text: OPEN_ELSEWHERE_TEXT });
  });
  it('a first draft (no base) or an answer without a base number is not adopted either', async () => {
    svc.open.mockResolvedValue({ status: 'open_elsewhere', draftId: 'd-z', revision: 4, fromSeq: null, versionName: 'v_z', threadRootId: 'root-z' });
    const { result } = renderHook(() => useHandDraft({ version: 'v2' }, 'canvas', vi.fn()));
    expect(await result.current!()).toEqual({ ok: false, text: OPEN_ELSEWHERE_TEXT });
  });
});

// ---- review round 8 ----
describe('r8-1: a full-box sentence said by a real draft never applies to a pending page', () => {
  it('an old refusal from draft d-old does not block a fresh Clone (draftId empty): Save is there, text kept', () => {
    ensureNewCard('c1', SEG);
    patchNewCard(newCardKey('c1', SEG), { text: 'Kept', problem: FULL_BOX_TEXT, fullAtRevision: 9, fullAtDraftId: 'd-old' });
    render(view(boxesOf({}), cfg({ draftId: '', revision: 0, ensure: mk().ensure })));
    ensureSelected(SEG);
    expect(screen.getByTestId('canvas-new-card-save')).toBeTruthy();
    expect(screen.queryByText(FULL_BOX_TEXT)).toBeNull();
    expect((screen.getByLabelText('New card') as HTMLTextAreaElement).value).toBe('Kept');
  });
});

describe('r8-2: a hand write that finishes after the owner left the workspace moves nothing', () => {
  it('moveTo after unmount does not call onOpened', async () => {
    svc.open.mockResolvedValue({ status: 'opened', draftId: 'd-a', revision: 3, versionName: 'v_a', threadRootId: 't' });
    const onOpened = vi.fn();
    const { result, unmount } = renderHook(() => useHandDraft({ version: 'v2' }, 'canvas', onOpened));
    const r = await result.current!();
    if (!r.ok) throw new Error('ok expected');
    unmount();
    r.moveTo();
    expect(onOpened).not.toHaveBeenCalled();
  });
});

describe('r8-3: an Edit refused after the clone mapped its point re-keys the buffer to the draft\'s copy', () => {
  it('busy: the buffer is on the mapped id with its text and sentence, the published id has none, so Save again works', async () => {
    const m = mk();
    pointRows.rows = [{ id: 'copy-1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.edit.mockResolvedValue({ ok: false, refused: 'busy', revision: 7 });
    render(view(ONE, clonePage(m.ensure)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))).toBeUndefined();
    expect(getPointEdits().get(pointEditKey('c1', 'copy-1'))).toMatchObject({ text: 'Typed', problem: BUSY_POINT_TEXT, saving: false, originId: 'copy-1' });
  });
});

describe('r8-4: clearing a stale full-box sentence clears both full fields', () => {
  it('fullAtRevision and fullAtDraftId go, the sentence goes, the text stays', async () => {
    ensureNewCard('c1', SEG);
    patchNewCard(newCardKey('c1', SEG), { text: 'Kept', problem: FULL_BOX_TEXT, fullAtRevision: 2, fullAtDraftId: 'd1' });
    render(view(boxesOf({}), cfg({ draftId: 'd1', revision: 5 })));   // the draft moved past the revision, with room in the box
    ensureSelected(SEG);
    await waitFor(() => expect(getNewCards().get(newCardKey('c1', SEG))).toMatchObject({ problem: null, fullAtRevision: null, fullAtDraftId: null, text: 'Kept' }));
  });
});
