/**
 * @file p1536-walk6-card-rename.test.tsx
 * @description P1536 walkthrough 6, item 4: after a rename the database CONFIRMED, a canvas card on screen shows the new title without remounting
 * (the old card stays up until the new read answers, no skeleton), and cached card reads of that canvas are dropped. A refused rename changes nothing,
 * and a card of another canvas does not re-read.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const helpers = vi.hoisted(() => ({ loadAttachment: vi.fn() }));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/app/data/chat-ui-helpers', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-ui-helpers')), loadAttachment: helpers.loadAttachment }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: db.rpc } }));

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { loadArtifact, clearArtifactAttachmentCache } from '@/app/pages/chat/artifact-attachment-cache';
import { canvasService } from '@/app/data/canvas-service';
import { renameCanvas } from '@/app/data/canvas-artifacts';

const data = (title: string, canvasId = 'cv-1'): CanvasVersionCardData => ({
  title, canvasId, label: 'v1 · Nov 1, 2026', state: 'published', draft: false, href: '/p/ana/canvas/canvas', openHref: '/p/ana/canvas/canvas',
});
const item = (title: string, canvasId?: string) => ({ kind: 'canvas_version', id: 'ver-1', title: 'v1', tags: [], canvasVersion: data(title, canvasId) });
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((a) => { resolve = a; });
  return { promise, resolve };
};
const card = () => screen.getByTestId('attachment-canvas_version');
const mount = async () => {
  render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" /></MemoryRouter>);
  await act(async () => {});
};
const rename = async (canvasId: string, title: string) => {
  db.rpc.mockResolvedValueOnce({ data: title, error: null });
  await act(async () => { await renameCanvas(canvasId, title); });
};

beforeEach(() => {
  vi.resetAllMocks();
  clearArtifactAttachmentCache();
});
afterEach(() => cleanup());

describe('4: a canvas version card follows a confirmed rename', () => {
  it('the card on screen re-reads and shows the new title in the same element; the old one stays up meanwhile (no skeleton)', async () => {
    const second = deferred<unknown>();
    helpers.loadAttachment.mockResolvedValueOnce(item('Canvas')).mockReturnValueOnce(second.promise);
    await mount();
    expect(card()).toHaveTextContent('Canvas');
    const before = card();
    await rename('cv-1', 'Acme Bakery Plan');
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status', { name: 'Loading attachment' })).toBeNull();
    expect(card()).toHaveTextContent('Canvas');
    await act(async () => { second.resolve(item('Acme Bakery Plan')); });
    expect(card()).toHaveTextContent('Acme Bakery Plan');
    expect(card()).toBe(before);
  });

  it('a refused rename changes nothing: no re-read, the card is as it was', async () => {
    helpers.loadAttachment.mockResolvedValue(item('Canvas'));
    await mount();
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'not yours' } });
    await act(async () => { await renameCanvas('cv-1', 'Acme').catch(() => undefined); });
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
    expect(card()).toHaveTextContent('Canvas');
  });

  it('CONTROL: the card of another canvas does not re-read', async () => {
    helpers.loadAttachment.mockResolvedValue(item('Canvas', 'cv-1'));
    await mount();
    await rename('cv-2', 'Something else');
    expect(helpers.loadAttachment).toHaveBeenCalledTimes(1);
  });

  it('a re-read that fails keeps the old card (no error state in its place)', async () => {
    helpers.loadAttachment.mockResolvedValueOnce(item('Canvas')).mockRejectedValueOnce(new Error('offline'));
    await mount();
    await rename('cv-1', 'Acme');
    expect(card()).toHaveTextContent('Canvas');
    expect(screen.queryByTestId('attachment-error')).toBeNull();
  });
});

describe('4: shared canvas cards and the read cache', () => {
  const chatArtifact = (title: string) => ({ available: true, kind: 'canvas', id: 'cv-1', name: 'canvas', title, ownerId: 'me', ownerName: 'Ana', ownerSlug: 'ana', isOwner: true }) as never;

  it('a cached read of the renamed canvas is dropped, one of another canvas is kept', async () => {
    const spy = vi.spyOn(canvasService, 'getChatArtifact').mockResolvedValue(chatArtifact('Canvas'));
    await loadArtifact('canvas', 'cv-1', 'me');
    await loadArtifact('canvas', 'cv-1', 'me');
    await loadArtifact('canvas', 'cv-2', 'me');
    expect(spy).toHaveBeenCalledTimes(2); // cv-1 read once (shared), cv-2 once
    await rename('cv-1', 'Acme');
    await loadArtifact('canvas', 'cv-1', 'me');
    await loadArtifact('canvas', 'cv-2', 'me');
    expect(spy).toHaveBeenCalledTimes(3); // cv-1 read again, cv-2 still cached
    spy.mockRestore();
  });

  it('a shared canvas card on screen shows the new title after a confirmed rename', async () => {
    const spy = vi.spyOn(canvasService, 'getChatArtifact').mockResolvedValueOnce(chatArtifact('Canvas')).mockResolvedValueOnce(chatArtifact('Acme Bakery Plan'));
    render(<MemoryRouter><AttachmentCard kind="canvas" id="cv-1" viewerId="me" /></MemoryRouter>);
    await act(async () => {});
    expect(screen.getByTestId('attachment-canvas')).toHaveTextContent('Canvas');
    await rename('cv-1', 'Acme Bakery Plan');
    expect(screen.getByTestId('attachment-canvas')).toHaveTextContent('Acme Bakery Plan');
    spy.mockRestore();
  });
});
