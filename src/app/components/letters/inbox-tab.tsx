/**
 * @file inbox-tab.tsx
 * @description P660: Inbox tab — chronological feed of incoming items.
 * Shows received letters, recipient responses, and link respondent completions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, ArrowDownLeft, ArrowUpRight, Inbox, Eye, Video } from 'lucide-react';
import { toast } from 'sonner';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { getInboxItems, markDeliveryRead, getUnreadExplainBackCountsByDelivery } from '@/app/data/letters-service';
import { formatTimeAgo } from '@/app/utils/format-time';
import type { InboxItem } from '@/app/types';
import type { OpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';

interface InboxTabProps {
  userId: string;
  onUnreadCountChange?: (count: number) => void;
  openInvite?: OpenLiveInvite | null;
}

export function InboxTab({ userId, onUnreadCountChange, openInvite }: InboxTabProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  // 'stale' = we have items on screen but the latest poll failed (P1011).
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done' | 'stale' | 'error'>('idle');
  // Refs, not state: these gate side effects inside fetchItems and must not
  // retrigger the polling effect, which depends on the fetchItems identity.
  const hasLoadedOnce = useRef(false);
  const hasToastedFailure = useRef(false);
  const [markingRead, setMarkingRead] = useState<string | null>(null);
  // P904: unread explain-back counts per delivery (sender-side "N new from <name>").
  const [explainBackCounts, setExplainBackCounts] = useState<Record<string, number>>({});

  const fetchItems = useCallback(async () => {
    setFetchState((prev) => prev === 'idle' ? 'loading' : prev);
    try {
      const result = await getInboxItems(userId);
      setItems(result);
      setFetchState('done');
      const unreadCount = result.filter((item) => !item.read_at).length;
      onUnreadCountChange?.(unreadCount);

      // P904: explain-backs land on the sender's letters, so only sender-side items.
      const senderDeliveryIds = result
        .filter((item) => item.type !== 'received')
        .map((item) => item.delivery_id);
      setExplainBackCounts(await getUnreadExplainBackCountsByDelivery(senderDeliveryIds));
      hasLoadedOnce.current = true;
      hasToastedFailure.current = false;
    } catch {
      // P1011: a poll failure is usually transient — a stale token after the
      // machine wakes, or a dropped connection (JAVASCRIPT-REACT-2F). The next
      // tick normally succeeds unaided, so don't tear down a good render.
      //
      // Once we have data, keep showing it and mark the view stale. Only a
      // failure with nothing on screen escalates to the error state.
      setFetchState(hasLoadedOnce.current ? 'stale' : 'error');

      // Toast once per failure streak, not once per tick. This view polls on an
      // interval AND on every visibilitychange, so an unguarded toast here fired
      // continuously for as long as the condition lasted.
      if (!hasToastedFailure.current) {
        hasToastedFailure.current = true;
        toast.error(
          hasLoadedOnce.current
            ? "Can't reach the server — retrying"
            : 'Failed to load inbox'
        );
      }
    }
  }, [userId, onUnreadCountChange]);

  useEffect(() => {
    fetchItems();
    let interval: ReturnType<typeof setInterval> = setInterval(fetchItems, 15_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchItems();
        clearInterval(interval);
        interval = setInterval(fetchItems, 15_000);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchItems]);

  const handleAction = async (item: InboxItem) => {
    const isUnread = !item.read_at;

    if (isUnread) {
      setMarkingRead(item.delivery_id);
      try {
        await markDeliveryRead(item.delivery_id);
        // Optimistically update local state
        setItems((prev) =>
          prev.map((i) =>
            i.delivery_id === item.delivery_id
              ? { ...i, read_at: new Date().toISOString() }
              : i
          )
        );
        const newUnreadCount = items.filter(
          (i) => !i.read_at && i.delivery_id !== item.delivery_id
        ).length;
        onUnreadCountChange?.(newUnreadCount);
      } catch {
        toast.error('Failed to mark as read');
        setMarkingRead(null);
        return;
      }
      setMarkingRead(null);
    }

    // Navigate based on item type and completion state
    if (item.type === 'received') {
      if (item.completed_at) {
        // Completed received letter → go straight to results (skip reading flow, skip celebration)
        navigate(`/letter/${item.letter_id}/results?delivery=${item.delivery_id}`);
      } else {
        // In-progress received letter → open reading flow
        navigate(`/letter/${item.delivery_id}`);
      }
    } else {
      navigate(`/letter/${item.letter_id}/results?delivery=${item.delivery_id}`);
    }
  };

  if (fetchState === 'loading') {
    return (
      <div className="flex justify-center py-12">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <p className="text-sm text-muted-foreground">Something went wrong loading your inbox.</p>
        <Button variant="outline" size="sm" onClick={fetchItems}>
          Retry
        </Button>
      </div>
    );
  }

  if (fetchState === 'done' && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Inbox className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No letters or responses yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* P1011: the list below is last-known-good; the most recent poll failed.
          Neutral/muted rather than a warning colour — this self-heals on the next
          tick and is not an error the user must act on. */}
      {fetchState === 'stale' && (
        <p
          data-testid="inbox-stale-notice"
          role="status"
          className="text-xs text-muted-foreground text-center py-1"
        >
          Can't reach the server — showing your last update, retrying…
        </p>
      )}
      {/* P703: Live invite row — rendered above unread letters, disappears when closed_at set */}
      {openInvite && !openInvite.closedAt && (
        <div
          data-testid="live-invite-row"
          className="rounded-lg border p-4 bg-blue-500/5 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="sr-only">Unread. </span>
            <div className="flex-shrink-0 w-2 flex items-center justify-center">
              <span className="block w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
            </div>
            <div className="flex-shrink-0">
              <Video className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground line-clamp-2">
                <span className="font-medium">{openInvite.authorName || 'Someone'}</span>
                {' invited you to verify '}
                <span className="italic">{openInvite.storyTitle || 'a story'}</span>
              </p>
            </div>
            <div className="flex-shrink-0">
              <Button
                size="sm"
                className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
                onClick={() => navigate(`/live/${openInvite.code}`)}
              >
                Join
              </Button>
            </div>
          </div>
        </div>
      )}
      {items.map((item) => {
        const isUnread = !item.read_at;
        const isMarking = markingRead === item.delivery_id;

        return (
          <div
            key={item.delivery_id}
            className={`rounded-lg border p-4 hover:bg-accent/50 transition-colors ${
              isUnread ? 'bg-blue-500/5' : 'bg-card'
            }`}
            data-unread={isUnread ? 'true' : undefined} /* stable e2e selector — do not remove */
          >
            <div className="flex items-center gap-3">
              {isUnread && <span className="sr-only">Unread. </span>}
              <div className="flex-shrink-0 w-2 flex items-center justify-center">
                <span
                  className={`block w-2 h-2 rounded-full bg-blue-500 transition-opacity ${
                    isUnread ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden="true"
                />
              </div>
              <div className="flex-shrink-0">
                <ItemIcon type={item.type} completed={!!item.completed_at} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm line-clamp-2 ${
                    isUnread ? 'font-semibold text-foreground' : 'font-normal text-foreground'
                  }`}
                >
                  <ItemMessage item={item} />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTimeAgo(item.timestamp)} ago
                </p>
                {/* P699: step progress — all rows where fields are present (received + all sender variants) */}
                {item.steps_completed !== undefined &&
                  item.total_steps !== undefined && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {Math.min(item.steps_completed, item.total_steps)} of {item.total_steps} steps
                  </p>
                )}
                {/* P904: return signal — unread explain-backs on this letter */}
                {(explainBackCounts[item.delivery_id] ?? 0) > 0 && (
                  <p className="text-xs text-blue-600 mt-0.5 font-medium">
                    • {explainBackCounts[item.delivery_id]} new from {item.actor_name}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0">
                <Button
                  size="sm"
                  className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
                  disabled={isMarking}
                  onClick={() => handleAction(item)}
                >
                  {item.type === 'received' && !item.completed_at ? (
                    <><Mail className="w-4 h-4 mr-1.5" /> Open</>
                  ) : (
                    <><Eye className="w-4 h-4 mr-1.5" /> Results</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemIcon({ type, completed }: { type: InboxItem['type']; completed: boolean }) {
  switch (type) {
    case 'received':
      return completed
        ? <ArrowDownLeft className="w-5 h-5 text-muted-foreground" />
        : <Mail className="w-5 h-5 text-blue-500" />;
    case 'recipient_responded':
    case 'link_respondent':
    case 'recipient_in_progress':
    case 'link_respondent_in_progress':
      return <ArrowUpRight className="w-5 h-5 text-blue-500" />;
  }
}

function ActorName({ name, slug }: { name: string; slug?: string | null }) {
  // P725: registered actors link to /p/:slug; null slug → plain text.
  // Defensive: RPC type is string|null even though DB enforces NOT NULL (P736).
  // Guards against deleted-actor rows, system actors, and future RPC changes.
  // `inline-flex min-h-[40px]` gives the 40px touch target required by AC.
  if (!slug) {
    return <span className="font-medium max-w-[24ch] sm:max-w-[40ch] truncate inline-block align-middle">{name}</span>;
  }
  return (
    <Link
      to={`/p/${slug}`}
      onClick={(e) => e.stopPropagation()}
      title={name}
      className="font-medium hover:underline inline-flex items-center min-h-[40px] max-w-[24ch] sm:max-w-[40ch] truncate"
    >
      {name}
    </Link>
  );
}

function ItemMessage({ item }: { item: InboxItem }) {
  switch (item.type) {
    case 'received':
      return (
        <>
          <ActorName name={item.actor_name} slug={item.actor_slug} /> sent you{' '}
          <span className="italic">{item.title}</span>
        </>
      );
    case 'recipient_responded':
      return (
        <>
          <ActorName name={item.actor_name} slug={item.actor_slug} /> completed{' '}
          <span className="italic">{item.title}</span>
        </>
      );
    case 'link_respondent':
      return (
        <>
          Someone responded to <span className="italic">{item.title}</span>
        </>
      );
    case 'recipient_in_progress':
      return (
        <><ActorName name={item.actor_name} slug={item.actor_slug} /> is reading <span className="italic">{item.title}</span></>
      );
    case 'link_respondent_in_progress':
      return (
        <>Someone is responding to <span className="italic">{item.title}</span></>
      );
  }
}
