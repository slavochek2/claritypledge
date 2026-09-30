/**
 * @file offline-reads-letters.ts
 * @description P1369 Scope v2: the letter reads shared by the letter pages and the offline pack
 * (see offline-reads.ts for the pattern). Separate from offline-reads.ts because App.tsx's
 * LetterRoute imports it, and the app shell must not pull in the list services.
 */
import { getLetterForPublicReading, resolveLetterShortcode } from '@/app/data/letters-service';
import { letterShortCodes } from '@/app/data/short-links';
import type { OfflineRead } from '@/app/data/offline-reads';

// ─── letters ─────────────────────────────────────────────────────────────────

/** The sender whose sealed letters `/letter/<stN>` resolves to (App.tsx LetterRoute). */
export const LETTER_FOUNDER_SLUG = 'slava';

/** `/letter/<code>` → letter id. Local aliases first, as LetterRoute does. */
export function letterCodeRead(code: string): OfflineRead<string> {
  const lower = code.toLowerCase();
  return {
    type: 'letter-code',
    id: lower,
    fetch: async () => letterShortCodes[lower] ?? (await resolveLetterShortcode(code, LETTER_FOUNDER_SLUG)),
  };
}

export type PublicLetter = NonNullable<Awaited<ReturnType<typeof getLetterForPublicReading>>>;

/** A one-to-many letter as the public reading path loads it (no delivery, no personal rows). */
export function publicLetterRead(letterId: string): OfflineRead<PublicLetter> {
  return {
    type: 'letter',
    id: letterId,
    fetch: () => getLetterForPublicReading(letterId),
  };
}
