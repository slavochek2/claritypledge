/**
 * @file CanvasThreadHeader.tsx
 * @description P1536: what a canvas thread puts in the thread header. The title says what the thread makes: "New canvas"
 * for a draft with no base version, "New version · <canvas title>" for an update, where the canvas title links to that
 * canvas's page. The "…" menu holds "Discard draft" (after a question), the only way out of a draft that is not published.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import { canvasTitle } from '@/lib/canvas-boxes';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';
import { canvasPageHref } from './canvas-links';
import { DISCARD_LABEL, DRAFT_MENU_LABEL, NEW_CANVAS_TITLE, NEW_VERSION_TITLE } from './canvas-thread-copy';

export function CanvasThreadTitle({ draft, ownerSlug }: { draft: Pick<CanvasDraft, 'baseVersionId' | 'canvasName'>; ownerSlug: string | null | undefined }) {
  const update = draft.baseVersionId !== null;
  const href = update ? canvasPageHref(ownerSlug, draft.canvasName) : null;
  return (
    <h2 className="truncate text-base font-semibold text-foreground" data-testid="canvas-thread-title">
      {update ? NEW_VERSION_TITLE : NEW_CANVAS_TITLE}
      {update && draft.canvasName && (
        <>
          <span className="font-normal text-muted-foreground"> · </span>
          {href ? (
            <Link to={href} className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {canvasTitle(draft.canvasName)}
            </Link>
          ) : (
            canvasTitle(draft.canvasName)
          )}
        </>
      )}
    </h2>
  );
}

/** The question before a draft is thrown away. */
function DiscardDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>{DISCARD_LABEL}</DialogTitle>
          <DialogDescription>Discard this draft? This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            Keep draft
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Yes, discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The "…" button of the header. Only rendered while a discard is possible. */
export function CanvasDraftMenu({ onDiscard }: { onDiscard: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={DRAFT_MENU_LABEL} className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground', HOVER, FOCUS_RING)}>
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="min-h-10" onSelect={() => setAsking(true)}>
            {DISCARD_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {asking && <DiscardDialog onConfirm={onDiscard} onClose={() => setAsking(false)} />}
    </>
  );
}
