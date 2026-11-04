/**
 * P1604 final-look batch, /transcribe/:code (founder 2026-11-04): ONE header row (standard Back left; info, Pause, Stop right), the
 * meter and faces under it, a link to the chat by name for a chat's room, one listening line, no bottom "Go back", and the phone's
 * bottom menu shown (the route leaves the hidden list).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const cap = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ada', email: 'a@example.com' }, isLoading: false, sessionChecked: true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), stopSessionRecording: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => cap.value }));
vi.mock('@/app/components/session/room-capture-bar', () => ({ RoomCaptureBarClaimSilent: () => null }));
vi.mock('@/app/hooks/use-tonights-event', () => ({ useTonightsEvent: () => null }));
vi.mock('@/app/data/room-transcription-state', () => ({ getMyRoomStates: vi.fn(async () => new Map([['r1', { state: 'none', chatName: 'Bo' }]])) }));
vi.mock('@/app/data/transcribe-service', () => ({
  getRoomByCode: vi.fn(),
  subscribeToRoomMembers: (_id: string, cb: (m: unknown[]) => void) => { cb([]); return () => undefined; },
  subscribeToRoomMessages: (_id: string, cb: (m: unknown[]) => void) => { cb([]); return () => undefined; },
  fetchRoomPeople: vi.fn(async () => ({})),
}));

import { TranscribeRoomPage } from '@/app/pages/transcribe-room-page';
import { LISTENING_LINE } from '@/app/components/session/capture-copy';
import { isBottomNavHiddenRoute } from '@/app/components/layout/bottom-nav-routes';

const base = {
  phase: 'capturing', roomId: 'r1', roomCode: 'ABC234', eventId: null, conversationId: 'chat-1', speakingMemberIds: new Set<string>(),
  open: vi.fn(), endMyCapture: vi.fn(), pauseMine: vi.fn(), resumeMine: vi.fn(), manualPaused: false, pausedByLiveRecord: false, micLost: false,
  tapDown: false, stopping: false, inputSilent: false, micSwitched: false, audioLost: false, reconnectMic: vi.fn(), startCapture: vi.fn(),
  subscribeLevel: () => () => undefined,
};
const show = (over: Record<string, unknown> = {}) => {
  cap.value = { ...base, ...over };
  return render(
    <MemoryRouter initialEntries={['/transcribe/ABC234']}>
      <Routes><Route path="/transcribe/:code" element={<TranscribeRoomPage />} /></Routes>
    </MemoryRouter>,
  );
};

beforeEach(() => { cap.value = base; });

describe('the room page header', () => {
  it('is ONE row: the standard Back on the left, info / Pause / Stop on the right', async () => {
    show();
    const header = await screen.findByTestId('transcribe-room-header');
    expect(within(header).getByRole('button', { name: 'Go back' })).toBeTruthy();
    expect(within(header).getByRole('button', { name: "About this recording" })).toBeTruthy();
    expect(within(header).getByRole('button', { name: /pause/i })).toBeTruthy();
    expect(within(header).getByTestId('transcribe-end-session-button')).toBeTruthy();
    // the Back comes first in the row
    const back = within(header).getByRole('button', { name: 'Go back' });
    const stop = within(header).getByTestId('transcribe-end-session-button');
    expect(back.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no bottom "Go back" any more', async () => {
    show();
    await screen.findByTestId('transcribe-room-header');
    expect(screen.queryByTestId('transcribe-bottom-back')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Go back' }), 'exactly one Back on the page').toHaveLength(1);
  });

  it('says one line: "Listening. Your words appear here in a few seconds."', async () => {
    show();
    await screen.findByTestId('transcribe-room-header');
    expect(LISTENING_LINE).toBe('Listening. Your words appear here in a few seconds.');
    expect(screen.getByTestId('transcribe-listening-indicator').textContent).toContain(LISTENING_LINE);
    expect(screen.queryByText(/first here/i), 'the second empty-room sentence is gone').toBeNull();
    expect(screen.queryByText(/Listening —/), 'and the old wording').toBeNull();
  });

  it('for a chat\'s room: "Transcribing into {name}" linking to that chat', async () => {
    show();
    const link = await screen.findByRole('link', { name: 'Bo' });
    expect(link.getAttribute('href')).toBe('/chats/c/chat-1');
  });

  it('a room with no chat shows no chat line', async () => {
    show({ conversationId: null });
    await screen.findByTestId('transcribe-room-header');
    expect(screen.queryByTestId('capture-chat-hint')).toBeNull();
  });
});

describe('the phone\'s bottom menu on /transcribe', () => {
  it('is no longer hidden on /transcribe or /transcribe/:code (control: other focus routes still hide it)', () => {
    expect(isBottomNavHiddenRoute('/transcribe', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/transcribe/ABC234', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/topics', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/chats/c/abc', '')).toBe(true);
  });

  it('the room screens keep clear of it on a phone (bottom padding that the layout does not give a fixed-height page)', async () => {
    const { container } = show();
    await screen.findByTestId('transcribe-room-header');
    const screenEl = container.querySelector('[data-testid="transcribe-room-screen"] > div[data-clears-nav]');
    expect(screenEl?.className).toMatch(/pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
  });
});
