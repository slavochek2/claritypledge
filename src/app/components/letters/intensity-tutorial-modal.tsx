/**
 * @file intensity-tutorial-modal.tsx
 * @description P852 Round-H rev2: hard-mandatory first-time tutorial that
 * teaches the "tap twice to adjust intensity" mechanic via the real
 * PositionButtons pictogram playing on continuous loop. Modeled on
 * TermsUpdateDialog's `dismissible={false}` pattern
 * (src/app/components/live-meeting/terms-update-dialog.tsx) — ESC + backdrop
 * blocked, no close X. Continue is the only exit.
 *
 * Framed as a "Quick tip" — Lightbulb badge + uppercase kicker above the
 * title — so the modal reads as contextual help rather than a compliance gate.
 *
 * No Show me / Show again button surface — the demo plays from the moment
 * the modal opens and loops continuously by remounting the pictogram on each
 * `onAnimationFinished`. The user can read + watch as long as they want,
 * then click Continue when they're ready.
 *
 * Reuse path: after first-time dismissal, the engage phase shows a small
 * "?" affordance below the position buttons (after first selection) that
 * sets parent state to reopen this modal. Replay shares the same surface;
 * just `open` toggles. Per-open loop counter resets on each open.
 *
 * Why an always-mounted modal: H3 places this as a sibling to all letter
 * phases, so it stays mounted across `point-engage → remaining-point-engage`
 * transitions. Only the `open` prop toggles based on first-visit gating /
 * "?" reopen in the parent.
 *
 * Analytics events:
 *   - intensity_tutorial_shown      — fires on open=false → true transition
 *   - intensity_tutorial_dismissed  — fires on Continue (with loop_count)
 *
 * Accessibility: Continue is always enabled — no disabled-during-playback
 * state means Radix focus-trap naturally lands focus on Continue at open.
 * Reduced-motion users get the static final state without the loop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IntensityPreviewPictogram } from './intensity-preview-pictogram';
import { analytics } from '@/lib/mixpanel';

interface IntensityTutorialModalProps {
  open: boolean;
  /** Continue clicked — parent closes modal AND marks the one-time gate as seen
   * (idempotent — safe to call on every dismissal including replays). */
  onProceed: () => void;
}

export function IntensityTutorialModal({ open, onProceed }: IntensityTutorialModalProps) {
  // Doubles as the pictogram's React `key` — bumping it forces a clean
  // unmount/remount so the next iteration starts from a fresh state with
  // no leaked timers or transition mid-states.
  const [loopKey, setLoopKey] = useState(0);
  const prefersReducedMotionRef = useRef(false);

  // Track motion preference via ref so the loop callback can read it
  // without depending on a state value (and triggering identity churn that
  // would re-fire the pictogram's effect mid-animation).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mql.matches;
    const handler = () => {
      prefersReducedMotionRef.current = mql.matches;
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Loop the demo by remounting the pictogram on each animation cycle.
  // Reduced motion: skip the loop — pictogram already short-circuits to
  // final state synchronously, so looping would cause an infinite render storm.
  const handleAnimationFinished = useCallback(() => {
    if (prefersReducedMotionRef.current) return;
    setLoopKey((k) => k + 1);
  }, []);

  const handleProceed = useCallback(() => {
    analytics.track('intensity_tutorial_dismissed', { loop_count: loopKey });
    onProceed();
  }, [onProceed, loopKey]);

  // Open-transition guard: fires once each time the modal goes closed → open.
  // Cannot use a mount-time effect because H3 places the modal always-mounted.
  // Also resets the loop counter so replays start fresh from iteration 0.
  useEffect(() => {
    if (open) {
      analytics.track('intensity_tutorial_shown', {});
      setLoopKey(0);
    }
  }, [open]);

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md"
      >
        {/* P852: "Quick tip" as a tab straddling the top edge so it reads as a
           frame label, not the first line of the message. top-0 + -translate-y-1/2
           centers the pill on the border. Tinted (not solid) blue signals "label"
           rather than an actionable blue CTA — keeps it distinct from "Continue". */}
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#0044CC] shadow-sm">
          <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
          Quick tip
        </span>
        <DialogHeader className="items-center text-center sm:items-center pt-1.5">
          {/* P867: single directive line (no separate subtitle) — the looping demo
             below shows the gesture. "Double-click" is accurate here: the first two
             clicks land on the SAME position button (click selects it, click again
             opens the intensity menu), then you pick a level from the menu. Centered
             alignment overrides DialogHeader's default left/start. */}
          <DialogTitle className="text-3xl font-bold text-center leading-tight">
            Double-click to pick &ldquo;somewhat disagree&rdquo;
          </DialogTitle>
          {/* sr-only description satisfies Radix aria-describedby a11y wiring
              without showing redundant prose to sighted users. */}
          <DialogDescription className="sr-only">
            Looping tutorial showing how a position button reveals three intensity
            levels on a second tap.
          </DialogDescription>
        </DialogHeader>

        {/* P852 Round-H rev4.3: pictogram slot reserves real dropdown clearance.
           Measured: Agree segment min-h-14 (PositionButton.tsx:353) + 4px gap
           (PositionButton.tsx:248) + 3 rows × minHeight 40 (PositionButton.tsx:439)
           + 8px py-1 wrapper padding ≈ 196px below the segment top. items-start +
           pt-8 keeps the demo near the top so the dropdown extends DOWN into the
           240px slot without bleeding into Continue. With items-center, half the slot
           sat above the button and the dropdown spilled past the bottom edge. */}
        <div className="min-h-[240px] flex items-start justify-center pt-8">
          {/* Mount only while open — avoids running timers when modal is hidden. */}
          {open && (
            <IntensityPreviewPictogram
              key={loopKey}
              onAnimationFinished={handleAnimationFinished}
            />
          )}
        </div>

        <div className="flex justify-center mt-6">
          <Button
            onClick={handleProceed}
            className="bg-[#0044CC] hover:bg-[#0033AA] text-white rounded-full px-12 h-12 text-base font-bold min-w-[220px]"
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
