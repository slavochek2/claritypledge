/**
 * @file CanvasDraftCard.tsx
 * @description P1536: the card at the end of a canvas thread once a draft is made: the canvas title, then "v3 · Draft" (the
 * number the next published version will get), then Open (the draft's canvas page; an outline while Update draft is offered,
 * because that is the action then; never different because of what the owner is typing) and Publish
 * (always secondary). It sits after the mirror's reply, in the chat's shared-artifact card look, and is the only place
 * Publish lives.
 */
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canvasTitle } from '@/lib/canvas-boxes';
import { ARTIFACT_CARD, ARTIFACT_DISC } from './artifact-card-style';
import { DRAFT_TITLE_FALLBACK, OPEN_LABEL, PUBLISH_LABEL, draftLabel } from './canvas-thread-copy';
import { cn } from '@/lib/utils';

interface Props {
  /** The canvas's name, when it is known (shown as its title); else the card says "Your canvas". */
  canvasName: string | null;
  /** Where Open goes (the canvas page on the draft version), when it is known. The path is built from encoded segments by the service. */
  openPath: string | null;
  /** The number the next published version of this canvas gets (v1 for a first canvas), or null when it could not be read. */
  nextSeq?: number | null;
  /** "Update draft" is offered in the tray: it is the one primary now, so Open steps back to an outline (P955). */
  updating?: boolean;
  onPublish: () => void;
}

export function CanvasDraftCard({ canvasName, openPath, nextSeq = null, updating = false, onPublish }: Props) {
  const title = canvasName ? canvasTitle(canvasName) : DRAFT_TITLE_FALLBACK;
  return (
    <div className="mx-2 pb-2 pl-[3.375rem] pr-2 pt-1" data-testid="canvas-draft-card">
      <div className={cn(ARTIFACT_CARD, 'mt-0 flex-col items-stretch gap-2')}>
        <div className="flex items-center gap-3">
          <span className={ARTIFACT_DISC} aria-hidden="true">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{draftLabel(nextSeq)}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {openPath && (
            <Button asChild variant={updating ? 'outline' : 'default'} className="min-h-11">
              <Link to={openPath}>{OPEN_LABEL}</Link>
            </Button>
          )}
          <Button type="button" variant="outline" className="min-h-11" onClick={onPublish}>
            {PUBLISH_LABEL}
          </Button>
        </div>
      </div>
    </div>
  );
}
