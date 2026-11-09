/** @vitest-environment jsdom */
/**
 * @file p1621-round2.test.tsx
 * @description P1621 round 2 (founder decisions): hand actions on a pending page (the first hand write makes the draft), Mention in chat per point (pill, dedupe, `[Box] "text"` body),
 * Remove, and the Upload button's blue outline. Expectations are typed from the spec's "Founder Decisions (round 2)", not read back from the code.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointWithUserPosition } from '@/app/types';

const svc = vi.hoisted(() => ({ add: vi.fn(), edit: vi.fn(), remove: vi.fn(), versions: vi.fn(), open: vi.fn(), revision: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  addCanvasDraftPoint: (...a: unknown[]) => svc.add(...a),
  editCanvasDraftPoint: (...a: unknown[]) => svc.edit(...a),
  removeCanvasDraftPoint: (...a: unknown[]) => svc.remove(...a),
  listMyCanvasVersions: () => svc.versions(),
  getCanvasDraftRevision: (...a: unknown[]) => svc.revision(...a),
  CanvasDraftRefusal: class extends Error { constructor(public code: string) { super(code); } },
}));
vi.mock('@/app/pages/chat/canvas-start', () => ({
  startCanvasThread: (...a: unknown[]) => svc.open(...a),
  canvasStartErrorText: () => 'Could not start a canvas. Try again.',
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));
const pointRows = vi.hoisted(() => ({ rows: [] as unknown[], eq: [] as unknown[][], is: [] as unknown[][] }));
// the points read: awaitable, with `.eq` (the owner filter) recorded
const pointsQuery = (): Promise<unknown> & { eq: (...a: unknown[]) => unknown; is: (...a: unknown[]) => unknown } => {
  const r = Promise.resolve({ data: pointRows.rows, error: null }) as Promise<unknown> & { eq: (...a: unknown[]) => unknown; is: (...a: unknown[]) => unknown };
  r.eq = (...a: unknown[]) => { pointRows.eq.push(a); return pointsQuery(); };
  r.is = (...a: unknown[]) => { pointRows.is.push(a); return pointsQuery(); };   // currentVersionsOnly: only current versions of a point
  return r;
};
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ contains: () => pointsQuery() }) }) } }));
const mentioned = vi.hoisted(() => ({ set: new Set<string>() as ReadonlySet<string> }));
vi.mock('@/app/pages/chat/use-mentioned-boxes', () => ({ useMentionedBoxes: () => mentioned.set }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'owner-1' } }, user: { id: 'owner-1' } }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/pages/chat/chat-hooks', async (orig) => ({ ...(await orig<typeof import('@/app/pages/chat/chat-hooks')>()), hasFinePointer: () => true }));

import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { OPEN_ELSEWHERE_TEXT, type EnsureDraft } from '@/app/components/canvas/canvas-hand-draft';
import { BUSY_POINT_TEXT, STALE_POINT_TEXT, type PointEditConfig } from '@/app/components/canvas/canvas-point-edit';
import { getNewCards, newCardKey, resetNewCards } from '@/app/components/canvas/canvas-new-card-store';
import { getPointEdits, pointEditKey, resetPointEdits } from '@/app/components/canvas/canvas-point-edit-store';
import { dropFocusRequest } from '@/app/components/canvas/canvas-focus-request';
import { boxHasOwnMention } from '@/app/components/canvas/canvas-box-model';
import { pendingEditOf } from '@/app/components/canvas/canvas-page-data';
import { PanelPointEdit } from '@/app/components/canvas/canvas-panel-point-edit';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { removePoint } from '@/app/components/canvas/use-card-remove';
import { CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';
import { Composer } from '@/app/pages/chat/Composer';
import { ComposerTagContext, createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { CanvasUndoButton } from '@/app/pages/chat/CanvasUndo';
import { decodeTagged, pointKey, splitTagged, tagToken } from '@/app/pages/chat/composer-tags';
import { useHandDraft } from '@/app/pages/chat/use-hand-draft';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';

const PROB = 'canvas:problem' as CanvasBoxTag;
const SEG = 'canvas:segments' as CanvasBoxTag;
const pt = (id: string, statement: string, box: CanvasBoxTag) => ({ id, statement, tags: [], systemTags: [box], visibility: 'private', userPosition: null } as unknown as PointWithUserPosition);
type Boxes = Map<CanvasBoxTag, PointWithUserPosition[]>;
const P1 = pt('p1', 'They are thirsty', PROB);
const boxesOf = (o: Partial<Record<CanvasBoxTag, PointWithUserPosition[]>>): Boxes => new Map(CANVAS_LAYERS.flatMap(l => l.boxes).map(t => [t, o[t] ?? []]));
const ONE = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB)] });
const EMPTY = boxesOf({});
const cfg = (o: Partial<PointEditConfig> = {}): PointEditConfig => ({ canvasId: 'c1', draftId: 'd1', revision: 4, runActive: false, ...o });

const addToChat = vi.fn();
const ws = (): CanvasWorkspaceValue => ({ active: true, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: true, addToChat });
const view = (boxes: Boxes, edit?: PointEditConfig): ReactNode => (
  <MemoryRouter>
    <CanvasWorkspaceContext.Provider value={ws()}>
      <div data-canvas-page>
        <CanvasGrid boxes={boxes} renderCard={p => <CanvasCard key={p.id} point={p} positions={null} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />} onMore={() => undefined} edit={edit} />
      </div>
    </CanvasWorkspaceContext.Provider>
  </MemoryRouter>
);
const byId = (id: string) => screen.queryByTestId(id);
const select = (tag: string) => fireEvent.click(screen.getByTestId(`canvas-box-title-${tag}`));
// a pending clone with the owner id opens a box by itself on the first visit: select only if it is not already
const ensureSelected = (tag: string) => { if (screen.getByTestId(`canvas-box-title-${tag}`).getAttribute('aria-pressed') !== 'true') select(tag); };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  Object.values(svc).forEach(f => f.mockReset());
  toastError.mockReset(); addToChat.mockReset();
  resetPointEdits(); resetNewCards(); dropFocusRequest(); clearDraftsExcept(null);
  mentioned.set = new Set(); pointRows.rows = []; pointRows.eq = []; pointRows.is = [];
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// item 3 (Remove) moved to the point panel in round 3: see p1621-round3.test.tsx

describe('item 2: Mention in chat per point', () => {
  const bus = createComposerTagBus();
  const mount = (onSend = vi.fn()) => {
    render(<ComposerTagContext.Provider value={bus}><Composer draftKey="u:r2" placeholder="Say" onSend={onSend} /></ComposerTagContext.Provider>);
    return onSend;
  };
  const tap = (tag: string) => act(() => { bus.hold(tag); bus.flush(true); });
  const key = pointKey(PROB, 'They are thirsty');
  beforeEach(() => bus.clear());

  it('a point pill reads the box, a dot, the words; one per point (dedupe); another point and the whole box are separate pills', () => {
    mount();
    tap(key); tap(key);
    expect(screen.getAllByTestId('composer-tag-pill')).toHaveLength(1);
    expect(screen.getByTestId('composer-tag-pill-label')).toHaveTextContent('Problem · They are thirsty');
    tap(pointKey(PROB, 'They are angry'));
    tap(SEG);
    expect(screen.getAllByTestId('composer-tag-pill')).toHaveLength(3);
  });

  it('the label is cut by CSS (truncate) and its full text is in a real tooltip on keyboard focus, with no native title', async () => {
    mount();
    const long = 'x'.repeat(200);
    tap(pointKey(PROB, long));
    const label = screen.getByTestId('composer-tag-pill-label');
    expect(label.className).toContain('truncate');
    expect(label.getAttribute('title')).toBeNull();
    act(() => label.focus());
    expect(label).toHaveFocus();
    expect((await screen.findAllByText(`Problem · ${long}`)).length).toBeGreaterThan(0);
  });

  it('each pill is removable by keyboard', async () => {
    const user = userEvent.setup();
    mount();
    tap(key);
    const remove = screen.getByRole('button', { name: 'Remove Problem · They are thirsty' });
    remove.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryAllByTestId('composer-tag-pill')).toHaveLength(0);
  });

  it('the sent message is [Box] "point text" then the words, with the box as the scope; several mentions are allowed', () => {
    const onSend = mount();
    tap(key); tap(SEG);
    fireEvent.change(screen.getByRole('textbox', { hidden: true }), { target: { value: 'shorten this' } });
    fireEvent.keyDown(screen.getByRole('textbox', { hidden: true }), { key: 'Enter' });
    const stored = onSend.mock.calls[0]![0] as string;
    const sent = decodeTagged(stored);
    expect(sent.text).toBe('[Problem] "They are thirsty" [Customer Segments] shorten this');
    expect(sent.refs).toEqual([PROB, SEG]);
    expect(splitTagged(stored).tags).toEqual([key, SEG]);
  });
});

describe('item 4: Upload button', () => {
  it('wears the same secondary blue outline constant as Undo', () => {
    render(<><CanvasUploadButton busy={false} onPick={() => undefined} /><CanvasUndoButton busy={false} onUndo={() => undefined} /></>);
    for (const token of CANVAS_SECONDARY_PILL.split(' ').filter(t => t.startsWith('border-blue') || t.startsWith('bg-blue') || t.startsWith('text-blue'))) {
      expect(screen.getByTestId('canvas-upload').className).toContain(token);
      expect(screen.getByTestId('canvas-undo').className).toContain(token);
    }
    expect(screen.getByTestId('canvas-upload').className, 'keyboard focus is visible').toContain('focus-visible:ring-2');
  });
});

describe('item 1: a pending page (no draft yet)', () => {
  const made = (over: Partial<{ revision: number; versionName: string | null }> = {}) => {
    const moveTo = vi.fn();
    const ensure = vi.fn(async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo, ...over }));
    return { ensure: ensure as unknown as EnsureDraft, ensureFn: ensure, moveTo };
  };
  const pcfg = (ensure: EnsureDraft) => cfg({ draftId: '', revision: 0, userId: 'owner-1', ensure });
  const typeNew = (v: string) => fireEvent.change(screen.getByLabelText('New card'), { target: { value: v } });

  it('shows Edit, Open, Mention in chat and Add card (Remove is in the point panel)', () => {
    render(view(ONE, pcfg(made().ensure)));
    ensureSelected(PROB);
    for (const id of ['canvas-card-edit-p1', 'canvas-card-open-p1', 'canvas-card-mention-p1', 'canvas-box-add-canvas:problem']) expect(byId(id), id).not.toBeNull();
    expect(byId('canvas-card-remove-p1'), 'Remove moved to the point panel').toBeNull();
  });

  it('the first new-card Save makes exactly one draft, writes against it with its revision, then the page moves', async () => {
    const m = made();
    svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'n1', revision: 8 });
    render(view(EMPTY, pcfg(m.ensure)));
    ensureSelected(SEG);
    typeNew('A new card');
    const save = screen.getByTestId('canvas-new-card-save');
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(svc.add).toHaveBeenCalledTimes(1));
    expect(m.ensureFn).toHaveBeenCalledTimes(1);
    expect(svc.add.mock.calls[0]!.slice(0, 4)).toEqual(['new-d', SEG, 'A new card', 7]);
    await waitFor(() => expect(m.moveTo).toHaveBeenCalledTimes(1));
  });

  it('a creation failure keeps the typed text and says why; no write is made', async () => {
    const ensure = vi.fn(async () => ({ ok: false as const, text: OPEN_ELSEWHERE_TEXT }));
    render(view(EMPTY, pcfg(ensure as unknown as EnsureDraft)));
    ensureSelected(SEG);
    typeNew('Keep me');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    expect(await screen.findByText(OPEN_ELSEWHERE_TEXT)).toBeTruthy();
    expect((screen.getByLabelText('New card') as HTMLTextAreaElement).value).toBe('Keep me');
    expect(svc.add).not.toHaveBeenCalled();
  });

  it('a write refused after the draft was made keeps the text in its buffer (keyed by the canvas) with the sentence, and the page moves', async () => {
    const m = made();
    svc.add.mockResolvedValue({ ok: false, refused: 'busy', revision: 7 });
    render(view(EMPTY, pcfg(m.ensure)));
    ensureSelected(SEG);
    typeNew('Carry me');
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    const kept = getNewCards().get(newCardKey('c1', SEG));
    expect(kept?.text).toBe('Carry me');
    expect(kept?.problem).toBe(BUSY_POINT_TEXT);
    expect(getNewCards().size, 'one buffer, nothing moved or copied').toBe(1);
  });

  it('Edit Save maps the published point onto the draft\'s copy (a legacy public point gets a new id) before editing', async () => {
    const m = made();
    pointRows.rows = [{ id: 'copy-1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.edit.mockResolvedValue({ ok: true, changed: true, pointId: 'copy-2', revision: 8 });
    render(view(ONE, pcfg(m.ensure)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'They are very thirsty' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(svc.edit).toHaveBeenCalledWith('new-d', 'copy-1', 'They are very thirsty', 7));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
  });

  it('an Edit whose draft could not be made keeps the text and the editor', async () => {
    const ensure = vi.fn(async () => ({ ok: false as const, text: 'Could not start a canvas. Try again.' }));
    render(view(ONE, pcfg(ensure as unknown as EnsureDraft)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    expect(await screen.findByText('Could not start a canvas. Try again.')).toBeTruthy();
    expect((screen.getByLabelText('Point text') as HTMLTextAreaElement).value).toBe('Edited');
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))?.text).toBe('Edited');
    expect(svc.edit).not.toHaveBeenCalled();
  });
});

describe('useHandDraft', () => {
  const pending = { version: 'v2' };
  beforeEach(() => {
    svc.versions.mockResolvedValue([{ id: 'ver-2', canvasName: 'canvas', name: 'v2' }]);
  });
  it('a double call makes one draft; the page moves through the same opener as the first message', async () => {
    let release: (v: unknown) => void = () => undefined;
    svc.open.mockReturnValue(new Promise(r => { release = r; }));
    const onOpened = vi.fn();
    const { result } = renderHook(() => useHandDraft(pending, 'canvas', onOpened));
    let a: ReturnType<EnsureDraft>, b: ReturnType<EnsureDraft>;
    act(() => { a = result.current!(); b = result.current!(); });
    await act(async () => { release({ status: 'opened', draftId: 'd-new', revision: 3, versionName: 'v_d9' }); });
    const [ra, rb] = await Promise.all([a!, b!]);
    expect(svc.open).toHaveBeenCalledTimes(1);
    expect(svc.open).toHaveBeenCalledWith('ver-2');
    expect(ra).toBe(rb);
    if (!ra.ok) throw new Error('expected ok');
    expect([ra.draftId, ra.revision]).toEqual(['d-new', 3]);
    ra.moveTo();
    expect(onOpened).toHaveBeenCalledWith('v_d9');
  });
  it('open_elsewhere makes nothing and says so; a thrown opener says the start sentence; no pending gives no writer', async () => {
    svc.open.mockResolvedValueOnce({ status: 'open_elsewhere', draftId: 'x', revision: 1, versionName: null });
    const { result } = renderHook(() => useHandDraft(pending, 'canvas', vi.fn()));
    expect(await result.current!()).toEqual({ ok: false, text: OPEN_ELSEWHERE_TEXT });
    svc.open.mockRejectedValueOnce(new Error('boom'));
    expect(await result.current!()).toEqual({ ok: false, text: 'Could not start a canvas. Try again.' });
    expect(renderHook(() => useHandDraft(null, 'canvas', vi.fn())).result.current).toBeNull();
  });
});

describe('review round 1', () => {
  const made = (over: Record<string, unknown> = {}) => {
    const moveTo = vi.fn();
    const ensure = vi.fn(async () => ({ ok: true as const, draftId: 'new-d', revision: 7, versionName: 'v_d1', moveTo, ...over }));
    return { ensure: ensure as unknown as EnsureDraft, moveTo };
  };
  const pcfg = (ensure: EnsureDraft) => cfg({ draftId: '', revision: 0, userId: 'owner-1', ensure });

  it('2: a pending clone carries the owner id (first-visit opening); nothing without ensure', () => {
    const ready = { isOwner: true, ownerId: 'owner-1', version: 'v2', draft: null } as never;
    expect(pendingEditOf(ready, made().ensure)?.userId).toBe('owner-1');
    expect(pendingEditOf(ready, null)).toBeUndefined();
  });

  // 3 (Start over) moved to p1621-round2b.test.tsx: it is one transaction now (openCanvasDraftReplacing), not a client discard then open.

  it('4: a write that fails after the draft was made keeps the buffer WITH the client id the save generated, so a retry replays', async () => {
    const m = made();
    svc.add.mockRejectedValue(new Error('lost'));
    render(view(EMPTY, pcfg(m.ensure)));
    ensureSelected(SEG);
    fireEvent.change(screen.getByLabelText('New card'), { target: { value: 'Retry me' } });
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    const sentId = svc.add.mock.calls[0]![4];
    const carried = getNewCards().get(newCardKey('c1', SEG));
    expect(carried?.clientId).toBe(sentId);
    expect(carried?.sentText).toBe('Retry me');
    expect(carried?.text).toBe('Retry me');
  });

  it('not_found on a replayed client id: the stale id is cleared, the stale sentence shows, the text stays, and the next Save sends a fresh id', async () => {
    svc.add.mockResolvedValueOnce({ ok: false, refused: 'not_found', revision: 4 });
    svc.add.mockResolvedValueOnce({ ok: true, changed: true, pointId: 'n', revision: 5 });
    render(view(EMPTY, cfg()));
    select(SEG);
    fireEvent.change(screen.getByLabelText('New card'), { target: { value: 'Same words' } });
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    expect(await screen.findByText(STALE_POINT_TEXT)).toBeTruthy();
    expect((screen.getByLabelText('New card') as HTMLTextAreaElement).value).toBe('Same words');
    const entry = getNewCards().get(newCardKey('c1', SEG));
    expect(entry?.clientId).toBeNull();
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    await waitFor(() => expect(svc.add).toHaveBeenCalledTimes(2));
    expect(svc.add.mock.calls[1]![4]).not.toBe(svc.add.mock.calls[0]![4]);
  });

  it('5: Remove whose call throws after the draft was made still moves the page to the new draft', async () => {
    const m = made();
    svc.remove.mockRejectedValue(new Error('lost'));
    pointRows.rows = [{ id: 'p1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    void removePoint(pcfg(m.ensure), PROB, P1, [P1]);   // Remove is asked from the point panel; the call is the same
    await waitFor(() => expect(m.moveTo).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalled();
  });

  it('6: moveTo is idempotent per draft; without a version name the draft stays known and the next write reuses it', async () => {
    svc.versions.mockResolvedValue([{ id: 'ver-2', canvasName: 'canvas', name: 'v2' }]);
    svc.open.mockResolvedValue({ status: 'opened', draftId: 'd-a', revision: 3, versionName: 'v_a' });
    const onOpened = vi.fn();
    const { result } = renderHook(() => useHandDraft({ version: 'v2' }, 'canvas', onOpened));
    const r = await result.current!();
    if (!r.ok) throw new Error('ok expected');
    r.moveTo(); r.moveTo();
    expect(onOpened).toHaveBeenCalledTimes(1);
    // no version name: nowhere to go, but the draft is remembered
    svc.open.mockReset();
    svc.open.mockResolvedValue({ status: 'opened', draftId: 'd-b', revision: 3, versionName: null });
    svc.revision.mockResolvedValue(9);
    const { result: nameless } = renderHook(() => useHandDraft({ version: 'v2' }, 'canvas', onOpened));
    const first = await nameless.current!();
    if (!first.ok) throw new Error('ok expected');
    first.moveTo();
    const second = await nameless.current!();
    expect(svc.open).toHaveBeenCalledTimes(1);
    expect(second.ok && [second.draftId, second.revision]).toEqual(['d-b', 9]);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('7: the sent text carries the owner\'s exact words (spacing, line breaks, quotes, %, even the delimiter marks)', () => {
    const words = 'Line one  two\nthey said "no" 100% \u2063x\u2064';
    const key = pointKey(PROB, words);
    const { text } = decodeTagged(`${tagToken(key)} hi`);
    expect(text).toBe(`[Problem] "${words}" hi`);
    expect(splitTagged(`${tagToken(key)} hi`).tags).toEqual([key]);
  });

  it('8: the draft lookup is the owner\'s; an id match wins; several same-words rows refuse with the stale sentence instead of guessing', async () => {
    const m = made();
    pointRows.rows = [
      { id: 'c1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] },
      { id: 'c2', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] },
    ];
    render(view(ONE, pcfg(m.ensure)));
    ensureSelected(PROB);
    fireEvent.click(screen.getByTestId('canvas-card-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalled());
    expect(svc.edit).not.toHaveBeenCalled();
    expect(pointRows.eq).toContainEqual(['first_validator_id', 'owner-1']);
    expect(getPointEdits().get(pointEditKey('c1', 'p1'))?.problem).toBe(STALE_POINT_TEXT);
    // the point's own id among the rows wins over words
    pointRows.rows = [{ id: 'p1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }, { id: 'c2', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.remove.mockResolvedValue({ ok: true, revision: 8 });
    cleanup(); resetPointEdits();
    void removePoint(pcfg(made().ensure), PROB, P1, [P1]);   // Remove is asked from the point panel; the call is the same
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('new-d', 'p1', 7));
  });

  it('9: the box keeps its own Mention only when empty; loading counts as non-empty where cards carry theirs', () => {
    const edit = cfg();
    expect(boxHasOwnMention(true, edit, [])).toBe(true);
    expect(boxHasOwnMention(true, edit, [pt('p1', 'a', PROB)])).toBe(false);
    expect(boxHasOwnMention(true, edit, null)).toBe(false);
    expect(boxHasOwnMention(true, undefined, [pt('p1', 'a', PROB)])).toBe(true);
    expect(boxHasOwnMention(false, edit, [])).toBe(false);
  });

  it('13: Edit opened from the side panel on a pending clone goes through ensure and moveTo', async () => {
    const m = made();
    pointRows.rows = [{ id: 'p1', statement: 'They are thirsty', system_tags: [PROB, 'canvas_v_d1'] }];
    svc.edit.mockResolvedValue({ ok: true, changed: true, pointId: 'p1', revision: 8 });
    const onSaved = vi.fn();
    render(
      <PanelPointEdit point={pt('p1', 'They are thirsty', PROB)} boxes={ONE} edit={pcfg(m.ensure)} onSaved={onSaved} onRemoved={vi.fn()}><p>card</p></PanelPointEdit>,
    );
    fireEvent.click(screen.getByTestId('canvas-panel-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Panel edit' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(svc.edit).toHaveBeenCalledWith('new-d', 'p1', 'Panel edit', 7));
    await waitFor(() => expect(m.moveTo).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith('p1', 'p1');
  });
});
