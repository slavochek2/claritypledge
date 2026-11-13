/**
 * @file EventShareDialog.tsx
 * @description P1529 (F7): the question after Publish, "Share your Clarity Canvas with this event's attendees?" with Share and Not now. The offer itself
 * (what is read, what Share does) is use-event-share-offer.ts. The error, when a share fails, stays in the dialog and is announced.
 */
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { EVENT_SHARE_COPY } from './use-event-share-offer';

export function EventShareDialog({ open, busy, error, onShare, onNotNow }: { open: boolean; busy: boolean; error?: string | null; onShare: () => void; onNotNow: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={o => { if (!o && !busy) onNotNow(); }}
      title={EVENT_SHARE_COPY.title}
      description={error ?? undefined}
      descriptionIsError={!!error}
      confirmLabel={EVENT_SHARE_COPY.share}
      cancelLabel={EVENT_SHARE_COPY.notNow}
      variant="default"
      onConfirm={onShare}
      isLoading={busy}
    />
  );
}
