/**
 * @file p1536-x11-closed-line.test.tsx
 * @description P1536 3c X11, review fix 3: the closed thread's footer ends its waits (P1586's SectionWait): a read that stalls becomes a readable line with Retry after the
 * section deadline, one that is refused shows it at once, and Retry reads again and brings the line and Open canvas back. A discarded thread needs no read at all.
 * While the read is out the footer holds its place with a skeleton, never a premature "Published." and never a composer.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasRootCard: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));

import { CanvasClosedLine } from '@/app/pages/chat/CanvasClosedLine';

const HREF = '/p/ana/canvas/canvas_4?v=canvas_dd3';
const published: CanvasVersionCardData = { title: 'Canvas', label: 'v3 · Nov 2, 2026', state: 'published', draft: false, href: HREF, openHref: HREF, seq: 3, hasThread: true, draftId: 'd-1' };
const mount = (draftState: 'published' | 'discarded' = 'published') =>
  render(<MemoryRouter><CanvasClosedLine rootId="root-1" versionId="ver-1" viewerId="me" draftState={draftState} /></MemoryRouter>);
const SLOW = 'This is taking longer than usual.';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a published thread\'s footer', () => {
  it('while the read is out: a skeleton in its place, no "Published." yet, no composer', async () => {
    svc.getCanvasRootCard.mockImplementation(() => new Promise(() => undefined));
    mount();
    expect(screen.getByTestId('canvas-closed-line-wait')).toBeInTheDocument();
    expect(screen.queryByText(/Published/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a read that STALLS becomes a readable line with Retry at the section deadline, and Retry reads again and brings Open canvas back', async () => {
    svc.getCanvasRootCard.mockImplementationOnce(() => new Promise(() => undefined));
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(screen.queryByText(SLOW)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(screen.getByText(SLOW)).toBeInTheDocument();
    svc.getCanvasRootCard.mockResolvedValueOnce(published);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(svc.getCanvasRootCard).toHaveBeenCalledTimes(2); // a new read, not the stalled one
    expect(screen.getByTestId('canvas-closed-line')).toHaveTextContent('Published as v3.');
    expect(screen.getByTestId('canvas-closed-open')).toHaveAttribute('href', HREF);
    expect(screen.queryByText(SLOW)).toBeNull();
  });

  it('a read that is REFUSED shows the line with Retry at once (no Open canvas silently lost), and Retry brings it back', async () => {
    svc.getCanvasRootCard.mockRejectedValueOnce(new Error('offline'));
    mount();
    await act(async () => {});
    expect(screen.getByText(SLOW)).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-closed-open')).toBeNull();
    svc.getCanvasRootCard.mockResolvedValueOnce(published);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(screen.getByTestId('canvas-closed-open')).toHaveAttribute('href', HREF);
  });

  it('a Retry that is refused again shows the line again (it can be tried as often as the person likes)', async () => {
    svc.getCanvasRootCard.mockRejectedValue(new Error('offline'));
    mount();
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(screen.getByText(SLOW)).toBeInTheDocument();
    expect(svc.getCanvasRootCard).toHaveBeenCalledTimes(2);
  });

  it('a read that finds no card still says it was published, without a button', async () => {
    svc.getCanvasRootCard.mockResolvedValue(null);
    mount();
    await act(async () => {});
    expect(screen.getByTestId('canvas-closed-line')).toHaveTextContent('Published.');
    expect(screen.queryByTestId('canvas-closed-open')).toBeNull();
  });
});

describe('a discarded thread\'s footer', () => {
  it('needs no read: the line shows at once, with no button and no wait', async () => {
    mount('discarded');
    expect(screen.getByTestId('canvas-closed-line')).toHaveTextContent('This draft was discarded.');
    expect(svc.getCanvasRootCard).not.toHaveBeenCalled();
    expect(screen.queryByTestId('canvas-closed-open')).toBeNull();
  });
});
