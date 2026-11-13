/**
 * @file RoundReturnBar.tsx
 * @description P1529: the bar a canvas opened from the table shows when the host ends a round or starts the next: one line, the countdown to the table and
 * "Stay here" (the owner with an open draft: the line, a link to the table and a Hide, no countdown). Blue like the preparation banner, a plain fade-in.
 * Screen readers hear the line once (the live region); the ticking number is aria-hidden. Wording is DRAFT: [FOUNDER DECISION: copy, proposed].
 */
import { Link } from 'react-router-dom';
import type { RoundReturnBarProps } from './use-table-canvas';

export function RoundReturnBar({ line, left, to, onStay }: RoundReturnBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-900 animate-in fade-in duration-300 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100" data-testid="round-return-bar">
      {/* [FOUNDER DECISION: copy, proposed] */}
      <span data-testid="round-return-line">
        <span>{line}</span>
        {left !== null && <span aria-hidden data-testid="round-return-count">{` Back to your table in ${left}`}</span>}
      </span>
      {/* The way back is offered throughout: during the countdown and after it. */}
      <Link to={to} replace className="min-h-11 content-center underline" data-testid="round-return-link">Back to your table</Link>
      {left === null
        ? <button type="button" onClick={onStay} aria-label="Hide" className="ml-auto flex h-11 w-11 items-center justify-center rounded-full hover:bg-blue-100 dark:hover:bg-blue-900" data-testid="round-return-hide">×</button>
        : <button type="button" onClick={onStay} className="min-h-11 underline" data-testid="round-return-stay">Stay here</button>}
    </div>
  );
}

/**
 * The announcement, once. The live region is mounted (empty) with the page and only its text changes when the host moves the rounds, so screen readers announce it;
 * the bar itself carries no live region and its countdown is aria-hidden.
 */
export function RoundReturnLive({ bar }: { bar: RoundReturnBarProps | null }) {
  return <p className="sr-only" role="status" aria-live="polite" data-testid="round-return-live">{bar ? `${bar.line} Back to your table.` : ''}</p>;
}
