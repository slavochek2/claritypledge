/**
 * P1536: the in-app address of a canvas's own page for a canvas thread's header. The owner's slug and the canvas name come
 * from the database, so each is encoded into the path, and the result must still be a canvas path before it is a link
 * (anything else is shown as plain text).
 */
import { canvasPath, isCanvasPathname } from '@/lib/canvas-boxes';

export function canvasPageHref(ownerSlug: string | null | undefined, canvasName: string | null): string | null {
  if (!ownerSlug || !canvasName) return null;
  const path = canvasPath(encodeURIComponent(ownerSlug), canvasName);
  return isCanvasPathname(path) ? path : null;
}

/**
 * The canvas page's address with the thread it was opened from, `thread=<rootId>`, so the canvas page can show that
 * thread beside the canvas on a wide screen. Any `thread` param already there is replaced, and the other params (the
 * draft version's `?v=`) stay as they are.
 */
export function withThreadParam(path: string, rootId: string): string {
  const [pathname = '', query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('thread', rootId);
  return `${pathname}?${params.toString()}`;
}
