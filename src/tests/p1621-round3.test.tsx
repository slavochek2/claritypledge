/** @vitest-environment jsdom */
/**
 * @file p1621-round3.test.tsx
 * @description P1621 round 3 (founder decisions): a fixed guiding question for every empty box, Remove in the point panel, the empty box's Mention left of Cancel and Save.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointWithUserPosition } from '@/app/types';

const svc = vi.hoisted(() => ({ add: vi.fn(), edit: vi.fn(), remove: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  addCanvasDraftPoint: (...a: unknown[]) => svc.add(...a),
  editCanvasDraftPoint: (...a: unknown[]) => svc.edit(...a),
  removeCanvasDraftPoint: (...a: unknown[]) => svc.remove(...a),
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));
const pointRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
const pointsQuery = (): Promise<unknown> & { eq: () => unknown; is: () => unknown } => {
  const r = Promise.resolve({ data: pointRows.rows, error: null }) as Promise<unknown> & { eq: () => unknown; is: () => unknown };
  r.eq = () => pointsQuery(); r.is = () => pointsQuery();
  return r;
};
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ contains: () => pointsQuery() }) }) } }));
vi.mock('@/app/pages/chat/use-mentioned-boxes', () => ({ useMentionedBoxes: () => new Set<string>() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'owner-1' } }, user: { id: 'owner-1' } }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { PanelPointEdit } from '@/app/components/canvas/canvas-panel-point-edit';
import { PointPanel } from '@/app/components/canvas/canvas-point-panel';
import type { EnsureDraft } from '@/app/components/canvas/canvas-hand-draft';
import { BUSY_POINT_TEXT, STALE_POINT_TEXT, type PointEditConfig } from '@/app/components/canvas/canvas-point-edit';
import { resetNewCards } from '@/app/components/canvas/canvas-new-card-store';
import { resetPointEdits } from '@/app/components/canvas/canvas-point-edit-store';
import { dropFocusRequest } from '@/app/components/canvas/canvas-focus-request';
import { FIXED_BOX_QUESTIONS } from '@/lib/canvas-box-questions';
import { CANVAS_BOXES, CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';

const PROB = 'canvas:problem' as CanvasBoxTag;
const SEG = 'canvas:segments' as CanvasBoxTag;
const pt = (id: string, statement: string, box: CanvasBoxTag) => ({ id, statement, tags: [], systemTags: [box], visibility: 'private', userPosition: null } as unknown as PointWithUserPosition);
type Boxes = Map<CanvasBoxTag, PointWithUserPosition[]>;
const boxesOf = (o: Partial<Record<CanvasBoxTag, PointWithUserPosition[]>>): Boxes => new Map(CANVAS_LAYERS.flatMap(l => l.boxes).map(t => [t, o[t] ?? []]));
const cfg = (o: Partial<PointEditConfig> = {}): PointEditConfig => ({ canvasId: 'c1', draftId: 'd1', revision: 4, runActive: false, userId: 'owner-1', ...o });
const addToChat = vi.fn();
const ws = (): CanvasWorkspaceValue => ({ active: true, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: true, addToChat });
const grid = (boxes: Boxes, edit?: PointEditConfig, questions?: Record<string, string>): ReactNode => (
  <MemoryRouter>
    <CanvasWorkspaceContext.Provider value={ws()}>
      <div data-canvas-page>
        <CanvasGrid boxes={boxes} questions={questions} renderCard={p => <CanvasCard key={p.id} point={p} positions={null} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />} onMore={() => undefined} edit={edit} canvasId={edit?.canvasId} />
      </div>
    </CanvasWorkspaceContext.Provider>
  </MemoryRouter>
);
const ensureSelected = (tag: string) => { const t = screen.getByTestId(`canvas-box-title-${tag}`); if (t.getAttribute('aria-pressed') !== 'true') fireEvent.click(t); };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  Object.values(svc).forEach(f => f.mockReset());
  toastError.mockReset(); addToChat.mockReset();
  resetPointEdits(); resetNewCards(); dropFocusRequest();
  pointRows.rows = [];
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('1: a fixed guiding question for every empty box', () => {
  it('there is exactly one short question per box', () => {
    expect(Object.keys(FIXED_BOX_QUESTIONS).sort()).toEqual(CANVAS_BOXES.map(b => b.tag).sort());
    for (const q of Object.values(FIXED_BOX_QUESTIONS)) { expect(q.endsWith('?')).toBe(true); expect(q.length).toBeLessThan(140); }
  });
  it('the owner\'s draft shows each empty box\'s fixed question in the same question element; the agent\'s own wins', () => {
    render(grid(boxesOf({}), cfg(), { [SEG]: 'The agent asks this' }));
    for (const b of CANVAS_BOXES) {
      const el = within(screen.getByTestId(`canvas-box-${b.tag}`)).getByTestId('canvas-box-question');
      expect(el.textContent).toBe(b.tag === SEG ? 'The agent asks this' : FIXED_BOX_QUESTIONS[b.tag]);
    }
  });
  it('a pending clone (edit config with a draft maker) shows them too', () => {
    const ensure = (async () => ({ ok: false as const, text: 'x' })) as unknown as EnsureDraft;
    render(grid(boxesOf({}), cfg({ draftId: '', revision: 0, ensure })));
    expect(within(screen.getByTestId(`canvas-box-${PROB}`)).getByTestId('canvas-box-question').textContent).toBe(FIXED_BOX_QUESTIONS[PROB]);
  });
  it('a reader still sees "Empty" and no question', () => {
    render(grid(boxesOf({})));
    expect(screen.queryByTestId('canvas-box-question')).toBeNull();
    expect(within(screen.getByTestId(`canvas-box-${PROB}`)).getByText('Empty')).toBeTruthy();
  });
});

describe('3: the empty box\'s Mention sits left of the Cancel and Save row', () => {
  it('in a selected empty box the Mention button is in the editor row, before Cancel, and not at the top right', () => {
    render(grid(boxesOf({}), cfg()));
    ensureSelected(SEG);
    const box = screen.getByTestId(`canvas-box-${SEG}`);
    const mention = within(box).getByTestId(`canvas-mention-in-chat-${SEG}`);
    const cancel = within(box).getByTestId('canvas-new-card-cancel');
    expect(cancel.parentElement!.contains(mention)).toBe(true);
    expect(mention.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(box).getAllByTestId(`canvas-mention-in-chat-${SEG}`)).toHaveLength(1);
    fireEvent.click(mention);
    expect(addToChat).toHaveBeenCalledWith(SEG);
  });
  it('with no editor (a run is going) it stays at the top right so it is never lost', () => {
    render(grid(boxesOf({}), cfg({ runActive: true })));
    ensureSelected(SEG);
    const box = screen.getByTestId(`canvas-box-${SEG}`);
    expect(within(box).getByTestId(`canvas-mention-in-chat-${SEG}`)).toBeTruthy();
    expect(within(box).queryByTestId('canvas-new-card-cancel')).toBeNull();
  });
});

describe('2: Remove lives in the point panel', () => {
  const TWO = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB), pt('p2', 'They are angry', PROB)] });
  const ONLY_P2 = boxesOf({ [PROB]: [pt('p2', 'They are angry', PROB)] });
  const ONE = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB)] });
  const page = (boxes: Boxes, edit: PointEditConfig, open: PointWithUserPosition | null, onRemoved: () => void = () => undefined): ReactNode => (
    <>
      {grid(boxes, edit)}
      {open && <MemoryRouter><PanelPointEdit point={open} boxes={boxes} edit={edit} onSaved={() => undefined} onRemoved={onRemoved}><p>the card</p></PanelPointEdit></MemoryRouter>}
    </>
  );
  const panelRemove = (id: string) => screen.queryByTestId(`canvas-panel-remove-${id}`);

  it('the card no longer has Remove; the opened point does, quiet, with the same words', () => {
    render(page(TWO, cfg(), pt('p1', 'They are thirsty', PROB)));
    ensureSelected(PROB);
    expect(screen.queryByTestId('canvas-card-remove-p1')).toBeNull();
    const btn = panelRemove('p1')!;
    expect(btn).toHaveTextContent('Remove');
    expect(btn.className).toContain('min-h-10');
  });

  it('is hidden while a run is active, like Edit', () => {
    render(page(TWO, cfg({ runActive: true }), pt('p1', 'They are thirsty', PROB)));
    expect(panelRemove('p1')).toBeNull();
    expect(screen.queryByTestId('canvas-panel-edit-p1')).toBeNull();
  });

  it('removes with no confirmation by keyboard, passes draft, point and revision, and tells the page to close the panel', async () => {
    const user = userEvent.setup();
    svc.remove.mockResolvedValue({ ok: true, revision: 5 });
    const onRemoved = vi.fn();
    render(page(TWO, cfg(), pt('p1', 'They are thirsty', PROB), onRemoved));
    panelRemove('p1')!.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
    expect(svc.remove).toHaveBeenCalledWith('d1', 'p1', 4);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a refusal says the existing sentence and leaves the panel open', async () => {
    const onRemoved = vi.fn();
    render(page(TWO, cfg(), pt('p1', 'They are thirsty', PROB), onRemoved));
    svc.remove.mockResolvedValueOnce({ ok: false, refused: 'stale_view' });
    fireEvent.click(panelRemove('p1')!);
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith(STALE_POINT_TEXT));
    svc.remove.mockResolvedValueOnce({ ok: false, refused: 'busy' });
    fireEvent.click(panelRemove('p1')!);
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith(BUSY_POINT_TEXT));
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('on a pending clone it makes the draft first, then removes, then the page moves', async () => {
    const moveTo = vi.fn();
    const ensure = vi.fn(async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo }));
    pointRows.rows = [{ id: 'p1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.remove.mockResolvedValue({ ok: true, revision: 8 });
    const onRemoved = vi.fn();
    render(page(ONE, cfg({ draftId: '', revision: 0, ensure: ensure as unknown as EnsureDraft }), pt('p1', 'They are thirsty', PROB), onRemoved));
    fireEvent.click(panelRemove('p1')!);
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('new-d', 'p1', 7));
    expect(ensure).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(moveTo).toHaveBeenCalled());
    expect(onRemoved, 'a pending clone drops the panel from the live address instead (see the next test)').not.toHaveBeenCalled();
  });

  it('on a pending clone a successful Remove does not call onRemoved: it navigates to the live address without `point`, keeping the new `v`', async () => {
    const moveTo = vi.fn();
    const ensure = vi.fn(async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo }));
    pointRows.rows = [{ id: 'p1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.remove.mockResolvedValue({ ok: true, revision: 8 });
    // by now the page has moved to the draft: the live address names the new version and still the opened point
    window.history.pushState({}, '', '/p/ana/canvas/plan?v=v_d1&ws=1&point=p1');
    const seen: string[] = [];
    function Probe() { const l = useLocation(); seen.push(`${l.pathname}${l.search}`); return null; }
    const onRemoved = vi.fn();
    render(
      <MemoryRouter initialEntries={['/p/ana/canvas/plan?v=v2&ws=1&point=p1']}>
        <Probe />
        <PanelPointEdit point={pt('p1', 'They are thirsty', PROB)} boxes={ONE} edit={cfg({ draftId: '', revision: 0, ensure: ensure as unknown as EnsureDraft })} onSaved={() => undefined} onRemoved={onRemoved}><p>the card</p></PanelPointEdit>
      </MemoryRouter>,
    );
    fireEvent.click(panelRemove('p1')!);
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('new-d', 'p1', 7));
    await waitFor(() => expect(seen.at(-1)).toBe('/p/ana/canvas/plan?v=v_d1&ws=1'));
    expect(onRemoved).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/');
  });

  it('after removal focus goes to the next card\'s first action once the card is gone', async () => {
    svc.remove.mockResolvedValue({ ok: true, revision: 5 });
    const edit = cfg();
    const view = render(page(TWO, edit, pt('p1', 'They are thirsty', PROB)));
    ensureSelected(PROB);
    panelRemove('p1')!.focus();
    fireEvent.click(panelRemove('p1')!);
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    view.rerender(page(TWO, edit, null));                       // the panel closed
    view.rerender(page(ONLY_P2, cfg({ revision: 5 }), null));   // the re-read: the card is gone
    await waitFor(() => expect(document.activeElement).toBe(screen.queryByTestId('canvas-card-edit-p2')));
  });

  it('with no next card focus goes to Add card', async () => {
    svc.remove.mockResolvedValue({ ok: true, revision: 5 });
    const edit = cfg();
    const view = render(page(TWO, edit, pt('p2', 'They are angry', PROB)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByText('See all 2'));
    panelRemove('p2')!.focus();
    fireEvent.click(panelRemove('p2')!);
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('d1', 'p2', 4));
    view.rerender(page(TWO, edit, null));
    view.rerender(page(ONE, cfg({ revision: 5 }), null));
    await waitFor(() => expect(document.activeElement).toBe(screen.queryByTestId('canvas-box-add-canvas:problem')));
  });

});

describe('review round 3: Remove in the panel', () => {
  const ONE = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB)] });
  const TWO = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB), pt('p2', 'They are angry', PROB)] });
  const EMPTY_AFTER = boxesOf({ [PROB]: [pt('p2', 'They are angry', PROB)] });
  const panelFor = (boxes: Boxes, edit: PointEditConfig, point: PointWithUserPosition | null, onRemoved: () => void = () => undefined): ReactNode => (
    <>
      {grid(boxes, edit)}
      {point && <MemoryRouter><PanelPointEdit point={point} boxes={boxes} edit={edit} onSaved={() => undefined} onRemoved={onRemoved}><p>the card</p></PanelPointEdit></MemoryRouter>}
    </>
  );
  const P1 = pt('p1', 'They are thirsty', PROB);
  const P2 = pt('p2', 'They are angry', PROB);

  it('2: a late Remove of point A does not close the panel that now shows point B', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.remove.mockReturnValue(new Promise(r => { answer = r; }));
    const onRemoved = vi.fn();
    const view = render(panelFor(TWO, cfg(), P1, onRemoved));
    fireEvent.click(screen.getByTestId('canvas-panel-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    view.rerender(panelFor(TWO, cfg(), P2, onRemoved));   // the owner stepped to the next point while the removal was out
    await act(async () => { answer({ ok: true, revision: 5 }); });
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('2: nor after the panel unmounted', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.remove.mockReturnValue(new Promise(r => { answer = r; }));
    const onRemoved = vi.fn();
    const view = render(panelFor(TWO, cfg(), P1, onRemoved));
    fireEvent.click(screen.getByTestId('canvas-panel-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    view.rerender(panelFor(TWO, cfg(), null, onRemoved));
    await act(async () => { answer({ ok: true, revision: 5 }); });
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('3: Remove from the panel while the card\'s box is not selected leaves no focus request behind', async () => {
    svc.remove.mockResolvedValue({ ok: true, revision: 5 });
    const edit = cfg({ userId: undefined });   // no first-visit opening: the box is never selected
    const view = render(panelFor(TWO, edit, P1));
    fireEvent.click(screen.getByTestId('canvas-panel-remove-p1'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalled());
    await act(async () => {});
    view.rerender(panelFor(TWO, edit, null));
    (document.activeElement as HTMLElement | null)?.blur();
    view.rerender(panelFor(EMPTY_AFTER, cfg({ userId: undefined, revision: 5 }), null));   // the re-read: the card is gone, focus is on the page
    await act(async () => {});
    expect(document.activeElement, 'nothing is pulled into an unrelated place').toBe(document.body);
  });

  it('3: a request whose card never left expires and does not hijack a later loss of focus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      svc.remove.mockResolvedValue({ ok: true, revision: 5 });
      const edit = cfg();
      const view = render(panelFor(TWO, edit, P1));
      ensureSelected(PROB);
      fireEvent.click(screen.getByTestId('canvas-panel-remove-p1'));
      await waitFor(() => expect(svc.remove).toHaveBeenCalled());
      view.rerender(panelFor(TWO, edit, null));
      vi.setSystemTime(Date.now() + 60_000);   // the re-read never came; a minute later the same card leaves for another reason
      (document.activeElement as HTMLElement | null)?.blur();
      view.rerender(panelFor(EMPTY_AFTER, cfg({ revision: 9 }), null));
      await act(async () => {});
      expect(document.activeElement).toBe(document.body);
    } finally { vi.useRealTimers(); }
  });

  it('4: while the removal is out the button is busy, a second tap does nothing and Edit is absent; a refusal brings Edit back', async () => {
    let answer: (v: unknown) => void = () => undefined;
    svc.remove.mockReturnValue(new Promise(r => { answer = r; }));
    render(panelFor(ONE, cfg(), P1));
    const btn = screen.getByTestId('canvas-panel-remove-p1');
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-busy')).toBe('true'));
    expect(screen.queryByTestId('canvas-panel-edit-p1'), 'Edit is absent, not disabled, while it runs').toBeNull();
    fireEvent.click(btn);
    expect(svc.remove).toHaveBeenCalledTimes(1);
    await act(async () => { answer({ ok: false, refused: 'busy' }); });
    await waitFor(() => expect(screen.getByTestId('canvas-panel-edit-p1')).toBeTruthy());
    expect(screen.getByTestId('canvas-panel-remove-p1').getAttribute('aria-busy')).toBeNull();
  });
});

describe('review round 3: a pending removal wins over the panel\'s own focus restore', () => {
  it('the refreshed card list and the panel close land in ONE commit: focus goes to the next card\'s Edit, not the box title', async () => {
    svc.remove.mockResolvedValue({ ok: true, revision: 5 });
    const TWO = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB), pt('p2', 'They are angry', PROB)] });
    const ONLY_P2 = boxesOf({ [PROB]: [pt('p2', 'They are angry', PROB)] });
    const P1 = pt('p1', 'They are thirsty', PROB);
    const edit = cfg();
    function Harness() {
      const [state, setState] = useState<{ boxes: Boxes; open: boolean }>({ boxes: TWO, open: true });
      return (
        <>
          {grid(state.boxes, edit)}
          {state.open && (
            <MemoryRouter>
              <PointPanel onClose={() => setState(s => ({ ...s, open: false }))} label="Point" viewKey="p1" step={{ box: 'Problem', boxTag: PROB }}>
                <PanelPointEdit point={P1} boxes={state.boxes} edit={edit} onSaved={() => undefined} onRemoved={() => setState({ boxes: ONLY_P2, open: false })}><p>the card</p></PanelPointEdit>
              </PointPanel>
            </MemoryRouter>
          )}
        </>
      );
    }
    render(<Harness />);
    ensureSelected(PROB);
    const remove = screen.getByTestId('canvas-panel-remove-p1');
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(screen.queryByTestId('canvas-card-edit-p2')));
  });
});
