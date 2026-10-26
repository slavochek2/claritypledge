/**
 * @file legacy-redirect-targets.ts
 * @description P1545: where the old Letters URLs live now. The Artifacts page is split by kind: drafts, sent letters and
 * the letter inbox are the lists Drafts, Sent and Received under its Letters tab. The same file names the in-app
 * addresses of those lists so no caller hard-codes the query string.
 */

export const ARTIFACTS_LETTERS_DRAFTS = '/artifacts?tab=letters&list=drafts';
export const ARTIFACTS_LETTERS_SENT = '/artifacts?tab=letters&list=sent';
export const ARTIFACTS_LETTERS_RECEIVED = '/artifacts?tab=letters&list=received';
export const ARTIFACTS_CANVASES_MINE = '/artifacts?tab=canvases';

/** Where an old /letters?tab=… URL now lives. Anything unrecognised goes to the bare Artifacts page. */
export function legacyLettersTarget(search: string): string {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'drafts') return ARTIFACTS_LETTERS_DRAFTS;
  if (tab === 'sent') return ARTIFACTS_LETTERS_SENT;
  if (tab === 'inbox') return ARTIFACTS_LETTERS_RECEIVED;
  return '/artifacts';
}
