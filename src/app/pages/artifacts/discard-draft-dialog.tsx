/**
 * @file discard-draft-dialog.tsx
 * @description P1536: the confirmation behind an Artifacts canvas row's "Discard draft" (state from use-canvas-draft-menu).
 */
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import type { DiscardDialogState } from './use-canvas-draft-menu';

export function DiscardDraftDialog({ dialog }: { dialog: DiscardDialogState | null }) {
  if (!dialog) return null;
  return (
    <ConfirmDialog
      open={dialog.open}
      onOpenChange={dialog.onOpenChange}
      title="Discard draft"
      description={dialog.neverPublished
        ? `Discard the draft of “${dialog.title}”? Nothing of this canvas was published.`
        : `Discard the draft of “${dialog.title}”? Its changes are removed. Published versions stay as they are.`}
      confirmLabel={dialog.discarding ? 'Discarding...' : 'Discard'}
      isLoading={dialog.discarding}
      onConfirm={dialog.onConfirm}
    />
  );
}
