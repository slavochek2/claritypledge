import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { generateAIBannerResult, type BannerEntityType } from '@/app/prototypes/events/banner-utils';
import type { BannerCredit } from '@/lib/banner-credit';

interface UseBannerOptions {
  entityType: BannerEntityType;
  entityId: string;
  initialBannerUrl?: string | null;
  onSave: (bannerUrl: string | null) => Promise<void>;
  enableUnsplash?: boolean;
  /**
   * P1729: asked before Regenerate or Search replaces a banner that is already there. Return false to
   * cancel. Omitted = no confirmation (stories, events, points keep today's behaviour).
   */
  confirmReplace?: () => boolean;
}

interface UseBannerReturn {
  bannerUrl: string | null;
  /** P1453: credit returned by the last generation in this session (profiles only). */
  credit: BannerCredit | null;
  isLoading: boolean;
  showSearch: boolean;
  searchError: string;
  handleRegenerate: () => Promise<void>;
  handleRemove: () => Promise<void>;
  handleSearch: (keywords: string) => Promise<void>;
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Shared hook for banner state + actions.
 * Calls generateAIBannerResult from banner-utils and delegates persistence via onSave.
 */
export function useBanner({
  entityType,
  entityId,
  initialBannerUrl,
  onSave,
  confirmReplace,
}: UseBannerOptions): UseBannerReturn {
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl ?? null);
  // Sync when initialBannerUrl arrives async (e.g. after profile fetch on hard refresh)
  useEffect(() => {
    if (initialBannerUrl != null) {
      setBannerUrl(initialBannerUrl);
    }
  }, [initialBannerUrl]);
  const [credit, setCredit] = useState<BannerCredit | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchError, setSearchError] = useState('');

  const handleRegenerate = useCallback(async () => {
    if (isLoading) return;
    if (bannerUrl && confirmReplace && !confirmReplace()) return;
    setIsLoading(true);
    setSearchError('');

    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('You need to be signed in to generate banners');
        setIsLoading(false);
        return;
      }

      const result = await generateAIBannerResult(entityType, entityId, token);
      const newUrl = result?.url ?? null;

      if (newUrl) {
        setCredit(result?.credit ?? null);
        setBannerUrl(newUrl);
        await onSave(newUrl);
        setShowSearch(false);
      } else {
        // For stories/events, show search fallback; for profiles, do nothing (P510: controls are behind dropdown)
        if (entityType === 'story' || entityType === 'event') {
          setShowSearch(true);
        }
      }
    } catch {
      toast.error('Failed to generate banner');
    }

    setIsLoading(false);
  }, [isLoading, bannerUrl, confirmReplace, entityType, entityId, onSave]);

  const handleRemove = useCallback(async () => {
    if (isLoading) return;

    const previousUrl = bannerUrl;
    // Optimistic update
    setBannerUrl(null);

    try {
      await onSave(null);
      setShowSearch(false);
      setSearchError('');
    } catch {
      // Restore on error
      setBannerUrl(previousUrl);
      toast.error('Failed to remove banner');
    }
  }, [isLoading, bannerUrl, onSave]);

  const handleSearch = useCallback(
    async (keywords: string) => {
      if (isLoading || !keywords.trim()) return;
      if (bannerUrl && confirmReplace && !confirmReplace()) return;
      setIsLoading(true);
      setSearchError('');

      try {
        const token = await getAuthToken();
        if (!token) {
          toast.error('You need to be signed in to generate banners');
          setIsLoading(false);
          return;
        }

        const result = await generateAIBannerResult(entityType, entityId, token, keywords);
        const newUrl = result?.url ?? null;

        if (newUrl) {
          setCredit(result?.credit ?? null);
          setBannerUrl(newUrl);
          await onSave(newUrl);
          setShowSearch(false);
        } else {
          setSearchError("Couldn't generate a banner — try different keywords");
        }
      } catch {
        setSearchError("Couldn't generate a banner — try again later");
      }

      setIsLoading(false);
    },
    [isLoading, bannerUrl, confirmReplace, entityType, entityId, onSave],
  );

  return {
    bannerUrl,
    credit,
    isLoading,
    showSearch,
    searchError,
    handleRegenerate,
    handleRemove,
    handleSearch,
  };
}
