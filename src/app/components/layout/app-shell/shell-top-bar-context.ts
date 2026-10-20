/**
 * @file shell-top-bar-context.ts
 * @description P1512: the shell top bar's slot registry. Split from shell-top-bar.tsx so that file exports
 * components only (fast refresh). See shell-top-bar.tsx for the model.
 */
import { createContext, useContext } from 'react';

export interface ShellBarContextValue {
  left: HTMLElement | null;
  right: HTMLElement | null;
  setLeft: (el: HTMLElement | null) => void;
  setRight: (el: HTMLElement | null) => void;
}

/** null = not inside the signed-in shell: every consumer renders where it is written. */
export const ShellBarContext = createContext<ShellBarContextValue | null>(null);

/**
 * Where should this content go? `inShell: false` means "render it where it is written".
 * `el: null` with `inShell: true` means the bar has not attached yet (first commit): render nothing,
 * so there is no flash of the content in the page body before it moves.
 */
export function useShellBarSlot(side: 'left' | 'right'): { inShell: boolean; el: HTMLElement | null } {
  const ctx = useContext(ShellBarContext);
  if (!ctx) return { inShell: false, el: null };
  return { inShell: true, el: side === 'left' ? ctx.left : ctx.right };
}
