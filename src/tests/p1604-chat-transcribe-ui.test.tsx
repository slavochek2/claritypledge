/**
 * P1604 UI: the three-dot "Transcribe" item (not in the mirror), no explanation box (a tap starts at once; the server still records consent on the tap), and the live-session line ("{name} is transcribing", Join).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChatSummary } from '@/app/data/chat-service';

const startCapture = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => ({ value: { phase: 'idle', conversationId: null as string | null, eventId: null as string | null, roomId: null as string | null, startCapture: null as unknown } }));
const live = vi.hoisted(() => vi.fn());
const seated = vi.hoisted(() => vi.fn());
const processing = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ada', email: 'ada@example.com' }, sessionChecked: true }) }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture.value }));
vi.mock('@/app/data/chat-live-transcription', () => ({ getChatLiveTranscription: live, hasTranscribedInChat: seated }));
vi.mock('@/app/data/room-transcription-state', () => ({ getChatTranscriptionProcessing: processing }));

import { TranscribeMenuItem, ChatTranscribe } from '@/app/pages/chat/ChatTranscribe';
import { liveSessionLine, LIVE_SESSION_JOIN, TRANSCRIPT_FAILED, TRANSCRIPT_PROCESSING } from '@/app/components/session/capture-copy';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';

const chat = (kind: ChatSummary['kind'], id = 'chat-1'): ChatSummary => ({ conversationId: id, kind } as ChatSummary);

function Harness({ summary, tick = 0 }: { summary: ChatSummary; tick?: number }) {
  void tick;
  return (
    <MemoryRouter>
      <ChatTranscribe chat={summary}>
        {(onTranscribe, busy) => (
          <DropdownMenu open modal={false}>
            <DropdownMenuContent><TranscribeMenuItem chat={summary} onTranscribe={onTranscribe} busy={busy} /></DropdownMenuContent>
          </DropdownMenu>
        )}
      </ChatTranscribe>
    </MemoryRouter>
  );
}

beforeEach(() => {
  startCapture.mockReset().mockResolvedValue({ started: true, room: { id: 'r1', code: 'ABC234', eventId: null } });
  capture.value = { phase: 'idle', conversationId: null, eventId: null, roomId: null, startCapture };
  live.mockReset().mockResolvedValue(null);
  seated.mockReset().mockResolvedValue(false);   // must stay uncalled: the component no longer asks
  processing.mockReset().mockResolvedValue([]);
  toastFn.mockReset();
  toastFn.error = vi.fn();
});

describe('the three-dot item', () => {
  it.each(['dm', 'group', 'event'] as const)('is there for a %s chat', async (kind) => {
    render(<Harness summary={chat(kind)} />);
    expect(await screen.findByRole('menuitem', { name: /transcribe/i })).toBeTruthy();
  });

  it('is there for the mirror too (P1722)', async () => {
    render(<Harness summary={chat('mirror')} />);
    expect(await screen.findByRole('menuitem', { name: /transcribe/i })).toBeTruthy();
  });

  it('is at least 44px high', async () => {
    render(<Harness summary={chat('dm')} />);
    const item = await screen.findByRole('menuitem', { name: /transcribe/i });
    expect(item.className).toMatch(/min-h-11/);
  });
});

describe('a tap starts transcribing at once (no explanation box)', () => {
  it('the first tap in a group chat starts the capture in THIS chat, with the person\'s name, and shows no dialog', async () => {
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    expect(startCapture).toHaveBeenCalledWith({ eventId: null, conversationId: 'chat-7', displayName: 'Ada' });
    expect(screen.queryByTestId('chat-transcribe-explanation')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the first tap in the owner\'s Mirror starts at once too', async () => {
    render(<Harness summary={chat('mirror', 'chat-m')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledWith({ eventId: null, conversationId: 'chat-m', displayName: 'Ada' }));
    expect(screen.queryByTestId('chat-transcribe-explanation')).toBeNull();
  });

  it('does not look up whether the person has transcribed here before', async () => {
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await waitFor(() => expect(startCapture).toHaveBeenCalled());
    expect(seated).not.toHaveBeenCalled();
  });

  it('a start that fails says so and does not pretend', async () => {
    startCapture.mockResolvedValue({ started: false, reason: 'microphone' });
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
  });

  it('a second tap while the start is in flight starts nothing more', async () => {
    let finish: (v: unknown) => void = () => undefined;
    startCapture.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    const join = await screen.findByRole('button', { name: LIVE_SESSION_JOIN });
    fireEvent.click(join);
    fireEvent.click(join);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await act(async () => { finish({ started: true }); });
    expect(startCapture, 'one start').toHaveBeenCalledTimes(1);
  });
});

describe('R3: pending feedback while a start is in flight', () => {
  it('the Transcribe item is disabled and aria-busy until the start answers, then back', async () => {
    let finish: (v: unknown) => void = () => undefined;
    startCapture.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    const item = await screen.findByTestId('chat-transcribe-item');
    await waitFor(() => expect(item.getAttribute('aria-busy')).toBe('true'));
    expect(item.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { finish({ started: true }); });
    await waitFor(() => expect(item.getAttribute('aria-busy')).toBeNull());
    expect(item.getAttribute('aria-disabled')).toBeNull();
  });

  it('Join reads "Starting…", is disabled and aria-busy until the start answers, then reads Join again', async () => {
    let finish: (v: unknown) => void = () => undefined;
    startCapture.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    fireEvent.click(await screen.findByRole('button', { name: LIVE_SESSION_JOIN }));
    const busy = await screen.findByRole('button', { name: 'Starting…' });
    expect(busy).toBeDisabled();
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await act(async () => { finish({ started: false, reason: 'error' }); });
    expect(await screen.findByRole('button', { name: LIVE_SESSION_JOIN })).not.toBeDisabled();
  });
});

describe('the live-session line', () => {
  it('names who is transcribing and offers Join, which starts at once', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    expect(await screen.findByText(liveSessionLine('Bo'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: LIVE_SESSION_JOIN }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledWith({ eventId: null, conversationId: 'chat-3', displayName: 'Ada' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is not shown when nobody is transcribing', async () => {
    render(<Harness summary={chat('dm')} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: LIVE_SESSION_JOIN })).toBeNull();
  });

  it('is not shown to the person who is already recording here (the bar is theirs)', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Ada', recordingCount: 1, iAmRecording: true });
    render(<Harness summary={chat('dm')} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: LIVE_SESSION_JOIN })).toBeNull();
  });

  it('Join is at least 44px high', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 2, iAmRecording: false });
    render(<Harness summary={chat('dm')} />);
    const join = await screen.findByRole('button', { name: LIVE_SESSION_JOIN });
    expect(join.className).toMatch(/min-h-11/);
  });

  it('asks the server about the mirror too (P1722)', async () => {
    render(<Harness summary={chat('mirror')} />);
    await act(async () => { await Promise.resolve(); });
    expect(live).toHaveBeenCalled();
  });
});

describe('review 9: same target, and the live line follows the capture', () => {
  const eventChat = { conversationId: 'chat-ev', kind: 'event', event: { id: 'ev-1', slug: 's', title: 'T', datetime: '2026-11-04T10:00:00Z' } } as unknown as ChatSummary;

  it('an event chat passes its event, so recording that event\'s room from the event page is the same place', async () => {
    render(<Harness summary={eventChat} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledWith({ eventId: 'ev-1', conversationId: 'chat-ev', displayName: 'Ada' }));
  });

  it('the line re-reads when the capture phase changes (the person started or stopped)', async () => {
    const { rerender } = render(<Harness summary={chat('dm', 'chat-3')} />);
    await act(async () => { await Promise.resolve(); });
    const before = live.mock.calls.length;
    capture.value = { ...capture.value, phase: 'capturing', conversationId: 'chat-3', roomId: 'r1' };
    rerender(<Harness summary={chat('dm', 'chat-3')} tick={1} />);
    await act(async () => { await Promise.resolve(); });
    expect(live.mock.calls.length, 'a new read after the phase changed').toBeGreaterThan(before);
  });

  it('the line is hidden while I am recording in this chat, even before the server has said so', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 2, iAmRecording: false });
    capture.value = { ...capture.value, phase: 'capturing', conversationId: 'chat-3', roomId: 'r9' };
    render(<Harness summary={chat('dm', 'chat-3')} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: LIVE_SESSION_JOIN })).toBeNull();
  });

  it('and hidden while I am recording the event\'s room from the event page (the capture knows the event, not the chat)', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 2, iAmRecording: false });
    capture.value = { ...capture.value, phase: 'capturing', conversationId: null, eventId: 'ev-1', roomId: 'r9' };
    render(<Harness summary={eventChat} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: LIVE_SESSION_JOIN })).toBeNull();
  });
});

describe('P1604 founder live test: the chat says where the thread will appear', () => {
  it('a session of this chat whose text is being prepared shows a line, once, with the proposed words', async () => {
    processing.mockResolvedValue([{ roomId: 'r1', state: 'processing', endedAt: '2026-11-04T10:00:00Z' }]);
    render(<Harness summary={chat('dm', 'chat-3')} />);
    const line = await screen.findByTestId('chat-transcription-state');
    expect(line.textContent).toContain(TRANSCRIPT_PROCESSING);
    expect(screen.getAllByTestId('chat-transcription-state')).toHaveLength(1);
    expect(processing).toHaveBeenCalledWith('chat-3');
  });

  it('a failed one says so', async () => {
    processing.mockResolvedValue([{ roomId: 'r1', state: 'failed', endedAt: '2026-11-04T10:00:00Z' }]);
    render(<Harness summary={chat('dm', 'chat-3')} />);
    expect((await screen.findByTestId('chat-transcription-state')).textContent).toContain(TRANSCRIPT_FAILED);
  });

  it('processing wins over failed when both exist (the clean text may still arrive)', async () => {
    processing.mockResolvedValue([
      { roomId: 'r1', state: 'failed', endedAt: '2026-11-04T09:00:00Z' }, { roomId: 'r2', state: 'processing', endedAt: '2026-11-04T10:00:00Z' }]);
    render(<Harness summary={chat('dm', 'chat-3')} />);
    expect((await screen.findByTestId('chat-transcription-state')).textContent).toContain(TRANSCRIPT_PROCESSING);
  });

  it('nothing when nothing is processing, and the mirror is read like any chat (P1722)', async () => {
    render(<Harness summary={chat('dm', 'chat-3')} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('chat-transcription-state')).toBeNull();
    render(<Harness summary={chat('mirror', 'chat-m')} />);
    await act(async () => { await Promise.resolve(); });
    expect(processing).toHaveBeenCalledWith('chat-m');
  });

  it('is not a spinner: a still mark, no animation (the loading-state rules)', async () => {
    processing.mockResolvedValue([{ roomId: 'r1', state: 'processing', endedAt: '2026-11-04T10:00:00Z' }]);
    render(<Harness summary={chat('dm', 'chat-3')} />);
    const line = await screen.findByTestId('chat-transcription-state');
    expect(line.innerHTML).not.toMatch(/animate-spin/);
    expect(line.className).toMatch(/min-h-11/);
  });

  it('clears itself on the existing 15 s poll, no faster', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      processing.mockResolvedValueOnce([{ roomId: 'r1', state: 'processing', endedAt: '2026-11-04T10:00:00Z' }]).mockResolvedValue([]);
      render(<Harness summary={chat('dm', 'chat-3')} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('chat-transcription-state')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
      expect(screen.getByTestId('chat-transcription-state'), 'not before the poll').toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(screen.queryByTestId('chat-transcription-state')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('founder look: the live-session Join is the outline variant, not a white outline', () => {
  it('Join', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    const join = await screen.findByRole('button', { name: LIVE_SESSION_JOIN });
    expect(join.className).toMatch(/border-blue-600/);
    expect(join.className).toMatch(/min-h-11/);
  });
});
