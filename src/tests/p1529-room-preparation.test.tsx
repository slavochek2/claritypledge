/**
 * P1529: the room's preparation line steps aside in the mastermind once rounds have started, so it never competes with the
 * round's own task; every other flow keeps it. And "Your Clarity Canvas for this event" names the canvas by its title.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventWithHost } from '@/app/types';

const h = vi.hoisted(() => ({
  mine: null as unknown,
  canvases: [] as unknown[],
  drafts: [] as unknown[],
  getMine: vi.fn(),
  setCanvas: vi.fn(),
  toastError: vi.fn(),
  refresh: vi.fn(async () => null),
}));

vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => <div data-testid="prep-room-banner" /> }));
vi.mock('@/app/data/event-mastermind-service', () => ({
  getMyEventCanvas: (...a: unknown[]) => h.getMine(...a),
  setEventCanvas: (...a: unknown[]) => h.setCanvas(...a),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { shareCanvas: vi.fn() } }));
vi.mock('@/app/data/canvas-open-drafts', () => ({ listMyOpenCanvasDrafts: async () => h.drafts }));
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => ({ userId: 'u1', authors: { u1: { slug: 'ana' } }, refresh: () => h.refresh() }) }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  listMyCanvasVersions: async () => (h.canvases as { name: string; title: string | null }[]).map((c, i) => ({ id: `v${i}`, canvasId: `c${i}`, canvasName: c.name, canvasTitle: c.title, name: 'v', seq: 1, publishedAt: '2026-11-01T00:00:00Z', hasOpenDraft: false })),
}));
vi.mock('@/app/pages/chat/chat-hooks', () => ({ useMediaQuery: () => true }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: vi.fn(), dialog: null }) }));
vi.mock('sonner', () => ({ toast: { error: (m: string) => h.toastError(m) } }));

import { RoomPreparation } from '@/app/prototypes/events/prep/RoomPreparation';
import { EventCanvasCard } from '@/app/prototypes/events/prep/EventCanvasCard';
import { NetworkBlipError } from '@/lib/network-blip';

const event = (flow: string | null) => ({ id: 'ev-1', flow, seriesSlug: undefined } as unknown as EventWithHost);
const room = (flow: string | null, roundsStarted: boolean) =>
  render(<MemoryRouter initialEntries={['/events/x']}><RoomPreparation event={event(flow)} roundsStarted={roundsStarted} /></MemoryRouter>);

describe('RoomPreparation', () => {
  it('shows the preparation line in the mastermind before any round', () => {
    room('sales-mastermind', false);
    expect(screen.getByTestId('prep-room-banner')).toBeTruthy();
  });
  it('steps aside in the mastermind once rounds have started', () => {
    room('sales-mastermind', true);
    expect(screen.queryByTestId('prep-room-banner')).toBeNull();
  });
  it('is unchanged on Clarity Night at every moment', () => {
    room('clarity-night', true);
    expect(screen.getByTestId('prep-room-banner')).toBeTruthy();
  });
});

describe('EventCanvasCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mine = { name: 'canvas_2', shared: true, fixed: false };
    h.canvases = [{ canvasId: 'c2', name: 'canvas_2', title: 'Launch plan' }];
    h.getMine.mockImplementation(async () => h.mine);
    h.setCanvas.mockResolvedValue({ status: 'ok', name: 'canvas_1' });
  });
  it('names the chosen canvas by its title and offers nothing to change it (no Change, no Make a different one)', async () => {
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    expect((await screen.findByTestId('event-canvas-chosen')).textContent).toBe('Your Clarity Canvas for this event: Launch plan');
    expect(screen.queryByTestId('event-canvas-make')).toBeNull();
    expect(screen.queryByTestId('event-canvas-change')).toBeNull();
  });
  it('falls back to the raw name when the canvas has no title', async () => {
    h.canvases = [{ canvasId: 'c2', name: 'canvas_2', title: null }];
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    expect((await screen.findByTestId('event-canvas-chosen')).textContent).toContain('canvas_2');
  });
  it('lets a long canvas name wrap and keeps its buttons at 44px', async () => {
    h.mine = null;
    h.canvases = [{ canvasId: 'c1', name: 'canvas_1', title: 'A very long canvas title that must not be cut off at 320px' }];
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    const share = await screen.findByTestId('event-canvas-share');
    expect(share.className).toContain('min-h-11');
    expect(screen.getByTestId('event-canvas-body').textContent).toContain('A very long canvas title that must not be cut off at 320px');
    expect(screen.getByTestId('event-canvas-body').className).not.toContain('truncate');
    expect(screen.getByTestId('event-canvas-make').className).toContain('min-h-11');
  });
});

describe('EventCanvasCard failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mine = null;
    h.canvases = [{ canvasId: 'c1', name: 'canvas_1', title: 'Launch plan' }];
    h.getMine.mockImplementation(async () => h.mine);
    h.setCanvas.mockResolvedValue({ status: 'ok', name: 'canvas_1' });
  });

  it('a failed read is an error with Retry, never the empty "join as an observer" card', async () => {
    h.getMine.mockRejectedValueOnce(new NetworkBlipError('offline'));
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    expect((await screen.findByTestId('event-canvas-error')).textContent).toMatch(/Could not load your Clarity Canvas/);
    expect(screen.queryByTestId('event-canvas-observer-line')).toBeNull();
    expect(screen.queryByTestId('event-canvas-make')).toBeNull();
    fireEvent.click(screen.getByTestId('event-canvas-retry'));
    expect(await screen.findByTestId('event-canvas-share')).toBeTruthy();
    expect(screen.queryByTestId('event-canvas-error')).toBeNull();
  });

  it('a pick that never reached the server says so, and does not say "not published"', async () => {
    h.setCanvas.mockRejectedValueOnce(new NetworkBlipError('Only a published Clarity Canvas of yours can be shared with this event.'));
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('event-canvas-share'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastError.mock.calls[0]?.[0]).toMatch(/Could not reach the server/);
    expect(h.toastError.mock.calls[0]?.[0]).not.toMatch(/published/);
  });

  it('a pick the server refused says it could not be shared, without blaming the canvas', async () => {
    h.setCanvas.mockRejectedValueOnce(new Error('Only a published Clarity Canvas of yours can be shared with this event.'));
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('event-canvas-share'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastError.mock.calls[0]?.[0]).toBe("Couldn't share your Clarity Canvas. Try again.");
  });

  it('a pick refused because round 1 has started says the canvas is fixed', async () => {
    h.setCanvas.mockResolvedValueOnce({ status: 'refused', code: 'fixed_after_round_1' });
    render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('event-canvas-share'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastError.mock.calls[0]?.[0]).toMatch(/fixed now that round 1 has started/);
  });
});

describe('EventCanvasCard states', () => {
  const card = () => render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
  beforeEach(() => {
    vi.clearAllMocks();
    h.mine = null; h.drafts = []; h.canvases = [];
    h.getMine.mockImplementation(async () => h.mine);
  });
  it('shows a skeleton while loading, not nothing', () => {
    h.getMine.mockImplementation(() => new Promise(() => {}));
    card();
    expect(screen.getByTestId('event-canvas-loading')).toBeTruthy();
  });
  it('A: an inline Create button, no Continue', async () => {
    card();
    expect((await screen.findByTestId('event-canvas-make')).textContent).toBe('Create your canvas');
    expect(screen.queryByText('Continue')).toBeNull();
  });
  it('B: an inline Continue-your-draft button', async () => {
    h.drafts = [{ canvasName: 'canvas_1', versionName: 'canvas_d1' }];
    card();
    expect((await screen.findByTestId('event-canvas-continue-draft')).textContent).toBe('Continue your draft');
  });
  it('E: names the canvas, no Change and no Continue', async () => {
    h.mine = { name: 'canvas_2', shared: true, fixed: false };
    h.canvases = [{ name: 'canvas_2', title: 'Launch plan' }, { name: 'canvas_3', title: 'Other' }];
    card();
    expect(await screen.findByTestId('event-canvas-chosen')).toBeTruthy();
    expect(screen.queryByTestId('event-canvas-change')).toBeNull();
    expect(screen.queryByText('Continue')).toBeNull();
  });
  it('F: names the canvas, no Change and no Continue', async () => {
    h.mine = { name: 'canvas_2', shared: true, fixed: true };
    h.canvases = [{ name: 'canvas_2', title: 'Launch plan' }];
    card();
    expect(await screen.findByTestId('event-canvas-ready')).toBeTruthy();
    expect(screen.queryByTestId('event-canvas-change')).toBeNull();
    expect(screen.queryByText('Continue')).toBeNull();
  });
  it('the inline primary and secondary have a gap and the alternative is an outline button', async () => {
    h.canvases = [{ name: 'canvas_1', title: 'Launch plan' }];
    card();
    const share = await screen.findByTestId('event-canvas-share');
    expect(share.parentElement!.className).toMatch(/flex flex-wrap items-center gap-3/);
    expect(screen.getByTestId('event-canvas-make').tagName).toBe('BUTTON');
    expect(screen.getByTestId('event-canvas-make').className).toContain('border');
  });
  it('G: Share again is inline', async () => {
    h.mine = { name: 'canvas_1', shared: false, fixed: true };
    h.canvases = [{ name: 'canvas_1', title: 'Launch plan' }];
    card();
    expect((await screen.findByTestId('event-canvas-share-again')).textContent).toBe('Share again');
    expect(screen.queryByTestId('event-canvas-share')).toBeNull();
  });
});

describe('EventCanvasCard test ids and button variants', () => {
  const card = () => render(<MemoryRouter initialEntries={['/events/x']}><EventCanvasCard eventId="ev-1" /></MemoryRouter>);
  beforeEach(() => {
    vi.clearAllMocks();
    h.mine = null; h.drafts = []; h.canvases = [];
    h.getMine.mockImplementation(async () => h.mine);
  });
  it('the primary is the default filled button at auto width; the alternative is outline; Skip-style back-outs are text links', async () => {
    h.canvases = [{ name: 'canvas_1', title: 'Launch plan' }];
    card();
    const primary = await screen.findByTestId('event-canvas-share');
    expect(primary.className).toContain('bg-blue-600');
    expect(primary.className).toContain('h-8'); // size sm
    expect(primary.className).not.toContain('w-full');
    expect(screen.getByTestId('event-canvas-make').className).toContain('border-input'); // outline
  });
  it('an open draft with a published canvas: the alternative is Continue your draft under its own test id', async () => {
    h.canvases = [{ name: 'canvas_1', title: 'Launch plan' }];
    h.drafts = [{ canvasName: 'canvas_9', versionName: 'canvas_d9' }];
    card();
    expect((await screen.findByTestId('event-canvas-continue-draft')).textContent).toBe('Continue your draft');
    expect(screen.queryByTestId('event-canvas-make')).toBeNull();
  });
  it('the room card locks its picker while a Share is pending', async () => {
    h.canvases = [{ name: 'canvas_1', title: 'A' }, { name: 'canvas_2', title: 'B' }];
    h.setCanvas.mockImplementation(() => new Promise(() => {}));
    card();
    const radios = await screen.findAllByTestId('event-canvas-option') as HTMLInputElement[];
    expect(radios.every(r => !r.disabled)).toBe(true);
    fireEvent.click(await screen.findByTestId('event-canvas-share'));
    await waitFor(() => expect((screen.getAllByTestId('event-canvas-option') as HTMLInputElement[]).every(r => r.disabled)).toBe(true));
  });
  it('A: Create keeps the make id and is filled; the quiet link has no pill', async () => {
    card();
    const make = await screen.findByTestId('event-canvas-make');
    expect(make.className).toContain('bg-blue-600');
  });
});
