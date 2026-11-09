/** @vitest-environment jsdom */
/**
 * @file p1621-canvas-actions.test.tsx
 * @description P1621: the canvas draft shows content first and its actions when a box is selected. Expectations are typed from the spec's acceptance criteria, not read back
 * from the code. jsdom has no layout, so the 40px targets, the 320/375px widths and the row growing are checked in a browser (e2e/p1621-canvas-actions.spec.ts), not here.
 */
import { FIXED_BOX_QUESTIONS } from '@/lib/canvas-box-questions';
import { pointKey } from '@/app/pages/chat/composer-tags';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const svc = vi.hoisted(() => ({ add: vi.fn(), edit: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  addCanvasDraftPoint: (...a: unknown[]) => svc.add(...a),
  editCanvasDraftPoint: (...a: unknown[]) => svc.edit(...a),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const mentioned = vi.hoisted(() => ({ set: new Set<string>() as ReadonlySet<string> }));
vi.mock('@/app/pages/chat/use-mentioned-boxes', () => ({ useMentionedBoxes: () => mentioned.set }));
const auth = vi.hoisted(() => ({ viewerId: 'owner-1' as string | null }));
vi.mock('@/auth', () => ({
  useAuth: () => (auth.viewerId ? { session: { user: { id: auth.viewerId } }, user: { id: auth.viewerId } } : { session: null, user: null }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({ RemovePositionDialog: () => null, useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }) }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { PanelPointEdit } from '@/app/components/canvas/canvas-panel-point-edit';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { resetPointEdits, getPointEdits, pointEditKey } from '@/app/components/canvas/canvas-point-edit-store';
import { getNewCards, newCardKey, resetNewCards } from '@/app/components/canvas/canvas-new-card-store';
import { dropFocusRequest, hasFocusRequest, requestFocus } from '@/app/components/canvas/canvas-focus-request';
import { firstVisitKey } from '@/app/components/canvas/use-box-selection';
import { DUPLICATE_POINT_TEXT, FULL_BOX_TEXT, UNSAVED_TEXT_LABEL } from '@/app/components/canvas/canvas-new-card-copy';
import { BUSY_POINT_TEXT, EMPTY_POINT_TEXT, FAILED_POINT_TEXT, GONE_POINT_TEXT, RUN_GOING_TEXT, STALE_POINT_TEXT, type PointEditConfig } from '@/app/components/canvas/canvas-point-edit';
import { useEditedPointFollow } from '@/app/pages/canvas/use-edited-point-follow';
import { useCanvasDraftSync } from '@/app/pages/canvas/use-canvas-draft-sync';
import { CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';

const SEG = 'canvas:segments' as CanvasBoxTag;
const PROB = 'canvas:problem' as CanvasBoxTag;
const SOL = 'canvas:solution' as CanvasBoxTag;
const pt = (id: string, statement: string, box: CanvasBoxTag) =>
  ({ id, statement, tags: [], systemTags: [box], visibility: 'private', userPosition: null } as unknown as PointWithUserPosition);
type Boxes = Map<CanvasBoxTag, PointWithUserPosition[]>;
const boxesOf = (o: Partial<Record<CanvasBoxTag, PointWithUserPosition[]>>): Boxes => new Map(CANVAS_LAYERS.flatMap(l => l.boxes).map(t => [t, o[t] ?? []]));
const cfg = (o: Partial<PointEditConfig> = {}): PointEditConfig => ({ canvasId: 'c1', draftId: 'd1', revision: 4, runActive: false, ...o });

const addToChat = vi.fn();
const onOpen = vi.fn();
const onMore = vi.fn();
const workspace = (tap: ((t: string) => void) | null): CanvasWorkspaceValue =>
  ({ active: true, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: true, addToChat: tap });

function Canvas({ boxes, edit, tap = addToChat, questions, openDraftId }: { boxes: Boxes | null; edit?: PointEditConfig; tap?: ((t: string) => void) | null; questions?: Record<string, string>; openDraftId?: string | null }) {
  return (
    <MemoryRouter>
      <CanvasWorkspaceContext.Provider value={workspace(tap)}>
        <div data-canvas-page data-testid="page">
          <CanvasGrid
            boxes={boxes}
            renderCard={p => <CanvasCard key={p.id} point={p} positions={null} compare={null} selected={false} sharedLabel={null} onOpen={() => onOpen(p.id)} />}
            onMore={onMore}
            questions={questions}
            edit={edit}
            openDraftId={openDraftId}
            canvasId="c1"
          />
          <button type="button" data-testid="outside-control">elsewhere on the page</button>
          <p data-testid="outside-text">plain text on the page</p>
        </div>
        <div data-testid="thread-panel"><span data-testid="thread-text">the thread</span></div>
      </CanvasWorkspaceContext.Provider>
    </MemoryRouter>
  );
}
const view = (props: Parameters<typeof Canvas>[0]): ReactNode => <Canvas {...props} />;

const box = (tag: string) => screen.getByTestId(`canvas-box-${tag}`);
const title = (tag: string) => screen.getByTestId(`canvas-box-title-${tag}`);
const selectedTags = () => [...document.querySelectorAll('[data-canvas-box][data-selected]')].map(e => e.getAttribute('data-testid'));
const q = (tag: string, id: string) => within(box(tag)).queryByTestId(id);
const mention = (tag: string) => q(tag, `canvas-mention-in-chat-${tag}`);
// Round 2: Mention in chat is per card (the box keeps its own button only while empty); Remove sits after it.
const cardMention = (id: string) => screen.queryByTestId(`canvas-card-mention-${id}`);
const addBtn = (tag: string) => q(tag, `canvas-box-add-${tag}`);
const editBtn = (id: string) => screen.queryByTestId(`canvas-card-edit-${id}`);
const openBtn = (id: string) => screen.queryByTestId(`canvas-card-open-${id}`);
const newText = () => screen.getByLabelText('New card') as HTMLTextAreaElement;
const typeNew = (v: string) => fireEvent.change(newText(), { target: { value: v } });
const saveNew = () => fireEvent.click(screen.getByTestId('canvas-new-card-save'));
const select = (tag: string) => fireEvent.click(title(tag));
const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  svc.add.mockReset(); svc.edit.mockReset(); addToChat.mockReset(); onOpen.mockReset(); onMore.mockReset();
  resetPointEdits(); resetNewCards(); dropFocusRequest();
  mentioned.set = new Set();
  auth.viewerId = 'owner-1';
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ONE = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB)] });
const TWO = boxesOf({ [PROB]: [pt('p1', 'They are thirsty', PROB), pt('p2', 'They are angry', PROB)] });
const THREE = boxesOf({ [PROB]: [pt('p1', 'One', PROB), pt('p2', 'Two', PROB), pt('p3', 'Three', PROB)] });
const EMPTY = boxesOf({});

describe('layout: no layer names, the approved order', () => {
  it('the three rows carry no names or numbers, have a gap between them, and read in the approved order', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    expect(screen.queryByTestId('canvas-layer-title')).toBeNull();
    expect(screen.queryByTestId('canvas-layer-number')).toBeNull();
    expect(screen.queryByText('Core assumptions')).toBeNull();
    expect(screen.queryByText(/Profitability assumptions|Founder-fit assumptions/)).toBeNull();
    expect(screen.getAllByTestId('canvas-layer')).toHaveLength(3);
    for (const layer of screen.getAllByTestId('canvas-layer')) expect(layer.getAttribute('aria-label')).toBeNull();
    expect(screen.getAllByTestId('canvas-layer-gap')).toHaveLength(2);
    const order = [...document.querySelectorAll('[data-canvas-box]')].map(e => e.getAttribute('data-testid')?.replace('canvas-box-', ''));
    expect(order).toEqual([
      'canvas:segments', 'canvas:problem', 'canvas:solution',
      'canvas:revenue', 'canvas:channels', 'canvas:metrics',
      'canvas:good-at', 'canvas:world-needs', 'canvas:love',
    ]);
  });
});

describe('at rest and selecting (AC 1, 3, 4)', () => {
  it('at rest on an owner\'s draft no box shows Edit, Open, Add card or Mention in chat; the card is words, not a button', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    expect(screen.queryByText('Mention in chat')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByText('Add card')).toBeNull();
    expect(selectedTags()).toEqual([]);
    expect(screen.getByTestId('canvas-point-card-p1').tagName).toBe('DIV');
    expect(screen.getByText('They are thirsty')).toBeTruthy();
  });

  it('clicking any non-control area of a box selects it, the row beside See all and a card included; one box at a time; clicking it again deselects', () => {
    render(view({ boxes: TWO, edit: cfg() }));
    fireEvent.click(screen.getByText('They are thirsty'));
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
    fireEvent.click(screen.getByTestId('canvas-box-footer')); // the row beside See all
    expect(selectedTags()).toEqual([]);
    fireEvent.click(screen.getByTestId('canvas-box-footer'));
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
    fireEvent.click(box(SEG)); // another box: the first lets go
    expect(selectedTags()).toEqual(['canvas-box-canvas:segments']);
    fireEvent.click(box(SEG));
    expect(selectedTags()).toEqual([]);
  });

  it('clicking inside the page but outside every box deselects; the thread panel and dialogs do not', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(screen.getByTestId('thread-text'));
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog); // a portal: outside the page
    fireEvent.click(dialog);
    dialog.remove();
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
    fireEvent.click(screen.getByTestId('outside-text'));
    expect(selectedTags()).toEqual([]);
    select(PROB);
    fireEvent.click(screen.getByTestId('outside-control'));
    expect(selectedTags()).toEqual([]);
  });

  it('a selected filled box shows Edit, Open and Mention in chat on its card, then Add card and See all N, in that order (the box keeps no Mention of its own)', () => {
    render(view({ boxes: TWO, edit: cfg() }));
    select(PROB);
    expect(mention(PROB), 'the cards carry the mention').toBeNull();
    const order = [editBtn('p1'), openBtn('p1'), cardMention('p1'), addBtn(PROB), q(PROB, 'canvas-box-more')];
    for (const el of order) expect(el, 'every control is there').not.toBeNull();
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `visual order, step ${i}`).toBeTruthy();
    }
    expect(q(PROB, 'canvas-box-more')!.textContent).toBe('See all 2');
    expect(editBtn('p2'), 'only the first card is shown until See all').toBeNull();
  });

  it('a box holding one card has no See all; at 3 cards Add card is absent and the box says it is full', () => {
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    expect(q(PROB, 'canvas-box-more')).toBeNull();
    expect(addBtn(PROB)).not.toBeNull();
    rerender(view({ boxes: THREE, edit: cfg() }));
    expect(addBtn(PROB)).toBeNull();
    expect(within(box(PROB)).getByText(FULL_BOX_TEXT)).toBeTruthy();
    expect(FULL_BOX_TEXT).toBe('This box is full. It holds 3 cards.');
    expect(within(box(PROB)).queryAllByRole('button').filter(b => b.hasAttribute('disabled')), 'no dead control').toEqual([]);
  });

  it('while the agent works, Edit and Add card are absent and Open stays', () => {
    render(view({ boxes: ONE, edit: cfg({ runActive: true }) }));
    select(PROB);
    expect(editBtn('p1')).toBeNull();
    expect(addBtn(PROB)).toBeNull();
    expect(openBtn('p1')).not.toBeNull();
    expect(cardMention('p1')).not.toBeNull();
  });

  it('Open calls the opener with the point; Edit opens P1614\'s editor in place of the card', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(openBtn('p1')!);
    expect(onOpen).toHaveBeenCalledWith('p1');
    fireEvent.click(editBtn('p1')!);
    expect(screen.getByLabelText('Point text')).toBeTruthy();
    expect(getPointEdits().has(pointEditKey('c1', 'p1'))).toBe(true);
    expect(screen.queryByTestId('canvas-point-card-p1')).toBeNull();
  });
});

describe('first visit (AC 2)', () => {
  it('opens the first box with a card, once per person: a later visit starts with nothing selected', () => {
    const boxes = boxesOf({ [SOL]: [pt('s1', 'It is a juice truck', SOL)], [PROB]: [pt('p1', 'Thirsty', PROB)] });
    const { unmount } = render(view({ boxes, edit: cfg({ userId: 'owner-1' }) }));
    expect(selectedTags(), 'the first box in display order that holds a card').toEqual(['canvas-box-canvas:problem']);
    expect(document.activeElement, 'the first-visit opening never moves focus').toBe(document.body);
    expect(window.localStorage.getItem(firstVisitKey('owner-1'))).not.toBeNull();
    unmount();
    render(view({ boxes, edit: cfg({ userId: 'owner-1' }) }));
    expect(selectedTags()).toEqual([]);
  });

  it('is recorded per user: another person on the same browser gets their own first visit', () => {
    window.localStorage.setItem(firstVisitKey('owner-1'), '1');
    render(view({ boxes: ONE, edit: cfg({ userId: 'owner-2' }) }));
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
  });

  it('on an empty canvas Customer Segments opens with its editor, focus not taken', () => {
    render(view({ boxes: EMPTY, edit: cfg({ userId: 'owner-1' }), questions: { [SEG]: 'Who exactly has this problem?' } }));
    expect(selectedTags()).toEqual(['canvas-box-canvas:segments']);
    expect(newText()).toBeTruthy();
    expect(document.activeElement).not.toBe(newText());
  });

  it('with browser storage unavailable nothing opens', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    render(view({ boxes: ONE, edit: cfg({ userId: 'owner-1' }) }));
    expect(selectedTags()).toEqual([]);
  });

  it('opens nothing on a published version (no open draft, so no userId) and nothing while the read is loading', () => {
    render(view({ boxes: null, edit: cfg({ userId: 'owner-1' }) }));
    expect(selectedTags()).toEqual([]);
    cleanup();
    render(view({ boxes: ONE }));
    expect(selectedTags()).toEqual([]);
  });
});

describe('an empty box (AC 6)', () => {
  const Q = { [SEG]: 'Who exactly has this problem?' };
  it('selecting it opens the editor straight away with the question above it, Save and Cancel, Mention in chat, and focus in the field', () => {
    render(view({ boxes: EMPTY, edit: cfg(), questions: Q }));
    select(SEG);
    expect(document.activeElement).toBe(newText());
    const question = within(box(SEG)).getByTestId('canvas-box-question');
    expect(question.textContent).toBe('Who exactly has this problem?');
    expect(question.compareDocumentPosition(newText()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('canvas-new-card-save')).toBeTruthy();
    expect(screen.getByTestId('canvas-new-card-cancel')).toBeTruthy();
    expect(mention(SEG)).not.toBeNull();
    expect(addBtn(SEG), 'there is no Add card step').toBeNull();
  });

  it('a box with no agent question shows the fixed question above the editor (round 3)', () => {
    render(view({ boxes: EMPTY, edit: cfg() }));
    select(SEG);
    const q = within(box(SEG)).getByTestId('canvas-box-question');
    expect(q.textContent).toBe(FIXED_BOX_QUESTIONS[SEG]);
    expect(q.compareDocumentPosition(newText()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Cancel closes the editor, deselects, discards the text, and returns focus to the title', () => {
    render(view({ boxes: EMPTY, edit: cfg(), questions: Q }));
    select(SEG);
    typeNew('half a thought');
    fireEvent.click(screen.getByTestId('canvas-new-card-cancel'));
    expect(selectedTags()).toEqual([]);
    expect(screen.queryByLabelText('New card')).toBeNull();
    expect(document.activeElement).toBe(title(SEG));
    expect(getNewCards().has(newCardKey('c1', SEG))).toBe(false);
    select(SEG);
    expect(newText().value, 'discarded for good').toBe('');
  });

  it('no editor opens without an open draft (nothing to save to) or while a run is going', () => {
    render(view({ boxes: EMPTY, questions: Q }));
    select(SEG);
    expect(screen.queryByLabelText('New card')).toBeNull();
    cleanup();
    render(view({ boxes: EMPTY, edit: cfg({ runActive: true }), questions: Q }));
    select(SEG);
    expect(screen.queryByLabelText('New card')).toBeNull();
    expect(within(box(SEG)).getByTestId('canvas-box-question')).toBeTruthy();
  });
});

describe('typed text survives (AC 7)', () => {
  it('clicking away or selecting another box keeps the text, shows Unsaved text at rest, and returning restores it', () => {
    render(view({ boxes: EMPTY, edit: cfg() }));
    select(SEG);
    typeNew('my own words');
    expect(screen.queryByText(UNSAVED_TEXT_LABEL), 'not while it is being typed in').toBeNull();
    fireEvent.click(screen.getByTestId('outside-text'));
    expect(selectedTags()).toEqual([]);
    expect(within(box(SEG)).getByText(UNSAVED_TEXT_LABEL)).toBeTruthy();
    expect(UNSAVED_TEXT_LABEL).toBe('Unsaved text');
    select(PROB);
    expect(within(box(SEG)).getByText(UNSAVED_TEXT_LABEL)).toBeTruthy();
    select(SEG);
    expect(newText().value).toBe('my own words');
    expect(screen.queryByText(UNSAVED_TEXT_LABEL)).toBeNull();
  });

  it('a filled box restores its new-card editor with the text when it is selected again', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    typeNew('a second card');
    select(SEG);
    expect(within(box(PROB)).getByText(UNSAVED_TEXT_LABEL)).toBeTruthy();
    select(PROB);
    expect(newText().value).toBe('a second card');
  });

  it('survives the grid unmounting and mounting again in the same tab (the buffer is a store, not state), and never reads as a gone point', () => {
    const first = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    typeNew('kept across a re-mount');
    first.unmount();
    render(view({ boxes: ONE, edit: cfg() }));
    expect(within(box(PROB)).getByText(UNSAVED_TEXT_LABEL)).toBeTruthy();
    expect(screen.queryByTestId('canvas-point-editor-notice')).toBeNull();
    expect(getPointEdits().size, 'P1614\'s store is untouched').toBe(0);
  });

  it('is keyed by canvas and box: another canvas never gets the text; the next draft of the same canvas shows it where it was typed', () => {
    const first = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    typeNew('draft one words');
    first.unmount();
    render(view({ boxes: ONE, edit: cfg({ canvasId: 'c2', draftId: 'd2' }) }));
    expect(screen.queryByText(UNSAVED_TEXT_LABEL)).toBeNull();
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    expect(newText().value, 'another canvas: its editor is empty').toBe('');
    cleanup();
    render(view({ boxes: ONE, edit: cfg({ draftId: 'd2' }) }));   // the same canvas, its next draft
    expect(screen.getByText(UNSAVED_TEXT_LABEL)).toBeTruthy();
    select(PROB);
    expect(newText().value).toBe('draft one words');
  });

  it('a run starting keeps an open editor and its text, takes Save away, and says why', () => {
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    typeNew('typed before the run');
    rerender(view({ boxes: ONE, edit: cfg({ runActive: true }) }));
    expect(newText().value).toBe('typed before the run');
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
    expect(screen.getByTestId('canvas-new-card-problem').textContent).toContain(RUN_GOING_TEXT);
    rerender(view({ boxes: ONE, edit: cfg() }));
    expect(screen.getByTestId('canvas-new-card-save')).toBeTruthy();
  });
});

describe('the draft goes away while new-card text is typed: the text stays on screen to copy', () => {
  const typedThenGone = (rest: Parameters<typeof Canvas>[0]) => {
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    typeNew('words I must not lose');
    rerender(view(rest));
    return rerender;
  };

  it('published or discarded (no open draft any more): read-only text, P1614\'s kept-text sentence, Dismiss, and nothing to save', () => {
    typedThenGone({ boxes: ONE });
    const gone = screen.getByTestId(`canvas-new-card-gone-text`) as HTMLTextAreaElement;
    expect(gone.value).toBe('words I must not lose');
    expect(gone.readOnly).toBe(true);
    expect(screen.getByTestId('canvas-new-card-gone-notice').textContent).toContain(GONE_POINT_TEXT);
    expect(GONE_POINT_TEXT).toBe('This point changed while you were typing. Your text is kept here to copy.');
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
    expect(screen.queryByLabelText('New card')).toBeNull();
    fireEvent.click(screen.getByTestId('canvas-new-card-gone-dismiss'));
    expect(screen.queryByTestId('canvas-new-card-gone-text')).toBeNull();
    expect(getNewCards().size).toBe(0);
    expect(document.activeElement, 'focus is not left on the page').toBe(title(PROB));
  });

  it('it stays whatever is selected, in the box it was typed in', () => {
    typedThenGone({ boxes: ONE });
    expect(within(box(PROB)).getByTestId('canvas-new-card-gone-text')).toBeTruthy();
    fireEvent.click(screen.getByTestId('outside-text'));
    expect(within(box(PROB)).getByTestId('canvas-new-card-gone-text')).toBeTruthy();
    expect(within(box(SEG)).queryByTestId('canvas-new-card-gone-text')).toBeNull();
  });

  it('a different draft of the same canvas replacing it is not "gone": the text shows in the new draft, in the box it was typed in', () => {
    typedThenGone({ boxes: ONE, edit: cfg({ draftId: 'd2' }) });
    expect(screen.queryByTestId('canvas-new-card-gone-text')).toBeNull();
    expect(newText().value, 'still in its editor, nothing moved').toBe('words I must not lose');
  });

  it('a reader or a signed-out visitor never sees it (it would show a former owner\'s words), and leaving the page discards it', () => {
    typedThenGone({ boxes: ONE, tap: null });
    expect(screen.queryByTestId('canvas-new-card-gone-text')).toBeNull();
    expect(getNewCards().size).toBe(1);
    const hook = renderHook(() => useCanvasDraftSync(null, vi.fn(), vi.fn()));
    hook.unmount();
    expect(getNewCards().size, 'the page unmounting clears the buffer, as P1614\'s').toBe(0);
  });

  it('a save refused or thrown because the draft is gone leaves the text in the editor, and it then shows read-only once the page stops offering the draft', async () => {
    svc.add.mockRejectedValue(new Error('draft gone'));
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
    typeNew('typed for a draft that left');
    saveNew();
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(FAILED_POINT_TEXT));
    rerender(view({ boxes: ONE }));
    expect((screen.getByTestId('canvas-new-card-gone-text') as HTMLTextAreaElement).value).toBe('typed for a draft that left');
  });
});

describe('See all in place (AC 8)', () => {
  it('shows every card in one click, selects the box, keeps the selection, and Show less collapses it', () => {
    render(view({ boxes: THREE, edit: cfg() }));
    expect(screen.queryByText('Three')).toBeNull();
    fireEvent.click(within(box(PROB)).getByTestId('canvas-box-more'));
    expect(onMore, 'the owner\'s draft expands in place, no panel').not.toHaveBeenCalled();
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
    for (const id of ['p1', 'p2', 'p3']) { expect(editBtn(id)).not.toBeNull(); expect(openBtn(id)).not.toBeNull(); }
    const less = within(box(PROB)).getByTestId('canvas-box-less');
    expect(less.textContent).toBe('Show less');
    fireEvent.click(less);
    expect(screen.queryByText('Three')).toBeNull();
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
  });

  it('deselecting or selecting another box collapses it', () => {
    render(view({ boxes: THREE, edit: cfg() }));
    fireEvent.click(within(box(PROB)).getByTestId('canvas-box-more'));
    expect(screen.getByText('Three')).toBeTruthy();
    select(SEG);
    expect(screen.queryByText('Three')).toBeNull();
    fireEvent.click(within(box(PROB)).getByTestId('canvas-box-more'));
    fireEvent.click(screen.getByTestId('outside-text'));
    expect(screen.queryByText('Three')).toBeNull();
  });

  it('a reader, and the owner on a published version, keep the panel: See all calls the opener and nothing expands', () => {
    render(view({ boxes: THREE, tap: null }));
    fireEvent.click(within(box(PROB)).getByTestId('canvas-box-more'));
    expect(onMore).toHaveBeenCalledWith(PROB);
    expect(screen.queryByText('Three')).toBeNull();
    cleanup();
    onMore.mockReset();
    render(view({ boxes: THREE }));
    fireEvent.click(within(box(PROB)).getByTestId('canvas-box-more'));
    expect(onMore).toHaveBeenCalledWith(PROB);
  });
});

describe('Add card saves the owner\'s words (AC 9, 10, 11, 12)', () => {
  const open = async () => {
    select(PROB);
    fireEvent.click(addBtn(PROB)!);
  };

  it('sends the draft, box, trimmed text, the revision and a client id; the box stays selected, expands, and focus goes to Add card', async () => {
    svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'new', revision: 5 });
    render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('  They carry cash  ');
    saveNew();
    await waitFor(() => expect(screen.queryByLabelText('New card')).toBeNull());
    expect(svc.add).toHaveBeenCalledTimes(1);
    const [draft, boxTag, text, revision, clientId] = svc.add.mock.calls[0]!;
    expect([draft, boxTag, text, revision]).toEqual(['d1', PROB, 'They carry cash', 4]);
    expect(String(clientId)).toMatch(/^[0-9a-f-]{36}$/);
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
    await waitFor(() => expect(document.activeElement).toBe(addBtn(PROB)));
    expect(getNewCards().has(newCardKey('c1', PROB))).toBe(false);
  });

  it('after a save that fills the box, focus goes to the title (Add card is gone)', async () => {
    svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'new', revision: 5 });
    const { rerender } = render(view({ boxes: TWO, edit: cfg() }));
    await open();
    typeNew('the third');
    saveNew();
    await waitFor(() => expect(screen.queryByLabelText('New card')).toBeNull());
    rerender(view({ boxes: THREE, edit: cfg({ revision: 5 }) }));
    await waitFor(() => expect(document.activeElement).toBe(title(PROB)));
  });

  it('in an empty box the editor does not reopen over the card on its way, and focus lands on Add card once the card is there', async () => {
    svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'new', revision: 5 });
    const { rerender } = render(view({ boxes: EMPTY, edit: cfg() }));
    select(SEG);
    typeNew('my first card');
    saveNew();
    await waitFor(() => expect(svc.add).toHaveBeenCalled());
    await waitFor(() => expect(getNewCards().has(newCardKey('c1', SEG))).toBe(false));
    expect(screen.queryByLabelText('New card')).toBeNull();
    rerender(view({ boxes: boxesOf({ [SEG]: [pt('n1', 'my first card', SEG)] }), edit: cfg({ revision: 5 }) }));
    await waitFor(() => expect(document.activeElement).toBe(addBtn(SEG)));
    expect(selectedTags()).toEqual(['canvas-box-canvas:segments']);
  });

  it('empty text is stopped with a sentence and calls nothing', async () => {
    render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('   ');
    saveNew();
    expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(EMPTY_POINT_TEXT);
    expect(svc.add).not.toHaveBeenCalled();
  });

  it.each([
    ['busy', BUSY_POINT_TEXT],
    ['busy_elsewhere', BUSY_POINT_TEXT],
    ['stale_view', STALE_POINT_TEXT],
    ['duplicate', DUPLICATE_POINT_TEXT],
  ])('a %s refusal keeps the text and says why', async (refused, sentence) => {
    svc.add.mockResolvedValue({ ok: false, refused, revision: 4 });
    render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('typed words');
    saveNew();
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(sentence));
    expect(newText().value).toBe('typed words');
    expect(screen.getByTestId('canvas-new-card-save'), 'Save stays for another try').toBeTruthy();
    expect(DUPLICATE_POINT_TEXT).toBe('This box already has that point.');
  });

  it('a box that filled while typing keeps the text, says it is full and offers no Save', async () => {
    svc.add.mockResolvedValue({ ok: false, refused: 'box_full', revision: 4 });
    render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('too late');
    saveNew();
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(FULL_BOX_TEXT));
    expect(newText().value).toBe('too late');
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
    expect(screen.getByTestId('canvas-new-card-cancel')).toBeTruthy();
  });

  it('an agent filling the box while the owner types does the same without a refusal', async () => {
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('typed while the agent worked');
    rerender(view({ boxes: THREE, edit: cfg() }));
    expect(newText().value).toBe('typed while the agent worked');
    expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(FULL_BOX_TEXT);
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
  });

  it('a lost answer (the call throws) keeps the text, and the retry of the same text carries the same client id; changed text gets a new one', async () => {
    svc.add.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true, changed: false, pointId: 'new', revision: 5 });
    render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('same words');
    saveNew();
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(FAILED_POINT_TEXT));
    expect(newText().value).toBe('same words');
    saveNew();
    await waitFor(() => expect(svc.add).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem')).toBeTruthy());
    expect(svc.add.mock.calls[1]![4], 'same text, same id').toBe(svc.add.mock.calls[0]![4]);
    typeNew('different words');
    saveNew();
    await waitFor(() => expect(svc.add).toHaveBeenCalledTimes(3));
    expect(svc.add.mock.calls[2]![4], 'changed text, new id').not.toBe(svc.add.mock.calls[0]![4]);
    await waitFor(() => expect(screen.queryByLabelText('New card')).toBeNull());
  });

  it('Save is read-only and busy while the call is out, so nothing typed then can be lost and a second click sends nothing', async () => {
    let resolve!: (v: unknown) => void;
    svc.add.mockReturnValue(new Promise(r => { resolve = r; }));
    render(view({ boxes: ONE, edit: cfg() }));
    await open();
    typeNew('words');
    saveNew();
    await waitFor(() => expect(newText().readOnly).toBe(true));
    fireEvent.click(screen.getByTestId('canvas-new-card-save'));
    expect(svc.add).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(newText(), { key: 'Escape' });
    expect(screen.getByLabelText('New card'), 'Escape does nothing during a save').toBeTruthy();
    await act(async () => resolve({ ok: true, changed: true, pointId: 'n', revision: 5 }));
    await waitFor(() => expect(screen.queryByLabelText('New card')).toBeNull());
  });
});

describe('keyboard alone (AC 21)', () => {
  it('the title is a real button inside the heading that says whether the box is selected; Enter and Space select and deselect', async () => {
    const user = userEvent.setup();
    render(view({ boxes: ONE, edit: cfg() }));
    const t = title(PROB);
    expect(t.tagName).toBe('BUTTON');
    expect(t.closest('h3')).not.toBeNull();
    expect(box(PROB).getAttribute('aria-labelledby')).toBe(t.closest('h3')!.id);
    expect(t.getAttribute('aria-pressed')).toBe('false');
    t.focus();
    await user.keyboard('{Enter}');
    expect(t.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard(' ');
    expect(t.getAttribute('aria-pressed')).toBe('false');
    await user.keyboard('{Enter}');
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
  });

  it('Tab after selecting reaches the box\'s actions in visual order, and each works from the keyboard', async () => {
    const user = userEvent.setup();
    render(view({ boxes: TWO, edit: cfg() }));
    title(PROB).focus();
    await user.keyboard('{Enter}');
    const seen: Element[] = [];
    for (let i = 0; i < 5; i++) { await user.tab(); seen.push(document.activeElement!); }
    expect(seen).toEqual([editBtn('p1'), openBtn('p1'), cardMention('p1'), addBtn(PROB), q(PROB, 'canvas-box-more')]);
    // See all (focused) by keyboard, then Show less
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('canvas-box-less')).toBe(document.activeElement);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('canvas-box-more')).toBe(document.activeElement);
    // Mention in chat
    cardMention('p1')!.focus();
    await user.keyboard('{Enter}');
    expect(addToChat).toHaveBeenCalledWith(pointKey(PROB, 'They are thirsty'));
    // Open
    openBtn('p1')!.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('p1');
    // Edit, then Cancel returns to the card's Edit (focus never falls to the page)
    editBtn('p1')!.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByLabelText('Point text'));
    await user.tab();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(editBtn('p1')));
  });

  it('Add card, Save and Cancel work from the keyboard, and Cancel in a filled box returns to Add card', async () => {
    const user = userEvent.setup();
    svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'n', revision: 5 });
    render(view({ boxes: ONE, edit: cfg() }));
    title(PROB).focus();
    await user.keyboard('{Enter}');
    addBtn(PROB)!.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(newText());
    await user.keyboard('hello');
    await user.tab(); // Cancel
    expect(document.activeElement).toBe(screen.getByTestId('canvas-new-card-cancel'));
    await user.tab(); // Save
    await user.keyboard('{Enter}');
    await waitFor(() => expect(svc.add).toHaveBeenCalledWith('d1', PROB, 'hello', 4, expect.any(String)));
    await waitFor(() => expect(document.activeElement).toBe(addBtn(PROB)));
    await user.keyboard('{Enter}');   // Add card again, then Cancel by keyboard
    screen.getByTestId('canvas-new-card-cancel').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(addBtn(PROB)));
  });

  it('Escape deselects and returns focus to the title, from the title, an action or the box', async () => {
    const user = userEvent.setup();
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    openBtn('p1')!.focus();
    await user.keyboard('{Escape}');
    expect(selectedTags()).toEqual([]);
    expect(document.activeElement).toBe(title(PROB));
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(selectedTags()).toEqual([]);
    expect(document.activeElement).toBe(title(PROB));
  });

  it('selecting an empty box moves focus to the text field; Escape there closes the editor keeping the text, deselects and returns to the title', async () => {
    const user = userEvent.setup();
    render(view({ boxes: EMPTY, edit: cfg() }));
    title(SEG).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(newText());
    await user.keyboard('half');
    await user.keyboard('{Escape}');
    expect(selectedTags()).toEqual([]);
    expect(document.activeElement).toBe(title(SEG));
    expect(getNewCards().get(newCardKey('c1', SEG))?.text).toBe('half');
    expect(within(box(SEG)).getByText(UNSAVED_TEXT_LABEL)).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(newText().value).toBe('half');
  });

  it('an Edit editor\'s Escape keeps P1614\'s behaviour: it closes the editor only, the box stays selected', async () => {
    const user = userEvent.setup();
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(editBtn('p1')!);
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Point text')).toBeNull();
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
  });

  it('an open Edit editor stays visible whatever is selected', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(editBtn('p1')!);
    select(SEG);
    expect(screen.getByLabelText('Point text')).toBeTruthy();
    fireEvent.click(screen.getByTestId('outside-text'));
    expect(screen.getByLabelText('Point text')).toBeTruthy();
  });
});

describe('Mention in chat (AC 14)', () => {
  it('taps through with the point key; reads Mentioned and is pressed per point while its pill is in the composer; a tap then still shows the thread', () => {
    const key = pointKey(PROB, 'They are thirsty');
    const { rerender } = render(view({ boxes: TWO, edit: cfg() }));
    select(PROB);
    expect(cardMention('p1')!.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(cardMention('p1')!);
    expect(addToChat).toHaveBeenCalledTimes(1);
    expect(addToChat).toHaveBeenCalledWith(key);
    mentioned.set = new Set([key]);
    rerender(view({ boxes: TWO, edit: cfg() }));
    expect(cardMention('p1')!.textContent).toBe('Mentioned');
    expect(cardMention('p1')!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cardMention('p1')!);
    expect(addToChat, 'with the thread hidden the tap must still bring it into view').toHaveBeenCalledTimes(2);
    mentioned.set = new Set();
    rerender(view({ boxes: TWO, edit: cfg() }));
    expect(cardMention('p1')!.textContent).toBe('Mention in chat');
  });

  it('a card and an empty box make two taps, each its own key; the empty box keeps the box-level button', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(cardMention('p1')!);
    select(SEG);
    fireEvent.click(mention(SEG)!);
    expect(addToChat.mock.calls.map(c => c[0])).toEqual([pointKey(PROB, 'They are thirsty'), SEG]);
  });

  it('on a published version selecting shows Mention in chat only, and the card still opens as a whole', () => {
    render(view({ boxes: ONE }));
    select(PROB);
    expect(mention(PROB)).not.toBeNull();
    expect(addBtn(PROB)).toBeNull();
    expect(editBtn('p1')).toBeNull();
    expect(openBtn('p1')).toBeNull();
    const card = screen.getByTestId('canvas-point-card-p1');
    expect(card.tagName).toBe('BUTTON');
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('p1');
  });
});

describe('a reader sees none of the owner actions (AC 20)', () => {
  it('no title button, no selection by clicking, no Mention, Edit, Add card or editor; the whole card opens', () => {
    render(view({ boxes: TWO, tap: null, questions: { [SEG]: 'A question' } }));
    expect(screen.queryByTestId(`canvas-box-title-${PROB}`)).toBeNull();
    fireEvent.click(box(PROB));
    fireEvent.click(box(SEG));
    expect(selectedTags()).toEqual([]);
    expect(screen.queryByText('Mention in chat')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Add card')).toBeNull();
    expect(screen.queryByLabelText('New card')).toBeNull();
    fireEvent.click(screen.getByTestId('canvas-point-card-p1'));
    expect(onOpen).toHaveBeenCalledWith('p1');
    expect(box(PROB).querySelector('h3')!.textContent).toBe('Problem');
  });

  it('a signed-out visitor with an edit config that never came sees the same', () => {
    auth.viewerId = null;
    render(view({ boxes: ONE, tap: null }));
    fireEvent.click(box(PROB));
    expect(selectedTags()).toEqual([]);
  });
});

describe('Edit and Open on the opened point (AC 13, 17)', () => {
  const point = pt('p1', 'They are thirsty', PROB);
  const panel = (edit: PointEditConfig | undefined, onSaved = vi.fn()) => (
    <MemoryRouter><PanelPointEdit point={point} boxes={ONE} edit={edit} onSaved={onSaved} onRemoved={vi.fn()}><div data-testid="the-card">card</div></PanelPointEdit></MemoryRouter>
  );

  it('the owner on a draft gets Edit beside the card; a save reports the new id so the panel can follow it', async () => {
    svc.edit.mockResolvedValue({ ok: true, changed: true, pointId: 'p9', revision: 5 });
    const onSaved = vi.fn();
    render(panel(cfg(), onSaved));
    fireEvent.click(screen.getByTestId('canvas-panel-edit-p1'));
    expect(screen.queryByTestId('the-card'), 'the editor takes the card\'s place').toBeNull();
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'They are very thirsty' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p1', 'p9'));
    expect(svc.edit).toHaveBeenCalledWith('d1', 'p1', 'They are very thirsty', 4);
  });

  it('Edit is gone while a run goes, and absent for a reader or a published version (no edit config)', () => {
    const { rerender } = render(panel(cfg({ runActive: true })));
    expect(screen.queryByTestId('canvas-panel-edit-p1')).toBeNull();
    expect(screen.getByTestId('the-card')).toBeTruthy();
    rerender(panel(undefined));
    expect(screen.queryByTestId('canvas-panel-edit-p1')).toBeNull();
    expect(screen.getByTestId('the-card')).toBeTruthy();
  });

  it('after a save the focus goes to the saved point\'s Edit in the panel, once it is there', async () => {
    svc.edit.mockResolvedValue({ ok: true, changed: true, pointId: 'p9', revision: 5 });
    const { rerender } = render(panel(cfg()));
    fireEvent.click(screen.getByTestId('canvas-panel-edit-p1'));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'new words' } });
    fireEvent.click(screen.getByTestId('canvas-point-editor-save'));
    await waitFor(() => expect(svc.edit).toHaveBeenCalled());
    // the grid draws no box here; any box's effect hands focus over, so mount one beside the panel
    rerender(<MemoryRouter><PanelPointEdit point={pt('p9', 'new words', PROB)} boxes={ONE} edit={cfg({ revision: 5 })} onSaved={vi.fn()} onRemoved={vi.fn()}><div /></PanelPointEdit></MemoryRouter>);
    expect(screen.getByTestId('canvas-panel-edit-p9')).toBeTruthy();
  });
});

describe('useEditedPointFollow: the panel stays open on the edited point', () => {
  it('keeps the old id until the read has the new one, then the new one is open in the same render and the address is replaced', () => {
    const replace = vi.fn();
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useEditedPointFollow('p1', ids, replace), { initialProps: { ids: ['p1', 'x'] } });
    expect(result.current.requestedId).toBe('p1');
    act(() => result.current.follow('p1', 'p9'));
    expect(result.current.requestedId, 'the new point is not on screen yet').toBe('p1');
    expect(replace).not.toHaveBeenCalled();
    rerender({ ids: ['p9', 'x'] });
    expect(result.current.requestedId, 'no render with neither point open').toBe('p9');
    expect(replace).toHaveBeenCalledWith('p9');
    rerender({ ids: ['p9', 'x'] });
    expect(result.current.requestedId).toBe('p9');   // the address has not caught up yet: still bridged
  });

  it('forgets a follow when the person moved on', () => {
    const replace = vi.fn();
    const { result, rerender } = renderHook(({ id, ids }: { id: string | null; ids: string[] }) => useEditedPointFollow(id, ids, replace), { initialProps: { id: 'p1' as string | null, ids: ['p1'] } });
    act(() => result.current.follow('p1', 'p9'));
    rerender({ id: null, ids: ['p1'] });
    rerender({ id: 'p1', ids: ['p9'] });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('Add a story on the opened point, for the canvas owner (AC 18)', () => {
  const point = { id: 'point-1', statement: 'Speakers overestimate how clearly they communicated.', tags: [], systemTags: ['canvas:problem'], visibility: 'private', positionCounts: {}, totalPositions: 0, userPosition: null } as unknown as PointWithUserPosition;
  const ownerOf = (id: string) => ({ id, name: 'Ana', isAgent: false });
  const bindings = (o: Record<string, unknown> = {}) => ({ setPosition: async () => undefined, removePosition: async () => undefined, reader: false, sharedLabel: null, ...o });
  const card = (viewer: string, canvas: Record<string, unknown>, onAddStory = vi.fn(), stories: unknown[] = []) => {
    auth.viewerId = viewer;
    return render(
      <MemoryRouter>
        <FeedPointCard point={point} surface="canvas" owner={ownerOf('owner-1')} linkedStories={stories as never} canvas={bindings(canvas) as never} onAddStory={onAddStory} />
      </MemoryRouter>,
    );
  };
  const addStory = () => screen.queryByRole('button', { name: 'Add a story for this point' });

  it('the owner sees "+ Add a story" on their own point with no position taken, and it opens the composer', () => {
    const onAddStory = vi.fn();
    card('owner-1', {}, onAddStory);
    expect(addStory()!.textContent).toBe('+ Add a story');
    fireEvent.click(addStory()!);
    expect(onAddStory).toHaveBeenCalledTimes(1);
  });

  it('a reader with no position still gets none (their rule is unchanged)', () => {
    card('reader-1', { reader: true });
    expect(addStory()).toBeNull();
  });

  it('the other conditions stay for the owner: a point kept from a published version, a story already added, stories not loaded, a story of theirs, read-only', () => {
    card('owner-1', { noAddStory: true });
    expect(addStory()).toBeNull();
    cleanup();
    card('owner-1', { ownStoryAdded: true });
    expect(addStory()).toBeNull();
    cleanup();
    card('owner-1', { readOnly: true });
    expect(addStory()).toBeNull();
    cleanup();
    auth.viewerId = 'owner-1';
    render(<MemoryRouter><FeedPointCard point={point} surface="canvas" owner={ownerOf('owner-1')} canvas={bindings() as never} onAddStory={vi.fn()} /></MemoryRouter>);
    expect(addStory(), 'stories not loaded').toBeNull();
    cleanup();
    card('owner-1', {}, vi.fn(), [{ id: 's1', authorId: 'owner-1', authorName: 'Ana', authorSlug: 'ana', content: 'mine', visibility: 'private', createdAt: '2026-10-01T00:00:00Z', understoodCount: 0, authorEarsCount: 0, authorHasPledged: false }]);
    expect(addStory(), 'a story of theirs already').toBeNull();
  });

  it('a signed-out visitor never gets it', () => {
    auth.viewerId = null;
    render(<MemoryRouter><FeedPointCard point={point} surface="canvas" owner={ownerOf('owner-1')} linkedStories={[]} canvas={bindings({ readOnly: true }) as never} onAddStory={vi.fn()} /></MemoryRouter>);
    expect(addStory()).toBeNull();
  });
});

describe('the unchanged card of a published version keeps its whole-card button (AC 15)', () => {
  it('a card drawn outside a selectable box (the side panel\'s list, a reader) is one button that opens the point', () => {
    render(
      <MemoryRouter>
        <CanvasCard point={pt('p1', 'Words', PROB)} positions={[]} compare={null} selected={false} sharedLabel={null} onOpen={onOpen} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId('canvas-point-card-p1');
    expect(card.tagName).toBe('BUTTON');
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalled();
    expect(mock(onOpen)).toHaveBeenCalledTimes(1);
  });
});

describe('review fixes (round 3)', () => {
  const openAdd = (tag: CanvasBoxTag = PROB) => { select(tag); fireEvent.click(addBtn(tag)!); };

  it('1. a box_full refusal clears when the box drops below 3 cards, and Save comes back with the text kept', async () => {
    svc.add.mockResolvedValue({ ok: false, refused: 'box_full', revision: 4 });
    const { rerender } = render(view({ boxes: TWO, edit: cfg() }));
    openAdd();
    typeNew('typed while it filled');
    saveNew();
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(FULL_BOX_TEXT));
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
    rerender(view({ boxes: ONE, edit: cfg({ revision: 5 }) }));   // an agent dropped a card
    expect(screen.queryByTestId('canvas-new-card-problem')).toBeNull();
    expect(screen.getByTestId('canvas-new-card-save')).toBeTruthy();
    expect(newText().value).toBe('typed while it filled');
  });

  it('1b. a box that fills elsewhere and returns to the same count brings Save back: the revision decides, not the count', async () => {
    svc.add.mockResolvedValue({ ok: false, refused: 'box_full', revision: 4 });
    const { rerender } = render(view({ boxes: TWO, edit: cfg() }));
    openAdd();
    typeNew('typed while it filled');
    saveNew();
    await waitFor(() => expect(screen.getByTestId('canvas-new-card-problem').textContent).toBe(FULL_BOX_TEXT));
    rerender(view({ boxes: TWO, edit: cfg({ revision: 4 }) }));   // same revision the server refused at: still full
    expect(screen.queryByTestId('canvas-new-card-save')).toBeNull();
    rerender(view({ boxes: TWO, edit: cfg({ revision: 6 }) }));   // the third card came and went
    expect(screen.getByTestId('canvas-new-card-save')).toBeTruthy();
    expect(newText().value).toBe('typed while it filled');
  });

  it('2. a published view of a draft that is still open keeps the buffer silently: no notice, nothing to dismiss, text intact', () => {
    const first = render(view({ boxes: ONE, edit: cfg() }));
    openAdd();
    typeNew('words for the open draft');
    first.unmount();
    render(view({ boxes: ONE, openDraftId: 'd1' }));
    expect(screen.queryByTestId('canvas-new-card-gone-text')).toBeNull();
    expect(getNewCards().get(newCardKey('c1', PROB))?.text).toBe('words for the open draft');
    cleanup();
    render(view({ boxes: ONE }));   // no open draft any more: the text is really gone
    expect(screen.getByTestId('canvas-new-card-gone-text')).toBeTruthy();
    fireEvent.click(screen.getByTestId('canvas-new-card-gone-dismiss'));
    expect(getNewCards().size).toBe(0);
  });

  it('4. selecting text inside a box does not toggle it', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, toString: () => 'thirsty' } as unknown as Selection);
    fireEvent.click(screen.getByText('They are thirsty'));
    expect(selectedTags()).toEqual([]);
    vi.mocked(window.getSelection).mockReturnValue({ isCollapsed: true, toString: () => '' } as unknown as Selection);
    fireEvent.click(screen.getByText('They are thirsty'));
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
  });

  it('5a. an empty box whose re-read never arrives gets its editor back after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      svc.add.mockResolvedValue({ ok: true, changed: true, pointId: 'n', revision: 5 });
      render(view({ boxes: EMPTY, edit: cfg() }));
      select(SEG);
      typeNew('first card');
      await act(async () => { saveNew(); await Promise.resolve(); await Promise.resolve(); });
      expect(screen.queryByLabelText('New card'), 'not over the card on its way').toBeNull();
      await act(async () => { vi.advanceTimersByTime(20_000); });
      expect(screen.getByLabelText('New card'), 'the read failed: the box is not stuck without an editor').toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('5b. deselecting during a save, then selecting again before the re-read, does not reopen the editor over the card on its way', async () => {
    let resolve!: (v: unknown) => void;
    svc.add.mockReturnValue(new Promise(r => { resolve = r; }));
    render(view({ boxes: EMPTY, edit: cfg() }));
    select(SEG);
    typeNew('first card');
    saveNew();
    await waitFor(() => expect(newText().readOnly).toBe(true));
    fireEvent.click(screen.getByTestId('outside-text'));
    await act(async () => resolve({ ok: true, changed: true, pointId: 'n', revision: 5 }));
    select(SEG);
    expect(screen.queryByLabelText('New card')).toBeNull();
  });

  it('6a. Cancel on an Edit editor in an unselected box sends focus to the box title, not the page', () => {
    render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    fireEvent.click(editBtn('p1')!);
    fireEvent.click(screen.getByTestId('outside-text'));   // deselects; the open editor stays
    const cancel = screen.getByTestId('canvas-point-editor-cancel');
    cancel.focus();
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(title(PROB));
  });

  it('6b. Cancel of a new card during a run sends focus to the title (Add card is absent then)', () => {
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    openAdd();
    typeNew('typed');
    rerender(view({ boxes: ONE, edit: cfg({ runActive: true }) }));
    const cancel = screen.getByTestId('canvas-new-card-cancel');
    cancel.focus();
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(title(PROB));
  });

  it('6c. Edit or Add card vanishing while focused because a run started sends focus to the box title', () => {
    const { rerender } = render(view({ boxes: ONE, edit: cfg() }));
    select(PROB);
    editBtn('p1')!.focus();
    rerender(view({ boxes: ONE, edit: cfg({ runActive: true }) }));
    expect(editBtn('p1')).toBeNull();
    expect(document.activeElement).toBe(title(PROB));
    rerender(view({ boxes: ONE, edit: cfg() }));
    addBtn(PROB)!.focus();
    rerender(view({ boxes: ONE, edit: cfg({ runActive: true }) }));
    expect(addBtn(PROB)).toBeNull();
    expect(document.activeElement).toBe(title(PROB));
  });

  it('6d. Escape while a save is in flight does not deselect the box', async () => {
    svc.add.mockReturnValue(new Promise(() => undefined));
    render(view({ boxes: ONE, edit: cfg() }));
    openAdd();
    typeNew('words');
    saveNew();
    await waitFor(() => expect(newText().readOnly).toBe(true));
    title(PROB).focus();
    fireEvent.keyDown(title(PROB), { key: 'Escape' });
    expect(selectedTags()).toEqual(['canvas-box-canvas:problem']);
  });

  it('7. leaving the canvas page drops a pending focus request', () => {
    requestFocus('canvas-box-add-canvas:problem');
    expect(hasFocusRequest()).toBe(true);
    const hook = renderHook(() => useCanvasDraftSync(null, vi.fn(), vi.fn()));
    hook.unmount();
    expect(hasFocusRequest()).toBe(false);
  });
});
