/**
 * @file quoted-point-card.tsx
 * @description P1212 §5 — one point, rendered inside a story card.
 *
 * EXTRACTED FROM `profile-page-v2.tsx` (2026-09-04), unchanged in behaviour.
 *
 * WHY THE MOVE. This was a module-private function inside the profile page, so the feed
 * could not render it and rendered bare `<button>` text lines instead: the same relation,
 * a card on one surface and loose text on another. That is the identical failure §4 fixed
 * for `StoryMedia`, whose own diagnosis reads "the profile page uses its own private
 * `StoryCardFull` ... and never imports `StoryMedia`". A private component IS the drift
 * mechanism this spec exists to close, so §5's fix is extraction, not re-implementation.
 *
 * `data-testid="quoted-point-card"` is the parity handle: a test can assert that every
 * surface expanding a story's points renders THROUGH this component. A test that merely
 * finds the statement text on screen cannot — the bare-button version passed exactly that.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Ear } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { TagPills } from '@/app/components/shared/tag-pills';
import { PositionButtons, PositionBadge } from '@/app/components/shared';
import { linkifyText } from '@/app/utils/linkify';
import { stripHashtags } from '@/lib/utils';
import { adjustPositionCounts, toSevenPointCounts } from '@/app/utils/position-helpers';
import type { PositionType, PointSummary } from '@/app/types';
import type { Position } from '@/app/components/shared/prototype-types';

/** Mirrors the route helper the profile page defines locally. */
const detailRoutes = {
  point: (id: string, profileId?: string) => (profileId ? `/point/${id}?from=${profileId}` : `/point/${id}`),
};

export interface QuotedPointCardProps {
  point: PointSummary;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorAvatarColor?: string;
  authorEarCount?: number;
  authorHasPledged: boolean;
  /**
   * Profile whose page the reader is ON, appended as `?from=` so the point page can offer
   * a way back. **Omit it on surfaces the reader did not reach through a profile** — the
   * feed is one. Passing the story's author here would send a feed reader "back" to a page
   * they were never on. This is the ONE behavioural difference between the two callers,
   * and it is a difference in the READER's route, not in the rendering.
   */
  fromProfileId?: string;
  currentUserId?: string;
  onPositionSelect?: (position: Position) => void;
}

export function QuotedPointCard({
  point,
  authorId,
  authorName,
  authorAvatarUrl,
  authorAvatarColor,
  authorEarCount,
  authorHasPledged,
  fromProfileId,
  currentUserId,
  onPositionSelect,
}: QuotedPointCardProps) {
  const { isAgentAccountId: isAgentQuoted, isLoading: quotedIdentityPending } = useAgentAccountIds();
  const quotedIsAgent = isAgentQuoted(authorId);
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    (point.userPosition as Position) ?? null
  );

  // Sync userPosition from prop when it changes (e.g. profile effect reruns after auth resolves)
  useEffect(() => {
    setUserPosition((point.userPosition as Position) ?? null);
  }, [point.userPosition]);

  const baseCounts = useMemo(
    () => toSevenPointCounts(point.positionCounts),
    [point.positionCounts],
  );

  // DB counts already include the user's own position.
  // Only adjust optimistically when position changes from the server-known value.
  const initialPosition = (point.userPosition as PositionType | null) ?? null;
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, initialPosition, userPosition as PositionType | null),
    [baseCounts, initialPosition, userPosition],
  );

  const handlePositionClick = (position: Position) => {
    const newPosition = userPosition === position ? null : position;
    // Only optimistically update for selection; removal waits for dialog confirm
    if (newPosition !== null) {
      setUserPosition(newPosition);
    }
    onPositionSelect?.(newPosition);
  };

  return (
    <div className="w-full text-left" data-testid="quoted-point-card">
      {/* Author's position badge - shown above quoted box when available */}
      {point.profileSubjectPosition && (
        <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
          <GravatarAvatar
            name={authorName}
            photoUrl={authorAvatarUrl}
            avatarColor={authorAvatarColor}
            size="sm"
            isPledger={authorHasPledged}
            isAgent={quotedIsAgent}
            identityPending={quotedIdentityPending}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className={`inline-flex items-center gap-1.5${quotedIsAgent ? ' agent-drained-chrome' : ''}`}>
          {/* P1141 amendment: an agent account is named the same way on every surface;
              the raw stored `Agent · {Name}` used to leak through here. */}
          {quotedIsAgent ? (
            <AgentByline name={authorName} />
          ) : (
            <span className="font-medium">{authorName}</span>
          )}
          {!quotedIsAgent && !quotedIdentityPending && authorEarCount !== undefined && authorEarCount > 0 && (
            <span data-testid="ear-badge" className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
              <Ear size={14} />
              {authorEarCount}
            </span>
          )}
          <PositionBadge position={point.profileSubjectPosition as PositionType} />
          </span>
        </div>
      )}

      {/* Quoted Point box — changed from <button> to div[role=button] to fix nested button HTML violation */}
      <div
        role="button"
        tabIndex={0}
        // `stopPropagation` on BOTH handlers, and it is this component's job rather than the
        // caller's. Every surface that expands a story's points wraps them in a card that is
        // itself a control, so an event that reaches the wrapper navigates a second time and
        // the LAST navigation wins — the reader asks for the point and lands on the story.
        //
        // The click path was already safe by accident: both call sites wrap the list in a
        // container with `onClick={e => e.stopPropagation()}`. That container does not handle
        // `onKeyDown`, so keyboard users navigated somewhere mouse users did not, and a test
        // written with `fireEvent.click` is structurally incapable of seeing it. Found by
        // adversarial review 2026-09-04; a container-level fix would have to be repeated at
        // every future call site, so it belongs here.
        onClick={(e) => {
          e.stopPropagation();
          navigate(detailRoutes.point(point.id, fromProfileId));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            navigate(detailRoutes.point(point.id, fromProfileId));
          }
        }}
        className="group/quote w-full text-left p-3 rounded-lg border border-border bg-muted hover:bg-muted/80 hover:border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* Two-column layout */}
        <div className="flex items-start gap-3">
          {/* Pin icon column */}
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
            <Pin size={16} className="rotate-45" />
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground break-words"><InlineVisibilityIcon visibility={point.visibility} />{' '}{linkifyText(stripHashtags(point.statement, point.tags))}</p>

            {/* P503: Tag pills */}
            {((point.tags?.length ?? 0) > 0 || (point.systemTags?.length ?? 0) > 0) && (
              <TagPills tags={point.tags} systemTags={point.systemTags} context="profile" className="mt-1.5" />
            )}

            {/* Position buttons - show for authenticated users */}
            {currentUserId && (
              <div role="presentation" className="mt-2" onClick={(e) => e.stopPropagation()}>
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                  narrow
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
