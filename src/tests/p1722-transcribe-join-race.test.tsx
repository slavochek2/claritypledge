/**
 * P1722 UAT round 6: the Join gate and the disclosure paragraph read ONE lookup snapshot. With the lookups resolving while the form is
 * mounted (no remount), Join stays disabled until the paragraph's final text is in the DOM, and the events lookup runs once.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';

const lk = vi.hoisted(() => {
  const d = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
  return { d, room: null as unknown, ev: null as unknown, eventsCalls: { n: 0 }, signals: [] as AbortSignal[] };
});
vi.mock('@/app/data/transcribe-service', () => ({ getRoomByCode: () => (lk.room as { promise: Promise<unknown> }).promise }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ abortSignal: (s: AbortSignal) => { lk.signals.push(s); return { maybeSingle: () => { lk.eventsCalls.n++; return (lk.ev as { promise: Promise<unknown> }).promise; } }; } }) }) }) },
}));

import { TranscribeJoinForm } from '@/app/pages/transcribe-join-form';
import { ROUND_UPDATE_CONSENT } from '@/app/components/session/capture-copy';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Join and the disclosure paragraph share one snapshot', () => {
  it('Join stays disabled until the Mastermind text is in the paragraph; the events lookup is called once', async () => {
    lk.room = lk.d(); lk.ev = lk.d(); lk.eventsCalls.n = 0; lk.signals.length = 0;
    render(<TranscribeJoinForm urlCode="RACE01" joinError={null} joining={false} onJoin={() => undefined} />);
    const join = screen.getByTestId('transcribe-join-button');
    const intro = () => screen.getByTestId('transcribe-consent-intro').textContent ?? '';
    expect(join).toBeDisabled();
    expect(intro()).toContain('Checking this room');

    await act(async () => { (lk.room as { resolve: (v: unknown) => void }).resolve({ id: 'r', eventId: 'ev-1', inChat: false }); });
    // the room is known to be an event room, the mastermind lookup is still pending: the paragraph is not final, so Join is not enabled
    expect(join).toBeDisabled();
    expect(intro()).not.toContain(ROUND_UPDATE_CONSENT);
    // round 9: the live region holds no partial event wording, only the pending text, until everything is settled
    expect(intro()).toBe('Checking this room…');

    await act(async () => { (lk.ev as { resolve: (v: unknown) => void }).resolve({ data: { flow: null, series_slug: 'sales-mastermind' }, error: null }); });
    expect(intro()).toContain(ROUND_UPDATE_CONSENT);
    expect(join).toBeEnabled();
    expect(lk.eventsCalls.n, 'one events lookup').toBe(1);
  });

  it('a FAILED room lookup: no wording, Join disabled, a Try again button; the retry succeeds and Join enables', async () => {
    let calls = 0;
    lk.room = { get promise() { calls++; return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ id: 'r', eventId: null, inChat: false }); } };
    render(<TranscribeJoinForm urlCode="RACE02" joinError={null} joining={false} onJoin={() => undefined} />);
    const retry = await screen.findByTestId('transcribe-room-retry');
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toBe('Could not check this room. Try again.');
    expect(screen.queryByTestId('transcribe-join-button'), 'no dead Join while failed').toBeNull();
    expect(retry.className).toMatch(/min-h-11/);
    expect(retry.className).toMatch(/w-full/);
    expect(retry.className).toMatch(/bg-blue-600|bg-primary/);   // the default (primary) variant, the one action
    expect(screen.getByTestId('transcribe-consent-intro')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('transcribe-consent-intro')).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(retry);
    expect(document.activeElement, 'focus moves to the status line').toBe(screen.getByTestId('transcribe-consent-intro'));
    await screen.findByText(/shown to everyone in this room/);
    expect(screen.getByTestId('transcribe-join-button')).toBeEnabled();
    expect(screen.queryByTestId('transcribe-room-retry')).toBeNull();
  });

  it('a mastermind lookup that stalls past its deadline is a failed state, not event wording', async () => {
    vi.useFakeTimers();
    lk.room = { promise: Promise.resolve({ id: 'r', eventId: 'ev-1', inChat: false }) };
    lk.ev = { promise: new Promise(() => undefined) };   // never answers
    render(<TranscribeJoinForm urlCode="RACE03" joinError={null} joining={false} onJoin={() => undefined} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByTestId('transcribe-join-button')).toBeDisabled();
    expect(screen.queryByTestId('transcribe-room-retry')).toBeNull();   // still waiting
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toBe('Could not check this room. Try again.');
    expect(screen.queryByTestId('transcribe-join-button')).toBeNull();
    expect(screen.getByTestId('transcribe-room-retry')).toBeInTheDocument();
  });

  it('an events lookup that failed: Try again recovers and Join enables', async () => {
    lk.room = { promise: Promise.resolve({ id: 'r', eventId: 'ev-1', inChat: false }) };
    let n = 0;
    lk.ev = { get promise() { n++; return n === 1 ? Promise.resolve({ data: null, error: { message: 'boom' } }) : Promise.resolve({ data: { flow: null, series_slug: null }, error: null }); } };
    render(<TranscribeJoinForm urlCode="RACE04" joinError={null} joining={false} onJoin={() => undefined} />);
    const retry = await screen.findByTestId('transcribe-room-retry');
    expect(screen.queryByTestId('transcribe-join-button')).toBeNull();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId('transcribe-join-button')).toBeEnabled());
    expect(screen.queryByTestId('transcribe-room-retry')).toBeNull();
  });

  it('round 9: the events SELECT carries an abort signal; the deadline aborts it', async () => {
    vi.useFakeTimers();
    lk.room = { promise: Promise.resolve({ id: 'r', eventId: 'ev-1', inChat: false }) };
    lk.ev = { promise: new Promise(() => undefined) };
    lk.signals.length = 0;
    render(<TranscribeJoinForm urlCode="ABRT01" joinError={null} joining={false} onJoin={() => undefined} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(lk.signals).toHaveLength(1);
    expect(lk.signals[0]?.aborted, 'still waiting, not aborted').toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(lk.signals[0]?.aborted, 'deadline aborts the in-flight SELECT').toBe(true);
  });

  it('round 9: unmounting aborts the in-flight SELECT', async () => {
    lk.room = { promise: Promise.resolve({ id: 'r', eventId: 'ev-1', inChat: false }) };
    lk.ev = { promise: new Promise(() => undefined) };
    lk.signals.length = 0;
    const view = render(<TranscribeJoinForm urlCode="ABRT02" joinError={null} joining={false} onJoin={() => undefined} />);
    await waitFor(() => expect(lk.signals).toHaveLength(1));
    expect(lk.signals[0]?.aborted).toBe(false);
    view.unmount();
    expect(lk.signals[0]?.aborted).toBe(true);
  });

  it('round 9: a retry after a deadline starts a new request with a new signal, the old one stays aborted', async () => {
    vi.useFakeTimers();
    lk.room = { promise: Promise.resolve({ id: 'r', eventId: 'ev-1', inChat: false }) };
    let n = 0;
    lk.ev = { get promise() { n++; return n === 1 ? new Promise(() => undefined) : Promise.resolve({ data: { flow: null, series_slug: null }, error: null }); } };
    lk.signals.length = 0;
    render(<TranscribeJoinForm urlCode="ABRT03" joinError={null} joining={false} onJoin={() => undefined} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    fireEvent.click(screen.getByTestId('transcribe-room-retry'));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(lk.signals).toHaveLength(2);
    expect(lk.signals[0]?.aborted).toBe(true);
    expect(lk.signals[1]?.aborted).toBe(false);
    expect(screen.getByTestId('transcribe-join-button')).toBeEnabled();
  });

  it('round 9: a missing room says so: no events lookup, no Join, no second room lookup', async () => {
    let roomCalls = 0;
    lk.room = { get promise() { roomCalls++; return Promise.resolve(null); } };
    lk.eventsCalls.n = 0; lk.signals.length = 0;
    render(<TranscribeJoinForm urlCode="GONE01" joinError={null} joining={false} onJoin={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId('transcribe-consent-intro').textContent).toBe('This room could not be found.'));
    expect(screen.queryByTestId('transcribe-join-button')).toBeNull();
    expect(screen.queryByTestId('transcribe-room-retry')).toBeNull();
    expect(lk.eventsCalls.n).toBe(0);
    expect(lk.signals).toHaveLength(0);
    expect(roomCalls, 'one room lookup').toBe(1);
  });

  it('round 9: the status line never carries partial text while the event lookup is pending', async () => {
    lk.room = lk.d(); lk.ev = lk.d();
    render(<TranscribeJoinForm urlCode="LIVE01" joinError={null} joining={false} onJoin={() => undefined} />);
    const seen: string[] = [];
    const watch = new MutationObserver(() => seen.push(screen.getByTestId('transcribe-consent-intro').textContent ?? ''));
    watch.observe(screen.getByTestId('transcribe-consent-intro'), { childList: true, characterData: true, subtree: true });
    await act(async () => { (lk.room as { resolve: (v: unknown) => void }).resolve({ id: 'r', eventId: 'ev-1', inChat: false }); });
    await act(async () => { (lk.ev as { resolve: (v: unknown) => void }).resolve({ data: { flow: null, series_slug: 'sales-mastermind' }, error: null }); });
    watch.disconnect();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((t) => t === 'Checking this room…' || t.includes(ROUND_UPDATE_CONSENT)), JSON.stringify(seen)).toBe(true);
  });
});
