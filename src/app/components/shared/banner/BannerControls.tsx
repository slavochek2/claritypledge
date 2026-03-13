import { useState, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface BannerControlsProps {
  onRegenerate: () => void;
  onRemove: () => void;
  isLoading: boolean;
  hasBanner: boolean;
  showSearch: boolean;
  onSearch: (keywords: string) => void;
  searchError?: string;
  defaultKeywords?: string;
}

/**
 * Owner controls overlay for banner regeneration/removal/search.
 * Position: absolute bottom-right, renders inside BannerDisplay children slot.
 */
export function BannerControls({
  onRegenerate,
  onRemove,
  isLoading,
  hasBanner,
  showSearch,
  onSearch,
  searchError,
  defaultKeywords,
}: BannerControlsProps) {
  const [keywords, setKeywords] = useState('');

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onSearch(keywords);
      }
      if (e.key === 'Escape') {
        setKeywords('');
      }
    },
    [keywords, onSearch],
  );

  const pillClass =
    'flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white rounded-full px-2 py-1 text-xs hover:bg-black/70 transition-colors disabled:opacity-50';

  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <button
          onClick={onRegenerate}
          disabled={isLoading}
          className={pillClass}
          aria-label="Generate new banner"
          aria-busy={isLoading}
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          New banner
        </button>
        {hasBanner && (
          <button
            onClick={onRemove}
            disabled={isLoading}
            className={pillClass}
            aria-label="Remove banner image"
          >
            <X className="w-3 h-3" />
            Remove banner
          </button>
        )}
      </div>
      {showSearch && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <input
              type="text"
              aria-label="Describe your banner"
              placeholder={defaultKeywords || 'Describe your banner'}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="bg-black/50 backdrop-blur-sm text-white placeholder-white/60 rounded-full px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-white/50 disabled:opacity-50 w-40"
            />
            <button
              onClick={() => onSearch(keywords)}
              disabled={isLoading || !keywords.trim()}
              className={pillClass}
              aria-label="Generate banner from description"
            >
              Search
            </button>
          </div>
          {searchError && (
            <p
              role="alert"
              className="text-xs text-white bg-black/50 backdrop-blur-sm rounded px-2 py-0.5"
            >
              {searchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
