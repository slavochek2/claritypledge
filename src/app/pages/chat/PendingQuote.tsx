/**
 * @file PendingQuote.tsx
 * @description P1512: the quote bar inside the composer's frame while a reply is pending (with x); nothing shows when nothing is pending.
 */
import type { ChatMessage } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { Quote } from './Quote';
import { messageSummary } from './chat-view-model';

interface Props {
  replyTo: ChatMessage | null;
  authors: Record<string, ChatAuthor>;
  onClearReply: () => void;
}

export function PendingQuote({ replyTo, authors, onClearReply }: Props) {
  if (!replyTo) return null;
  const quoteName = replyTo.authorId ? authors[replyTo.authorId]?.name ?? 'Unknown member' : 'Deleted user';
  return (
    <div className="px-2 pb-1 pt-1" data-testid="reply-bar">
      <Quote
        testId="reply-pending"
        label={replyTo.systemKind ? 'Reply' : `Reply to ${quoteName}`}
        body={<span className="mt-0.5 block line-clamp-2 break-words text-sm text-muted-foreground">{messageSummary(replyTo)}</span>}
        onRemove={onClearReply}
        removeLabel="Cancel reply"
      />
    </div>
  );
}
