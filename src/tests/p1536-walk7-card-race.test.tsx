/**
 * @file p1536-walk7-card-race.test.tsx
 * @description P1536 walkthrough 7, item 1: the card's reads are ordered. A quiet re-read after a confirmed rename and the card's first read share one
 * ordering: an older answer never replaces a newer one that was already shown, a failed re-read leaves the first read's answer to be shown, and a read
 * that answers after the card changed canvas or left writes nothing. A re-read really asks again (the cache is dropped first), never re-joining the old request.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const helpers = vi.hoisted(() => ({ loadAttachment: vi.fn() }));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/app/data/chat-ui-helpers', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-ui-helpers')), loadAttachment: helpers.loadAttachment }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: db.rpc } }));

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { clearArtifactAttachmentCache } from '@/app/pages/chat/artifact-attachment-cache';
import { canvasService } from '@/app/data/canvas-service';
import { renameCanvas } from '@/app/data/canvas-artifacts';

const deferred = <T,>() => {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const shared = (title: string, id = 'cv-1') => ({ available: true, kind: 'canvas', id, name: 'canvas', title, ownerId: 'me', ownerName: 'Ana', ownerSlug: 'ana', isOwner: true }) as never;
const rename = async (canvasId: string, title: string) => {
  db.rpc.mockResolvedValueOnce({ data: title, error: null });
  await act(async () => { await renameCanvas(canvasId, title); });
};
const card = () => screen.getByTestId('attachment-canvas');
const mount = async (id = 'cv-1') => {
  const view = render(<MemoryRouter><AttachmentCard kind="canvas" id={id} viewerId="me" /></MemoryRouter>);
  await act(async () => {});
  return view;
};
const again = (view: ReturnType<typeof render>, id: string) => view.rerender(<MemoryRouter><AttachmentCard kind="canvas" id={id} viewerId="me" /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  clearArtifactAttachmentCache();
});
afterEach(() => cleanup());

describe('1: a shared canvas card orders its reads', () => {
  it('first read held, rename, the re-read answers the new title, then the first answers the old one: the card stays on the new title', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const spy = vi.spyOn(canvasService, 'getChatArtifact').mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    await mount();
    await rename('cv-1', 'New title');
    expect(spy).toHaveBeenCalledTimes(2); // a new request: the dropped cache did not hand back the old in-flight one
    await act(async () => { second.resolve(shared('New title')); });
    expect(card()).toHaveTextContent('New title');
    await act(async () => { first.resolve(shared('Old title')); });
    expect(card()).toHaveTextContent('New title');
  });

  it('the re-read fails while the first read is still out: the first read\'s answer is still shown', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.spyOn(canvasService, 'getChatArtifact').mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    await mount();
    await rename('cv-1', 'New title');
    await act(async () => { second.reject(new Error('offline')); });
    await act(async () => { first.resolve(shared('Old title')); });
    expect(card()).toHaveTextContent('Old title');
  });

  it('a re-read that answers after the card moved to another canvas writes nothing', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.spyOn(canvasService, 'getChatArtifact')
      .mockReturnValueOnce(Promise.resolve(shared('Canvas one', 'cv-1')) as never)
      .mockReturnValueOnce(second.promise as never)
      .mockReturnValueOnce(first.promise as never);
    const view = await mount('cv-1');
    await rename('cv-1', 'Renamed one');
    again(view, 'cv-2');
    await act(async () => { first.resolve(shared('Canvas two', 'cv-2')); });
    await act(async () => { second.resolve(shared('Renamed one', 'cv-1')); });
    expect(card()).toHaveTextContent('Canvas two');
    expect(card()).not.toHaveTextContent('Renamed one');
  });

  it('leaving with a read pending: no write, no warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = deferred<unknown>();
    vi.spyOn(canvasService, 'getChatArtifact').mockReturnValueOnce(first.promise as never);
    const view = await mount();
    view.unmount();
    await act(async () => { first.resolve(shared('Old title')); });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('CONTROL: no rename, the first read shows as before', async () => {
    const first = deferred<unknown>();
    vi.spyOn(canvasService, 'getChatArtifact').mockReturnValueOnce(first.promise as never);
    await mount();
    expect(screen.queryByTestId('attachment-canvas')).toBeNull();
    await act(async () => { first.resolve(shared('Old title')); });
    expect(card()).toHaveTextContent('Old title');
  });
});

describe('1: the point and canvas-version card orders its reads the same way (no change needed)', () => {
  const item = (title: string) => ({ kind: 'canvas_version', id: 'ver-1', title: 'v1', tags: [], canvasVersion: { title, canvasId: 'cv-1', label: 'v1 · Nov 1, 2026', state: 'published', draft: false, href: null, openHref: null } });

  it('two re-reads in flight, the newer answers first, the older answers last: the newer stays', async () => {
    const r1 = deferred<unknown>();
    const r2 = deferred<unknown>();
    helpers.loadAttachment.mockResolvedValueOnce(item('Canvas')).mockReturnValueOnce(r1.promise).mockReturnValueOnce(r2.promise);
    render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" /></MemoryRouter>);
    await act(async () => {});
    await rename('cv-1', 'Second');
    await rename('cv-1', 'Third');
    await act(async () => { r2.resolve(item('Third')); });
    await act(async () => { r1.resolve(item('Second')); });
    expect(screen.getByTestId('attachment-canvas_version')).toHaveTextContent('Third');
  });
});
