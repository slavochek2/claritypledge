/**
 * @file AttachmentCard.tsx
 * @description P1512: a point or story attached to a message, rendered with the app's own feed
 * cards. Only the id is stored in the message: the item is fetched through the reader's access,
 * so a reader who cannot see it gets "Not available to you" instead of someone else's copy.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { loadAttachment, type Shareable } from '@/app/data/chat-ui-helpers';
import type { ChatAttachmentKind } from '@/app/data/chat-mappers';
import { Button } from '@/components/ui/button';

type State = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; item: Shareable };

/** A read that has not answered by now is a failure, not a skeleton forever. */
export const ATTACHMENT_TIMEOUT_MS = 20_000;

/** Whether the browser says it has a connection (and when that changes). */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * The cards carry authoring chrome (their ⋯ menu, a story's "+ Add a point") that has no place on
 * a card sitting in a conversation: Delete from inside a chat is not what anyone expects there.
 */
const HIDE_CARD_CHROME = "[&_[aria-label^='More_actions_for_this']]:hidden [&_[aria-label='Add_a_point_to_this_story']]:hidden";

/** A small, honest placeholder row: what it is, never an empty box. */
const NOTE = 'mt-1 flex max-w-md items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm text-muted-foreground';

export function AttachmentCard({ kind, id, viewerId }: { kind: ChatAttachmentKind; id: string; viewerId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const online = useOnline();
  const load = useCallback(() => {
    let live = true;
    setState({ status: 'loading' });
    const timer = setTimeout(() => live && setState({ status: 'error' }), ATTACHMENT_TIMEOUT_MS);
    loadAttachment(kind, id, viewerId).then(
      (item) => {
        clearTimeout(timer);
        if (live) setState(item ? { status: 'ready', item } : { status: 'missing' });
      },
      () => {
        clearTimeout(timer);
        if (live) setState({ status: 'error' });
      },
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, id, viewerId]);
  useEffect(() => load(), [load]);
  // Back online: a card that never loaded tries again by itself.
  const wasOffline = useRef(false);
  const settled = useRef(false);
  settled.current = state.status === 'ready' || state.status === 'missing';
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      if (!settled.current) return load();
    }
  }, [online, load]);

  if (state.status === 'ready') {
    const { item } = state;
    const drawable = (item.kind === 'point' && item.point) || (item.kind === 'story' && item.story);
    if (!drawable) return <p className={`${NOTE} min-h-10 italic`}>Not available to you</p>;
    return (
      <div className={`mt-1 w-full max-w-md ${HIDE_CARD_CHROME}`} data-testid={`attachment-${kind}`}>
        {item.kind === 'point' && item.point && <FeedPointCard point={item.point} />}
        {item.kind === 'story' && item.story && <FeedStoryCard story={item.story} linkedPoints={item.linkedPoints} currentUserId={viewerId} />}
      </div>
    );
  }
  if (state.status === 'missing') {
    return <p className={`${NOTE} min-h-10 italic`}>Not available to you</p>;
  }
  if (!online) {
    return (
      <p className={`${NOTE} min-h-10`} data-testid="attachment-offline">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        Available when you&apos;re back online
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={`${NOTE} py-1`} data-testid="attachment-error">
        <span className="min-w-0 flex-1">Couldn&apos;t load this {kind}</span>
        <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading attachment" className={`${NOTE} min-h-16 animate-pulse`}>
      Loading {kind}…
    </div>
  );
}
