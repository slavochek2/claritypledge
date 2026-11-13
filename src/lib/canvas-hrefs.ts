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

/** P1529: the preparation step the canvas was started from (`prepStep` in the navigation state), for the banner's "Step N of M"; null when absent or not whole numbers. */
export interface PrepStep { step: number; total: number }
export function prepStepOf(state: unknown): PrepStep | null {
  const v = (state as { prepStep?: Partial<PrepStep> } | null)?.prepStep;
  const step = v?.step, total = v?.total;
  return typeof step === 'number' && typeof total === 'number' && Number.isInteger(step) && Number.isInteger(total) && step >= 1 && total >= step ? { step, total } : null;
}

/** A same-origin app path ("/x", never "//host" or "/\host"); otherwise null. */
function appPath(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : null;
}

/** P1529: the navigation state's `afterPublish` when it is a same-origin app path; otherwise null. */
export function afterPublishPath(state: unknown): string | null {
  return appPath((state as { afterPublish?: unknown } | null)?.afterPublish);
}

/** P1529: the event whose room started this canvas (`afterPublishEvent`): Publish then offers to share the canvas with it. */
export function afterPublishEventOf(state: unknown): string | null {
  const v = (state as { afterPublishEvent?: unknown } | null)?.afterPublishEvent;
  return typeof v === 'string' && v ? v : tableEventOf(state);
}

/** P1529: a canvas opened from the event room's round card or waiting list carries the room's path (`backToTable`) and the event's id (`tableEvent`), so the canvas page can offer "Back to your table". */
export function tableLinkState(roomPath: string, eventId: string): { backToTable: string; tableEvent: string } {
  return { backToTable: roomPath, tableEvent: eventId };
}

/** P1529 J2: the owner's own canvas opened from the event (their next-version card, "Open your canvas") opens plain: the state still carries the way back to the table, but the page never opens it in Compare. */
export function plainCanvasState(state: unknown): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? state as Record<string, unknown> : {}), plainCanvas: true };
}

export function isPlainCanvas(state: unknown): boolean {
  return !!state && typeof state === 'object' && (state as Record<string, unknown>).plainCanvas === true;
}

/** P1529: the room path in the navigation state's `backToTable` when it is a same-origin app path; otherwise null. */
export function backToTablePath(state: unknown): string | null {
  return appPath((state as { backToTable?: unknown } | null)?.backToTable);
}

/** P1529: the event the table belongs to (`tableEvent`), a string or null. */
export function tableEventOf(state: unknown): string | null {
  const v = (state as { tableEvent?: unknown } | null)?.tableEvent;
  return typeof v === 'string' && v ? v : null;
}
