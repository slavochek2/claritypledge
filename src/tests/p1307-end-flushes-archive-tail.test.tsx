/**
 * @file p1307-end-flushes-archive-tail.test.tsx
 * @description P1307 regression (external review finding): End released the microphone and
 * cleared the capture record before the archive recorder's asynchronous onstop delivered the
 * recording since the last 30 s chunk, so the upload pump found no record and the tail — up to
 * 30 s of speech — never reached the bucket or the saved transcript.
 *
 * Also pins the other half of the same rule: after sign-out no chunk may be uploaded (AC
 * "Signing out while transcribing … no further chunk reaches the bucket").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const upload = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

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
  reserveRoomChunkNumber: vi.fn().mockResolvedValue(0),
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

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={['/events/x/meet']}>
      <RoomCaptureProvider><Harness /></RoomCaptureProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  upload.mockClear();
  localStorage.clear();
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
});

describe('P1307: the archive tail on stop', () => {
  it('End uploads the recording since the last chunk, marked as the last chunk', async () => {
    renderProvider();
    await act(async () => {
      const result = await ctx.startCapture({ eventId: 'e1', displayName: 'A' });
      expect(result.started).toBe(true);
    });

    await act(async () => { await ctx.endMyCapture('r1'); });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const [roomCode, , memberId, blob, , isLast] = upload.mock.calls[0] as unknown[];
    expect({ roomCode, memberId, isLast }).toEqual({ roomCode: 'ABC123', memberId: 'm1', isLast: true });
    expect((blob as Blob).size).toBeGreaterThan(0);
  });

  it('sign-out uploads nothing — not the tail, not a queued chunk', async () => {
    const view = renderProvider();
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });

    auth.value = { user: null, sessionChecked: true };
    view.rerender(
      <MemoryRouter initialEntries={['/events/x/meet']}>
        <RoomCaptureProvider><Harness /></RoomCaptureProvider>
      </MemoryRouter>,
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(upload).not.toHaveBeenCalled();
  });
});
