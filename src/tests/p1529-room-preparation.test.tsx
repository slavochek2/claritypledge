/**
 * P1529: the room's preparation line steps aside in the mastermind once rounds have started, so it never competes with the
 * round's own task; every other flow keeps it. And "Your Clarity Canvas for this event" names the canvas by its title.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventWithHost } from '@/app/types';

const h = vi.hoisted(() => ({
  mine: null as unknown,
  canvases: [] as unknown[],
}));

vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => <div data-testid="prep-room-banner" /> }));
vi.mock('@/app/data/event-mastermind-service', () => ({
  getMyEventCanvas: async () => h.mine,
  setEventCanvas: vi.fn(),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { listMyCanvases: async () => h.canvases } }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: vi.fn(), dialog: null }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { RoomPreparation } from '@/app/prototypes/events/prep/RoomPreparation';
import { EventCanvasCard } from '@/app/prototypes/events/prep/EventCanvasCard';

const event = (flow: string | null) => ({ id: 'ev-1', flow, seriesSlug: undefined } as unknown as EventWithHost);
const room = (flow: string | null, roundsStarted: boolean) =>
  render(<MemoryRouter><RoomPreparation event={event(flow)} roundsStarted={roundsStarted} /></MemoryRouter>);

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
    h.mine = { name: 'canvas_2', shared: true, fixed: false };
    h.canvases = [{ canvasId: 'c2', name: 'canvas_2', title: 'Launch plan' }];
  });
  it('names the chosen canvas by its title, with a Change button at least 44px tall', async () => {
    render(<EventCanvasCard eventId="ev-1" />);
    expect((await screen.findByTestId('event-canvas-chosen')).textContent).toBe('Your Clarity Canvas for this event: Launch plan');
    expect(screen.getByTestId('event-canvas-change').className).toContain('min-h-11');
  });
  it('falls back to the raw name when the canvas has no title', async () => {
    h.canvases = [{ canvasId: 'c2', name: 'canvas_2', title: null }];
    render(<EventCanvasCard eventId="ev-1" />);
    expect((await screen.findByTestId('event-canvas-chosen')).textContent).toContain('canvas_2');
  });
  it('lets a long canvas name wrap and keeps its buttons at 44px', async () => {
    h.mine = null;
    h.canvases = [{ canvasId: 'c1', name: 'canvas_1', title: 'A very long canvas title that must not be cut off at 320px' }];
    render(<EventCanvasCard eventId="ev-1" />);
    const share = await screen.findByTestId('event-canvas-share');
    expect(share.className).toContain('min-h-11');
    expect(screen.getByText('A very long canvas title that must not be cut off at 320px').className).not.toContain('truncate');
    expect(screen.getByTestId('event-canvas-make').className).toContain('min-h-11');
  });
});
