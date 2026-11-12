/**
 * @file ClarifyPublishButton.tsx
 * @description P1631: Publish to chat, the filled primary at the right end of the row under the latest card. Without the owner's position it wears the standard disabled look and a tap
 * says why (aria-disabled, so it stays focusable and the tap is heard). With one, a tap posts the point into the chat it came from and hands the answer to `onPublished` (the panel closes).
 * A card already published shows "Published" as quiet text; a card made from a Mirror message has no chat to post into, so no control at all.
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { publishClarify, type PublishResult } from '@/app/data/clarify-service';
import { CLARIFY_FAILED_TOAST, PUBLISH_LABEL, PUBLISH_NEEDS_POSITION_TOAST, PUBLISH_NOT_AVAILABLE_TOAST, PUBLISH_PUBLISHED_TEXT } from './clarify-copy';
import { useHasPosition } from './clarify-position-store';

export interface ClarifyPublishButtonProps {
  pointId: string;
  serverHasPosition: boolean;
  id: string;
  /** The point already has a live card in a chat. */
  published?: boolean;
  /** Kind of the chat the card came from; a Mirror-sourced card has nothing to publish into. */
  sourceKind?: string | null;
  onPublished?: (result: PublishResult) => void;
}

/** What a refusal says. `no_position` shares the toast of the disabled tap. */
function refusalToast(code: string): string {
  if (code === 'no_position') return PUBLISH_NEEDS_POSITION_TOAST;
  if (code === 'not_available') return PUBLISH_NOT_AVAILABLE_TOAST;
  return CLARIFY_FAILED_TOAST;
}

export function ClarifyPublishButton({ pointId, serverHasPosition, id, published = false, sourceKind = null, onPublished }: ClarifyPublishButtonProps) {
  const hasPosition = useHasPosition(pointId, serverHasPosition);
  const [busy, setBusy] = useState(false);
  // a ref, not state: a second tap in the same tick must see the first
  const pending = useRef(false);
  if (sourceKind === 'mirror') return null;
  if (published) {
    return <span className="px-2 text-sm text-muted-foreground" data-testid={`clarify-published-${id}`}>{PUBLISH_PUBLISHED_TEXT}</span>;
  }
  const publish = async () => {
    if (!hasPosition) {
      toast(PUBLISH_NEEDS_POSITION_TOAST);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await publishClarify(id);
      if (r.status === 'refused') toast(refusalToast(r.code));
      else onPublished?.(r);
    } catch {
      toast.error(CLARIFY_FAILED_TOAST);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      aria-disabled={!hasPosition || busy}
      className={cn('h-11 min-h-11 px-4', (!hasPosition || busy) && 'opacity-50')}
      data-testid={`clarify-publish-${id}`}
      onClick={() => void publish()}
    >
      {PUBLISH_LABEL}
    </Button>
  );
}
