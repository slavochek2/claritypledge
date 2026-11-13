/**
 * @file RoundReturnBar.tsx
 * @description P1529: the bar a canvas opened from the table shows when the host ends a round or starts the next: one line, the countdown to the table and
 * "Stay here" (the owner with an open draft: the line, a link to the table and a Hide, no countdown). Blue like the preparation banner, a plain fade-in.
 * Screen readers hear the line once (the live region); the ticking number is aria-hidden. Wording is DRAFT: [FOUNDER DECISION: copy, proposed].
 */
import { useState } from 'react';
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
 * The announcements, each once. The live region is mounted (empty) with the page and only its text changes, so screen readers announce it; the bar itself carries no
 * live region and its countdown is aria-hidden (a ticking number would be read every second). The countdown's starting value is said once, inside the line; when the
 * person cancels the auto-return ("Stay here": the countdown goes away while the message stays) it says "Staying here." once. A new message is told apart by its line AND
 * its destination, so two moves with the same words are still two announcements.
 */
export function RoundReturnLive({ bar }: { bar: RoundReturnBarProps | null }) {
  const [said, setSaid] = useState<{ key: string; line: string; left: number | null; counting: boolean; cancelled: boolean } | null>(null);
  // Adjusting state while rendering (React's documented pattern): the first value seen for a message is the one announced.
  const key = bar ? `${bar.line}|${bar.to}` : '';
  const counting = !!bar && bar.left !== null;
  const fresh = bar ? { key, line: bar.line, left: bar.left, counting, cancelled: false } : null;
  if (!bar) { if (said) setSaid(null); }
  else if (said?.key !== key) setSaid(fresh);
  else if (counting && !said.counting) setSaid(fresh); // a new countdown for the same message (after "Stay here"): announced again
  else if (!counting && said.counting) setSaid({ ...said, counting: false, cancelled: true });
  const text = !bar || !said ? '' : said.cancelled ? 'Staying here.' : `${said.line} Back to your table${said.left !== null ? ` in ${said.left} seconds` : ''}.`;
  return <p className="sr-only" role="status" aria-live="polite" data-testid="round-return-live">{text}</p>;
}
