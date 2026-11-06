/**
 * @file event-limit.ts
 * @description P1529 UAT round 1: the host's "limit on registrations" field, text in the form and a number (or none) in the
 * event. Empty or not a whole number of at least 1 means no limit.
 */
export function parseLimit(text: string): number | undefined {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** The edit form saves null to remove a limit, and a number to set one. */
export function limitForUpdate(text: string): number | null {
  return parseLimit(text) ?? null;
}
