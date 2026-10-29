/**
 * @file canvas-draft-actions.tsx
 * @description P1536: what the header offers on the owner's draft version, in Share's place (a draft cannot be shared):
 * Publish, and the way to the draft's thread in the mirror chat ("Revise in chat", an outline) wherever that thread is not
 * already beside the page. Beside the page (wide screens, canvas-pane-context) the thread's own actions lead: Publish steps
 * back to an outline and the link is not needed. So at most one filled primary is on screen.
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { CanvasOwnerDraft } from '@/app/data/canvas-service';
import { chatPath } from '@/app/pages/chat/chat-view-model';
import { useCanvasPaneShown } from './canvas-pane-context';
import { CanvasPublishButton } from './canvas-publish-button';

export function CanvasDraftActions({ draft, hasPoints }: { draft: CanvasOwnerDraft; hasPoints: boolean }) {
  const paneShown = useCanvasPaneShown();
  return (
    <>
      {!paneShown && (
        <Button asChild variant="outline" className="min-h-11 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 max-sm:order-3">
          <Link to={chatPath(draft.conversationId, { rootId: draft.threadRootId })} data-testid="canvas-draft-revise">Revise in chat</Link>
        </Button>
      )}
      <CanvasPublishButton draft={draft} hasPoints={hasPoints} secondary={paneShown} />
    </>
  );
}
