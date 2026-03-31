/**
 * @file remove-position-dialog.tsx
 * @description P401/P576/P616: Simple confirmation dialog for position removal.
 * Positions and story-links are independent (P560). Removing a position does NOT
 * affect story links — the old P401 cascade trigger was dropped in P576.
 * Hook: useRemovePositionGuard — wraps dialog state + removePosition.
 */
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { pointsService } from '@/app/data/points-service';

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
          <Button variant="outline" onClick={onCancel} disabled={isRemoving}>
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

  const handleConfirm = useCallback(async () => {
    if (!pendingPointId) return;
    setIsRemoving(true);
    await pointsService.removePosition(pendingPointId, userId);
    setIsRemoving(false);
    setDialogOpen(false);
    const resolvedPointId = pendingPointId;
    setPendingPointId(null);
    onAfterRemove?.(resolvedPointId);
  }, [pendingPointId, userId, onAfterRemove]);

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
