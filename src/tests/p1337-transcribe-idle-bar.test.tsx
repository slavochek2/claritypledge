/**
 * P1337 item 10 (founder, 2026-10-05): in the event room the transcription banner has an idle
 * state — "Not transcribed" and one quiet "Transcribe". The tap is the consent and runs the start
 * screen's startCapture; while anything runs for this event (paused included) it is not shown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const capture = {
  phase: 'idle' as string,
  isCapturingForEvent: vi.fn(() => false),
  startCapture: vi.fn(async () => ({ started: true })),
};
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
let offline = false;
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline, reconnectTick: 0 }) }));

import { RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';

beforeEach(() => {
  capture.phase = 'idle';
  capture.isCapturingForEvent.mockReset().mockReturnValue(false);
  capture.startCapture.mockReset().mockResolvedValue({ started: true });
  offline = false;
});

describe('the idle transcription banner', () => {
  it('offers one quiet "Transcribe" on main\'s one-line short bar, the description on the button', () => {
    render(<RoomTranscribeIdleBar eventId="ev-1" displayName="Ana" onFailed={() => {}} />);
    const bar = screen.getByTestId('room-transcribe-idle');
    expect(bar).toHaveTextContent('Not transcribed');
    // P1388: the short bar has no second line — the start screen's description rides on the button.
    expect(screen.getByText(/Record audio/)).toHaveClass('sr-only'); // read out, never a visible line
    const button = screen.getByTestId('room-transcribe-start');
    expect(button).toHaveAccessibleDescription(expect.stringContaining('Record audio and share transcript with others in the room'));
    expect(button).toHaveTextContent('Transcribe');
    expect(button.className).toContain('border'); // outlined, not a second filled primary
    expect(button.className).not.toContain('bg-blue-500');
  });

  it('the tap is the consent: it starts capture for this event', async () => {
    render(<RoomTranscribeIdleBar eventId="ev-1" displayName="Ana" onFailed={() => {}} />);
    fireEvent.click(screen.getByTestId('room-transcribe-start'));
    await waitFor(() => expect(capture.startCapture).toHaveBeenCalledWith({ eventId: 'ev-1', displayName: 'Ana' }));
  });

  it('a start that fails tells the page', async () => {
    capture.startCapture.mockResolvedValue({ started: false });
    const onFailed = vi.fn();
    render(<RoomTranscribeIdleBar eventId="ev-1" displayName="Ana" onFailed={onFailed} />);
    fireEvent.click(screen.getByTestId('room-transcribe-start'));
    await waitFor(() => expect(onFailed).toHaveBeenCalled());
  });

  it.each([
    ['running for this event (paused included)', () => capture.isCapturingForEvent.mockReturnValue(true)],
    ['starting', () => { capture.phase = 'starting'; }],
    ['ending', () => { capture.phase = 'ending'; }],
    ['offline', () => { offline = true; }],
  ])('is not shown while %s', (_label, arrange) => {
    arrange();
    render(<RoomTranscribeIdleBar eventId="ev-1" displayName="Ana" onFailed={() => {}} />);
    expect(screen.queryByTestId('room-transcribe-idle')).toBeNull();
  });
});
