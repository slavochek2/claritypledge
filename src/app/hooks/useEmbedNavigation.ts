import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Detects embed mode and provides navigation that opens links in new tabs
 * instead of navigating within the iframe.
 */
export function useEmbedNavigation() {
  const navigate = useNavigate();
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === 'true';

  const embedNavigate = useCallback((path: string) => {
    if (isEmbed) {
      window.open(`${window.location.origin}${path}`, '_blank');
    } else {
      navigate(path);
    }
  }, [isEmbed, navigate]);

  return { isEmbed, embedNavigate };
}
