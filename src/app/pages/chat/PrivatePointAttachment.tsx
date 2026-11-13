/**
 * @file PrivatePointAttachment.tsx
 * @description P1631: a published private point as a chat card. The feed card, with the owner row of the other person in a 1:1 (and no row when they hold no position);
 * in a group or an event chat no person row, only the spread of positions and Details. "Add a story" works as on the canvas card: a NEW private story bound to this point (point_chat_add_story), readable by
 * exactly the people who can read this card (migration 20261113110000). No Copy link (the chat card chrome is hidden by the caller), and the position buttons write through the ordinary upsert,
 * which the database allows for the people the point is shared with.
 */
import { useContext, useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { FeedPointCard, type FeedPointCardOwner } from '@/app/components/feed/feed-point-card';
import { CanvasAddStoryDialog, type CanvasAddStoryState } from '@/app/components/canvas/canvas-add-story-dialog';
import { addChatPointStory } from '@/app/data/chat-point-stories-service';
import { useSharedPointStories } from './use-shared-point-stories';
import { InlineError } from './chat-kit';
import { pointsService } from '@/app/data/points-service';
import type { PointWithUserPosition } from '@/app/types';
import { ChatContext } from './chat-state';

/** [FOUNDER DECISION: wording] Who reads a story written on a shared card. */
const STORY_AUDIENCE_NOTE = 'Visible to you and everyone who can read this card.';

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

export function PrivatePointAttachment({ point, conversationId, messageId }: { point: PointWithUserPosition; conversationId?: string; messageId?: string }) {
  const owner = useOtherOwner(point.id, conversationId);
  // Reading the stories on this card needs only a signed-in viewer of the card (messageId); WRITING one needs a verified account, as the database requires. The card offers
  // "Add a story" only once the viewer has a position (unverified accounts cannot take one), and only when it is handed onAddStory here.
  const { session, user } = useAuth();
  const canRead = !!session?.user && !!messageId;
  const canAdd = canRead && !!user?.isVerified;
  const { stories, failed, reload } = useSharedPointStories(point.id, canRead);
  const [dialog, setDialog] = useState<CanvasAddStoryState | null>(null);
  return (
    <>
      <FeedPointCard
        point={point}
        owner={owner ?? undefined}
        linkedStories={canRead ? stories : undefined}
        onAddStory={canAdd && stories ? () => setDialog({ pointId: point.id, position: point.userPosition?.position ?? undefined }) : undefined}
      />
      {/* a failed read: neither a story row nor "Add a story" (the card gets no linkedStories), and a way to read again. Copy: the chat's existing load-failure line. */}
      {canRead && failed && <InlineError what="the stories" onRetry={reload} compact />}
      {canAdd && messageId && (
        <CanvasAddStoryDialog
          state={dialog}
          audienceNote={STORY_AUDIENCE_NOTE}
          onSave={(pointId, content) => addChatPointStory(pointId, messageId, content).then(() => undefined)}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        />
      )}
    </>
  );
}
