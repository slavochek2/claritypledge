/**
 * @file p1307-end-flushes-archive-tail.test.tsx
 * @description P1307 regressions from external review (Codex), on the archive upload path:
 *
 *  1. End released the microphone and cleared the capture record before the archive recorder's
 *     asynchronous onstop delivered the recording since the last 30 s chunk, so the upload pump
 *     found no record and the tail — up to 30 s of speech — never reached the bucket.
 *  2. Even with the tail queued, End told the server the capture had ended BEFORE uploading it.
 *     gcs-signed-url refuses an upload once capture_ended_at is set, so the tail was refused.
 *     The upload must happen first; the end RPC after it.
 *  3. A retried upload reserved a NEW chunk number on every attempt, leaving a permanent gap
 *     in the sequence. One number per chunk, reused across retries.
 *
 * Also pins: after sign-out no chunk may be uploaded (AC "Signing out while transcribing …
 * no further chunk reaches the bucket").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const calls = vi.hoisted(() => ({ order: [] as string[] }));
const upload = vi.hoisted(() => vi.fn());
const endRpc = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());

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
  joinRoom: vi.fn(),
  endMyCapture: endRpc,
  getMyCaptureStatus: vi.fn().mockResolvedValue(null),
  prewarmSlicePath: vi.fn().mockResolvedValue(undefined),
  reserveRoomChunkNumber: reserve,
  sendAudioSlice: vi.fn(),
  touchRoomCapture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/data/api', () => ({ uploadRoomAudioChunk: upload }));
vi.mock('@/lib/audio/slice-recorder', () => ({
  createSerialSender: () => vi.fn(),
  createSliceRecorder: vi.fn().mockResolvedValue({ stop: vi.fn() }),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: vi.fn().mockResolvedValue({ acquired: true, release: vi.fn() }),
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';

/** A MediaRecorder whose stop() delivers the final data and fires onstop on a LATER turn — as
 *  browsers do, and as the bug needs. */
class FakeRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  requestData() { this.ondataavailable?.({ data: new Blob(['part']) }); }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() {
    this.ondataavailable?.({ data: new Blob(['tail']) });
    this.state = 'inactive';
    setTimeout(() => this.onstop?.(), 0);
  }
}

let ctx: ReturnType<typeof useRoomCapture>;
function Harness() {
  ctx = useRoomCapture();
  return null;
}

function tree() {
  return (
    <MemoryRouter initialEntries={['/events/x/meet']}>
      <RoomCaptureProvider><Harness /></RoomCaptureProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  calls.order = [];
  upload.mockReset().mockImplementation(async () => { calls.order.push('upload'); });
  endRpc.mockReset().mockImplementation(async () => { calls.order.push('end'); });
  let n = 0;
  reserve.mockReset().mockImplementation(async () => n++);
  localStorage.clear();
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
});

describe('P1307: the archive tail on stop', () => {
  it('End uploads the recording since the last chunk, marked last, BEFORE telling the server capture ended', async () => {
    render(tree());
    await act(async () => {
      const result = await ctx.startCapture({ eventId: 'e1', displayName: 'A' });
      expect(result.started).toBe(true);
    });

    await act(async () => { await ctx.endMyCapture('r1'); });

    expect(upload).toHaveBeenCalledTimes(1);
    const [roomCode, , memberId, blob, , isLast] = upload.mock.calls[0] as unknown[];
    expect({ roomCode, memberId, isLast }).toEqual({ roomCode: 'ABC123', memberId: 'm1', isLast: true });
    expect((blob as Blob).size).toBeGreaterThan(0);
    expect(calls.order, 'gcs-signed-url refuses uploads after capture_ended_at — upload must come first').toEqual(['upload', 'end']);
  });

  it('a retried upload keeps the chunk number it was first given — no gap in the sequence', async () => {
    upload.mockReset()
      .mockImplementationOnce(async () => { throw new Error('network blip'); })
      .mockImplementation(async () => { calls.order.push('upload'); });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });

    await act(async () => { await ctx.endMyCapture('r1'); });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(reserve).toHaveBeenCalledTimes(1);
    const firstNumber = (upload.mock.calls[0] as unknown[])[4];
    const retryNumber = (upload.mock.calls[1] as unknown[])[4];
    expect(retryNumber).toBe(firstNumber);
  }, 10_000);

  it('sign-out uploads nothing — not the tail, not a queued chunk', async () => {
    const view = render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });

    auth.value = { user: null, sessionChecked: true };
    view.rerender(tree());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(upload).not.toHaveBeenCalled();
  });
});
