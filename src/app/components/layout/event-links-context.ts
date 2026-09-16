/**
 * @file event-links-context.ts
 * @description P1323: the Links menu's context and the one hook a page uses to settle where
 * the single trigger goes.
 *
 * SEPARATE FROM event-links-menu.tsx ON PURPOSE. That file exports components; this one
 * exports a context and a hook. Mixing them breaks React Fast Refresh
 * (`react-refresh/only-export-components`, which this repo lints as an error), and the
 * warning is real: an edit to the menu would stop hot-reloading cleanly.
 */
import { createContext, useContext, useEffect } from 'react';
import type { LinksMenuEntry } from '@/app/data/event-links';

export type TriggerOverride = 'adopt' | 'decline' | null;

export const EventLinksContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
  entries: LinksMenuEntry[];
  go: (entry: LinksMenuEntry) => void;
  /** See `useLinksTriggerOverride`. */
  override: TriggerOverride;
  setOverride: (v: TriggerOverride) => void;
} | null>(null);

/**
 * P1323: how a page that draws its OWN sticky header over the nav settles where the single
 * Links trigger goes — from inside the page, where its sub-state is visible.
 *
 * The problem this exists for: `clarity-landing-layout.tsx`'s nav guard is
 * `!hasOwnNavigation && !isImmersiveLetterRoute` — `isLivePage` is NOT in it. So on
 * `/transcribe/:code` and `/live/:code` the nav still MOUNTS; the page's sticky bar merely
 * covers it. Naively adding a second trigger to such a page header puts two identical
 * `data-testid="event-links-button"` nodes in the DOM — the exact strict-mode locator
 * violation that broke e2e/p1179-links-menu.spec.ts in 2026-08-28.
 *
 *   - `adopt`   — the nav's trigger renders null and the PAGE's renders instead. Still one.
 *   - `decline` — no trigger anywhere on this view.
 *   - `null`    — the nav serves this page normally (the default; no declaration needed).
 *
 * A route-level prop cannot express either: `/live` and `/live/:code` render the SAME
 * component inside the SAME bare layout (App.tsx:827, 839), so nothing at the route level
 * distinguishes the lobby from a running two-party session.
 */
export function useLinksTriggerOverride(mode: TriggerOverride) {
  const ctx = useContext(EventLinksContext);
  const setOverride = ctx?.setOverride;
  useEffect(() => {
    if (!setOverride) return;
    setOverride(mode);
    // Restore on unmount so leaving the room hands the trigger back to the nav.
    return () => setOverride(null);
  }, [setOverride, mode]);
}
