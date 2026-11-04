/**
 * P1369 (spec change 2026-09-30, review finding A1): the offline transcription bar keeps a local
 * "Stop microphone", which calls endMyCapture. That is only honest if stopping never waits on the
 * network. Here the network hangs (the tail upload and the End RPC never settle) and the
 * microphone must still be released at once.
 *
 * Harness: the same mocks as p1307-end-flushes-archive-tail.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const upload = vi.hoisted(() => vi.fn());
const endRpc = vi.hoisted(() => vi.fn());
const trackStop = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, sessionChecked: true }) }));
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
  reserveRoomChunkNumber: vi.fn().mockResolvedValue(0),
  sendAudioSlice: vi.fn(),
  touchRoomCapture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/data/api', () => ({ uploadRoomAudioChunk: upload }));
vi.mock('@/lib/audio/slice-recorder', () => ({
  createSerialSender: () => vi.fn(),
  createSliceRecorder: vi.fn().mockImplementation(async (_s: unknown, opts: { onArchiveChunk?: (w: Uint8Array, tail: boolean) => void }) => ({
    // P1596: the archive is cut from the tap; its stop() hands over the unfinished tail synchronously.
    stop: () => opts.onArchiveChunk?.(new Uint8Array([82, 73, 70, 70]), true),
  })),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: vi.fn().mockResolvedValue({ acquired: true, release: vi.fn() }),
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';

let ctx: ReturnType<typeof useRoomCapture>;
function Harness() {
  ctx = useRoomCapture();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  trackStop.mockReset();
  // Offline: nothing that goes to the network ever settles.
  upload.mockReset().mockImplementation(() => new Promise(() => {}));
  endRpc.mockReset().mockImplementation(() => new Promise(() => {}));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  });
});

describe('P1369: Stop microphone works offline', () => {
  it('the microphone is released at once while the tail upload and the End RPC hang', async () => {
    render(
      <MemoryRouter initialEntries={['/events/x/meet']}>
        <RoomCaptureProvider><Harness /></RoomCaptureProvider>
      </MemoryRouter>,
    );
    await act(async () => {
      expect((await ctx.startCapture({ eventId: 'e1', displayName: 'A' })).started).toBe(true);
    });
    expect(trackStop).not.toHaveBeenCalled();

    await act(async () => {
      void ctx.endMyCapture('r1'); // never settles offline — not awaited
      await new Promise((r) => setTimeout(r, 20)); // one turn, nothing more
    });

    expect(trackStop).toHaveBeenCalled();
    // P1604 rule 4 (reverses P1307): the End goes to the server AT ONCE, not behind the tail upload; the server admits
    // audio recorded before the Stop for 2 minutes after it.
    expect(endRpc, 'the End RPC does not wait behind the (hung) tail upload').toHaveBeenCalled();
  });
});
