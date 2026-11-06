/**
 * P1529 review fixes 3 and 4: a failed read is not "no answers" and not "an empty list".
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ role: vi.fn(), waitlist: vi.fn(), add: vi.fn() }));
vi.mock('@/app/data/my-registration-answers', () => ({ getMyRegistrationRole: (...a: unknown[]) => h.role(...a) }));
vi.mock('@/app/data/event-waitlist', () => ({
  getWaitlistPublic: (...a: unknown[]) => h.waitlist(...a),
  hostAddFromWaitlist: (...a: unknown[]) => h.add(...a),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/components/shared/PersonRow', () => ({
  PersonRow: ({ name }: { name: string }) => <div data-testid="row">{name}</div>,
}));

import { ARRIVAL_RETRY_MS, useMyRegistrationArrivalRead } from '@/app/prototypes/events/use-my-arrival';
import { EventWaitlistList } from '@/app/prototypes/events/components/EventWaitlistList';

const EVENT = { id: 'e1', flow: 'sales-mastermind', seriesSlug: null };
const ROLE = { participation: 'owner', observerPrep: null };

describe('useMyRegistrationArrivalRead', () => {
  beforeEach(() => { vi.useFakeTimers(); h.role.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('retries once after a short delay and recovers', async () => {
    h.role.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(ROLE);
    const { result } = renderHook(() => useMyRegistrationArrivalRead(EVENT, 'u1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.arrival).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(ARRIVAL_RETRY_MS); });
    expect(h.role).toHaveBeenCalledTimes(2);
    expect(result.current.failed).toBe(false);
    expect(result.current.arrival?.owner).toBe(true);
  });

  it('after two failures exposes an error, not "no answers", and Retry reads again', async () => {
    h.role.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useMyRegistrationArrivalRead(EVENT, 'u1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(ARRIVAL_RETRY_MS + 10); });
    expect(result.current.failed).toBe(true);
    expect(result.current.arrival).toBeNull();
    h.role.mockReset();
    h.role.mockResolvedValue(ROLE);
    act(() => result.current.retry());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.failed).toBe(false);
    expect(result.current.arrival?.owner).toBe(true);
  });
});

describe('EventWaitlistList reads', () => {
  const entry = { profileId: 'p1', slug: 's', name: 'Eva F.', avatarColor: 'x', avatarUrl: null, hasPledged: false, position: 1 };
  beforeEach(() => { h.waitlist.mockReset(); });

  it('a failed read says so with Retry, and Retry loads the list', async () => {
    h.waitlist.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce([entry]);
    render(<EventWaitlistList eventId="e1" isHost={false} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not read the waiting list');
    fireEvent.click(screen.getByTestId('event-waitlist-retry'));
    await waitFor(() => expect(screen.getByTestId('row').textContent).toBe('Eva F.'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an empty list renders nothing (no error)', async () => {
    h.waitlist.mockResolvedValue([]);
    const { container } = render(<EventWaitlistList eventId="e1" isHost={false} />);
    await waitFor(() => expect(h.waitlist).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('reads again when refreshKey changes', async () => {
    h.waitlist.mockResolvedValue([entry]);
    const { rerender } = render(<EventWaitlistList eventId="e1" isHost refreshKey={1} />);
    await waitFor(() => expect(h.waitlist).toHaveBeenCalledTimes(1));
    rerender(<EventWaitlistList eventId="e1" isHost refreshKey={2} />);
    await waitFor(() => expect(h.waitlist).toHaveBeenCalledTimes(2));
  });
});
