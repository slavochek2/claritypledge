/**
 * @file CanvasVersionCard.tsx
 * @description P1536: a canvas version attached to a message, drawn as the chat's shared-artifact card (icon disc, the canvas title, one line naming
 * the state of its thread) with the one button that goes to it. 3c X10: the state is the THREAD'S draft's, never the attached version's:
 *  - open:      the (Draft) tag, `v2`, **Open draft** (the workspace);
 *  - published: `v2 · date` (the version the draft became) with no state word (X5), **View** (that version, plain, no `ws=1`);
 *  - discarded: "Discarded draft", no button.
 * Inside a quote it is plain text without a button, because a quote can itself be a button and links do not nest in buttons. Inside the canvas
 * workspace's own thread panel there is no button either (the canvas is the other pane).
 */
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { ARTIFACT_CARD, ARTIFACT_DISC } from './artifact-card-style';
import { CanvasDraftTag } from '@/app/components/canvas/canvas-draft-tag';
import { cardButtonLabel, versionStateParts } from './canvas-thread-copy';
import { cn } from '@/lib/utils';
import { useCanvasWorkspace } from '@/app/components/canvas/canvas-workspace-context';

export function CanvasVersionCard({ data, compact = false }: { data: CanvasVersionCardData; compact?: boolean }) {
  const title = data.title ?? 'Canvas';
  const { lead, tag, state } = versionStateParts(data);
  const button = cardButtonLabel(data.state);
  const { pathname, search } = useLocation();
  const { active: inWorkspace } = useCanvasWorkspace();
  return (
    <div className={cn(ARTIFACT_CARD, 'min-h-14')} data-testid="attachment-canvas_version" data-state={data.state}>
      <span className={ARTIFACT_DISC} aria-hidden="true">
        <LayoutGrid className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {/* X10: an open draft is the (Draft) tag and its number; a published card is its number and date, with no word; a discarded one says so. The tag never truncates, the identifying part does. */}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="canvas-version-state">
          {tag && <CanvasDraftTag />}
          {lead && <span className="min-w-0 truncate" data-testid="canvas-version-state-lead">{lead}</span>}
          {state && <span className="shrink-0 whitespace-pre" data-testid="canvas-version-state-name">{state}</span>}
        </span>
      </span>
      {!compact && !inWorkspace && button && data.openHref && (
        // W7: the button is the canvas page's one secondary look.
        <Link to={data.openHref} state={{ from: `${pathname}${search}` }} aria-label={`${button} canvas ${title}`} className={CANVAS_SECONDARY_PILL}>{button}</Link>
      )}
    </div>
  );
}
