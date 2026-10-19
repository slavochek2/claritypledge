/**
 * @file ChatHomePage.tsx
 * @description P1512: the signed-in Home — the chat list and the open conversation.
 *
 * The URL says what is open, so Back works and a link opens the same view:
 *   /home                          the list (desktop: with an empty right pane)
 *   /home/c/:conversationId        a conversation (phone: full screen with its own header)
 *   /home/c/:conversationId/t/:id  a thread in a channel (right panel; full screen on a phone)
 *
 * Desktop (lg+) is two panes: the list (360px) and the conversation; a thread opens as a third
 * pane and, below 2xl, takes the list's place so the conversation never gets narrower than a phone.
 */
import { useContext, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { cn } from '@/lib/utils';
import { ChatList } from './ChatList';
import { ConversationPane } from './ConversationPane';
import { ThreadPanel } from './ThreadPanel';
import { ChatContext } from './chat-state';
import { chatPath, isChannel, parseChatRoute } from './chat-view-model';

export default function ChatHomePage() {
  const ctx = useContext(ChatContext);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const route = parseChatRoute(pathname);
  const highlightId = new URLSearchParams(search).get('m');
  const summary = ctx?.chats.find((c) => c.conversationId === route.conversationId);

  // Escape closes the thread panel (a dialog or menu that handled Escape marked it as taken).
  const threadOpen = !!route.rootId;
  useEffect(() => {
    if (!threadOpen || !route.conversationId) return;
    const conversationId = route.conversationId;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) navigate(chatPath(conversationId));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [threadOpen, route.conversationId, navigate]);

  if (!ctx) return <ClarityPageLoader />;

  // Threads exist in channels only: a thread URL on a 1:1 or the mirror falls back to the chat.
  if (route.rootId && route.conversationId && summary && !isChannel(summary)) {
    return <Navigate to={chatPath(route.conversationId)} replace />;
  }

  const conversationOpen = !!route.conversationId;
  const showThread = !!(route.rootId && route.conversationId && summary);

  const listClass = !conversationOpen ? 'flex' : showThread ? 'hidden 2xl:flex' : 'hidden lg:flex';
  const paneClass = !conversationOpen ? 'hidden lg:flex' : showThread ? 'hidden lg:flex' : 'flex';

  return (
    <div className="flex w-full" data-testid="chat-home">
      <div className={cn('w-full min-w-0 flex-col lg:w-[360px] lg:flex-none lg:border-r', listClass)}>
        <ChatList activeId={route.conversationId} />
      </div>
      <div className={cn('h-[calc(100dvh-env(safe-area-inset-top))] min-w-0 flex-1 flex-col lg:h-dvh', paneClass)}>
        {route.conversationId ? (
          <ConversationPane conversationId={route.conversationId} highlightId={showThread ? null : highlightId} />
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
