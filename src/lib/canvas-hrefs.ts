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
 * 3c X3: "Clone a version" from the mirror chat's + picks a version, navigates to it and then runs the same clone() decision as the Clone button, once the
 * version has loaded. The pick rides in the navigation's state (never the address, so nothing is bookmarked or shared) and is consumed once: the page strips it.
 */
export const CLONE_INTENT_KEY = 'cloneThisVersion';

export function hasCloneIntent(state: unknown): boolean {
  return !!state && typeof state === 'object' && (state as Record<string, unknown>)[CLONE_INTENT_KEY] === true;
}

/** The navigation state with the Clone intent removed (every other key, such as `from`, stays). */
export function withoutCloneIntent<T>(state: T): T {
  if (!hasCloneIntent(state)) return state;
  const { [CLONE_INTENT_KEY]: _consumed, ...rest } = state as Record<string, unknown>;
  return rest as T;
}
