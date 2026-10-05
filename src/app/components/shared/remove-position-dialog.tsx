/**
 * @file remove-position-dialog.tsx
 * @description P401/P576/P616: Simple confirmation dialog for position removal.
 * Positions and story-links are independent (P560). Removing a position does NOT
 * affect story links — the old P401 cascade trigger was dropped in P576.
 * Hook: useRemovePositionGuard — wraps dialog state + removePosition.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UNRESOLVED_WRITE_MESSAGE, canSendWrite, isNetworkWriteFailure } from '@/app/hooks/use-online-write-guard';
import { networkMark } from '@/lib/network-outcome';
import {
  beginPositionWrite,
  endPositionWrite,
  isLatestPositionWrite,
  recordConfirmedPosition,
  sendPositionWrite,
  settlePositionWrite,
} from '@/app/data/position-write-outcome';

// ============================================================================
// Props
// ============================================================================

export interface RemovePositionDialogProps {
  open: boolean;
  onConfirm: () => void;           // called when user confirms removal
  onCancel: () => void;            // called when user cancels
  isRemoving?: boolean;            // shows loading state on confirm button
}

// ============================================================================
// Dialog component
// ============================================================================

export function RemovePositionDialog({
  open,
  onConfirm,
  onCancel,
  isRemoving = false,
}: RemovePositionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent hideCloseButton>
        <DialogHeader>
          <DialogTitle>Remove position?</DialogTitle>
          <DialogDescription>
            Removing your position will remove this point from your profile.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isRemoving}>
            {isRemoving ? 'Removing...' : 'Remove position'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Hook: useRemovePositionGuard
// ============================================================================

interface UseRemovePositionGuardOptions {
  userId: string;
  onAfterRemove?: (pointId: string) => void;  // called after successful removal
}

interface UseRemovePositionGuardReturn {
  dialogProps: RemovePositionDialogProps;
  guardedRemovePosition: (pointId: string) => Promise<void>;
}

/**
 * Wraps removePosition with a confirmation dialog.
 * P576: No longer checks linked stories — positions and stories are independent.
 *
 * Usage:
 *   const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({ userId, onAfterRemove });
 *   // In JSX: <RemovePositionDialog {...dialogProps} />
 *   // In handler: await guardedRemovePosition(pointId);
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRemovePositionGuard({
  userId,
  onAfterRemove,
}: UseRemovePositionGuardOptions): UseRemovePositionGuardReturn {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingPointId, setPendingPointId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const guardedRemovePosition = useCallback(async (pointId: string) => {
    setPendingPointId(pointId);
    setDialogOpen(true);
  }, []);

  // P1420: a settle can outlive the render that started it. Read the latest callback, and stop
  // every settle when the hook unmounts.
  const onAfterRemoveRef = useRef(onAfterRemove);
  onAfterRemoveRef.current = onAfterRemove;
  const unmounted = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingPointId) return;
    const pointId = pendingPointId;
    // P1369: cached cards render offline — a removal there must never look done.
    // P1420: but one dropped answer must not refuse the retry without trying: probe first.
    setIsRemoving(true);
    if (!(await canSendWrite())) {
      setIsRemoving(false);
      setDialogOpen(false);
      setPendingPointId(null);
      return;
    }
    const generation = beginPositionWrite(userId, pointId);
    try {
      const signal = unmounted.current.signal;
      const sentAt = networkMark();
      try {
        // Bounded: a captive portal can leave the request unanswered for good.
        await sendPositionWrite(userId, pointId, null, generation);
        setIsRemoving(false);
        setDialogOpen(false);
        setPendingPointId(null);
        if (isLatestPositionWrite(userId, pointId, generation)) onAfterRemoveRef.current?.(pointId);
      } catch (err) {
        console.error('Failed to remove position:', err);
        setIsRemoving(false);
        if (!isNetworkWriteFailure(err, sentAt)) {
          if (isLatestPositionWrite(userId, pointId, generation)) toast.error('Failed to remove position.');
          return;
        }
        // P1420: sent, never answered — the server may well have removed it. Ask the server.
        setDialogOpen(false);
        setPendingPointId(null);
        const outcome = await settlePositionWrite({ userId, pointId, generation, expected: null, signal });
        if (outcome.kind === 'superseded') return;
        if (outcome.kind === 'confirmed') {
          recordConfirmedPosition(userId, pointId, generation, null);
          onAfterRemoveRef.current?.(pointId);
        } else if (outcome.kind === 'rejected') {
          toast.error('Your position was not removed. Try again.'); // copy approved by founder 2026-10-05
        } else {
          toast.error(UNRESOLVED_WRITE_MESSAGE);
        }
      }
    } finally {
      endPositionWrite(userId, pointId); // bounded bookkeeping (P1420 round 3)
    }
  }, [pendingPointId, userId]);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
    setPendingPointId(null);
  }, []);

  return {
    dialogProps: {
      open: dialogOpen,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
      isRemoving,
    },
    guardedRemovePosition,
  };
}
