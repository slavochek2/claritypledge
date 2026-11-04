/**
 * @file p1604-review-provider.test.tsx
 * @description P1604 code-review findings at the provider: 2 (an archive refusal follows the move instead of stopping), 5 (a Stop
 * during the lock wait never opens the microphone; a refused lock in a move shows tapDown; a periodic room-state check follows a
 * move whose slices cannot say so), 6 (a Stop during a move ends the Part 2 seat too) and 7 (a reload around a roll re-attaches to
 * the moved seat).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const endRpc = vi.hoisted(() => vi.fn());
const createRoom = vi.hoisted(() => vi.fn());
const roomState = vi.hoisted(() => vi.fn());
const captureStatus = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const lock = vi.hoisted(() => vi.fn());
const rec = vi.hoisted(() => ({ onArchiveChunk: null as ((w: Uint8Array, tail: boolean) => void) | null, started: 0 }));
const gum = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: vi.fn() }));
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
  touchRoomCapture: vi.fn().mockResolvedValue({ roomEnded: false, movedTo: null }),
}));
vi.mock('@/app/data/transcribe-capture-status', () => ({
  getMyCaptureStatus: captureStatus,
  getCaptureRoomState: roomState,
  ROOM_ENTRY_TIMEOUT_MS: 15_000,
}));
vi.mock('@/app/data/api', () => ({ uploadRoomAudioChunk: upload }));
vi.mock('@/lib/audio/slice-recorder', () => ({
  createSerialSender: () => vi.fn(),
  createSliceRecorder: vi.fn().mockImplementation(async (_s: unknown, opts: { onArchiveChunk?: (w: Uint8Array, tail: boolean) => void }) => {
    rec.started += 1;
    rec.onArchiveChunk = opts.onArchiveChunk ?? null;
    return { stop: vi.fn() };
  }),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: lock,
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';

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
const now = () => new Date().toISOString();
const joined = (n: number) => ({
  room: { id: `r${n}`, code: `CODE${n}`, eventId: null, conversationId: 'chat-1', createdAt: now(), partNo: n },
  member: { id: `m${n}`, consentGivenAt: now(), joinedAt: now(), displayName: 'A' },
});
const refused = () => new Error('Failed to get signed URL: 410 This room has ended');
const MOVED = { roomId: 'r2', roomCode: 'CODE2', memberId: 'm2' };

beforeEach(() => {
  endRpc.mockReset().mockResolvedValue(undefined);
  createRoom.mockReset();
  roomState.mockReset().mockResolvedValue({ ended: false, movedTo: null });
  captureStatus.mockReset().mockImplementation(async () => ({ joinedAt: now(), roomCreatedAt: now(), captureEndedAt: null, roomEndedAt: null }));
  upload.mockReset().mockResolvedValue(undefined);
  lock.mockReset().mockResolvedValue({ acquired: true, release: vi.fn() });
  gum.mockReset().mockImplementation(async () => ({ getTracks: () => [{ stop: vi.fn(), onended: null }] }));
  rec.onArchiveChunk = null;
  rec.started = 0;
  localStorage.clear();
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum } });
});

afterEach(() => vi.useRealTimers());

describe('finding 2: an archive refusal for a room the roll moved us out of follows the move', () => {
  it('the current room\'s chunk is refused (410), the server says we were moved: the capture continues in Part 2', async () => {
    createRoom.mockResolvedValueOnce(joined(1));
    roomState.mockResolvedValue({ ended: true, movedTo: MOVED });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    upload.mockRejectedValueOnce(refused());
    await act(async () => { rec.onArchiveChunk?.(new Uint8Array([1, 2, 3]), false); await new Promise((r) => setTimeout(r, 40)); });
    expect(roomState).toHaveBeenCalledWith('r1', 'u1');
    expect(ctx.roomId).toBe('r2');
    expect(ctx.phase).toBe('capturing');
  });

  it('a refusal with no seat to follow is still a hard stop', async () => {
    createRoom.mockResolvedValueOnce(joined(1));
    roomState.mockResolvedValue({ ended: true, movedTo: null });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    upload.mockRejectedValueOnce(refused());
    await act(async () => { rec.onArchiveChunk?.(new Uint8Array([1, 2, 3]), false); await new Promise((r) => setTimeout(r, 40)); });
    expect(ctx.phase).toBe('idle');
  });
});

describe('finding 5: Stop during the lock wait, and a refused lock in a move', () => {
  it('a Stop pressed while the lock is being taken releases the lock and the seat and never opens the microphone', async () => {
    createRoom.mockResolvedValueOnce(joined(1));
    const release = vi.fn();
    let grant: (v: { acquired: boolean; release: () => void }) => void = () => undefined;
    lock.mockImplementationOnce(() => new Promise((resolve) => { grant = resolve; }));
    render(tree());
    let started: Promise<Awaited<ReturnType<typeof ctx.startCapture>>> = Promise.resolve({ started: false });
    await act(async () => { started = ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    await act(async () => { void ctx.endMyCapture('r1'); });
    let result: Awaited<ReturnType<typeof ctx.startCapture>> | undefined;
    await act(async () => { grant({ acquired: true, release }); result = await started; });
    expect(result?.started).toBe(false);
    expect(release, 'the lock is given back').toHaveBeenCalled();
    expect(endRpc).toHaveBeenCalledWith('r1');
    expect(gum, 'the microphone is never opened').not.toHaveBeenCalled();
    expect(ctx.phase).toBe('idle');
  });

  it('a move whose Part 2 lock is refused shows tapDown, never a capturing bar with nothing recording', async () => {
    createRoom.mockResolvedValueOnce(joined(1));
    roomState.mockResolvedValue({ ended: true, movedTo: MOVED });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    lock.mockResolvedValueOnce({ acquired: false, release: () => undefined });
    upload.mockRejectedValueOnce(refused());
    await act(async () => { rec.onArchiveChunk?.(new Uint8Array([1]), false); await new Promise((r) => setTimeout(r, 40)); });
    expect(ctx.roomId).toBe('r2');
    expect(ctx.tapDown, 'said so: nothing is being recorded here').toBe(true);
  });

  it('while capturing, a periodic room-state check follows a move the slices could not report', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    createRoom.mockResolvedValueOnce(joined(1));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    roomState.mockResolvedValue({ ended: true, movedTo: MOVED });
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(ctx.roomId).toBe('r2');
    expect(ctx.phase).toBe('capturing');
  });

  it('the periodic check stops the capture when the room simply ended', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    createRoom.mockResolvedValueOnce(joined(1));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    roomState.mockResolvedValue({ ended: true, movedTo: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(ctx.phase).toBe('idle');
  });
});

describe('finding 6: a Stop during a move ends the Part 2 seat too', () => {
  it('the move is cancelled and the seat it was about to use is ended on the server', async () => {
    createRoom.mockResolvedValueOnce(joined(1));
    roomState.mockResolvedValue({ ended: true, movedTo: MOVED });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: null, conversationId: 'chat-1', displayName: 'A' }); });
    let finish: (v: unknown) => void = () => undefined;
    captureStatus.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    upload.mockRejectedValueOnce(refused());
    await act(async () => { rec.onArchiveChunk?.(new Uint8Array([1]), false); await new Promise((r) => setTimeout(r, 30)); });
    await act(async () => { void ctx.endMyCapture('r1'); await new Promise((r) => setTimeout(r, 10)); });
    await act(async () => { finish({ joinedAt: now(), roomCreatedAt: now(), captureEndedAt: null, roomEndedAt: null }); await new Promise((r) => setTimeout(r, 30)); });
    expect(endRpc).toHaveBeenCalledWith('r2');
    expect(ctx.phase).toBe('idle');
  });
});

describe('finding 7: a reload around a roll re-attaches to the seat the roll made', () => {
  it('the stored capture is of the old room; the moved seat is looked up first', async () => {
    localStorage.setItem('cp_room_capture', JSON.stringify({
      userId: 'u1', roomId: 'r1', roomCode: 'CODE1', memberId: 'm1', eventId: null, conversationId: 'chat-1',
      joinedAt: now(), roomCreatedAt: now(), displayName: 'A',
    }));
    roomState.mockImplementation(async (id: string) => (id === 'r1' ? { ended: true, movedTo: MOVED } : { ended: false, movedTo: null }));
    render(tree());
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(ctx.roomId).toBe('r2');
    expect(ctx.roomCode).toBe('CODE2');
    expect(ctx.phase).toBe('capturing');
    expect(JSON.parse(localStorage.getItem('cp_room_capture') ?? '{}')).toMatchObject({ roomId: 'r2', memberId: 'm2' });
  });
});

describe('founder decision: a reload while paused stays paused', () => {
  const store = () => localStorage.setItem('cp_room_capture', JSON.stringify({
    userId: 'u1', roomId: 'r1', roomCode: 'CODE1', memberId: 'm1', eventId: null, conversationId: 'chat-1',
    joinedAt: now(), roomCreatedAt: now(), displayName: 'A',
  }));
  const pausedStatus = () => captureStatus.mockImplementation(async () => ({
    joinedAt: now(), roomCreatedAt: now(), captureEndedAt: null, roomEndedAt: null, pausedSince: now(),
  }));

  it('a seat the server holds as paused comes back paused: the microphone is NOT requested, the heartbeat runs', async () => {
    store();
    pausedStatus();
    const { touchRoomCapture } = await import('@/app/data/transcribe-service');
    vi.mocked(touchRoomCapture).mockClear();
    render(tree());
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(gum, 'no microphone while paused').not.toHaveBeenCalled();
    expect(rec.started, 'no recorder').toBe(0);
    expect(ctx.phase).toBe('paused');
    expect(ctx.manualPaused, 'it is a manual pause, so nothing resumes it on its own').toBe(true);
    expect(touchRoomCapture, 'the paused heartbeat is running').toHaveBeenCalledWith('r1');
  });

  it('Resume then opens the microphone and records', async () => {
    store();
    pausedStatus();
    render(tree());
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    await act(async () => { ctx.resumeMine(); await new Promise((r) => setTimeout(r, 80)); });
    expect(gum).toHaveBeenCalledTimes(1);
    expect(ctx.phase).toBe('capturing');
    expect(rec.started).toBeGreaterThan(0);
  });

  it('control: a seat that is not paused still re-attaches recording', async () => {
    store();
    render(tree());
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(gum).toHaveBeenCalledTimes(1);
    expect(ctx.phase).toBe('capturing');
  });
});

describe('last review: Resume after a paused reload, then pause or stop before the microphone has opened', () => {
  const store = () => localStorage.setItem('cp_room_capture', JSON.stringify({
    userId: 'u1', roomId: 'r1', roomCode: 'CODE1', memberId: 'm1', eventId: null, conversationId: 'chat-1',
    joinedAt: now(), roomCreatedAt: now(), displayName: 'A',
  }));
  /** A microphone that opens only when the test says so, and records whether its track was stopped. */
  function slowMic() {
    const stop = vi.fn();
    let open: () => void = () => undefined;
    gum.mockImplementationOnce(() => new Promise((resolve) => { open = () => resolve({ getTracks: () => [{ stop, readyState: 'live', onended: null }] }); }));
    return { stop, open: () => open() };
  }
  const reloadPaused = async () => {
    store();
    captureStatus.mockImplementation(async () => ({ joinedAt: now(), roomCreatedAt: now(), captureEndedAt: null, roomEndedAt: null, pausedSince: now() }));
    render(tree());
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(ctx.phase).toBe('paused');
  };

  it('paused again while the microphone is opening: the stream is closed when it arrives, nothing records', async () => {
    await reloadPaused();
    const mic = slowMic();
    await act(async () => { ctx.resumeMine(); await new Promise((r) => setTimeout(r, 30)); });
    await act(async () => { ctx.pauseMine(); });   // phase is already capturing from Resume
    await act(async () => { mic.open(); await new Promise((r) => setTimeout(r, 60)); });
    expect(mic.stop, 'the late microphone is closed, not held open through the pause').toHaveBeenCalled();
    expect(rec.started, 'nothing recorded').toBe(0);
  });

  it('stopped while the microphone is opening: the stream is closed when it arrives', async () => {
    await reloadPaused();
    const mic = slowMic();
    await act(async () => { ctx.resumeMine(); await new Promise((r) => setTimeout(r, 30)); });
    await act(async () => { void ctx.endMyCapture('r1'); });
    await act(async () => { mic.open(); await new Promise((r) => setTimeout(r, 60)); });
    expect(mic.stop).toHaveBeenCalled();
    expect(rec.started).toBe(0);
    expect(ctx.phase).toBe('idle');
  });

  it('after being paused again, a second Resume opens the microphone and records', async () => {
    await reloadPaused();
    const mic = slowMic();
    await act(async () => { ctx.resumeMine(); await new Promise((r) => setTimeout(r, 30)); });
    await act(async () => { ctx.pauseMine(); });
    await act(async () => { mic.open(); await new Promise((r) => setTimeout(r, 60)); });
    await act(async () => { ctx.resumeMine(); await new Promise((r) => setTimeout(r, 100)); });
    expect(ctx.phase).toBe('capturing');
    expect(rec.started).toBeGreaterThan(0);
  });
});
