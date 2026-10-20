/**
 * @file point-owner-header.tsx
 * @description P1508 D5 — whose point this is, shown above it: the profile's rule, in one place.
 *
 * Moved out of point-card-with-links.tsx (the profile card) so the canvas's open point card
 * (FeedPointCard with `owner`) shows the owner exactly as the owner's profile does:
 *   - anyone else reading: the owner row (photo with the pledge ring, name — AgentByline for an
 *     agent — ear count for a person, position badge) ABOVE a quoted box holding the point;
 *   - the owner reading their own: the own-card header inside the card (PointHeader).
 * The profile shows the row only when the owner holds a position (`rowWithoutPosition` false);
 * the canvas shows it either way, with a muted "No position".
 */
import type { ReactNode } from 'react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { EarBadge } from '@/components/ui/ear-badge';
import { PointHeader } from '@/app/components/shared/PointHeader';
import { PointOwnerRow } from '@/app/components/shared/presentational/quoted-point-card';
import type { PositionType } from '@/app/types';

export interface PointOwner {
  id: string;
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  hasPledged?: boolean;
  ear?: number;
  position?: PositionType | null;
}

/** The owner row above the quoted point (someone else reading). */
export function PointOwnerQuoteRow({ owner, inList, isAgent, identityPending, showEar = true, menu }: {
  owner: PointOwner;
  inList: boolean;
  isAgent: boolean;
  identityPending: boolean;
  /** false while the caller is still reading the ear count */
  showEar?: boolean;
  menu?: ReactNode;
}) {
  return (
    <PointOwnerRow
      inList={inList}
      isAgent={isAgent}
      name={owner.name}
      position={owner.position}
      avatar={
        <GravatarAvatar
          name={owner.name}
          photoUrl={owner.avatarUrl}
          avatarColor={owner.avatarColor}
          size="sm"
          isPledger={owner.hasPledged ?? false}
          isAgent={isAgent}
          identityPending={identityPending}
          className="!w-5 !h-5 !text-[10px]"
        />
      }
      badges={showEar && !isAgent && !identityPending && <EarBadge count={owner.ear ?? 0} name={owner.name} size={14} />}
      menu={menu}
    />
  );
}

/**
 * The own-card header (the owner reading their own point). In a list the `⋯` joins it.
 * `showNoPosition` (the canvas): with no position the profile's header is empty; the canvas names
 * the owner with a muted "No position" instead, as its row for everyone else does.
 */
export function PointOwnHeader({ owner, inList, menu, showNoPosition = false }: {
  owner?: PointOwner;
  inList: boolean;
  menu?: ReactNode;
  showNoPosition?: boolean;
}) {
  if (showNoPosition && owner && !owner.position) {
    return (
      <div className="mb-2 flex items-center justify-between gap-2 text-xs" data-testid="point-owner-row">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-gray-600">{owner.name}</span>
          <span className="shrink-0 text-foreground/60" data-testid="point-owner-no-position">No position</span>
        </span>
        {menu}
      </div>
    );
  }
  return inList ? (
    <div className="mb-2 flex items-center justify-between gap-2" data-testid="point-owner-row">
      <div className="min-w-0">
        <PointHeader
          authorPosition={owner?.position ?? undefined}
          authorName={owner?.name}
          authorEarCount={owner?.ear}
          className="flex-wrap"
        />
      </div>
      {menu}
    </div>
  ) : (
    <div className="mb-2">
      <PointHeader
        authorPosition={owner?.position ?? undefined}
        authorName={owner?.name}
        authorEarCount={owner?.ear}
      />
    </div>
  );
}
