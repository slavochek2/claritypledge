/**
 * @file PrivatePointAttachment.tsx
 * @description P1631: a published private point as a chat card. The feed card, with the owner row of the other person in a 1:1 (and no row when they hold no position);
 * in a group or an event chat no person row, only the spread of positions and Details. No story is offered (the card is given no stories), no Copy link (the chat card
 * chrome is hidden by the caller), and the position buttons write through the ordinary upsert, which the database allows for the people the point is shared with.
 */
import { useContext, useEffect, useState } from 'react';
import { FeedPointCard, type FeedPointCardOwner } from '@/app/components/feed/feed-point-card';
import { pointsService } from '@/app/data/points-service';
import type { PointWithUserPosition } from '@/app/types';
import { ChatContext } from './chat-state';

/** The other person of a 1:1, with their position on this point; null for any other chat, or when they hold none. */
function useOtherOwner(pointId: string, conversationId: string | undefined): FeedPointCardOwner | null {
  const chats = useContext(ChatContext)?.chats;
  const other = conversationId ? chats?.find((c) => c.conversationId === conversationId && c.kind === 'dm')?.other ?? null : null;
  const otherId = other?.id ?? null;
  const [owner, setOwner] = useState<FeedPointCardOwner | null>(null);
  useEffect(() => {
    if (!otherId) {
      setOwner(null);
      return;
    }
    let live = true;
    pointsService.getPositionsForPoint(pointId).then(
      (rows) => {
        const row = rows.find((r) => r.userId === otherId);
        if (live) setOwner(row ? { id: otherId, name: row.userName, avatarUrl: row.userAvatarUrl, avatarColor: row.userAvatarColor, hasPledged: row.userHasPledged, position: row.position, isAgent: false } : null);
      },
      () => undefined,
    );
    return () => { live = false; };
  }, [pointId, otherId]);
  return owner;
}

export function PrivatePointAttachment({ point, conversationId }: { point: PointWithUserPosition; conversationId?: string }) {
  const owner = useOtherOwner(point.id, conversationId);
  return <FeedPointCard point={point} owner={owner ?? undefined} />;
}
