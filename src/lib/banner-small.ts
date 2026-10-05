/**
 * P1417: event banners have a small copy (800px wide WebP) stored next to the original, so phones
 * on weak connections never download a multi-hundred-KB original into a ~340px slot. Supabase
 * on-the-fly image transforms are not enabled on this project (`render/image` → 403
 * FeatureNotEnabled), so the copy is made when the banner is uploaded
 * (`scripts/event-photo-prep.sh`) or by the backfill (`scripts/event-banner-small.ts`).
 *
 * The copy's URL is DERIVED from the original's, never stored: no column, no migration. A banner
 * whose copy was never made simply 404s on the small URL and the image falls back to the original
 * (`BannerImage`). Shared by the app and the scripts so both always agree on the path.
 */

export const BANNER_SMALL_WIDTH = 800;
export const BANNER_SMALL_SUFFIX = `.w${BANNER_SMALL_WIDTH}.webp`;

// <origin>/storage/v1/object/public/<bucket>/<object path>[?query]
const STORAGE_PUBLIC_RE = /^(https?:\/\/[^/]+\/storage\/v1\/object\/public\/)([^/?#]+)\/([^?#]+)(\?[^#]*)?$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

export interface BannerStorageObject {
  /** `<origin>/storage/v1/object/public/` */
  publicBase: string;
  bucket: string;
  /** Object path inside the bucket, of the ORIGINAL. */
  path: string;
  /** Object path of the small copy. */
  smallPath: string;
}

/**
 * Only event banners get a small copy: the `event-banners` bucket (minus the description images
 * under `descriptions/`) and the AI generator's `banners/event/` prefix. Story and profile
 * banners share `BannerDisplay` but are left alone. Returns null for anything else, including a
 * small copy itself.
 */
export function parseBannerStorageUrl(url: string | null | undefined): BannerStorageObject | null {
  if (!url) return null;
  const m = STORAGE_PUBLIC_RE.exec(url);
  if (!m) return null;
  const [, publicBase = '', bucket = '', path = ''] = m;
  const isEventBanner =
    (bucket === 'event-banners' && !path.startsWith('descriptions/')) ||
    (bucket === 'banners' && path.startsWith('event/'));
  if (!isEventBanner) return null;
  if (!IMAGE_EXT_RE.test(path) || path.endsWith(BANNER_SMALL_SUFFIX)) return null;
  // The backfill writes to smallPath with the service key: never let a crafted path step out.
  if (/(^|\/)\.\.(\/|$)|%2e|%2f|\/\//i.test(path)) return null;
  return { publicBase, bucket, path, smallPath: `${path}${BANNER_SMALL_SUFFIX}` };
}

/** The small copy's public URL for an event banner, or null when none is ever made. */
export function bannerSmallUrl(url: string | null | undefined): string | null {
  const obj = parseBannerStorageUrl(url);
  if (!obj) return null;
  const query = STORAGE_PUBLIC_RE.exec(url as string)?.[4] ?? '';
  return `${obj.publicBase}${obj.bucket}/${obj.smallPath}${query}`;
}
