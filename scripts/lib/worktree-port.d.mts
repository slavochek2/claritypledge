// Types for worktree-port.mjs, so vite.config.ts (tsconfig.node.json, no allowJs) and the
// P1480 test type-check without an implicit any.
export const CHROMIUM_RESTRICTED_PORTS: ReadonlySet<number>;
export const RESTRICTED_PORT_SHIFT: number;
export const MAIN_PORT: number;
export const MAX_SLOT: number;
export const MAC_RESERVED_PORTS: ReadonlySet<number>;
export const LOADTEST_MAX_LEVEL: number;
/** Sorted `http://localhost:<port>` for main and w1..MAX_SLOT (after shifts). */
export function slotOrigins(): string[];
/** Sorted unique origins: slots, named range, and their E2E load-test ports. */
export function devOrigins(): string[];
/** Full text of supabase/functions/_shared/dev-origins.ts. */
export function devOriginsTs(): string;
/** "wN", "legacyN", a named worktree's directory name, or null for the main checkout. */
export function worktreeSlot(dir: string): string | null;
export function portForSlot(slot: string | null): number;
export function worktreePort(dir: string): number;
