/**
 * @file p1388-provider-pause-and-unplug.test.tsx
 * @description P1388 at the provider: a manual Pause STOPS the recorder writing (Invariant:
 * "pause must stop capture, not merely hide it") and is not undone by the automatic rule; the
 * level reaches subscribers; an unplugged mic is re-opened on the default input and said so.
 * The stored-audio check on a real phone is the UAT half of AC 2 — this pins the mechanism.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null, sessionChecked: true } }));
const calls = vi.hoisted(() => ({ order: [] as string[] }));
const upload = vi.hoisted(() => vi.fn());
const endRpc = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());
const sliceState = vi.hoisted(() => ({ onLevel: null as ((r: number) => void) | null, started: 0, stopped: 0 }));
const tracks = vi.hoisted(() => ({ list: [] as { stop: () => void; onended: (() => void) | null }[] }));

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
  createSliceRecorder: vi.fn().mockImplementation(async (_s: unknown, opts: { onLevel?: (r: number) => void }) => {
    sliceState.onLevel = opts.onLevel ?? null;
    sliceState.started += 1;
    return { stop: () => { sliceState.stopped += 1; } };
  }),
}));
vi.mock('@/app/contexts/room-capture-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/room-capture-core')>()),
  acquireCaptureLock: vi.fn().mockResolvedValue({ acquired: true, release: vi.fn() }),
}));

import { RoomCaptureProvider, useRoomCapture } from '@/app/contexts/room-capture-context';

/** A MediaRecorder whose stop() delivers the final data and fires onstop on a LATER turn — as
 *  browsers do, and as the bug needs. */
class FakeRecorder {
  static last: FakeRecorder | null = null;
  constructor() { FakeRecorder.last = this; }
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
  sliceState.onLevel = null; sliceState.started = 0; sliceState.stopped = 0;
  tracks.list = [];
  auth.value = { user: { id: 'u1' }, sessionChecked: true };
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockImplementation(async () => {
        const track = { stop: vi.fn(), onended: null as (() => void) | null };
        tracks.list.push(track);
        return { getTracks: () => [track] };
      }),
    },
  });
});

describe('P1388: manual pause at the provider', () => {
  it('Pause pauses the recorder, stops live slices, uploads nothing more; Resume restarts them', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    const rec = FakeRecorder.last!;
    expect(rec.state).toBe('recording');

    await act(async () => { ctx.pauseMine(); });
    expect(ctx.phase).toBe('paused');
    expect(ctx.manualPaused).toBe(true);
    expect(rec.state, 'the recorder must not be writing while paused').toBe('paused');
    expect(sliceState.stopped).toBe(1);
    expect(ctx.barVisible, 'a manual pause keeps the bar (and its Resume) on screen').toBe(true);

    const uploadsAtPause = upload.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(95_000); });
    expect(ctx.phase, 'the automatic rule must not resume a manual pause').toBe('paused');
    expect(upload.mock.calls.length - uploadsAtPause, 'the 30 s archive timer is stopped while paused').toBeLessThanOrEqual(1);

    await act(async () => { ctx.resumeMine(); });
    expect(ctx.phase).toBe('capturing');
    expect(rec.state).toBe('recording');
    expect(sliceState.started).toBe(2);
    vi.useRealTimers();
  });

  it('the level reaches subscribers', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    const seen: number[] = [];
    const off = ctx.subscribeLevel((r) => seen.push(r));
    sliceState.onLevel?.(0.1);
    off();
    sliceState.onLevel?.(0.2);
    expect(seen).toEqual([0.1]);
  });

  it('an unplugged mic is re-opened on the default input, keeping the capture and saying so', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    expect(tracks.list).toHaveLength(1);

    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(tracks.list).toHaveLength(2));
    const gum = navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>;
    expect(gum.mock.calls[1][0], 'never the stale deviceId').toEqual({ audio: true });
    await waitFor(() => expect(ctx.micSwitched).toBe(true));
    expect(ctx.micLost).toBe(false);
    expect(ctx.phase).toBe('capturing');
    expect(upload, 'the recording up to the unplug is kept').toHaveBeenCalled();
  });

  it('if no mic can be re-opened, the bar says the microphone is lost', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    const gum = navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>;
    gum.mockRejectedValueOnce(new Error('NotFoundError'));
    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(ctx.micLost).toBe(true));
  });
});

/** Review HIGH 1–3: each reproduces an await the world changes under. */
describe('P1388 review: setup races', () => {
  const gum = () => navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>;

  it('HIGH 1 — Stop during unplug recovery: the mic opened afterwards is closed, nothing records', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    let release!: () => void;
    const late = { stop: vi.fn(), onended: null as (() => void) | null };
    gum().mockImplementationOnce(() => new Promise((r) => { release = () => r({ getTracks: () => [late] }); }));
    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(gum()).toHaveBeenCalledTimes(2));
    await act(async () => { await ctx.endMyCapture('r1'); });
    const recordersBefore = FakeRecorder.last;
    await act(async () => { release(); await Promise.resolve(); });
    expect(late.stop, 'the late stream must be stopped').toHaveBeenCalled();
    expect(FakeRecorder.last, 'no recorder is created on it').toBe(recordersBefore);
  });

  it('HIGH 2 — Pause while the slice recorder is still starting: it is stopped on arrival, nothing is sent', async () => {
    const { createSliceRecorder } = await import('@/lib/audio/slice-recorder');
    let finish!: () => void;
    const lateSlices = { stop: vi.fn() };
    let onSlice: ((w: unknown, n: number) => void) | null = null;
    (createSliceRecorder as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_s: unknown, opts: { onSlice: (w: unknown, n: number) => void }) => new Promise((r) => {
        onSlice = opts.onSlice;
        finish = () => r(lateSlices);
      }),
    );
    render(tree());
    let started!: Promise<unknown>;
    await act(async () => { started = ctx.startCapture({ eventId: 'e1', displayName: 'A' }); await Promise.resolve(); });
    await waitFor(() => expect(onSlice).not.toBeNull());
    await act(async () => { ctx.pauseMine(); });
    await act(async () => { finish(); await started; });
    expect(lateSlices.stop, 'a slice recorder that finished starting mid-pause must stop').toHaveBeenCalled();
    expect(FakeRecorder.last!.state).toBe('paused');
  });

  it('HIGH 3 — unplug while paused: the new mic is opened but the recorder does not start until Resume', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    await act(async () => { ctx.pauseMine(); });
    const startsBefore = sliceState.started;
    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(tracks.list).toHaveLength(2));
    const rec = FakeRecorder.last!;
    expect(rec.state, 'recorder on the new mic must not record during the pause').toBe('inactive');
    expect(sliceState.started, 'no slices during the pause').toBe(startsBefore);
    await act(async () => { ctx.resumeMine(); });
    expect(rec.state).toBe('recording');
    expect(sliceState.started).toBe(startsBefore + 1);
  });

  it('MEDIUM 6 — Resume is honoured despite a leftover /live record', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    await act(async () => { ctx.pauseMine(); });
    localStorage.setItem('cp_active_session', JSON.stringify({ code: 'X', partnerName: 'B', role: 'creator', timestamp: new Date().toISOString() }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'cp_active_session' }));
    await act(async () => { ctx.resumeMine(); });
    expect(ctx.phase).toBe('capturing');
  });
});

describe('P1388: stopping flag', () => {
  it('is true from the tap until the server has recorded the end', async () => {
    let releaseEnd!: () => void;
    endRpc.mockImplementationOnce(() => new Promise<void>((r) => { releaseEnd = r; }));
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    let ending!: Promise<void>;
    act(() => { ending = ctx.endMyCapture('r1'); });
    expect(ctx.stopping).toBe(true);
    await waitFor(() => expect(endRpc).toHaveBeenCalled());
    await act(async () => { releaseEnd(); await ending; });
    expect(ctx.stopping).toBe(false);
  });
});

describe('P1388 adversarial review fixes', () => {
  const gum = () => navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>;

  it('BLOCKER — two overlapping mic opens never leave an orphaned stream', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    gum().mockRejectedValueOnce(new Error('NotFoundError'));
    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(ctx.micLost).toBe(true));
    // Two reconnect taps at once: only one stream may survive, the other must be stopped.
    await act(async () => { await Promise.all([ctx.reconnectMic(), ctx.reconnectMic()]); });
    const live = tracks.list.slice(1).filter((t) => !(t.stop as ReturnType<typeof vi.fn>).mock.calls.length);
    expect(live.length, 'exactly one open mic').toBe(1);
    expect(ctx.micLost).toBe(false);
  });

  it('HIGH — after a lost mic, nothing records until the person taps Reconnect', async () => {
    // A real event target, so a 'devicechange' listener (the removed auto-reopen) would fire.
    const et = new EventTarget();
    Object.assign(navigator.mediaDevices, {
      addEventListener: et.addEventListener.bind(et),
      removeEventListener: et.removeEventListener.bind(et),
      dispatchEvent: et.dispatchEvent.bind(et),
    });
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    gum().mockRejectedValueOnce(new Error('NotFoundError'));
    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(ctx.micLost).toBe(true));
    const opens = gum().mock.calls.length;
    await act(async () => { navigator.mediaDevices.dispatchEvent(new Event('devicechange')); await Promise.resolve(); });
    expect(gum().mock.calls.length, 'a device appearing must not reopen the mic').toBe(opens);
  });
});

describe('P1388 adversarial review — a Resume does not outlive its pause', () => {
  it('after an explain-back pause, a still-active /live record keeps capture paused despite an earlier Resume', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    await act(async () => { ctx.pauseMine(); });
    await act(async () => { ctx.resumeMine(); });          // userResumed = true
    expect(ctx.phase).toBe('capturing');
    let release!: () => void;
    await act(async () => { release = ctx.holdPause('explain-back'); });
    expect(ctx.phase).toBe('paused');
    localStorage.setItem('cp_active_session', JSON.stringify({ code: 'X', partnerName: 'B', role: 'creator', timestamp: new Date().toISOString() }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'cp_active_session' }));
    await act(async () => { release(); });
    expect(ctx.phase, 'the old Resume must not override a live session').toBe('paused');
  });
});

describe('P1388 adversarial review 2', () => {
  it('a mic that dies while starting up is reported lost, never "still recording"', async () => {
    render(tree());
    await act(async () => { await ctx.startCapture({ eventId: 'e1', displayName: 'A' }); });
    const gum = navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>;
    gum.mockImplementationOnce(async () => {
      const dead = { stop: vi.fn(), onended: null as (() => void) | null, readyState: 'ended' };
      tracks.list.push(dead);
      return { getTracks: () => [dead] };
    });
    await act(async () => { tracks.list[0].onended?.(); });
    await waitFor(() => expect(gum).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(ctx.micLost).toBe(true));
    expect(ctx.micSwitched).toBe(false);
  });
});
