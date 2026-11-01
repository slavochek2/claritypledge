/**
 * @file discard-draft-landing.ts
 * @description P1536 W6: where the workspace goes after the owner's draft is discarded. A draft from vN returns the page to vN
 * (the published view: no ws=1). A canvas that was never published has no published view: it lands on Artifacts > Canvases > Drafts.
 * Pure.
 */
import { ARTIFACTS_CANVASES_DRAFTS, newestPublishedHref, publishedViewHref } from '@/lib/canvas-hrefs';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

/** W6: a never-published canvas has no published view; it lands on Artifacts > Canvases > Drafts. */
export const NEVER_PUBLISHED_TARGET = ARTIFACTS_CANVASES_DRAFTS;

export function discardLanding(args: { ownerSlug: string; canvasName: string; ready: Pick<CanvasReady, 'versions' | 'draft'> }): { href: string; published: boolean } {
  const { ownerSlug, canvasName, ready } = args;
  const published = ready.versions.filter(v => !v.draft && v.seq !== null);
  if (published.length === 0) return { href: NEVER_PUBLISHED_TARGET, published: false };
  const base = ready.draft?.baseSeq != null ? published.find(v => v.seq === ready.draft?.baseSeq) : undefined;
  return base ? { href: publishedViewHref(ownerSlug, canvasName, base.name), published: true } : { href: newestPublishedHref(ownerSlug, canvasName), published: true };
}
