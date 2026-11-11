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
 */
import { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/mixpanel';
import { ChatList } from './ChatList';
import { ConversationPane } from './ConversationPane';
import { ThreadPanel } from './ThreadPanel';
import { ChatContext } from './chat-state';
import { DESKTOP_QUERY, useBack, useFinishLeave, useMediaQuery } from './chat-hooks';
import { parseChatRoute } from './chat-view-model';
import { useClarifyPanel } from './use-clarify-panel';

/** Once stopped, Mixpanel stays stopped for the rest of the page's life; later visits render at once. */
let sessionRecordingStopped = false;

export default function ChatHomePage() {
  const ctx = useContext(ChatContext);
  const { pathname, search } = useLocation();
  const route = parseChatRoute(pathname);
  const highlightId = new URLSearchParams(search).get('m');
  const summary = ctx?.chats.find((c) => c.conversationId === route.conversationId);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // Chats show people's messages: never record them (privacy policy). index.html covers a page that
  // loads on /chats; this covers in-app navigation into it. Unlike admin and /live, no chat content
  // mounts until the recorder is stopped, so not even one frame of it can be captured.
  const [recordingOff, setRecordingOff] = useState(sessionRecordingStopped);
  useEffect(() => {
    analytics.stopSessionRecording();
    sessionRecordingStopped = true;
    setRecordingOff(true);
  }, []);

  // Escape closes the thread panel the way its Back does (a dialog or menu that handled Escape marked it as taken).
  // P1631: Clarify opens the Mirror's thread beside the chat the person is in (?clarify=<root>); closing only removes the parameter.
  const { clarifyRoot, closeClarify } = useClarifyPanel();
  // open only when a panel will really render: a ?clarify= with no Mirror to show it in must not capture Escape
  const clarifyShown = !!clarifyRoot && !!ctx?.chats.some((c) => c.kind === 'mirror');
  const threadOpen = !!route.rootId || clarifyShown;
  const back = useBack();
  const closeThread = clarifyShown ? closeClarify : back;
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

  const conversationOpen = !!route.conversationId;
  const side = sidePanelOf(ctx.chats, summary, route.rootId, clarifyRoot);
  const showThread = side !== null;
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
          <ConversationPane conversationId={route.conversationId} highlightId={showThread ? null : highlightId} paneVisible={conversationVisible} threadOpen={showThread} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground" data-testid="no-chat-selected">
            <MessagesSquare className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Select a chat</p>
          </div>
        )}
      </div>
      {side?.clarify && <ThreadPanel key={`clarify:${side.rootId}`} summary={side.summary} rootId={side.rootId} highlightId={null} onClose={closeClarify} />}
      {side && !side.clarify && <ThreadPanel key={side.rootId} summary={side.summary} rootId={side.rootId} highlightId={highlightId} />}
    </div>
  );
}

type ChatSummary = NonNullable<React.ContextType<typeof ChatContext>>['chats'][number];

/** The right-hand panel: the Mirror's Clarify thread beside this chat (P1631) wins over the chat's own open thread; null when neither. */
function sidePanelOf(chats: ChatSummary[], summary: ChatSummary | undefined, rootId: string | null | undefined, clarifyRoot: string | null): { summary: ChatSummary; rootId: string; clarify: boolean } | null {
  if (!summary) return null;
  const mirror = clarifyRoot ? chats.find((c) => c.kind === 'mirror') : undefined;
  if (clarifyRoot && mirror) return { summary: mirror, rootId: clarifyRoot, clarify: true };
  return rootId ? { summary, rootId, clarify: false } : null;
}
