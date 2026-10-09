/**
 * P1449 — the profile's point card pieces (PointCardWithLinks, "quote pattern": a point someone
 * else holds a position on), with no product dependencies. Moved unchanged from
 * point-card-with-links.tsx, which renders them; the Day board renders the same pieces for a
 * reflection statement with "Agent on Slava". Never import product state here: the kanban boundary
 * test follows imports transitively.
 */
import type { ReactNode } from 'react';
import { Pin } from 'lucide-react';
import type { PositionType } from '@/app/types';
import { AgentByline } from '../agent-byline';
import { PositionBadge } from '../PositionBadge';

/**
 * The owner's row ABOVE the quoted point: Avatar + Name (AgentByline for an agent) + badges + the
 * owner's PositionBadge. In a list it is the card's top row, so the `⋯` (`menu`) joins it on the right.
 */
export function PointOwnerRow({
  inList,
  isAgent,
  name,
  position,
  avatar,
  badges,
  menu,
}: {
  inList: boolean;
  isAgent: boolean;
  name: string;
  position: PositionType;
  /** CP: GravatarAvatar at 20px */
  avatar: ReactNode;
  /** CP: EarBadge (people only) */
  badges?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <div
      className={`${inList ? 'flex items-center justify-between gap-2' : 'flex items-center gap-1.5'} mb-2 text-sm text-gray-700${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      {...(inList ? { 'data-testid': 'point-owner-row' } : {})}
    >
      <div className={inList ? 'flex min-w-0 items-center gap-1.5' : 'contents'}>
        {avatar}
        <span className={inList ? 'inline-flex min-w-0 items-center gap-1.5' : 'inline-flex items-center gap-1.5'}>
          {/* P1141 amendment: an agent account is named the same way on every surface;
              the raw stored `Agent · {Name}` used to leak through here. */}
          {isAgent ? (
            <AgentByline name={name} />
          ) : (
            <span className={inList ? 'min-w-0 truncate font-medium' : 'font-medium'}>{name}</span>
          )}
          {badges}
          <PositionBadge position={position} />
        </span>
      </div>
      {menu}
    </div>
  );
}

/** The quoted point: grey box, pin column, the statement, then whatever sits under it; `footer` inside the box. */
export function QuotedPointBox({ statement, children, footer }: { statement: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-gray-50 border border-border rounded-lg p-3">
      {/* Two-column layout matching StoryCard structure */}
      <div className="flex items-start gap-3">
        {/* Pin icon column - matches StoryCard avatar width */}
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
          <Pin className="w-4 h-4 rotate-45" />
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {statement}
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}
