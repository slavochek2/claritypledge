/**
 * @file inbox-tab.tsx
 * @description P660: Inbox tab — chronological feed of incoming items.
 * Shows received letters, recipient responses, and link respondent completions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowDownLeft, ArrowUpRight, Inbox, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { getInboxItems, markDeliveryRead } from '@/app/data/letters-service';
import { formatTimeAgo } from '@/app/utils/format-time';
import type { InboxItem } from '@/app/types';

interface InboxTabProps {
  userId: string;
  onUnreadCountChange?: (count: number) => void;
}

export function InboxTab({ userId, onUnreadCountChange }: InboxTabProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setFetchState('loading');
    try {
      const result = await getInboxItems(userId);
      setItems(result);
      setFetchState('done');
      const unreadCount = result.filter((item) => !item.read_at).length;
      onUnreadCountChange?.(unreadCount);
    } catch {
      toast.error('Failed to load inbox');
      setFetchState('error');
    }
  }, [userId, onUnreadCountChange]);

  useEffect(() => {
    fetchItems();
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

    // Navigate based on item type
    if (item.type === 'received') {
      // Note: invitation_token would ideally be on InboxItem for the full URL.
      // Using delivery_id-based path; token must be added to InboxItem type if needed.
      navigate(`/letter/${item.delivery_id}`);
    } else {
      navigate(`/letter/${item.letter_id}/results`);
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
              </div>
              <div className="flex-shrink-0">
                <Button
                  size="sm"
                  className={item.type === 'received' && !item.completed_at
                    ? 'bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]'
                    : 'min-h-[44px]'}
                  variant={item.type === 'received' && !item.completed_at ? undefined : 'outline'}
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
      return <ArrowUpRight className="w-5 h-5 text-blue-500" />;
    case 'link_respondent':
      return <ArrowUpRight className="w-5 h-5 text-blue-500" />;
  }
}

function ItemMessage({ item }: { item: InboxItem }) {
  switch (item.type) {
    case 'received':
      return (
        <>
          <span className="font-medium">{item.actor_name}</span> sent you{' '}
          <span className="italic">{item.title}</span>
        </>
      );
    case 'recipient_responded':
      return (
        <>
          <span className="font-medium">{item.actor_name}</span> completed{' '}
          <span className="italic">{item.title}</span>
        </>
      );
    case 'link_respondent':
      return (
        <>
          Someone responded to <span className="italic">{item.title}</span>
        </>
      );
  }
}
