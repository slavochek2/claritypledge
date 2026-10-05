import { useEffect, useState, type SyntheticEvent } from 'react';
import { bannerSmallUrl, BANNER_SMALL_WIDTH } from '@/lib/banner-small';

/**
 * What counts as "not a phone" for banners — shared with BannerDisplay so both pick by one rule.
 * The md breakpoint plus a minimum height, so a phone turned sideways (844x390) still counts as a
 * phone: with srcset there it would pick the original. Tablets and desktops pass both.
 */
export const BANNER_WIDE_QUERY = '(min-width: 768px) and (min-height: 500px)';
const WIDE_QUERY = BANNER_WIDE_QUERY;
// The width srcset declares for the original. Real originals are 1600-2880px wide; any value above
// the small copy's width only tells the browser "this one is the sharper choice", and the box is
// sized by CSS, so the exact number never changes layout.
const ORIGINAL_NOMINAL_WIDTH = 1920;

type Stage = 'small' | 'original' | 'failed';

function useWideScreen(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

interface BannerImageProps {
  src: string;
  alt: string;
  className?: string;
  /** `sizes` for wide screens, where srcset lets the browser pick the sharp original. */
  sizes: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Every source failed and nothing is rendered — the caller keeps its placeholder/fallback. */
  onFail?: () => void;
}

/**
 * P1417: an event banner that never downloads a multi-hundred-KB original onto a phone.
 *
 * - Phones (below md) request only the small copy (`bannerSmallUrl`). No srcset there: a 3x phone
 *   with an honest `sizes` would pick the original, which is the bug.
 * - Wider screens get the small copy plus a srcset offering the original, so a large slot is sharp.
 * - The small copy is derived, never stored, so it may not exist: on error the original is tried,
 *   and if that fails too nothing renders (`onFail`) — never a broken-image icon.
 * - One <img> at a time, never <picture> (decisions.md 2026-09-22 [technical], P1354).
 *
 * Banners with no derivable copy (story/profile banners, other hosts) render the original as before.
 */
export function BannerImage({ src, alt, className, sizes, loading = 'lazy', fetchPriority, onFail }: BannerImageProps) {
  const small = bannerSmallUrl(src);
  const wide = useWideScreen();
  const initial: Stage = small ? 'small' : 'original';
  const [state, setState] = useState<{ src: string; stage: Stage }>({ src, stage: initial });
  // A new banner (regenerated, replaced) restarts the chain.
  if (state.src !== src) setState({ src, stage: initial });
  const stage = state.src === src ? state.stage : initial;

  if (stage === 'failed') return null;

  const fail = () => {
    setState({ src, stage: 'failed' });
    onFail?.();
  };
  const handleError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (stage !== 'small') return fail();
    // On a wide screen srcset may have chosen the original; if that is what failed, retrying it
    // alone would only fail again.
    // currentSrc is browser-normalised (percent-encoding), so compare normalised URLs.
    const failed = e.currentTarget.currentSrc;
    if (failed && failed !== new URL(small as string, window.location.href).href) return fail();
    setState({ src, stage: 'original' });
  };

  const common = { className, loading, decoding: 'async' as const, fetchPriority, onError: handleError };
  if (stage === 'small' && small) {
    return wide ? (
      <img
        key="small"
        src={small}
        srcSet={`${small} ${BANNER_SMALL_WIDTH}w, ${src} ${ORIGINAL_NOMINAL_WIDTH}w`}
        sizes={sizes}
        alt={alt}
        {...common}
      />
    ) : (
      <img key="small" src={small} alt={alt} {...common} />
    );
  }
  return <img key="original" src={src} alt={alt} {...common} />;
}
