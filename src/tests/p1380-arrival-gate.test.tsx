/**
 * P1380: the room's "Have you arrived?" gate. Asked once, inside the window, of a registrant who
 * has not checked in; ?arrived=1 (the email's I'm here) records the arrival and goes straight on;
 * nothing ever keeps a person out of the room (failed read, failed write, hanging read).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { EventWithHost } from '@/app/types';

const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string }, session: { user: { id: 'viewer-1' } } as null | { user: { id: string } } } }));
const conn = vi.hoisted(() => ({ value: { offline: false, reconnectTick: 0 } }));
const svc = vi.hoisted(() => ({
  getMyArrival: vi.fn(),
  markEventArrival: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => conn.value }));
vi.mock('@/app/data/event-arrival-service', () => svc);

import { ArrivalQuestion, useArrivalGate } from '@/app/prototypes/events/arrival/ArrivalGate';

const inWindow = new Date(Date.now() + 20 * 60_000).toISOString(); // starts in 20 min
const event = {
  id: 'ev-1',
  slug: 'cn',
  hostId: 'host-1',
  preparationEnabled: true,
  location: 'Zuzalu library, 4Seas Nimman, Chiang Mai',
  datetime: inWindow,
  durationMinutes: 120,
  timezone: 'Asia/Bangkok',
} as unknown as EventWithHost;

let lastSearch = '';
function SearchSpy() {
  lastSearch = useLocation().search;
  return null;
}
const wrapperAt = (url: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[url]}>
    <SearchSpy />
    {children}
  </MemoryRouter>
);

beforeEach(() => {
  auth.value = { user: null, session: { user: { id: 'viewer-1' } } };
  conn.value = { offline: false, reconnectTick: 0 };
  svc.getMyArrival.mockReset().mockResolvedValue(null);
  svc.markEventArrival.mockReset().mockResolvedValue('2026-10-06T11:20:00Z');
  lastSearch = '';
});
afterEach(() => vi.useRealTimers());

describe('useArrivalGate', () => {
  it('not checked in, inside the window: asks', async () => {
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room') });
    await waitFor(() => expect(result.current.gate).toBe(true));
  });

  it('already checked in: goes on', async () => {
    svc.getMyArrival.mockResolvedValue('2026-10-06T11:10:00Z');
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room') });
    await waitFor(() => expect(result.current.gate).toBe(false));
  });

  it('?arrived=1 from the email: records the arrival, removes the flag, never asks', async () => {
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room?arrived=1') });
    expect(result.current.gate).toBeNull();
    await waitFor(() => expect(result.current.gate).toBe(false));
    expect(svc.markEventArrival).toHaveBeenCalledWith('ev-1');
    expect(svc.getMyArrival).not.toHaveBeenCalled();
    await waitFor(() => expect(lastSearch).toBe(''));
  });

  it('?arrived=1 but the write fails: still lets the person in', async () => {
    svc.markEventArrival.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room?arrived=1') });
    await waitFor(() => expect(result.current.gate).toBe(false));
  });

  it('a failed read lets the person in', async () => {
    svc.getMyArrival.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room') });
    await waitFor(() => expect(result.current.gate).toBe(false));
  });

  it('a hanging read: unknown at first, steps aside after 5s', () => {
    vi.useFakeTimers();
    svc.getMyArrival.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room') });
    expect(result.current.gate).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.gate).toBe(false);
  });

  it('an answer arriving after the deadline does not pull the person back out of the room', async () => {
    vi.useFakeTimers();
    let resolve!: (v: string | null) => void;
    svc.getMyArrival.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/events/cn/room') });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.gate).toBe(false);
    await act(async () => { resolve(null); });
    expect(result.current.gate).toBe(false);
  });

  it('offline, not granted, or the host: never asks', () => {
    conn.value = { offline: true, reconnectTick: 0 };
    expect(renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/r') }).result.current.gate).toBe(false);
    conn.value = { offline: false, reconnectTick: 0 };
    expect(renderHook(() => useArrivalGate(event, false), { wrapper: wrapperAt('/r') }).result.current.gate).toBe(false);
    auth.value = { user: null, session: { user: { id: 'host-1' } } };
    expect(renderHook(() => useArrivalGate(event, true), { wrapper: wrapperAt('/r') }).result.current.gate).toBe(false);
  });
});

describe('ArrivalQuestion', () => {
  function renderQuestion(onHere = vi.fn()) {
    render(
      <MemoryRouter initialEntries={['/events/cn/room']}>
        <Routes>
          <Route path="/events/cn/room" element={<ArrivalQuestion event={event} onHere={onHere} />} />
          <Route path="/events/cn/arriving" element={<p>arriving page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    return onHere;
  }

  it('names the venue, with I\'m here and Not yet', () => {
    renderQuestion();
    expect(screen.getByRole('heading', { name: 'Have you arrived at Zuzalu library?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "I'm here" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeTruthy();
  });

  it("I'm here records the arrival, then continues", async () => {
    const onHere = renderQuestion();
    fireEvent.click(screen.getByRole('button', { name: "I'm here" }));
    await waitFor(() => expect(onHere).toHaveBeenCalled());
    expect(svc.markEventArrival).toHaveBeenCalledWith('ev-1');
  });

  it('Not yet opens the See you soon page', () => {
    renderQuestion();
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    expect(screen.getByText('arriving page')).toBeTruthy();
  });
});
