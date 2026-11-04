/**
 * @file p1604-provider-session-rules.test.tsx
 * @description P1604 at the provider: rule 7 (starting somewhere else stops the recording here and says so), rule 9 (a start
 * during a Stop waits for it; a join that finishes after the phase changed releases the seat; chats are told apart by
 * identity, not eventId), rule 8 (a refused slice that carries `movedTo` moves the capture to Part 2 without releasing the
 * microphone) and rule 5 (a paused phone learns that its room ended).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const endRpc = vi.hoisted(() => vi.fn());
const createRoom = vi.hoisted(() => vi.fn());
const touch = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => vi.fn());
const sender = vi.hoisted(() => ({ onError: null as ((err: unknown, seq: number) => void) | null }));
const slices = vi.hoisted(() => ({ rooms: [] as string[], started: 0 }));

vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel, send: vi.fn() };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});
vi.mock('@/app/data/transcribe-service', () => ({
  createRoom,
  joinRoom: vi.fn(),
  endMyCapture: endRpc,
  prewarmSlicePath: vi.fn().mockResolvedValue(undefined),
  reserveRoomChunkNumber: vi.fn().mockResolvedValue(0),
  sendAudioSlice: vi.fn(),
  touchRoomCapture: touch,
}));
vi.mock('@/app/data/transcribe-capture-status', () => ({
  getMyCaptureStatus: vi.fn().mockImplementation(async () => ({
    joinedAt: new Date().toISOString(), roomCreatedAt: new Date().toISOString(), captureEndedAt: null, roomEndedAt: null,
  })),
  getCaptureRoomState: vi.fn().mockResolvedValue({ ended: false, movedTo: null }),
  ROOM_ENTRY_TIMEOUT_MS: 15_000,
}));
vi.mock('@/app/data/api', () => ({ uploadRoomAudioChunk: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/audio/slice-recorder', () => ({
  createSerialSender: (_send: unknown, opts: { onError: (err: unknown, seq: number) => void }) => {
    sender.onError = opts.onError;
    return vi.fn();
  },
  createSliceRecorder: vi.fn().mockImplementation(async () => {
    slices.started += 1;
    return { stop: vi.fn() };
  }),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: vi.fn().mockResolvedValue({ acquired: true, release: vi.fn() }),
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';
import { SliceRefusedError } from '@/app/data/transcribe-slice-destination';
import { STOPPED_ELSEWHERE_NOTICE, ROOM_ENDED_NOTICE } from '@/app/components/session/capture-copy';

let ctx: ReturnType<typeof useRoomCapture>;
function Harness() {
  ctx = useRoomCapture();
  return null;
}
const tree = () => (
  <MemoryRouter initialEntries={['/chat']}>
    <RoomCaptureProvider><Harness /></RoomCaptureProvider>
  </MemoryRouter>
);

function roomFor(n: number, conversationId: string | null) {
  return {
    room: { id: `r${n}`, code: `CODE${n}`, eventId: null, conversationId, createdAt: new Date().toISOString(), partNo: 1 },
    member: { id: `m${n}`, consentGivenAt: new Date().toISOString(), joinedAt: new Date().toISOString(), displayName: 'A' },
  };
}

beforeEach(() => {
  endRpc.mockReset().mockResolvedValue(undefined);
  createRoom.mockReset();
  touch.mockReset().mockResolvedValue({ roomEnded: false, movedTo: null });
  toastFn.mockReset();
  sender.onError = null;
  slices.started = 0;
  localStorage.clear();
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockImplementation(async () => ({ getTracks: () => [{ stop: vi.fn(), onended: null }] })) },
  });
});

describe('rule 7 + rule 9: starting in another chat', () => {
  it('stops the recording in the first chat, says so, and enters the second by conversation id', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1')).mockResolvedValueOnce(roomFor(2, 'chat-2'));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    expect(ctx.conversationId).toBe('chat-1');

    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-2', displayName: 'A' }); });

    expect(endRpc).toHaveBeenCalledWith('r1');
    expect(toastFn).toHaveBeenCalledWith(STOPPED_ELSEWHERE_NOTICE);
    expect(createRoom).toHaveBeenLastCalledWith('u1', 'A', true, { eventId: null, conversationId: 'chat-2' });
    expect(ctx.roomId).toBe('r2');
    expect(ctx.conversationId).toBe('chat-2');
  });

  it('the same chat again is the capture that already exists: nothing is ended, nothing is entered again', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1'));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    let again: Awaited<ReturnType<typeof ctx.startCapture>> | undefined;
    await act(async () => { again = await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    expect(again?.started).toBe(true);
    expect(again?.room?.id).toBe('r1');
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(endRpc).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });
});

describe('rule 9: a Stop in flight, and a join that finishes late', () => {
  it('a start during a Stop waits for the End to reach the server before it enters anything', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1')).mockResolvedValueOnce(roomFor(2, 'chat-2'));
    let releaseEnd: () => void = () => undefined;
    endRpc.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseEnd = resolve; }));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });

    let started: Promise<unknown> = Promise.resolve();
    await act(async () => {
      void ctx.endMyCapture('r1');
      started = ctx.startCapture({ eventId: null, conversationId: 'chat-2', displayName: 'A' });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(createRoom, 'the second start has not entered yet: the Stop is still in flight').toHaveBeenCalledTimes(1);

    await act(async () => { releaseEnd(); await started; });
    expect(createRoom).toHaveBeenCalledTimes(2);
    expect(ctx.roomId).toBe('r2');
  });

  it('a join that finishes after a Stop released the seat, and does not open the microphone', async () => {
    let resolveJoin: (v: ReturnType<typeof roomFor>) => void = () => undefined;
    createRoom.mockImplementationOnce(() => new Promise((resolve) => { resolveJoin = resolve; }));
    render(tree());
    let started: Promise<Awaited<ReturnType<typeof ctx.startCapture>>> = Promise.resolve({ started: false });
    await act(async () => { started = ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    expect(ctx.phase).toBe('starting');
    await act(async () => { void ctx.endMyCapture('r-none'); });   // Stop pressed while the join is still in flight
    let result: Awaited<ReturnType<typeof ctx.startCapture>> | undefined;
    await act(async () => { resolveJoin(roomFor(9, 'chat-1')); result = await started; });
    expect(result?.started).toBe(false);
    expect(endRpc).toHaveBeenCalledWith('r9');   // the seat is released on the server
    expect(slices.started, 'the microphone and the tap never opened').toBe(0);
    expect(ctx.phase).toBe('idle');
  });
});

describe('rule 8: the roll moves the capture to Part 2 without releasing the microphone', () => {
  it('a refused slice that carries movedTo continues in the next room', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1'));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    expect(slices.started).toBe(1);

    await act(async () => {
      sender.onError?.(new SliceRefusedError('transcribe-slice 410: This room has ended', 410,
        { roomId: 'r2', roomCode: 'ZZZ999', memberId: 'm2' }), 5);
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(ctx.roomId).toBe('r2');
    expect(ctx.roomCode).toBe('ZZZ999');
    expect(ctx.phase).toBe('capturing');
    expect(slices.started, 'the tap is started again, on the same microphone, for the new room').toBe(2);
    expect(JSON.parse(localStorage.getItem('cp_room_capture') ?? '{}')).toMatchObject({ roomId: 'r2', roomCode: 'ZZZ999', memberId: 'm2' });
  });

  it('a refused slice with no movedTo is still a hard stop', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1'));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    await act(async () => {
      sender.onError?.(new SliceRefusedError('transcribe-slice 410: This room has ended', 410, null), 5);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(ctx.phase).toBe('idle');
  });
});

describe('rule 5: a paused phone learns that its room ended', () => {
  it('the heartbeat says the room ended: the capture stops and the person is told', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1'));
    touch.mockResolvedValue({ roomEnded: true, movedTo: null });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    await act(async () => { ctx.pauseMine(); await new Promise((r) => setTimeout(r, 30)); });
    expect(touch).toHaveBeenCalledWith('r1');
    expect(toastFn).toHaveBeenCalledWith(ROOM_ENDED_NOTICE);
    expect(ctx.phase).toBe('idle');
  });

  it('a live room leaves the pause alone', async () => {
    createRoom.mockResolvedValueOnce(roomFor(1, 'chat-1'));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    await act(async () => { ctx.pauseMine(); await new Promise((r) => setTimeout(r, 30)); });
    expect(ctx.phase).toBe('paused');
    expect(toastFn).not.toHaveBeenCalled();
  });
});
