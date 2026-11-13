/**
 * @file ChatHomePage.tsx
 * @description P1512: the signed-in Home — the chat list and the open conversation.
 *
 * The URL says what is open, so Back works and a link opens the same view:
 *   /chats                          the list (desktop: with an empty right pane)
 *   /chats/c/:conversationId        a conversation (phone: full screen with its own header)
 *   /chats/c/:conversationId/t/:id  a thread in any chat (P1546: 1:1s and the mirror too) (right panel; full screen on a phone)
 *
 * The page fills the space the layout leaves it (a flex column with min-h-0), so the offline strip, the
 * active-session banner and the room-capture bar shrink it instead of pushing the composer off screen.
 *
 * Desktop (lg+) is two panes: the list (360px) and the conversation; a thread opens as a third
 * pane and, below 2xl, takes the list's place so the conversation never gets narrower than a phone.
 * P1631: from 1280px, Clarify from an open thread shows that thread where the conversation was ("← Chat" brings the conversation back) and the
 * Mirror on the right; closing the Mirror leaves the thread open on the right again, as before.
 */
import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { cn } from '@/lib/utils';
import { ChatList } from './ChatList';
import { ConversationPane } from './ConversationPane';
import { ThreadPanel } from './ThreadPanel';
import { ChatContext } from './chat-state';
import { DESKTOP_QUERY, WIDE_QUERY, useMediaQuery } from './chat-hooks';
import { parseChatRoute } from './chat-view-model';
import { PointsPanel } from './PointsPanel';
import { homeLayout } from './chat-home-layout';
import { useKeepFresh, useLeftThread, useRecordingOff, useRouteClarify, useSidePanels } from './use-chat-home';

export default function ChatHomePage() {
  const ctx = useContext(ChatContext);
  const { pathname, search } = useLocation();
  const route = parseChatRoute(pathname);
  const highlightId = new URLSearchParams(search).get('m');
  const summary = ctx?.chats.find((c) => c.conversationId === route.conversationId);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // index.html covers a page that loads on /chats; this covers in-app navigation into it. Unlike admin and /live,
  // no chat content mounts until the recorder is stopped, so not even one frame of it can be captured.
  const recordingOff = useRecordingOff();
  const { side, pointsShown, showThread, closeClarify, closePoints } = useSidePanels(ctx?.chats ?? [], summary, route, search);
  // P1631: from 1280px, Clarify pressed from an open thread puts that thread on the left (with "← Chat") and the Mirror on the right.
  const wide = useMediaQuery(WIDE_QUERY);
  const { leftThread, backToChat, leaveThread } = useLeftThread(side, summary, route.rootId, wide);
  useKeepFresh(!!leftThread); // the chat behind the left thread is not viewed, but stays fresh
  const { routeClarify, routeClarifyUnknown, onClarifyThread } = useRouteClarify(side);

  if (!ctx || !recordingOff) return <ClarityPageLoader />;

  // P1631 (AC 137): the Clarify Mirror (beside its source, or a Clarify thread of the Mirror chat itself) is full screen below 1280px (xl), where an
  // ordinary thread is full screen only below lg. A Mirror-chat thread whose root is not read yet may be one: it is treated as one until known, so a
  // Clarify thread never flashes the side layout.
  const clarifyOpen = !!side?.clarify || routeClarify || routeClarifyUnknown;
  const { conversationVisible, listClass, paneClass } = homeLayout({ conversationOpen: !!route.conversationId, showThread, clarifyOpen, wide, isDesktop });

  return (
    <div className="flex min-h-0 w-full flex-1" data-testid="chat-home">
      <div className={cn('min-h-0 w-full min-w-0 flex-col lg:w-[360px] lg:flex-none lg:border-r', listClass)}>
        <ChatList activeId={route.conversationId} />
      </div>
      <div className={cn('min-h-0 min-w-0 flex-1 flex-col', paneClass)}>
        {leftThread ? (
          <ThreadPanel key={`left:${leftThread.rootId}`} summary={leftThread.summary} rootId={leftThread.rootId} highlightId={highlightId} onBackToChat={backToChat} onClose={leaveThread} focusable={false} />
        ) : route.conversationId ? (
          <ConversationPane conversationId={route.conversationId} highlightId={showThread ? null : highlightId} paneVisible={conversationVisible} threadOpen={showThread} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground" data-testid="no-chat-selected">
            <MessagesSquare className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Select a chat</p>
          </div>
        )}
      </div>
      {pointsShown && route.conversationId && <PointsPanel key={`points:${route.conversationId}`} conversationId={route.conversationId} onClose={closePoints} />}
      {side?.clarify && <ThreadPanel key={`clarify:${side.rootId}`} summary={side.summary} rootId={side.rootId} highlightId={null} onClose={closeClarify} clarifyPanel />}
      {side && !side.clarify && <ThreadPanel key={side.rootId} summary={side.summary} rootId={side.rootId} highlightId={highlightId} onClarifyThread={onClarifyThread} />}
    </div>
  );
}
