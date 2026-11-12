/**
 * @file ClarifyPublishButton.tsx
 * @description P1631: Publish to chat, the filled primary at the right end of the row under the latest card. Without the owner's position it wears the standard disabled look and a tap
 * says why (aria-disabled, so it stays focusable and the tap is heard). With one, publishing itself is the next part: a tap says so.
 */
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PUBLISH_COMING_TOAST, PUBLISH_LABEL, PUBLISH_NEEDS_POSITION_TOAST } from './clarify-copy';
import { useHasPosition } from './clarify-position-store';

export function ClarifyPublishButton({ pointId, serverHasPosition, id }: { pointId: string; serverHasPosition: boolean; id: string }) {
  const hasPosition = useHasPosition(pointId, serverHasPosition);
  return (
    <Button
      type="button"
      aria-disabled={!hasPosition}
      className={cn('h-11 min-h-11 px-4', !hasPosition && 'opacity-50')}
      data-testid={`clarify-publish-${id}`}
      onClick={() => toast(hasPosition ? PUBLISH_COMING_TOAST : PUBLISH_NEEDS_POSITION_TOAST)}
    >
      {PUBLISH_LABEL}
    </Button>
  );
}
