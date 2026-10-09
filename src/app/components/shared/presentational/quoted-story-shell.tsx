/**
 * P1449 — the frame of a story quoted under a point (CP's `QuotedStory`, point-card-with-links.tsx)
 * with no product dependencies: the attribution row ABOVE the box (avatar + byline group, then the
 * author's stance on the point) and the box itself. QuotedStory supplies the identity lookup,
 * navigation, media, text and quotes; the Day board supplies "Agent on Slava" and its quotes.
 * Moved unchanged, comments included. Never import product state here: the kanban boundary test
 * follows imports transitively.
 */
import type { ReactNode } from 'react';
import type { PositionType } from '@/app/types';
import { PositionBadge } from '../PositionBadge';

export function QuotedStoryShell({
  isAgent,
  authorPosition,
  openViaDetails = false,
  onClick,
  header,
  children,
}: {
  isAgent: boolean;
  /** this author's stance on the point above; undefined or null renders no chip */
  authorPosition?: PositionType | null;
  /** P1424: the box is not a control (list cards; the Day board) */
  openViaDetails?: boolean;
  /** opens the story from the box (only when not `openViaDetails`) */
  onClick?: (e: React.MouseEvent) => void;
  /** the avatar + byline group; null renders no attribution row */
  header?: ReactNode;
  children?: ReactNode;
}) {
  return (
    /* P1270 §5 — THE BYLINE SITS ABOVE THE BOX, matching `QuotedPointCard`. */
    <div className="w-full text-left" data-testid="quoted-story">
      {/* Author info ABOVE the box.

          P1270 §6 — THE GATE IS `author || isAgent`, NOT `author`, AND THAT IS THE FIX.
          `getStoryAuthor` resolves against POSITION HOLDERS on the embed surface
          (`point-detail-page.tsx`), and returns undefined whenever a story's author holds no
          position on the point they filed it under. Nothing tied those two sets together, so
          this whole block disappeared — avatar, AGENT chip, name and stance at once — and
          `/point/:id?embed=true` shipped a machine-written reading of a real named person
          with NO indication a machine wrote it and no route to the disclosure.

          Gating on `isAgent` derives from `story.authorId` and needs no lookup, so the marker
          can no longer be lost to a failed join. A marker with no name is strictly better
          than no marker; the name is additive when the lookup succeeds (spec, ACCEPT). */}
      {header && (
        /* `flex-wrap` — P1270 §5, found by measuring at 320px, not by reading the code.
           The stance badge is `shrink-0`, so on a nested card (measured 179px wide at a 320px
           viewport) it took the width the NAME needed and the name truncated to "Connor L…".
           Confirmed by isolation rather than inference: hiding the badge in the live DOM took
           the name's available width from 78px back to the 95px it needs, un-truncating it.
           Pre-existing since P1259 put the badge here; §5 made it visible by putting this row
           under scrutiny, and made it slightly better by moving the row out of the box's
           padding.

           Wrapping is the documented preference, not a guess. `agent-byline.tsx` reached the
           same conclusion for the same reason one level down: "Two blind reviewers
           independently called that the worst thing on the page — WHOSE reading this is, is
           the one fact the byline exists to carry, and it was the only element being
           sacrificed." A card naming a real person who never consented is the last place to
           truncate that person's name to fit a badge. The badge drops to its own line
           instead; nothing is lost, and `truncate` stays the backstop for a name too long
           even for a full line. */
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          {/* AVATAR + BYLINE ARE ONE UNSPLITTABLE GROUP. The first attempt let the ROW wrap
              with the avatar as its own flex item, which fixed the truncation and produced a
              worse result: the avatar was orphaned alone on line 1 with the name on line 3 —
              the "orphan sibling" the visual-QA checklist names. Only the BADGE may wrap. */}
          <span className="flex items-center gap-2 min-w-0">{header}</span>
          {authorPosition && (
            <span data-testid="story-author-stance" className="inline-flex shrink-0">
              <PositionBadge position={authorPosition} />
            </span>
          )}
        </div>
      )}
      {/* THE BOX — content only, from here down. The click target, the border, the hover
          state and the focus ring all live on this element rather than on the outer
          container, so the attribution row above is not part of the control: clicking a
          name navigates to the profile, clicking the box navigates to the story, and the
          two no longer overlap. `QuotedPointCard` has always been shaped this way. */}
      {/* P1424: on a list card (`openViaDetails`) the box is NOT a control — no role, tab stop,
          handlers, pointer cursor or hover state — and its own `Details →` opens the story. */}
      <div
        {...(openViaDetails ? {} : {
        role: 'button',
        tabIndex: 0,
        onClick: (e: React.MouseEvent<HTMLDivElement>) => onClick?.(e),
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          // P1212's root guard, on this box too. P1296 folded the supporting quotes behind a
          // toggle BUTTON inside this box; without the target check, Enter on that toggle (or
          // on a timecode) was preventDefault()ed here and turned into a navigation, which
          // made the quotes unreachable by keyboard on every point card.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        },
        })}
        className={`${openViaDetails
          ? 'w-full text-left p-3 rounded-lg border border-border bg-gray-50'
          : 'group/quote w-full text-left p-3 rounded-lg border border-border bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'}${isAgent ? ' agent-card-drained' : ''}`}
        {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      >
      {children}
      </div>
    </div>
  );
}
