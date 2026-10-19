/**
 * P1445 D — the point card's frame, with no product dependencies: the card, its pin, the statement
 * row (with an optional top-right control), whatever sits under the statement, and an optional
 * footer. FeedPointCard renders its content into it; the Day board renders a reflection statement
 * into the same frame. Product behaviour (positions, auth, navigation) stays with the caller.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { Pin } from 'lucide-react';

interface PointCardShellProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** the statement row's text node (the caller owns linkify, clamping, icons) */
  statement: ReactNode;
  /** top-right of the statement row (CP: the `⋯` menu) */
  corner?: ReactNode;
  /** under the statement, in the statement column (tags, position buttons, hints) */
  children?: ReactNode;
  /** the full-width row under the card body */
  footer?: ReactNode;
  /** P1508: the tighter frame of the compact card a Clarity Canvas box shows. Default false. */
  compact?: boolean;
}

export function PointCardShell({ statement, corner, children, footer, compact = false, className = '', ...rest }: PointCardShellProps) {
  return (
    <article className={`bg-card rounded-lg shadow-sm border-l-4 border-l-slate-300 border border-border ${className}`.trim()} {...rest}>
      <div className={compact ? 'p-3' : 'p-4'}>
        <div className={`flex items-start ${compact ? 'gap-2' : 'gap-3'}`}>
          {/* Pin icon */}
          <div className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600`}>
            <Pin className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} rotate-45`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {statement}
              {corner}
            </div>
            {children}
          </div>
        </div>
      </div>
      {footer}
    </article>
  );
}
