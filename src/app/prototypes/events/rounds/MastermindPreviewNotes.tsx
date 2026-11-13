/**
 * @file MastermindPreviewNotes.tsx
 * @description P1529 §4: under the seating preview, every rule the proposed tables break, named with people's names
 * (the plan's own list while the tables are the plan's; a fresh check of THIS round after the host swaps two names).
 * Later rounds are not re-checked after a swap, and the note says so. All words are drafts: [FOUNDER DECISION: copy].
 */
import { seatKeys } from '@/app/data/event-rounds-service';
import type { Seat } from '@/lib/round-grouping';
import type { MastermindHost } from './use-mastermind-host';
import { PLAN_OK_LINE, PREVIOUS_UNREAD, SWAP_RECHECK_NOTE, describeProblem, optedOutLine, optedOutSeated } from './mastermind-host-helpers';

export function MastermindPreviewNotes({ roundNo, seats, ids, shuffle, host, name, firstName, optedOut }: {
  roundNo: number;
  seats: Seat[];
  /** The people the tables were proposed for. */
  ids: string[];
  shuffle: number;
  host: MastermindHost;
  name: (memberId: string) => string;
  /** First names, for the opt-out line ("Kira opted out of the principle."). */
  firstName: (memberId: string) => string;
  /** Whether this person opted out of the principle (H1: a warning, never a seating rule). */
  optedOut: (memberId: string) => boolean;
}) {
  const plan = host.plan(roundNo, ids, shuffle);
  const swapped = seatKeys(plan.seats).join() !== seatKeys(seats).join();
  const problems = swapped ? host.check(seats, roundNo, ids) : plan.unmet;
  const optLine = optedOutLine(optedOutSeated(seats, optedOut).map(firstName));
  return (
    <div className="mt-3 text-sm" data-testid="mm-preview-notes" data-swapped={swapped ? 'true' : undefined}>
      {host.previousFailed && <p role="status" className="mb-2 text-muted-foreground" data-testid="mm-previous-unread">{PREVIOUS_UNREAD}</p>}
      {problems.length === 0 && !host.previousFailed ? (
        <p className="text-green-700" data-testid="mm-preview-ok">{PLAN_OK_LINE}</p>
      ) : problems.length === 0 ? null : (
        <ul className="space-y-1" aria-label="Rules this seating breaks">
          {problems.map((p, i) => (
            <li key={i} className="flex gap-2" data-testid="mm-unmet" data-rule={p.rule}>
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <span>{describeProblem(p, name)}</span>
            </li>
          ))}
        </ul>
      )}
      {optLine && <p role="status" className="mt-2 text-muted-foreground" data-testid="mm-opted-out-warning">{optLine}</p>}
      {swapped && <p className="mt-2 text-xs text-muted-foreground" data-testid="mm-swap-note">{SWAP_RECHECK_NOTE}</p>}
    </div>
  );
}
