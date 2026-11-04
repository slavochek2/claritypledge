/**
 * P1604 founder decision: a recording started from a chat says what happens to the text, in the bar everywhere.
 */
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent } from '@testing-library/react';

const cap = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => cap.value }));
vi.mock('@/app/data/room-transcription-state', () => ({ getMyRoomStates: vi.fn(async () => new Map([['r1', { state: 'none', chatName: 'Ada' }]])) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false }), useOfflineStripShown: () => false }));

import { RoomCaptureBar } from '@/app/components/session/room-capture-bar';
import { transcribingInto } from '@/app/components/session/capture-copy';

const base = {
  phase: 'capturing', roomId: 'r1', open: vi.fn(), endMyCapture: vi.fn(), pauseMine: vi.fn(), resumeMine: vi.fn(), manualPaused: false,
  pausedByLiveRecord: false, micLost: false, tapDown: false, stopping: false, inputSilent: false, micSwitched: false, audioLost: false,
  reconnectMic: vi.fn(), subscribeLevel: () => () => undefined, destination: null,
};
let where = '';
function Where() { where = useLocation().pathname; return null; }
const show = (over: Record<string, unknown>) => {
  cap.value = { ...base, ...over };
  return render(<MemoryRouter initialEntries={['/feed']}><RoomCaptureBar short /><Where /></MemoryRouter>);
};

describe('the bar of a recording started from a chat', () => {
  it('says: Transcribing into {chat name}, the name linking to the chat', async () => {
    show({ conversationId: 'chat-1', eventId: null });
    expect((await screen.findByTestId('capture-chat-hint')).textContent).toBe(transcribingInto('Ada'));
    expect(screen.getByRole('link', { name: 'Ada' }).getAttribute('href')).toBe('/chats/c/chat-1');
  });

  it('shows the banner OR the place name, never both side by side', async () => {
    show({ conversationId: 'chat-1', eventId: null, destination: { label: 'Round 2 - Anna and Ben' } });
    expect(await screen.findByTestId('capture-chat-hint')).toBeTruthy();
    expect(screen.queryByTestId('capture-destination')).toBeNull();
  });

  it('is not shown for an event room or a plain /transcribe room', () => {
    show({ conversationId: 'chat-1', eventId: 'e1' });
    expect(screen.queryByTestId('capture-chat-hint')).toBeNull();
    cleanup();
    show({ conversationId: null, eventId: null });
    expect(screen.queryByTestId('capture-chat-hint')).toBeNull();
  });
});

describe('Stop from the bar elsewhere never navigates (founder)', () => {
  it('ends the capture and leaves the person on the page they are on', () => {
    show({ conversationId: 'chat-1', eventId: null });
    fireEvent.click(screen.getByTestId('room-capture-bar-end'));
    expect(base.endMyCapture).toHaveBeenCalledWith('r1');
    expect(where).toBe('/feed');
  });
});
