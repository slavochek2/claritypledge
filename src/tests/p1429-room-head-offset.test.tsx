/**
 * P1429 A4: the room's pinned step bar sat at "nav + 49px", so it slid under the offline strip
 * (which pushes the nav down 1.75rem) and under a capture bar taller than its short form (a
 * wrapped status line). It now offsets from the offline strip and the MEASURED capture bar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { roomHeadOffset, useMeasuredHeight } from '@/app/prototypes/events/components/room-head-offset';

describe('roomHeadOffset', () => {
  it('online, no bar: nothing below the nav', () => {
    expect(roomHeadOffset(false, 0)).toBe('0px');
  });
  it('adds the offline strip and the measured bar height', () => {
    expect(roomHeadOffset(true, 0)).toBe('calc(1.75rem + 0px)');
    expect(roomHeadOffset(false, 61)).toBe('61px');
    expect(roomHeadOffset(true, 49)).toBe('calc(1.75rem + 49px)');
  });
});

describe('useMeasuredHeight', () => {
  let observed: ((h: number) => void) | null = null;
  class FakeObserver {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(el: Element) {
      observed = (h) => { (el as HTMLElement).getBoundingClientRect = () => ({ height: h } as DOMRect); this.cb([], this as unknown as ResizeObserver); };
    }
    disconnect() { observed = null; }
  }
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  function Probe({ active }: { active: boolean }) {
    const h = useMeasuredHeight('[data-testid="room-capture-bar"]', active);
    return <output data-testid="h">{h}</output>;
  }

  it('reads the bar\'s real height and follows it as it changes; 0 when inactive', () => {
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const bar = document.createElement('div');
    bar.setAttribute('data-testid', 'room-capture-bar');
    bar.getBoundingClientRect = () => ({ height: 49 } as DOMRect);
    document.body.appendChild(bar);

    const { getByTestId, rerender } = render(<Probe active />);
    expect(getByTestId('h').textContent).toBe('49');
    act(() => observed!(73)); // the status line wrapped
    expect(getByTestId('h').textContent).toBe('73');
    rerender(<Probe active={false} />);
    expect(getByTestId('h').textContent).toBe('0');
  });
});
