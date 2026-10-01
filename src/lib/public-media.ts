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
