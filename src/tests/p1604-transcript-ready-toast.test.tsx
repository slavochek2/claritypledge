/**
 * P1604 final-look batch: after Stop, when the transcript is ready and the person is elsewhere in the app, a toast "Transcript
 * ready" with an Open action to the thread (or to session history when the room belongs to no chat). No push, no email.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const states = vi.hoisted(() => ({ next: new Map<string, { state: string; chatName: string | null }>() }));
const thread = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, sessionChecked: true }) }));
vi.mock('@/app/data/room-transcription-state', () => ({
  getMyRoomStates: vi.fn(async (ids: string[]) => new Map(ids.filter((i) => states.next.has(i)).map((i) => [i, states.next.get(i)]))),
}));
vi.mock('@/app/data/transcript-thread', () => ({ getMyTranscriptThread: thread }));
vi.mock('@/app/data/transcribe-capture-status', () => ({ getCaptureRoomState: vi.fn(async () => ({ ended: true, movedTo: null })) }));

import { TranscriptReadyWatcher } from '@/app/components/session/transcript-ready-watcher';
import { watchTranscript, readWatched, TRANSCRIPT_READY_TOAST, TRANSCRIPT_READY_OPEN } from '@/app/components/session/transcript-watch';

let where = '';
function Where() { where = useLocation().pathname; return null; }
const mount = (path = '/feed') => render(<MemoryRouter initialEntries={[path]}><TranscriptReadyWatcher /><Where /></MemoryRouter>);
const tick = async (ms = 15_100) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  states.next.clear();
  thread.mockReset().mockResolvedValue({ conversationId: 'chat-1', rootMessageId: 'root-1' });
  toastFn.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('the transcript-ready toast', () => {
  it('says "Transcript ready" with an Open action to the thread, once, when the text turns ready', async () => {
    watchTranscript('r1', 'u1');
    states.next.set('r1', { state: 'processing', chatName: 'Ada' });
    mount();
    await tick();
    expect(toastFn, 'still processing: nothing yet').not.toHaveBeenCalled();
    states.next.set('r1', { state: 'ready', chatName: 'Ada' });
    await tick();
    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(toastFn.mock.calls[0][0]).toBe(TRANSCRIPT_READY_TOAST);
    expect(TRANSCRIPT_READY_TOAST).toBe('Transcript ready');
    const action = toastFn.mock.calls[0][1].action;
    expect(action.label).toBe(TRANSCRIPT_READY_OPEN);
    act(() => action.onClick());
    expect(where).toBe('/chats/c/chat-1/t/root-1');
    await tick();
    expect(toastFn, 'not again').toHaveBeenCalledTimes(1);
    expect(readWatched('u1')).toEqual([]);
  });

  it('a room that belongs to no chat opens session history', async () => {
    thread.mockResolvedValue(null);
    watchTranscript('r2', 'u1');
    states.next.set('r2', { state: 'ready', chatName: null });
    mount();
    await tick();
    act(() => toastFn.mock.calls[0][1].action.onClick());
    expect(where).toBe('/sessions');
  });

  it('no toast when the person is already in that chat (the waiting line going away is the signal)', async () => {
    watchTranscript('r1', 'u1');
    states.next.set('r1', { state: 'ready', chatName: 'Ada' });
    mount('/chats/c/chat-1');
    await tick();
    expect(toastFn).not.toHaveBeenCalled();
    expect(readWatched('u1'), 'and it is forgotten').toEqual([]);
  });

  it('a failed or empty result is forgotten without a toast', async () => {
    watchTranscript('r3', 'u1'); watchTranscript('r4', 'u1');
    states.next.set('r3', { state: 'failed', chatName: null });
    states.next.set('r4', { state: 'none', chatName: null });
    mount();
    await tick();
    expect(toastFn).not.toHaveBeenCalled();
    expect(readWatched('u1')).toEqual([]);
  });

  it('watches nothing it was not told about (control)', async () => {
    states.next.set('other', { state: 'ready', chatName: null });
    mount();
    await tick();
    expect(toastFn).not.toHaveBeenCalled();
  });
});
