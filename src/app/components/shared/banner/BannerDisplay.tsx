import { useState, type ReactNode } from 'react';

interface BannerDisplayProps {
  bannerUrl?: string | null;
  /** Phone-optimised variant. Only takes effect when bannerUrl is also set (P1354). */
  mobileBannerUrl?: string | null;
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
  mobileBannerUrl,
  fallbackColor = '#bfdbfe', // blue-100
  altText,
  className,
  heightClassName,
  fallbackClassName,
  'aria-busy': ariaBusy,
  children,
}: BannerDisplayProps) {
  const [imgError, setImgError] = useState(false);
  const [mobileImgError, setMobileImgError] = useState(false);
  const showImage = !!bannerUrl && !imgError;
  const heightClass = heightClassName ?? 'h-48 md:h-64';

  const renderFallback = () => (
    fallbackClassName ? (
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
    )
  );

  // Phone-optimised variant only applies while the desktop banner is also present —
  // removing the desktop banner drops back to the single-image path below, so the phone
  // slot never shows stale art next to a gradient desktop slot (P1354 adversarial review).
  const showMobileVariant = showImage && !!mobileBannerUrl;

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden ${className ?? ''}`}
      aria-busy={ariaBusy}
      aria-live="polite"
    >
      {showMobileVariant ? (
        <>
          {/* Same md: token that drives the height class above — no separate breakpoint to drift out of sync */}
          {!mobileImgError ? (
            <img
              src={mobileBannerUrl}
              alt={altText}
              className="w-full h-full object-cover rounded-t-xl md:hidden"
              onError={() => setMobileImgError(true)}
            />
          ) : (
            <div className="w-full h-full md:hidden">{renderFallback()}</div>
          )}
          <img
            src={bannerUrl}
            alt={altText}
            className="w-full h-full object-cover rounded-t-xl hidden md:block"
            onError={() => setImgError(true)}
          />
        </>
      ) : showImage ? (
        <img
          src={bannerUrl}
          alt={altText}
          className="w-full h-full object-cover rounded-t-xl"
          onError={() => setImgError(true)}
        />
      ) : (
        renderFallback()
      )}
      {children}
    </div>
  );
}
