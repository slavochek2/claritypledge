/**
 * @file p1536-x10-card-refresh.test.tsx
 * @description P1536 3c X10, review fix 1: a canvas thread root's card, kept mounted in the mirror chat, learns that its draft was published or discarded elsewhere
 * from a REAL signal (the same-tab canvas event for its draft, the tab returning, a new reply), and re-reads QUIETLY: the card stays up, in the same element, until the
 * new answer arrives (no skeleton); a refused re-read changes nothing; a hidden tab makes no request; another draft's event says nothing.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const helpers = vi.hoisted(() => ({ loadAttachment: vi.fn() }));
vi.mock('@/app/data/chat-ui-helpers', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-ui-helpers')), loadAttachment: helpers.loadAttachment }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';

const OPEN = '/p/ana/canvas/canvas_4?v=canvas_dd2&ws=1';
const V2 = '/p/ana/canvas/canvas_4?v=canvas_dd2';
const data = (over: Partial<CanvasVersionCardData>): CanvasVersionCardData => ({
  title: 'Canvas 4', canvasId: 'cv-1', label: 'Draft', state: 'draft', draft: true, nextSeq: 2, href: OPEN, openHref: OPEN, hasThread: true, draftId: 'd-1', ...over,
});
const openCard = data({});
const publishedCard = data({ label: 'v2 · Nov 2, 2026', state: 'published', draft: false, seq: 2, href: V2, openHref: V2, nextSeq: undefined });
const item = (card: CanvasVersionCardData) => ({ kind: 'canvas_version', id: 'ver-1', title: 'v', tags: [], canvasVersion: card });

const card = () => screen.getByTestId('attachment-canvas_version');
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
const mount = async (refreshKey = 2) => {
  const view = render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" rootId="root-1" refreshKey={refreshKey} /></MemoryRouter>);
  await act(async () => {});
  return view;
};

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  helpers.loadAttachment.mockResolvedValue(item(openCard));
});
afterEach(cleanup);

describe('item 1: a mounted card follows its draft being published or discarded elsewhere', () => {
  it('open card, thread published elsewhere, the tab comes back: the card reads published (same element, View, no tag)', async () => {
    await mount();
    expect(screen.getByTestId('canvas-draft-tag')).toBeInTheDocument();
    const before = card();
    helpers.loadAttachment.mockResolvedValue(item(publishedCard));
    await act(async () => setVisibility('visible'));
    expect(card()).toBe(before);
    expect(screen.queryByTestId('canvas-draft-tag')).toBeNull();
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v2 · Nov 2, 2026');
    expect(screen.getByRole('link', { name: /^View canvas/ })).toHaveAttribute('href', V2);
    expect(helpers.loadAttachment).toHaveBeenLastCalledWith('canvas_version', 'ver-1', 'me', 'root-1');
  });

  it('the same-tab event for its draft re-reads; another draft\'s, and "updated", do not', async () => {
    await mount();
    helpers.loadAttachment.mockResolvedValue(item(publishedCard));
    await act(async () => emitCanvasDraftEvent({ kind: 'published', draftId: 'another' }));
    await act(async () => emitCanvasDraftEvent({ kind: 'updated', draftId: 'd-1' }));
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
    await act(async () => emitCanvasDraftEvent({ kind: 'published', draftId: 'd-1' }));
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('canvas-draft-tag')).toBeNull();
  });

  it('a new reply (its count changes) re-reads; the same count does not', async () => {
    const view = await mount(2);
    helpers.loadAttachment.mockResolvedValue(item(publishedCard));
    view.rerender(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" rootId="root-1" refreshKey={2} /></MemoryRouter>);
    await act(async () => {});
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
    view.rerender(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" rootId="root-1" refreshKey={3} /></MemoryRouter>);
    await act(async () => {});
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v2 · Nov 2, 2026');
  });

  it('a hidden tab makes no request, and reads when it comes back (rule 3)', async () => {
    await mount();
    act(() => setVisibility('hidden'));
    helpers.loadAttachment.mockResolvedValue(item(publishedCard));
    await act(async () => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility('visible'));
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(2);
  });

  it('a refused re-read keeps the card as it was (no error state in its place)', async () => {
    await mount();
    helpers.loadAttachment.mockRejectedValue(new Error('offline'));
    await act(async () => setVisibility('visible'));
    expect(screen.getByTestId('canvas-draft-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-error')).toBeNull();
  });

  it('a CLOSED card (published or discarded) never changes again, so it listens for nothing: no request on tab return, event or reply', async () => {
    helpers.loadAttachment.mockResolvedValue(item(publishedCard));
    const view = await mount(2);
    await act(async () => setVisibility('visible'));
    await act(async () => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    view.rerender(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" rootId="root-1" refreshKey={3} /></MemoryRouter>);
    await act(async () => {});
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
  });

  it('a card with no thread (a quote, or a root with no draft) listens for nothing: no draft id, so no event re-reads it', async () => {
    helpers.loadAttachment.mockResolvedValue(item(data({ hasThread: undefined, draftId: undefined, state: 'published', draft: false, label: 'v1 · Nov 1, 2026' })));
    await mount();
    await act(async () => emitCanvasDraftEvent({ kind: 'published', draftId: 'd-1' }));
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
  });
});
