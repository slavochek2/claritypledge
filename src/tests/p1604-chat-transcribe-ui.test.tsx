/**
 * P1604 UI: the three-dot "Transcribe" item (not in the mirror), the explanation box the FIRST time a person transcribes in a chat
 * (consent itself is the terms; the server still records it on the tap), and the live-session line ("{name} is transcribing", Join).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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
import { CHAT_EXPLANATION, liveSessionLine, LIVE_SESSION_JOIN, TRANSCRIPT_FAILED, TRANSCRIPT_PROCESSING } from '@/app/components/session/capture-copy';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';

const chat = (kind: ChatSummary['kind'], id = 'chat-1'): ChatSummary => ({ conversationId: id, kind } as ChatSummary);

function Harness({ summary, tick = 0 }: { summary: ChatSummary; tick?: number }) {
  void tick;
  return (
    <MemoryRouter>
      <ChatTranscribe chat={summary}>
        {(onTranscribe) => (
          <DropdownMenu open modal={false}>
            <DropdownMenuContent><TranscribeMenuItem chat={summary} onTranscribe={onTranscribe} /></DropdownMenuContent>
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
  seated.mockReset().mockResolvedValue(false);
  processing.mockReset().mockResolvedValue([]);
  toastFn.mockReset();
  toastFn.error = vi.fn();
});

describe('the three-dot item', () => {
  it.each(['dm', 'group', 'event'] as const)('is there for a %s chat', async (kind) => {
    render(<Harness summary={chat(kind)} />);
    expect(await screen.findByRole('menuitem', { name: /transcribe/i })).toBeTruthy();
  });

  it('is not there for the mirror', async () => {
    render(<Harness summary={chat('mirror')} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('menuitem', { name: /transcribe/i })).toBeNull();
  });

  it('is at least 44px high', async () => {
    render(<Harness summary={chat('dm')} />);
    const item = await screen.findByRole('menuitem', { name: /transcribe/i });
    expect(item.className).toMatch(/min-h-11/);
  });
});

describe('consent comes before anything records', () => {
  it('tapping the item opens the consent and starts nothing', async () => {
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    expect(await screen.findByText(CHAT_EXPLANATION.title)).toBeTruthy();
    expect(screen.getByText(CHAT_EXPLANATION.body)).toBeTruthy();
    expect(startCapture).not.toHaveBeenCalled();
  });

  it('"Not now" starts nothing', async () => {
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    fireEvent.click(await screen.findByRole('button', { name: CHAT_EXPLANATION.cancel }));
    await waitFor(() => expect(screen.queryByText(CHAT_EXPLANATION.title)).toBeNull());
    expect(startCapture).not.toHaveBeenCalled();
  });

  it('the one primary action starts the capture in THIS chat, with the person\'s name', async () => {
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    fireEvent.click(await screen.findByRole('button', { name: CHAT_EXPLANATION.confirm }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    expect(startCapture).toHaveBeenCalledWith({ eventId: null, conversationId: 'chat-7', displayName: 'Ada' });
    await waitFor(() => expect(screen.queryByText(CHAT_EXPLANATION.title)).toBeNull());
  });

  it('a start that fails says so and does not pretend', async () => {
    startCapture.mockResolvedValue({ started: false, reason: 'microphone' });
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    fireEvent.click(await screen.findByRole('button', { name: CHAT_EXPLANATION.confirm }));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
  });

  it('both buttons are at least 44px high; exactly one is the primary action', async () => {
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    const confirm = await screen.findByRole('button', { name: CHAT_EXPLANATION.confirm });
    const cancel = screen.getByRole('button', { name: CHAT_EXPLANATION.cancel });
    expect(confirm.className).toMatch(/min-h-11/);
    expect(cancel.className).toMatch(/min-h-11/);
    expect(confirm.className).toMatch(/bg-primary|bg-blue/);
    expect(cancel.className).not.toMatch(/bg-primary|bg-blue/);
  });
});

describe('the live-session line', () => {
  it('names who is transcribing and offers Join, which asks for consent first', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    expect(await screen.findByText(liveSessionLine('Bo'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: LIVE_SESSION_JOIN }));
    expect(await screen.findByText(CHAT_EXPLANATION.title)).toBeTruthy();
    expect(startCapture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: CHAT_EXPLANATION.confirm }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledWith({ eventId: null, conversationId: 'chat-3', displayName: 'Ada' }));
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

  it('never asks the server about the mirror', async () => {
    render(<Harness summary={chat('mirror')} />);
    await act(async () => { await Promise.resolve(); });
    expect(live).not.toHaveBeenCalled();
  });
});

describe('review 9: same target, and the live line follows the capture', () => {
  const eventChat = { conversationId: 'chat-ev', kind: 'event', event: { id: 'ev-1', slug: 's', title: 'T', datetime: '2026-11-04T10:00:00Z' } } as unknown as ChatSummary;

  it('an event chat passes its event, so recording that event\'s room from the event page is the same place', async () => {
    render(<Harness summary={eventChat} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    fireEvent.click(await screen.findByRole('button', { name: CHAT_EXPLANATION.confirm }));
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

describe('review 10: the confirm button shows it is working', () => {
  it('says "Starting…" and is disabled until the start answers', async () => {
    let finish: (v: unknown) => void = () => undefined;
    startCapture.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    fireEvent.click(await screen.findByRole('button', { name: CHAT_EXPLANATION.confirm }));
    const busy = await screen.findByRole('button', { name: CHAT_EXPLANATION.starting });
    expect(busy).toBeDisabled();
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: CHAT_EXPLANATION.cancel })).toBeDisabled();
    await act(async () => { finish({ started: true }); });
    await waitFor(() => expect(screen.queryByText(CHAT_EXPLANATION.title)).toBeNull());
  });

  it('uses the design system\'s default (blue) variant for the one primary action and ghost for Not now', async () => {
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    const confirm = await screen.findByRole('button', { name: CHAT_EXPLANATION.confirm });
    expect(confirm.className).toMatch(/bg-blue-600/);   // the default variant: filled blue (design-system rule 7)
    expect(confirm.className).not.toMatch(/bg-(red|green|amber|orange|yellow|purple)/);
    expect(screen.getByRole("button", { name: CHAT_EXPLANATION.cancel }).className).not.toMatch(/bg-blue-600/);
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

  it('nothing when nothing is processing, and never for the mirror', async () => {
    render(<Harness summary={chat('dm', 'chat-3')} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('chat-transcription-state')).toBeNull();
    render(<Harness summary={chat('mirror', 'chat-m')} />);
    await act(async () => { await Promise.resolve(); });
    expect(processing).not.toHaveBeenCalledWith('chat-m');
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

describe('founder copy and layout, 2026-11-04: the consent dialog', () => {
  async function openConsent() {
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    return screen.findByTestId('chat-transcribe-explanation');
  }

  it('asks "Post a transcript here?" and says it in two plain sentences', async () => {
    const dialog = await openConsent();
    expect(CHAT_EXPLANATION.title).toBe('Post a transcript here?');
    expect(within(dialog).getByText('Post a transcript here?')).toBeTruthy();
    expect(CHAT_EXPLANATION.body).toBe('Your microphone is recorded and kept. The transcript posts here as a thread that everyone in here can read, even people not here now.');
    expect(within(dialog).getByText(CHAT_EXPLANATION.body)).toBeTruthy();
  });

  it('the timing and the reason audio is kept sit behind an info icon, not in the body', async () => {
    const dialog = await openConsent();
    expect(dialog.textContent).not.toContain('about 2 minutes');
    fireEvent.click(within(dialog).getByRole('button', { name: /more information|about this/i }));
    expect(CHAT_EXPLANATION.info).toBe('The thread appears about 2 minutes after the session ends. Audio is kept so it can be transcribed.');
    expect(await screen.findByText(CHAT_EXPLANATION.info)).toBeTruthy();
  });

  it('the info icon is a 44px target', async () => {
    const dialog = await openConsent();
    expect(within(dialog).getByRole('button', { name: /more information|about this/i }).className).toMatch(/h-11/);
  });

  it('has no X: the two buttons are the only ways out (plus Escape)', async () => {
    const dialog = await openConsent();
    expect(within(dialog).queryByRole('button', { name: /^close$/i })).toBeNull();
    expect(dialog.querySelector('svg.lucide-x')).toBeNull();
  });

  it('the two buttons sit side by side on a phone too: a row at every width, each taking half', async () => {
    const dialog = await openConsent();
    const confirm = within(dialog).getByRole('button', { name: CHAT_EXPLANATION.confirm });
    const cancel = within(dialog).getByRole('button', { name: CHAT_EXPLANATION.cancel });
    const footer = confirm.parentElement as HTMLElement;
    expect(cancel.parentElement).toBe(footer);
    expect(footer.className).toMatch(/(^|\s)flex-row(\s|$)/);
    expect(footer.className).not.toMatch(/(^|\s)flex-col/);
    expect(confirm.className).toMatch(/flex-1/);
    expect(cancel.className).toMatch(/flex-1/);
  });
});

describe('founder decision: the box is shown once per chat, derived from the server', () => {
  it('first time here (no seat in any room of this chat): the box opens and nothing starts', async () => {
    seated.mockResolvedValue(false);
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    expect(await screen.findByText(CHAT_EXPLANATION.title)).toBeTruthy();
    expect(seated).toHaveBeenCalledWith('chat-7', 'u1', null);
    expect(startCapture).not.toHaveBeenCalled();
  });

  it('after that, one tap starts, with no box', async () => {
    seated.mockResolvedValue(true);
    render(<Harness summary={chat('group', 'chat-7')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledWith({ eventId: null, conversationId: 'chat-7', displayName: 'Ada' }));
    expect(screen.queryByText(CHAT_EXPLANATION.title)).toBeNull();
  });

  it('Join on the live line is the same: one tap once they have been here before', async () => {
    seated.mockResolvedValue(true);
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    fireEvent.click(await screen.findByRole('button', { name: LIVE_SESSION_JOIN }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(CHAT_EXPLANATION.title)).toBeNull();
  });

  it('a failed lookup shows the box (never skips it on doubt)', async () => {
    seated.mockRejectedValue(new Error('network'));
    render(<Harness summary={chat('group')} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    expect(await screen.findByText(CHAT_EXPLANATION.title)).toBeTruthy();
    expect(startCapture).not.toHaveBeenCalled();
  });

  it('the box wording is unchanged and carries no founder-decision mark', async () => {
    expect(CHAT_EXPLANATION.title).toBe('Post a transcript here?');
    const src = (await import('node:fs')).readFileSync('src/app/components/session/capture-copy.ts', 'utf8');
    const block = src.slice(src.lastIndexOf('/**', src.indexOf('export const CHAT_EXPLANATION')), src.indexOf('export const CHAT_EXPLANATION'));
    expect(block).not.toMatch(/FOUNDER DECISION/);
  });
});

describe('last review: the seen check', () => {
  it('an event chat passes its event too (a seat in the event\'s room counts)', async () => {
    seated.mockResolvedValue(false);
    const ev = { conversationId: 'chat-e', kind: 'event', event: { id: 'ev-1' } } as unknown as ChatSummary;
    render(<Harness summary={ev} />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await screen.findByText(CHAT_EXPLANATION.title);
    expect(seated).toHaveBeenCalledWith('chat-e', 'u1', 'ev-1');
  });

  it('a second tap while the seen check is in flight starts nothing more', async () => {
    let answer: (v: boolean) => void = () => undefined;
    seated.mockImplementation(() => new Promise<boolean>((r) => { answer = r; }));
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    const join = await screen.findByRole('button', { name: LIVE_SESSION_JOIN });
    fireEvent.click(join);
    fireEvent.click(join);
    fireEvent.click(await screen.findByRole('menuitem', { name: /transcribe/i }));
    await act(async () => { answer(true); await Promise.resolve(); });
    await waitFor(() => expect(startCapture).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(seated, 'one check').toHaveBeenCalledTimes(1);
    expect(startCapture, 'one start').toHaveBeenCalledTimes(1);
  });
});

describe('founder look: the live-session Join is the filled secondary variant, not a white outline', () => {
  it('Join', async () => {
    live.mockResolvedValue({ roomId: 'r9', roomCode: 'ZZZ999', starterName: 'Bo', recordingCount: 1, iAmRecording: false });
    render(<Harness summary={chat('dm', 'chat-3')} />);
    const join = await screen.findByRole('button', { name: LIVE_SESSION_JOIN });
    expect(join.className).toMatch(/bg-secondary/);
    expect(join.className).not.toMatch(/border-input|bg-background/);
    expect(join.className).toMatch(/min-h-11/);
  });
});
