/**
 * @file page-header.tsx
 * @description P1512: the one page frame for every signed-in shell page (Feed, Groups, Events,
 * Letters, Partners, Settings, Session History).
 *
 * The shell removed the top nav, so a page used to start at whatever height, width and title style
 * it happened to carry. Now every one of them wears this frame:
 *
 *  - PageFrame: ONE left content edge (`px-4 lg:px-8`) and a width cap. In the shell it is
 *    left-aligned, never a centred column; outside it, it is the public nav's own container.
 *    `wide` is for grids and rail layouts, `reading` for single-column lists. The title row and
 *    the content sit inside the same frame, so the action is right-aligned to the content's own
 *    right edge.
 *  - PageHeader: the title row (`min-h-10`, 40px: the height of an action button). Inside the shell the
 *    56px top bar (app-shell/shell-top-bar.tsx: Back on the left, page actions on the right) sits
 *    above; PageFrame leaves a 32px (desktop) / 16px (phone) gap under it, then this row. The page's
 *    main action sits right-aligned on the same row, at the content's own right edge; tabs, search
 *    and filters go on the next row, `mb-4` below it.
 *
 * Signed-out visitors see the same pages under the public top nav; `<main>` already pads past it,
 * so the frame needs no extra inset there, and the frame matches the nav's container (see PageFrame).
 *
 * Back is not drawn here. A top-level destination has none; a detail view declares a FocusHeader,
 * which renders in the shell's top bar (or an in-flow step button passed as `leading`).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageFrameProps {
  /** `wide` for grids and rail layouts; `reading` caps a single column and keeps it left-aligned. */
  size?: 'wide' | 'reading';
  className?: string;
  children: ReactNode;
}

export function PageFrame({ size = 'wide', className, children }: PageFrameProps) {
  // Two homes, one left edge each. `[[data-shell-top-nav]_&]` matches when an ancestor carries the
  // attribute the layout sets only for the signed-in shell:
  //  - in the shell: left-aligned against the sidebar, capped at max-w-6xl / max-w-3xl;
  //  - outside it (signed-out under the public top nav): the nav's own container (centred, same
  //    max width, same px-4 lg:px-8), so the title's left edge equals the nav logo's at any width.
  const frame = cn(
    'container mx-auto px-4 pb-8 pt-6 lg:px-8',
    // In the shell the top bar sits above; this is the gap under it (32px desktop, 16px phone).
    '[[data-shell-top-nav]_&]:mx-0 [[data-shell-top-nav]_&]:pt-4 lg:[[data-shell-top-nav]_&]:pt-8',
    size === 'reading' ? '[[data-shell-top-nav]_&]:max-w-3xl' : '[[data-shell-top-nav]_&]:max-w-6xl',
    className,
  );
  return (
    <div data-page-frame={size} className={frame}>
      {/* The reading cap (704px of content) is the same in both homes. */}
      {size === 'reading' ? <div className="max-w-[44rem] [[data-shell-top-nav]_&]:max-w-none">{children}</div> : children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  /** The page's main action(s), right-aligned on the title row. Each must be >= 40px tall. */
  actions?: ReactNode;
  /** One line under the title row; the title row itself does not move for it. */
  description?: ReactNode;
  /** Before the title: a detail view's Back (FocusHeader compact or an in-flow step button). */
  leading?: ReactNode;
}

export function PageHeader({ title, actions, description, leading }: PageHeaderProps) {
  return (
    <header data-page-header className="mb-4 min-w-0">
      <div className="flex min-h-10 items-center gap-3">
        {leading}
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="-mt-1 max-w-prose text-base text-muted-foreground">{description}</p>}
    </header>
  );
}
