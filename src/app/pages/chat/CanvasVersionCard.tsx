/**
 * @file CanvasVersionCard.tsx
 * @description P1536: a canvas version attached to a message, drawn as the chat's shared-artifact card (icon disc, the canvas title,
 * one line naming the state of its version: "v2 · Draft", "v2 · date · Published", "Discarded draft") with an Open button (W0/W4):
 * the one way from the mirror chat to the canvas. Open goes where the card's version resolves (an open draft: the workspace; a
 * published version: that version; see getCanvasVersionCard). Inside a quote it is plain text without a button, because a quote can
 * itself be a button and links do not nest in buttons. W4: inside the canvas workspace's own thread panel there is no Open (the canvas is
 * the other pane).
 */
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { ARTIFACT_CARD, ARTIFACT_DISC } from './artifact-card-style';
import { OPEN_LABEL, versionStateParts } from './canvas-thread-copy';
import { cn } from '@/lib/utils';
import { useCanvasWorkspace } from '@/app/components/canvas/canvas-workspace-context';

export function CanvasVersionCard({ data, compact = false }: { data: CanvasVersionCardData; compact?: boolean }) {
  const title = data.title ?? 'Canvas';
  const { lead, state } = versionStateParts(data);
  const { pathname, search } = useLocation();
  const { active: inWorkspace } = useCanvasWorkspace();
  return (
    <div className={cn(ARTIFACT_CARD, 'min-h-14')} data-testid="attachment-canvas_version" data-state={data.state}>
      <span className={ARTIFACT_DISC} aria-hidden="true">
        <LayoutGrid className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {/* W4: the state is always named. The identifying part ("v1 · Nov 1, 2026") is what truncates on a phone; the state never does. */}
        <span className="flex text-xs text-muted-foreground" data-testid="canvas-version-state">
          {lead && <span className="min-w-0 truncate" data-testid="canvas-version-state-lead">{lead}</span>}
          <span className="shrink-0 whitespace-pre" data-testid="canvas-version-state-name">{lead ? ' · ' : ''}{state}</span>
        </span>
      </span>
      {!compact && !inWorkspace && data.openHref && (
        // W7: Open is the canvas page's one secondary look.
        <Link to={data.openHref} state={{ from: `${pathname}${search}` }} aria-label={`${OPEN_LABEL} canvas ${title}`} className={CANVAS_SECONDARY_PILL}>{OPEN_LABEL}</Link>
      )}
    </div>
  );
}
