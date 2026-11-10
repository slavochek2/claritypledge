/**
 * @file CanvasRetry.tsx
 * @description P1536 §2 (canvas_draft_retry): what stands under the owner message whose newest run FAILED. "Try again" (secondary)
 * makes one new run that copies the failed one (`retryCanvasRun`). A refusal is said in the existing sentences; `not_retryable` (an
 * upload whose file was never kept) turns the button into "Send the file again." with no button. Only offered for the draft's newest run.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { retryCanvasRun, type CanvasDraft, type CanvasDraftRun } from '@/app/data/canvas-draft-service';
import { DRAFT_ERROR_TEXT, notRetryableText, startRefusedText } from './canvas-thread-copy';
import { sendRefusedText } from './use-canvas-actions';

// [FOUNDER DECISION: wording] The spec quotes "Try again" (the button) and "Send the file again." (the bubble after not_retryable).
const TRY_AGAIN_LABEL = 'Try again';

export function CanvasRetry({ draft, run, reload }: { draft: Pick<CanvasDraft, 'id' | 'revision'>; run: Pick<CanvasDraftRun, 'id'> & { inputKind?: string | null }; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState<string | null>(null); // the run that could not be retried
  if (gone === run.id) return <p className="px-4 py-1 text-sm text-muted-foreground" data-testid="canvas-retry-unavailable">{notRetryableText(run.inputKind)}</p>;
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await retryCanvasRun({ draftId: draft.id, failedRunId: run.id, expectedRevision: draft.revision, clientId: crypto.randomUUID() });
      if (!r.ok) {
        if (r.refused === 'not_retryable') setGone(run.id);
        else toast.error(sendRefusedText(r.refused));
      } else if (r.start && !r.start.ok) {
        toast.error(startRefusedText(r.start.code, run.inputKind) ?? DRAFT_ERROR_TEXT.FAILED);
      }
      await reload().catch(() => undefined); // the run is going now (or the screen was behind): the thread shows what is true
    } catch {
      toast.error(DRAFT_ERROR_TEXT.FAILED);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="px-4 py-1" data-testid="canvas-retry">
      <button type="button" className={CANVAS_SECONDARY_PILL} aria-busy={busy} onClick={() => void retry()} data-testid="canvas-retry-button">
        {TRY_AGAIN_LABEL}
      </button>
    </div>
  );
}
