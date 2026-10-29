/**
 * @file ThreadPanel.tsx
 * @description P1512: a message's thread — the root, then its replies, with its own composer.
 * A right-hand panel from lg up; the whole screen on a phone. Every chat has threads (P1546: 1:1s
 * and the mirror too); in the mirror, the mirror agent answers inside the thread it was asked in.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { ThreadHeader } from './ThreadHeader';
import { useBack } from './chat-hooks';
import { useChat } from './chat-state';
import { useRestoreMirrorStatuses } from './mirror-state';
import { useCanvasParts } from './use-canvas-parts';
import { chatTitle } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';
import { useVoiceSender } from './use-voice-sender';
import { EventRoomLink } from './EventRoomLink';

export function ThreadPanel({ summary, rootId, highlightId, onClose, hideDraftCard = false }: {
  summary: ChatSummary;
  rootId: string;
  highlightId: string | null;
  /** Closes the panel where it is not the chat's own route (the canvas page): replaces the chat's Back. */
  onClose?: () => void;
  /** Beside the canvas page the draft card is left out: the draft is on screen, and the page has its own Publish. */
  hideDraftCard?: boolean;
}) {
  const chat = useChat();
  const conversationId = summary.conversationId;
  const conv = useConversationMessages({ conversationId, threadRootId: rootId });
  // P1546: a mirror thread's own questions get their thinking / failed state back after a reload.
  useRestoreMirrorStatuses(summary.kind === 'mirror' ? conv.server : null, chat.userId);
  const [focusToken, setFocusToken] = useState(0);
  // Every Reply inside a thread is a reply to the thread: it just moves focus to the field.
  const onReply = useCallback((_m: ChatMessage) => setFocusToken((t) => t + 1), []);
  const { actions, dialogs } = useMessageActions({ summary, conv, onReply });
  const back = useBack();
  const close = onClose ?? back;
  // A thread that does not exist for this person (a reply, a 1:1, another chat's message) closes itself, the way Back does.
  useEffect(() => {
    if (conv.status === 'unavailable') close();
  }, [conv.status, close]);
  const root = conv.server.find((m) => m.id === rootId);
  const rootDeleted = !!root?.isDeleted;
  // P1536: a thread that starts with a canvas version is a canvas draft's thread (the draft is read from the database).
  const canvasRoot = summary.kind === 'mirror' && root?.attachmentKind === 'canvas_version';
  const canvas = useCanvasParts({
    canvasRoot,
    rootId,
    messages: conv.server,
    userId: chat.userId,
    ownerSlug: chat.authors[chat.userId]?.slug,
    mirrorTitle: summary.title,
    hideDraftCard,
  });
  // P1576: a voice note sent here is a reply in this thread. Not in a canvas draft's thread (P1536): its opener holds
  // the one primary while nothing is typed, and the round voice button would be a second one in the send slot.
  const sendVoice = useVoiceSender(conversationId, !canvasRoot, rootId, undefined);
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
      <ThreadHeader onClose={close} menu={<><EventRoomLink chat={summary} />{canvas.headerMenu}</>}>
        {canvas.headerTitle ?? (
          <>
            <h2 className="truncate text-base font-semibold text-foreground">Thread</h2>
            <p className="truncate text-xs text-muted-foreground">{chatTitle(summary)}</p>
          </>
        )}
      </ThreadHeader>
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
        {...canvas.list}
      />
      {canvas.tray}
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
          onSendableChange={canvas.setComposing}
          onSend={(body) => void conv.send({ body })}
          onVoiceNote={sendVoice}
          leading={canvas.leading}
        />
      )}
      {dialogs}
    </section>
  );
}
