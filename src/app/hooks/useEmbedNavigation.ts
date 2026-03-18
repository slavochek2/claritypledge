import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Detects embed mode and provides navigation that opens links in new tabs
 * instead of navigating within the iframe.
 */
export function useEmbedNavigation() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const isEmbed = params.get('embed') === 'true';
  const isExpanded = isEmbed && params.get('expanded') === 'true';

  const embedNavigate = useCallback((path: string) => {
    if (isEmbed) {
      window.open(`${window.location.origin}${path}`, '_blank');
    } else {
      navigate(path);
    }
  }, [isEmbed, navigate]);

  return { isEmbed, isExpanded, embedNavigate };
}
