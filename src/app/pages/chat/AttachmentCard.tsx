/**
 * @file AttachmentCard.tsx
 * @description P1512: a point or story attached to a message, rendered with the app's own feed
 * cards. Only the id is stored in the message: the item is fetched through the reader's access,
 * so a reader who cannot see it gets "Not available to you" instead of someone else's copy.
 */
import { useCallback, useEffect, useState } from 'react';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { loadAttachment, type Shareable } from '@/app/data/chat-ui-helpers';
import type { ChatAttachmentKind } from '@/app/data/chat-mappers';
import { Button } from '@/components/ui/button';

type State = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; item: Shareable };

/**
 * The cards carry authoring chrome (their ⋯ menu, a story's "+ Add a point") that has no place on
 * a card sitting in a conversation: Delete from inside a chat is not what anyone expects there.
 */
const HIDE_CARD_CHROME = "[&_[aria-label^='More_actions_for_this']]:hidden [&_[aria-label='Add_a_point_to_this_story']]:hidden";

export function AttachmentCard({ kind, id, viewerId }: { kind: ChatAttachmentKind; id: string; viewerId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const load = useCallback(() => {
    let live = true;
    setState({ status: 'loading' });
    loadAttachment(kind, id, viewerId).then(
      (item) => live && setState(item ? { status: 'ready', item } : { status: 'missing' }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [kind, id, viewerId]);
  useEffect(() => load(), [load]);

  if (state.status === 'loading') {
    return <div role="status" aria-label="Loading attachment" className="mt-1 h-24 max-w-md animate-pulse rounded-xl border bg-muted/50" />;
  }
  if (state.status === 'missing') {
    return (
      <p className="mt-1 max-w-md rounded-xl border bg-muted/40 px-3 py-2 text-sm italic text-muted-foreground">Not available to you</p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mt-1 flex max-w-md items-center gap-2 rounded-xl border bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
        <span className="min-w-0 flex-1">Could not load this {kind}.</span>
        <Button variant="ghost" className="min-h-10" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  const { item } = state;
  return (
    <div className={`mt-1 w-full max-w-md ${HIDE_CARD_CHROME}`} data-testid={`attachment-${kind}`}>
      {item.kind === 'point' && item.point && <FeedPointCard point={item.point} />}
      {item.kind === 'story' && item.story && (
        <FeedStoryCard story={item.story} linkedPoints={item.linkedPoints} currentUserId={viewerId} />
      )}
    </div>
  );
}
