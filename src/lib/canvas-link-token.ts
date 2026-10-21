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
const PREFIX = 'canvas-link:';

const storageKey = (handle: string, name: string) => `${PREFIX}${handle.toLowerCase()}/${name.toLowerCase()}`;

export function storeLinkToken(handle: string, name: string, token: string): void {
  try { sessionStorage.setItem(storageKey(handle, name), token); } catch { /* storage blocked: the token then lives only in this load */ }
}

export function readLinkToken(handle: string, name: string): string | undefined {
  try { return sessionStorage.getItem(storageKey(handle, name)) || undefined; } catch { return undefined; }
}

/** Forget every stored canvas link token of this tab. */
export function clearLinkTokens(): void {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch { /* nothing to clear */ }
}
