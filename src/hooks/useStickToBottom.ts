import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a scrollable list pinned to its newest content, without ever stealing the viewport
 * from someone who has deliberately scrolled up.
 *
 * P1294. The /transcribe room is the case this exists for: the reader is SPEAKING, so they
 * cannot hold a phone, talk, and hand-scroll at the same time — and the line that just
 * arrived is how they tell whether the room heard them.
 *
 * The rule that matters is the second one. Auto-scroll is easy; auto-scroll that does not
 * yank a reader out of the middle of the transcript is the whole job. Sticking is a MODE the
 * reader controls by scrolling, not a behaviour applied to every update.
 */

/**
 * How close to the bottom still counts as "at the bottom", in CSS pixels.
 *
 * Not cosmetic. `scrollHeight - scrollTop - clientHeight` is rarely exactly 0: fractional
 * device pixel ratios, sub-pixel line heights and momentum scrolling all leave a pixel or
 * two behind. With a zero threshold a reader who is visibly at the bottom silently counts as
 * detached, sticking stops, and the list quietly stops following — the exact complaint this
 * hook answers, reintroduced by a rounding error.
 */
export const AT_BOTTOM_THRESHOLD_PX = 48;

export interface StickToBottom<T extends HTMLElement> {
  /** Attach to the scrolling container. */
  containerRef: React.RefObject<T | null>;
  /** Attach to the container's onScroll. */
  onScroll: () => void;
  /** False once the reader has scrolled away from the bottom. Drives the return button. */
  isAtBottom: boolean;
  /** Scroll to the bottom and re-enter sticking. Always instant — see the implementation. */
  scrollToBottom: () => void;
}

/**
 * @param revision changes whenever new content is appended. Pass a STABLE scalar — a count,
 *   or a last-id — never the array itself. /transcribe replaces its `messages` array
 *   wholesale on every realtime event AND on a 15-second reconciliation poll, so keying on
 *   array identity would re-scroll every poll and fight the reader on a timer.
 */
export function useStickToBottom<T extends HTMLElement>(revision: unknown): StickToBottom<T> {
  const containerRef = useRef<T | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Read by the append effect. A ref, not the state, so the effect does not need isAtBottom
  // in its dependencies — with it there, re-entering sticking would itself trigger a scroll.
  const stickRef = useRef(true);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance <= AT_BOTTOM_THRESHOLD_PX;
    stickRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // scrollTo rather than scrollIntoView: this must move THIS container and nothing else.
    // scrollIntoView walks every scrollable ancestor, which on the room screen would also
    // move the page behind the list.
    //
    // ALWAYS INSTANT, never smooth, and that is the fix rather than an oversight. Assigning
    // scrollTop directly aborts an in-progress native smooth scroll, so the two lines below
    // would fight each other and the animation would die in the same tick — smooth would be
    // dead code pretending to be a feature. Rather than gate one line on the other, the
    // animation is removed: new lines arrive every few seconds while someone is speaking, and
    // overlapping smooth scrolls on a phone read as the list shivering. One behaviour, no
    // in-flight animation to abort, nothing to keep in sync.
    //
    // Both calls stay, unconditionally, and both are load-bearing: jsdom defines
    // Element.scrollTo as a NO-OP stub (measured in this project's environment — `typeof
    // el.scrollTo === 'function'` is true and it moves nothing), so gating on its existence
    // silently stops the list moving under test while looking correct. The scrollTop
    // assignment is what actually works there, and it is harmless after an instant scroll.
    el.scrollTo?.({ top: el.scrollHeight, behavior: 'auto' });
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setIsAtBottom(true);
  }, []);

  useEffect(() => {
    if (!stickRef.current) return;
    scrollToBottom();
  }, [revision, scrollToBottom]);

  return { containerRef, onScroll: measure, isAtBottom, scrollToBottom };
}
