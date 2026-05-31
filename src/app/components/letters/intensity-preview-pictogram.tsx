/**
 * @file intensity-preview-pictogram.tsx
 * @description P852 Round-H: ≤3s tutorial demo. Real PositionButtons in
 * controlled mode, puppeted by a brand-blue cursor that moves into the
 * Agree button, morphs from arrow → finger on click, presses; the dropdown
 * opens; cursor moves down onto the FIRST row (somewhat_agree / Slightly
 * Agree), morphs + presses; the Agree button's visual state changes to
 * Slightly Agree. The pictogram then stays mounted in this final state —
 * the parent (IntensityTutorialModal) decides when to unmount.
 *
 * Why the cursor lives in a portal:
 *   The dropdown menu portals to document.body at z-[9999]. If the cursor
 *   stayed inside the pictogram wrapper, the dropdown would paint over it
 *   when the cursor glides down to click an item — both losing sight of
 *   the cursor and hiding the press animation, which reads as "dropdown
 *   closed before the click." Portaling the cursor to body at z-[10000]
 *   guarantees it always paints above the dropdown, so the press is visible.
 *
 * Cursor coordinates are computed from the wrapper's getBoundingClientRect
 * via a ResizeObserver + scroll listener, so percentage anchors track the
 * real button positions even across layout shifts and page scroll.
 *
 * Timeline (~3900ms total — extended from 2944ms after "let the mouse move
 * a bit more to the button" feedback. Cursor sits at start before moving;
 * longer glide window; finger-pose held longer before each press; press
 * itself snaps with a separate, shorter CSS transition (130ms transform
 * vs 650ms position) so each click reads as crisp, not mushy):
 *   t=0      cursor visible at start (above-right of Agree), MousePointer2 (arrow)
 *   t=250    move begins → cursor glides 650ms toward Agree
 *   t=950    arrived; morph arrow → Pointer (finger pose held for 350ms)
 *   t=1300   press (scale 0.7); userPosition='agree', openGroup='agree'
 *            — single transition: button shows selected + dropdown opens
 *   t=1550   release (scale 1) — 250ms press window
 *   t=1700   morph finger → arrow; begin glide down to dropdown row 1
 *   t=2350   arrived over somewhat_agree (Slightly Agree); morph arrow → Pointer
 *   t=2750   press; userPosition='somewhat_agree', openGroup=null
 *            — button label updates to "Slightly Agree" + dropdown closes
 *   t=3000   release
 *   t=3400   cursor fades out (400ms opacity transition)
 *   t=3900   onAnimationFinished fires; pictogram stays mounted showing
 *            Slightly Agree selected, dropdown closed, cursor invisible.
 *            Parent (modal) bumps key → fresh pictogram remounts → loop.
 *
 * Reduced motion: synchronously set the final state (Slightly Agree
 * selected) and fire onAnimationFinished immediately — motion-sensitive
 * users still see the post-watch lesson without waiting on the animation.
 * The modal also short-circuits the loop in this mode (no infinite remount).
 *
 * Locked Decision 5 (docs/decisions.md:9): ZERO_COUNTS — never real counts
 * pre-commit. Matches the engage call sites at letter-flow-content.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MousePointer2, Pointer } from 'lucide-react';
import { PositionButtons } from '../shared/PositionButton';
import type { PositionType, PositionButtonGroup } from '@/app/types';
import { POSITION_LABELS } from '@/app/types';
import { ZERO_COUNTS } from '@/app/utils/position-helpers';

interface IntensityPreviewPictogramProps {
  /** Fires when the animation timeline completes (or immediately under
   * prefers-reduced-motion). Does NOT mean "unmount me" — the pictogram
   * stays mounted in its final state (Slightly Agree selected, cursor
   * faded) so the parent can show post-watch UI (Show again / Got It).
   * Parent passes useCallback with deps `[]` so identity is stable across
   * renders — the effect below has `[onAnimationFinished]` deps and must
   * fire only on mount. */
  onAnimationFinished: () => void;
}

type CursorStage = 'start' | 'button' | 'item';

/** Derive cursor viewport coordinates from the wrapper rect. Percentages chosen so
 * the cursor lands over the Agree group (right third of the button row) and roughly
 * the center of dropdown row 1 (somewhat_agree / Slightly Agree).
 *
 * Item y-offset math — BRITTLE, pinned here:
 *   The dropdown anchors off the segment's `rect.bottom + 4` (PositionButton.tsx:247),
 *   NOT off the wrapper bottom. The wrapper has `p-2` (8px), and items render with
 *   `minHeight: 40` (PositionButton.tsx:439). Net from wrapper.bottom to the center
 *   of row 1 ≈ -8px (subtract wrapper padding) + 4px (gap) + 20px (half of row 1)
 *   = +16px. Bump to +18 to nudge slightly inside the row so the cursor doesn't
 *   straddle the gap-1 between row 1 and row 2.
 *
 * If anyone changes wrapper padding or item minHeight, this offset must move with it.
 */
function computeViewportPos(bounds: DOMRect, stage: CursorStage): { x: number; y: number } {
  switch (stage) {
    case 'start':
      return { x: bounds.left + bounds.width * 0.88, y: bounds.top + bounds.height * -0.30 };
    case 'button':
      return { x: bounds.left + bounds.width * 0.76, y: bounds.top + bounds.height * 0.20 };
    case 'item':
      return { x: bounds.left + bounds.width * 0.76, y: bounds.bottom + 18 };
  }
}

export function IntensityPreviewPictogram({ onAnimationFinished }: IntensityPreviewPictogramProps) {
  const [userPosition, setUserPosition] = useState<PositionType | null>(null);
  const [openGroup, setOpenGroup] = useState<PositionButtonGroup | null>(null);
  const [cursorStage, setCursorStage] = useState<CursorStage>('start');
  const [isFingerCursor, setIsFingerCursor] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [opacity, setOpacity] = useState(1);
  // P852 Round-H rev4.5: floating confirmation pill above the Agree button after
  // the second press. The production short label "Agree−" is nearly invisible at
  // small sizes; the pill makes the demo's outcome unmissable.
  const [labelOpacity, setLabelOpacity] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const current = wrapperRef.current;
      if (current) setBounds(current.getBoundingClientRect());
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(wrapper);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', measure);
    };
  }, []);

  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Static final-state path: motion-sensitive users still see the lesson
      // (Slightly Agree selected) without waiting on the animation. Without
      // this synchronous set the user sees an empty button row and the
      // post-watch UI claims a state the visual doesn't show.
      setUserPosition('somewhat_agree');
      onAnimationFinished();
      return;
    }

    const timers = [
      // Cursor sits at start for 250ms — user catches "here is the cursor"
      setTimeout(() => setCursorStage('button'), 250),
      // Glide takes 650ms (CSS); arrived visually ~t=900. Morph at 950 leaves
      // ~50ms of "cursor at destination as arrow" before the finger pose appears.
      setTimeout(() => setIsFingerCursor(true), 950),
      // Finger pose held 350ms — clear "about to click" before press
      setTimeout(() => {
        setIsPressing(true);
        setUserPosition('agree');
        setOpenGroup('agree');
      }, 1300),
      // 250ms press window — at scale(0.7) with 130ms transform transition,
      // the cursor reaches full press by ~t=1430 and holds ~120ms before release
      setTimeout(() => setIsPressing(false), 1550),
      // Brief gap; morph finger → arrow; begin glide down to dropdown row 1
      setTimeout(() => {
        setIsFingerCursor(false);
        setCursorStage('item');
      }, 1700),
      // Glide down 650ms; arrived ~t=2350; sit ~50ms; morph to finger
      setTimeout(() => setIsFingerCursor(true), 2400),
      // Finger held 350ms before second press
      setTimeout(() => {
        setIsPressing(true);
        setUserPosition('somewhat_agree');
        setOpenGroup(null);
      }, 2750),
      setTimeout(() => setIsPressing(false), 3000),
      // Fade cursor (400ms opacity transition); final state visible
      setTimeout(() => setOpacity(0), 3400),
      // P852 Round-H rev4.5: confirmation pill fades in just after the second
      // press and fades out before the loop restarts; the pill paints above
      // the dropdown via the same z-[10000] portal as the cursor.
      setTimeout(() => setLabelOpacity(1), 2800),
      setTimeout(() => setLabelOpacity(0), 3400),
      setTimeout(onAnimationFinished, 3900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onAnimationFinished]);

  const CursorIcon = isFingerCursor ? Pointer : MousePointer2;
  const cursorPos = bounds ? computeViewportPos(bounds, cursorStage) : null;

  // P852 Round-H rev4.5: label anchors above the Agree segment (same x as the
  // cursor's button-stage anchor) ~40px above the top of the button row so it
  // floats clearly above the Agree segment without overlapping the title.
  const labelPos = bounds
    ? { x: bounds.left + bounds.width * 0.76, y: bounds.top + bounds.height * 0.20 - 40 }
    : null;

  return (
    <>
      <div
        ref={wrapperRef}
        className="relative pointer-events-none animate-in fade-in duration-200 motion-reduce:animate-none bg-[#0044CC]/[0.05] rounded-xl p-2"
        aria-hidden="true"
      >
        <PositionButtons
          userPosition={userPosition}
          counts={ZERO_COUNTS}
          onPositionClick={() => { /* demo — clicks blocked by pointer-events-none */ }}
          controlledOpenGroup={openGroup}
          size="lg"
        />
      </div>

      {/* Cursor portal'd to body at z-[10000] so it paints above the dropdown
         portal (z-[9999]). Without this the cursor goes under the dropdown
         on the way down to click an item, and the second press is invisible. */}
      {cursorPos && createPortal(
        <div
          className="fixed pointer-events-none z-[10000]"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            opacity,
            transformOrigin: 'top left',
            transform: isPressing ? 'scale(0.7)' : 'scale(1)',
            // Split transition: position glides leisurely (650ms) for visible
            // approach; transform snaps fast (130ms) so the click reads as
            // crisp rather than mushy; opacity fades 400ms.
            transition:
              'left 650ms ease-in-out, top 650ms ease-in-out, transform 130ms ease-out, opacity 400ms ease-in-out',
          }}
          aria-hidden="true"
        >
          <CursorIcon
            className="w-5 h-5 fill-[#0044CC] text-[#0044CC]"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
        </div>,
        document.body
      )}

      {/* P852 Round-H rev4.5: floating "Somewhat Agree" confirmation pill above
         the Agree segment. Same z-[10000] as the cursor so it paints above the
         dropdown's z-[9999]. Reduced-motion path keeps labelOpacity at 0 (no
         timer fires), so motion-sensitive users see only the static final
         state — title + subtitle + selected button carry the lesson. */}
      {labelPos && createPortal(
        <div
          className="fixed pointer-events-none z-[10000]"
          style={{
            left: labelPos.x,
            top: labelPos.y,
            transform: 'translateX(-50%)',
            opacity: labelOpacity,
            transition: 'opacity 400ms ease-in-out',
          }}
          aria-hidden="true"
        >
          <div className="bg-[#0044CC] text-white text-xs font-medium px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
            {POSITION_LABELS.somewhat_agree}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
