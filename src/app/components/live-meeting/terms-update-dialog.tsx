import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRef } from 'react';
import type { TermsChangeSummary } from '@/app/content/terms-changes';
import { TermsChangeList, TermsFinePrint, TermsMissedChanges, TermsTitle, TERMS_CONSENT_LINE } from '@/app/components/legal/terms-change-list';

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
  /** Label for the secondary button. The global gate passes "Decline and log out", which is what it does there. */
  cancelLabel?: string;
  /** Earlier versions needing consent that this person skipped. */
  missed?: TermsChangeSummary[] | null;
}

export function TermsUpdateDialog({
  open,
  onAccept,
  onCancel,
  isLoading = false,
  dismissible = true,
  errorMessage = null,
  cancelLabel = 'Cancel',
  missed,
}: TermsUpdateDialogProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && dismissible) onCancel();
      }}
    >
      <DialogContent
        className="flex max-h-[100dvh] flex-col"
        hideCloseButton={!dismissible}
        onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
        // Focus the primary action, not the first tabbable (the "Show more" toggle).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          acceptRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            <TermsTitle />
          </DialogTitle>
          <DialogDescription className="sr-only">{TERMS_CONSENT_LINE}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <TermsChangeList />
          <TermsMissedChanges missed={missed ?? []} />
        </div>

        {/* Outside the scroll area: what is being asked must stay visible on a small phone. */}
        <div className="space-y-3">
          <p className="text-sm">
            <TermsFinePrint required />
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="text-muted-foreground" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button ref={acceptRef} onClick={onAccept} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Agree and continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
