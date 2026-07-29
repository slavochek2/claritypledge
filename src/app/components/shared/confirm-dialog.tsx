import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        No CLOSE animation — deliberate, and load-bearing rather than cosmetic.

        Radix's <Presence> keeps a closing node mounted in an "unmountSuspended"
        state until it receives `animationend`/`animationcancel`. Chrome does not
        create CSS animation objects in a hidden tab (getAnimations() returns []),
        so if the close lands while the tab is hidden, that event never arrives:
        the node stays mounted forever, its DismissableLayer never runs its unmount
        cleanup, and `document.body.style.pointerEvents` is never restored from
        "none". The page then renders perfectly and accepts no clicks until reload.

        Not theoretical, and not only a background-tab edge case: any caller that
        awaits a network round trip before closing (OrgHeader's Leave does) leaves a
        window of hundreds of ms in which the user can switch away mid-request. With
        `animation-name: none` at data-state=closed, Presence unmounts synchronously
        and there is no event to miss. The trade is the 150ms fade-out on close.
        Guarded by e2e/p1010-organizations.spec.ts ("closed state must not animate").
      */}
      <DialogContent
        hideCloseButton
        className="max-w-sm data-[state=closed]:!animate-none"
        overlayClassName="data-[state=closed]:!animate-none"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Please wait...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
