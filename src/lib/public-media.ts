/**
 * @file public-media.ts
 * @description P1385 — the one place a public media URL (video, poster, caption, curated image)
 * is built. Public media lives in gs://claritypledge-story-images on Google Cloud Storage.
 *
 * Why not Supabase Storage: production's CSP (vercel.json) allows `media-src` from
 * storage.googleapis.com only, and the dev server sends no CSP — so media on any other host
 * passes every local run and is blocked on the live site. Seven prod-only CSP blocks so far
 * (P805 … P1336). src/tests/p1385-public-media.test.ts pins the origin against vercel.json and
 * fails on a GCS or Supabase-Storage URL hand-built anywhere else in src/.
 */

export const PUBLIC_MEDIA_ORIGIN = 'https://storage.googleapis.com';
export const PUBLIC_MEDIA_BUCKET = 'claritypledge-story-images';

/** Public object URL for `path` inside the media bucket, e.g. `founder/clip-v1.mp4`. */
export function publicMediaUrl(path: string): string {
  return `${PUBLIC_MEDIA_ORIGIN}/${PUBLIC_MEDIA_BUCKET}/${path.replace(/^\/+/, '')}`;
}

/**
 * P1402 — a story video served from the media bucket (an mp4 we host) rather than YouTube. Only
 * this origin + bucket: any other mp4 host would be blocked by the production CSP.
 */
export function isPublicMediaVideo(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  // Same rule as the stories CHECK constraint (P1402 migration): path characters only, no ".."
  // (a browser resolves it, leaving the bucket) and no percent-encoding (which can spell one).
  if (!/^https:\/\/storage\.googleapis\.com\/claritypledge-story-images\/[A-Za-z0-9_./-]+\.mp4$/.test(url.trim())) return false;
  if (url.includes('..')) return false;
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.origin === PUBLIC_MEDIA_ORIGIN &&
      parsed.pathname.startsWith(`/${PUBLIC_MEDIA_BUCKET}/`) &&
      parsed.pathname.endsWith('.mp4')
    );
  } catch {
    return false;
  }
}

/** The poster stored next to a bucket mp4 (`name.mp4` → `name-poster.jpg`, the event-prep convention). */
export const publicMediaPosterFor = (videoUrl: string) => videoUrl.trim().replace(/\.mp4$/, '-poster.jpg');
