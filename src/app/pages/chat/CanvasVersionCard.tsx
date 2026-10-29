/**
 * @file CanvasVersionCard.tsx
 * @description P1536: a canvas version attached to a message, drawn as the chat's shared-artifact card (icon disc, the
 * canvas title, one line): "v{seq} · date" for a published version, "Draft" for the owner's own draft. The root of an
 * update thread is the base version, so this is the card at the top of it. It links to the canvas page when it has an
 * address; inside a quote it is plain text, because a quote can itself be a button and links do not nest in buttons.
 */
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { FOCUS_RING, HOVER } from './chat-kit';
import { ARTIFACT_CARD, ARTIFACT_DISC } from './artifact-card-style';
import { cn } from '@/lib/utils';

export function CanvasVersionCard({ data, compact = false }: { data: CanvasVersionCardData; compact?: boolean }) {
  const title = data.title ?? 'Canvas';
  const body = (
    <>
      <span className={ARTIFACT_DISC} aria-hidden="true">
        <LayoutGrid className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{data.label}</span>
      </span>
    </>
  );
  if (!data.href || compact) return <div className={cn(ARTIFACT_CARD, 'min-h-14')} data-testid="attachment-canvas_version">{body}</div>;
  return (
    <Link to={data.href} className={cn(ARTIFACT_CARD, 'min-h-14', HOVER, FOCUS_RING)} data-testid="attachment-canvas_version" aria-label={`Open canvas ${title} ${data.label}`}>
      {body}
    </Link>
  );
}
