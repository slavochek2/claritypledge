/**
 * @file p1536-x10-card-refresh.test.tsx
 * @description P1536 3c X10 (review round 2): the cards of a chat's canvas thread roots come from ONE batched read of their drafts (+ one of the versions), not a read per card.
 *  - 10 mounted cards are 2 requests; a hidden tab asks nothing (mount included)
 *  - a mounted card follows its draft being published or discarded elsewhere on a real signal (the tab returning, the same-tab event, a new reply), in the same element, without a
 *    skeleton, and only a card whose state CHANGED fetches its detail again; a closed card listens for nothing; a refused re-read keeps the card
 *  - a first read that is refused (or stalls for 20 s of a visible tab) is the chat's own error with Retry, and Retry reads again
 *  - a root with no draft the viewer can read shows the attached version's card (once), or "Not available to you"
 *  - a rename of the canvas reads the detail again, and the card shows the new title
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasDraft, CanvasVersionCardData, CanvasVersionOption } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasDraftsByThreads: vi.fn(), listMyCanvasVersions: vi.fn(), getProfileSlug: vi.fn(), getCanvasVersionCard: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/data/canvas-artifacts', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-artifacts')), listMyCanvases: vi.fn(async () => []) }));

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import { emitCanvasRenamed } from '@/app/data/canvas-rename-events';
import { resetCanvasRootStore } from '@/app/pages/chat/canvas-root-store';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

/** A chat that knows its viewer's slug (the real one does: its authors include the viewer), so no slug read is needed. */
const chatValue = { userId: 'me', authors: { me: { id: 'me', name: 'Ana', slug: 'ana', avatarUrl: null, avatarColor: null, hasPledged: false } } } as unknown as ChatContextValue;

const draft = (n: number, state: CanvasDraft['state'] = 'open'): CanvasDraft => ({
  id: `d-${n}`, versionId: `ver-d${n}`, canvasId: `cv-${n}`, baseVersionId: null, conversationId: 'conv', threadRootId: `root-${n}`, state, runCount: 1, revision: 1, closedAt: null,
  canvasName: `canvas_${n}`, versionName: `canvas_d${n}`,
});
const version = (n: number, title: string | null = null): CanvasVersionOption => ({ id: `ver-d${n}`, canvasId: `cv-${n}`, canvasName: `canvas_${n}`, canvasTitle: title, name: `canvas_d${n}`, seq: 1, publishedAt: '2026-10-05T10:00:00Z', hasOpenDraft: false });

let current: Map<string, CanvasDraft>;
let versions: CanvasVersionOption[];
const idle = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
const requests = () => svc.getCanvasDraftsByThreads.mock.calls.length + svc.listMyCanvasVersions.mock.calls.length + svc.getProfileSlug.mock.calls.length;
const cards = (n: number, count = 2) => (
  <MemoryRouter>
    <ChatContext.Provider value={chatValue}>
      {Array.from({ length: n }, (_v, i) => <AttachmentCard key={i} kind="canvas_version" id={`ver-${i + 1}`} viewerId="me" rootId={`root-${i + 1}`} count={count} />)}
    </ChatContext.Provider>
  </MemoryRouter>
);
const mount = async (n = 1, count = 2) => {
  const view = render(cards(n, count));
  await idle();
  return view;
};

beforeEach(() => {
  resetCanvasRootStore();
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  current = new Map(Array.from({ length: 10 }, (_v, i) => [`root-${i + 1}`, draft(i + 1)]));
  versions = [version(1)];
  svc.getCanvasDraftsByThreads.mockImplementation(async (ids: string[]) => new Map(ids.filter((i) => current.has(i)).map((i) => [i, current.get(i)!])));
  svc.listMyCanvasVersions.mockImplementation(async () => versions);
  svc.getProfileSlug.mockResolvedValue('ana');
  svc.getCanvasVersionCard.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  resetCanvasRootStore();
  vi.useRealTimers();
});

describe('the request cost', () => {
  it('10 cards are 2 requests at mount (one for their drafts, one for the versions), each card is drawn from them', async () => {
    versions = Array.from({ length: 10 }, (_v, i) => version(i + 1));
    await mount(10);
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    expect(svc.getCanvasDraftsByThreads.mock.calls[0]![0]).toHaveLength(10);
    expect(requests()).toBe(2); // the chat knows the viewer's slug, so nothing else is read
    expect(svc.getProfileSlug).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('attachment-canvas_version')).toHaveLength(10);
    expect(screen.getAllByTestId('canvas-draft-tag')).toHaveLength(10);
  });

  it('a hidden tab asks nothing at mount, and the cards are drawn when it returns', async () => {
    setVisibility('hidden');
    await mount(3);
    expect(requests()).toBe(0);
    expect(screen.queryByTestId('attachment-canvas_version')).toBeNull();
    await act(async () => setVisibility('visible'));
    await idle();
    expect(screen.getAllByTestId('attachment-canvas_version')).toHaveLength(3);
  });
});

describe('item 1: a mounted card follows its draft being published or discarded elsewhere', () => {
  it('open card, thread published elsewhere, the tab comes back: published (same element, View, no tag), ONE drafts query + the detail', async () => {
    await mount(3);
    expect(screen.getAllByTestId('canvas-draft-tag')).toHaveLength(3);
    const first = screen.getAllByTestId('attachment-canvas_version')[0]!;
    vi.clearAllMocks();
    versions = [version(1), { ...version(1), id: 'ver-d1' }];
    current.set('root-1', draft(1, 'published'));
    await act(async () => setVisibility('visible'));
    await idle();
    expect(screen.getAllByTestId('attachment-canvas_version')[0]).toBe(first);
    expect(first.getAttribute('data-state')).toBe('published');
    expect(screen.getAllByTestId('canvas-draft-tag')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /^View canvas/ })).toHaveLength(1);
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    expect(requests()).toBe(2); // the drafts of the three roots + the versions, for the one that changed
  });

  it('nothing changed on a tab return: ONE request, no skeleton, the cards untouched', async () => {
    await mount(3);
    const before = screen.getAllByTestId('attachment-canvas_version');
    vi.clearAllMocks();
    await act(async () => setVisibility('visible'));
    await idle();
    expect(requests()).toBe(1);
    expect(screen.getAllByTestId('attachment-canvas_version')).toEqual(before);
    expect(screen.queryByTestId('attachment-card-loading')).toBeNull();
  });

  it('the same-tab event for its draft re-reads that root; another draft\'s and "updated" do not', async () => {
    await mount(2);
    vi.clearAllMocks();
    await act(async () => emitCanvasDraftEvent({ kind: 'published', draftId: 'another' }));
    await act(async () => emitCanvasDraftEvent({ kind: 'updated', draftId: 'd-1' }));
    await idle();
    expect(requests()).toBe(0);
    current.set('root-1', draft(1, 'discarded'));
    await act(async () => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    await idle();
    expect(screen.getAllByTestId('attachment-canvas_version')[0]!.getAttribute('data-state')).toBe('discarded');
    expect(screen.getAllByTestId('attachment-canvas_version')[0]).toHaveTextContent('Discarded draft');
  });

  it('a new reply (its count changes) re-reads; the same count does not', async () => {
    const view = await mount(1, 2);
    vi.clearAllMocks();
    current.set('root-1', draft(1, 'published'));
    view.rerender(cards(1, 2));
    await idle();
    expect(requests()).toBe(0);
    view.rerender(cards(1, 3));
    await idle();
    expect(screen.getByTestId('attachment-canvas_version').getAttribute('data-state')).toBe('published');
  });

  it('a CLOSED card (published or discarded) never changes again, so it asks nothing on a tab return, an event or a reply', async () => {
    current.set('root-1', draft(1, 'published'));
    const view = await mount(1, 2);
    vi.clearAllMocks();
    await act(async () => setVisibility('visible'));
    await act(async () => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    view.rerender(cards(1, 3));
    await idle();
    expect(requests()).toBe(0);
  });

  it('a refused re-read keeps the card as it was (no error state in its place)', async () => {
    await mount(1);
    svc.getCanvasDraftsByThreads.mockRejectedValueOnce(new Error('offline'));
    await act(async () => setVisibility('visible'));
    await idle();
    expect(screen.getByTestId('canvas-draft-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-error')).toBeNull();
  });

  it('a rename of the canvas reads the detail again, and the card shows the new title (in the same element)', async () => {
    versions = [version(1, null)];
    await mount(1);
    const el = screen.getByTestId('attachment-canvas_version');
    expect(el).toHaveTextContent('Canvas 1');
    versions = [version(1, 'Acme Bakery Plan')];
    await act(async () => emitCanvasRenamed('cv-1'));
    await idle();
    expect(screen.getByTestId('attachment-canvas_version')).toBe(el);
    expect(el).toHaveTextContent('Acme Bakery Plan');
  });
});

describe('a card that cannot be drawn', () => {
  it('a refused first read is the chat\'s own error with Retry, and Retry reads again and the card comes', async () => {
    svc.getCanvasDraftsByThreads.mockRejectedValueOnce(new Error('offline'));
    await mount(1);
    expect(screen.getByTestId('attachment-error')).toHaveTextContent('Couldn\'t load this canvas');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await idle();
    expect(screen.getByTestId('canvas-draft-tag')).toBeInTheDocument();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(2);
  });

  it('a first read that never answers is a skeleton, and after 20 s of a VISIBLE tab the same error with Retry (every wait ends)', async () => {
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise(() => undefined));
    vi.useFakeTimers();
    render(cards(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    expect(screen.getByTestId('attachment-card-loading')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(19_000); });
    expect(screen.queryByTestId('attachment-error')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(screen.getByTestId('attachment-error')).toBeInTheDocument();
  });

  it('a root with no draft the viewer can read shows the attached version\'s card (read once)', async () => {
    current = new Map();
    const published: CanvasVersionCardData = { title: 'Canvas 4', label: 'v1 · Nov 1, 2026', state: 'published', draft: false, href: '/x', openHref: '/x', seq: 1 };
    svc.getCanvasVersionCard.mockResolvedValue(published);
    await mount(1);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v1 · Nov 1, 2026');
    expect(svc.getCanvasVersionCard).toHaveBeenCalledTimes(1);
    expect(svc.getCanvasVersionCard).toHaveBeenCalledWith('ver-1', 'me');
  });

  it('and when that is not the viewer\'s either: "Not available to you"', async () => {
    current = new Map();
    await mount(1);
    expect(screen.getByText('Not available to you')).toBeInTheDocument();
  });
});
