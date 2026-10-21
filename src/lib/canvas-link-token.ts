/**
 * @file canvas-link-token.ts
 * @description P1515: the unguessable token of a canvas open to "anyone with the link" (`?k=` on arrival).
 *
 * The token is a capability, so it must not linger in the address bar, history, analytics or logs
 * (same reasoning as the /live room code, P1304, and the sign-in tokens, P1325). The page consumes it on
 * arrival into tab-scoped storage keyed by the canvas (the owner's handle and the canvas name), then
 * replaces the address without it. Reads, writes, refresh, Back and the Back-cache key use the stored
 * token. It is cleared when the signed-in person signs out or changes (an anonymous visitor who then
 * signs in keeps it, so they can carry on as the same person).
 */
import { useEffect, useRef } from 'react';

const PREFIX = 'canvas-link:';

/**
 * The store is the ONE place a token lives: a page reads it from here at the moment it needs it and keeps no copy of its
 * own. Clearing it is observable (a version that changes, and subscribers), so a mounted page that held the token for a
 * render or a request notices at once, even when no viewer id changed (a sign-out in another tab reaches an anonymous tab).
 */
let version = 0;
const listeners = new Set<() => void>();
export const subscribeLinkTokens = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const linkTokenVersion = (): number => version;
function notifyCleared(): void {
  version++;
  for (const listener of [...listeners]) listener();
}

/**
 * In-memory copy of the stored tokens, keyed like the storage. index.html's head script fills it BEFORE it strips the
 * address (and before it tries sessionStorage), so a blocked or full sessionStorage cannot lose the link: the address
 * no longer holds the token once it is stripped.
 */
type FallbackWindow = Window & { __canvasLinkTokenFallback?: Record<string, string>; __canvasLinkTokenLoadKeys?: string[] };
const fallback = (): Record<string, string> | undefined => (typeof window === 'undefined' ? undefined : (window as FallbackWindow).__canvasLinkTokenFallback);

/** The storage key for a canvas. index.html's head script builds the same key from the address; a test asserts the two agree. */
export const linkTokenStorageKey = (handle: string, name: string) => `${PREFIX}${handle.toLowerCase()}/${name.toLowerCase()}`;
const storageKey = linkTokenStorageKey;

/** The token a canvas address carries: `#k=<token>` (the form Copy link produces), or the older `?k=<token>`. */
export function linkTokenFromAddress(search: string, hash: string): string | undefined {
  return new URLSearchParams((hash || '').replace(/^#/, '')).get('k')
    || new URLSearchParams(search || '').get('k')
    || undefined;
}

export function storeLinkToken(handle: string, name: string, token: string): void {
  const key = storageKey(handle, name);
  if (typeof window !== 'undefined') {
    const w = window as FallbackWindow;
    (w.__canvasLinkTokenFallback ??= {})[key] = token; // always: storage may be blocked or full
    // This token arrived in THIS load (index.html's head script records its own the same way).
    const keys = (w.__canvasLinkTokenLoadKeys ??= []);
    if (!keys.includes(key)) keys.push(key);
  }
  try { sessionStorage.setItem(key, token); } catch { /* storage blocked: the in-memory copy above serves this load */ }
}

export function readLinkToken(handle: string, name: string): string | undefined {
  const key = storageKey(handle, name);
  // This load's own copy first: storage can still hold an OLDER token for the canvas when the new write failed (full
  // storage still reads fine), and the token that arrived in this load is the one the address carried.
  const mine = fallback()?.[key];
  if (mine) return mine;
  try {
    return sessionStorage.getItem(key) || undefined;
  } catch { return undefined; /* storage blocked */ }
}

/** Forget every stored canvas link token of this tab (storage and the in-memory copy). */
export function clearLinkTokens(): void {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch { /* nothing to clear in storage */ }
  if (typeof window !== 'undefined') {
    const w = window as FallbackWindow;
    w.__canvasLinkTokenFallback = {};
    w.__canvasLinkTokenLoadKeys = [];
  }
  notifyCleared();
}

/**
 * A boot-time SIGNED_OUT (an expired, unrefreshable session) in a tab that never held a live session in this load:
 * the token that arrived in THIS load (the head script, or the page for an in-app arrival) must survive, but tokens
 * left in the tab by EARLIER loads belong to whoever was signed in then, and must not be inherited by the next person
 * to sign in on this device. Clears every canvas-link entry, in storage and in memory, except this load's keys.
 */
export function clearLinkTokensExceptThisLoad(): void {
  if (typeof window === 'undefined') return;
  const w = window as FallbackWindow;
  const keep = new Set(w.__canvasLinkTokenLoadKeys ?? []);
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX) && !keep.has(key)) sessionStorage.removeItem(key);
  } catch { /* nothing to clear in storage */ }
  const memory = w.__canvasLinkTokenFallback ?? {};
  w.__canvasLinkTokenFallback = Object.fromEntries(Object.entries(memory).filter(([key]) => keep.has(key)));
  notifyCleared();
}

/**
 * Forget every stored link token when the signed-in person signs out or changes (an anonymous visitor who
 * signs in keeps theirs: the same person carries on). Mounted ONCE with the other auth-lifecycle resets
 * (App.tsx), not in the canvas page: a sign-out that happens while the page is not mounted must clear too.
 */
export function useClearLinkTokensOnAuthChange(viewerId: string | null | undefined): void {
  const previous = useRef<string | null | undefined>(viewerId);
  useEffect(() => {
    const was = previous.current;
    previous.current = viewerId;
    if (was && was !== viewerId) clearLinkTokens();
  }, [viewerId]);
}
