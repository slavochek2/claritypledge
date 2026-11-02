/**
 * @file p1536-s4-box-highlight.test.ts
 * @description P1536 J2 step 4: a reply chip scrolls its box to the middle and rings it for two seconds; a second tap restarts the two seconds; no such box is a no-op.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightBox, HIGHLIGHT_MS } from '@/app/components/canvas/canvas-box-highlight';

const box = (tag: string) => {
  const el = document.createElement('section');
  el.setAttribute('data-testid', `canvas-box-${tag}`);
  el.scrollIntoView = vi.fn();
  document.body.append(el);
  return el;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('highlightBox', () => {
  it('centers the box and rings it for exactly two seconds', () => {
    const el = box('canvas:revenue');
    expect(highlightBox('canvas:revenue')).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    expect(el).toHaveAttribute('data-highlight');
    vi.advanceTimersByTime(HIGHLIGHT_MS - 1);
    expect(el).toHaveAttribute('data-highlight');
    vi.advanceTimersByTime(1);
    expect(el).not.toHaveAttribute('data-highlight');
  });

  it('a second tap restarts the two seconds; another box takes the ring from the first', () => {
    const a = box('canvas:revenue');
    const b = box('canvas:metrics');
    highlightBox('canvas:revenue');
    vi.advanceTimersByTime(1500);
    highlightBox('canvas:revenue');
    vi.advanceTimersByTime(1500);
    expect(a).toHaveAttribute('data-highlight'); // 3s after the first tap, 1.5s after the second
    highlightBox('canvas:metrics');
    expect(a).not.toHaveAttribute('data-highlight');
    expect(b).toHaveAttribute('data-highlight');
  });

  it('no such box on screen: false, nothing happens', () => {
    expect(highlightBox('canvas:problem')).toBe(false);
  });
});
