/**
 * P1596 review: "Not transcribing" wrapped onto two lines on a 320 px phone. Its words never break, with or without the
 * sentence that follows when transcription was just stopped. (The pixels themselves are a browser check.)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const capture = { phase: 'idle', isCapturingForEvent: vi.fn(() => false), startCapture: vi.fn() };
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));

import { RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';

describe('idle bar label', () => {
  it('"Not transcribing" is one unbreakable run', () => {
    render(<RoomTranscribeIdleBar eventId="e" displayName="A" onFailed={() => {}} />);
    expect(screen.getByText('Not transcribing')).toHaveClass('whitespace-nowrap');
  });
});
