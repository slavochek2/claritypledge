/**
 * @file ThreadPanel.tsx
 * @description P1512: a message's thread — the root, then its replies, with its own composer.
 * A right-hand panel from lg up; the whole screen on a phone. Every chat has threads (P1546: 1:1s
 * and the mirror too); in the mirror, the mirror agent answers inside the thread it was asked in.
 */
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { canvasThreadFlags } from './canvas-thread-flags';
import type { CanvasWorkspaceProps } from './canvas-send-slot';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { ThreadHeader } from './ThreadHeader';
import { useRevealPublished } from './use-reveal-published';
import { useChat } from './chat-state';
import { useRestoreMirrorStatuses } from './mirror-state';
import { useCanvasParts } from './use-canvas-parts';
import { useClarifyParts } from './use-clarify-parts';
import { useReportRunActive } from './use-canvas-pane';
import { useRetiredCanvasThread } from './use-retired-canvas-thread';
import { Skeleton } from '@/components/ui/skeleton';
import { chatTitle } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';
import { useThreadVoice } from './use-thread-voice';
import { EventRoomLink } from './EventRoomLink';
import { useClarifyLayout } from './use-clarify-layout';
import { useThreadClose } from './use-thread-close';

/** Why this thread takes no replies, or null. */
function threadBlockedReason(canSend: boolean, rootDeleted: boolean): string | null {
  if (!canSend) return 'You cannot send messages in this chat.';
  return rootDeleted ? "The first message of this thread was deleted, so it can't take new replies." : null;
}

/** W0: an old canvas-thread address, held back while it resolves to the canvas. */
function RetiredThread() {
  return (
    <section aria-label="Thread" data-testid="thread-retired" aria-busy="true" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background px-4 py-6 lg:w-[400px] lg:flex-none lg:border-l xl:w-[440px]">
      <Skeleton className="h-5 w-2/3" />
      <span className="sr-only">Opening your canvas</span>
    </section>
  );
}

/** The thread's bottom: why it takes no replies, the canvas's own closed/cap line, or the composer. */
function ThreadFooter({ blockedReason, canvas, draftKey, focusToken, focusable, sendPlain, sendVoice }: {
  blockedReason: string | null;
  canvas: ReturnType<typeof useCanvasParts>;
  draftKey: string;
  focusToken: number;
  focusable: boolean;
  sendPlain: (body: string | null) => void;
  sendVoice: ComponentProps<typeof Composer>['onVoiceNote'];
}) {
  if (blockedReason) {
    return (
      <div className="shrink-0 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="thread-composer-blocked">
        <p className="text-sm text-muted-foreground">{blockedReason}</p>
      </div>
    );
  }
  return canvas.closedLine ?? canvas.capNotice ?? (
    <Composer
      waiting={canvas.waiting}
      draftKey={draftKey}
      placeholder={canvas.replyHint ?? 'Reply in thread'}
      focusToken={focusToken}
      autoFocus={focusable}
      onSend={(body) => (canvas.send && body ? canvas.send(body) : sendPlain(body))}
      onVoiceNote={sendVoice}
      leading={canvas.leading}
    />
  );
}

interface ThreadPanelProps {
  summary: ChatSummary;
  rootId: string;
  highlightId: string | null;
  /** Closes the panel where it is not the chat's own route (the canvas page): replaces the chat's Back. */
  onClose?: () => void;
  /** P1631: the thread fills the left area beside the Clarify Mirror (from 1280px); its header's "← Chat" calls this, and so does a thread that turns out unavailable. */
  onBackToChat?: () => void;
  /**
   * P1631 (AC 137): the Clarify Mirror beside its source: full screen with Back below 1280px, a 440px right panel from 1280px. Known before the root
   * is read; a Clarify thread opened from the Mirror chat itself gets the same once its root is read.
   */
  clarifyPanel?: boolean;
  /** P1631: told whether this thread is a Clarify thread: null while its root is being read, then true or false (the page covers itself behind one below 1280px). */
  onClarifyThread?: (isClarify: boolean | null) => void;
  /** In the canvas workspace the pane is sized by its frame (full width below 1280px, 440px beside the canvas), not by this panel. */
  fill?: boolean;
  /** The workspace's Publish spot reads "Updating…" while a run goes: told whenever that changes. */
  onRunActive?: (active: boolean) => void;
  /** False while the panel is out of reach (the workspace's hidden pane below 1280px): it must not take focus on mount. */
  focusable?: boolean;
  /** A menu or action beside the title, before the close button (the canvas workspace no longer uses it: its Discard moved to the page header, 3c X6). */
  headerActions?: ReactNode;
  /** W8: the canvas's shown name for an update draft's header (the owner's rename); absent: its tag's title. */
  canvasTitle?: string;
  /** The canvas workspace names its panel itself (3c X8: the mirror agent's face and name): it replaces the thread's own header title. */
  panelTitle?: ReactNode;
  /** The canvas workspace's own props for the thread it hosts (its presence: a canvas draft's thread from the first render, before the root has loaded; and the cap's words). */
  workspace?: CanvasWorkspaceProps;
}

export function ThreadPanel({ summary, rootId, highlightId, onClose, onBackToChat, clarifyPanel = false, onClarifyThread, fill = false, onRunActive, focusable = true, headerActions, canvasTitle, panelTitle, workspace }: ThreadPanelProps) {
  const chat = useChat();
  const conversationId = summary.conversationId;
  const conv = useConversationMessages({ conversationId, threadRootId: rootId });
  // P1546: a mirror thread's own questions get their thinking / failed state back after a reload.
  useRestoreMirrorStatuses(summary.kind === 'mirror' ? conv.server : null, chat.userId);
  const [focusToken, setFocusToken] = useState(0);
  // Every Reply inside a thread is a reply to the thread: it just moves focus to the field.
  const onReply = useCallback((_m: ChatMessage) => setFocusToken((t) => t + 1), []);
  const { actions, dialogs } = useMessageActions({ summary, conv, onReply });
  const close = useThreadClose(conv.status, onClose, onBackToChat); // closes itself when the thread does not exist for this person
  const root = conv.server.find((m) => m.id === rootId);
  const rootDeleted = !!root?.isDeleted;
  // P1536: a thread that starts with a canvas version is a canvas draft's thread (the draft is read from the database).
  const { canvasRoot, rootPending } = canvasThreadFlags({ kind: summary.kind, root, status: conv.status, fromWorkspace: !!workspace });
  const ownerSlug = chat.authors[chat.userId]?.slug;
  const sendPlain = useCallback((body: string | null) => void conv.send({ body }), [conv]);
  const canvas = useCanvasParts({ canvasRoot, rootPending, sendPlain, workspace, rootId, messages: conv.server, userId: chat.userId, ownerSlug, mirror: summary, canvasTitle, openCanvasFrom: fill ? null : (root?.attachmentId ?? null) });
  // W0: outside the workspace (`fill`) a canvas thread is an old address; it resolves to the canvas, and is held back meanwhile.
  const retired = useRetiredCanvasThread({ enabled: !fill, canvasRoot, ownerSlug, address: canvas.address });
  const runActive = canvas.runActive;
  useReportRunActive(runActive, onRunActive);
  // P1576: a voice note sent here is a reply in this thread; in a canvas draft's thread (3c X9) it is the draft's update (use-thread-voice).
  const sendVoice = useThreadVoice(conversationId, rootId, canvasRoot, rootPending, canvas.voice);
  const blockedReason = threadBlockedReason(summary.canSend, rootDeleted);
  // P1631: a Clarify thread shows its drafts under the source copy; its composer refines the latest draft or adds another.
  const reveal = useRevealPublished(); // after a publish: the chat or thread with the new card focused; the Clarify panel closes with it
  const clarify = useClarifyParts(summary, root, chat.userId, conv.server, reveal, focusable);
  const layout = useClarifyLayout({ summary, status: conv.status, isClarify: clarify.isClarify, clarifyPanel, fill, leftArea: !!onBackToChat, onClarifyThread });

  if (retired) return <RetiredThread />;

  return (
    <section
      aria-label="Thread"
      data-testid="thread-panel"
      className={layout.panelClass}
    >
      <ThreadHeader onClose={close} onBackToChat={onBackToChat} clarifyPanel={layout.asClarify} menu={<><EventRoomLink chat={summary} />{headerActions}</>} workspace={fill ? 'draft' : undefined}>
        {panelTitle ?? canvas.headerTitle ?? clarify.headerTitle ?? (
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
        empty={canvasRoot ? null : 'This thread is empty.'} // a canvas draft's list is empty only until its read answers; the read's own state says the rest
        inThread
        earlierLabel="Load earlier replies"
        {...canvas.list}
        trailing={canvas.trailing}
        after={clarify.after ?? canvas.after}
        scrollerClassName={layout.scrollerClassName}
      />
      {canvas.readState}
      {clarify.isClarify && !blockedReason ? clarify.footer : (
        <ThreadFooter
          blockedReason={blockedReason}
          canvas={canvas}
          draftKey={`${chat.userId}:${conversationId}:${rootId}`}
          focusToken={focusToken}
          focusable={focusable}
          sendPlain={sendPlain}
          sendVoice={sendVoice}
        />
      )}
      {dialogs}
    </section>
  );
}
