/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, renderHook, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PointWithUserPosition } from '@/app/types';

const edit = vi.fn();
vi.mock('@/app/data/canvas-draft-service', () => ({ editCanvasDraftPoint: (...a: unknown[]) => edit(...a) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { resetPointEdits, openPointEdit, closePointEdit, getPointEdits, pointEditKey, useClearPointEditsOnAuthChange } from '@/app/components/canvas/canvas-point-edit-store';
import {
  BoxEdits, EMPTY_POINT_TEXT, BUSY_POINT_TEXT, STALE_POINT_TEXT, RUN_GOING_TEXT, GONE_POINT_TEXT,
  type PointEditConfig,
} from '@/app/components/canvas/canvas-point-edit';
import { useCanvasDraftSync } from '@/app/pages/canvas/use-canvas-draft-sync';
import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import type { CanvasBoxTag } from '@/lib/canvas-boxes';

const TAG = 'canvas:segments';
const pt = (id: string, statement: string) => ({ id, statement, systemTags: [TAG] } as unknown as PointWithUserPosition);
const cfg = (o: Partial<PointEditConfig> = {}): PointEditConfig => ({ draftId: 'd1', revision: 4, runActive: false, ...o });
const card = (p: PointWithUserPosition): ReactNode => <button key={p.id} type="button">{`card ${p.id}`}</button>;
const view = (points: PointWithUserPosition[], edit: PointEditConfig | null = cfg(), limit?: number) =>
  <BoxEdits tag={TAG} points={points} edit={edit ?? undefined} renderCard={card} limit={limit} />;
const pencil = (id: string) => screen.queryByTestId(`canvas-edit-point-${id}`);
const open = (id: string) => fireEvent.click(screen.getByTestId(`canvas-edit-point-${id}`));
const area = () => screen.getByLabelText('Point text') as HTMLTextAreaElement;
const type = (v: string) => fireEvent.change(area(), { target: { value: v } });
const save = () => fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
const problem = () => screen.getByTestId('canvas-point-editor-problem').textContent;

beforeEach(() => { edit.mockReset(); resetPointEdits(); });
afterEach(cleanup);

describe('P1614 the editor', () => {
  it('Edit is a sibling of the card, not inside it', () => {
    render(view([pt('p1', 'Old words')]));
    expect(screen.getByText('card p1').contains(pencil('p1'))).toBe(false);
  });
  it('Save sends the trimmed text with the revision and closes on success', async () => {
    edit.mockResolvedValue({ ok: true, changed: true, pointId: 'p2', revision: 5 });
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('  New words '); save();
    await waitFor(() => expect(screen.queryByLabelText('Point text')).toBeNull());
    expect(edit).toHaveBeenCalledWith('d1', 'p1', 'New words', 4);
  });
  it('empty text says so and calls nothing', () => {
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('   '); save();
    expect(problem()).toBe(EMPTY_POINT_TEXT);
    expect(edit).not.toHaveBeenCalled();
  });
  it('Cancel writes nothing and unchanged text writes nothing', () => {
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('changed');
    fireEvent.click(screen.getByTestId('canvas-point-editor-cancel'));
    expect(edit).not.toHaveBeenCalled();
    open('p1'); expect(area().value).toBe('Old words');
    save();
    expect(edit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Point text')).toBeNull();
  });
  it('a busy or stale refusal keeps the typed text and says why', async () => {
    edit.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 4 }).mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 5 });
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('typed'); save();
    await waitFor(() => expect(problem()).toBe(BUSY_POINT_TEXT));
    expect(area().value).toBe('typed');
    save();
    await waitFor(() => expect(problem()).toBe(STALE_POINT_TEXT));
    expect(area().value).toBe('typed');
  });
});

describe('P1614 fix 1: a run starting keeps an open editor and its text', () => {
  it('the editor stays mounted with its text, Save is blocked with the reason, and the pencils go', () => {
    const points = [pt('p1', 'One'), pt('p2', 'Two')];
    const { rerender } = render(view(points));
    open('p1'); type('half typed');
    rerender(view(points, cfg({ runActive: true })));
    expect(area().value).toBe('half typed');
    expect((screen.getByTestId('canvas-point-editor-save') as HTMLButtonElement).disabled).toBe(true);
    expect(problem()).toBe(RUN_GOING_TEXT);
    expect(pencil('p2'), 'no entry pencil while a run is going').toBeNull();
    rerender(view(points, cfg({ runActive: false })));
    expect((screen.getByTestId('canvas-point-editor-save') as HTMLButtonElement).disabled).toBe(false);
    expect(area().value).toBe('half typed');
    expect(pencil('p2')).not.toBeNull();
  });
  it('through the grid: a run starting does not swap the editor for the card', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
    const boxes = new Map<CanvasBoxTag, PointWithUserPosition[]>([[TAG as CanvasBoxTag, [pt('p1', 'One')]]]);
    const grid = (e: PointEditConfig) => <CanvasGrid boxes={boxes} renderCard={card} onMore={() => undefined} edit={e} />;
    const { rerender } = render(grid(cfg()));
    open('p1'); type('typed in the grid');
    rerender(grid(cfg({ runActive: true })));
    expect(area().value).toBe('typed in the grid');
    vi.unstubAllGlobals();
  });
});

describe('P1614 round 3, rule 1: typed text is never moved onto a guess', () => {
  const orphanNotice = () => screen.getByTestId('canvas-point-editor-notice').textContent;
  it('removing A and adding an unrelated B never offers Save onto B: the text stays visible and selectable, with Dismiss only', () => {
    const { rerender } = render(view([pt('A', 'Old words')]));
    open('A'); type('my wording');
    rerender(view([pt('B', 'Something unrelated')]));
    expect(area().value).toBe('my wording');
    expect(area().readOnly, 'selectable and copyable, not editable').toBe(true);
    expect(screen.queryByTestId('canvas-point-editor-save'), 'no Save, on B or anywhere').toBeNull();
    expect(orphanNotice()).toContain(GONE_POINT_TEXT);
    expect(screen.getByText('card B')).toBeTruthy();
    fireEvent.click(screen.getByTestId('canvas-point-editor-dismiss'));
    expect(screen.queryByLabelText('Point text')).toBeNull();
  });
  it('two editors whose origins are gone stay separate, each with its own text', () => {
    const { rerender } = render(view([pt('A', 'a'), pt('C', 'c'), pt('Z', 'z')], cfg()));
    open('A'); type('text for A');
    open('C'); fireEvent.change(screen.getAllByLabelText('Point text')[1]!, { target: { value: 'text for C' } });
    rerender(view([pt('Z', 'z')]));
    const areas = screen.getAllByLabelText('Point text') as HTMLTextAreaElement[];
    expect(areas.map(x => x.value).sort()).toEqual(['text for A', 'text for C']);
    expect(screen.getAllByTestId('canvas-point-editor-dismiss')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('canvas-point-editor-dismiss')[0]!);
    expect(screen.getAllByLabelText('Point text')).toHaveLength(1);
  });
});

describe('P1614 round 3, rule 2: saved only when the origin is gone AND a new point has the exact text', () => {
  it('after stale_view: origin gone and a new point with exactly the typed text closes the editor', async () => {
    edit.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 5 });
    const { rerender } = render(view([pt('p1', 'Old words')]));
    open('p1'); type('  my wording '); save();
    await waitFor(() => expect(problem()).toBe(STALE_POINT_TEXT));
    rerender(view([pt('p9', 'my wording')], cfg({ revision: 5 })));
    await waitFor(() => expect(screen.queryByLabelText('Point text')).toBeNull());
  });
  it('after a thrown call (lost answer): the same', async () => {
    edit.mockRejectedValueOnce(new Error('network'));
    const { rerender } = render(view([pt('p1', 'Old words')]));
    open('p1'); type('my wording'); save();
    await waitFor(() => expect(problem()).not.toBeNull());
    rerender(view([pt('p9', 'my wording')], cfg({ revision: 5 })));
    await waitFor(() => expect(screen.queryByLabelText('Point text')).toBeNull());
  });
  it('origin still present is never saved, whatever a new sibling says', async () => {
    edit.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 5 });
    const { rerender } = render(view([pt('p1', 'Old words')]));
    open('p1'); type('my wording'); save();
    await waitFor(() => expect(problem()).toBe(STALE_POINT_TEXT));
    rerender(view([pt('p1', 'Old words'), pt('p9', 'my wording')], cfg({ revision: 5 })));
    expect(area().value).toBe('my wording');
  });
  it('a sibling that was already in the box when the save started does not count', async () => {
    edit.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 5 });
    const points = [pt('p1', 'Old words'), pt('p5', 'my wording')];
    const { rerender } = render(view(points));
    open('p1'); type('my wording'); save();
    await waitFor(() => expect(problem()).toBe(STALE_POINT_TEXT));
    rerender(view([pt('p5', 'my wording')], cfg({ revision: 5 })));
    expect(area().value, 'origin gone, but the matching point was there before: not saved').toBe('my wording');
  });
  it('a busy refusal is never saved: an agent adds a sibling with the same text and the editor stays open with its text', async () => {
    edit.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 4 });
    const { rerender } = render(view([pt('p1', 'Old words')]));
    open('p1'); type('my wording'); save();
    await waitFor(() => expect(problem()).toBe(BUSY_POINT_TEXT));
    rerender(view([pt('p1', 'Old words'), pt('p9', 'my wording')]));
    expect(area().value).toBe('my wording');
    rerender(view([pt('p9', 'my wording')]));
    expect(area().value, 'even with the origin gone: busy is not a lost answer').toBe('my wording');
    expect(screen.queryByTestId('canvas-point-editor-save')).toBeNull();
  });
});

describe('P1614 round 3, rule 3: buffers belong to a draft and a point, and are cleared on leaving', () => {
  it('keyed by draft id plus point id: another draft with the same point id shows no editor and the first buffer is kept', () => {
    openPointEdit({ draftId: 'd1', box: TAG, originId: 'p1', text: 'for draft one' });
    render(view([pt('p1', 'Old words')], cfg({ draftId: 'd2' })));
    expect(screen.queryByLabelText('Point text')).toBeNull();
    expect(pencil('p1')).not.toBeNull();
    expect(getPointEdits().get(pointEditKey('d1', 'p1'))?.text).toBe('for draft one');
    open('p1');
    expect(getPointEdits().size, 'a second buffer, not an overwrite').toBe(2);
    expect(getPointEdits().get(pointEditKey('d1', 'p1'))?.text).toBe('for draft one');
  });
  it('the canvas page unmounting clears every buffer', () => {
    const hook = renderHook(() => useCanvasDraftSync(null, vi.fn(), vi.fn()));
    openPointEdit({ draftId: 'd1', box: TAG, originId: 'p1', text: 'abandoned' });
    expect(getPointEdits().size).toBe(1);
    hook.unmount();
    expect(getPointEdits().size).toBe(0);
  });
  it('only a change to a DIFFERENT signed-in person clears; a session-refresh flicker through undefined does not', () => {
    const hook = renderHook(({ id }: { id: string | null | undefined }) => useClearPointEditsOnAuthChange(id), { initialProps: { id: undefined as string | null | undefined } });
    openPointEdit({ draftId: 'd1', box: TAG, originId: 'p1', text: 'mine' });
    hook.rerender({ id: 'u1' });
    expect(getPointEdits().size, 'first sign-in resolving is not a sign-out').toBe(1);
    hook.rerender({ id: 'u1' });
    hook.rerender({ id: undefined });
    expect(getPointEdits().size, 'a flicker through undefined keeps the text').toBe(1);
    hook.rerender({ id: 'u1' });
    expect(getPointEdits().size, 'the same person coming back keeps it').toBe(1);
    hook.rerender({ id: null });
    hook.rerender({ id: 'u2' });
    expect(getPointEdits().size, 'a different person clears it, even through a gap').toBe(0);
  });
  it('a real sign-out on the page: the buffer is not drawn (the viewer no longer owns the draft), and the unmount then removes the text', () => {
    const hook = renderHook(({ id }: { id: string | null }) => useCanvasDraftSync(null, vi.fn(), vi.fn(), id), { initialProps: { id: 'u1' as string | null } });
    openPointEdit({ draftId: 'd1', box: TAG, originId: 'p1', text: 'mine' });
    hook.rerender({ id: null });
    // signed out: the read comes back without the owner's draft, so the page hands the box no edit config and no editor is drawn
    render(view([pt('p1', 'Old words')], null));
    expect(screen.queryByLabelText('Point text'), 'no editor for a viewer who is not the owner').toBeNull();
    expect(getPointEdits().size, 'the buffer waits in memory, undrawn').toBe(1);
    hook.unmount();
    expect(getPointEdits().size, 'leaving the page removes it').toBe(0);
  });
});

describe('P1614 round 3, rule 4 and 5: nothing typed is lost during Save, and one editor per point', () => {
  it('the textarea is read-only while a save is in flight, and editable again after a refusal', async () => {
    let resolve!: (v: unknown) => void;
    edit.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('new'); save();
    expect(area().readOnly).toBe(true);
    await act(async () => { resolve({ ok: false, refused: 'busy', revision: 4 }); });
    await waitFor(() => expect(area().readOnly).toBe(false));
  });
  it('the editor sits IN PLACE of its card: the point is not drawn twice', () => {
    render(view([pt('p1', 'Old words'), pt('p2', 'Other')]));
    open('p1');
    expect(screen.queryByText('card p1')).toBeNull();
    expect(screen.getByText('card p2')).toBeTruthy();
  });
  it('with the panel open the grid behind it shows no editor for that box: exactly one textarea, inside the panel', () => {
    const points = [pt('p1', 'One'), pt('p2', 'Two')];
    render(<><div data-testid="grid"><BoxEdits tag={TAG} points={points} edit={cfg()} renderCard={card} limit={1} /></div><div data-testid="panel"><BoxEdits tag={TAG} points={points} edit={cfg()} renderCard={card} surface="panel" /></div></>);
    fireEvent.click(within(screen.getByTestId('panel')).getByTestId('canvas-edit-point-p2'));
    expect(screen.getAllByLabelText('Point text')).toHaveLength(1);
    expect(within(screen.getByTestId('panel')).getByLabelText('Point text')).toBeTruthy();
    expect(within(screen.getByTestId('grid')).queryByLabelText('Point text')).toBeNull();
    expect(within(screen.getByTestId('grid')).getByText('card p1'), 'the grid still draws its card').toBeTruthy();
  });
  it('closing the panel gives the editor back to the grid, text kept', () => {
    const points = [pt('p1', 'One')];
    const grid = <BoxEdits tag={TAG} points={points} edit={cfg()} renderCard={card} limit={1} />;
    const { rerender } = render(<>{grid}<BoxEdits tag={TAG} points={points} edit={cfg()} renderCard={card} surface="panel" /></>);
    fireEvent.click(screen.getAllByTestId('canvas-edit-point-p1')[1]!);
    type('typed in the panel');
    rerender(<>{grid}</>);
    expect(area().value).toBe('typed in the panel');
  });
});

describe('P1614 fix 4: every point can be edited, not only the first of a box', () => {
  const three = [pt('a', 'A'), pt('b', 'B'), pt('c', 'C')];
  it('with no limit (the See all panel) each point has Edit', () => {
    render(view(three));
    expect(['a', 'b', 'c'].map(id => !!pencil(id))).toEqual([true, true, true]);
  });
  it('with the grid\'s limit of one only the shown card does, and the others are not rendered', () => {
    render(view(three, cfg(), 1));
    expect(['a', 'b', 'c'].map(id => !!pencil(id))).toEqual([true, false, false]);
    expect(screen.queryByText('card b')).toBeNull();
  });
  it('a second point of the panel saves with its own id', async () => {
    edit.mockResolvedValue({ ok: true, changed: true, pointId: 'b2', revision: 5 });
    render(view(three));
    open('b'); type('B edited'); save();
    await waitFor(() => expect(edit).toHaveBeenCalledWith('d1', 'b', 'B edited', 4));
  });
  it('a reader (no config) gets the cards and no Edit', () => {
    render(view(three, null));
    expect(screen.getByText('card a')).toBeTruthy();
    expect(pencil('a')).toBeNull();
  });
});

describe('P1614 fix 5: Cancel and Escape are off while a save is in flight', () => {
  it('both are inert until the save answers', async () => {
    let resolve!: (v: unknown) => void;
    edit.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('new'); save();
    const cancel = screen.getByTestId('canvas-point-editor-cancel') as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.click(cancel);
    fireEvent.keyDown(area(), { key: 'Escape' });
    expect(screen.queryByLabelText('Point text'), 'still open while saving').not.toBeNull();
    await act(async () => { resolve({ ok: false, refused: 'busy', revision: 4 }); });
    await waitFor(() => expect((screen.getByTestId('canvas-point-editor-cancel') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(area(), { key: 'Escape' });
    expect(screen.queryByLabelText('Point text')).toBeNull();
  });
});

describe('P1614 final round', () => {
  it('1. an empty box still draws an orphan editor (the agent removed the last point) beside its Empty state', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
    const withPoints = new Map<CanvasBoxTag, PointWithUserPosition[]>([[TAG as CanvasBoxTag, [pt('p1', 'One')]]]);
    const emptied = new Map<CanvasBoxTag, PointWithUserPosition[]>([[TAG as CanvasBoxTag, []]]);
    const grid = (b: Map<CanvasBoxTag, PointWithUserPosition[]>) => <CanvasGrid boxes={b} renderCard={card} onMore={() => undefined} edit={cfg()} />;
    const { rerender } = render(grid(withPoints));
    open('p1'); type('half typed');
    rerender(grid(emptied));
    expect(area().value, 'the text is still on screen').toBe('half typed');
    expect(screen.getByTestId('canvas-point-editor-notice').textContent).toContain(GONE_POINT_TEXT);
    expect(within(screen.getByTestId(`canvas-box-${TAG}`)).getByText('Empty'), 'beside the box\'s Empty state').toBeTruthy();
    fireEvent.click(screen.getByTestId('canvas-point-editor-dismiss'));
    expect(screen.queryByLabelText('Point text')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('4. See all N: hidden when the open editors already show every point, back when they close', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
    const boxes = new Map<CanvasBoxTag, PointWithUserPosition[]>([[TAG as CanvasBoxTag, [pt('a', 'A'), pt('b', 'B')]]]);
    render(<CanvasGrid boxes={boxes} renderCard={card} onMore={() => undefined} edit={cfg()} />);
    expect(screen.getByTestId('canvas-box-more').textContent).toBe('See all 2');
    act(() => openPointEdit({ draftId: 'd1', box: TAG, originId: 'b', text: 'B typed in the panel' }));
    expect(screen.getByText('card a')).toBeTruthy();
    expect((screen.getByLabelText('Point text') as HTMLTextAreaElement).value, 'b is shown by its open editor').toBe('B typed in the panel');
    expect(screen.queryByTestId('canvas-box-more'), 'nothing is hidden now').toBeNull();
    act(() => closePointEdit(pointEditKey('d1', 'b')));
    expect(screen.getByTestId('canvas-box-more').textContent).toBe('See all 2');
    vi.unstubAllGlobals();
  });
});

describe('P1614 visual QA: error outline, read-only look, Dismiss', () => {
  it('after a failed Save the textarea keeps focus, so it shows the same outline as the open state', async () => {
    edit.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 4 });
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('typed');
    screen.getByTestId('canvas-point-editor-save').focus();   // a real click moves focus onto the button
    save();
    await waitFor(() => expect(problem()).toBe(BUSY_POINT_TEXT));
    await waitFor(() => expect(document.activeElement).toBe(area()));
  });
  it('an empty-text sentence keeps focus in the textarea too, and is a dark red that passes contrast', () => {
    render(view([pt('p1', 'Old words')]));
    open('p1'); type('   ');
    screen.getByTestId('canvas-point-editor-save').focus();
    save();
    expect(document.activeElement).toBe(area());
    expect(screen.getByTestId('canvas-point-editor-problem').className).toContain('text-red-800');
  });
  it('a gone point: Dismiss is a real secondary (outline) button right under the notice and above the text; the textarea looks read-only', () => {
    const { rerender } = render(view([pt('A', 'Old words')]));
    open('A'); type('my wording');
    rerender(view([pt('B', 'Other')]));
    const dismiss = screen.getByTestId('canvas-point-editor-dismiss');
    expect(dismiss.className, 'outline variant: a visible border').toContain('border-input');
    const notice = screen.getByTestId('canvas-point-editor-notice');
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(notice, dismiss), 'Dismiss follows the notice').toBe(true);
    expect(follows(dismiss, area()), 'and comes before the text').toBe(true);
    expect(area().className).toContain('resize-none');
    expect(area().className).toContain('bg-muted');
  });
  it('an editable textarea keeps its resize grip and normal ground', () => {
    render(view([pt('p1', 'Old words')]));
    open('p1');
    expect(area().className).toContain('resize-y');
    expect(area().className).not.toContain('bg-muted');
  });
});

