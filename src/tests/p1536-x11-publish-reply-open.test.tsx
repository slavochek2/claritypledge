/**
 * @file p1536-x11-publish-reply-open.test.tsx
 * @description P1536 S3c.15 / review fix 3 (the call sites of the thread-read): the "Open canvas" under a Publish reply is an optional extra, never a wait. While its read
 * is out, or after it was refused, it shows nothing (the closed footer below it carries the same button with its own Retry); a late answer brings it. A card that cannot
 * read has the chat's own Retry, and Retry reads again through the thread.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasRootCard: vi.fn(), getCanvasDraftsByThreads: vi.fn(), listMyCanvasVersions: vi.fn(), getProfileSlug: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/data/canvas-artifacts', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-artifacts')), listMyCanvases: vi.fn(async () => []) }));

import { PublishReplyOpen } from '@/app/pages/chat/PublishReplyOpen';
import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { resetCanvasRootStore } from '@/app/pages/chat/canvas-root-store';

const HREF = '/p/ana/canvas/canvas_4?v=canvas_dd3';
const published = { title: 'Canvas', label: 'v3 · Nov 2, 2026', state: 'published', draft: false, href: HREF, openHref: HREF, seq: 3, hasThread: true, draftId: 'd-1' } as CanvasVersionCardData;
const mount = () => render(<MemoryRouter><PublishReplyOpen rootId="root-1" versionId="ver-1" viewerId="me" /></MemoryRouter>);

beforeEach(() => { resetCanvasRootStore(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); resetCanvasRootStore(); });

describe('PublishReplyOpen', () => {
  it('reads through the thread, and shows Open canvas to the published version', async () => {
    svc.getCanvasRootCard.mockResolvedValue(published);
    mount();
    expect(await screen.findByTestId('publish-reply-open')).toHaveAttribute('href', HREF);
    expect(svc.getCanvasRootCard).toHaveBeenCalledWith('root-1', 'ver-1', 'me');
  });

  it('a read that STALLS shows nothing (no skeleton, no error), and a late answer brings the button', async () => {
    let late: (c: CanvasVersionCardData) => void = () => undefined;
    svc.getCanvasRootCard.mockImplementation(() => new Promise<CanvasVersionCardData>((r) => { late = r; }));
    mount();
    await act(async () => {});
    expect(screen.queryByTestId('publish-reply-open')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => late(published));
    expect(screen.getByTestId('publish-reply-open')).toBeInTheDocument();
  });

  it('a read that is REFUSED shows nothing and throws nothing (the closed footer below carries the button with Retry)', async () => {
    svc.getCanvasRootCard.mockRejectedValue(new Error('offline'));
    mount();
    await act(async () => {});
    expect(screen.queryByTestId('publish-reply-open')).toBeNull();
  });

  it('a card with no address shows no button', async () => {
    svc.getCanvasRootCard.mockResolvedValue({ ...published, href: null, openHref: null });
    mount();
    await act(async () => {});
    expect(screen.queryByTestId('publish-reply-open')).toBeNull();
  });
});

describe('the root card\'s own Retry reads the chat\'s batch again', () => {
  it('a refused first read shows the chat\'s error with Retry; Retry asks again for this root and the card comes', async () => {
    const row = { id: 'd-1', versionId: 'ver-d3', canvasId: 'cv-1', baseVersionId: null, conversationId: 'conv', threadRootId: 'root-1', state: 'published', runCount: 1, revision: 1, closedAt: null, canvasName: 'canvas_4', versionName: 'canvas_dd3' };
    svc.getCanvasDraftsByThreads.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Map([['root-1', row]]));
    svc.listMyCanvasVersions.mockResolvedValue([{ id: 'ver-d3', canvasId: 'cv-1', canvasName: 'canvas_4', canvasTitle: null, name: 'canvas_dd3', seq: 3, publishedAt: '2026-11-02T10:00:00Z', hasOpenDraft: false }]);
    svc.getProfileSlug.mockResolvedValue('ana');
    render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" rootId="root-1" /></MemoryRouter>);
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    expect(screen.getByTestId('attachment-error')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await new Promise((r) => setTimeout(r, 15)); });
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(2);
    expect(svc.getCanvasDraftsByThreads).toHaveBeenLastCalledWith(['root-1']);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v3 · Nov 2, 2026');
  });
});
