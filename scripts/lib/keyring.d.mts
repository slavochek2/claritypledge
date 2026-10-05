// Types for keyring.mjs, so TypeScript callers that reach the app's type check (P1417's
// scripts/event-banner-small.ts, imported by its tests) compile without an implicit any.
/** Read one critical key. Triggers the OS authorization dialog; throws if declined. */
export function keyringGet(key: string, reason?: string): string;
/** Read several keys. Each one prompts separately. */
export function keyringRequire(...keys: string[]): Record<string, string>;
