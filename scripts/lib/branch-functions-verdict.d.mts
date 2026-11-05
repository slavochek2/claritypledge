// Types for branch-functions-verdict.mjs (same pattern as test-target.d.mts).
type Env = Record<string, string | undefined>;
export type CheckState = 'none' | 'match' | 'differs' | 'unknown';
export function parseCheckResult(r: { status: number | null; stdout: string | undefined }): { state: CheckState; line: string; started: string; detail: string };
export function requireFlagOn(value: string | undefined): boolean;
export function functionsVerdict(a: {
  start: string | undefined; end: string | null | undefined; requireFlag: boolean;
  startStarted?: string; endStarted?: string; startHead?: string; endHead?: string;
}): { verdict: 'trusted' | 'not-applicable' | 'changed-during-run' | 'started-on-other-code'; action: 'pass' | 'warn' | 'fail'; message: string };
export function functionsSkipReason(a: { hasWebServer: boolean; env: Env; argv?: string[] }): string | null;
export function functionsLine(a: { verdict: string; start: string; end?: string | null }): string;
