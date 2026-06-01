/**
 * @file intensity-preview-pictogram.tsx
 * @description P852 Round-H / P867: ~4.9s tutorial demo. Real PositionButtons in
 * controlled mode, puppeted by a brand-blue cursor that moves into the
 * Disagree button, morphs arrow → finger, and clicks it ONCE to select "Disagree"
 * (a click-ripple fires; no menu yet). It clicks the SAME button a SECOND time —
 * this is the click that opens the intensity menu (real P847 Model C′). Then the
 * cursor glides down onto the FIRST row (somewhat_disagree / Slightly Disagree)
 * and clicks a THIRD time to pick it; the Disagree button's visual state changes
 * to Slightly Disagree. The
 * pictogram then stays mounted in this final state — the parent
 * (IntensityTutorialModal) decides when to unmount.
 *
 * P867: switched the demo from the Agree (right) group to the Disagree (left)
 * group — disagreement is the higher-value intensity path to teach — and added
 * the click-ripple affordance so the "tap twice" beat reads as an obvious click.
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
 * Timeline (~4900ms total — P867 added a third click so the demo matches the
 * real 3-click Model C′ path. Cursor sits at start before moving;
 * longer glide window; finger-pose held longer before each press; press
 * itself snaps with a separate, shorter CSS transition (130ms transform
 * vs 650ms position) so each click reads as crisp, not mushy):
 *   t=0      cursor visible at start (above-left of Disagree), MousePointer2 (arrow)
 *   t=250    move begins → cursor glides 650ms toward Disagree
 *   t=950    arrived; morph arrow → Pointer (finger pose held for 350ms)
 *   t=1300   PRESS 1; userPosition='disagree' (selected, NO menu); ripple #1 (white)
 *   t=1550   release; t=1850 ripple #1 cleared
 *   t=2100   PRESS 2 (same button); openGroup='disagree' → intensity menu opens;
 *            ripple #2 (white)
 *   t=2350   release; t=2650 ripple #2 cleared
 *   t=2450   morph finger → arrow; glide 650ms down to dropdown row 1
 *   t=3150   arrived over somewhat_disagree (Slightly Disagree); morph → Pointer
 *   t=3500   PRESS 3; userPosition='somewhat_disagree', openGroup=null — label
 *            updates to "Slightly Disagree", menu closes; ripple #3 (blue)
 *   t=3750   release; t=4050 ripple #3 cleared
 *   t=3650   "Somewhat Disagree" pill fades in, centered above the row
 *   t=4200   cursor fades out (400ms)
 *   t=4600   pill fades out (held ~950ms so the outcome registers)
 *   t=4900   onAnimationFinished fires; pictogram stays mounted showing
 *            Somewhat Disagree selected, dropdown closed, cursor invisible.
 *            Parent (modal) bumps key → fresh pictogram remounts → loop.
 *
 * Reduced motion: synchronously set the final state (Slightly Disagree
 * selected) and fire onAnimationFinished immediately — motion-sensitive
 * users still see the post-watch lesson without waiting on the animation
 * (and never see a ripple — the pulse only fires on the animated path).
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
 * the cursor lands over the Disagree group (LEFT third of the button row, since
 * BUTTON_ORDER = ['disagree','unsure','agree']) and roughly the center of dropdown
 * row 1 (somewhat_disagree / Slightly Disagree — first entry of the disagree group's
 * ['somewhat_disagree','disagree','strongly_disagree']).
 *
 * P867: x-anchors are the mirror of P852's Agree-side values (0.88→0.12, 0.76→0.24,
 * i.e. reflected around the row center 0.5). The Agree-side 0.76/0.88 sat just inside
 * the right group, toward center; the mirror puts the cursor symmetrically just inside
 * the LEFT group, toward center — same visual relationship to the group, flipped side.
 *
 * Item y-offset math — BRITTLE, pinned here (UNCHANGED by P867 — only x mirrors):
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
      return { x: bounds.left + bounds.width * 0.12, y: bounds.top + bounds.height * -0.30 };
    case 'button':
      return { x: bounds.left + bounds.width * 0.24, y: bounds.top + bounds.height * 0.20 };
    case 'item':
      return { x: bounds.left + bounds.width * 0.24, y: bounds.bottom + 18 };
  }
}

export function IntensityPreviewPictogram({ onAnimationFinished }: IntensityPreviewPictogramProps) {
  const [userPosition, setUserPosition] = useState<PositionType | null>(null);
  const [openGroup, setOpenGroup] = useState<PositionButtonGroup | null>(null);
  const [cursorStage, setCursorStage] = useState<CursorStage>('start');
  const [isFingerCursor, setIsFingerCursor] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [opacity, setOpacity] = useState(1);
  // P852 Round-H rev4.5: floating confirmation pill above the pressed button after
  // the second press. The production short label is nearly invisible at small
  // sizes; the pill makes the demo's outcome unmissable.
  const [labelOpacity, setLabelOpacity] = useState(0);
  // P867: click-ripple. `pulse` holds the snapshot press location, a sequence key
  // (forces a fresh one-shot animate-ping remount per press), and a tone. Tone
  // flips per press so the ripple is never blue-on-blue: press 1 lands on the
  // selected (solid blue) button → 'light' (white ring); press 2 lands on the
  // white dropdown row → 'dark' (blue ring). null hides it. Driven only on the
  // animated path, so reduced-motion users never see a ripple.
  const [pulse, setPulse] = useState<{ x: number; y: number; key: number; tone: 'light' | 'dark' } | null>(null);

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
      // (Slightly Disagree selected) without waiting on the animation. Without
      // this synchronous set the user sees an empty button row and the
      // post-watch UI claims a state the visual doesn't show.
      setUserPosition('somewhat_disagree');
      onAnimationFinished();
      return;
    }

    // P867: snapshot the press location and bump a sequence key so the ripple
    // remounts (replays its one-shot animate-ping) on each press. Reads the live
    // wrapper rect at press time, so the ripple sits where the click lands even
    // though the cursor keeps gliding afterward. pulseSeq resets per effect run
    // (one run per loop iteration = two presses → keys 1, 2).
    let pulseSeq = 0;
    const firePulse = (stage: CursorStage) => {
      const w = wrapperRef.current;
      if (!w) return;
      const pos = computeViewportPos(w.getBoundingClientRect(), stage);
      pulseSeq += 1;
      setPulse({ x: pos.x, y: pos.y, key: pulseSeq, tone: stage === 'button' ? 'light' : 'dark' });
    };

    const timers = [
      // Cursor sits at start for 250ms — user catches "here is the cursor"
      setTimeout(() => setCursorStage('button'), 250),
      // Glide takes 650ms (CSS); arrived visually ~t=900. Morph at 950 leaves
      // ~50ms of "cursor at destination as arrow" before the finger pose appears.
      setTimeout(() => setIsFingerCursor(true), 950),
      // PRESS 1 (finger held ~350ms first) — click the unselected Disagree button:
      // it selects "Disagree" (default intensity). Per the real P847 Model C′, NO
      // menu opens on this first click.
      setTimeout(() => {
        setIsPressing(true);
        setUserPosition('disagree');
        firePulse('button'); // white ripple on the now-blue button
      }, 1300),
      setTimeout(() => setIsPressing(false), 1550),
      setTimeout(() => setPulse(null), 1850),
      // PRESS 2 — click the SAME (now-selected) button again. THIS is the click
      // that opens the intensity menu (Model C′: second click on a selected group).
      // The cursor hasn't moved — visually "click your position twice".
      setTimeout(() => {
        setIsPressing(true);
        setOpenGroup('disagree');
        firePulse('button');
      }, 2100),
      setTimeout(() => setIsPressing(false), 2350),
      setTimeout(() => setPulse(null), 2650),
      // Morph finger → arrow; glide down 650ms to dropdown row 1 (Slightly Disagree)
      setTimeout(() => {
        setIsFingerCursor(false);
        setCursorStage('item');
      }, 2450),
      setTimeout(() => setIsFingerCursor(true), 3150),
      // PRESS 3 — pick Slightly Disagree from the menu; menu closes.
      setTimeout(() => {
        setIsPressing(true);
        setUserPosition('somewhat_disagree');
        setOpenGroup(null);
        firePulse('item'); // blue ripple on the white row
      }, 3500),
      setTimeout(() => setIsPressing(false), 3750),
      setTimeout(() => setPulse(null), 4050),
      // P852 Round-H rev4.5 / P867: confirmation pill fades in just after the final
      // pick and HOLDS ~950ms so the outcome registers, then fades before the loop
      // restarts. Cursor fades a bit earlier so the pill stands alone at the end.
      setTimeout(() => setLabelOpacity(1), 3650),
      setTimeout(() => setOpacity(0), 4200),
      setTimeout(() => setLabelOpacity(0), 4600),
      setTimeout(onAnimationFinished, 4900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onAnimationFinished]);

  const CursorIcon = isFingerCursor ? Pointer : MousePointer2;
  const cursorPos = bounds ? computeViewportPos(bounds, cursorStage) : null;

  // P867: confirmation pill CENTERED above the button row — the picked outcome is
  // the key takeaway, so it sits dead-center, not tucked over the Disagree segment.
  // ~40px above the row top so it floats clear of the buttons and the title.
  const labelPos = bounds
    ? { x: bounds.left + bounds.width * 0.5, y: bounds.top + bounds.height * 0.20 - 58 }
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

      {/* P867: click-ripple — a one-shot expanding ring at the press location.
         Position is SNAPSHOT at press time (not live cursorPos) so it stays put
         while the cursor glides on. Tone flips per press so the ring is never
         blue-on-blue (white on the selected button, blue on the white dropdown
         row). Outer span holds the static centering translate; the inner span
         runs animate-ping (which overwrites `transform` with its own scale, so the
         two cannot share one element). Keyed by pulse.key → fresh remount replays
         the animation per press. Rendered before the cursor portal so the cursor
         paints on top; same z-[10000] body portal so it clears the dropdown. */}
      {pulse && createPortal(
        <div
          className="fixed pointer-events-none z-[10000]"
          style={{ left: pulse.x, top: pulse.y, width: 0, height: 0 }}
          aria-hidden="true"
        >
          <span
            key={pulse.key}
            className="absolute"
            style={{ left: 0, top: 0, transform: 'translate(-50%, -50%)' }}
          >
            <span
              className={`block w-7 h-7 rounded-full border-2 animate-ping ${
                pulse.tone === 'light'
                  ? 'bg-white/60 border-white'
                  : 'bg-[#0044CC]/25 border-[#0044CC]/70'
              }`}
            />
          </span>
        </div>,
        document.body
      )}

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
          {/* P867: white fill + blue outline + a stronger shadow so the cursor
             stays visible on the SELECTED blue button (presses 1 & 2, incl. the
             key "click again → menu opens" beat). A solid-blue cursor vanished
             blue-on-blue there. The blue stroke + shadow keep it defined on the
             white modal/dropdown too. */}
          <CursorIcon
            className="w-6 h-6 fill-white text-[#0044CC]"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}
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
          <div className="bg-[#0044CC] text-white text-sm font-semibold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
            {POSITION_LABELS.somewhat_disagree}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
