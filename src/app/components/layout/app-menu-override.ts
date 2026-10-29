/**
 * @file app-menu-override.ts
 * @description P1542 (founder, 2026-10-23): a page that sits on a route the app treats as a focus
 * screen (no bottom tabs, or the immersive preparation) can declare that THIS render of it is a
 * destination with the app menu back. The route rules (bottom-nav-routes.ts, immersive-letter-route.ts)
 * only see the URL, and the same URL serves two series: a Clarity Night's /confirm carries a pinned
 * Prepare now bar and keeps the tabs hidden, a Social Hike's /confirm has no bar and gets the menu.
 *
 * One module-level flag with a subscription: the layout and the BottomNav read it, the page sets it
 * while mounted. A .ts file so the hook and the store live outside a component file (Fast Refresh).
 */
import { useEffect, useSyncExternalStore } from 'react';

let declared = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** True while some mounted page has declared the app menu for itself. */
export function useAppMenuDeclared(): boolean {
  return useSyncExternalStore(subscribe, () => declared > 0, () => false);
}

/** Declare (while mounted and `on`) that this page shows the app menu even on a focus route. */
export function useDeclareAppMenu(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    declared += 1;
    emit();
    return () => { declared -= 1; emit(); };
  }, [on]);
}

// P1542 round 5b: a focused step inside the app menu (a hike's group terms) can hide the phone's "Today's event"
// strip above the tabs, so the terms and their pinned bar keep the screen. Same counter-and-subscribe shape as above.
let stripHidden = 0;
const stripListeners = new Set<() => void>();
function subscribeStrip(l: () => void) {
  stripListeners.add(l);
  return () => { stripListeners.delete(l); };
}
/** True while some mounted page asked to hide the phone's "Today's event" strip. */
export function useTodaysStripHidden(): boolean {
  return useSyncExternalStore(subscribeStrip, () => stripHidden > 0, () => false);
}
/** Hide (while mounted and `on`) the phone's "Today's event" strip above the bottom tabs. */
export function useHideTodaysStrip(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    stripHidden += 1;
    stripListeners.forEach((l) => l());
    return () => { stripHidden -= 1; stripListeners.forEach((l) => l()); };
  }, [on]);
}

/**
 * The layout's reading of both overrides, kept here so ClarityLandingLayoutInner (over its complexity limit) only
 * calls it. `chromeImmersive`: an immersive route whose page did NOT declare the app menu. `bottomNavRoute`: the
 * route shows the bottom tabs, or the page declared them. `todaysStripShown`: there is an event today and no page
 * hid its strip.
 */
export function useShellOverrides(immersiveRoute: boolean, bottomNavHiddenRoute: boolean, todaysEvent: unknown) {
  const appMenuDeclared = useAppMenuDeclared();
  const stripHiddenNow = useTodaysStripHidden();
  return {
    chromeImmersive: immersiveRoute && !appMenuDeclared,
    bottomNavRoute: appMenuDeclared || !bottomNavHiddenRoute,
    todaysStripShown: !!todaysEvent && !stripHiddenNow,
  };
}

/** Compact chrome (the room pages' own top bar, outside the shell): a compact page, unless a completed letter
 *  (`letterDone`) or the event room (`roomShell`, P1542: inside the shell like every signed-in page). */
export function keepsCompactChrome(compact: boolean | undefined, letterDone: boolean, roomShell: boolean | undefined): boolean {
  return !!compact && !letterDone && !roomShell;
}
