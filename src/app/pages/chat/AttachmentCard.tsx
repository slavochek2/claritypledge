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
import { ArtifactAttachmentCard } from './ArtifactAttachmentCard';
import { AttachmentSkeleton } from './AttachmentSkeleton';
import { CanvasVersionCard } from './CanvasVersionCard';
import { useCanvasRenamed } from './use-canvas-renamed';
import { useCanvasRootRefresh } from './use-canvas-root-refresh';

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
export const HIDE_CARD_CHROME = "[&_[aria-label^='More_actions_for_this']]:hidden [&_[aria-label='Add_a_point_to_this_story']]:hidden";

const NOUN: Record<ChatAttachmentKind, string> = { point: 'point', story: 'story', canvas: 'canvas', letter: 'letter', canvas_version: 'canvas' };

/** The canvas a ready canvas-version card shows (null: nothing to follow). */
function shownCanvasId(state: State): string | null {
  return state.status === 'ready' ? state.item.canvasVersion?.canvasId ?? null : null;
}

/** The OPEN draft a ready canvas-version card is the thread of (null: nothing to follow). A published or discarded draft never changes again, so a closed card listens for nothing. */
function shownDraftId(state: State): string | null {
  const card = state.status === 'ready' ? state.item.canvasVersion : undefined;
  return card?.state === 'draft' ? card.draftId ?? null : null;
}

/** A quiet re-read's answer: it replaces the card only when it is still the latest read and found something; otherwise the card stays as it is. */
function swapIn(now: State, item: Shareable | null, latest: boolean): State {
  return item && latest ? { status: 'ready', item } : now;
}

/** A small, honest placeholder row: what it is, never an empty box. */
const NOTE = 'mt-1 flex max-w-md items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm text-muted-foreground';

/**
 * `refreshKey` (3c X10): the root's reply count; a change is a signal to read the card again (a Publish reply is a reply).
 * `rootId` (3c X10): the message this card is the root of, when it is the first message of a canvas thread: the card then says what THAT thread's draft is.
 * `compact`: drawn inside a quote block (a forwarded or clarified message): the compact standard card, no vote buttons
 * and no Retry button (a quote can itself be a button, and buttons do not nest).
 */
export function AttachmentCard(props: { kind: ChatAttachmentKind; id: string; viewerId: string; compact?: boolean; rootId?: string; refreshKey?: number }) {
  // P1545: canvases and letters have their own reader-judged card; points and stories keep the feed cards.
  if (props.kind === 'canvas' || props.kind === 'letter') return <ArtifactAttachmentCard {...props} kind={props.kind} />;
  return <FeedItemAttachmentCard {...props} />;
}

function FeedItemAttachmentCard({ kind, id, viewerId, compact = false, rootId, refreshKey }: { kind: ChatAttachmentKind; id: string; viewerId: string; compact?: boolean; rootId?: string; refreshKey?: number }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const online = useOnline();
  // One generation per card: every read takes the next number, and only the read holding the current
  // number may touch the state. A timeout, a Retry, a reconnect and an unmount each move it on, so a
  // request that answers late (after its own timeout or after a successful Retry) is ignored.
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invalidate = useCallback(() => {
    generation.current += 1;
    clearTimeout(timer.current);
  }, []);
  const load = useCallback(() => {
    invalidate();
    const mine = generation.current;
    const current = () => generation.current === mine;
    setState({ status: 'loading' });
    timer.current = setTimeout(() => {
      if (!current()) return;
      invalidate();
      setState({ status: 'error' });
    }, ATTACHMENT_TIMEOUT_MS);
    loadAttachment(kind, id, viewerId, ...(rootId ? [rootId] : [])).then(
      (item) => {
        if (!current()) return;
        clearTimeout(timer.current);
        setState(item ? { status: 'ready', item } : { status: 'missing' });
      },
      () => {
        if (!current()) return;
        clearTimeout(timer.current);
        setState({ status: 'error' });
      },
    );
  }, [kind, id, viewerId, rootId, invalidate]);
  useEffect(() => {
    load();
    return invalidate;
  }, [load, invalidate]);
  // Back online: a card that never loaded tries again by itself.
  const wasOffline = useRef(false);
  const settled = useRef(false);
  settled.current = state.status === 'ready' || state.status === 'missing';
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      if (!settled.current) load();
    }
  }, [online, load]);

  // A quiet re-read: the card stays on screen until the new answer comes, and a failed re-read changes nothing.
  const rereadQuietly = () => {
    invalidate();
    const mine = generation.current;
    loadAttachment(kind, id, viewerId, ...(rootId ? [rootId] : [])).then((item) => setState((now) => swapIn(now, item, generation.current === mine)), () => undefined);
  };
  // A confirmed rename of the canvas this card shows.
  useCanvasRenamed(shownCanvasId(state), rereadQuietly);
  // 3c X10: a thread root's card follows its draft being published or discarded elsewhere, on a real signal (the same-tab event, the tab returning, a new reply).
  const followed = shownDraftId(state);
  useCanvasRootRefresh(followed, rereadQuietly, refreshKey, followed !== null);

  if (state.status === 'ready') {
    const { item } = state;
    const drawable = (item.kind === 'point' && item.point) || (item.kind === 'story' && item.story) || (item.kind === 'canvas_version' && item.canvasVersion);
    if (!drawable) return <p className={`${NOTE} min-h-10 italic`}>Not available to you</p>;
    if (item.kind === 'canvas_version' && item.canvasVersion) return <CanvasVersionCard data={item.canvasVersion} compact={compact} />;
    return (
      <div className={`mt-1 w-full max-w-md ${HIDE_CARD_CHROME}`} data-testid={`attachment-${kind}`}>
        {item.kind === 'point' && item.point && <FeedPointCard point={item.point} compact={compact} />}
        {item.kind === 'story' && item.story && <FeedStoryCard story={item.story} linkedPoints={item.linkedPoints} currentUserId={viewerId} compact={compact} />}
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
        <span className="min-w-0 flex-1">Couldn&apos;t load this {NOUN[kind]}</span>
        {!compact && (
          <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => void load()}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  return <AttachmentSkeleton kind={NOUN[kind]} card={kind === 'canvas_version'} />;
}
