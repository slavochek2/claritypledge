/**
 * P1596 (review): the bar tells the truth about the recorder. When the audio tap cannot start the bar says nothing is
 * being recorded (it used to say "your words are still being recorded"), the start is retried first, a tapped
 * Reconnect tries again, and a person is told once when audio could not be saved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const upload = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());
const tap = vi.hoisted(() => ({
  fails: 0, calls: 0, onArchiveChunk: null as ((w: Uint8Array, tail: boolean) => void) | null,
}));

vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel, send: vi.fn() };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});
vi.mock('@/app/data/transcribe-service', () => ({
  createRoom: vi.fn().mockResolvedValue({
    room: { id: 'r1', code: 'ABC123', eventId: 'e1' },
    member: { id: 'm1', consentGivenAt: new Date().toISOString(), joinedAt: new Date().toISOString(), displayName: 'A' },
  }),
  joinRoom: vi.fn(), endMyCapture: vi.fn().mockResolvedValue(undefined),
  getMyCaptureStatus: vi.fn().mockResolvedValue(null), prewarmSlicePath: vi.fn().mockResolvedValue(undefined),
  reserveRoomChunkNumber: reserve, sendAudioSlice: vi.fn(), touchRoomCapture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/data/api', () => ({ uploadRoomAudioChunk: upload }));
vi.mock('@/lib/audio/slice-recorder', () => ({
  createSerialSender: () => vi.fn(),
  createSliceRecorder: vi.fn().mockImplementation(async (_s: unknown, opts: { onArchiveChunk?: (w: Uint8Array, tail: boolean) => void }) => {
    tap.calls += 1;
    if (tap.fails > 0) { tap.fails -= 1; throw new Error('worklet failed'); }
    tap.onArchiveChunk = opts.onArchiveChunk ?? null;
    return { stop: () => undefined };
  }),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: vi.fn().mockResolvedValue({ acquired: true, release: vi.fn() }),
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';

let ctx: ReturnType<typeof useRoomCapture>;
function Harness() { ctx = useRoomCapture(); return null; }
const tree = () => (
  <MemoryRouter initialEntries={['/events/x/meet']}><RoomCaptureProvider><Harness /></RoomCaptureProvider></MemoryRouter>
);
const start = () => act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
const settle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  tap.fails = 0; tap.calls = 0; tap.onArchiveChunk = null;
  upload.mockReset().mockResolvedValue(undefined);
  let n = 0; reserve.mockReset().mockImplementation(async () => n++);
  localStorage.clear();
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockImplementation(async () => ({ getTracks: () => [{ stop: vi.fn(), onended: null, readyState: 'live' }] })) },
  });
});
afterEach(() => vi.useRealTimers());

describe('the audio tap fails to start', () => {
  it('is retried, and one failure that clears leaves the bar normal', async () => {
    tap.fails = 1;
    render(tree());
    await start();
    await settle(5_000);
    expect(tap.calls).toBe(2);
    expect(ctx.tapDown).toBe(false);
  });

  it('after the retries the bar says nothing is being recorded, and a tapped Reconnect starts it again', async () => {
    tap.fails = 99;
    render(tree());
    await start();
    await settle(10_000);
    expect(tap.calls).toBe(3);
    expect(ctx.tapDown).toBe(true);
    expect(ctx.barVisible).toBe(true);
    tap.fails = 0;
    await act(async () => { await ctx.reconnectMic(); });
    expect(ctx.tapDown).toBe(false);
    expect(tap.calls).toBe(4);
  });
});

describe('audio that could not be saved is said, once', () => {
  it('a chunk dropped after its retries sets the notice', async () => {
    upload.mockRejectedValue(new Error('network'));
    render(tree());
    await start();
    expect(ctx.audioLost).toBe(false);
    act(() => { tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
    await settle(20_000);
    expect(ctx.audioLost).toBe(true);
  });

  it('a full queue sheds the oldest chunk and sets the notice', async () => {
    upload.mockImplementation(() => new Promise(() => undefined));   // the head never finishes
    render(tree());
    await start();
    act(() => { for (let i = 0; i < 12; i++) tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
    expect(ctx.audioLost).toBe(true);
  });
});
