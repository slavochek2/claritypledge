import { useState, useEffect, type ReactNode } from 'react';

// md breakpoint — same semantics as the h-48 md:h-64 height class below and
// chiang-mai-page.tsx's DESKTOP_QUERY: mounting only the matching <img> means the
// browser fetches exactly one banner instead of both (P1354 code review finding #2).
const DESKTOP_QUERY = '(min-width: 768px)';

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
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const showImage = !!bannerUrl && !imgError;
  const heightClass = heightClassName ?? 'h-48 md:h-64';

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
  // Presence-based (not showImage-based): a desktop image load FAILURE must not also hide
  // an otherwise-working mobile image (P1354 code review finding #1) — each viewport's
  // <img> owns its own error state below, independent of the other.
  const hasMobileVariant = !!bannerUrl && !!mobileBannerUrl;

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden ${className ?? ''}`}
      aria-busy={ariaBusy}
      aria-live="polite"
    >
      {hasMobileVariant ? (
        isDesktop ? (
          !imgError ? (
            <img
              src={bannerUrl}
              alt={altText}
              className="w-full h-full object-cover rounded-t-xl"
              onError={() => setImgError(true)}
            />
          ) : (
            renderFallback()
          )
        ) : !mobileImgError ? (
          <img
            src={mobileBannerUrl}
            alt={altText}
            className="w-full h-full object-cover rounded-t-xl"
            onError={() => setMobileImgError(true)}
          />
        ) : (
          renderFallback()
        )
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
