/**
 * P1529 review fixes, batch 3: the arrival read's visibility gate and jitter, the waiting list's out-of-order reads, the
 * stored minutes' version round trip, the limit's parse, and the repeat Register button's past and loading states.
 */
import { readFileSync } from 'node:fs';
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

import { useMyRegistrationArrivalRead, ARRIVAL_RETRY_MS } from '@/app/prototypes/events/use-my-arrival';
import { EventWaitlistList } from '@/app/prototypes/events/components/EventWaitlistList';
import { RsvpButton } from '@/app/prototypes/events/components/RsvpButton';
import { parseLimit } from '@/app/prototypes/events/event-limit';
import { MASTERMIND_MINUTES_VERSION, dropStaleMastermindMinutes } from '@/app/prototypes/events/rounds/mastermind-host-helpers';
import { WAITLIST_BUTTON } from '@/app/prototypes/events/components/registration-copy';

const MASTERMIND_EVENT = { id: 'e1', flow: 'mastermind', seriesSlug: 'sales-mastermind' } as never;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('the arrival read stays quiet in a hidden tab and jitters its retry', () => {
  beforeEach(() => { vi.useFakeTimers(); h.role.mockReset(); });
  afterEach(() => { setVisibility('visible'); vi.useRealTimers(); });

  it('the pending read counts as unknown (undefined), not as no answers', () => {
    h.role.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useMyRegistrationArrivalRead(MASTERMIND_EVENT, 'v1'));
    expect(result.current.arrival).toBeUndefined();
    expect(readFileSync('src/app/prototypes/events/prep/use-prep-state.ts', 'utf8')).toContain('arrival === undefined');
  });

  it('no retry while hidden; the retry runs once the tab is seen', async () => {
    h.role.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ participation: 'owner', observerPrep: null });
    const { result } = renderHook(() => useMyRegistrationArrivalRead(MASTERMIND_EVENT, 'v1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(h.role).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(ARRIVAL_RETRY_MS * 3); });
    expect(h.role).toHaveBeenCalledTimes(1);
    await act(async () => { setVisibility('visible'); await vi.advanceTimersByTimeAsync(0); });
    expect(h.role).toHaveBeenCalledTimes(2);
    expect(result.current.arrival?.owner).toBe(true);
  });

  it('the first read of a hidden tab waits too', async () => {
    setVisibility('hidden');
    h.role.mockResolvedValue(null);
    renderHook(() => useMyRegistrationArrivalRead(MASTERMIND_EVENT, 'v1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(h.role).not.toHaveBeenCalled();
    await act(async () => { setVisibility('visible'); await vi.advanceTimersByTimeAsync(0); });
    expect(h.role).toHaveBeenCalledTimes(1);
  });

  it('the retry delay is jittered', async () => {
    h.role.mockRejectedValue(new Error('x'));
    const spy = vi.spyOn(Math, 'random').mockReturnValue(1); // 1.25 x the base delay
    renderHook(() => useMyRegistrationArrivalRead(MASTERMIND_EVENT, 'v1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(ARRIVAL_RETRY_MS * 1.1); });
    expect(h.role).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(ARRIVAL_RETRY_MS * 0.2); });
    expect(h.role).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('the waiting list applies only the latest read', () => {
  beforeEach(() => { h.waitlist.mockReset(); });
  const entry = (id: string, name: string) => ({ profileId: id, slug: id, name, avatarColor: '#000', avatarUrl: null, hasPledged: false, position: 1 });

  it('an older response arriving after a newer one does not overwrite it', async () => {
    let first!: (v: unknown) => void;
    h.waitlist.mockReturnValueOnce(new Promise((r) => { first = r; })).mockResolvedValueOnce([entry('b', 'Newer')]);
    const { rerender } = render(<EventWaitlistList eventId="e1" isHost={false} refreshKey={1} />);
    rerender(<EventWaitlistList eventId="e1" isHost={false} refreshKey={2} />);
    await waitFor(() => expect(screen.getByText('Newer')).toBeTruthy());
    await act(async () => { first([entry('a', 'Older')]); });
    expect(screen.queryByText('Older')).toBeNull();
    expect(screen.getByText('Newer')).toBeTruthy();
  });

  it('the Retry is a 40px+ Button that shows a pending state while the read is out', async () => {
    h.waitlist.mockRejectedValueOnce(new Error('x'));
    render(<EventWaitlistList eventId="e1" isHost={false} />);
    const btn = await screen.findByTestId('event-waitlist-retry');
    expect(btn.className).toContain('min-h-11');
    let done!: (v: unknown) => void;
    h.waitlist.mockReturnValueOnce(new Promise((r) => { done = r; }));
    fireEvent.click(btn);
    await waitFor(() => expect((screen.getByTestId('event-waitlist-retry') as HTMLButtonElement).disabled).toBe(true));
    await act(async () => { done([entry('a', 'Ann')]); });
    await waitFor(() => expect(screen.getByText('Ann')).toBeTruthy());
  });

  it('the stale-list Retry is a Button, not a raw button', () => {
    expect(readFileSync('src/app/prototypes/events/components/EventWaitlistList.tsx', 'utf8')).not.toMatch(/<button\b/);
  });
});

describe('stored mastermind minutes: old save, load, change, save, load keeps it', () => {
  it('round trip', () => {
    const store: Record<string, string> = {};
    const defaults = { mastermindMinutesV: MASTERMIND_MINUTES_VERSION, minutes: { a: 1 } as Record<string, number> };
    const load = () => {
      const saved = dropStaleMastermindMinutes(JSON.parse(store.k ?? '{}') as { mastermindMinutes?: unknown; mastermindMinutesV?: number });
      return { ...defaults, ...saved };
    };
    store.k = JSON.stringify({ mastermindMinutes: { seatingS: 1, speakerS: 2, observerS: 3 } }); // an old save
    const loaded = load();
    expect('mastermindMinutes' in loaded).toBe(false);
    expect(loaded.mastermindMinutesV).toBe(MASTERMIND_MINUTES_VERSION);
    store.k = JSON.stringify({ ...loaded, mastermindMinutes: { seatingS: 60, speakerS: 300, observerS: 60 } });
    expect(load().mastermindMinutes).toEqual({ seatingS: 60, speakerS: 300, observerS: 60 });
  });
});

describe('parseLimit accepts only plain positive integers a Postgres integer holds', () => {
  it('rejects hex, exponents, leading zeros, signs and overflow', () => {
    for (const bad of ['0x10', '1e3', '999999999999', '2147483648', '007', '+5', '-1', '1.0', '0']) expect(parseLimit(bad)).toBeUndefined();
    expect(parseLimit('2147483647')).toBe(2147483647);
    expect(parseLimit(' 12 ')).toBe(12);
  });
});

describe('the repeat Register button (asking flow)', () => {
  const base = { onRsvp: vi.fn(), asksBeforeSeat: true, placesLeft: 3, isFull: false, loading: false };
  it('a past event shows no repeat button, full or not', () => {
    const { container } = render(<RsvpButton {...base} trigger="card_bottom" isPast />);
    expect(container.querySelector('button')).toBeNull();
    const full = render(<RsvpButton {...base} trigger="card_bottom" isPast isFull />);
    expect(full.container.querySelector('button')).toBeNull();
  });
  it('joining the waiting list keeps the waiting-list label, never "Registering..."', () => {
    render(<RsvpButton {...base} trigger="card_bottom" isPast={false} isFull loading />);
    const b = screen.getByTestId('rsvp-button-repeat');
    expect(b.textContent).toBe(WAITLIST_BUTTON);
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });
  it('Clarity Night output is unchanged', () => {
    render(<RsvpButton {...base} asksBeforeSeat={false} trigger="card_bottom" isPast />);
    expect(screen.getByTestId('rsvp-button-repeat')).toBeTruthy();
  });
});
