/**
 * @file CanvasStartRefused.tsx
 * @description P1529: the notice under the owner's message when the run it made was never started (terms, a refused or failed request).
 * Terms genuinely behind: the existing terms dialog opens on reload. Otherwise "Try again" starts the same run once more.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { clearStartRefusal } from '@/app/data/canvas-start-refusals';
import { startCanvasRun } from '@/app/data/canvas-draft-service';
import { Button } from '@/components/ui/button';
import { CanvasPillButton } from './CanvasPillButton';
import { START_REFUSED_BUSY, START_REFUSED_GENERIC, START_REFUSED_TERMS_ACTION, START_REFUSED_TRY_AGAIN, START_REFUSED_TRYING, startRefusedNotice } from './canvas-start-refused-copy';
import { useTermsRefusalKind } from './use-terms-refusal-kind';

export function CanvasStartRefused({ runId, code, reload }: { runId: string; code: string; reload: () => Promise<void> }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const notice = startRefusedNotice(code);
  const termsKind = useTermsRefusalKind(notice.kind === 'terms', user?.id, code);
  // A terms answer the client does not agree with (or is still checking) reads as the generic failure: its button cannot loop.
  const checking = notice.kind === 'terms' && termsKind === 'checking'; // no words and no button until the check says which it is
  const shown = notice.kind === 'terms' && termsKind !== 'behind' ? startRefusedNotice('FAILED') : notice;
  const tryAgain = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // The refusal stays until a validated start clears it (startCanvasRun): the notice stays mounted and says "Trying…".
      const r = await startCanvasRun(runId);
      // BUSY: the draft really is working; the old refusal no longer describes it, so the thread resumes its normal state.
      if (!r.ok && r.code === 'BUSY') { clearStartRefusal(runId); toast.error(START_REFUSED_BUSY); }
      await reload().catch(() => undefined);
    } catch {
      toast.error(START_REFUSED_GENERIC);
    } finally {
      setBusy(false);
    }
  };
  if (checking) return null; // nothing mounted (no alert region) until the terms check says which message this is
  return (
    <div role="alert" className="px-4 py-1" data-testid="canvas-start-refused" data-code={code} data-terms={termsKind}>
      <p className="text-sm text-muted-foreground" data-testid="canvas-start-refused-text">{shown.text}</p>
      {shown.kind === 'terms' && (
        <Button type="button" className="mt-1" onClick={() => window.location.reload()} data-testid="canvas-start-refused-terms">{START_REFUSED_TERMS_ACTION}</Button>
      )}
      {shown.kind === 'retry' && (
        <CanvasPillButton className="mt-1" label={START_REFUSED_TRY_AGAIN} busyLabel={START_REFUSED_TRYING} busy={busy} onClick={() => void tryAgain()} testId="canvas-start-refused-retry" />
      )}
    </div>
  );
}
