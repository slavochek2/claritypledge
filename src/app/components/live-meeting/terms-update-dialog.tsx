import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TermsUpdateDialogProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  /**
   * Default `true` preserves /live behavior (outside-click / Escape → onCancel).
   * Pass `false` for compliance-blocking modals (P832 global gate): outside-click
   * and Escape are no-ops; only the explicit Cancel button signs the user out.
   */
  dismissible?: boolean;
  /**
   * Inline error to render below the consent notice when an Accept attempt
   * fails (e.g. RLS/network). Null/undefined hides the error block.
   */
  errorMessage?: string | null;
}

export function TermsUpdateDialog({
  open,
  onAccept,
  onCancel,
  isLoading = false,
  dismissible = true,
  errorMessage = null,
}: TermsUpdateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && dismissible) onCancel();
      }}
    >
      <DialogContent
        hideCloseButton={!dismissible}
        onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Updated Terms</DialogTitle>
          <DialogDescription>
            We've updated our Terms and Privacy Policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This session is recorded for AI Insights. By continuing, you agree to the updated terms.
          </p>

          <div className="flex gap-4 text-sm">
            <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
              View Terms
            </a>
            <a href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
              View Privacy Policy
            </a>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onAccept} disabled={isLoading}>
            {isLoading ? 'Continuing...' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
