// @vitest-environment jsdom
/**
 * P1542 round 7 polish: the "finished" write never gives up (capped backoff), one colour per step state, a tick +
 * label that fits at 320, the shared pinned-footer treatment, and the end-of-scroll signal that turns its fade off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

const { finish } = vi.hoisted(() => ({ finish: vi.fn() }));
vi.mock('@/app/data/event-close-service', () => ({ finishEventClose: (...a: unknown[]) => finish(...a) }));

import { finishRetryDelay, FINISH_MAX_ATTEMPTS, FINISH_RETRY_BASE_MS, FINISH_RETRY_MAX_MS, useFinishCloseOnce } from '@/app/prototypes/events/close/use-finish-close';
import { RoomSteps } from '@/app/prototypes/events/rounds/RoomSteps';
import { PINNED_FADE_CLASS, PINNED_FADE_OFF_CLASS, PINNED_FLAT_DESKTOP_CLASS, useScrolledToEnd } from '@/app/prototypes/events/prep/prep-ui';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('(7b, A+B) the "finished" write: bounded retries, nothing from a hidden tab, recovery on online / visible', () => {
  let visibility: 'visible' | 'hidden' = 'visible';
  beforeEach(() => {
    vi.useFakeTimers();
    finish.mockReset();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => vi.useRealTimers());
  const setVisibility = (v: 'visible' | 'hidden') => { visibility = v; document.dispatchEvent(new Event('visibilitychange')); };
  const HOUR = 60 * 60 * 1000;

  it('the delay doubles from 3s with jitter (50-100%) and never exceeds 5 minutes', () => {
    expect(finishRetryDelay(1, () => 1)).toBe(3000);
    expect(finishRetryDelay(1, () => 0)).toBe(1500);
    expect(finishRetryDelay(3, () => 1)).toBe(12_000);
    expect(finishRetryDelay(20, () => 1)).toBe(FINISH_RETRY_MAX_MS);
    expect(FINISH_RETRY_MAX_MS).toBe(5 * 60 * 1000);
  });

  it('one hour of persistent failure in a visible tab stays under 20 requests (one chain: 8)', async () => {
    finish.mockResolvedValue(false);
    renderHook(() => useFinishCloseOnce(true, 'e1', false));
    await flush();
    for (let t = 0; t < HOUR; t += 10_000) { await vi.advanceTimersByTimeAsync(10_000); await flush(); }
    expect(finish.mock.calls.length).toBeLessThan(20);
    expect(finish).toHaveBeenCalledTimes(FINISH_MAX_ATTEMPTS);
  });

  it('a hidden tab sends nothing for an hour; becoming visible retries at once', async () => {
    visibility = 'hidden';
    finish.mockResolvedValue(false);
    renderHook(() => useFinishCloseOnce(true, 'e1', false));
    for (let t = 0; t < HOUR; t += 60_000) { await vi.advanceTimersByTimeAsync(60_000); await flush(); }
    expect(finish).toHaveBeenCalledTimes(0);
    finish.mockResolvedValue(true);
    act(() => setVisibility('visible'));
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('a due retry while hidden waits for the tab to be visible again', async () => {
    finish.mockResolvedValueOnce(false).mockResolvedValue(true);
    renderHook(() => useFinishCloseOnce(true, 'e1', false));
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    act(() => setVisibility('hidden'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await flush();
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it('after an exhausted chain, coming back online starts a new one and recovery records it', async () => {
    finish.mockResolvedValue(false);
    renderHook(() => useFinishCloseOnce(true, 'e1', false));
    await flush();
    await vi.advanceTimersByTimeAsync(HOUR);
    await flush();
    expect(finish).toHaveBeenCalledTimes(FINISH_MAX_ATTEMPTS);
    finish.mockResolvedValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(finish).toHaveBeenCalledTimes(FINISH_MAX_ATTEMPTS + 1);
    await vi.advanceTimersByTimeAsync(HOUR);
    act(() => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(finish).toHaveBeenCalledTimes(FINISH_MAX_ATTEMPTS + 1); // recorded: nothing more, even on 'online'
  });

  it('a thrown request (offline) is retried like a failed one; unmount stops the chain', async () => {
    finish.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(false);
    const { unmount } = renderHook(() => useFinishCloseOnce(true, 'e1', false));
    await flush();
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_BASE_MS);
    await flush();
    expect(finish).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it('(7c, 1a) a stale e1 response mutates nothing: after the switch to e2 and an online event, exactly 1 e2 request is in flight', async () => {
    let resolveE1: (v: boolean) => void = () => {};
    const pending: Record<string, number> = {};
    finish.mockImplementation((id: string) => {
      pending[id] = (pending[id] ?? 0) + 1;
      return id === 'e1' ? new Promise<boolean>((r) => { resolveE1 = r; }) : new Promise<boolean>(() => {}); // e2 stays pending
    });
    const { rerender } = renderHook(({ id }) => useFinishCloseOnce(true, id, false), { initialProps: { id: 'e1' } });
    await flush();
    expect(pending).toEqual({ e1: 1 });
    rerender({ id: 'e2' });
    await flush();
    expect(pending).toEqual({ e1: 1, e2: 1 });
    resolveE1(false); // the old event's answer arrives late
    await flush();
    act(() => { window.dispatchEvent(new Event('online')); });
    await flush();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await flush();
    expect(pending.e2).toBe(1); // still exactly one e2 request, no duplicate
  });

  it('(7c, 1b) mid-chain, online / visible do not jump the backoff: the pending timer keeps its turn', async () => {
    finish.mockResolvedValue(false);
    renderHook(() => useFinishCloseOnce(true, 'e1', false));
    await flush();
    expect(finish).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event('online')); });
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await flush();
    expect(finish).toHaveBeenCalledTimes(1); // no immediate extra attempt
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_BASE_MS);
    await flush();
    expect(finish).toHaveBeenCalledTimes(2); // the scheduled retry
  });

  it('(7c, 1c) alreadyFinished turning true for the same event after mount means no request', async () => {
    finish.mockResolvedValue(true);
    const { rerender } = renderHook(({ at, fin }) => useFinishCloseOnce(at, 'e1', fin), { initialProps: { at: false, fin: false } });
    rerender({ at: false, fin: true });
    rerender({ at: true, fin: true });
    await flush();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(finish).not.toHaveBeenCalled();
  });

  it('(B) a different event resets the state: its own write is sent even after the first one was done', async () => {
    finish.mockResolvedValue(true);
    const { rerender } = renderHook(({ id }) => useFinishCloseOnce(true, id, false), { initialProps: { id: 'e1' } });
    await flush();
    expect(finish).toHaveBeenLastCalledWith('e1');
    rerender({ id: 'e2' });
    await flush();
    expect(finish).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenLastCalledWith('e2');
  });
});

describe('(3, 4) step bar: one colour per state, and a tick + label that fits at 320', () => {
  const hike = { hidden: ['ready', 'table', 'compare'] as ('ready' | 'table' | 'compare')[], labels: { principle: 'Opt in', close: 'Give feedback' } };
  const text = (id: string) => screen.getByTestId(`room-step-${id}-text`).className;

  it('reached but not done (a skipped Opt in) reads dark, like Learn; a step ahead is the muted grey; on screen is bold', () => {
    const { unmount } = render(<RoomSteps current="close" viewing="close" onSelect={() => {}} {...hike} done={{ principle: false, close: false }} learn={{ done: false, onOpen: () => {} }} />);
    expect(text('principle')).toMatch(/(^|\s)text-foreground(\s|$)/);
    expect(text('principle')).not.toMatch(/text-muted-foreground/);
    expect(screen.getByTestId('room-step-learn-text').className).toMatch(/(^|\s)text-foreground(\s|$)/);
    expect(text('close')).toMatch(/font-semibold text-foreground/);
    unmount();
    render(<RoomSteps current="principle" viewing="principle" onSelect={() => {}} {...hike} />);
    expect(text('close')).toMatch(/(^|\s)text-muted-foreground(\s|$)/); // ahead
  });

  it('done: dark with its tick; "(optional)" is the full muted grey at EVERY width (round 7b, D)', () => {
    render(<RoomSteps current="close" viewing="close" onSelect={() => {}} {...hike} done={{ principle: true, close: true }} learn={{ done: true, onOpen: () => {} }} />);
    expect(text('principle')).toMatch(/(^|\s)text-foreground(\s|$)/);
    expect(screen.getByTestId('room-step-principle-check')).toBeTruthy();
    const optional = screen.getByTestId('room-step-learn-optional').className;
    expect(optional.split(' ')).toContain('text-muted-foreground'); // unprefixed: every width
    expect(optional).not.toMatch(/text-muted-foreground\/\d+/);
  });

  it('(7b, F) one tick for every done step: the same colour class and stroke on Learn and on the steps', () => {
    render(<RoomSteps current="close" viewing="close" onSelect={() => {}} {...hike} done={{ principle: true, close: true }} learn={{ done: true, onOpen: () => {} }} />);
    const ticks = ['learn', 'principle', 'close'].map((id) => screen.getByTestId(`room-step-${id}-check`));
    const colours = ticks.map((t) => (t.getAttribute('class') ?? '').split(' ').filter((c) => /^text-blue-/.test(c)).join());
    expect(new Set(colours)).toEqual(new Set(['text-blue-600']));
    expect(new Set(ticks.map((t) => t.getAttribute('stroke-width')))).toEqual(new Set(['3']));
  });

  it('at 320 the short bar tightens the tick gap and tracking (no ellipsis)', () => {
    render(<RoomSteps current="close" viewing="close" onSelect={() => {}} {...hike} done={{ close: true }} />);
    expect(text('close')).toMatch(/max-\[359px\]:gap-px/);
    expect(text('close')).toMatch(/max-\[359px\]:tracking-tighter/);
    expect(text('close')).not.toMatch(/truncate|ellipsis/);
  });

  it('Clarity Night\'s five-step bar keeps its colours (reached steps stay muted)', () => {
    render(<RoomSteps current="compare" viewing="compare" onSelect={() => {}} />);
    expect(text('principle')).toMatch(/(^|\s)text-muted-foreground(\s|$)/);
  });
});

describe('(1, 2, 6) the shared pinned-footer treatment', () => {
  it('(7c) a 128px EASED fade: solid for 28px, 95% at 36px, 90% at 64px, transparent at 128px; off at the end', () => {
    expect(PINNED_FADE_CLASS).toMatch(/before:-top-32 before:h-32/);
    expect(PINNED_FADE_CLASS).toContain('before:bg-[linear-gradient(to_top,hsl(var(--background))_0px,hsl(var(--background))_28px,hsl(var(--background)/0.95)_36px,hsl(var(--background)/0.9)_64px,transparent_128px)]');
    // Round 7b (E): at the end the fade goes and, on desktop, the flat bar turns transparent (no hard line through the shadow).
    expect(PINNED_FADE_OFF_CLASS).toBe('before:opacity-0 lg:bg-transparent');
    expect(PINNED_FLAT_DESKTOP_CLASS).toBe('lg:rounded-none lg:border-0 lg:shadow-none');
  });

  it('useScrolledToEnd: observes the end sentinel above the bar, and reports when it comes into view', () => {
    let cb: IntersectionObserverCallback = () => {};
    let options: IntersectionObserverInit | undefined;
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(c: IntersectionObserverCallback, o?: IntersectionObserverInit) { cb = c; options = o; }
      observe = observe;
      disconnect = vi.fn();
    });
    const { result } = renderHook(() => useScrolledToEnd(120));
    const sentinel = document.createElement('div');
    act(() => result.current[0](sentinel));
    expect(observe).toHaveBeenCalledWith(sentinel);
    expect(options?.rootMargin).toBe('0px 0px -120px 0px');
    expect(result.current[1]).toBe(false);
    act(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(result.current[1]).toBe(true);
    // Round 7c (3): the sentinel unmounting resets the signal (the fade comes back).
    act(() => result.current[0](null));
    expect(result.current[1]).toBe(false);
    vi.unstubAllGlobals();
  });
});
