// Types for test-target.mjs, so the TypeScript callers compile without an implicit any
// (same pattern as keyring.d.mts).
type Env = Record<string, string | undefined>;
export const TEST_PROJECT_REF: string;
export const TEST_PROJECT_REFS: readonly string[];
export const SELFHOSTED_TEST_REF: string;
export const SELFHOSTED_ENV: string;
export function selfHostedOrigin(env?: Env): { state: 'unset' } | { state: 'ok'; origin: string } | { state: 'malformed'; reason: string };
export function testTargetConfigError(env?: Env): string | null;
export function testOrigins(env?: Env): string[];
export function testRefForUrl(url: string | undefined, env?: Env): string | null;
export function isTestProjectUrl(url: string | undefined, env?: Env): boolean;
export function isHostedTestUrl(url: string | undefined, env?: Env): boolean;
