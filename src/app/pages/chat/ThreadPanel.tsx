/**
 * @file ThreadPanel.tsx
 * @description P1512: a message's thread — the root, then its replies, with its own composer.
 * A right-hand panel from lg up; the whole screen on a phone. Every chat has threads (P1546: 1:1s
 * and the mirror too); in the mirror, the mirror agent answers inside the thread it was asked in.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { ThreadHeader } from './ThreadHeader';
import { useBack } from './chat-hooks';
import { useChat } from './chat-state';
import { useRestoreMirrorStatuses } from './mirror-state';
import { useCanvasParts } from './use-canvas-parts';
import { useRetiredCanvasThread } from './use-retired-canvas-thread';
import { Skeleton } from '@/components/ui/skeleton';
import { chatTitle } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';
import { useVoiceSender } from './use-voice-sender';
import { EventRoomLink } from './EventRoomLink';

export function ThreadPanel({ summary, rootId, highlightId, onClose, fill = false, onRunActive, focusable = true, headerActions, canvasTitle }: {
  summary: ChatSummary;
  rootId: string;
  highlightId: string | null;
  /** Closes the panel where it is not the chat's own route (the canvas page): replaces the chat's Back. */
  onClose?: () => void;
  /** In the canvas workspace the pane is sized by its frame (full width below 1280px, 440px beside the canvas), not by this panel. */
  fill?: boolean;
  /** The workspace's Publish spot reads "Updating…" while a run goes: told whenever that changes. */
  onRunActive?: (active: boolean) => void;
  /** False while the panel is out of reach (the workspace's hidden pane below 1280px): it must not take focus on mount. */
  focusable?: boolean;
  /** The canvas workspace's Discard (W6): sits in the header beside the title, before the close button. */
  headerActions?: ReactNode;
  /** W8: the canvas's shown name for an update draft's header (the owner's rename); absent: its tag's title. */
  canvasTitle?: string;
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
  const ownerSlug = chat.authors[chat.userId]?.slug;
  const canvas = useCanvasParts({ canvasRoot, rootId, messages: conv.server, userId: chat.userId, ownerSlug, mirrorTitle: summary.title, canvasTitle, openCanvasFrom: fill ? null : (root?.attachmentId ?? null) });
  // W0: outside the workspace (`fill`) a canvas thread is an old address; it resolves to the canvas, and is held back meanwhile.
  const retired = useRetiredCanvasThread({ enabled: !fill, canvasRoot, ownerSlug, address: canvas.address });
  const runActive = canvas.runActive;
  useEffect(() => {
    onRunActive?.(runActive);
    // Gone (another thread, a closed draft): what it reported goes with it, so the Publish spot never sticks on "Updating…".
    return () => onRunActive?.(false);
  }, [onRunActive, runActive]);
  // P1576: a voice note sent here is a reply in this thread. Not in a canvas draft's thread (P1536): its opener holds
  // the one primary while nothing is typed, and the round voice button would be a second one in the send slot.
  const sendVoice = useVoiceSender(conversationId, !canvasRoot, rootId, undefined);
  const blockedReason = !summary.canSend
    ? 'You cannot send messages in this chat.'
    : rootDeleted
      ? "The first message of this thread was deleted, so it can't take new replies."
      : null;

  if (retired) {
    return (
      <section aria-label="Thread" data-testid="thread-retired" aria-busy="true" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background px-4 py-6 lg:w-[400px] lg:flex-none lg:border-l xl:w-[440px]">
        <Skeleton className="h-5 w-2/3" />
        <span className="sr-only">Opening your canvas</span>
      </section>
    );
  }

  return (
    <section
      aria-label="Thread"
      data-testid="thread-panel"
      className={fill ? 'flex min-h-0 min-w-0 flex-1 flex-col bg-background' : 'flex min-h-0 min-w-0 flex-1 flex-col bg-background lg:w-[400px] lg:flex-none lg:border-l xl:w-[440px]'}
    >
      <ThreadHeader onClose={close} menu={<><EventRoomLink chat={summary} />{headerActions}</>}>
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
        trailing={canvas.trailing}
      />
      {canvas.readState}
      {blockedReason ? (
        <div className="shrink-0 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="thread-composer-blocked">
          <p className="text-sm text-muted-foreground">{blockedReason}</p>
        </div>
      ) : (
        <Composer
          draftKey={`${chat.userId}:${conversationId}:${rootId}`}
          placeholder="Reply in thread"
          focusToken={focusToken}
          autoFocus={focusable}
          onSend={(body) => (canvas.send && body ? canvas.send(body) : void conv.send({ body }))}
          onVoiceNote={sendVoice}
          leading={canvas.leading}
        />
      )}
      {dialogs}
    </section>
  );
}
