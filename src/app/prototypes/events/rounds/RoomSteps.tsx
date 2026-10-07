/**
 * @file RoomSteps.tsx
 * @description P1337 founder walkthrough 7 — the step bar at the top of the attendee's evening:
 * Ready · Principle · Table · Compare · Close. It replaces the status line ("Round 2 · Find table
 * 3 · You …") and the "Compare positions" button.
 *
 *   - Principle → Table → Compare repeats each round; the bar shows where you are in it now.
 *   - Steps behind you can be tapped, to look back; steps ahead cannot (they come with the moment).
 *   - Close stays greyed until the host ends the evening; then it is the current step and opens
 *     the closing sequence (P1389 — until that is built, a plain end screen). Inside Close,
 *     progress reads "2 of 8", never a second bar.
 */
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RoomStep = 'ready' | 'principle' | 'table' | 'compare' | 'close';

export const ROOM_STEPS: { key: RoomStep; label: string }[] = [
  { key: 'ready', label: 'Ready' },
  { key: 'principle', label: 'Principle' },
  { key: 'table', label: 'Table' },
  { key: 'compare', label: 'Compare' },
  { key: 'close', label: 'Close' },
];

const order = (step: RoomStep) => ROOM_STEPS.findIndex(s => s.key === step);

/**
 * Which steps a tap may open. Close is never a look-back: it is reached only when the evening
 * ends. Table and Compare belong to a running round — once the evening has closed there is no
 * table to go back to.
 */
export function canOpenStep(step: RoomStep, current: RoomStep): boolean {
  if (step === 'close') return current === 'close';
  if (current === 'close' && (step === 'table' || step === 'compare')) return false;
  return order(step) <= order(current);
}

export function RoomSteps({
  current,
  viewing,
  onSelect,
  className,
}: {
  /** Where the evening has the person now. */
  current: RoomStep;
  /** What the page shows — the current step, or one behind it they tapped back to. */
  viewing: RoomStep;
  onSelect: (step: RoomStep) => void;
  className?: string;
}) {
  // P1430 (founder walkthrough 9): done steps carry a check and a muted label, the step on screen
  // is bold with a thicker bar, steps ahead are grey. A step that cannot open says so (aria-disabled)
  // and looks it. At 360px and below only the shown step keeps its label; the rest are bars.
  return (
    <nav aria-label="Your evening" className={className} data-testid="room-steps" data-current={current}>
      <ol className="grid grid-cols-5 gap-1">
        {ROOM_STEPS.map(({ key, label }) => {
          const open = canOpenStep(key, current);
          const done = order(key) < order(current);
          const reached = order(key) <= order(current);
          const shown = key === viewing;
          return (
            <li key={key}>
              <button
                type="button"
                disabled={!open}
                aria-disabled={!open || undefined}
                onClick={() => onSelect(key)}
                aria-current={shown ? 'step' : undefined}
                aria-label={done && !shown ? `${label}, done` : undefined}
                data-testid={`room-step-${key}`}
                data-state={shown ? 'current' : done ? 'done' : reached ? 'reached' : 'ahead'}
                className={cn(
                  'flex min-h-11 w-full flex-col items-stretch justify-end gap-1 rounded-md px-0.5 pt-1 text-center disabled:cursor-not-allowed',
                  open && !shown && 'hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center gap-0.5 whitespace-nowrap text-[11px] tracking-tight min-[375px]:text-xs min-[375px]:tracking-normal leading-tight',
                    shown
                      ? 'font-semibold text-foreground'
                      : reached
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/50',
                    !shown && 'max-[360px]:sr-only',
                  )}
                >
                  {done && !shown && <Check className="h-3 w-3 shrink-0 text-blue-500" aria-hidden="true" />}
                  {label}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'rounded-full',
                    shown ? 'h-1.5 bg-blue-600' : reached ? 'h-1 bg-blue-300' : 'h-1 bg-muted',
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
