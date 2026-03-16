import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { generateAIBanner, type BannerEntityType } from '@/app/prototypes/events/banner-utils';

interface UseBannerOptions {
  entityType: BannerEntityType;
  entityId: string;
  initialBannerUrl?: string | null;
  onSave: (bannerUrl: string | null) => Promise<void>;
  enableUnsplash?: boolean;
}

interface UseBannerReturn {
  bannerUrl: string | null;
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
 * Calls generateAIBanner from banner-utils and delegates persistence via onSave.
 */
export function useBanner({
  entityType,
  entityId,
  initialBannerUrl,
  onSave,
}: UseBannerOptions): UseBannerReturn {
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl ?? null);
  // Sync when initialBannerUrl arrives async (e.g. after profile fetch on hard refresh)
  useEffect(() => {
    if (initialBannerUrl != null) {
      setBannerUrl(initialBannerUrl);
    }
  }, [initialBannerUrl]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchError, setSearchError] = useState('');

  const handleRegenerate = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setSearchError('');

    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('You need to be signed in to generate banners');
        setIsLoading(false);
        return;
      }

      const newUrl = await generateAIBanner(entityType, entityId, token);

      if (newUrl) {
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
  }, [isLoading, entityType, entityId, onSave]);

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
      setIsLoading(true);
      setSearchError('');

      try {
        const token = await getAuthToken();
        if (!token) {
          toast.error('You need to be signed in to generate banners');
          setIsLoading(false);
          return;
        }

        const newUrl = await generateAIBanner(entityType, entityId, token, keywords);

        if (newUrl) {
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
    [isLoading, entityType, entityId, onSave],
  );

  return {
    bannerUrl,
    isLoading,
    showSearch,
    searchError,
    handleRegenerate,
    handleRemove,
    handleSearch,
  };
}
