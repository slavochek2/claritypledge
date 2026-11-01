/**
 * @file CanvasThreadHeader.tsx
 * @description P1536: what a canvas thread puts in the thread header. The title says what the thread makes: "New canvas"
 * for a draft with no base version, "New version · <canvas title>" for an update, where the canvas title links to that
 * canvas's page. (The "…" Discard menu is gone with W0: Discard returns in the panel header.)
 */
import { Link } from 'react-router-dom';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import { canvasTitle } from '@/lib/canvas-boxes';
import { canvasPageHref } from './canvas-links';
import { NEW_CANVAS_TITLE, NEW_VERSION_TITLE } from './canvas-thread-copy';

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
