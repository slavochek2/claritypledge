/**
 * P1536: the in-app address of a canvas's own page for a canvas thread's header. The owner's slug and the canvas name come
 * from the database, so each is encoded into the path, and the result must still be a canvas path before it is a link
 * (anything else is shown as plain text).
 */
import { canvasPath, isCanvasPathname } from '@/lib/canvas-boxes';
export { newestPublishedHref, publishedViewHref, retiredThreadTarget, workspaceHref } from '@/lib/canvas-hrefs';

export function canvasPageHref(ownerSlug: string | null | undefined, canvasName: string | null): string | null {
  if (!ownerSlug || !canvasName) return null;
  const path = canvasPath(encodeURIComponent(ownerSlug), canvasName);
  return isCanvasPathname(path) ? path : null;
}
