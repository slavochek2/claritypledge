/**
 * @file canvas-hrefs.ts
 * @description P1536 W0/W1: the in-app addresses of the owner's canvas workspace and of a published version, in one place. Every
 * segment is encoded, so each result is a plain in-app path by construction. Pure.
 */
import { canvasPath } from '@/lib/canvas-boxes';

/** Artifacts > Canvases: where an owner lands when there is no canvas page to go to. */
export const ARTIFACTS_CANVASES_MINE = '/artifacts?tab=canvases';
/** Artifacts > Canvases > Drafts (W5): my canvases with an open draft. Where a never-published canvas lands once its draft is discarded (W6). */
export const ARTIFACTS_CANVASES_DRAFTS = '/artifacts?tab=canvases&list=drafts';

/** The workspace on a draft: the canvas page on the draft's version with the workspace marker (`ws=1`). Every segment is encoded. */
export function workspaceHref(ownerSlug: string, canvasName: string, versionName: string | null): string {
  return `${canvasPath(encodeURIComponent(ownerSlug), canvasName)}?${versionName ? `v=${encodeURIComponent(versionName)}&` : ''}ws=1`;
}

/** A published version, plain: no workspace marker, no thread. */
export function publishedViewHref(ownerSlug: string, canvasName: string, versionName: string): string {
  return `${canvasPath(encodeURIComponent(ownerSlug), canvasName)}?v=${encodeURIComponent(versionName)}`;
}

/** The canvas page at its newest published version (no `?v=`). */
export function newestPublishedHref(ownerSlug: string, canvasName: string): string {
  return canvasPath(encodeURIComponent(ownerSlug), canvasName);
}

/**
 * Where an old canvas-thread address (a chat thread whose root is a canvas version) goes, by the state of the thread's draft:
 *  - open draft: the workspace on it;  published: that version, plain;
 *  - discarded: the canvas page at its newest published version, or Artifacts when nothing was ever published.
 * Null when the draft's names cannot be read: the caller leaves the thread as it is.
 */
export function retiredThreadTarget(args: {
  ownerSlug: string;
  draft: { state: 'open' | 'published' | 'discarded'; canvasName: string | null; versionName: string | null };
  hasPublished: boolean;
  artifactsHref?: string;
}): string | null {
  const { ownerSlug, draft, hasPublished, artifactsHref = ARTIFACTS_CANVASES_MINE } = args;
  if (!draft.canvasName) return null;
  if (draft.state === 'discarded') return hasPublished ? newestPublishedHref(ownerSlug, draft.canvasName) : artifactsHref;
  if (!draft.versionName) return null;
  return draft.state === 'open' ? workspaceHref(ownerSlug, draft.canvasName, draft.versionName) : publishedViewHref(ownerSlug, draft.canvasName, draft.versionName);
}
