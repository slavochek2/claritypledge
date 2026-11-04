/**
 * P1604 (final review): the transcript state polls run only while the tab is visible, refresh once when it becomes visible again, and
 * the watcher is scoped to its user, keeps a watch while the room is live or a read fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const states = vi.hoisted(() => ({ next: new Map<string, { state: string; chatName: string | null }>(), calls: 0, fail: false }));
const roomState = vi.hoisted(() => vi.fn());
const thread = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => vi.fn());
const who = vi.hoisted(() => ({ id: 'u1' as string | null }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: who.id ? { id: who.id } : null, sessionChecked: true }) }));
vi.mock('@/app/data/room-transcription-state', () => ({
  getMyRoomStates: vi.fn(async (ids: string[]) => {
    states.calls += 1;
    if (states.fail) return new Map();
    return new Map(ids.filter((i) => states.next.has(i)).map((i) => [i, states.next.get(i)]));
  }),
}));
vi.mock('@/app/data/transcript-thread', () => ({ getMyTranscriptThread: thread }));
vi.mock('@/app/data/transcribe-capture-status', () => ({ getCaptureRoomState: roomState }));

import { startVisiblePoll } from '@/lib/visible-poll';
import { useRoomTranscriptionState, STATE_POLL_MS } from '@/app/pages/use-room-transcription-state';
import { TranscriptReadyWatcher } from '@/app/components/session/transcript-ready-watcher';
import { watchTranscript, readWatched } from '@/app/components/session/transcript-watch';

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setVisibility('visible');
  localStorage.clear();
  states.next.clear(); states.calls = 0; states.fail = false;
  who.id = 'u1';
  thread.mockReset().mockResolvedValue({ conversationId: 'c1', rootMessageId: 'r1' });
  roomState.mockReset().mockResolvedValue({ ended: true, movedTo: null });
  toastFn.mockReset();
});
afterEach(() => { setVisibility('visible'); vi.useRealTimers(); });

describe('startVisiblePoll', () => {
  it('ticks while visible, stops while hidden, and runs once at once when the tab comes back', async () => {
    const fn = vi.fn();
    const stop = startVisiblePoll(fn, 1_000);
    await tick(3_100);
    expect(fn).toHaveBeenCalledTimes(3);
    setVisibility('hidden');
    await tick(10_000);
    expect(fn, 'nothing while hidden').toHaveBeenCalledTimes(3);
    setVisibility('visible');
    expect(fn, 'one refresh the moment it is visible').toHaveBeenCalledTimes(4);
    await tick(1_100);
    expect(fn).toHaveBeenCalledTimes(5);
    stop();
    await tick(5_000);
    expect(fn, 'stopped for good').toHaveBeenCalledTimes(5);
  });
  it('starting while hidden does not tick', async () => {
    setVisibility('hidden');
    const fn = vi.fn();
    const stop = startVisiblePoll(fn, 1_000);
    await tick(5_000);
    expect(fn).not.toHaveBeenCalled();
    stop();
  });
});

describe('the state hook (the session view)', () => {
  it('does not read while the tab is hidden and reads when it is visible again', async () => {
    renderHook(() => useRoomTranscriptionState('r1', 'processing', () => undefined));
    setVisibility('hidden');
    await tick(STATE_POLL_MS * 3);
    expect(states.calls).toBe(0);
    setVisibility('visible');
    await tick(10);
    expect(states.calls).toBe(1);
  });
});

describe('the Transcript-ready watcher', () => {
  const mount = () => render(<MemoryRouter initialEntries={['/feed']}><TranscriptReadyWatcher /></MemoryRouter>);

  it('does not read while hidden, and reads at once when visible', async () => {
    watchTranscript('r1', 'u1');
    states.next.set('r1', { state: 'processing', chatName: null });
    mount();
    setVisibility('hidden');
    await tick(60_000);
    expect(states.calls).toBe(0);
    setVisibility('visible');
    await tick(10);
    expect(states.calls).toBe(1);
  });

  it('a watch belongs to the user who stopped: another account never sees or loses it', async () => {
    watchTranscript('r1', 'u1');
    expect(readWatched('u1').map((w) => w.roomId)).toEqual(['r1']);
    expect(readWatched('u2'), 'another account on this browser sees none').toEqual([]);
    who.id = 'u2';
    states.next.set('r1', { state: 'ready', chatName: null });
    mount();
    await tick(15_100);
    expect(toastFn, 'no toast for someone else\'s room').not.toHaveBeenCalled();
    expect(readWatched('u1').map((w) => w.roomId), 'and u1\'s watch survives u2\'s session').toEqual(['r1']);
  });

  it('a live room (A stopped, B continues) is kept even though its state is none', async () => {
    watchTranscript('r1', 'u1');
    states.next.set('r1', { state: 'none', chatName: null });
    roomState.mockResolvedValue({ ended: false, movedTo: null });
    mount();
    await tick(15_100);
    expect(readWatched('u1').map((w) => w.roomId)).toEqual(['r1']);
    // the room ends and the text becomes ready: A is told
    roomState.mockResolvedValue({ ended: true, movedTo: null });
    states.next.set('r1', { state: 'ready', chatName: null });
    await tick(15_100);
    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(readWatched('u1')).toEqual([]);
  });

  it('an ended room with nothing to read is forgotten (control)', async () => {
    watchTranscript('r1', 'u1');
    states.next.set('r1', { state: 'none', chatName: null });
    mount();
    await tick(15_100);
    expect(readWatched('u1')).toEqual([]);
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('a failed read keeps the watch', async () => {
    watchTranscript('r1', 'u1');
    states.fail = true;
    mount();
    await tick(15_100);
    expect(readWatched('u1').map((w) => w.roomId)).toEqual(['r1']);
  });
});
