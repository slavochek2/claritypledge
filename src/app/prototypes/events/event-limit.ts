/**
 * @file event-limit.ts
 * @description P1529 UAT round 1: the host's "limit on registrations" field, text in the form and a number (or none) in the
 * event. Empty or not a whole number of at least 1 means no limit.
 */
export function parseLimit(text: string): number | undefined {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** [FOUNDER DECISION: copy] Shown under the field and blocking submit. Only an empty field means no limit. */
export const LIMIT_INVALID_LINE = 'Enter a whole number of 1 or more, or leave it empty for no limit.';

/** The message for a non-empty value that is not a whole number of at least 1; null when the field is empty or valid. */
export function limitError(text: string): string | null {
  return text.trim() === '' || parseLimit(text) !== undefined ? null : LIMIT_INVALID_LINE;
}

/** The edit form saves null to remove a limit, and a number to set one. */
export function limitForUpdate(text: string): number | null {
  return parseLimit(text) ?? null;
}
