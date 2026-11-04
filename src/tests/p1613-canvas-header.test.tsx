/**
 * @file p1613-canvas-header.test.tsx
 * @description P1613: Compare positions in the header row (the table's `compare`, drawn by the owner's bar), absent on a draft and a pending Clone; Cancel in the shared secondary
 * pill; the address moves into a draft or pending Clone dropping `with` in the same update (and pushing, so Back returns to the comparison); Add to chat's icon-only form.
 * Expectations are typed from the spec, not read back from the code. jsdom has no layout: the container-query width, the 44px size and the rows are checked in a browser.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { headerRow, screenOf, type HeaderInput } from '@/app/components/canvas/canvas-header-model';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { lacksSecondaryPill } from './p1536-pill-assert';

vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getAccess: vi.fn(), getShareTargets: vi.fn(), renameCanvas: vi.fn() } }));
vi.mock('@/app/data/canvas-draft-service', async orig => ({ ...(await orig<object>()), getCanvasDraftByThread: vi.fn(), getLatestCanvasRun: vi.fn() }));
vi.mock('@/app/data/chat-service', async orig => ({ ...(await orig<object>()), getThreadStats: vi.fn() }));

import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import { AddToChatButton } from '@/app/components/canvas/canvas-add-to-chat';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { resetCanvasAvailability, seedCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { useCloneCanvas } from '@/app/pages/canvas/use-clone-canvas';
import { useWorkspaceNav } from '@/app/pages/canvas/use-workspace-nav';
import { useCloneIntent } from '@/app/pages/canvas/use-clone-intent';
import { CLONE_INTENT_KEY } from '@/lib/canvas-hrefs';
import { CanvasHeader } from '@/app/components/canvas/canvas-header';
import * as draftService from '@/app/data/canvas-draft-service';
import * as chatService from '@/app/data/chat-service';

const BASE: HeaderInput = {
  owner: true, drafting: true, onScreen: 'published', hasPublished: true, hasBase: false, workspace: false, draftOpen: false,
  spot: 'nothing', busy: false, atCap: false, threadButton: false, goToDraft: false, comparable: true,
};

describe('P1613: the table decides Compare (headerRow.compare)', () => {
  it('a published version with someone to compare with: Compare, for the owner and for a reader, and never the filled spot', () => {
    for (const owner of [true, false]) {
      const row = headerRow({ ...BASE, owner });
      expect(row.compare).toBe(true);
      expect(row.filled === null || row.filled === 'share').toBe(true);
    }
    expect(headerRow(BASE).filled).toBe('share'); // Share stays the one filled control
  });
  it('absent on a draft and on a pending Clone, whatever else is true', () => {
    for (const onScreen of ['draft', 'pending'] as const) {
      expect(headerRow({ ...BASE, onScreen, workspace: true, draftOpen: true, hasBase: true }).compare).toBe(false);
    }
  });
  it('nobody to compare with, or nothing published: absent, not disabled', () => {
    expect(headerRow({ ...BASE, comparable: false }).compare).toBe(false);
    expect(headerRow({ ...BASE, hasPublished: false }).compare).toBe(false);
  });
  it('CONTROL: the same inputs with only onScreen flipped to published bring it back', () => {
    expect(headerRow({ ...BASE, onScreen: 'pending', workspace: true }).compare).toBe(false);
    expect(headerRow({ ...BASE, onScreen: 'published', workspace: true }).compare).toBe(true);
  });
  it('screenOf: ws=1 on a published version with no draft IS a pending Clone (the page ignores `with` there)', () => {
    const ready = { isOwner: true, version: 'v1', draft: null, versions: [{ name: 'v1', draft: false, seq: 1 }] } as unknown as CanvasReady;
    expect(screenOf({ ready, drafting: true, workspace: true, pendingSeq: null })).toBe('pending');
    expect(screenOf({ ready, drafting: true, workspace: false, pendingSeq: null })).toBe('published');
  });
});

const NOW = '2000-01-01T00:00:00.000Z';
const V1 = { name: 'canvas_d111111', createdAt: NOW, seq: 1, publishedAt: NOW, draft: false };
const DRAFT_V = { name: 'canvas_dabc123', createdAt: NOW, seq: null, publishedAt: null, draft: true };
const readyOf = (onScreen: 'draft' | 'published', draftOpen = onScreen === 'draft'): CanvasReady => ({
  status: 'ready', ownerId: 'user-id-1', ownerName: 'Test Owner', owner: { name: 'Test Owner', hasPledged: false }, points: [], stories: new Map(), positions: new Map(), canvasId: 'c1', title: null,
  visibility: 'private', isOwner: true, generalAccess: 'restricted', via: null, audience: [], addedStoryIds: [], publishedNone: false,
  version: onScreen === 'draft' ? DRAFT_V.name : V1.name, versions: [...(draftOpen ? [DRAFT_V] : []), V1],
  draft: draftOpen ? { id: 'd1', version: DRAFT_V.name, questions: {}, threadRootId: 'r1', conversationId: 'cv1', baseSeq: 1, runCount: 1, revision: 1, changedBoxes: [] } : null,
}) as unknown as CanvasReady;

const SAM = { id: 'sam', name: 'Sam Example', hasPledged: false, count: 3 };
const compareProp = { base: { name: 'You', hasPledged: false }, others: [SAM], withPerson: null, onCompare: () => undefined };

function mountBar(ready: CanvasReady, o: { cloneSeq?: number | null; ws?: boolean; compare?: typeof compareProp | undefined } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('1280'), addEventListener: () => undefined, removeEventListener: () => undefined, media: q }));
  seedCanvasAvailability(true);
  const ctx: CanvasWorkspaceValue = { active: !!o.ws, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: () => undefined, cloneSeq: o.cloneSeq ?? null, ownerBar: true };
  return render(
    <MemoryRouter>
      <CanvasWorkspaceContext.Provider value={ctx}>
        <CanvasOwnerBar
          ready={ready} handle="h" projectTag="example_canvas" title="Example" canRename onRename={() => undefined} onPick={() => undefined}
          onChanged={() => undefined} onBack={() => undefined} active={!!o.ws} view="canvas" onView={() => undefined}
          spotState={{ kind: 'nothing' }} onPublish={() => undefined} compare={'compare' in o ? o.compare : compareProp}
          cancel={<button type="button" data-testid="canvas-cancel-clone" className={CANVAS_SECONDARY_PILL}>Cancel</button>}
        />
      </CanvasWorkspaceContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); resetCanvasAvailability(); vi.unstubAllGlobals(); });

describe('P1613: the owner\'s bar draws Compare beside the version', () => {
  it('published: Compare is in the bar, right after the version picker, with no row of its own', () => {
    mountBar(readyOf('published'));
    const bar = screen.getByTestId('workspace-bar');
    const cmp = screen.getByTestId('canvas-compare-picker');
    expect(bar.contains(cmp)).toBe(true);
    expect(screen.getByTestId('canvas-bar-compare').parentElement).toBe(bar);
    expect(screen.getByRole('combobox', { name: 'Compare positions with' })).toBeInTheDocument();
  });
  it('a draft, and a pending Clone (cloneSeq, and ws=1 with no draft): no Compare at all', () => {
    mountBar(readyOf('draft'), { ws: true });
    expect(screen.queryByTestId('canvas-compare-picker')).toBeNull();
    cleanup();
    mountBar(readyOf('published', false), { ws: true, cloneSeq: 1 });
    expect(screen.queryByTestId('canvas-compare-picker')).toBeNull();
    cleanup();
    mountBar(readyOf('published', false), { ws: true });
    expect(screen.queryByTestId('canvas-compare-picker')).toBeNull();
  });
  it('nobody to compare with: absent (CONTROL: the same bar with someone shows it)', () => {
    mountBar(readyOf('published'), { compare: { ...compareProp, others: [] } });
    expect(screen.queryByTestId('canvas-compare-picker')).toBeNull();
    cleanup();
    mountBar(readyOf('published'));
    expect(screen.getByTestId('canvas-compare-picker')).toBeInTheDocument();
  });
  it('Cancel wears the shared secondary pill; the status "Nothing to publish yet" does not', () => {
    mountBar(readyOf('published', false), { ws: true, cloneSeq: 1 });
    expect(lacksSecondaryPill(screen.getByTestId('canvas-cancel-clone'))).toEqual([]);
    const status = screen.getByText('Nothing to publish yet');
    expect(lacksSecondaryPill(status).length).toBeGreaterThan(0); // CONTROL: the same check fails for the status
    expect(status.className).not.toContain('border-blue-600');
  });
});

/** The hooks read `with` from the address: a router at `/c?<query>` around them. */
const at = (query: string) => ({ wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[`/c?${query}`]}>{children}</MemoryRouter> });

describe('P1613: a comparison never goes into a draft or a pending Clone (the address, in the same update)', () => {
  const run = (updater: (p: URLSearchParams) => URLSearchParams, start: string) => updater(new URLSearchParams(start));

  it('useWorkspaceNav.openedDraft drops `with` in its own update and pushes when a comparison was on (Back returns to it); replaces as before when none was', () => {
    for (const comparing of [true, false]) {
      const setParams = vi.fn();
      const { result } = renderHook(() => useWorkspaceNav({ setParams, state: null, openPanel: () => undefined, setView: () => undefined, navigate: vi.fn() }), at(comparing ? 'with=sam' : 'v=a'));
      act(() => result.current.openedDraft('canvas_dabc123'));
      const [updater, options] = setParams.mock.calls[0]!;
      const next = run(updater, 'v=canvas_d111111&with=sam');
      expect(next.has('with')).toBe(false);
      expect(next.get('v')).toBe('canvas_dabc123');
      expect(next.get('ws')).toBe('1');
      expect(options.replace).toBe(!comparing);
    }
  });
  it('useWorkspaceNav.pickVersion drops `with` only for a draft version (already a pushed entry)', () => {
    const setParams = vi.fn();
    const { result } = renderHook(() => useWorkspaceNav({ setParams, state: null, openPanel: () => undefined, setView: () => undefined, navigate: vi.fn(), isDraft: v => v === 'canvas_dabc123' }), at('with=sam'));
    act(() => result.current.pickVersion('canvas_dabc123'));
    expect(run(setParams.mock.calls[0]![0], 'v=canvas_d111111&with=sam').has('with')).toBe(false);
    expect(setParams.mock.calls[0]![1].replace).toBeUndefined();
    act(() => result.current.pickVersion('canvas_d222222'));
    expect(run(setParams.mock.calls[1]![0], 'v=canvas_d111111&with=sam').get('with')).toBe('sam'); // CONTROL: another published version keeps it
  });
  it('Clone (entering the pending state) drops `with` in the same update and pushes; Cancel replaces', () => {
    const setParams = vi.fn();
    const ready = readyOf('published', false);
    const { result } = renderHook(() => useCloneCanvas({ eligible: true, active: false, ready, setParams, state: null, openDraft: () => undefined, reload: () => undefined }), at('v=a&with=sam'));
    act(() => result.current.clone!());
    const [updater, options] = setParams.mock.calls[0]!;
    const next = run(updater, 'v=canvas_d111111&with=sam');
    expect(next.has('with')).toBe(false);
    expect(next.get('ws')).toBe('1');
    expect(options.replace).toBe(false);
    act(() => result.current.cancel());
    expect(setParams.mock.calls.at(-1)![1].replace).toBe(true);
  });
});

describe('P1613: Add to chat collapses to its icon in a narrow box', () => {
  const ctx = (addToChat: ((t: string) => void) | null): CanvasWorkspaceValue => ({ active: true, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: true, addToChat });
  it('keeps the label as the tooltip and the accessible name, is at least 44px wide and tall, and taps through', () => {
    const tap = vi.fn();
    render(<CanvasWorkspaceContext.Provider value={ctx(tap)}><AddToChatButton tag="canvas:problem" title="Problem" /></CanvasWorkspaceContext.Provider>);
    const b = screen.getByRole('button', { name: 'Add to chat, Problem' });
    expect(b).toHaveAttribute('title', 'Add to chat');
    expect(b.className).toContain('min-w-11');
    expect(b.className).toContain('min-h-11');
    const label = screen.getByText('Add to chat');
    expect(label.className).toContain('sr-only'); // hidden visually below the container width, read by screen readers
    expect(label.className).toContain('[@container(min-width:21rem)]:not-sr-only'); // shown from 21rem of the box header up
    expect(label.className).toContain('[@container(min-width:21rem)]:!whitespace-nowrap'); // not-sr-only sets white-space: normal, so the label would wrap
    expect(b.className).toMatch(/(^|\s)relative(\s|$)/); // the sr-only span is absolute: it needs this button as its containing block
    fireEvent.click(b);
    expect(tap).toHaveBeenCalledWith('canvas:problem');
  });
  it('readers see nothing', () => {
    render(<CanvasWorkspaceContext.Provider value={ctx(null)}><AddToChatButton tag="canvas:problem" title="Problem" /></CanvasWorkspaceContext.Provider>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('P1613 review: Back to a comparison ends the pending Clone', () => {
  it('Start over from a draft of another base (ws=1&v=v1&with=sam): when Back brings `with` back, the Clone intent is gone, so the published row (and Compare) returns', async () => {
    vi.mocked(draftService.getLatestCanvasRun).mockResolvedValue(null as never);
    vi.mocked(chatService.getThreadStats).mockResolvedValue(new Map() as never);
    const base = readyOf('published', true); // another draft is open (baseSeq 1 here; make it another base)
    const ready = { ...base, draft: { ...base.draft!, baseSeq: 7, runCount: 0 } } as CanvasReady;
    const setParams = vi.fn();
    let api!: ReturnType<typeof useCloneCanvas> & { go: (to: string) => void };
    function Probe() {
      const go = useNavigate();
      api = { ...useCloneCanvas({ eligible: true, active: true, ready, setParams, state: null, openDraft: () => undefined, reload: () => undefined }), go };
      return null;
    }
    render(<MemoryRouter initialEntries={['/c?v=a&ws=1&with=sam']}><Probe /></MemoryRouter>);
    await act(async () => { api.clone!(); });
    expect(api.pending).not.toBeNull(); // pending after Clone over an untouched draft of another base
    act(() => api.go('/c?v=a&ws=1')); // the address the move pushed: no `with`
    expect(api.pending).not.toBeNull();
    act(() => api.go('/c?v=a&ws=1&with=sam')); // browser Back: `with` is in the address again
    expect(api.pending).toBeNull();
  });
});

describe('P1613 review: the reader-style header\'s picker drops `with` for a draft', () => {
  it('an owner without the bar who picks their draft loses `with` in the same update; a published pick keeps it', () => {
    const ready = readyOf('published', true);
    const onParams = vi.fn();
    render(
      <MemoryRouter>
        <CanvasHeader ready={ready} failed={false} handle="h" projectTag="example_canvas" ownerIsAgent={false} identityPending={false}
          compare={{ base: compareProp.base, others: [SAM], withPerson: SAM }} sharedLabel={null} onParams={onParams} onChanged={() => undefined} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByTestId('canvas-version-select'), { target: { value: DRAFT_V.name } });
    expect(onParams).toHaveBeenLastCalledWith({ v: DRAFT_V.name, point: null, box: null, with: null }, true, false);
    fireEvent.change(screen.getByTestId('canvas-version-select'), { target: { value: V1.name } });
    expect(onParams.mock.calls.at(-1)![0]).not.toHaveProperty('with'); // CONTROL
  });
});

describe('P1613 review: the Clone intent (the mirror chat\'s +) also leaves a comparison behind', () => {
  it('an intent that arrives with `with` in the address runs clone(): `with` is dropped in that move, which pushes an entry', async () => {
    const ready = readyOf('published', false);
    const setParams = vi.fn();
    function Probe() {
      const clone = useCloneCanvas({ eligible: true, active: false, ready, setParams, state: null, openDraft: () => undefined, reload: () => undefined });
      useCloneIntent({ state: { [CLONE_INTENT_KEY]: true }, resolved: true, ready, clone: clone.clone, setParams: setParams as never });
      return null;
    }
    render(<MemoryRouter initialEntries={['/c?v=canvas_d111111&with=sam']}><Probe /></MemoryRouter>);
    await act(async () => undefined);
    const enter = setParams.mock.calls.find(([u, o]) => typeof u === 'function' && (u as (p: URLSearchParams) => URLSearchParams)(new URLSearchParams('v=a&with=sam')).get('ws') === '1' && o.replace === false);
    expect(enter, 'the move into the pending Clone pushes an entry and drops `with`').toBeDefined();
    expect((enter![0] as (p: URLSearchParams) => URLSearchParams)(new URLSearchParams('v=a&with=sam')).has('with')).toBe(false);
  });
});
