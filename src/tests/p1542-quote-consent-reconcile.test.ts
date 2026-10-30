// @vitest-environment jsdom
/**
 * P1542 final review (Codex): a failed LATEST click must still bring the box back to the server's value, even when an
 * older click's write was still out at the time. Sequence: tick (write held) → untick (write fails) → the tick's write
 * succeeds. The server then holds the tick (the untick never landed), so the box must show ticked again — not stay
 * unticked over consent the server still has.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  server: true as boolean,
  writes: [] as Array<{ value: boolean; resolve: (ok: boolean) => void }>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/data/event-close-service', () => ({
  setEventQuoteOk: vi.fn((_id: string, value: boolean) => new Promise<boolean>((resolve) => {
    svc.writes.push({
      value,
      resolve: (ok) => { if (ok) svc.server = value; resolve(ok); },
    });
  })),
  getEventClose: vi.fn(async () => ({ quoteOk: svc.server })),
}));

import { useQuoteConsent } from '@/app/prototypes/events/close/use-quote-consent';
import { getEventClose } from '@/app/data/event-close-service';

beforeEach(() => {
  svc.server = false; // the person had refused before; the box starts unticked
  svc.writes = [];
  vi.mocked(getEventClose).mockClear();
});

describe('a failed latest click while an older write is still out', () => {
  it('tick (held) → untick fails → the tick lands: the box shows the server (ticked)', async () => {
    const { result } = renderHook(() => useQuoteConsent('ev-1', false, 'improve'));
    act(() => result.current.toggle(true)); // 1. tick, its write held
    act(() => result.current.toggle(false)); // 2. untick
    expect(svc.writes.map((w) => w.value)).toEqual([true, false]);
    await act(async () => { svc.writes[1]!.resolve(false); }); // 2. the untick's write fails (3. recovery waits)
    expect(result.current.quoteOk).toBe(false);
    await act(async () => { svc.writes[0]!.resolve(true); }); // 4. the older tick succeeds: the server holds true
    expect(svc.server).toBe(true);
    // 5. no write is out any more, and the latest click failed: the box re-reads and shows what the server holds.
    await waitFor(() => expect(result.current.quoteOk).toBe(true));
    expect(getEventClose).toHaveBeenCalledTimes(1);
  });

  it('control: the latest click succeeding needs no re-read', async () => {
    const { result } = renderHook(() => useQuoteConsent('ev-1', false, 'improve'));
    act(() => result.current.toggle(true));
    act(() => result.current.toggle(false));
    await act(async () => { svc.writes[1]!.resolve(true); });
    await act(async () => { svc.writes[0]!.resolve(true); });
    expect(result.current.quoteOk).toBe(false);
    expect(getEventClose).not.toHaveBeenCalled();
  });

  it('a newer click after the failure supersedes the recovery: no re-read overrides it', async () => {
    const { result } = renderHook(() => useQuoteConsent('ev-1', false, 'improve'));
    act(() => result.current.toggle(true));
    act(() => result.current.toggle(false));
    await act(async () => { svc.writes[1]!.resolve(false); });
    act(() => result.current.toggle(false)); // the person clicks again
    await act(async () => { svc.writes[0]!.resolve(true); });
    await act(async () => { svc.writes[2]!.resolve(true); });
    expect(result.current.quoteOk).toBe(false);
    expect(getEventClose).not.toHaveBeenCalled();
  });
});

describe('a series with no box (a hike since 2026-10-30: writing is the consent)', () => {
  it('enabled = false: entering "What did you like" reads nothing', async () => {
    const { rerender } = renderHook(({ step }) => useQuoteConsent('ev-1', false, step, false), { initialProps: { step: 'improve' } });
    rerender({ step: 'appreciate' });
    await act(async () => {});
    expect(getEventClose).not.toHaveBeenCalled();
  });

  it('control: with the box, entering the step reads once', async () => {
    const { rerender } = renderHook(({ step }) => useQuoteConsent('ev-1', false, step), { initialProps: { step: 'improve' } });
    rerender({ step: 'appreciate' });
    await waitFor(() => expect(getEventClose).toHaveBeenCalledTimes(1));
  });
});
