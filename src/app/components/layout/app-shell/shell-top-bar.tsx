/**
 * @file shell-top-bar.tsx
 * @description P1512: the signed-in shell's top bar (Notion-style). One slim 56px bar at the top of the content
 * column, level with the sidebar logo, on desktop and phone.
 *
 *  - LEFT: a sub-page's Back ("← Groups", or "← Back"). A top-level destination leaves it empty.
 *  - RIGHT: a page-actions slot, empty unless a page supplies actions (ShellBarActions).
 *
 * Pages do not place anything in the bar by hand. `FocusHeader` and `ShellBarActions` render INTO these
 * slots through a portal when they are mounted inside the shell, so every page that already declares a
 * Back gets the one position with no edit. Outside the shell (signed out, rooms, /live, tests) there is no
 * provider value, `useShellBarSlot` says so, and they render where they are written, as before.
 *
 * The slots are the bar's own elements, held in state (callback refs) so the portals can target them.
 */
import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ShellBarContext, useShellBarSlot } from './shell-top-bar-context';

/** `enabled` is the layout's signedInShell: false means every consumer renders in place. */
export function ShellTopBarProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [left, setLeft] = useState<HTMLElement | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => (enabled ? { left, right, setLeft, setRight } : null),
    [enabled, left, right],
  );
  return <ShellBarContext.Provider value={value}>{children}</ShellBarContext.Provider>;
}

/** The bar itself. Rendered once by the layout, above the page. */
export function ShellTopBar() {
  const ctx = useContext(ShellBarContext);
  const setLeft = ctx?.setLeft;
  const setRight = ctx?.setRight;
  // Stable identities: a changing callback ref would detach and re-attach on every render.
  const leftRef = useCallback((el: HTMLElement | null) => setLeft?.(el), [setLeft]);
  const rightRef = useCallback((el: HTMLElement | null) => setRight?.(el), [setRight]);
  return (
    <div
      data-shell-top-bar
      className="flex h-14 items-center justify-between gap-3 px-4 lg:px-8"
    >
      <div ref={leftRef} className="flex min-w-0 items-center" />
      <div ref={rightRef} className="flex shrink-0 items-center gap-2" />
    </div>
  );
}

/** Portal `children` into a slot when inside the shell; otherwise render them in place. */
export function ShellBarPortal({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  const { inShell, el } = useShellBarSlot(side);
  if (!inShell) return <>{children}</>;
  return el ? createPortal(children, el) : null;
}

/** A page's actions for the bar's right slot. Nothing renders there unless a page uses this. */
export function ShellBarActions({ children }: { children: ReactNode }) {
  return <ShellBarPortal side="right">{children}</ShellBarPortal>;
}
