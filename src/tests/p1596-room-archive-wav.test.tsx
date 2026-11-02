/**
 * P1596: the room archive is cut from the live-slice PCM tap and uploaded as self-contained WAV. It does not
 * depend on MediaRecorder at all (Safari with a hidden window delivered nothing until stop) nor on requestData.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const upload = vi.hoisted(() => vi.fn());
const tap = vi.hoisted(() => ({ onArchiveChunk: null as ((w: Uint8Array, tail: boolean) => void) | null }));

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
  endMyCapture: vi.fn().mockResolvedValue(undefined),
  getMyCaptureStatus: vi.fn().mockResolvedValue(null),
  prewarmSlicePath: vi.fn().mockResolvedValue(undefined),
  reserveRoomChunkNumber: vi.fn().mockImplementation(async () => upload.mock.calls.length),
  sendAudioSlice: vi.fn(),
  touchRoomCapture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/data/api', () => ({ uploadRoomAudioChunk: upload }));
vi.mock('@/lib/audio/slice-recorder', () => ({
  createSerialSender: () => vi.fn(),
  createSliceRecorder: vi.fn().mockImplementation(async (_s: unknown, opts: { onArchiveChunk?: (w: Uint8Array, tail: boolean) => void }) => {
    tap.onArchiveChunk = opts.onArchiveChunk ?? null;
    return { stop: () => opts.onArchiveChunk?.(new Uint8Array([1, 2, 3]), true) };
  }),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: vi.fn().mockResolvedValue({ acquired: true, release: vi.fn() }),
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';

let ctx: ReturnType<typeof useRoomCapture>;
function Harness() { ctx = useRoomCapture(); return null; }

beforeEach(() => {
  localStorage.clear();
  upload.mockReset().mockResolvedValue(undefined);
  tap.onArchiveChunk = null;
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  // Any use of MediaRecorder is a failure: it must not even be constructed.
  vi.stubGlobal('MediaRecorder', function MediaRecorderMustNotBeUsed() { throw new Error('MediaRecorder must not be used for the room archive'); });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
});

describe('P1596: room archive from the PCM tap', () => {
  it('uploads each chunk the tap hands over as audio/wav with no MediaRecorder, and the End tail as the last one', async () => {
    render(<MemoryRouter initialEntries={['/events/x/meet']}><RoomCaptureProvider><Harness /></RoomCaptureProvider></MemoryRouter>);
    await act(async () => { expect((await ctx.startCapture({ eventId: 'e1', displayName: 'A' })).started).toBe(true); });
    expect(tap.onArchiveChunk).not.toBeNull();

    await act(async () => { tap.onArchiveChunk!(new Uint8Array([9, 9]), false); await new Promise((r) => setTimeout(r, 5)); });
    expect(upload).toHaveBeenCalledTimes(1);
    const [, , , blob, , isLast] = upload.mock.calls[0] as unknown[];
    expect((blob as Blob).type).toBe('audio/wav');
    expect(isLast).toBe(false);

    await act(async () => { await ctx.endMyCapture('r1'); });
    expect(upload).toHaveBeenCalledTimes(2);
    expect((upload.mock.calls[1] as unknown[])[5]).toBe(true);
  });
});
