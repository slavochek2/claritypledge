/**
 * P1604 client data layer: createRoom passes the chat, rooms carry their chat and part, the paused heartbeat reads the
 * room's state, a refused slice carries where the roll moved the caller, and history prefers clean text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SliceRefusedError as RefusedError } from '@/app/data/transcribe-slice-destination';

const rpc = vi.fn();
const fromRows: Record<string, unknown> = {};
const fromOne: Record<string, unknown> = {};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: fromRows[t] ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: fromOne[t] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: fromRows[t] ?? [], error: null }),
      };
      return chain;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));
vi.mock('@/app/data/api', async (orig) => {
  const actual = await orig<typeof import('@/app/data/api')>();
  return { ...actual, createClaritySession: vi.fn(() => Promise.resolve({ id: 'sess-1' })) };
});

const enterRow = {
  room_id: 'room-1', room_code: 'ABC234', room_event_id: null, room_created_at: '2026-11-03T10:00:00Z', room_ended_at: null,
  member_id: 'm1', member_profile_id: 'u1', member_display_name: 'Ada', member_session_id: 'sess-1',
  member_joined_at: '2026-11-03T10:00:00Z', member_consent_given_at: '2026-11-03T10:00:00Z',
  room_conversation_id: 'chat-1', room_part_no: 1,
};

beforeEach(() => {
  rpc.mockReset();
  for (const k of Object.keys(fromRows)) Reflect.deleteProperty(fromRows, k);
  for (const k of Object.keys(fromOne)) Reflect.deleteProperty(fromOne, k);
});

describe('createRoom', () => {
  it('passes the chat to enter_transcribe_room and returns the room\'s chat and part', async () => {
    rpc.mockResolvedValue({ data: [enterRow], error: null });
    const { createRoom } = await import('@/app/data/transcribe-service');
    const { room } = await createRoom('u1', 'Ada', true, { conversationId: 'chat-1' });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('enter_transcribe_room');
    expect(args).toMatchObject({ p_conversation_id: 'chat-1', p_event_id: null, p_consent: true });
    expect(room.conversationId).toBe('chat-1');
    expect(room.partNo).toBe(1);
  });

  it('still takes an event id as a plain string (the event room page)', async () => {
    rpc.mockResolvedValue({ data: [{ ...enterRow, room_event_id: 'ev-1', room_conversation_id: null }], error: null });
    const { createRoom } = await import('@/app/data/transcribe-service');
    const { room } = await createRoom('u1', 'Ada', true, 'ev-1');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_event_id: 'ev-1', p_conversation_id: null });
    expect(room.eventId).toBe('ev-1');
  });

  it('a plain start sends neither id (the server makes a new room each time)', async () => {
    rpc.mockResolvedValue({ data: [{ ...enterRow, room_conversation_id: null }], error: null });
    const { createRoom } = await import('@/app/data/transcribe-service');
    await createRoom('u1', 'Ada', true);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_event_id: null, p_conversation_id: null });
  });
});

describe('touchRoomCapture: the heartbeat returns the room\'s state', () => {
  it('a room that ended', async () => {
    rpc.mockResolvedValue({ data: [{ room_ended: true, moved_to_room_id: null, moved_to_room_code: null, moved_to_member_id: null }], error: null });
    const { touchRoomCapture } = await import('@/app/data/transcribe-service');
    expect(await touchRoomCapture('room-1')).toEqual({ roomEnded: true, movedTo: null });
  });

  it('a person the roll moved', async () => {
    rpc.mockResolvedValue({ data: [{ room_ended: true, moved_to_room_id: 'room-2', moved_to_room_code: 'ZZZ999', moved_to_member_id: 'm2' }], error: null });
    const { touchRoomCapture } = await import('@/app/data/transcribe-service');
    expect(await touchRoomCapture('room-1')).toEqual({ roomEnded: true, movedTo: { roomId: 'room-2', roomCode: 'ZZZ999', memberId: 'm2' } });
  });

  it('a live room', async () => {
    rpc.mockResolvedValue({ data: [{ room_ended: false, moved_to_room_id: null, moved_to_room_code: null, moved_to_member_id: null }], error: null });
    const { touchRoomCapture } = await import('@/app/data/transcribe-service');
    expect(await touchRoomCapture('room-1')).toEqual({ roomEnded: false, movedTo: null });
  });

  it('an older server that returns nothing reads as "nothing known", not as ended', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { touchRoomCapture } = await import('@/app/data/transcribe-service');
    expect(await touchRoomCapture('room-1')).toEqual({ roomEnded: false, movedTo: null });
  });
});

describe('a refused slice says where the roll moved the caller', () => {
  it('a 410 body with movedTo becomes an error that carries it and still reads as a hard stop', async () => {
    const { settleSliceResponse, SliceRefusedError } = await import('@/app/data/transcribe-slice-destination');
    const { isHardStopError } = await import('@/app/contexts/room-capture-storage');
    const response = new Response(JSON.stringify({
      error: 'This room has ended', movedTo: { roomId: 'room-2', roomCode: 'ZZZ999', memberId: 'm2' },
    }), { status: 410 });
    const err = await settleSliceResponse(response, 1000).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(SliceRefusedError);
    expect((err as RefusedError).movedTo).toEqual({ roomId: 'room-2', roomCode: 'ZZZ999', memberId: 'm2' });
    expect(isHardStopError(err)).toBe(true);
  });

  it('a 410 with no movedTo carries null', async () => {
    const { settleSliceResponse } = await import('@/app/data/transcribe-slice-destination');
    const response = new Response(JSON.stringify({ error: 'This room has ended', movedTo: null }), { status: 410 });
    const err = await settleSliceResponse(response, 1000).then(() => null, (e: unknown) => e);
    expect((err as RefusedError).movedTo).toBeNull();
  });

  it('a malformed movedTo is ignored, never trusted', async () => {
    const { settleSliceResponse } = await import('@/app/data/transcribe-slice-destination');
    const response = new Response(JSON.stringify({ error: 'x', movedTo: { roomId: 5 } }), { status: 410 });
    const err = await settleSliceResponse(response, 1000).then(() => null, (e: unknown) => e);
    expect((err as RefusedError).movedTo).toBeNull();
  });
});

describe('history: clean text when any exists, the older text otherwise', () => {
  it('prefers the clean rows of the jobs the caller was part of, in spoken order', async () => {
    rpc.mockResolvedValue({
      data: [
        { job_id: 'j1', member_id: 'm2', display_name: 'Bo', chunk_ms: 1_000_060_000, text: 'second' },
        { job_id: 'j1', member_id: 'm1', display_name: 'Ada', chunk_ms: 1_000_000_000, text: 'first' },
      ],
      error: null,
    });
    const { fetchRoomTranscript } = await import('@/app/data/api');
    const result = await fetchRoomTranscript('room-1');
    expect(rpc).toHaveBeenCalledWith('get_my_clean_transcript', { p_room_id: 'room-1' });
    expect(result?.source).toBe('final');
    expect(result?.segments.map((s) => `${s.speakerLabel}: ${s.text}`)).toEqual(['Ada: first', 'Bo: second']);
    expect(result?.segments[0].startMs).toBe(0);
    expect(result?.segments[1].startMs).toBe(60_000);
  });

  it('marks a speaker whose audio did not all arrive (decision 4), and only that speaker', async () => {
    rpc.mockResolvedValue({
      data: [
        { job_id: 'j1', member_id: 'm1', display_name: 'Ada', chunk_ms: 1_000_000_000, text: 'whole', incomplete: false },
        { job_id: 'j1', member_id: 'm2', display_name: 'Bo', chunk_ms: 1_000_060_000, text: 'cut short', incomplete: true },
      ],
      error: null,
    });
    const { fetchRoomTranscript } = await import('@/app/data/api');
    const result = await fetchRoomTranscript('room-1');
    expect(result?.segments.map((s) => s.fromIncompleteRecording)).toEqual([false, true]);
  });

  it('falls back to the older text when there is no clean text', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    fromRows.transcribe_room_members = [{ id: 'm1', display_name: 'Ada' }];
    fromRows.transcribe_messages = [{ id: 'x1', room_id: 'room-1', member_id: 'm1', text: 'older words', spoken_at: '2026-11-03T10:00:00Z', is_final: true }];
    const { fetchRoomTranscript } = await import('@/app/data/api');
    const result = await fetchRoomTranscript('room-1');
    expect(result?.segments.map((s) => s.text)).toContain('older words');
  });

  it('a failing clean read never hides the older text', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    fromRows.transcribe_room_members = [{ id: 'm1', display_name: 'Ada' }];
    fromRows.transcribe_messages = [{ id: 'x1', room_id: 'room-1', member_id: 'm1', text: 'older words', spoken_at: '2026-11-03T10:00:00Z', is_final: true }];
    const { fetchRoomTranscript } = await import('@/app/data/api');
    const result = await fetchRoomTranscript('room-1');
    expect(result?.segments.map((s) => s.text)).toContain('older words');
  });
});

describe('getCaptureRoomState: has my room ended, and did the roll seat me in the next one?', () => {
  it('a rolled room: ended, with the seat I was given', async () => {
    fromOne.transcribe_rooms = { id: 'room-1', ended_at: '2026-11-04T10:00:00Z', code: 'ZZZ999' };
    fromOne.transcribe_room_members = { id: 'm2' };
    const { getCaptureRoomState } = await import('@/app/data/transcribe-capture-status');
    const state = await getCaptureRoomState('room-1', 'u1');
    expect(state.ended).toBe(true);
    expect(state.movedTo).toEqual({ roomId: 'room-1', roomCode: 'ZZZ999', memberId: 'm2' });
  });
  it('a room that simply ended has no seat to follow', async () => {
    fromOne.transcribe_rooms = { id: 'room-1', ended_at: '2026-11-04T10:00:00Z' };
    const { getCaptureRoomState } = await import('@/app/data/transcribe-capture-status');
    expect(await getCaptureRoomState('room-1', 'u1')).toEqual({ ended: true, movedTo: null });
  });
  it('a live room is not ended and not moved', async () => {
    fromOne.transcribe_rooms = { id: 'room-1', ended_at: null };
    const { getCaptureRoomState } = await import('@/app/data/transcribe-capture-status');
    expect(await getCaptureRoomState('room-1', 'u1')).toEqual({ ended: false, movedTo: null });
  });
});
