export const REFUSED_ENV: string;
type Run = (cmd: string, args: string[], opts: { encoding: 'utf8' }) => { status: number | null; stdout?: string; stderr?: string; error?: Error };
export function testLaneOverrides(repoRoot: string, env?: NodeJS.ProcessEnv, run?: Run): Record<string, string>;
export function applyTestLaneEnv(repoRoot: string, env?: NodeJS.ProcessEnv, run?: Run, options?: { throwOnRefusal?: boolean }): Record<string, string>;
