/**
 * @file intensity-preview-pictogram.tsx
 * @description P852 Round-E: inline "show, don't tell" preview of the tap-again-to-refine
 * intensity mechanic. Renders once per user lifetime (gated by `useIntensityPreviewSeen`)
 * BETWEEN the framing question and the PositionButtons on the engage phases.
 *
 * Why an inline pictogram and not a phantom popover overlay:
 *   The real intensity menu is portal-rendered with coordinates computed from
 *   `getBoundingClientRect()` at click time (see `PositionButton.tsx:381`). A sibling
 *   overlay cannot replicate that position without measuring the same segment ref,
 *   which would require threading state into PositionButtons. The pictogram is
 *   positionally honest — it lives in its own row, mimics a button + its expansion,
 *   and never claims to occupy the real popover's position.
 *
 * Animation timeline (~2.4s total):
 *   t=0      strip fades in (`animate-in fade-in slide-in-from-bottom`)
 *   t=600ms  expanded options appear under the sample button (opacity transition)
 *   t=1700ms expanded options fade out
 *   t=2200ms `onComplete` fires — parent unmounts the pictogram
 */
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface IntensityPreviewPictogramProps {
  /** Called when the pictogram's animation lifecycle completes. Parent uses this
   * signal to mark the preview as seen (localStorage) AND to unmount the component. */
  onComplete: () => void;
}

export function IntensityPreviewPictogram({ onComplete }: IntensityPreviewPictogramProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setMenuVisible(true), 600);
    const hideTimer = setTimeout(() => setMenuVisible(false), 1700);
    const doneTimer = setTimeout(onComplete, 2200);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className="flex flex-col items-center gap-1.5 py-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
      aria-hidden="true"
    >
      <p className="text-[11px] uppercase tracking-wide text-[#1A1A1A]/40 leading-none">
        Tap a position, tap again to refine
      </p>
      <div className="relative">
        {/* Sample button — mimics the real PositionButton shape (rounded, label + chevron) */}
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#1A1A1A]/15 bg-white text-[11px] text-[#1A1A1A]/55 leading-none">
          Agree
          <ChevronDown className="w-2.5 h-2.5 opacity-60" aria-hidden="true" />
        </span>

        {/* Expanded options — appear after first tap, fade out before the strip unmounts */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 top-full mt-1 flex flex-col gap-0.5 transition-opacity duration-300 ${
            menuVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {['Somewhat agree', 'Agree', 'Strongly agree'].map((label) => (
            <span
              key={label}
              className="px-1.5 py-0.5 rounded bg-[#1A1A1A]/5 text-[10px] text-[#1A1A1A]/50 whitespace-nowrap leading-tight"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
