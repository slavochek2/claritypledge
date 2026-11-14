/**
 * P1596 (review): the bar tells the truth about the recorder. When the audio tap cannot start the bar says nothing is
 * being recorded (it used to say "your words are still being recorded"), the start is retried first, a tapped
 * Reconnect tries again, and a person is told once when audio could not be saved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

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
import { createRoom } from '@/app/data/transcribe-service';

let ctx: ReturnType<typeof useRoomCapture>;
let nav: ReturnType<typeof useNavigate>;
function Harness() { ctx = useRoomCapture(); nav = useNavigate(); return null; }
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
    // INBOX-338: a network failure is retried (it can clear by itself) and dropped only after TRANSIENT_GIVE_UP_MS (10 min)
    await settle(20_000);
    expect(ctx.audioLost, 'not dropped while it may still clear').toBe(false);
    await settle(10 * 60_000 + 20_000);   // 640 s in: after the drop (600-630 s), before the minute-long notice expires
    expect(ctx.audioLost).toBe(true);
  });

  it('INBOX-338: uploads failing past 30 s raise audioStuck in the real provider; ending the capture clears it and a retrying tail cannot raise it again', async () => {
    upload.mockRejectedValue(new TypeError('Failed to fetch'));
    render(tree());
    await start();
    act(() => { tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
    await settle(5_000);
    expect(ctx.audioStuck, 'one early failure is not shown').toBe(false);
    // jittered waits (0.8x-1.2x): the 30 s mark is crossed by the 6th failure at the latest, 60 s in, worst case
    await settle(75_000);
    expect(ctx.audioStuck).toBe(true);
    await act(async () => { await ctx.endMyCapture('r1'); });
    expect(ctx.audioStuck).toBe(false);
    await settle(90_000);   // the queue keeps retrying the chunk after the End
    expect(ctx.audioStuck, 'no capture: the notice stays off').toBe(false);
  });

  it('INBOX-338: chunks refused for good raise audioStuck; a Resume after a minute\'s pause ends it at once, not at the next chunk', async () => {
    upload.mockRejectedValue(new Error('GCS upload failed: 400 Bad Request'));
    render(tree());
    await start();
    for (let c = 0; c < 3; c++) {
      act(() => { tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
      await settle(30_000);
    }
    expect(ctx.audioStuck).toBe(true);
    act(() => { ctx.pauseMine(); });
    await settle(60_000);
    act(() => { ctx.resumeMine(); });
    expect(ctx.audioStuck, 'off at the Resume itself').toBe(false);
  });

  it('INBOX-338: an automatic resume (back from /live after a minute) ends an old audioStuck at once too', async () => {
    upload.mockRejectedValue(new Error('GCS upload failed: 400 Bad Request'));
    render(tree());
    await start();
    for (let c = 0; c < 3; c++) {
      act(() => { tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
      await settle(30_000);
    }
    expect(ctx.audioStuck).toBe(true);
    await act(async () => { nav('/live'); });
    await settle(60_000);
    expect(ctx.phase).toBe('paused');
    await act(async () => { nav('/events/x/meet'); });
    await settle(100);
    expect(ctx.phase, 'capture resumed by itself').not.toBe('paused');
    expect(ctx.audioStuck, 'off at the automatic resume').toBe(false);
  });

  it('INBOX-338: a new capture started while the ended one\'s tail still fails does not show the old failure', async () => {
    upload.mockRejectedValue(new TypeError('Failed to fetch'));
    render(tree());
    await start();
    act(() => { tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
    await settle(80_000);
    expect(ctx.audioStuck).toBe(true);
    await act(async () => { await ctx.endMyCapture('r1'); });
    vi.mocked(createRoom).mockResolvedValueOnce({
      room: { id: 'r2', code: 'DEF456', eventId: 'e1' },
      member: { id: 'm2', consentGivenAt: new Date().toISOString(), joinedAt: new Date().toISOString(), displayName: 'A' },
    } as Awaited<ReturnType<typeof createRoom>>);
    await start();                 // room r2 now; r1's chunk keeps failing in the queue
    await settle(90_000);
    expect(ctx.audioStuck, 'the old room\'s tail never raises the new capture\'s notice').toBe(false);
  });

  it('a full queue sheds the oldest chunk and sets the notice', async () => {
    upload.mockImplementation(() => new Promise(() => undefined));   // the head never finishes
    render(tree());
    await start();
    act(() => { for (let i = 0; i < 12; i++) tap.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), false); });
    expect(ctx.audioLost).toBe(true);
  });
});
