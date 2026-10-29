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

/** Round 7b: ONE tick for every done step (Learn included): the same blue and the same stroke everywhere. */
const TICK_CLASS = 'h-3 w-3 shrink-0 text-blue-600';
const TICK_STROKE = 3;

export const ROOM_STEPS: { key: RoomStep; label: string }[] = [
  { key: 'ready', label: 'Ready' },
  { key: 'principle', label: 'Principle' },
  { key: 'table', label: 'Table' },
  { key: 'compare', label: 'Compare' },
  // P1542 UAT / P1548 (founder): the step's name is "Feedback" for every event; the key stays 'close'.
  { key: 'close', label: 'Feedback' },
];

const order = (step: RoomStep) => ROOM_STEPS.findIndex(s => s.key === step);

/**
 * Which steps a tap may open. Close is never a look-back: it is reached only when the evening
 * ends. Table and Compare belong to a running round — once the evening has closed there is no
 * table to go back to, and no readiness to prepare.
 */
export function canOpenStep(step: RoomStep, current: RoomStep): boolean {
  if (step === 'close') return current === 'close';
  // P1542 review: nor readiness — the evening is over (frozen, or the host ended it), as the room's Back says.
  if (current === 'close' && (step === 'ready' || step === 'table' || step === 'compare')) return false;
  return order(step) <= order(current);
}

export function RoomSteps({
  current,
  viewing,
  onSelect,
  className,
  hidden = [],
  labels,
  learn,
  done: doneOverride,
}: {
  /** Where the evening has the person now. */
  current: RoomStep;
  /** What the page shows — the current step, or one behind it they tapped back to. null = the Learn step is shown. */
  viewing: RoomStep | null;
  onSelect: (step: RoomStep) => void;
  className?: string;
  /** P1542: steps this series' room does not have (a hike has no Ready, Table or Compare). */
  hidden?: RoomStep[];
  /** P1542 (founder 2026-10-23): a series' own words for a step (a hike's "Opt in", "Give feedback"). */
  labels?: Partial<Record<RoomStep, string>>;
  /** P1542: an optional "Learn" step before the rest. Always open; it leaves the room for the learning flow,
   *  and carries a check once the learning is complete. */
  learn?: {
    done: boolean;
    onOpen: () => void;
    /** P1542 round 5: the learning is on screen, inside the room. */
    active?: boolean;
    /** Founder 2026-10-26: a series' own name for the step (a hike's "Learn the principle"), shown whole with no
     *  "(optional)" suffix. Absent = the shared "Learn (optional)". */
    label?: string;
  };
  /** P1542 round 6: what this person actually did, per step, instead of "every step before the current one".
   *  A hike ticks Opt in only once it was answered and Give feedback once it is finished. A step given here carries
   *  its tick even while it is the one on screen (the tick means "done", not "behind you"). */
  done?: Partial<Record<RoomStep, boolean>>;
}) {
  // P1430 (founder walkthrough 9): done steps carry a check and a muted label, the step on screen
  // is bold with a thicker bar, steps ahead are grey. A step that cannot open says so (aria-disabled)
  // and looks it. At 360px and below only the shown step keeps its label; the rest are bars.
  return (
    <nav aria-label="Your evening" className={className} data-testid="room-steps" data-current={current}>
      <ol className={cn('grid gap-1', labels && 'border-b border-border')} style={{ gridTemplateColumns: `repeat(${ROOM_STEPS.length - hidden.length + (learn ? 1 : 0)}, minmax(0, 1fr))` }}>
        {learn && (
          <li key="learn">
            <button
              type="button"
              onClick={learn.onOpen}
              aria-current={learn.active ? 'step' : undefined}
              aria-label={learn.done ? `${learn.label ?? 'Learn'}, done` : undefined}
              data-testid="room-step-learn"
              data-state={learn.active ? 'current' : learn.done ? 'done' : 'reached'}
              // Round 6b: labels sit at the TOP of every step and the bars at the bottom (justify-between), so a label
              // that takes two lines at 320 never puts its siblings' labels at a different height.
              className={cn('flex h-full min-h-11 w-full flex-col items-stretch justify-between gap-1 rounded-md px-0.5 pt-1 text-center', !learn.active && 'hover:bg-muted')}
            >
              <span className="flex flex-col items-center leading-tight" data-testid="room-step-learn-label">
                <span className={cn(
                  'inline-flex items-center justify-center gap-0.5 whitespace-nowrap text-[11px] tracking-tight min-[430px]:text-xs min-[430px]:tracking-normal',
                  // Visual review round 5 (I): below 360px "(optional)" goes on a second line under "Learn".
                  'max-[359px]:flex-col max-[359px]:gap-0 max-[359px]:tracking-tighter',
                  // Round 6e: one colour per state. Learn is always open (reached), so it reads dark like any reached step;
                  // the step on screen is bold dark.
                  learn.active ? 'font-semibold text-foreground' : 'text-foreground',
                )} data-testid="room-step-learn-text">
                  {/* Round 6b: the same label on every room view — "Learn (optional)" — with the tick added once learned. */}
                  <span className={cn('inline-flex items-center gap-0.5 max-[359px]:gap-px', learn.label && 'whitespace-normal text-balance')}>
                    {learn.done && <Check className={cn(TICK_CLASS, 'max-[359px]:h-2.5 max-[359px]:w-2.5')} strokeWidth={TICK_STROKE} aria-hidden="true" data-testid="room-step-learn-check" />}
                    {learn.label ?? 'Learn'}
                  </span>
                  {/* Round 6e/7b: "(optional)" is the muted grey at full strength (4.8:1) at EVERY width; below 360px it is
                      also smaller, on its own line. A series that names the step (learn.label) has no suffix at all. */}
                  {!learn.label && <>{' '}<span className="text-muted-foreground max-[359px]:text-[10px]" data-testid="room-step-learn-optional">(optional)</span></>}
                </span>
              </span>
              {/* P1542 founder (B, 2026-10-29): plain tabs — only the shown one is underlined; the feedback's own
                  "Step N of M" bar is the only progress bar. (A short bar only: Learn exists only there.) */}
              <span aria-hidden="true" className={cn('h-0.5 rounded-full', learn.active ? 'bg-blue-600' : 'bg-transparent')} />
            </button>
          </li>
        )}
        {ROOM_STEPS.filter(({ key }) => !hidden.includes(key)).map(({ key, label: shared }) => {
          const label = labels?.[key] ?? shared;
          const open = canOpenStep(key, current);
          const explicit = doneOverride?.[key];
          const done = explicit ?? order(key) < order(current);
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
                aria-label={done && (!shown || explicit !== undefined) ? `${label}, done` : undefined}
                data-testid={`room-step-${key}`}
                data-state={shown ? 'current' : done ? 'done' : reached ? 'reached' : 'ahead'}
                className={cn(
                  'flex h-full min-h-11 w-full flex-col items-stretch gap-1 rounded-md px-0.5 pt-1 text-center disabled:cursor-not-allowed',
                  // Round 6b: on the short bar (a hike's) labels align at the top, bars at the bottom; the five-step bar
                  // keeps its bottom-aligned labels unchanged.
                  labels ? 'justify-between' : 'justify-end',
                  open && !shown && 'hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center gap-0.5 whitespace-nowrap text-[11px] tracking-tight min-[430px]:text-xs min-[430px]:tracking-normal leading-tight',
                    // Round 6d (Opus F3): a step ahead uses the full muted colour (#71717a, 4.8:1 on white) — at /50 it
                    // read 2.5:1. "Ahead" is still told apart by its grey bar and disabled state; current is bold dark,
                    // done carries its tick. Applies to every bar (Clarity Night's ahead labels darken too).
                    // Round 6e (short bar, a hike's): one colour per state — on screen = bold dark; reached or done (a skipped
                    // Opt in included) = dark; ahead = the muted grey. The tick is what tells done from reached. The
                    // five-step bar (Clarity Night) keeps its colours: muted for everything not on screen.
                    shown ? 'font-semibold text-foreground' : labels && reached ? 'text-foreground' : 'text-muted-foreground',
                    // Round 6e: at 320 a tick + "Give feedback" fits its cell — a hairline gap and tighter tracking.
                    labels && 'max-[359px]:gap-px max-[359px]:tracking-tighter',
                    // A short bar (a hike's three verbs) keeps every label at 320px; the five-step bar drops them.
                    !shown && !labels && 'max-[360px]:sr-only',
                  )}
                  data-testid={`room-step-${key}-text`}
                >
                  {/* A short bar (labels) has room for the check at every width (VQA round 4: 375 showed none); the
                      five-step bar still drops it below 430px. */}
                  {done && (!shown || explicit !== undefined) && <Check className={cn(TICK_CLASS, labels && 'max-[359px]:h-2.5 max-[359px]:w-2.5', !labels && 'hidden min-[430px]:block')} strokeWidth={TICK_STROKE} aria-hidden="true" data-testid={`room-step-${key}-check`} />}
                  {label}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'rounded-full',
                    // P1542 founder (B, 2026-10-29): the short bar (a hike's) is plain tabs — a thin underline under the
                    // shown tab only, nothing under the others (done keeps its tick). The five-step bar (Clarity Night)
                    // keeps its bars: below 360px it shows them instead of labels.
                    labels
                      ? cn('h-0.5', shown ? 'bg-blue-600' : 'bg-transparent')
                      : shown ? 'h-1.5 bg-blue-600' : done || reached ? 'h-1 bg-blue-300' : 'h-1 bg-muted',
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
