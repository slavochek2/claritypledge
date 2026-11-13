export const DEFAULT_CEILING: number;
export interface PsRow {
  pid: number;
  ppid: number;
  tty: string;
  args: string;
}
export function parsePs(text: string): PsRow[];
export function isCoordinator(row: PsRow): boolean;
export function isProbableWatch(row: PsRow): boolean;
export function countOthers(rows: PsRow[], selfPid: number): number;
export function scanLooksValid(rows: PsRow[], selfPid: number): boolean;
export function resolveBudget(envValue: string | undefined, cores: number): { value: number; warning?: string };
export function resolveCeiling(value: number | string | undefined, dflt?: number): { value: number; warning?: string };
export function computeShare(input: { others: number; budget: number; ceiling: number }): number;
export function configShouldSize(env: Record<string, string | undefined>, argv: string[]): boolean;
export function invalidMaxWorkersEnv(env: Record<string, string | undefined>): boolean;
export function dropInvalidMaxWorkersEnv(
  env: Record<string, string | undefined>,
  warn?: (s: string) => void,
): string | null;
export function readPsText(env?: Record<string, string | undefined>): string;
export function sizeTestWorkers(opts?: {
  ceiling?: number | string;
  env?: Record<string, string | undefined>;
  pid?: number;
  psText?: string;
  requireSelfRow?: boolean;
  write?: (s: string) => void;
  cores?: number;
}): number;
