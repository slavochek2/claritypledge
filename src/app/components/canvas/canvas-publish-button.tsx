/**
 * @file canvas-publish-button.tsx
 * @description P1536: Publish, the owner's primary action on a draft version of a canvas. It sits in the header row where
 * Share sits on a published version (a draft cannot be shared). The draft is shown to the owner only (the server returns the
 * draft block to no one else), on the draft version only. With nothing drafted yet there is no Publish (no dead control, P955).
 * With the draft's thread beside the page the thread's actions lead, so Publish is an outline (`secondary`). The page learns
 * the draft closed from the publish event (canvas-draft-events), not from this button.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CanvasDraftRefusal, publishCanvasDraft } from '@/app/data/canvas-draft-service';
import type { CanvasOwnerDraft } from '@/app/data/canvas-service';

const REFUSAL_TEXT: Record<CanvasDraftRefusal['code'], string> = {
  RUN_ACTIVE: 'Your draft is being written right now. Try again in a minute.',
  NOTHING_TO_PUBLISH: 'There is nothing to publish yet.',
  CLOSED: 'This draft is already closed.',
  TOO_MANY_DRAFTS: 'Could not publish this draft.',
};

export function CanvasPublishButton({ draft, hasPoints, secondary = false }: {
  draft: CanvasOwnerDraft;
  /** the draft has at least one point: only then is there something to publish */
  hasPoints: boolean;
  /** an outline instead of the filled primary (the draft's thread is shown beside the page) */
  secondary?: boolean;
}) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap while the first is in flight must not publish twice (the button stays enabled: no dead control).
  const inFlight = useRef(false);

  const publish = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPublishing(true);
    setError(null);
    try {
      await publishCanvasDraft(draft.id);
    } catch (e) {
      setError(e instanceof CanvasDraftRefusal ? REFUSAL_TEXT[e.code] : 'Could not publish this draft. Try again.');
    } finally {
      inFlight.current = false;
      setPublishing(false);
    }
  };

  if (!hasPoints) return null;
  return (
    <>
      <Button
        type="button"
        variant={secondary ? 'outline' : 'default'}
        className={`min-h-11 max-sm:order-3 ${secondary ? 'border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700' : ''}`}
        aria-busy={publishing} onClick={() => void publish()}
        data-testid="canvas-draft-publish"
      >
        {publishing ? 'Publishing…' : 'Publish'}
      </Button>
      {/* w-full: in the header's wrapping row the refusal reads on its own line under the button. Phones: order-3/4 put Publish
          and the refusal after the owner's line, as Share and New version are (canvas-header). */}
      {error && <p role="alert" className="w-full text-sm text-red-700 max-sm:order-4" data-testid="canvas-draft-error">{error}</p>}
    </>
  );
}
