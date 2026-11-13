/**
 * P1596 review: "Not transcribing" wrapped onto two lines on a 320 px phone. Its words never break, with or without the
 * sentence that follows when transcription was just stopped. (The pixels themselves are a browser check.)
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const capture = { phase: 'idle', isCapturingForEvent: vi.fn(() => false), startCapture: vi.fn() };
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));

import { RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';

describe('idle bar (UAT 2026-11-13 F5)', () => {
  it('a non-round event keeps its status words: "Not transcribing" is one unbreakable run', () => {
    render(<RoomTranscribeIdleBar eventId="e" displayName="A" onFailed={() => {}} />);
    expect(screen.getByText('Not transcribing')).toHaveClass('whitespace-nowrap');
  });
  it('a round event says only what someone can act on: the Start transcribing button and the info, no status words', () => {
    render(<RoomTranscribeIdleBar eventId="e" displayName="A" onFailed={() => {}} roundUpdates />);
    expect(screen.getByRole('button', { name: 'Start transcribing' })).toBeInTheDocument();
    expect(screen.getByTestId('capture-info')).toBeInTheDocument();
    expect(screen.queryByText(/not transcribing/i)).toBeNull();
    expect(screen.queryByText(/text arrives after the round/i)).toBeNull();
  });
  it('a round event: the info says where the words go, and only that', () => {
    render(<RoomTranscribeIdleBar eventId="e" displayName="A" onFailed={() => {}} roundUpdates />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet')).toHaveTextContent("Your table's words appear in your round's chat thread after the round.");
  });
});
