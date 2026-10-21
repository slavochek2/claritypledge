/**
 * @file ChatHomePage.tsx
 * @description P1512: the signed-in Home — the chat list and the open conversation.
 *
 * The URL says what is open, so Back works and a link opens the same view:
 *   /home                          the list (desktop: with an empty right pane)
 *   /home/c/:conversationId        a conversation (phone: full screen with its own header)
 *   /home/c/:conversationId/t/:id  a thread in a channel (right panel; full screen on a phone)
 *
 * The page fills the space the layout leaves it (a flex column with min-h-0), so the offline strip, the
 * active-session banner and the room-capture bar shrink it instead of pushing the composer off screen.
 *
 * Desktop (lg+) is two panes: the list (360px) and the conversation; a thread opens as a third
 * pane and, below 2xl, takes the list's place so the conversation never gets narrower than a phone.
 */
import { useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/mixpanel';
import { ChatList } from './ChatList';
import { ConversationPane } from './ConversationPane';
import { ThreadPanel } from './ThreadPanel';
import { ChatContext } from './chat-state';
import { DESKTOP_QUERY, useBack, useFinishLeave, useMediaQuery } from './chat-hooks';
import { chatNav, chatPath, isChannel, parseChatRoute } from './chat-view-model';

/** Once stopped, Mixpanel stays stopped for the rest of the page's life; later visits render at once. */
let sessionRecordingStopped = false;

export default function ChatHomePage() {
  const ctx = useContext(ChatContext);
  const { pathname, search, state } = useLocation();
  const route = parseChatRoute(pathname);
  const highlightId = new URLSearchParams(search).get('m');
  const summary = ctx?.chats.find((c) => c.conversationId === route.conversationId);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // Chats show people's messages: never record them (privacy policy). index.html covers a page that
  // loads on /home; this covers in-app navigation into it. Unlike admin and /live, no chat content
  // mounts until the recorder is stopped, so not even one frame of it can be captured.
  const [recordingOff, setRecordingOff] = useState(sessionRecordingStopped);
  useEffect(() => {
    analytics.stopSessionRecording();
    sessionRecordingStopped = true;
    setRecordingOff(true);
  }, []);

  // Escape closes the thread panel the way its Back does (a dialog or menu that handled Escape marked it as taken).
  const threadOpen = !!route.rootId;
  const closeThread = useBack();
  useFinishLeave();
  useEffect(() => {
    if (!threadOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeThread();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [threadOpen, closeThread]);

  if (!ctx || !recordingOff) return <ClarityPageLoader />;

  // Threads exist in channels only: a thread URL on a 1:1 or the mirror falls back to the chat.
  if (route.rootId && route.conversationId && summary && !isChannel(summary)) {
    // The chat takes the thread URL's place and keeps what was below it.
    return <Navigate to={chatPath(route.conversationId)} replace state={chatNav({ pathname, state }, chatPath(route.conversationId), 'redirect').state} />;
  }

  const conversationOpen = !!route.conversationId;
  const showThread = !!(route.rootId && route.conversationId && summary);
  // Below lg an open thread hides the conversation behind it: what is hidden has not been seen.
  const conversationVisible = !showThread || isDesktop;

  const listClass = !conversationOpen ? 'flex' : showThread ? 'hidden 2xl:flex' : 'hidden lg:flex';
  const paneClass = !conversationOpen ? 'hidden lg:flex' : showThread ? 'hidden lg:flex' : 'flex';

  return (
    <div className="flex min-h-0 w-full flex-1" data-testid="chat-home">
      <div className={cn('min-h-0 w-full min-w-0 flex-col lg:w-[360px] lg:flex-none lg:border-r', listClass)}>
        <ChatList activeId={route.conversationId} />
      </div>
      <div className={cn('min-h-0 min-w-0 flex-1 flex-col', paneClass)}>
        {route.conversationId ? (
          <ConversationPane conversationId={route.conversationId} highlightId={showThread ? null : highlightId} paneVisible={conversationVisible} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground" data-testid="no-chat-selected">
            <MessagesSquare className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Select a chat</p>
          </div>
        )}
      </div>
      {showThread && summary && route.rootId && (
        <ThreadPanel key={route.rootId} summary={summary} rootId={route.rootId} highlightId={highlightId} />
      )}
    </div>
  );
}
