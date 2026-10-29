/**
 * @file canvas-with-thread.tsx
 * @description P1536: the canvas page's route element. On a wide screen (1280px and up), the owner's own canvas opened with
 * `?thread=<rootId>` (a draft's "Open", or Artifacts' "Open draft") shows that draft's chat thread on the right, so the owner can
 * keep revising while looking at the canvas. The two stay in step through canvas-draft-events (a finished run re-reads the canvas;
 * a publish or discard on either side moves the other).
 *
 * The pane shows only when ALL hold: the width fits it, a `thread` param, the viewer's mirror chat, their own canvas, and that
 * thread is this canvas's open draft's (use-own-draft-thread). Otherwise this is just the canvas page, whose header then links
 * to the thread ("Revise in chat"). Beside the page the thread has no draft card (the page's header has Publish, an outline here),
 * closing the pane removes only `thread`, replacing the entry with its state kept (the page's panel mark rides in it), and the
 * canvas page stays mounted either way.
 */
import { useCallback, useContext } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { CanvasPaneContext, CANVAS_PANE_QUERY } from '@/app/components/canvas/canvas-pane-context';
import { CanvasPage } from '@/app/pages/canvas-page';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { useOwnDraftThread } from './use-own-draft-thread';

export function CanvasWithThread() {
  const { handle, projectTag } = useParams<{ handle: string; projectTag: string }>();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const wide = useMediaQuery(CANVAS_PANE_QUERY);
  const mirror = useContext(ChatContext)?.chats.find(c => c.kind === 'mirror') ?? null;
  const rootId = params.get('thread');
  const matched = useOwnDraftThread({ rootId, handle, projectTag, mirrorConversationId: mirror?.conversationId ?? null });
  const show = wide && !!rootId && !!mirror && matched;
  const closeThread = useCallback(() => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('thread');
      return next;
    }, { replace: true, state: location.state });
  }, [setParams, location.state]);

  // One tree either way: the canvas page keeps its state when the pane comes and goes (a resize across 1280px).
  return (
    <CanvasPaneContext.Provider value={show}>
      <div className="xl:flex xl:items-start" data-testid="canvas-with-thread">
        <div className="min-w-0 flex-1">
          <CanvasPage />
        </div>
        {show && mirror && rootId && (
          // Sticky under the shell's top bar (h-14), as tall as what is left of the screen: the thread scrolls inside the pane.
          <div className="sticky top-14 flex h-[calc(100dvh-3.5rem)] shrink-0" data-testid="canvas-thread-pane">
            <ThreadPanel key={rootId} summary={mirror} rootId={rootId} highlightId={null} onClose={closeThread} hideDraftCard />
          </div>
        )}
      </div>
    </CanvasPaneContext.Provider>
  );
}
