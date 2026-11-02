import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES, type TermsChangeSummary } from '@/app/content/terms-changes';

export interface TermsPrompt {
  mode: 'notice' | 'block';
  /** Older versions this person never agreed to that needed fresh consent; shown with the current one. */
  missed: TermsChangeSummary[];
}

/**
 * How to tell someone behind on terms. The current version alone is not enough: a person who skipped
 * a version that needed consent must still give it, even when the current one is only a notice.
 * TERMS_CHANGES is newest first. An unknown or empty version counts as having seen none of them.
 */
export function termsPrompt(acceptedVersion: string | null | undefined): TermsPrompt {
  const versions = Object.keys(TERMS_CHANGES);
  const acceptedAt = acceptedVersion ? versions.indexOf(acceptedVersion) : -1;
  const unseen = acceptedAt >= 0 ? versions.slice(0, acceptedAt) : versions;
  const missed = unseen
    .filter((v) => v !== CURRENT_TERMS_VERSION)
    .map((v) => TERMS_CHANGES[v])
    .filter((entry) => entry.requiresConsent);
  // A version with no summary entry also blocks: the safe side when nobody decided.
  const noticeOnly = TERMS_CHANGES[CURRENT_TERMS_VERSION]?.requiresConsent === false && missed.length === 0;
  return { mode: noticeOnly ? 'notice' : 'block', missed };
}
