// Types for branch-functions-verdict.mjs (same pattern as test-target.d.mts).
type Env = Record<string, string | undefined>;
export type CheckState = 'none' | 'match' | 'differs' | 'unknown';
export function parseCheckResult(r: { status: number | null; stdout: string | undefined }): { state: CheckState; line: string };
export function functionsVerdict(a: { start: string | undefined; end: string | null | undefined; requireFlag: boolean }):
  { verdict: 'trusted' | 'changed-during-run' | 'started-on-other-code'; action: 'pass' | 'warn' | 'fail'; message: string };
export function functionsSkipReason(a: { hasWebServer: boolean; env: Env; argv?: string[] }): string | null;
export function functionsLine(a: { verdict: string; start: string; end?: string | null }): string;
