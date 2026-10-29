/**
 * @file OpenDraftDialog.tsx
 * @description P1536: the owner asked to start a draft from a version, but that canvas already has an open draft in
 * another thread. Nothing is silent: continue there, or discard that draft and start from the version picked.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function OpenDraftDialog({
  fromSeq,
  onContinue,
  onDiscard,
  onClose,
}: {
  /** The version the open draft was started from, when there was one. */
  fromSeq: number | null;
  onContinue: () => void;
  /** Resolves with an error sentence when the discard or the new start failed, else nothing. */
  onDiscard: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The button is busy, never disabled (a dead control): a second press while the first works does nothing.
  const inFlight = useRef(false);
  const discard = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const failed = await onDiscard();
    if (failed) {
      setError(failed);
      setBusy(false);
      inFlight.current = false;
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>You have an open draft</DialogTitle>
          <DialogDescription>
            You have an open draft{fromSeq ? ` (from v${fromSeq})` : ''} in another thread. Continue it there, or discard it and start from the version you picked?
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" aria-busy={busy} onClick={() => void discard()}>
            Discard it and start here
          </Button>
          <Button type="button" className="min-h-11" onClick={onContinue}>
            Continue it there
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
