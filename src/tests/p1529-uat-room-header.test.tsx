/**
 * P1529 founder UAT (2026-11-10): the projector's time left, the table banner's state, the info popover's live-text link, the 4 s host poll.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DEFAULT_TIMING, roundClock } from '@/lib/round-clock';
import { screenTimeLeft } from '@/app/prototypes/events/rounds/screen-time-left';
import { EXTEND_LIMIT_LINE, extendRefusal } from '@/app/prototypes/events/rounds/mastermind-host-helpers';
import { backToTablePath, tableEventOf, tableLinkState } from '@/lib/canvas-hrefs';
import { HOST_STATE_POLL_MS } from '@/app/prototypes/events/rounds/use-mastermind-host';
import { BackBanner } from '@/app/pages/canvas/PreparationBanner';
import { MastermindOtherCanvases } from '@/app/prototypes/events/rounds/MastermindOtherCanvases';
import { CaptureInfoButton } from '@/app/components/session/capture-controls';

vi.mock('@/app/prototypes/events/rounds/use-mastermind-round', () => ({
  useEventCanvasChoices: () => ({ loaded: true, failed: false, list: [{ ownerId: 'o1', ownerName: 'Mia Pitch', ownerSlug: 'mia', name: 'pitch' }] }),
}));

const START = '2026-11-10T18:00:00Z';
const at = (s: number, observer = true) => {
  const c = roundClock(START, new Date(START).getTime() + s * 1000, observer, DEFAULT_TIMING);
  return screenTimeLeft(c, DEFAULT_TIMING, observer);
};

describe('host refresh', () => {
  it('reads every 4 seconds', () => expect(HOST_STATE_POLL_MS).toBe(4000));
});

describe('projector time left', () => {
  it('first speaker: the talk left (rest of both speakers), then observer feedback', () => {
    expect(at(60 + 108)).toEqual({ left: '10:12 left', next: 'then 3 min observer feedback' });
  });
  it('second speaker: its rest only', () => expect(at(60 + 360 + 60)?.left).toBe('5:00 left'));
  it('no observer: the round ends', () => expect(at(60 + 100, false)?.next).toBe('then the round ends'));
  it('seating names the talk', () => expect(at(10)).toEqual({ left: '0:50 left', next: 'then 12 min to talk' }));
  it('observer: then the end', () => expect(at(60 + 720 + 30)).toEqual({ left: '2:30 left', next: 'then the round ends' }));
  it('over: nothing', () => expect(at(60 + 720 + 180 + 5)).toBeNull());
});

describe('table return state', () => {
  it('carries a same-origin room path and the event', () => {
    const s = tableLinkState('/events/x/meet', 'e1');
    expect(backToTablePath(s)).toBe('/events/x/meet');
    expect(tableEventOf(s)).toBe('e1');
  });
  it('refuses other origins and non-strings', () => {
    for (const bad of ['//evil.com', '/\\evil', 'https://evil.com', 5, null]) expect(backToTablePath({ backToTable: bad })).toBeNull();
  });
});

describe('back banner', () => {
  it('shows the line and goes to the path', () => {
    render(<MemoryRouter><BackBanner to="/events/x/meet" ariaLabel="Back to your table" testId="table-banner" line="Back to your table" /></MemoryRouter>);
    expect(screen.getByTestId('table-banner').textContent).toContain('Back to your table');
    expect(screen.getByTestId('table-banner-back')).toBeTruthy();
  });
});

describe('extend refusal and the observer rule', () => {
  it('words the server limit refusal (54000), and nothing else', () => {
    expect(extendRefusal({ code: '54000', message: 'x' })).toBe(EXTEND_LIMIT_LINE);
    expect(extendRefusal({ message: 'this round cannot be extended further' })).toBe(EXTEND_LIMIT_LINE);
    expect(extendRefusal({ code: '22023', message: 'this round is over' })).toBeNull();
  });
  it('an observer with no minutes is never "then observer feedback"', () => {
    const t = { ...DEFAULT_TIMING, observerMs: 0 };
    const c = roundClock(START, new Date(START).getTime() + 100_000, true, t);
    expect(screenTimeLeft(c, t, true)?.next).toBe('then the round ends');
  });
});

describe('back banner navigation', () => {
  it('the arrow goes to its path', () => {
    render(
      <MemoryRouter initialEntries={['/canvas']}>
        <Routes>
          <Route path="/canvas" element={<BackBanner to="/events/x/meet" ariaLabel="Back to your table" testId="table-banner" line="Back to your table" />} />
          <Route path="/events/x/meet" element={<span data-testid="room-page" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('table-banner-back'));
    expect(screen.getByTestId('room-page')).toBeTruthy();
  });
});

describe('waiting-state canvases list', () => {
  it('opens the chosen canvas with the table state', async () => {
    const Where = () => <span data-testid="state">{JSON.stringify(useLocation().state)}</span>;
    render(
      <MemoryRouter initialEntries={['/events/x/meet']}>
        <Routes>
          <Route path="/events/x/meet" element={<MastermindOtherCanvases eventId="e1" />} />
          <Route path="/p/*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mastermind-other-canvases-toggle'));
    fireEvent.change(await screen.findByTestId('mastermind-other-canvases-select'), { target: { value: 'o1' } });
    fireEvent.click(screen.getByTestId('mastermind-other-canvases-open'));
    expect(JSON.parse(screen.getByTestId('state').textContent as string)).toEqual({ backToTable: '/events/x/meet', tableEvent: 'e1' });
  });
});

describe('capture info popover', () => {
  it('offers the live text link only when the bar hides its arrow', () => {
    const open = vi.fn();
    const { unmount } = render(<CaptureInfoButton forEvent />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.queryByTestId('capture-info-open-room')).toBeNull();
    unmount();
    render(<CaptureInfoButton forEvent onOpenRoom={open} />);
    fireEvent.click(screen.getByTestId('capture-info'));
    fireEvent.click(screen.getByTestId('capture-info-open-room'));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
