import { useState, type ReactNode } from 'react';

interface BannerDisplayProps {
  bannerUrl?: string | null;
  fallbackColor?: string;
  altText: string;
  className?: string;
  /** Override the default h-48 md:h-64 height classes */
  heightClassName?: string;
  /** Tailwind gradient classes for fallback (replaces inline style when provided) */
  fallbackClassName?: string;
  /** Accessibility: set true during banner generation */
  'aria-busy'?: boolean;
  children?: ReactNode;
}

/**
 * Displays a banner image with gradient fallback.
 * Extracted from EventDetail — shared across events, stories, profiles.
 */
export function BannerDisplay({
  bannerUrl,
  fallbackColor = '#bfdbfe', // blue-100
  altText,
  className,
  heightClassName,
  fallbackClassName,
  'aria-busy': ariaBusy,
  children,
}: BannerDisplayProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!bannerUrl && !imgError;
  const heightClass = heightClassName ?? 'h-48 md:h-64';

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden ${className ?? ''}`}
      aria-busy={ariaBusy}
      aria-live="polite"
    >
      {showImage ? (
        <img
          src={bannerUrl}
          alt={altText}
          className="w-full h-full object-cover rounded-t-xl"
          onError={() => setImgError(true)}
        />
      ) : fallbackClassName ? (
        <div
          className={`w-full h-full rounded-t-xl ${fallbackClassName}`}
          role="img"
          aria-label="Decorative profile banner"
        />
      ) : (
        <div
          className="w-full h-full rounded-t-xl"
          role="img"
          aria-label="Decorative banner"
          style={{
            background: `radial-gradient(at 0% 0%, ${fallbackColor}50 0%, transparent 50%), radial-gradient(at 100% 100%, ${fallbackColor}30 0%, transparent 50%), linear-gradient(135deg, ${fallbackColor}15 0%, ${fallbackColor}08 100%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}
