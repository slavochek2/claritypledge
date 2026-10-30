// Types for series-reviews-core.mjs (imported by its unit test).
export function asStoredQuote(words: string | null | undefined): string;
export function consentProblem(db: unknown, r: Record<string, unknown>): Promise<string | null>;
export function moderate(db: unknown, id: string, cmd: 'approve' | 'reject'): Promise<{ code: number; out?: string; err?: string; row?: Record<string, unknown> }>;
