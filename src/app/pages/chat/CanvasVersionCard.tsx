/**
 * @file CanvasVersionCard.tsx
 * @description P1536: a canvas version attached to a message, drawn as the chat's shared-artifact card (icon disc, the canvas title,
 * one line naming the state of its version: "Draft", "v2 · date · Published", "Discarded draft") with an Open button (W0/W4):
 * the one way from the mirror chat to the canvas. Open goes where the card's version resolves (an open draft: the workspace; a
 * published version: that version; see getCanvasVersionCard). Inside a quote it is plain text without a button, because a quote can
 * itself be a button and links do not nest in buttons.
 */
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { Button } from '@/components/ui/button';
import { ARTIFACT_CARD, ARTIFACT_DISC } from './artifact-card-style';
import { OPEN_LABEL, versionStateLine } from './canvas-thread-copy';
import { cn } from '@/lib/utils';

export function CanvasVersionCard({ data, compact = false }: { data: CanvasVersionCardData; compact?: boolean }) {
  const title = data.title ?? 'Canvas';
  const { pathname, search } = useLocation();
  return (
    <div className={cn(ARTIFACT_CARD, 'min-h-14')} data-testid="attachment-canvas_version" data-state={data.state}>
      <span className={ARTIFACT_DISC} aria-hidden="true">
        <LayoutGrid className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground" data-testid="canvas-version-state">{versionStateLine(data)}</span>
      </span>
      {!compact && data.openHref && (
        <Button asChild variant="secondary" className="min-h-10 shrink-0">
          <Link to={data.openHref} state={{ from: `${pathname}${search}` }} aria-label={`${OPEN_LABEL} canvas ${title}`}>{OPEN_LABEL}</Link>
        </Button>
      )}
    </div>
  );
}
