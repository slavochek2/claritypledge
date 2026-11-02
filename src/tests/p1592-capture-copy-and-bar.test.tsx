/**
 * @file p1592-capture-copy-and-bar.test.tsx
 * @description P1592: the capture wording chooses by whether the capture belongs to an event
 * (the ⓘ line, the consent label, the Transcribe description), and the running bar names the
 * place the server last said the words went — never a client guess, kept across a silent slice,
 * none after a restore. Also the append rule: an UPDATE of a top-level transcription message
 * never schedules a chat-list refetch; every other update still does.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { consentAgreedLabel, whereItGoesText, EVENT_TRANSCRIBE_FIRST_SENTENCE } from '@/app/components/session/capture-copy';
import { parseSliceDestination } from '@/app/data/transcribe-slice-destination';
import { isTranscriptionAppend } from '@/app/pages/chat/chat-refetch';
import type { ChatMessageEvent } from '@/app/data/chat-service';
import { mapMessageRow } from '@/app/data/chat-mappers';

const mockUseRoomCapture = vi.fn();
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => mockUseRoomCapture() }));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false }),
  useOfflineStripShown: () => false,
}));

import { RoomCaptureBar, RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';
import { CaptureInfoButton } from '@/app/components/session/capture-controls';

function capture(over: Record<string, unknown> = {}) {
  return {
    phase: 'capturing', roomId: 'r1', eventId: 'e1', destination: null, open: vi.fn(), endMyCapture: vi.fn(), manualPaused: false,
    pauseMine: vi.fn(), resumeMine: vi.fn(), subscribeLevel: () => () => {}, inputSilent: false, micLost: false, micSwitched: false, stopping: false,
    reconnectMic: vi.fn(), ...over,
  };
}
beforeEach(() => mockUseRoomCapture.mockReset());

describe('P1592 copy selection', () => {
  it('the event ⓘ line is the approved wording; the non-event line is today\'s text', () => {
    expect(whereItGoesText(true)).toBe("live text stays here. After each round, a clean version is posted to your round's thread, where the host and attendees can read it. Anything said outside a round is posted after the room ends. The audio is kept so the conversation can be transcribed.");
    expect(whereItGoesText(false)).toBe('the text appears for everyone in this room, and the audio is kept so the whole conversation can be transcribed afterwards.');
  });
  it('the consent label changes only for an event room', () => {
    expect(consentAgreedLabel(true)).toBe("Recorded. A clean transcript is posted to this event's channel after each round. Anything said outside a round is posted after the room ends.");
    expect(consentAgreedLabel(false)).toBe('Recorded and visible to everyone in this room');
  });
  it('the idle bar\'s Transcribe button is described by the new sentence, with no contradicting "share transcript" line', () => {
    mockUseRoomCapture.mockReturnValue({ ...capture({ phase: 'idle' }), isCapturingForEvent: () => false, startCapture: vi.fn() });
    render(<RoomTranscribeIdleBar eventId="ev-1" displayName="Ana" onFailed={() => {}} />);
    const button = screen.getByTestId('room-transcribe-start');
    expect(button).toHaveAccessibleDescription(expect.stringContaining(EVENT_TRANSCRIBE_FIRST_SENTENCE));
    expect(button).toHaveAccessibleDescription(expect.not.stringContaining('share transcript with others in the room'));
    expect(EVENT_TRANSCRIBE_FIRST_SENTENCE).toBe("After each round, a clean version is posted to your round's thread, where the host and attendees can read it. Anything said outside a round is posted after the room ends.");
  });
  it('the ⓘ popover renders the chosen line', () => {
    mockUseRoomCapture.mockReturnValue(capture());
    const { unmount } = render(<CaptureInfoButton forEvent />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet')).toHaveTextContent("posted to your round's thread");
    unmount();
    render(<CaptureInfoButton />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet')).toHaveTextContent('appears for everyone in this room');
  });
});

describe('P1592 the bar names the destination', () => {
  it('shows the label as a place name with a title attribute for truncation', () => {
    mockUseRoomCapture.mockReturnValue(capture({ eventId: null, destination: { kind: 'round', label: 'Round 2 · Anna & Ben' } }));
    render(<RoomCaptureBar short />);
    const el = screen.getByTestId('capture-destination');
    expect(el).toHaveTextContent('Round 2 · Anna & Ben');
    expect(el).toHaveAttribute('title', 'Round 2 · Anna & Ben');
    expect(el.className).toContain('truncate');
  });
  it('names the event channel when not seated', () => {
    mockUseRoomCapture.mockReturnValue(capture({ eventId: null, destination: { kind: 'channel', label: 'Mastermind' } }));
    render(<RoomCaptureBar />);
    expect(screen.getByTestId('capture-destination')).toHaveTextContent('Mastermind');
  });
  it('during event capture names no place, so nothing implies words go to a thread or channel live', () => {
    mockUseRoomCapture.mockReturnValue(capture({ destination: { kind: 'round', label: 'Round 2 · Anna & Ben' } }));
    render(<RoomCaptureBar short />);
    expect(screen.queryByTestId('capture-destination')).not.toBeInTheDocument();
  });
  it('names nothing before the first line, after a restore, or for kind none', () => {
    mockUseRoomCapture.mockReturnValue(capture({ destination: null }));
    const { unmount } = render(<RoomCaptureBar short />);
    expect(screen.queryByTestId('capture-destination')).not.toBeInTheDocument();
    unmount();
    mockUseRoomCapture.mockReturnValue(capture({ destination: { kind: 'none', label: null } }));
    render(<RoomCaptureBar short />);
    expect(screen.queryByTestId('capture-destination')).not.toBeInTheDocument();
  });
});

describe('P1592 slice response parsing', () => {
  it('reads the additive destination and treats anything malformed or absent as "none told"', () => {
    expect(parseSliceDestination({ text: 'x', destination: { kind: 'round', label: 'Round 1 · A & B' } })).toEqual({ kind: 'round', label: 'Round 1 · A & B' });
    expect(parseSliceDestination({ text: '', stripped: 0 })).toBeNull();
    expect(parseSliceDestination({ destination: null })).toBeNull();
    expect(parseSliceDestination({ destination: { kind: 'elsewhere', label: 'x' } })).toBeNull();
    expect(parseSliceDestination(null)).toBeNull();
  });
});

describe('P1592 append rule (Cost Budget)', () => {
  const event = (type: 'INSERT' | 'UPDATE', over: Record<string, unknown>): ChatMessageEvent => ({
    type,
    message: mapMessageRow({
      id: 'm', conversation_id: 'c', author_id: 'u', body: 'b', created_at: 'x', edited_at: null, deleted_at: null, reply_to_id: null, thread_root_id: null,
      forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null, ...over,
    }),
  });
  it('an UPDATE of a top-level transcription message is an append: no refetch', () => {
    expect(isTranscriptionAppend(event('UPDATE', { is_transcription: true }))).toBe(true);
  });
  it('every other event keeps refetching', () => {
    expect(isTranscriptionAppend(event('UPDATE', {}))).toBe(false); // an edited typed message
    expect(isTranscriptionAppend(event('UPDATE', { is_transcription: true, deleted_at: 'x' }))).toBe(false); // a delete still refetches
    expect(isTranscriptionAppend(event('INSERT', { is_transcription: true }))).toBe(false); // a new top-level post
  });
});

describe('P1592 the serial sender hands the send result to onSuccess', () => {
  it('passes what sendAudioSlice returned (the destination), and undefined results stay harmless', async () => {
    const { createSerialSender } = await import('@/lib/audio/slice-recorder');
    const told: unknown[] = [];
    const send = createSerialSender<{ kind: string } | null>(
      (_wav, sequence) => Promise.resolve(sequence === 0 ? { kind: 'round' } : null),
      { onSuccess: (_s, r) => told.push(r) },
    );
    send(new Uint8Array(1), 0);
    send(new Uint8Array(1), 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(told).toEqual([{ kind: 'round' }, null]);
  });
});
