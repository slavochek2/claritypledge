/**
 * @file remove-position-dialog.tsx
 * @description P401: Warning dialog shown before removing a position that has linked stories.
 * Consumed by: point-detail-page, profile-page-v2.
 * Hook: useRemovePositionGuard — wraps checkLinkedStories + dialog state + removePosition.
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
  linkedStoryCount: number;        // number to show in warning message
  onConfirm: () => void;           // called when user confirms removal
  onCancel: () => void;            // called when user cancels
  isRemoving?: boolean;            // shows loading state on confirm button
}

// ============================================================================
// Dialog component
// ============================================================================

export function RemovePositionDialog({
  open,
  linkedStoryCount,
  onConfirm,
  onCancel,
  isRemoving = false,
}: RemovePositionDialogProps) {
  const storyWord = linkedStoryCount === 1 ? 'story' : 'stories';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent hideCloseButton>
        <DialogHeader>
          <DialogTitle>Remove position?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              <p>Removing your position will remove this point from your profile.</p>
              {linkedStoryCount > 0 && (
                <p>
                  Your <strong>{linkedStoryCount} {storyWord}</strong> will stay
                  linked to this point without a position.
                </p>
              )}
            </div>
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
 * Wraps removePosition with a linked-stories check and confirmation dialog.
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
  const [linkedCount, setLinkedCount] = useState(0);
  const [pendingPointId, setPendingPointId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const guardedRemovePosition = useCallback(async (pointId: string) => {
    // checkLinkedStories is added in P402 — fall back to 0 if not yet on the service
    const count = (pointsService as typeof pointsService & { checkLinkedStories?: (pointId: string, userId: string) => Promise<number> }).checkLinkedStories
      ? await (pointsService as typeof pointsService & { checkLinkedStories: (pointId: string, userId: string) => Promise<number> }).checkLinkedStories(pointId, userId)
      : 0;

    // Always show dialog — profile warning shown for all cases, story count shown conditionally
    setLinkedCount(count);
    setPendingPointId(pointId);
    setDialogOpen(true);
  }, [userId]);

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
      linkedStoryCount: linkedCount,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
      isRemoving,
    },
    guardedRemovePosition,
  };
}
