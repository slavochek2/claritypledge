import { useState, useEffect, type ReactNode } from 'react';
import { BannerImage, BANNER_WIDE_QUERY } from './BannerImage';
import { BannerCredit } from './BannerCredit';
import type { BannerCredit as Credit } from '@/lib/banner-credit';

// Mounting only the matching <img> means the browser fetches exactly one banner instead of both
// (P1354 code review finding #2). P1417: the md breakpoint plus a minimum height, the same rule
// BannerImage uses, so a phone turned sideways gets the phone banner too. The h-48 md:h-64 height
// class stays width-only, so a sideways phone gets the phone banner in the md-height slot.
const DESKTOP_QUERY = BANNER_WIDE_QUERY;
// P1417: bg-muted shows behind the image while it loads. BannerImage serves event banners' small
// copy on phones and only reports onFail once every source has failed.
const IMG_CLASS = 'w-full h-full object-cover rounded-t-xl bg-muted';
// P1483: founder-chosen agent treatment — strong navy (blue-900) in `color` blend mode.
const AGENT_TINT_STYLE = { backgroundColor: '#1e3a8a', mixBlendMode: 'color', opacity: 0.75 } as const;

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
  /** P1453: "after <artist>" credit for `bannerUrl`. Absent (events, stories) = unchanged. */
  credit?: Credit;
  /** P1483: agent profiles get a strong navy layer over the image. Absent = full color (people). */
  agentTint?: boolean;
  /**
   * P1483: hold the image (and its signature) invisible while the caller cannot yet say whether
   * it gets the agent treatment — so an agent's banner never flashes in color before going navy.
   */
  concealImage?: boolean;
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
  credit,
  agentTint,
  concealImage,
  children,
}: BannerDisplayProps) {
  const [imgError, setImgError] = useState(false);
  const [mobileImgError, setMobileImgError] = useState(false);
  // P1453: the URL of the credited image once it has loaded — the signature never sits on the
  // loading placeholder, where its ink was not chosen for.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
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

  // P1453: the credit belongs to `bannerUrl` only. Never on the gradient fallback, never while a
  // new banner is generating, and never over the hand-set phone variant (a different picture).
  const showsCreditedImage = hasMobileVariant ? isDesktop && !imgError : showImage;
  const showCredit = !!credit && credit.url === bannerUrl && loadedUrl === bannerUrl && showsCreditedImage && !ariaBusy && !concealImage;
  const onCreditedLoad = () => setLoadedUrl(bannerUrl ?? null);
  // P1483: the navy layer sits over whichever image is on screen — never over the gradient
  // fallback, and under the signature and the controls (both render after it).
  const showsAnyImage = hasMobileVariant ? (isDesktop ? !imgError : !mobileImgError) : showImage;
  const imgClass = concealImage ? `${IMG_CLASS} opacity-0` : IMG_CLASS;

  return (
    <div
      // P1483: `isolate` keeps the agent tint's blend inside the banner box.
      className={`w-full ${heightClass} relative isolate overflow-hidden ${className ?? ''}`}
      aria-busy={ariaBusy}
      aria-live="polite"
    >
      {hasMobileVariant ? (
        isDesktop ? (
          !imgError ? (
            <BannerImage
              src={bannerUrl}
              alt={altText}
              className={imgClass}
              sizes="100vw"
              loading="eager"
              fetchPriority="high"
              onFail={() => setImgError(true)}
              onLoad={onCreditedLoad}
            />
          ) : (
            renderFallback()
          )
        ) : !mobileImgError ? (
          <BannerImage
            src={mobileBannerUrl}
            alt={altText}
            className={imgClass}
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            onFail={() => setMobileImgError(true)}
          />
        ) : (
          renderFallback()
        )
      ) : showImage ? (
        <BannerImage
          src={bannerUrl}
          alt={altText}
          className={imgClass}
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          onFail={() => setImgError(true)}
          onLoad={onCreditedLoad}
        />
      ) : (
        renderFallback()
      )}
      {agentTint && showsAnyImage && !concealImage && (
        <div
          data-testid="banner-agent-tint"
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none rounded-t-xl"
          // `color` blend keeps the image's own luminance, so the stored signature ink stays valid.
          style={AGENT_TINT_STYLE}
        />
      )}
      {showCredit && <BannerCredit credit={credit} />}
      {children}
    </div>
  );
}
