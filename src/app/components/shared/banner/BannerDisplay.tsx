import { useState, type ReactNode } from 'react';

interface BannerDisplayProps {
  bannerUrl?: string | null;
  fallbackColor?: string;
  altText: string;
  className?: string;
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
  children,
}: BannerDisplayProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!bannerUrl && !imgError;

  return (
    <div className={`w-full h-48 md:h-64 relative overflow-hidden ${className ?? ''}`}>
      {showImage ? (
        <img
          src={bannerUrl}
          alt={altText}
          className="w-full h-full object-cover rounded-t-xl"
          onError={() => setImgError(true)}
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
