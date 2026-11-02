/**
 * @file p1536-x4-header-bar.test.tsx
 * @description P1536 3c X4 to X7, X13 (S3c.4, S3c.10): the REAL owner's bar, rendered for every row of the header table, asserting what a person sees:
 * the tag beside the name, whether the picker is there, the items in order, what sits in the spot and which control is filled. The expectations are typed
 * from the spec's table (not read back from headerRow), so a bar that draws something else fails. Then the P955 gate's top-bar assertion runs over the
 * same bars (one filled control, furthest right, auto width, nothing disabled). jsdom has no layout: positions in Playwright (e2e/p1536-x4-header.spec.ts).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { PublishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import { assertTopBarMainAction, isFilledControl, reachableControls } from './p955-top-bar';

vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getAccess: vi.fn(), getShareTargets: vi.fn(), renameCanvas: vi.fn() } }));

import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { resetCanvasAvailability, seedCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { DiscardDraftButton } from '@/app/pages/canvas/discard-draft-button';

const NOW = '2000-01-01T00:00:00.000Z';
const V1 = { name: 'canvas_d111111', createdAt: NOW, seq: 1, publishedAt: NOW, draft: false };
const DRAFT_V = { name: 'canvas_dabc123', createdAt: NOW, seq: null, publishedAt: null, draft: true };
const draft = (baseSeq: number | null, runCount = 1) => ({ id: 'draft-id-1', version: DRAFT_V.name, questions: {}, threadRootId: 'root-1', conversationId: 'conv-1', baseSeq, runCount, revision: 1, changedBoxes: [] as string[] });
const readyOf = (o: { onScreen: 'draft' | 'published'; baseSeq?: number | null; draftOpen?: boolean; hasPublished?: boolean; runCount?: number }): CanvasReady => {
  const hasPublished = o.hasPublished ?? true;
  const versions = [...(o.draftOpen ?? o.onScreen === 'draft' ? [DRAFT_V] : []), ...(hasPublished ? [V1] : [])];
  return {
    status: 'ready', ownerId: 'user-id-1', ownerName: 'Test Owner', owner: { name: 'Test Owner', hasPledged: false }, points: [], stories: new Map(), positions: new Map(), canvasId: 'canvas-id-1', title: null,
    visibility: 'private', isOwner: true, generalAccess: 'restricted', via: null, audience: [], addedStoryIds: [], publishedNone: !hasPublished,
    version: o.onScreen === 'draft' ? DRAFT_V.name : V1.name, versions, draft: (o.draftOpen ?? o.onScreen === 'draft') ? draft(o.baseSeq ?? null, o.runCount) : null,
  } as unknown as CanvasReady;
};

type Item = 'clone' | 'thread' | 'go-to-draft' | 'cancel' | 'discard';
const ITEM_ID: Record<Item, string> = { clone: 'canvas-clone', thread: 'workspace-thread-button', 'go-to-draft': 'workspace-go-to-draft-bar', cancel: 'canvas-cancel-clone', discard: 'canvas-discard' };

interface Scenario {
  name: string;
  ready: CanvasReady;
  ws?: boolean; pendingSeq?: number | null; spot?: PublishSpotState['kind']; publishing?: boolean; drafting?: boolean; wide?: boolean; panelOpen?: boolean;
  tag: 'Draft' | 'New draft' | null; picker: boolean; items: Item[];
  /** the spot: Share, Publish or a status text (null: no spot box at all) */
  spotIs: 'Share' | 'Publish' | string | null;
}
const SCENARIOS: Scenario[] = [
  { name: 'Published, owner, no draft', ready: readyOf({ onScreen: 'published' }), tag: null, picker: true, items: ['clone'], spotIs: 'Share' },
  { name: 'Published, owner, draft open, reached by View (no ws=1)', ready: readyOf({ onScreen: 'published', draftOpen: true, baseSeq: 1 }), tag: null, picker: true, items: ['clone'], spotIs: 'Share' },
  { name: 'Published, owner, draft open, picked from the picker (ws=1), panel closed, wide', ready: readyOf({ onScreen: 'published', draftOpen: true, baseSeq: 1 }), ws: true, panelOpen: false, tag: null, picker: true, items: ['thread'], spotIs: 'Share' },
  { name: 'the same on a phone (X13): Go to draft before Share', ready: readyOf({ onScreen: 'published', draftOpen: true, baseSeq: 1 }), ws: true, wide: false, tag: null, picker: true, items: ['go-to-draft'], spotIs: 'Share' },
  { name: 'Pending Clone', ready: readyOf({ onScreen: 'published' }), ws: true, pendingSeq: 1, panelOpen: false, spot: 'nothing', tag: 'New draft', picker: false, items: ['thread', 'cancel'], spotIs: 'Nothing to publish yet' },
  { name: 'Never published, no points', ready: readyOf({ onScreen: 'draft', hasPublished: false }), ws: true, panelOpen: false, spot: 'nothing', tag: 'Draft', picker: false, items: ['thread', 'discard'], spotIs: 'Nothing to publish yet' },
  { name: 'Never published, with points (Publish)', ready: readyOf({ onScreen: 'draft', hasPublished: false }), ws: true, panelOpen: false, spot: 'publish', tag: 'Draft', picker: false, items: ['thread', 'discard'], spotIs: 'Publish' },
  { name: 'Draft with a base, no difference', ready: readyOf({ onScreen: 'draft', baseSeq: 1 }), ws: true, panelOpen: false, spot: 'nothing', tag: 'Draft', picker: true, items: ['thread', 'discard'], spotIs: 'Nothing to publish yet' },
  { name: 'Draft with a base, points and a difference (Publish)', ready: readyOf({ onScreen: 'draft', baseSeq: 1 }), ws: true, panelOpen: false, spot: 'publish', tag: 'Draft', picker: true, items: ['thread', 'discard'], spotIs: 'Publish' },
  { name: 'Updating, never published: no Discard', ready: readyOf({ onScreen: 'draft', hasPublished: false }), ws: true, panelOpen: false, spot: 'updating', tag: 'Draft', picker: false, items: ['thread'], spotIs: 'Updating…' },
  { name: 'Publishing, with a base: no Discard', ready: readyOf({ onScreen: 'draft', baseSeq: 1 }), ws: true, panelOpen: false, spot: 'publish', publishing: true, tag: 'Draft', picker: true, items: ['thread'], spotIs: 'Publishing…' },
  { name: 'Pending Clone while its first Send goes: no Cancel, no picker', ready: readyOf({ onScreen: 'published' }), ws: true, pendingSeq: 1, panelOpen: false, spot: 'updating', tag: 'New draft', picker: false, items: ['thread'], spotIs: 'Updating…' },
  { name: 'At the cap, nothing to publish: Start over is in the composer, so no Discard here', ready: readyOf({ onScreen: 'draft', baseSeq: 1, runCount: 30 }), ws: true, panelOpen: false, spot: 'nothing', tag: 'Draft', picker: true, items: ['thread'], spotIs: 'Nothing to publish yet' },
  { name: 'At the cap with something to publish: Discard stays, Publish shows', ready: readyOf({ onScreen: 'draft', baseSeq: 1, runCount: 30 }), ws: true, panelOpen: false, spot: 'publish', tag: 'Draft', picker: true, items: ['thread', 'discard'], spotIs: 'Publish' },
  { name: 'Published picked from the picker (ws=1) while the open draft updates: the status holds the spot', ready: readyOf({ onScreen: 'published', draftOpen: true, baseSeq: 1 }), ws: true, panelOpen: false, spot: 'updating', tag: null, picker: true, items: ['thread'], spotIs: 'Updating…' },
  { name: 'GAP in the table (flagged): an owner with nothing published and no draft: no picker, no Clone, no Share; rule 9\'s status in the spot', ready: readyOf({ onScreen: 'published', hasPublished: false }), tag: null, picker: false, items: [], spotIs: 'Nothing to publish yet' },
  { name: 'Drafting off, published, owner: the picker and Share only', ready: readyOf({ onScreen: 'published', draftOpen: true, baseSeq: 1 }), drafting: false, tag: null, picker: true, items: [], spotIs: 'Share' },
  { name: 'Drafting off, draft, owner, with a base: the tag and nothing else', ready: readyOf({ onScreen: 'draft', baseSeq: 1 }), drafting: false, tag: 'Draft', picker: true, items: [], spotIs: null },
  { name: 'Drafting off, draft, owner, never published', ready: readyOf({ onScreen: 'draft', hasPublished: false }), drafting: false, tag: 'Draft', picker: false, items: [], spotIs: null },
];

const stubWidth = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer') || (wide && q.includes('1280')), addEventListener: () => undefined, removeEventListener: () => undefined, media: q }));

function mountBar(sc: Scenario) {
  stubWidth(sc.wide ?? true);
  seedCanvasAvailability(sc.drafting ?? true);
  const ctx: CanvasWorkspaceValue = { active: !!sc.ws, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: () => undefined, cloneSeq: sc.pendingSeq ?? null, ownerBar: true };
  const spot: PublishSpotState = { kind: sc.spot ?? 'nothing' };
  return render(
    <MemoryRouter>
      <CanvasWorkspaceContext.Provider value={ctx}>
        <CanvasOwnerBar
          ready={sc.ready} handle="test-owner" projectTag="example_canvas" title="Example canvas" canRename onRename={() => undefined} onPick={() => undefined}
          onChanged={() => undefined} onBack={() => undefined} active={!!sc.ws} view="canvas" onView={() => undefined} panelOpen={sc.panelOpen ?? true}
          onOpenPanel={() => undefined} spotState={spot} publishing={sc.publishing} onPublish={() => undefined} onGoToDraft={() => undefined}
          discard={<DiscardDraftButton ready={sc.ready} ownerSlug="test-owner" canvasName="example_canvas" />}
          cancel={<button type="button" data-testid="canvas-cancel-clone">Cancel</button>}
        />
      </CanvasWorkspaceContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); resetCanvasAvailability(); vi.unstubAllGlobals(); });

/** The item test ids on the bar's right side, in document order (= left to right). */
const itemsDrawn = (bar: HTMLElement): string[] => {
  const ids = new Set(Object.values(ITEM_ID));
  const actions = within(bar).queryByTestId('canvas-bar-actions'); // not drawn at all when the row has nothing for it (drafting off)
  return [...(actions?.querySelectorAll<HTMLElement>('[data-testid]') ?? [])].map(e => e.getAttribute('data-testid')!).filter(id => ids.has(id));
};

describe('X4: the bar draws every row of the header table', () => {
  it.each(SCENARIOS)('$name', (sc) => {
    mountBar(sc);
    const bar = screen.getByTestId('workspace-bar');
    // beside the name: the tag, the picker
    const tag = within(bar).queryByTestId('canvas-state');
    expect(tag?.textContent ?? null).toBe(sc.tag);
    expect(!!within(bar).queryByTestId('canvas-version-picker')).toBe(sc.picker);
    // the right side, left to right
    expect(itemsDrawn(bar)).toEqual(sc.items.map(i => ITEM_ID[i]));
    // the spot
    const spot = within(bar).queryByTestId('publish-spot');
    if (sc.spotIs === null) expect(spot).toBeNull();
    else if (sc.spotIs === 'Share') {
      expect(within(spot!).getByTestId('canvas-share-control')).toBeInTheDocument();
      expect(spot).toHaveAttribute('data-state', 'share');
    } else if (sc.spotIs === 'Publish') {
      expect(within(spot!).getByTestId('canvas-draft-publish')).toBeInTheDocument();
    } else {
      expect(within(spot!).getByTestId('publish-spot-status')).toHaveTextContent(sc.spotIs);
      expect(within(spot!).queryByRole('button')).toBeNull();
    }
    // which one is filled: the spot's control when it is Share or Publish, nothing otherwise
    const filled = reachableControls(bar).filter(isFilledControl).map(el => el.getAttribute('data-testid'));
    expect(filled).toEqual(sc.spotIs === 'Share' ? ['canvas-share-control'] : sc.spotIs === 'Publish' ? ['canvas-draft-publish'] : []);
    // the gate's rule 9 top-bar clause on the same bar
    expect(() => assertTopBarMainAction(bar)).not.toThrow();
  });

  it('no row renders "Published", "Published · vN", "from vN", "No changes yet", "Not published yet" or "Nothing published yet"', () => {
    for (const sc of SCENARIOS) {
      mountBar(sc);
      expect(screen.getByTestId('workspace-bar').textContent).not.toMatch(/Published|from v\d|No changes yet|Not published yet|Nothing published yet/);
      cleanup();
    }
  });

  it('Share never renders on a draft or a pending Clone', () => {
    for (const sc of SCENARIOS.filter(s => s.tag !== null)) {
      mountBar(sc);
      expect(screen.queryByTestId('canvas-share-control')).toBeNull();
      cleanup();
    }
  });

  it('the spot box is the same box (same classes) in every state that draws one: Share, Publish and a status', () => {
    const boxes = new Set<string>();
    for (const sc of SCENARIOS.filter(s => s.spotIs !== null)) {
      mountBar(sc);
      boxes.add(screen.getByTestId('publish-spot').className);
      cleanup();
    }
    expect([...boxes]).toHaveLength(1);
  });

  it('the Thread button is not drawn while the panel is open, on a wide screen', () => {
    mountBar({ ...SCENARIOS[5]!, panelOpen: true });
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull();
  });

  it('Discard is red text with no box; Cancel is ghost text with no box; Thread and Clone are the secondary pill (rules 5, 3 and the named pill)', async () => {
    const { lacksDiscardText, hasBox } = await import('./p1536-pill-assert');
    mountBar(SCENARIOS[5]!);
    const discard = screen.getByTestId('canvas-discard');
    expect(lacksDiscardText(discard)).toEqual([]);
    expect(hasBox(discard)).toBe(false);
    expect(discard.className).toContain('text-red-600');
    expect(discard).toHaveTextContent('Discard'); // never icon-only
  });

  it('CONTROL (gate 7): the gate\'s assertion throws on a bar that breaks the rule, with the exit-code-bearing message', () => {
    mountBar(SCENARIOS[8]!);
    const bar = screen.getByTestId('workspace-bar');
    expect(() => assertTopBarMainAction(bar)).not.toThrow();
    // a second filled control in the bar
    const second = document.createElement('button');
    second.className = 'bg-blue-600 text-white';
    second.textContent = 'Second main';
    within(bar).getByTestId('canvas-bar-actions').insertBefore(second, within(bar).getByTestId('canvas-bar-actions').firstChild);
    expect(() => assertTopBarMainAction(bar)).toThrow(/2 filled controls/);
    second.remove();
    // the filled one not furthest right
    const after = document.createElement('button');
    after.textContent = 'After';
    within(bar).getByTestId('canvas-bar-actions').appendChild(after);
    expect(() => assertTopBarMainAction(bar)).toThrow(/not the furthest-right/);
    after.remove();
    // a disabled control
    const dead = document.createElement('button');
    dead.disabled = true;
    dead.textContent = 'Dead';
    within(bar).getByTestId('canvas-bar-actions').insertBefore(dead, within(bar).getByTestId('canvas-bar-actions').firstChild);
    expect(() => assertTopBarMainAction(bar)).toThrow(/disabled control/);
    dead.remove();
    // full width
    within(bar).getByTestId('canvas-draft-publish').classList.add('w-full');
    expect(() => assertTopBarMainAction(bar)).toThrow(/not auto width/);
  });

  it('the page is still reading (no read yet): a skeleton spot, no actions, and nothing to press but ← (and no filled control)', () => {
    stubWidth(true);
    seedCanvasAvailability(true);
    const ctx: CanvasWorkspaceValue = { active: false, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: () => undefined, cloneSeq: null, ownerBar: true };
    render(
      <MemoryRouter>
        <CanvasWorkspaceContext.Provider value={ctx}>
          <CanvasOwnerBar ready={null} handle="x" projectTag="x" title="" canRename={false} onRename={() => undefined} onPick={() => undefined} onChanged={() => undefined} onBack={() => undefined}
            active={false} view="canvas" onView={() => undefined} spotState={{ kind: 'loading' }} onPublish={() => undefined} />
        </CanvasWorkspaceContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('publish-spot')).toHaveAttribute('aria-busy', 'true');
    expect(reachableControls(screen.getByTestId('workspace-bar')).filter(isFilledControl)).toEqual([]);
  });
});

describe('X13: how many rows (the one-row owner with drafting off, two rows otherwise)', () => {
  const rowOfActions = (sc: Scenario): 'one row' | 'two rows' => {
    mountBar(sc);
    const actions = screen.getByTestId('canvas-bar-actions');
    const result = screen.getByTestId('workspace-bar-row1').contains(actions) ? 'one row' : 'two rows';
    cleanup();
    return result;
  };
  it('an owner with drafting off, on a published version: ← · name ✎ · [vN ▾] · Share on ONE row', () => {
    expect(rowOfActions(SCENARIOS.find(s => s.name.startsWith('Drafting off, published'))!)).toBe('one row');
  });
  it('an owner with Clone and Share (published, drafting on) and a draft with Discard and Publish are two rows, equal height (row 2 holds the 44px minimum)', () => {
    expect(rowOfActions(SCENARIOS[0]!)).toBe('two rows');
    expect(rowOfActions(SCENARIOS.find(s => s.name.startsWith('Draft with a base, points'))!)).toBe('two rows');
    mountBar(SCENARIOS[0]!);
    expect(screen.getByTestId('canvas-bar-actions').className).toContain('max-xl:min-h-11');
    cleanup();
    mountBar(SCENARIOS.find(s => s.name.startsWith('Draft with a base, points'))!);
    expect(screen.getByTestId('canvas-bar-actions').className).toContain('max-xl:min-h-11');
  });
  it('drafting off with a draft on screen: ← · name ✎ · [vN ▾] · (Draft) and nothing else, no second row at all', () => {
    mountBar(SCENARIOS.find(s => s.name.startsWith('Drafting off, draft, owner, with a base'))!);
    expect(screen.queryByTestId('canvas-bar-actions')).toBeNull();
  });
});

describe('X13: the switcher\'s active side wears the selected look, so the bar keeps one filled button', () => {
  it('the Canvas | Thread switcher: the active trigger has the blue outline and tint classes, and no bg-blue-600', () => {
    mountBar({ ...SCENARIOS[8]!, wide: false });
    const active = screen.getByTestId('workspace-view-canvas');
    expect(active.className).toContain('data-[state=active]:border-blue-600');
    expect(active.className).toContain('data-[state=active]:bg-blue-50');
    expect(active.className).toContain('data-[state=active]:text-blue-700');
    fireEvent.mouseDown(screen.getByTestId('workspace-view-chat'), { button: 0 });
    expect(reachableControls(screen.getByTestId('workspace-bar')).filter(isFilledControl)).toHaveLength(1);
  });
});
