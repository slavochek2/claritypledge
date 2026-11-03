export const REASON_ENV: string;
export const REFUSAL: string;
export function refuseHostedTestRun(options: {
  url: string | undefined;
  surface: 'dev-server' | 'playwright';
  argv?: string[];
  env?: Record<string, string | undefined>;
  stream?: { write(text: string): unknown };
}): void;
