/**
 * P1604 final-look batch, /transcribe/:code (founder 2026-11-04): ONE header row (standard Back left; info, Pause, Stop right), the
 * meter and faces under it, a link to the chat by name for a chat's room, one listening line, no bottom "Go back", and the phone's
 * bottom menu shown (the route leaves the hidden list).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const cap = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ada', email: 'a@example.com' }, isLoading: false, sessionChecked: true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), stopSessionRecording: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => cap.value }));
vi.mock('@/app/components/session/room-capture-bar', () => ({ RoomCaptureBarClaimSilent: () => null }));
vi.mock('@/app/hooks/use-tonights-event', () => ({ useTonightsEvent: () => null }));
vi.mock('@/app/data/room-transcription-state', () => ({ getMyRoomStates: vi.fn(async () => new Map([['r1', { state: 'none', chatName: 'Bo' }]])) }));
vi.mock('@/app/data/transcribe-service', () => ({
  getRoomByCode: vi.fn(async () => null),
  subscribeToRoomMembers: (_id: string, cb: (m: unknown[]) => void) => { cb([]); return () => undefined; },
  subscribeToRoomMessages: (_id: string, cb: (m: unknown[]) => void) => { cb(rows.value); return () => undefined; },
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
let where = '';
function Where() { where = useLocation().pathname; return null; }
const show = (over: Record<string, unknown> = {}) => {
  cap.value = { ...base, ...over };
  return render(
    <MemoryRouter initialEntries={['/transcribe/ABC234']}>
      <Routes><Route path="/transcribe/:code" element={<TranscribeRoomPage />} /></Routes>
      <Where />
    </MemoryRouter>,
  );
};

beforeEach(() => { cap.value = base; rows.value = []; where = ''; });

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

describe('Stop never navigates: the ended view is the room, in place (founder)', () => {
  const msg = { id: 'm1', roomId: 'r1', memberId: 'x', text: 'hello from the room', spokenAt: '2026-11-04T10:00:00Z', isFinal: true };
  const containerOf = () => document.querySelector('[data-clears-nav]') as HTMLElement;
  const stop = async () => {
    fireEvent.click(await screen.findByTestId('transcribe-end-session-button'));
    await screen.findByTestId('transcribe-ended-banner');
  };

  it('stays on the same page after Stop', async () => {
    show();
    await stop();
    expect(where).toBe('/transcribe/ABC234');
  });

  it('keeps the transcript visible', async () => {
    rows.value = [msg];
    show();
    await screen.findByText('hello from the room');
    await stop();
    expect(screen.getByText('hello from the room')).toBeTruthy();
  });

  it('the top controls become a compact banner: "Session ended" and ONE action, "Open chat" to the chat for a chat room', async () => {
    show();
    await stop();
    const header = screen.getByTestId('transcribe-room-header');
    const banner = within(header).getByTestId('transcribe-ended-banner');
    expect(banner.textContent).toContain('Session ended');
    const actions = within(banner).getAllByRole('link');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.textContent).toBe('Open chat');
    expect(actions[0]!.getAttribute('href')).toBe('/chats/c/chat-1');
    expect(within(header).queryByTestId('transcribe-end-session-button'), 'Pause and Stop are gone').toBeNull();
    expect(within(banner).queryByRole('button', { name: /pause|stop/i })).toBeNull();
  });

  it('a room with no chat offers "See your transcript" to session history', async () => {
    show({ conversationId: null });
    await stop();
    const action = within(screen.getByTestId('transcribe-ended-banner')).getByRole('link');
    expect(action.textContent).toBe('See your transcript');
    expect(action.getAttribute('href')).toBe('/sessions');
  });

  it('the old centered ended card is gone', async () => {
    show();
    await stop();
    expect(screen.queryByTestId('transcribe-ended-screen')).toBeNull();
    expect(screen.queryByTestId('transcribe-see-transcript')).toBeNull();
    expect(screen.queryByText(/audio has been saved/i)).toBeNull();
  });

  it('same container, width, top padding and Back position in the running room and the ended view', async () => {
    show();
    const running = containerOf();
    const runningClass = running.className;
    const runningBack = within(screen.getByTestId('transcribe-room-header')).getByRole('button', { name: 'Go back' });
    expect(runningBack.closest('[data-testid="transcribe-room-header"]')).not.toBeNull();
    await stop();
    const ended = containerOf();
    expect(ended.className).toBe(runningClass);
    expect(ended.className).toMatch(/max-w-2xl/);
    const endedBack = within(screen.getByTestId('transcribe-room-header')).getByRole('button', { name: 'Go back' });
    // the Back is the first thing in the header row in both
    expect(screen.getByTestId('transcribe-room-header').firstElementChild?.contains(endedBack)).toBe(true);
  });

  it('and the join view (not yet in the room) uses that same container and the same header row with the Back first', async () => {
    const join = show({ phase: 'idle', roomId: null, roomCode: null, conversationId: null });
    const header = await screen.findByTestId('transcribe-room-header');
    expect(header.firstElementChild?.contains(within(header).getByRole('button', { name: 'Go back' }))).toBe(true);
    const joinClass = containerOf().className;
    join.unmount();
    show();
    await screen.findByTestId('transcribe-room-header');
    expect(containerOf().className, 'the running room\'s container is the join view\'s').toBe(joinClass);
  });
});
