/**
 * @file ThreadPanel.tsx
 * @description P1512: a channel message's thread — the root, then its replies, with its own composer.
 * A right-hand panel from lg up; the whole screen on a phone. Threads exist in group and event
 * channels only; a 1:1 or the mirror uses quote-reply.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PanelRight, X } from 'lucide-react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { FOCUS_RING, HOVER } from './chat-kit';
import { useChat } from './chat-state';
import { chatPath, chatTitle } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';
import { cn } from '@/lib/utils';

export function ThreadPanel({ summary, rootId, highlightId }: { summary: ChatSummary; rootId: string; highlightId: string | null }) {
  const chat = useChat();
  const navigate = useNavigate();
  const conversationId = summary.conversationId;
  const conv = useConversationMessages({ conversationId, threadRootId: rootId });
  const [focusToken, setFocusToken] = useState(0);
  // Every Reply inside a thread is a reply to the thread: it just moves focus to the field.
  const onReply = useCallback((_m: ChatMessage) => setFocusToken((t) => t + 1), []);
  const { actions, dialogs } = useMessageActions({ summary, conv, onReply });
  const close = () => navigate(chatPath(conversationId));
  // A thread that does not exist for this person (a reply, a 1:1, another chat's message) closes itself.
  useEffect(() => {
    if (conv.status === 'unavailable') navigate(chatPath(conversationId), { replace: true });
  }, [conv.status, conversationId, navigate]);
  const root = conv.server.find((m) => m.id === rootId);
  const rootDeleted = !!root?.isDeleted;
  const blockedReason = !summary.canSend
    ? 'You cannot send messages in this chat.'
    : rootDeleted
      ? "The first message of this thread was deleted, so it can't take new replies."
      : null;

  return (
    <section
      aria-label="Thread"
      data-testid="thread-panel"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background lg:w-[400px] lg:flex-none lg:border-l xl:w-[440px]"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2 lg:gap-2 lg:px-4">
        <button type="button" onClick={close} aria-label="Back to the conversation" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground lg:hidden', HOVER, FOCUS_RING)}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <PanelRight className="hidden h-[18px] w-[18px] shrink-0 text-muted-foreground lg:block" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">Thread</h2>
          <p className="truncate text-xs text-muted-foreground">{chatTitle(summary)}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close thread" className={cn('-mr-2 hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground lg:flex', HOVER, FOCUS_RING)}>
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </header>
      <MessageList
        conv={conv}
        actions={actions}
        viewerId={chat.userId}
        authors={chat.authors}
        label="Thread messages"
        targetId={highlightId}
        empty="This thread is empty."
        inThread
        earlierLabel="Load earlier replies"
      />
      {blockedReason ? (
        <div className="shrink-0 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="thread-composer-blocked">
          <p className="text-sm text-muted-foreground">{blockedReason}</p>
        </div>
      ) : (
        <Composer
          draftKey={`${chat.userId}:${conversationId}:${rootId}`}
          placeholder="Reply in thread"
          focusToken={focusToken}
          autoFocus
          onSend={(body) => void conv.send({ body })}
        />
      )}
      {dialogs}
    </section>
  );
}
