/**
 * @file route-preload.ts
 * @description P1539: warm the route chunk of a sidebar destination on hover/focus so the click
 * finds it already downloaded. The dynamic imports name the same modules App.tsx lazy-loads, so the
 * bundler shares the chunk. Skipped when the visitor asked to save data or is on a slow link.
 * Failures are swallowed: this is a hint, and the real navigation still reports a chunk error.
 */
import type { ShellEntryId } from '@/app/components/layout/app-shell/shell-nav';

const LOADERS: Record<ShellEntryId, () => Promise<unknown>> = {
  home: () => import('@/app/pages/chat/ChatHomePage'),
  feed: () => import('@/app/pages/feed-page'),
  groups: () => import('@/app/pages/org-directory-page'),
  letters: () => import('@/app/pages/letters-page'),
  events: () => import('@/app/prototypes/events'),
  partners: () => import('@/app/pages/profile-connections-page'),
  profile: () => import('@/app/pages/profile-page-v2'),
};

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function shouldSkipPreload(): boolean {
  const c = (typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: ConnectionLike }).connection : undefined);
  return !!c && (c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
}

const warmed = new Set<ShellEntryId>();

export function preloadRouteChunk(id: ShellEntryId): void {
  if (warmed.has(id) || shouldSkipPreload()) return;
  warmed.add(id);
  LOADERS[id]().catch(() => warmed.delete(id));
}
