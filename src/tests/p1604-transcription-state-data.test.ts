/**
 * P1604 (founder live test): the state of a session's transcript, read member-scoped. Sessions history gets it per room, a chat gets
 * the processing sessions of that chat. A failed read never breaks history or the chat; it reads as "nothing known".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const rows = vi.hoisted(() => ({ sessions: [] as unknown[], seats: [] as unknown[] }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        or: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: rows.sessions, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: t === 'transcribe_room_members' ? rows.seats : rows.sessions, error: null }),
      };
      return chain;
    },
  },
}));

beforeEach(() => {
  rpc.mockReset();
  rows.sessions = [];
  rows.seats = [];
});

describe('getMyRoomStates', () => {
  it('maps each room to its state and chat name', async () => {
    rpc.mockResolvedValue({ data: [
      { room_id: 'r1', state: 'processing', chat_name: 'Ben' },
      { room_id: 'r2', state: 'ready', chat_name: null },
    ], error: null });
    const { getMyRoomStates } = await import('@/app/data/room-transcription-state');
    const map = await getMyRoomStates(['r1', 'r2']);
    expect(rpc).toHaveBeenCalledWith('get_my_room_transcription_states', { p_room_ids: ['r1', 'r2'] });
    expect(map.get('r1')).toEqual({ state: 'processing', chatName: 'Ben' });
    expect(map.get('r2')).toEqual({ state: 'ready', chatName: null });
  });

  it('asks nothing for no rooms', async () => {
    const { getMyRoomStates } = await import('@/app/data/room-transcription-state');
    expect((await getMyRoomStates([])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an unknown state value is "none", never trusted', async () => {
    rpc.mockResolvedValue({ data: [{ room_id: 'r1', state: 'weird', chat_name: null }], error: null });
    const { getMyRoomStates } = await import('@/app/data/room-transcription-state');
    expect((await getMyRoomStates(['r1'])).get('r1')?.state).toBe('none');
  });

  it('a failing read degrades to nothing known; it does not throw', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { getMyRoomStates } = await import('@/app/data/room-transcription-state');
    expect((await getMyRoomStates(['r1'])).size).toBe(0);
    rpc.mockRejectedValue(new Error('network'));
    expect((await getMyRoomStates(['r1'])).size).toBe(0);
  });
});

describe('getChatTranscriptionProcessing', () => {
  it('lists the sessions of this chat whose text is coming or could not be prepared', async () => {
    rpc.mockResolvedValue({ data: [{ room_id: 'r1', state: 'processing', ended_at: '2026-11-04T10:00:00Z' }], error: null });
    const { getChatTranscriptionProcessing } = await import('@/app/data/room-transcription-state');
    expect(await getChatTranscriptionProcessing('chat-1')).toEqual([{ roomId: 'r1', state: 'processing', endedAt: '2026-11-04T10:00:00Z' }]);
    expect(rpc).toHaveBeenCalledWith('get_chat_transcription_processing', { p_conversation_id: 'chat-1' });
  });

  it('drops any row that is not processing or failed, and degrades to none on error', async () => {
    rpc.mockResolvedValue({ data: [{ room_id: 'r1', state: 'ready', ended_at: 'x' }], error: null });
    const { getChatTranscriptionProcessing } = await import('@/app/data/room-transcription-state');
    expect(await getChatTranscriptionProcessing('chat-1')).toEqual([]);
    rpc.mockRejectedValue(new Error('network'));
    expect(await getChatTranscriptionProcessing('chat-1')).toEqual([]);
  });
});

describe('getUserSessions carries the state of a room session', () => {
  it('a room session gets its state and chat name; a plain session is "none"', async () => {
    rows.sessions = [
      { id: 's1', creator_profile_id: 'u1', joiner_profile_id: null, creator_name: 'Ada', joiner_name: null, created_at: '2026-11-04T10:00:00Z',
        is_private: false, live_state: null, transcription_jobs: [] },
      { id: 's2', creator_profile_id: 'u1', joiner_profile_id: 'u2', creator_name: 'Ada', joiner_name: 'Bo', created_at: '2026-11-03T10:00:00Z',
        is_private: false, live_state: { sessionHistory: [{ title: 'Round 1' }] }, transcription_jobs: [] },
    ];
    rows.seats = [{ session_id: 's1', room_id: 'r1' }];
    rpc.mockResolvedValue({ data: [{ room_id: 'r1', state: 'processing', chat_name: 'Ben' }], error: null });
    const { getUserSessions } = await import('@/app/data/sessions-service');
    const list = await getUserSessions('u1');
    const room = list.find((s) => s.id === 's1')!;
    expect(room.roomId).toBe('r1');
    expect(room.transcriptionState).toBe('processing');
    expect(room.chatName).toBe('Ben');
    const plain = list.find((s) => s.id === 's2')!;
    expect(plain.transcriptionState).toBe('none');
    expect(plain.chatName).toBeNull();
  });

  it('history still loads when the state read fails', async () => {
    rows.sessions = [{ id: 's1', creator_profile_id: 'u1', joiner_profile_id: null, creator_name: 'Ada', joiner_name: null,
      created_at: '2026-11-04T10:00:00Z', is_private: false, live_state: null, transcription_jobs: [] }];
    rows.seats = [{ session_id: 's1', room_id: 'r1' }];
    rpc.mockRejectedValue(new Error('network'));
    const { getUserSessions } = await import('@/app/data/sessions-service');
    const list = await getUserSessions('u1');
    expect(list[0].roomId).toBe('r1');
    expect(list[0].transcriptionState).toBe('none');
  });
});
