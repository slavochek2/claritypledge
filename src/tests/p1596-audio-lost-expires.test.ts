/**
 * P1596: "audio lost" is a statement about the last minute, not about the whole session. It clears 60 s after the
 * latest loss (each new loss restarts the clock) and at once when capture stops.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExpiringFlag } from '@/lib/use-expiring-flag';

describe('useExpiringFlag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is on after a loss and off 60 s later', () => {
    const { result } = renderHook(() => useExpiringFlag(60_000));
    expect(result.current.on).toBe(false);
    act(() => result.current.mark());
    expect(result.current.on).toBe(true);
    act(() => { vi.advanceTimersByTime(59_999); });
    expect(result.current.on).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.on).toBe(false);
  });

  it('a newer loss restarts the clock', () => {
    const { result } = renderHook(() => useExpiringFlag(60_000));
    act(() => result.current.mark());
    act(() => { vi.advanceTimersByTime(40_000); });
    act(() => result.current.mark());
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(result.current.on).toBe(true);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.on).toBe(false);
  });

  it('clear() turns it off at once and nothing fires later', () => {
    const { result } = renderHook(() => useExpiringFlag(60_000));
    act(() => result.current.mark());
    act(() => result.current.clear());
    expect(result.current.on).toBe(false);
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(result.current.on).toBe(false);
  });
});
