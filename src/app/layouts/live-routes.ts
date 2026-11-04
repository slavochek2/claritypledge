/**
 * @file live-routes.ts
 * @description Which routes draw their own full-screen chrome. Two kinds, split on purpose (P1604, founder 2026-11-04):
 *   - /live (and /live/:code): a deliberately immersive two-person session. It keeps its own top bar and never gets the
 *     signed-in shell.
 *   - /transcribe (and /transcribe/:code): a page with its own sticky header and a fixed-height room, but NOT immersive. A
 *     signed-in person gets the same sidebar shell as everywhere else (the top menu was an accident of P1149 folding it into
 *     the /live gates). It still takes every "own sticky header, fixed height, no footer" gate /live takes.
 */

const under = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

export interface LiveRouteKinds {
  /** /live*: immersive; never inside the shell. */
  live: boolean;
  /** /transcribe*: fixed-height page with its own header, inside the shell. */
  transcribe: boolean;
  /** Either: takes the fixed-height, own-header, no-footer gates. */
  fixedHeight: boolean;
}

export function liveRouteKinds(pathname: string): LiveRouteKinds {
  const live = under(pathname, '/live');
  const transcribe = under(pathname, '/transcribe');
  return { live, transcribe, fixedHeight: live || transcribe };
}
