/**
 * @file p849-reveal-dwell-tracker.test.tsx
 * @description P849 — Unit tests for useRevealDwellTracker. Exercises:
 *   - No fire if visibility never confirmed
 *   - Fire on markAdvance with elapsed dwell as time_to_next_click_ms
 *   - Idempotent: second markAdvance does not double-fire
 *   - Fire on pagehide if not advanced
 *   - Hidden-tab time is excluded from dwell
 *   - Reset on stageKey change
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useRevealDwellTracker, type UseRevealDwellTrackerOptions } from '@/app/hooks/useRevealDwellTracker';
import { analytics } from '@/lib/mixpanel';

type IOCallback = (entries: Array<{ intersectionRatio: number }>) => void;

let observerCallback: IOCallback | null = null;

beforeEach(() => {
  observerCallback = null;
  vi.useFakeTimers();
  vi.spyOn(analytics, 'track').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);

  class MockIO {
    constructor(cb: IOCallback) {
      observerCallback = cb;
    }
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }
  // @ts-expect-error — installing test double
  globalThis.IntersectionObserver = MockIO;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  observerCallback = null;
  // @ts-expect-error — clean up test double
  delete globalThis.IntersectionObserver;
});

function makeOpts(overrides: Partial<UseRevealDwellTrackerOptions> = {}): UseRevealDwellTrackerOptions {
  return {
    enabled: true,
    stageKey: 'story1:point-revealed',
    letterId: 'letter-abc',
    stageType: 'anti-point',
    stageIndex: 1,
    gap: 2,
    ...overrides,
  };
}

function renderTracker(opts: UseRevealDwellTrackerOptions) {
  const { result } = renderHook((p: UseRevealDwellTrackerOptions) => useRevealDwellTracker(p), {
    initialProps: opts,
  });
  // Attach the container ref to a real element so the effect runs
  const el = document.createElement('div');
  document.body.appendChild(el);
  act(() => {
    result.current.containerRef(el);
  });
  return { result, el };
}

function becomeVisible() {
  act(() => {
    observerCallback?.([{ intersectionRatio: 1 }]);
  });
}

function setPerfNow(ms: number) {
  (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(ms);
}

describe('useRevealDwellTracker — P849', () => {
  it('does not fire if visibility is never confirmed', () => {
    const { result } = renderTracker(makeOpts());

    act(() => {
      result.current.markAdvance();
    });

    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('fires letter_reveal_viewed on markAdvance with elapsed dwell after visibility confirmed', () => {
    const { result } = renderTracker(makeOpts());

    becomeVisible();
    // setTimeout fires inside this — startMs = perf.now() = 0 at the moment it runs
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 3 seconds of dwell since startMs=0
    setPerfNow(3000);

    act(() => {
      result.current.markAdvance();
    });

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('letter_reveal_viewed', {
      letter_id: 'letter-abc',
      stage_type: 'anti-point',
      stage_index: 1,
      time_to_next_click_ms: 3000,
      gap: 2,
      flush_via: 'advance',
    });
  });

  it('does not fire twice when markAdvance is called repeatedly (idempotent)', () => {
    const { result } = renderTracker(makeOpts());

    becomeVisible();
    act(() => vi.advanceTimersByTime(200));
    setPerfNow(1000);

    act(() => result.current.markAdvance());
    act(() => result.current.markAdvance());

    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('fires on pagehide with flush_via=pagehide if reader never advanced', () => {
    renderTracker(makeOpts());

    becomeVisible();
    act(() => vi.advanceTimersByTime(200));
    setPerfNow(5000);

    act(() => {
      fireEvent(window, new Event('pagehide'));
    });

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith(
      'letter_reveal_viewed',
      expect.objectContaining({
        time_to_next_click_ms: 5000,
        flush_via: 'pagehide',
      })
    );
  });

  it('excludes hidden-tab time from dwell', () => {
    const { result } = renderTracker(makeOpts());

    becomeVisible();
    act(() => vi.advanceTimersByTime(200));
    // startMs = 0 (perf.now was 0 when setTimeout fired)

    // 1s of visible dwell — perf.now = 1000
    setPerfNow(1000);

    // Tab hidden — hiddenSince = 1000
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => fireEvent(document, new Event('visibilitychange')));

    // 5s in hidden state — perf.now = 6000 when tab becomes visible
    setPerfNow(6000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => fireEvent(document, new Event('visibilitychange')));
    // hiddenAccum += 6000 - 1000 = 5000

    // 2s more of visible dwell, then advance — perf.now = 8000
    setPerfNow(8000);
    act(() => result.current.markAdvance());

    // Total elapsed: 8000 - 0 - 5000 = 3000
    expect(analytics.track).toHaveBeenCalledWith(
      'letter_reveal_viewed',
      expect.objectContaining({ time_to_next_click_ms: 3000 })
    );
  });

  it('resets on stageKey change — second stage tracks its own dwell independently', () => {
    const { result, rerender } = renderHook(
      (p: UseRevealDwellTrackerOptions) => useRevealDwellTracker(p),
      { initialProps: makeOpts({ stageKey: 'stage-1', gap: 1 }) }
    );
    const el1 = document.createElement('div');
    document.body.appendChild(el1);
    act(() => result.current.containerRef(el1));

    becomeVisible();
    act(() => vi.advanceTimersByTime(200));
    setPerfNow(1000);
    act(() => result.current.markAdvance());

    expect(analytics.track).toHaveBeenCalledTimes(1);

    // Switch to stage 2 — reset perf.now first so new startMs is fresh
    setPerfNow(2000);
    rerender(makeOpts({ stageKey: 'stage-2', stageType: 'story', stageIndex: 1, gap: -1 }));
    const el2 = document.createElement('div');
    document.body.appendChild(el2);
    act(() => result.current.containerRef(el2));

    becomeVisible();
    act(() => vi.advanceTimersByTime(200));
    // new startMs = perf.now() = 2000
    setPerfNow(3500);
    act(() => result.current.markAdvance());

    expect(analytics.track).toHaveBeenCalledTimes(2);
    expect(analytics.track).toHaveBeenLastCalledWith(
      'letter_reveal_viewed',
      expect.objectContaining({ stage_type: 'story', gap: -1, time_to_next_click_ms: 1500 })
    );
  });

  it('does not fire when disabled', () => {
    const { result } = renderTracker(makeOpts({ enabled: false }));

    // Even if we try to advance, no event
    act(() => result.current.markAdvance());

    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('does not fire when letterId is null', () => {
    const { result } = renderTracker(makeOpts({ letterId: null }));

    becomeVisible();
    act(() => vi.advanceTimersByTime(200));
    setPerfNow(1000);
    act(() => result.current.markAdvance());

    expect(analytics.track).not.toHaveBeenCalled();
  });

  it('keeps lint quiet on unused render helper', () => {
    // Touch render() to satisfy import (no actual UI use in these hook tests).
    const { unmount } = render(<div />);
    expect(unmount).toBeTypeOf('function');
  });
});
