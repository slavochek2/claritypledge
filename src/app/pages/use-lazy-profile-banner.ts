import { useEffect, useRef } from 'react';

/** P1729 [FOUNDER DECISION: confirmation wording]: asked before Regenerate replaces a banner. */
export function confirmReplaceBanner(): boolean {
  return window.confirm('Replace your current banner with a new generated one?');
}

type LazyProfile = { id: string; bannerUrl?: string; bannerGenerationAttempted?: boolean } | null;
/** The useBanner state: the banner the page shows right now, and its generate action. */
type ShownBanner = { bannerUrl: string | null; handleRegenerate: () => Promise<void> };

/**
 * P504: generate a banner once for an owner whose profile has none and never had one attempted.
 * P1729: never when the page already shows a banner.
 */
export function useLazyProfileBanner(
  profile: LazyProfile,
  banner: ShownBanner,
  accessToken: string | undefined,
  currentUserId: string | undefined,
) {
  const shownBannerUrl = banner.bannerUrl;
  const generate = banner.handleRegenerate;
  // Keyed by profile id: moving from another profile to your own without a remount must still
  // generate your first banner (a plain boolean stayed true from the earlier profile).
  const triggeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (
      !profile ||
      triggeredFor.current === profile.id ||
      profile.bannerUrl ||
      shownBannerUrl ||
      profile.bannerGenerationAttempted ||
      !accessToken ||
      currentUserId !== profile.id
    ) return;
    triggeredFor.current = profile.id;
    generate();
  }, [profile, accessToken, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
}
