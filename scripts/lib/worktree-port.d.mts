// Types for worktree-port.mjs, so vite.config.ts (tsconfig.node.json, no allowJs) and the
// P1480 test type-check without an implicit any.
export const CHROMIUM_RESTRICTED_PORTS: ReadonlySet<number>;
export const RESTRICTED_PORT_SHIFT: number;
export const MAIN_PORT: number;
/** "wN", "legacyN", a named worktree's directory name, or null for the main checkout. */
export function worktreeSlot(dir: string): string | null;
export function portForSlot(slot: string | null): number;
export function worktreePort(dir: string): number;
