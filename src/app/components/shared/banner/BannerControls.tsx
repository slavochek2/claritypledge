import { useState, useCallback, useRef, useEffect } from 'react';
import { Pencil, RefreshCw, Trash2, Search, Share2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface BannerControlsProps {
  onRegenerate: () => void;
  onRemove: () => void;
  isLoading: boolean;
  hasBanner: boolean;
  showSearch: boolean;
  onSearch: (keywords: string) => void;
  searchError?: string;
  defaultKeywords?: string;
  /** P510: Use minimal pencil icon + dropdown instead of always-visible pills */
  variant?: 'pills' | 'minimal';
  /** Optional share callback — renders share icon to the right of controls */
  onShare?: () => void;
}

/**
 * Owner controls overlay for banner regeneration/removal/search.
 *
 * variant="pills" (default): legacy always-visible pill buttons (stories, points, events)
 * variant="minimal" (P510): pencil icon → DropdownMenu (profiles)
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
  variant = 'pills',
  onShare,
}: BannerControlsProps) {
  if (variant === 'minimal') {
    return (
      <MinimalBannerControls
        onRegenerate={onRegenerate}
        onRemove={onRemove}
        isLoading={isLoading}
        hasBanner={hasBanner}
        onSearch={onSearch}
        searchError={searchError}
        defaultKeywords={defaultKeywords}
        onShare={onShare}
      />
    );
  }

  return (
    <PillBannerControls
      onRegenerate={onRegenerate}
      onRemove={onRemove}
      isLoading={isLoading}
      hasBanner={hasBanner}
      showSearch={showSearch}
      onSearch={onSearch}
      searchError={searchError}
      defaultKeywords={defaultKeywords}
    />
  );
}

// ── Legacy pill controls (stories, points, events) ──────────────────────────

interface PillControlsProps {
  onRegenerate: () => void;
  onRemove: () => void;
  isLoading: boolean;
  hasBanner: boolean;
  showSearch: boolean;
  onSearch: (keywords: string) => void;
  searchError?: string;
  defaultKeywords?: string;
}

function PillBannerControls({
  onRegenerate,
  onRemove,
  isLoading,
  hasBanner,
  showSearch,
  onSearch,
  searchError,
  defaultKeywords,
}: PillControlsProps) {
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
            <Trash2 className="w-3 h-3" />
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
              className="bg-black/50 backdrop-blur-sm text-white placeholder-white/60 rounded-full px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-white/50 disabled:opacity-50 w-40"
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

// ── Minimal pencil icon + dropdown (P510: profiles) ─────────────────────────

interface MinimalControlsProps {
  onRegenerate: () => void;
  onRemove: () => void;
  isLoading: boolean;
  hasBanner: boolean;
  onSearch: (keywords: string) => void;
  searchError?: string;
  defaultKeywords?: string;
  onShare?: () => void;
}

function MinimalBannerControls({
  onRegenerate,
  onRemove,
  isLoading,
  hasBanner,
  onSearch,
  searchError,
  defaultKeywords,
  onShare,
}: MinimalControlsProps) {
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [keywords, setKeywords] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const wasLoadingRef = useRef(false);

  // Auto-focus search input when it appears
  useEffect(() => {
    if (showSearchInput && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearchInput]);

  // Auto-dismiss search input after successful generation
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && !searchError) {
      setShowSearchInput(false);
      setKeywords('');
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, searchError]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && keywords.trim()) {
        onSearch(keywords);
      }
      if (e.key === 'Escape') {
        setShowSearchInput(false);
        setKeywords('');
        // Return focus to pencil icon
        pencilRef.current?.focus();
      }
    },
    [keywords, onSearch],
  );

  const handleDescribeClick = useCallback(() => {
    setShowSearchInput(true);
  }, []);

  const handleNewBanner = useCallback(() => {
    onRegenerate();
  }, [onRegenerate]);

  const handleRemove = useCallback(() => {
    onRemove();
  }, [onRemove]);

  const pillClass =
    'rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors';

  return (
    <div className="absolute top-2 right-2 md:top-3 md:right-3 flex flex-col items-end gap-1 z-10">
      <div className="flex items-center gap-1">
        {isLoading ? (
          /* Loading state: spinning RefreshCw replaces pencil */
          <div
            className={`p-2 ${pillClass} cursor-default`}
            aria-label="Generating banner"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          /* Pencil icon with dropdown */
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={pencilRef}
                className={`p-2 ${pillClass}`}
                aria-label="Banner options"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleNewBanner}>
                <RefreshCw className="w-4 h-4 mr-2" />
                New banner
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDescribeClick}>
                <Search className="w-4 h-4 mr-2" />
                Describe your banner...
              </DropdownMenuItem>
              {hasBanner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleRemove}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove banner
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {onShare && (
          <button
            onClick={onShare}
            className={`p-2 ${pillClass}`}
            aria-label="Share profile"
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search input — shown only after clicking "Describe your banner..." */}
      {showSearchInput && !isLoading && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Describe your banner"
              placeholder={defaultKeywords || 'Describe your banner'}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              disabled={isLoading}
              className="bg-black/50 backdrop-blur-sm text-white placeholder-white/60 rounded-full px-3 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-white/50 disabled:opacity-50 w-[180px] md:w-[200px]"
            />
            <button
              onClick={() => {
                if (keywords.trim()) onSearch(keywords);
              }}
              disabled={isLoading || !keywords.trim()}
              className={`p-2 ${pillClass} disabled:opacity-50`}
              aria-label="Generate banner from description"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {searchError && (
            <p
              role="alert"
              className="text-xs text-white bg-red-500/70 rounded px-2 py-0.5"
            >
              {searchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
