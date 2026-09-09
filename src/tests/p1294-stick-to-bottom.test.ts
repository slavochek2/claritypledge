/**
 * @file p1294-stick-to-bottom.test.ts
 * @description P1294 — the room follows new messages without stealing the reader's place.
 *
 * The easy half (scroll down on new content) is one line and would pass a test written by
 * anyone. The half that matters, and the half these tests are actually for, is that a reader
 * who scrolled up is LEFT ALONE — and that they are not silently detached by a rounding error
 * while sitting visibly at the bottom.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStickToBottom, AT_BOTTOM_THRESHOLD_PX } from '@/hooks/useStickToBottom';

/** jsdom gives every element zero height, so the geometry has to be supplied. */
function makeContainer({ scrollHeight = 1000, clientHeight = 400, scrollTop = 600 } = {}) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, writable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, writable: true });
  el.scrollTop = scrollTop;
  return el;
}

let el: HTMLDivElement;
beforeEach(() => { el = makeContainer(); });

/** Render the hook with the container already attached, as the component does. */
function mount(revision: unknown) {
  const view = renderHook(({ rev }) => {
    const s = useStickToBottom<HTMLDivElement>(rev);
    s.containerRef.current = el;
    return s;
  }, { initialProps: { rev: revision } });
  return view;
}

describe('P1294: the transcript follows new messages', () => {
  it('scrolls to the bottom when a new message arrives and the reader is at the bottom', () => {
    const { result, rerender } = mount(1);
    act(() => { result.current.scrollToBottom('auto'); });

    // New content lengthens the list.
    Object.defineProperty(el, 'scrollHeight', { value: 1500, writable: true });
    act(() => { rerender({ rev: 2 }); });

    expect(el.scrollTop, 'a new message must bring the newest line into view').toBe(1500);
    expect(result.current.isAtBottom).toBe(true);
  });

  it('does NOT move the viewport when the reader has scrolled up', () => {
    // The rule that matters. A reader half-way up the transcript is reading; yanking them to
    // the bottom every few seconds while someone talks makes the room unreadable.
    const { result, rerender } = mount(1);

    el.scrollTop = 100;                       // scrolled well up: 1000 - 100 - 400 = 500 away
    act(() => { result.current.onScroll(); });
    expect(result.current.isAtBottom, 'scrolling up must detach').toBe(false);

    Object.defineProperty(el, 'scrollHeight', { value: 1500, writable: true });
    act(() => { rerender({ rev: 2 }); });

    expect(el.scrollTop, 'a detached reader must be left exactly where they were').toBe(100);
    expect(result.current.isAtBottom).toBe(false);
  });

  it('treats "a few pixels short of the bottom" as the bottom', () => {
    // Without the threshold, fractional device pixel ratios and momentum leave a pixel or two
    // behind, the reader silently counts as detached, and following stops while they are
    // visibly at the bottom — this feature failing in the exact way it was asked to fix.
    const { result } = mount(1);

    el.scrollTop = 1000 - 400 - (AT_BOTTOM_THRESHOLD_PX - 1); // 1px inside the threshold
    act(() => { result.current.onScroll(); });
    expect(result.current.isAtBottom, 'just short of the bottom is still the bottom').toBe(true);

    el.scrollTop = 1000 - 400 - (AT_BOTTOM_THRESHOLD_PX + 1); // 1px outside
    act(() => { result.current.onScroll(); });
    expect(result.current.isAtBottom, 'clearly scrolled up is detached').toBe(false);
  });

  it('re-attaches when the reader scrolls back down on their own', () => {
    const { result, rerender } = mount(1);

    el.scrollTop = 100;
    act(() => { result.current.onScroll(); });
    expect(result.current.isAtBottom).toBe(false);

    el.scrollTop = 600;                       // back to the bottom by hand
    act(() => { result.current.onScroll(); });
    expect(result.current.isAtBottom).toBe(true);

    Object.defineProperty(el, 'scrollHeight', { value: 1500, writable: true });
    act(() => { rerender({ rev: 2 }); });
    expect(el.scrollTop, 'following resumes without needing the button').toBe(1500);
  });

  it('scrollToBottom re-attaches, so the next message keeps following', () => {
    const { result, rerender } = mount(1);

    el.scrollTop = 100;
    act(() => { result.current.onScroll(); });
    expect(result.current.isAtBottom).toBe(false);

    act(() => { result.current.scrollToBottom('auto'); });   // the button
    expect(el.scrollTop).toBe(1000);
    expect(result.current.isAtBottom).toBe(true);

    Object.defineProperty(el, 'scrollHeight', { value: 1500, writable: true });
    act(() => { rerender({ rev: 2 }); });
    expect(el.scrollTop, 'one tap must restore following, not just jump once').toBe(1500);
  });

  it('does not scroll when the revision is unchanged', () => {
    // /transcribe replaces its messages array wholesale on a 15-second reconciliation poll.
    // Keying on array identity would re-scroll on every poll and fight the reader on a timer.
    const { result, rerender } = mount(1);
    el.scrollTop = 100;
    act(() => { result.current.onScroll(); });

    act(() => { rerender({ rev: 1 }); });     // same revision, new render
    expect(el.scrollTop).toBe(100);
  });
});
