/**
 * @file legacy-redirect-targets.ts
 * @description P1545: where the old Letters URLs live now. Drafts and sent letters are both "Yours"; the
 * letter inbox is "Shared with you".
 */

export const ARTIFACTS_YOURS_LETTERS = '/artifacts?tab=yours&type=letters';
export const ARTIFACTS_SHARED = '/artifacts?tab=shared';

/** Where an old /letters?tab=… URL now lives. Anything unrecognised goes to the bare Artifacts page. */
export function legacyLettersTarget(search: string): string {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'drafts' || tab === 'sent') return ARTIFACTS_YOURS_LETTERS;
  if (tab === 'inbox') return ARTIFACTS_SHARED;
  return '/artifacts';
}
