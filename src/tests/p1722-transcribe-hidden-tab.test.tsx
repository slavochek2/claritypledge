/**
 * P1722 fix round C3: the Mirror's Transcribe reads (live session, processing state) make no call in a hidden tab: not on mount, not on a capture change, not on the
 * interval; one read of each the moment the tab is visible again. Both RPC call sites are asserted.
 */
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-service';

const live = vi.hoisted(() => vi.fn());
const processing = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => ({ value: { phase: 'idle', conversationId: null as string | null, eventId: null as string | null, roomId: null as string | null, startCapture: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ada', email: 'ada@example.com' }, sessionChecked: true }) }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture.value }));
vi.mock('@/app/data/chat-live-transcription', () => ({ getChatLiveTranscription: live, hasTranscribedInChat: vi.fn() }));
vi.mock('@/app/data/room-transcription-state', () => ({ getChatTranscriptionProcessing: processing }));

import { ChatTranscribe } from '@/app/pages/chat/ChatTranscribe';

const MIRROR = { conversationId: 'mirror-1', kind: 'mirror' } as ChatSummary;
let state: 'hidden' | 'visible' = 'visible';
const setVisibility = (v: 'hidden' | 'visible') => { state = v; document.dispatchEvent(new Event('visibilitychange')); };
const view = () => <MemoryRouter><ChatTranscribe chat={MIRROR}>{() => null}</ChatTranscribe></MemoryRouter>;

beforeEach(() => {
  vi.useFakeTimers();
  state = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  live.mockReset().mockResolvedValue(null);
  processing.mockReset().mockResolvedValue([]);
  capture.value = { ...capture.value, phase: 'idle', roomId: null };
});
afterEach(() => { cleanup(); vi.useRealTimers(); Reflect.deleteProperty(document, 'visibilityState'); });

describe('Mirror Transcribe in a hidden tab', () => {
  it('CONTROL: a visible tab reads both on mount and again on the interval', async () => {
    render(view());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(live).toHaveBeenCalledTimes(1);
    expect(processing).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(live).toHaveBeenCalledTimes(2);
    expect(processing).toHaveBeenCalledTimes(2);
  });

  it('hidden on mount: no read of either, not even after several intervals', async () => {
    state = 'hidden';
    render(view());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(live).not.toHaveBeenCalled();
    expect(processing).not.toHaveBeenCalled();
  });

  it('hidden: a capture change (phase, room) re-runs the effect and still reads nothing', async () => {
    state = 'hidden';
    const r = render(view());
    capture.value = { ...capture.value, phase: 'recording', roomId: 'room-1' };
    r.rerender(view());
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(live).not.toHaveBeenCalled();
    expect(processing).not.toHaveBeenCalled();
  });

  it('becoming visible reads each once, and the interval resumes; hiding again stops it', async () => {
    state = 'hidden';
    render(view());
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    act(() => setVisibility('visible'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(live).toHaveBeenCalledTimes(1);
    expect(processing).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(live).toHaveBeenCalledTimes(2);
    act(() => setVisibility('hidden'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(live).toHaveBeenCalledTimes(2);
    expect(processing).toHaveBeenCalledTimes(2);
  });
});
