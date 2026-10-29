/**
 * @file PendingQuote.tsx
 * @description P1512: the quote bar inside the composer's frame while a Clarify or a reply is pending (with x).
 * A Clarify wins when both could show; neither shows when nothing is pending.
 */
import type { ChatMessage } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { Quote } from './Quote';
import type { StagedClarify } from './chat-hooks';
import { messageSummary } from './chat-view-model';

interface Props {
  clarify: StagedClarify | null;
  replyTo: ChatMessage | null;
  authors: Record<string, ChatAuthor>;
  onClearClarify: () => void;
  onClearReply: () => void;
}

export function PendingQuote({ clarify, replyTo, authors, onClearClarify, onClearReply }: Props) {
  if (clarify) {
    return (
      <div className="px-2 pb-1 pt-1" data-testid="clarify-bar">
        <Quote
          testId="clarify-pending"
          label="Clarify"
          body={
            <>
              <span className="mt-0.5 block text-sm font-semibold text-foreground">{clarify.authorName}</span>
              <span className="block line-clamp-2 break-words text-sm text-muted-foreground">{messageSummary(clarify.message)}</span>
            </>
          }
          onRemove={onClearClarify}
          removeLabel="Cancel clarify"
        />
      </div>
    );
  }
  if (!replyTo) return null;
  const quoteName = replyTo.authorId ? authors[replyTo.authorId]?.name ?? 'Unknown member' : 'Deleted user';
  return (
    <div className="px-2 pb-1 pt-1" data-testid="reply-bar">
      <Quote
        testId="reply-pending"
        label={`Reply to ${quoteName}`}
        body={<span className="mt-0.5 block line-clamp-2 break-words text-sm text-muted-foreground">{messageSummary(replyTo)}</span>}
        onRemove={onClearReply}
        removeLabel="Cancel reply"
      />
    </div>
  );
}
