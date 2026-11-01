/**
 * @file canvas-state-tag.tsx
 * @description W4: the state of what is on screen, in words, named once: `Draft`, `Published`, or (a pending Clone, nothing written yet)
 * `New draft from vN`. A draft made from a published version adds where it came from (D8): `Draft · from v2` (that tail gives way on a phone, where the
 * version picker beside it already shows a number). A canvas with nothing published and no draft says nothing (its own line says so).
 */
import { isViewingDraft, type CanvasReady } from './canvas-page-data';

const TAG = 'min-w-0 truncate text-sm font-medium text-foreground/70';

export function CanvasStateTag({ ready, cloneSeq }: { ready: CanvasReady; cloneSeq: number | null }) {
  if (isViewingDraft(ready)) {
    const from = ready.draft?.baseSeq ?? null;
    return (
      <span className={`${TAG} shrink-0`} data-testid="canvas-state">
        Draft{from !== null && <span className="max-sm:hidden"> · from v{from}</span>}
      </span>
    );
  }
  if (cloneSeq !== null) return <span className={TAG} title={`New draft from v${cloneSeq}`} data-testid="canvas-clone-state">New draft from v{cloneSeq}</span>;
  if (ready.publishedNone) return null;
  // On a phone the Publish spot beside it already says "Published · vN": the tag would only repeat it (from 640px the tag stays).
  return <span className={`${TAG} shrink-0 max-sm:hidden`} data-testid="canvas-state">Published</span>;
}
