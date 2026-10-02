/**
 * @file p1388-capture-bar.test.tsx
 * @description P1388 — the recorder can pause/resume from the bar, the paused state is visible
 * without tapping, silent failures are named, the stop control reads "Stop transcribing", and
 * the ⓘ opens the explanation while the bar itself carries no added sentence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUseRoomCapture = vi.fn();
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => mockUseRoomCapture(),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false }),
}));

import { RoomCaptureBar } from '@/app/components/session/room-capture-bar';
import { STATUS } from '@/app/components/session/capture-status';

function state(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'capturing', roomId: 'r1', open: vi.fn(), endMyCapture: vi.fn(),
    manualPaused: false, pauseMine: vi.fn(), resumeMine: vi.fn(),
    subscribeLevel: () => () => {}, inputSilent: false, micLost: false, micSwitched: false,
    ...overrides,
  };
}

beforeEach(() => mockUseRoomCapture.mockReset());

describe('P1388: pause / resume on the bar', () => {
  it('Pause calls the recorder\'s own pause', () => {
    const pauseMine = vi.fn();
    mockUseRoomCapture.mockReturnValue(state({ pauseMine }));
    render(<RoomCaptureBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pauseMine).toHaveBeenCalledTimes(1);
  });

  it('a manual pause keeps the bar up, says paused, and offers Resume', () => {
    const resumeMine = vi.fn();
    mockUseRoomCapture.mockReturnValue(state({ phase: 'paused', manualPaused: true, resumeMine }));
    render(<RoomCaptureBar />);
    expect(screen.getByText(STATUS.paused)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(resumeMine).toHaveBeenCalledTimes(1);
  });

  it('an automatic pause still renders nothing (P1307 D3/D13 unchanged)', () => {
    mockUseRoomCapture.mockReturnValue(state({ phase: 'paused', manualPaused: false }));
    const { container } = render(<RoomCaptureBar />);
    expect(container.textContent).toBe('');
  });

  it('an observing tab gets no Pause (the capturing tab owns the mic)', () => {
    mockUseRoomCapture.mockReturnValue(state({ phase: 'observing' }));
    render(<RoomCaptureBar />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });
});

describe('P1388: silent failures are named on the bar', () => {
  it.each([
    [{ inputSilent: true }, STATUS.silent],
    [{ micLost: true }, STATUS.micLost],
    [{ micSwitched: true }, STATUS.micSwitched],
  ])('%o → its status line', (flags, text) => {
    mockUseRoomCapture.mockReturnValue(state(flags));
    render(<RoomCaptureBar />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders the level meter while capturing', () => {
    mockUseRoomCapture.mockReturnValue(state());
    render(<RoomCaptureBar />);
    expect(screen.getByTestId('capture-level-meter')).toBeInTheDocument();
  });
});

describe('P1388: stop control and info affordance', () => {
  it('the stop control reads "Stop transcribing" and ends only this person\'s capture', () => {
    const endMyCapture = vi.fn();
    mockUseRoomCapture.mockReturnValue(state({ endMyCapture }));
    render(<RoomCaptureBar />);
    fireEvent.click(screen.getByRole('button', { name: /stop transcribing/i }));
    expect(endMyCapture).toHaveBeenCalledWith('r1');
  });

  it('the bar carries no responsibility sentence until ⓘ is opened', () => {
    mockUseRoomCapture.mockReturnValue(state());
    render(<RoomCaptureBar />);
    expect(screen.queryByText(/let the people around you know/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About this recording' }));
    expect(screen.getByText(/let the people around you know/i)).toBeInTheDocument();
  });
});
